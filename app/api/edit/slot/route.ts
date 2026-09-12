import { NextRequest, NextResponse } from 'next/server';
import { saveProject } from '../../../../lib/store';
import { loadOwnedProject } from '../../../../lib/auth/require';
import type { PageLayout } from '../../../../lib/types';

// 슬롯 편집 API (PRD §4.1 — 정해진 슬롯 안에서만 조정).
//
// POST /api/edit/slot
// body: {
//   projectId, sceneNumber,
//   transform?: { scale, offsetX, offsetY },   // 그림 슬롯 확대·이동 (자동 제한 클램프)
//   templateId?: string,                        // 템플릿 교체
//   slot?: { slotId, text?, fontSizePx?, lineHeight?, color?, imageUrl? }  // 글 슬롯 스타일·문장
// }
//
// 자동 제한 (§4.1): scale 1~2.5, offset ±0.4 — 슬롯 밖으로 그림이 빠져나가 여백이
// 드러나는 배치를 서버에서 차단한다. 글 크기 9~40px, 행간 1.2~3.

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { projectId, sceneNumber, transform, templateId, slot } = body;
  if (!projectId || typeof sceneNumber !== 'number') {
    return NextResponse.json({ error: 'projectId, sceneNumber가 필요합니다' }, { status: 400 });
  }
  const owned = await loadOwnedProject(projectId);
  if ('error' in owned) return owned.error;
  const project = owned.project;

  const page = project.layout.pages.find((p) => p.sceneNumber === sceneNumber);
  if (!page) return NextResponse.json({ error: `페이지 ${sceneNumber} 없음` }, { status: 404 });

  const warnings: string[] = [];

  if (templateId !== undefined) {
    if (!project.layout.templates.some((t) => t.id === templateId)) {
      return NextResponse.json({ error: `템플릿 없음: ${templateId}` }, { status: 400 });
    }
    page.templateId = templateId;
  }

  if (transform !== undefined) {
    if (transform === null) {
      delete page.transform;
    } else {
      const t: NonNullable<PageLayout['transform']> = {
        scale: clamp(Number(transform.scale) || 1, 1, 2.5),
        offsetX: clamp(Number(transform.offsetX) || 0, -0.4, 0.4),
        offsetY: clamp(Number(transform.offsetY) || 0, -0.4, 0.4),
      };
      if (t.scale !== transform.scale || t.offsetX !== transform.offsetX || t.offsetY !== transform.offsetY) {
        warnings.push('transform이 허용 범위(scale 1~2.5, offset ±0.4)로 클램프되었습니다');
      }
      page.transform = t;
    }
  }

  if (slot !== undefined) {
    if (!slot?.slotId) return NextResponse.json({ error: 'slot.slotId가 필요합니다' }, { status: 400 });
    let target = page.slots.find((s) => s.slotId === slot.slotId);
    if (!target) {
      target = { slotId: slot.slotId };
      page.slots.push(target);
    }
    if (typeof slot.text === 'string') {
      target.text = slot.text;
      // 원문 보존 원칙: 사용자가 직접 고친 문장은 textSource='user'로 승격
      const scene = project.story.scenes.find((s) => s.sceneNumber === sceneNumber);
      if (scene && scene.text !== slot.text) {
        scene.text = slot.text;
        scene.textSource = 'user';
      }
    }
    if (slot.fontSizePx !== undefined) {
      target.fontSizePx = slot.fontSizePx === null ? undefined : clamp(Number(slot.fontSizePx) || 18, 9, 40);
    }
    if (slot.lineHeight !== undefined) {
      target.lineHeight = slot.lineHeight === null ? undefined : clamp(Number(slot.lineHeight) || 1.85, 1.2, 3);
    }
    if (slot.color !== undefined) {
      target.color = typeof slot.color === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(slot.color) ? slot.color : undefined;
    }
    if (slot.textBox !== undefined) {
      target.textBox = slot.textBox === 'none' ? 'none' : slot.textBox === 'box' ? 'box' : undefined;
    }
    if (typeof slot.imageUrl === 'string') target.imageUrl = slot.imageUrl; // 후보 교체
  }

  await saveProject(project);
  return NextResponse.json({ page, warnings });
}
