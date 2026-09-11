// 표지 디자인 템플릿 — 조판 템플릿(L01~L10)과 같은 개념을 표지에 적용한 것.
//
// 기존 방식(HTML/CSS)은 실질적으로 "제목 상단 중앙 고정" 1종류뿐이었고 슬라이더로
// 미세조정만 가능했다. 실제로 다양한 그림책 표지가 보여주는 구도(비네트, 하단 띠,
// 여백 프레임, 하단 글로우, 장식 코너, 세로 리본)를 6종의 완성된 조합으로 큐레이션해
// 그중 하나를 기본 추천하고, 다른 걸 고를 수도 있게 한다.
//
// 각 디자인은 "앞표지 박스 안에서 상대 좌표(%)로 그리는 Typst 조각"만 책임진다 —
// 뒤표지·책등·판형 치수 같은 공통 골격은 wrap.ts가 만든다 (관심사 분리).

import { typstText } from '../render/typst';
import { COVER_DESIGN_META } from './design-meta';

export { recommendCoverDesign } from './design-meta';

export interface CoverDesignContext {
  title: string;
  author?: string;
  /** 앞표지 박스 크기 (mm) — 디자인이 상대 배치를 계산할 때 참고 */
  frontWidthMm: number;
  frontHeightMm: number;
  titleColor: string;
  titleSizePt: number;
  authorSizePt: number;
  /** 사용자가 위치를 직접 조절했는지 — true면 디자인 기본 위치 대신 이 값을 우선한다 */
  titleYPct?: number;
  authorYPct?: number;
  /** wrap.ts가 mapShadow에 등록한 표지 그림의 가상 경로명 (예: 'cover.jpg') */
  imageName: string;
}

export interface CoverDesign {
  id: string;
  name: string;
  description: string;
  /** 앞표지 그림 위에 얹을 Typst 마크업 (박스 좌표계, image는 이미 박스 배경으로 깔려있음) */
  renderFront(ctx: CoverDesignContext): string;
  /** 뒤표지 배경색 (앞표지 그림과 어울리는 톤) */
  backBg: string;
  backTextColor: string;
  /** 책등 배경색 */
  spineBg: string;
  spineTextColor: string;
}

const esc = typstText;

// ---------------------------------------------------------------------------
// 공통 유틸 — 제목/작가명 배치 (titleYPct 지정 시 그 값을, 아니면 디자인 기본값)
// ---------------------------------------------------------------------------

function titleBlock(
  ctx: CoverDesignContext,
  defaultYPct: number,
  opts: { weight?: number } = {},
): string {
  const y = ctx.titleYPct ?? defaultYPct;
  return `#place(top+center, dy: ${y}%)[
  #box(width: 86%)[
    #align(center)[#text(font: "Pretendard", weight: ${opts.weight ?? 700}, size: ${ctx.titleSizePt}pt, fill: rgb("${ctx.titleColor}"))[${esc(ctx.title)}]]
  ]
]`;
}

function authorBlock(ctx: CoverDesignContext, defaultYPct: number, color = '#4a3f2f'): string {
  if (!ctx.author) return '';
  const y = ctx.authorYPct ?? defaultYPct;
  return `#place(top+center, dy: ${y}%)[
  #text(font: "Pretendard", weight: 400, size: ${ctx.authorSizePt}pt, fill: rgb("${color}"))[${esc(ctx.author)} 지음]
]`;
}

// ---------------------------------------------------------------------------
// 디자인 6종 — id/이름/설명/배경색은 design-meta.ts(클라이언트 갤러리와 공유)가 정본,
// 여기서는 renderFront(실제 Typst 마크업)와 글자색만 id별로 정의해 합친다.
// ---------------------------------------------------------------------------

type DesignImpl = Pick<CoverDesign, 'renderFront' | 'backTextColor' | 'spineTextColor'>;

