// 페이지 JSON(PageLayout) → 조판 Typst 렌더러 (html.ts/Playwright의 후신).
//
// 판형: 정사각형 그림책 210×210mm (PRD §3.2), 열람용은 트림 크기 그대로.
// 인쇄용은 트림 210×210 + 재단여분 3mm + 슬러그 5mm = 226×226mm, 네 모서리에 재단선.
// 템플릿 슬롯(0~1 분수)은 기존 20×20 그리드 스냅을 그대로 유지해 mm 좌표로 환산한다
// (템플릿 좌표가 이미 0.05 배수로 저작되어 있어 스냅은 안전장치).
//
// Typst는 text-shadow가 없어 "상자 없는 글로우"(overlay+no-box)는 여러 방향으로
// 살짝 어긋난 밝은 색 사본을 먼저 그리고 그 위에 실제 글자를 얹는 방식(포어맨즈 아웃라인)으로
// 대체한다 — CSS text-shadow와 시각적으로 동등한 가독성 효과를 낸다.

import type { LayoutSlot, PageLayout, Project, Scene } from '../types';
import { getTemplate } from './templates';
import { readCharacterAsset } from '../ai/character';
import { assetNameFromUrl, printVariantName } from './upscale';
import { compileTypstToPdf, typstText } from './typst';

export type RenderMode = 'view' | 'print';

export interface RenderOptions {
  mode: RenderMode;
  /** 지정하면 해당 장면만 렌더 (통합 테스트·부분 미리보기용) */
  sceneNumbers?: number[];
  /** 표제지(제목) 페이지 포함 여부. 기본 true */
  titlePage?: boolean;
}

// ---- 판형 상수 (mm) — preflight의 글 넘침 측정도 이 상수로 슬롯 기하를 재현한다 ------
export const TRIM_MM = 210; // 재단 후 크기
const TRIM = TRIM_MM;
const BLEED = 3; // 재단여분
const SLUG = 5; // 재단선이 놓이는 여백
const GRID = 20; // 슬롯 스냅 그리드
/** 텍스트 슬롯 안전영역 패딩(mm) — renderTextSlot과 preflight 측정이 공유 */
export const TEXT_PAD_MM = { x: 5, y: 4 };

const esc = typstText;

function snap(v: number): number {
  return Math.round(v * GRID) / GRID;
}

/** 슬롯 분수좌표(0~1, TRIM 기준) → mm 사각형. (preflight 글 넘침 측정도 재사용) */
export function slotRectMm(slot: LayoutSlot): { x: number; y: number; w: number; h: number } {
  const x = snap(slot.x) * TRIM;
  const y = snap(slot.y) * TRIM;
  const w = Math.min(TRIM - x, Math.max(1 / GRID, snap(slot.width)) * TRIM);
  const h = Math.min(TRIM - y, Math.max(1 / GRID, snap(slot.height)) * TRIM);
  return { x, y, w, h };
}

function rectsOverlap(a: LayoutSlot, b: LayoutSlot): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

/** 이미지 슬롯 하나 렌더 — 결과 마크업 + 사용한 이미지의 (가상경로→바이트) 등록. */
async function renderImageSlot(
  project: Project,
  slot: LayoutSlot,
  data: PageLayout['slots'][number] | undefined,
  transform: PageLayout['transform'],
  mode: RenderMode,
  images: Record<string, Buffer>,
  imgSeq: { n: number },
): Promise<string> {
  const rect = slotRectMm(slot);
  const bleedInsets = mode === 'print' ? bleedExpand(slot) : { top: 0, right: 0, bottom: 0, left: 0 };
  const x = rect.x - bleedInsets.left;
  const y = rect.y - bleedInsets.top;
  const w = rect.w + bleedInsets.left + bleedInsets.right;
  const h = rect.h + bleedInsets.top + bleedInsets.bottom;

  if (!data?.imageUrl) {
    // 배치 대기 슬롯 — 옅은 체크무늬로 표시
    return `#place(dx: ${x}mm, dy: ${y}mm, rect(width: ${w}mm, height: ${h}mm, fill: rgb("#eee9e0")))`;
  }

  let buf: Buffer | null = null;
  let ext = 'png';
  if (mode === 'print') {
    const name = assetNameFromUrl(data.imageUrl);
    buf = name ? await readCharacterAsset(project.id, printVariantName(name)) : null;
    if (buf) ext = 'jpg';
  }
  if (!buf) {
    buf = await readCharacterAsset(project.id, data.imageUrl);
    ext = buf && buf[0] === 0xff && buf[1] === 0xd8 ? 'jpg' : 'png';
  }
  if (!buf) return `#place(dx: ${x}mm, dy: ${y}mm, rect(width: ${w}mm, height: ${h}mm, fill: rgb("#eee9e0")))`;

  const name = `img${imgSeq.n++}.${ext}`;
  images[name] = buf;

  const scale = transform?.scale ?? 1;
  const offsetX = transform?.offsetX ?? 0;
  const offsetY = transform?.offsetY ?? 0;
  // CSS background-size(scale*100%) + background-position((50+offsetX*100)%)와 동일한 산수:
  // 확대된 이미지 폭에서 넘치는 만큼을 위치 비율(0.5+offset)만큼 왼쪽/위로 당긨다.
  const enlargedW = w * scale;
  const enlargedH = h * scale;
  const dx = -(enlargedW - w) * (0.5 + offsetX);
  const dy = -(enlargedH - h) * (0.5 + offsetY);

  return `#place(dx: ${x}mm, dy: ${y}mm, box(width: ${w}mm, height: ${h}mm, clip: true, fill: rgb("#eee9e0"))[
  #place(dx: ${dx}mm, dy: ${dy}mm, image("${name}", width: ${enlargedW}mm, height: ${enlargedH}mm, fit: "cover"))
])`;
}

