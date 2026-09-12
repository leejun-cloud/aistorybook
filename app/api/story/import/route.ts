import { NextRequest, NextResponse } from 'next/server';
import { saveProject } from '../../../../lib/store';
import { loadOwnedProject } from '../../../../lib/auth/require';
import { importStoryText, runQualityGate } from '../../../../lib/ai/story';
import { seedCastCharacters, rebuildLayoutPages } from '../../../../lib/story-apply';

export const maxDuration = 120;

// POST /api/story/import
// body: { projectId, text, sceneCount(4~40 정수), targetAge? }
// "내가 쓴 글 그대로" 진입점 — AI는 문장을 재작성하지 않고 원문을 정확히
// sceneCount개로 나누기만 한다 (문자 인덱스 기반, textSource: 'user'로 즉시 잠금).
// 품질 게이트는 참고용으로 실행하되(§ 결과는 저장) 승인을 막지 않는다 — 라우트가
// approved를 세팅하지 않으므로 게이트 결과와 무관하게 UI에서 바로 승인할 수 있다.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const { projectId, text, sceneCount, targetAge } = body ?? {};
  if (!projectId || typeof text !== 'string' || !text.trim() || !Number.isInteger(sceneCount) || sceneCount < 4 || sceneCount > 40) {
    return NextResponse.json(
      { error: 'projectId, text, sceneCount(4~40 정수) 필수' },
      { status: 400 },
    );
  }
  const owned = await loadOwnedProject(projectId);
  if ('error' in owned) return owned.error;
  const project = owned.project;

  try {
    const { scenes, cast } = await importStoryText(text, sceneCount);
    seedCastCharacters(project, cast);

    // 참고용 게이트 — 결과는 보여주되(리듬 등 피드백) 원문을 고치거나 승인을 막지 않는다.
    // runQualityGate는 textSource:'user' 장면을 절대 덮어쓰지 않으므로 원문이 보존된다.
    let qualityGate: { passed: boolean; checkedAt: string; items: { label: string; passed: boolean; note?: string }[] } | undefined;
    try {
      const gate = await runQualityGate(scenes);
      qualityGate = { passed: gate.passed, checkedAt: new Date().toISOString(), items: gate.items };
    } catch {
      qualityGate = undefined; // 게이트 실패해도 가져오기 자체는 성공으로 취급
    }

    project.story = {
      ...project.story,
      idea: text.trim().slice(0, 120),
      targetAge: typeof targetAge === 'string' && targetAge ? targetAge : project.story.targetAge || '5~7세',
      sceneCount,
      desiredMood: project.story.desiredMood,
      selectedPatternIds: [],
      scenes,
      qualityGate,
      approved: false,
    };
    rebuildLayoutPages(project, scenes);
    await saveProject(project);
    return NextResponse.json({ story: project.story });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
