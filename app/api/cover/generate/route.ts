import { NextRequest, NextResponse } from 'next/server';
import { loadProject, saveProject } from '../../../../lib/store';
import { generateCoverOptions, type CoverConcept } from '../../../../lib/cover/generate';
import { recommendCoverDesign } from '../../../../lib/cover/designs';

export const maxDuration = 300;

const CONCEPTS: CoverConcept[] = ['character', 'scene', 'symbol'];

// POST /api/cover/generate
// body: { projectId, concepts?: ('character'|'scene'|'symbol')[] }
// → 표지 3방향(또는 지정 방향) 이미지 생성, publish.coverOptions 갱신.
export async function POST(req: NextRequest) {
  const { projectId, concepts } = await req.json().catch(() => ({}));
  if (!projectId) return NextResponse.json({ error: 'projectId가 필요합니다' }, { status: 400 });
  const project = await loadProject(projectId);
  if (!project) return NextResponse.json({ error: 'project 없음' }, { status: 404 });

  const wanted: CoverConcept[] = Array.isArray(concepts)
    ? concepts.filter((c: string): c is CoverConcept => (CONCEPTS as string[]).includes(c))
    : CONCEPTS;
  if (wanted.length === 0) return NextResponse.json({ error: '유효한 concept이 없습니다' }, { status: 400 });

  const result = await generateCoverOptions(project, wanted);

  // 표지 디자인(비네트/배너/여백프레임 등)을 아직 안 골랐다면 스타일에 어울리는
  // 것을 자동 추천해 미리 채워둔다 — 사용자는 /cover에서 다른 디자인으로 바꿀 수 있다.
  if (!project.publish.coverLayout?.designId) {
    const recommended = recommendCoverDesign(project.character.style.source, project.character.style.libraryStyleId);
    project.publish.coverLayout = { ...(project.publish.coverLayout ?? {}), designId: recommended };
  }
  await saveProject(project);

  if (!result.ok) {
    return NextResponse.json({ error: '표지 생성 전량 실패', failures: result.failures }, { status: 502 });
  }
  return NextResponse.json({
    options: result.options,
    failures: result.failures,
    coverLayout: project.publish.coverLayout,
  });
}
