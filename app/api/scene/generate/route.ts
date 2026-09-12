import { NextRequest, NextResponse } from 'next/server';
import { saveProject } from '../../../../lib/store';
import { loadOwnedProject } from '../../../../lib/auth/require';
import {
  generateSceneCandidatesVerified,
  getSceneJobState,
  type ProjectWithSceneJobs,
} from '../../../../lib/ai/scene';

export const maxDuration = 300;

// POST /api/scene/generate
// body: { projectId, sceneNumber }
// → 해당 장면의 후보 2장 생성 + DNA 일관성 자동 교정 루프
//   (모든 후보가 기준 미달이면 위반 사유를 negative로 넣어 자동 재생성, 최대 2회 추가).
//   장면 단위 독립 실행 — 실패해도 이 장면 상태만 failed.
export async function POST(req: NextRequest) {
  const { projectId, sceneNumber } = await req.json().catch(() => ({}));
  if (!projectId || typeof sceneNumber !== 'number') {
    return NextResponse.json({ error: 'projectId, sceneNumber가 필요합니다' }, { status: 400 });
  }
  const owned1 = await loadOwnedProject(projectId);
  if ('error' in owned1) return owned1.error;
  const project = owned1.project as ProjectWithSceneJobs;

  const scene = project.story.scenes.find((s) => s.sceneNumber === sceneNumber);
  if (!scene) return NextResponse.json({ error: `장면 ${sceneNumber} 없음` }, { status: 404 });

  const result = await generateSceneCandidatesVerified(project, scene);
  await saveProject(project); // 실패해도 상태(failed, retryCount)를 남긴다

  if (!result.ok) {
    return NextResponse.json(
      { error: '장면 이미지 생성 실패', sceneNumber, jobState: result.jobState, failures: result.failures },
      { status: 502 },
    );
  }

  return NextResponse.json({
    sceneNumber,
    candidates: result.candidates,
    failures: result.failures,
    jobState: result.jobState,
    consistency: result.consistency,
    rounds: result.rounds,
    bestScore: result.bestScore,
  });
}

// GET /api/scene/generate?projectId=<id>&sceneNumber=<n> → 장면 잡 상태 폴링
export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get('projectId');
  const sceneNumber = Number(req.nextUrl.searchParams.get('sceneNumber'));
  if (!projectId || !Number.isFinite(sceneNumber)) {
    return NextResponse.json({ error: 'projectId, sceneNumber가 필요합니다' }, { status: 400 });
  }
  const owned2 = await loadOwnedProject(projectId);
  if ('error' in owned2) return owned2.error;
  const project = owned2.project as ProjectWithSceneJobs;
  const page = project.layout.pages.find((p) => p.sceneNumber === sceneNumber);
  return NextResponse.json({
    sceneNumber,
    jobState: getSceneJobState(project, sceneNumber),
    candidates: page?.slots.find((s) => s.slotId === 'image-1')?.candidates ?? [],
  });
}
