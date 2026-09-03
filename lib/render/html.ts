// 페이지 JSON(PageLayout) → 조판 HTML 렌더러.
//
// bookforge HTML 트랙(styles/magazine/theme.html + theme.css + build_html.py) 패턴 이식:
//   - @page 규칙으로 판형 고정, preferCSSPageSize 인쇄 (print_pdf.mjs 계승 — lib/render/pdf.ts)
//   - 풀블리드 섹션: 페이지 크기와 같은 section + break-after: page
//   - 재단선(bleed)·안전영역: 인쇄본은 트림 210×210 + 재단여분 3mm + 슬러그 5mm = 226×226 페이지,
//     가장자리에 닿는 그림 슬롯만 재단여분까지 확장하고 네 모서리에 재단선을 그린다
//   - 로컬 @font-face (Pretendard Regular/Bold 2종만 — 용량 원칙)
//
// 판형: 정사각형 그림책 210×210mm (PRD §3.2), 열람용은 트림 크기 그대로.
// 템플릿 슬롯(0~1 분수)은 20×20 CSS Grid에 스냅해 배치한다.

import fs from 'fs';
import path from 'path';
import type { LayoutSlot, PageLayout, Project, Scene } from '../types';
import { getTemplate } from './templates';
import { readCharacterAsset } from '../ai/character';
import { assetNameFromUrl, printVariantName } from './upscale';

export type RenderMode = 'view' | 'print';

export interface RenderOptions {
  mode: RenderMode;
  /** 지정하면 해당 장면만 렌더 (통합 테스트·부분 미리보기용) */
  sceneNumbers?: number[];
  /** 표제지(제목) 페이지 포함 여부. 기본 true */
  titlePage?: boolean;
}

// ---- 판형 상수 (mm) --------------------------------------------------------
const TRIM = 210; // 재단 후 크기
const BLEED = 3; // 재단여분
const SLUG = 5; // 재단선이 놓이는 여백
const GRID = 20; // 슬롯 스냅 그리드

const FONTS_DIR = path.join(process.cwd(), 'lib', 'render', 'fonts');

