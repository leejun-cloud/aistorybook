import { NextRequest, NextResponse } from 'next/server';
import { loadProject, saveProject } from '../../../../lib/store';
import { generateSceneDraft, type ProjectWithSceneJobs } from '../../../../lib/ai/scene';

export const maxDuration = 120;

// POST /api/scene/draft
// body: { projectId, sceneNumber }
// → 후보 비교·DNA 검증 없이 이미지 1장만 빠르게 생성해 즉시 확정한다 (미리보기용).
//   마음에 들면 그대로 쓰고, 아니면 /api/scene/generate로 개별/일괄 고화질화한다.
export async function POST(req: NextRequest) {
  const { projectId, sceneNumber } = await req.json().catch(() => ({}));
  if (!projectId || typeof sceneNumber !== 'number') {
    return NextResponse.json({ error: 'projectId, sceneNumber가 필요합니다' }, { status: 400 });
  }
  const project = (await loadProject(projectId)) as ProjectWithSceneJobs | null;
  if (!project) return NextResponse.json({ error: 'project 없음' }, { status: 404 });

  const scene = project.story.scenes.find((s) => s.sceneNumber === sceneNumber);
  if (!scene) return NextResponse.json({ error: `장면 ${sceneNumber} 없음` }, { status: 404 });

  const result = await generateSceneDraft(project, scene);
  await saveProject(project);

  if (!result.ok) {
    return NextResponse.json({ error: '초안 생성 실패', sceneNumber, detail: result.error }, { status: 502 });
  }

  return NextResponse.json({ sceneNumber, imageUrl: result.imageUrl });
}
