// 사전검사 자동 수정 — 진단만 하고 끝나던 검수를 "고칠 수 있는 건 고쳐주는" 단계로.
//
// 자동 수정 대상 (사람 판단이 필요 없는 기계적 결함만):
//   1. 글 넘침    — 해당 글 슬롯의 글자 크기를 실측하며 한 단계씩 줄여 슬롯 안에 넣는다.
//                   MIN_FONT_PX 아래로는 가독성이 무너지므로 줄이지 않고 남겨 둔다.
//   2. 저해상도   — 인쇄 변형본(@print)을 생성/갱신한다 (lib/render/upscale.ts).
//
// 자동 수정하지 않는 것: 페이지 누락·순서(내용 판단 필요), 안전영역 침범(레이아웃
// 템플릿 자체 문제 — 사용자가 템플릿을 바꿔야 한다), 폰트 임베드(설치 문제).

import type { Project } from '../types';
import { slotRectMm, TEXT_PAD_MM } from '../render/book';
import { getTemplate } from '../render/templates';
import { measureTypstHeightsMm } from '../render/typst';
import { ensurePrintAssets } from '../render/upscale';

/** 이보다 작아지면 그림책 본문으로 못 읽는다 — 여기서 멈추고 사람에게 넘긴다 */
const MIN_FONT_PX = 11;
/** 한 번에 줄이는 비율 */
const SHRINK_STEP = 0.92;
/** 재실측 반복 상한 */
const MAX_ROUNDS = 6;
const DEFAULT_FONT_PX = 18;
const DEFAULT_LINE_HEIGHT = 1.85;

export interface AutofixChange {
  kind: 'text-shrink' | 'upscale';
  /** 사용자에게 보여줄 한 줄 설명 */
  message: string;
}

export interface AutofixResult {
  changes: AutofixChange[];
  /** 자동으로는 못 고쳐 남은 것들 */
  remaining: string[];
  /** project가 실제로 바뀌었는지 — 호출부가 저장 여부를 판단 */
  projectChanged: boolean;
}

interface TextTarget {
  pageIndex: number;
  slotId: string;
  sceneNumber: number;
  text: string;
  widthMm: number;
  heightMm: number;
  lineHeight: number;
}

/** 조판된 모든 글 슬롯을 실측 대상으로 모은다 */
function collectTextTargets(project: Project): TextTarget[] {
  const sceneByNumber = new Map(project.story.scenes.map((s) => [s.sceneNumber, s]));
  const targets: TextTarget[] = [];

  project.layout.pages.forEach((page, pageIndex) => {
    const template = getTemplate(page.templateId);
    for (const slot of template.slots) {
      if (slot.type !== 'text') continue;
      const data = page.slots.find((s) => s.slotId === slot.id);
      const text = data?.text ?? sceneByNumber.get(page.sceneNumber)?.text ?? '';
      if (!text.trim()) continue;
      const rect = slotRectMm(slot);
      targets.push({
        pageIndex,
        slotId: slot.id,
        sceneNumber: page.sceneNumber,
        text,
        widthMm: rect.w - 2 * TEXT_PAD_MM.x,
        heightMm: rect.h - 2 * TEXT_PAD_MM.y,
        lineHeight: data?.lineHeight ?? DEFAULT_LINE_HEIGHT,
      });
    }
  });
  return targets;
}

/** 슬롯의 현재 글자 크기(px) — 저장된 값이 없으면 렌더 기본값 */
function currentFontPx(project: Project, t: TextTarget): number {
  const page = project.layout.pages[t.pageIndex];
  return page.slots.find((s) => s.slotId === t.slotId)?.fontSizePx ?? DEFAULT_FONT_PX;
}

/** 슬롯의 글자 크기를 project에 기록 (슬롯 데이터가 없으면 만들어 넣는다) */
function setFontPx(project: Project, t: TextTarget, px: number): void {
  const page = project.layout.pages[t.pageIndex];
  const existing = page.slots.find((s) => s.slotId === t.slotId);
  if (existing) {
    existing.fontSizePx = px;
  } else {
    page.slots.push({ slotId: t.slotId, text: t.text, fontSizePx: px });
  }
}

/**
 * 글 넘침을 글자 크기 축소로 해소한다. Typst 실측 → 넘치는 것만 한 단계 축소 →
 * 재실측을 반복한다 (한 번에 계산으로 맞추지 않는 이유: 줄바꿈이 바뀌면 높이가
 * 비선형으로 변해, 계산값이 오히려 과하게 줄이거나 여전히 넘칠 수 있다).
 */
async function fixTextOverflow(project: Project): Promise<{ changes: AutofixChange[]; remaining: string[] }> {
  const targets = collectTextTargets(project);
  if (targets.length === 0) return { changes: [], remaining: [] };

  const startPx = new Map(targets.map((t) => [`${t.pageIndex}:${t.slotId}`, currentFontPx(project, t)]));
  let active = targets;
  /** 하한(MIN_FONT_PX)까지 줄였는데도 넘치는 것 — 사람이 고쳐야 한다 */
  const floored: TextTarget[] = [];

  for (let round = 0; round < MAX_ROUNDS && active.length > 0; round++) {
    const heights = await measureTypstHeightsMm(
      active.map((t) => ({
        text: t.text,
        widthMm: t.widthMm,
        heightMm: t.heightMm,
        fontSizePt: currentFontPx(project, t) * 0.75,
        leading: t.lineHeight - 1,
      })),
    );

    const stillOver: TextTarget[] = [];
    active.forEach((t, i) => {
      if (heights[i] - t.heightMm <= 0.5) return; // 들어감
      const next = Math.max(MIN_FONT_PX, Math.round(currentFontPx(project, t) * SHRINK_STEP));
      if (next >= currentFontPx(project, t)) {
        floored.push(t); // 하한 도달 — 더 줄이지 않고 사람에게 넘긴다
        return;
      }
      setFontPx(project, t, next);
      stillOver.push(t);
    });
    active = stillOver;
  }

  const changes: AutofixChange[] = [];
  const remaining: string[] = [];
  for (const t of targets) {
    const key = `${t.pageIndex}:${t.slotId}`;
    const before = startPx.get(key)!;
    const after = currentFontPx(project, t);
    if (after < before) {
      changes.push({
        kind: 'text-shrink',
        message: `장면 ${t.sceneNumber} 글자 크기 ${before}px → ${after}px`,
      });
    }
  }
  // 하한에 걸렸거나, 반복 상한까지 줄여도 여전히 넘치는 것
  for (const t of [...floored, ...active]) {
    remaining.push(`장면 ${t.sceneNumber} — ${MIN_FONT_PX}px까지 줄여도 넘칩니다. 글을 줄이거나 레이아웃을 바꿔주세요.`);
  }

  return { changes, remaining };
}

/**
 * 자동 수정 실행. project를 제자리에서 수정하므로, 호출부는 projectChanged가
 * true일 때 saveProject로 저장해야 한다.
 */
export async function runAutofix(project: Project): Promise<AutofixResult> {
  const changes: AutofixChange[] = [];
  const remaining: string[] = [];

  const text = await fixTextOverflow(project);
  changes.push(...text.changes);
  remaining.push(...text.remaining);

  const reports = await ensurePrintAssets(project);
  const upscaled = reports.filter((r) => r.action === 'upscaled');
  for (const r of upscaled) {
    changes.push({ kind: 'upscale', message: `${r.name} 인쇄 해상도 보정 — ${r.detail}` });
  }

  return { changes, remaining, projectChanged: text.changes.length > 0 };
}