function fontUri(file: string): string {
  return 'file://' + path.join(FONTS_DIR, file);
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * /api/character/asset?... URL을 data URI로 변환 (file:// HTML에서 자립 렌더).
 * 인쇄 모드에서는 업스케일 변형본(@print.png)이 있으면 그것을 우선 쓴다.
 */
function imageDataUri(projectId: string, url: string, mode: RenderMode): string | null {
  if (mode === 'print') {
    const name = assetNameFromUrl(url);
    const variant = name ? readCharacterAsset(projectId, printVariantName(name)) : null;
    if (variant) return `data:image/jpeg;base64,${variant.toString('base64')}`;
  }
  const buf = readCharacterAsset(projectId, url);
  if (!buf) return null;
  return `data:image/png;base64,${buf.toString('base64')}`;
}

function gridArea(slot: LayoutSlot): string {
  const c1 = Math.round(slot.x * GRID) + 1;
  const r1 = Math.round(slot.y * GRID) + 1;
  const c2 = Math.min(GRID + 1, c1 + Math.max(1, Math.round(slot.width * GRID)));
  const r2 = Math.min(GRID + 1, r1 + Math.max(1, Math.round(slot.height * GRID)));
  return `${r1} / ${c1} / ${r2} / ${c2}`;
}

/** 가장자리에 닿는 그림 슬롯을 재단여분까지 밀어내는 음수 마진 (print 전용). */
function bleedMargins(slot: LayoutSlot, mode: RenderMode): string {
  if (mode !== 'print') return '';
  const top = slot.y <= 0.001 ? `-${BLEED}mm` : '0';
  const right = slot.x + slot.width >= 0.999 ? `-${BLEED}mm` : '0';
  const bottom = slot.y + slot.height >= 0.999 ? `-${BLEED}mm` : '0';
  const left = slot.x <= 0.001 ? `-${BLEED}mm` : '0';
  if (top === '0' && right === '0' && bottom === '0' && left === '0') return '';
  return `margin:${top} ${right} ${bottom} ${left};`;
}

function rectsOverlap(a: LayoutSlot, b: LayoutSlot): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

// ---- 페이지 렌더 ------------------------------------------------------------

function renderPage(project: Project, page: PageLayout, scene: Scene | undefined, mode: RenderMode): string {
  const template = getTemplate(page.templateId);
  const imageSlots = template.slots.filter((s) => s.type === 'image');
  const parts: string[] = [];

  for (const slot of template.slots) {
    const data = page.slots.find((s) => s.slotId === slot.id);
    if (slot.type === 'image') {
      const uri = data?.imageUrl ? imageDataUri(project.id, data.imageUrl, mode) : null;
      const bg = uri ? `background-image:url('${uri}');` : '';
      const t = page.transform;
      const transform = t ? `background-size:${t.scale * 100}% auto;background-position:${50 + t.offsetX * 100}% ${50 + t.offsetY * 100}%;` : '';
      parts.push(
        `<div class="slot img${uri ? '' : ' img-missing'}" style="grid-area:${gridArea(slot)};${bleedMargins(slot, mode)}${bg}${transform}"></div>`,
      );
    } else {
      const text = data?.text ?? scene?.text ?? '';
      const overlay = imageSlots.some((img) => rectsOverlap(slot, img));
      // 글 상자: 슬롯 textBox > 프로젝트 기본값 > 'box'. 'none'이면 상자 없이 글로우로 가독성 확보
      const boxless = (data?.textBox ?? project.layout.textBoxDefault ?? 'box') === 'none';
      const style: string[] = [`grid-area:${gridArea(slot)}`, `text-align:${slot.align ?? 'center'}`];
      if (data?.fontSizePx) style.push(`font-size:${data.fontSizePx}px`);
      if (data?.lineHeight) style.push(`line-height:${data.lineHeight}`);
      if (data?.color) style.push(`color:${data.color}`);
      const cls = `slot txt${overlay ? ' overlay' : ''}${overlay && boxless ? ' no-box' : ''}`;
      parts.push(`<div class="${cls}" style="${style.join(';')}"><p>${esc(text)}</p></div>`);
    }
  }

  return `<section class="sheet" data-scene="${page.sceneNumber}">
  <div class="trim">${parts.join('\n')}</div>
  ${mode === 'print' ? CROP_MARKS : ''}
</section>`;
}

function renderTitlePage(project: Project, mode: RenderMode): string {
  return `<section class="sheet title-sheet">
  <div class="trim title-trim"><div class="book-title">${esc(project.title)}</div></div>
  ${mode === 'print' ? CROP_MARKS : ''}
</section>`;
}

// 재단선: 트림 모서리 4곳 × (가로+세로) 8개. 슬러그 영역(0~5mm)에만 그린다.
const CROP_MARKS = (() => {
  const t = SLUG + BLEED; // 트림 시작 = 8mm
  const T = SLUG + BLEED + TRIM; // 트림 끝 = 218mm
  const L = 4; // 마크 길이 (재단여분에 닿지 않게 0.5~4.5mm)
  const mk = (style: string) => `<div class="crop" style="${style}"></div>`;
  return [
    // 가로 마크 (트림 y선 표시, 페이지 좌우 슬러그에)
    mk(`top:${t}mm;left:0.5mm;width:${L}mm;height:0;border-top:0.2mm solid #000`),
    mk(`top:${t}mm;right:0.5mm;width:${L}mm;height:0;border-top:0.2mm solid #000`),
    mk(`top:${T}mm;left:0.5mm;width:${L}mm;height:0;border-top:0.2mm solid #000`),
    mk(`top:${T}mm;right:0.5mm;width:${L}mm;height:0;border-top:0.2mm solid #000`),
    // 세로 마크 (트림 x선 표시, 페이지 상하 슬러그에)
    mk(`left:${t}mm;top:0.5mm;height:${L}mm;width:0;border-left:0.2mm solid #000`),
    mk(`left:${T}mm;top:0.5mm;height:${L}mm;width:0;border-left:0.2mm solid #000`),
    mk(`left:${t}mm;bottom:0.5mm;height:${L}mm;width:0;border-left:0.2mm solid #000`),
    mk(`left:${T}mm;bottom:0.5mm;height:${L}mm;width:0;border-left:0.2mm solid #000`),
  ].join('');
})();

// ---- 문서 전체 --------------------------------------------------------------

function css(mode: RenderMode): string {
  const pageSize = mode === 'print' ? TRIM + 2 * (BLEED + SLUG) : TRIM;
  const trimInset = mode === 'print' ? BLEED + SLUG : 0;
  return `
@font-face { font-family: "Pretendard"; src: url("${fontUri('Pretendard-Regular.ttf')}"); font-weight: 400; }
@font-face { font-family: "Pretendard"; src: url("${fontUri('Pretendard-Bold.ttf')}"); font-weight: 700; }

@page { size: ${pageSize}mm ${pageSize}mm; margin: 0; }
* { margin: 0; padding: 0; box-sizing: border-box; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { font-family: "Pretendard", sans-serif; color: #2b2620; background: #fff;
  word-break: keep-all; line-break: strict; text-wrap: pretty; }

.sheet { width: ${pageSize}mm; height: ${pageSize}mm; position: relative;
  overflow: hidden; break-after: page; background: #fff; }
.trim { position: absolute; top: ${trimInset}mm; left: ${trimInset}mm;
  width: ${TRIM}mm; height: ${TRIM}mm;
  display: grid; grid-template-columns: repeat(${GRID}, 1fr); grid-template-rows: repeat(${GRID}, 1fr); }

.slot.img { background-size: cover; background-position: center; background-repeat: no-repeat;
  background-color: #eee9e0; z-index: 1; }
.slot.img-missing { background-image:
  repeating-linear-gradient(45deg, #eee9e0 0 6mm, #e3dcd0 6mm 12mm); }

.slot.txt { z-index: 2; display: flex; flex-direction: column; justify-content: center;
  font-size: 13.5pt; line-height: 1.85; font-weight: 400; letter-spacing: 0.01em; }
.slot.txt p { width: 100%; }
/* 안전영역: 텍스트는 슬롯 안쪽으로 한 번 더 들여 재단·제본 위험을 피한다 */
.slot.txt { padding: 4mm 5mm; }
/* 그림 위 오버레이 텍스트: 반투명 종이 상자 */
.slot.txt.overlay { background: rgba(255, 253, 248, 0.86); border-radius: 3mm;
  align-self: center; box-shadow: 0 0 2mm rgba(60, 45, 20, 0.12); }
/* 상자 없는 오버레이 텍스트: 종이색 글로우로 가독성 확보 (랩 표지 제목과 같은 처리) */
.slot.txt.overlay.no-box { background: none; box-shadow: none;
  text-shadow: 0 0 1.2mm rgba(255, 253, 248, 0.95), 0 0 2.5mm rgba(255, 253, 248, 0.85),
    0 0 5mm rgba(255, 253, 248, 0.7); }

.title-trim { display: flex; align-items: center; justify-content: center; }
.book-title { font-size: 34pt; font-weight: 700; letter-spacing: -0.01em; text-align: center;
  padding: 0 20mm; }

.crop { position: absolute; z-index: 5; }
`;
}

export function renderBookHtml(project: Project, opts: RenderOptions): string {
  const { mode, sceneNumbers, titlePage = true } = opts;
  const pages = project.layout.pages
    .filter((p) => !sceneNumbers || sceneNumbers.includes(p.sceneNumber))
    .sort((a, b) => a.sceneNumber - b.sceneNumber);
  const sceneByNumber = new Map(project.story.scenes.map((s) => [s.sceneNumber, s]));

  const body = [
    ...(titlePage ? [renderTitlePage(project, mode)] : []),
    ...pages.map((p) => renderPage(project, p, sceneByNumber.get(p.sceneNumber), mode)),
  ].join('\n');

  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8">
<title>${esc(project.title)}</title>
<style>${css(mode)}</style>
</head>
<body>
${body}
</body>
</html>`;
}

/** HTML을 파일로 저장하고 경로를 반환한다. */
export function writeBookHtml(project: Project, opts: RenderOptions, outFile: string): string {
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, renderBookHtml(project, opts), 'utf-8');
  return outFile;
}
