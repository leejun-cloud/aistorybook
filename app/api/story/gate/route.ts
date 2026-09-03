import { NextRequest, NextResponse } from 'next/server';
import { loadProject, saveProject } from '../../../../lib/store';
import { runQualityGate } from '../../../../lib/ai/story';

// POST /api/story/gate
// body: { projectId }
// 프로젝트의 현재 장면을 통과 기준 5종으로 채점 → 미달 시 AI self-repair 1회 →
// 결과(항목별 pass/fail)와 수정된 장면을 저장·반환한다 (PRD §1.2).
export async function POST(req: NextRequest) {
  const { projectId } = (await req.json().catch(() => ({}))) as { projectId?: string };
  if (!projectId) return NextResponse.json({ error: 'projectId 필수' }, { status: 400 });

  const project = await loadProject(projectId);
  if (!project) return NextResponse.json({ error: 'project 없음' }, { status: 404 });
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
