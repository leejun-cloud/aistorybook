import { NextRequest, NextResponse } from 'next/server';
import { loadProject, saveProject } from '../../../../lib/store';
import { generateStoryDraft, loadPatternLibrary, selectPatterns } from '../../../../lib/ai/story';

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
  const project = loadProject(projectId);
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

    const scenes = await generateStoryDraft({
      idea,
      targetAge,
      sceneCount,
      desiredMood: desiredMood ?? '',
      patterns,
    });

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
    // 조판 페이지를 새 장면에 맞춰 재구축 — 시드/이전 스토리의 페이지·이미지는
    // 새 장면과 무관하므로 남기지 않는다 (사전검사의 페이지 대응 기준).
    project.layout.pages = scenes.map((s, i) => ({
      sceneNumber: s.sceneNumber,
      templateId: project.layout.templates[i % project.layout.templates.length]?.id ?? 'L01',
      slots: [
        { slotId: 'image-1', imageStatus: 'idle' as const, candidates: [] },
        {
          slotId: 'text-1',
          text: s.text,
          // 스타일 프리셋/레퍼런스가 정한 글 상자 기본값 반영 ('none' = 상자 없이 글로우)
          ...(project.layout.textBoxDefault === 'none' ? { textBox: 'none' as const } : {}),
        },
      ],
    }));
    project.layout.approved = false;
    saveProject(project);
    return NextResponse.json({ story: project.story });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