/** 가장자리에 닿는 그림 슬롯을 재단여분까지 밀어내는 확장분 (print 전용). */
function bleedExpand(slot: LayoutSlot): { top: number; right: number; bottom: number; left: number } {
  return {
    top: slot.y <= 0.001 ? BLEED : 0,
    right: slot.x + slot.width >= 0.999 ? BLEED : 0,
    bottom: slot.y + slot.height >= 0.999 ? BLEED : 0,
    left: slot.x <= 0.001 ? BLEED : 0,
  };
}

/** 텍스트 슬롯 하나 렌더. overlay+no-box는 글로우(포어맨즈 아웃라인)로 가독성 확보. */
function renderTextSlot(
  slot: LayoutSlot,
  data: PageLayout['slots'][number] | undefined,
  text: string,
  overlay: boolean,
  boxless: boolean,
): string {
  const rect = slotRectMm(slot);
  const align = slot.align === 'left' ? 'left' : slot.align === 'right' ? 'right' : 'center';
  const fontSizePt = data?.fontSizePx ? data.fontSizePx * 0.75 : 13.5; // px→pt 근사 (13.5pt ≈ 18px)
  const lineHeight = data?.lineHeight ?? 1.85;
  const color = data?.color ?? '#2b2620';
  const padX = TEXT_PAD_MM.x;
  const padY = TEXT_PAD_MM.y;

  const innerW = rect.w - 2 * padX;
  const innerH = rect.h - 2 * padY;
  const anchor = `horizon + ${align}`;

  const textBody = (fill: string) => `#box(width: 100%)[
      #set par(leading: ${(lineHeight - 1).toFixed(2)}em)
      #set text(size: ${fontSizePt}pt, fill: ${fill})
      ${esc(text)}
    ]`;

  // 상자는 슬롯 전체 높이(rect.h)가 아니라 실제 글자 높이에 맞춰 그린다 — 글이 짧은데
  // 템플릿의 글 영역이 넓으면(예: 3줄 글에 높이 25% 슬롯) 빈 여백만 큰 상자로 남는 문제를
  // measure()로 실측해 방지한다 (사전검사 글 넘침 실측과 같은 기법).
  let background = '';
  if (overlay && !boxless) {
    background = `#context {
      let h = measure(par(leading: ${(lineHeight - 1).toFixed(2)}em)[#text(size: ${fontSizePt}pt)[${esc(text)}]], width: ${innerW}mm).height
      place(horizon, rect(width: 100%, height: calc.min(h + ${2 * padY}mm, ${rect.h}mm), fill: rgb(255,253,248,220), radius: 3mm))
    }\n    `;
  }

  // 글로우: 실제 글자 뒤에 종이색 사본을 살짝씩 어긋나게 여러 방향으로 깔아 아웃라인
  // 효과를 낸다 (Typst엔 text-shadow가 없다 — CSS 버전의 시각적 대체재). place()에
  // 정렬을 첫 인자로 주면 실제 텍스트(align(horizon+align))와 같은 기준점에서
  // dx/dy만큼 어긋나 그려진다 — 표지 렌더러(designs.ts)에서 검증한 것과 같은 패턴.
  const glowBody =
    overlay && boxless
      ? [-0.5, 0, 0.5]
          .flatMap((ox) => [-0.5, 0, 0.5].filter((oy) => !(ox === 0 && oy === 0)).map((oy) => [ox, oy] as const))
          .map(([ox, oy]) => `#place(${anchor}, dx: ${ox}mm, dy: ${oy}mm)[${textBody('rgb(255,253,248,235)')}]`)
          .join('\n    ')
      : '';

  return `#place(dx: ${rect.x}mm, dy: ${rect.y}mm)[
  #box(width: ${rect.w}mm, height: ${rect.h}mm)[
    ${background}#pad(x: ${padX}mm, y: ${padY}mm)[
      #box(width: ${innerW}mm, height: ${innerH}mm)[
        ${glowBody}
        #place(${anchor})[${textBody(`rgb("${color}")`)}]
      ]
    ]
  ]
]`;
}