const DESIGN_IMPLS: Record<string, DesignImpl> = {
  'classic-vignette': {
    backTextColor: '#3a2f21',
    spineTextColor: '#3a2f21',
    renderFront: (ctx) => `
${`#place(rect(width: 100%, height: 42%, fill: gradient.linear((rgb(0,0,0,150), 0%), (rgb(0,0,0,0), 100%), angle: 90deg)))`}
${titleBlock(ctx, 9)}
${authorBlock(ctx, 9 + 19)}
`,
  },
  'bottom-banner': {
    backTextColor: '#4a2f1f',
    spineTextColor: '#4a2f1f',
    renderFront: (ctx) => `
#place(bottom, rect(width: 100%, height: 22%, fill: rgb("#fff8ec")))
#place(bottom, dy: -3%, line(start: (7%, 0pt), end: (93%, 0pt), stroke: 0.6pt + rgb("#c9a86a")))
${titleBlock({ ...ctx, titleYPct: ctx.titleYPct ?? 82 }, 82, { weight: 800 })}
${authorBlock({ ...ctx, authorYPct: ctx.authorYPct ?? 91 }, 91)}
`,
  },
  'minimal-frame': {
    backTextColor: '#33342e',
    spineTextColor: '#33342e',
    renderFront: (ctx) => `
#place(rect(width: 100%, height: 100%, fill: rgb("#f5f2ea")))
#place(dx: 6%, dy: 6%, rect(width: 88%, height: 78%, fill: none))
#place(dx: 7%, dy: 8%, image("${ctx.imageName}", width: 86%, height: 74%, fit: "cover"))
${titleBlock({ ...ctx, titleYPct: ctx.titleYPct ?? 87, titleSizePt: Math.min(ctx.titleSizePt, 22) }, 87, { weight: 600 })}
${authorBlock({ ...ctx, authorYPct: ctx.authorYPct ?? 94 }, 94, '#6b6a5e')}
`,
  },
  'warm-glow-lower': {
    backTextColor: '#f2e9d8',
    spineTextColor: '#f2e9d8',
    renderFront: (ctx) => `
#place(bottom, rect(width: 100%, height: 48%, fill: gradient.linear((rgb(20,15,5,0), 0%), (rgb(20,15,5,190), 100%), angle: 90deg)))
${titleBlock({ ...ctx, titleYPct: ctx.titleYPct ?? 68 }, 68)}
${authorBlock({ ...ctx, authorYPct: ctx.authorYPct ?? 68 + 14 }, 68 + 14, '#e8dcc4')}
`,
  },
  'ornate-corner': {
    backTextColor: '#f5e6c8',
    spineTextColor: '#f5e6c8',
    renderFront: (ctx) => {
      const w = ctx.frontWidthMm;
      const h = ctx.frontHeightMm;
      const m = Math.min(w, h) * 0.06;
      const L = Math.min(w, h) * 0.14;
      // line()은 [...] 블록으로 감싸면 텍스트 흐름 레이아웃에 걸려 사라진다 — 반드시
      // place()의 직접 인자로 넘겨야 절대좌표 도형으로 그려진다 (rect()도 동일).
      const corner = (x: number, y: number, dx: number, dy: number) =>
        `#place(dx: ${x}mm, dy: ${y}mm, line(length: ${L.toFixed(1)}mm, angle: ${dx > 0 ? 0 : 180}deg, stroke: 0.5pt + rgb("#f5e6c8")))\n` +
        `#place(dx: ${x}mm, dy: ${y}mm, line(length: ${L.toFixed(1)}mm, angle: ${dy > 0 ? 90 : -90}deg, stroke: 0.5pt + rgb("#f5e6c8")))`;
      return `
${corner(m, m, 1, 1)}
${corner(w - m, m, -1, 1)}
${corner(m, h - m, 1, -1)}
${corner(w - m, h - m, -1, -1)}
#place(rect(width: 100%, height: 30%, fill: gradient.linear((rgb(0,0,0,120), 0%), (rgb(0,0,0,0), 100%), angle: 90deg)))
${titleBlock(ctx, 11, { weight: 700 })}
${authorBlock(ctx, 11 + 19)}
`;
    },
  },
  'side-ribbon': {
    backTextColor: '#eef1f4',
    spineTextColor: '#eef1f4',
    renderFront: (ctx) => `
#place(rect(width: 38%, height: 100%, fill: rgb("${ctx.titleColor}dd")))
#place(dx: 5%, dy: 12%)[
  #box(width: 30%)[
    #text(font: "Pretendard", weight: 800, size: ${Math.min(ctx.titleSizePt, 22)}pt, fill: white)[${esc(ctx.title)}]
  ]
]
${ctx.author ? `#place(dx: 5%, dy: 88%)[#text(font: "Pretendard", size: ${ctx.authorSizePt}pt, fill: rgb("#e4e8ec"))[${esc(ctx.author)} 지음]]` : ''}
`,
  },
};

export const COVER_DESIGNS: CoverDesign[] = COVER_DESIGN_META.map((meta) => ({
  ...meta,
  ...DESIGN_IMPLS[meta.id],
}));

export function getCoverDesign(id: string | undefined): CoverDesign {
  return COVER_DESIGNS.find((d) => d.id === id) ?? COVER_DESIGNS[0];
}
