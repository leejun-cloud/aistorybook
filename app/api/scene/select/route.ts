import { NextRequest, NextResponse } from 'next/server';
import { saveProject } from '../../../../lib/store';
import { loadOwnedProject } from '../../../../lib/auth/require';
import {
  recommendLayoutTemplate,
  selectSceneImage,
  type ProjectWithSceneJobs,
} from '../../../../lib/ai/scene';
import { RENDER_TEMPLATES } from '../../../../lib/render/templates';

export const maxDuration = 120;

// POST /api/scene/select
// body: { projectId, sceneNumber, candidateId, templateId?, autoTemplate? }
// → 후보 1장을 확정. templateId를 주면 그대로, autoTemplate이면 Gemini 추천
//   (같은 템플릿 3연속 방지는 코드 규칙).
export async function POST(req: NextRequest) {
  const { projectId, sceneNumber, candidateId, templateId, autoTemplate, imageQuality } = await req
    .json()
    .catch(() => ({}));
  if (!projectId || typeof sceneNumber !== 'number' || !candidateId) {
    return NextResponse.json({ error: 'projectId, sceneNumber, candidateId가 필요합니다' }, { status: 400 });
  }
  const owned = await loadOwnedProject(projectId);
  if ('error' in owned) return owned.error;
  const project = owned.project as ProjectWithSceneJobs;
  const scene = project.story.scenes.find((s) => s.sceneNumber === sceneNumber);
  if (!scene) return NextResponse.json({ error: `장면 ${sceneNumber} 없음` }, { status: 404 });

  const selected = selectSceneImage(project, scene, candidateId);
  if (!selected.ok) return NextResponse.json({ error: selected.error }, { status: 404 });

  const page = project.layout.pages.find((p) => p.sceneNumber === sceneNumber)!;
  if (imageQuality === 'draft' || imageQuality === 'final') {
    const slot = page.slots.find((s) => s.slotId === 'image-1');
    if (slot) slot.imageQuality = imageQuality;
  }
  let recommendation = null;
  if (templateId) {
    page.templateId = templateId;
  } else if (autoTemplate) {
    const recent = project.layout.pages
      .filter((p) => p.sceneNumber < sceneNumber)
      .sort((a, b) => a.sceneNumber - b.sceneNumber)
      .map((p) => p.templateId);
    recommendation = await recommendLayoutTemplate(scene, RENDER_TEMPLATES, recent);
    page.templateId = recommendation.templateId;
  }

  await saveProject(project);
  return NextResponse.json({
    sceneNumber,
    imageUrl: selected.imageUrl,
    templateId: page.templateId,
    recommendation,
  });
}
