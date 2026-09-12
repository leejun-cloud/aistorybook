import { NextRequest, NextResponse } from 'next/server';
import { saveProject } from '../../../../lib/store';
import { loadOwnedProject } from '../../../../lib/auth/require';
import { generateStoryDraft, loadPatternLibrary, selectPatterns } from '../../../../lib/ai/story';
import { seedCastCharacters, rebuildLayoutPages } from '../../../../lib/story-apply';

// best-of-N(기본 2) + 초안별 self-repair 최대 3회라 3~4분까지 걸릴 수 있다 —
// 이게 없으면 Vercel 서버리스 함수가 기본 제한 시간에 중간에 끊긴다.
export const maxDuration = 300;

// POST /api/story/generate
// body: { projectId, idea, targetAge, sceneCount(4~40 정수), desiredMood, patternIds? }
// patternIds가 없으면 AI가 어울리는 패턴 1~2개를 자동 선택한다 (PRD §1.2).
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const { projectId, idea, targetAge, sceneCount, desiredMood, patternIds } = body ?? {};
  if (!projectId || !idea || !targetAge || !Number.isInteger(sceneCount) || sceneCount < 4 || sceneCount > 40) {
    return NextResponse.json(
      { error: 'projectId, idea, targetAge, sceneCount(4~40 정수) 필수' },
      { status: 400 },
    );
  }
  const owned = await loadOwnedProject(projectId);
  if ('error' in owned) return owned.error;
  const project = owned.project;

  try {
    const library = loadPatternLibrary();
    const ids: string[] =
      Array.isArray(patternIds) && patternIds.length > 0
        ? patternIds
        : await selectPatterns(idea, targetAge);
    const patterns = library.filter((p) => ids.includes(p.id));
    if (patterns.length === 0) {
      return NextResponse.json({ error: `알 수 없는 patternIds: ${ids.join(',')}` }, { status: 400 });
    }

    const { scenes, cast } = await generateStoryDraft({
      idea,
      targetAge,
      sceneCount,
      desiredMood: desiredMood ?? '',
      patterns,
    });

    seedCastCharacters(project, cast);

    project.story = {
      ...project.story,
      idea,
      targetAge,
      sceneCount,
      desiredMood: desiredMood ?? '',
      selectedPatternIds: patterns.map((p) => p.id),
      scenes,
      qualityGate: undefined,
      approved: false,
    };
    rebuildLayoutPages(project, scenes);
    await saveProject(project);
    return NextResponse.json({ story: project.story });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