async function renderPage(
  project: Project,
  page: PageLayout,
  scene: Scene | undefined,
  mode: RenderMode,
  images: Record<string, Buffer>,
  imgSeq: { n: number },
): Promise<string> {
  const template = getTemplate(page.templateId);
  const imageSlots = template.slots.filter((s) => s.type === 'image');
  const parts: string[] = [];

  for (const slot of template.slots) {
    const data = page.slots.find((s) => s.slotId === slot.id);
    if (slot.type === 'image') {
      parts.push(await renderImageSlot(project, slot, data, page.transform, mode, images, imgSeq));
    } else {
      const text = data?.text ?? scene?.text ?? '';
      const overlay = imageSlots.some((img) => rectsOverlap(slot, img));
      const boxless = (data?.textBox ?? project.layout.textBoxDefault ?? 'box') === 'none';
      parts.push(renderTextSlot(slot, data, text, overlay, boxless));
    }
  }

  return sheetWrap(parts.join('\n'), mode);
}

function renderTitlePage(project: Project, mode: RenderMode): string {
  const content = `#place(center + horizon)[
  #box(width: ${TRIM - 40}mm)[
    #align(center)[#text(size: 34pt, weight: 700, fill: rgb("#2b2620"))[${esc(project.title)}]]
  ]
]`;
  return sheetWrap(content, mode);
}

/** 트림 기준 콘텐츠를 페이지 크기(뷰/인쇄)로 감싸고, 인쇄본이면 재단선까지 그린다. */
function sheetWrap(trimContent: string, mode: RenderMode): string {
  if (mode === 'view') {
    return `#page(width: ${TRIM}mm, height: ${TRIM}mm, margin: 0mm, fill: white)[
${trimContent}
]`;
  }
  const inset = BLEED + SLUG;
  const pageSize = TRIM + 2 * inset;
  return `#page(width: ${pageSize}mm, height: ${pageSize}mm, margin: 0mm, fill: white)[
#place(dx: ${inset}mm, dy: ${inset}mm)[
${trimContent}
]
${cropMarks(inset)}
]`;
}

/** 재단선: 트림 모서리 4곳 × (가로+세로) 8개. 슬러그 영역에만 그린다. */
function cropMarks(inset: number): string {
  const T = inset + TRIM;
  const L = 4; // 마크 길이(mm)
  const mk = (x: number, y: number, horiz: boolean) =>
    `#place(dx: ${x}mm, dy: ${y}mm, line(length: ${L}mm, angle: ${horiz ? 0 : 90}deg, stroke: 0.2mm + black))`;
  return [
    mk(0.5, inset, true), mk(inset + TRIM - L - 0.5, inset, true),
    mk(0.5, T, true), mk(inset + TRIM - L - 0.5, T, true),
    mk(inset, 0.5, false), mk(inset, inset + TRIM - L - 0.5, false),
    mk(T, 0.5, false), mk(T, inset + TRIM - L - 0.5, false),
  ].join('\n');
}

/** 프로젝트 → Typst 소스 + 참조 이미지. compileTypstToPdf에 그대로 넘기면 된다. */
export async function renderBookTypst(
  project: Project,
  opts: RenderOptions,
): Promise<{ source: string; images: Record<string, Buffer> }> {
  const { mode, sceneNumbers, titlePage = true } = opts;
  const pages = project.layout.pages
    .filter((p) => !sceneNumbers || sceneNumbers.includes(p.sceneNumber))
    .sort((a, b) => a.sceneNumber - b.sceneNumber);
  const sceneByNumber = new Map(project.story.scenes.map((s) => [s.sceneNumber, s]));

  const images: Record<string, Buffer> = {};
  const imgSeq = { n: 0 };
  const renderedPages: string[] = [];
  if (titlePage) renderedPages.push(renderTitlePage(project, mode));
  for (const p of pages) {
    renderedPages.push(await renderPage(project, p, sceneByNumber.get(p.sceneNumber), mode, images, imgSeq));
  }

  const source = `#set text(font: "Pretendard")\n${renderedPages.join('\n')}`;
  return { source, images };
}

/** 프로젝트를 PDF 바이트로 직접 렌더한다 (중간 HTML 파일 없이). */
export async function renderBookPdf(project: Project, opts: RenderOptions): Promise<Buffer> {
  const { source, images } = await renderBookTypst(project, opts);
  return compileTypstToPdf({ source, images });
}
