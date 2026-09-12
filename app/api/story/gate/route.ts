import { NextRequest, NextResponse } from 'next/server';
import { saveProject } from '../../../../lib/store';
import { loadOwnedProject } from '../../../../lib/auth/require';
import { runQualityGate } from '../../../../lib/ai/story';

// 채점 + self-repair 최대 2회(각 라운드가 채점 재호출 포함)라 오래 걸릴 수 있다.
export const maxDuration = 300;

// POST /api/story/gate
// body: { projectId }
// 프로젝트의 현재 장면을 통과 기준 5종으로 채점 → 미달 시 AI self-repair 1회 →
// 결과(항목별 pass/fail)와 수정된 장면을 저장·반환한다 (PRD §1.2).
export async function POST(req: NextRequest) {
  const { projectId } = (await req.json().catch(() => ({}))) as { projectId?: string };
  if (!projectId) return NextResponse.json({ error: 'projectId 필수' }, { status: 400 });

  const owned = await loadOwnedProject(projectId);
  if ('error' in owned) return owned.error;
  const project = owned.project;
  if (project.story.scenes.length === 0) {
    return NextResponse.json({ error: '장면이 없습니다. 먼저 초안을 생성하세요.' }, { status: 400 });
  }

  try {
    const result = await runQualityGate(project.story.scenes);
    project.story.scenes = result.revisedScenes;
    project.story.qualityGate = {
      passed: result.passed,
      checkedAt: new Date().toISOString(),
      items: result.items,
    };
    await saveProject(project);
    return NextResponse.json({ story: project.story });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
