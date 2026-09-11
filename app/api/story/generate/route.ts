import { NextRequest, NextResponse } from 'next/server';
import { loadProject, saveProject } from '../../../../lib/store';
import { generateStoryDraft, loadPatternLibrary, selectPatterns } from '../../../../lib/ai/story';
import { seedCastCharacters, rebuildLayoutPages } from '../../../../lib/story-apply';

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
  const project = await loadProject(projectId);
  if (!project) return NextResponse.json({ error: 'project 없음' }, { status: 404 });

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
