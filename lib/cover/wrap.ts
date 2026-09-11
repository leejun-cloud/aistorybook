// 랩 표지 렌더 — 앞표지 + 책등 + 뒷표지(+날개 옵션) 한 장을 Typst로 조판해 PDF로.
//
// 부크크 공식 규격체크 로직(research/print-profiles.md §2)과 1:1 대응:
//   표지 전체 폭 = 판형폭 × 2 + 책등 + (날개 시 100 × 2)
//   표지 전체 높이 = 판형 높이
//   구성(왼→오): [왼날개] 뒷표지 | 책등 | 앞표지 [오른날개]
//   재단여백(bleed) 3mm — PDF 페이지는 사방 +3mm.
//
// 표지 그림 = AI(generate.ts), 제목·작가명·장식은 Typst 마크업 (PRD §4.3 그림/글자 분리).
// 앞표지의 실제 디자인(비네트/배너/여백프레임 등)은 lib/cover/designs.ts의 큐레이션된
// 조합 중 하나를 따른다 — 예전 HTML 방식은 "제목 상단 중앙" 1종류뿐이었다.
// 책등 < 5mm → 책등 텍스트 생략 + 경고 (spine.ts 계산 결과를 그대로 따른다).
//
// [표지 안쪽 백지 규칙 — print-profiles.md §4-3] 무선제본은 표지 "안쪽면"의
// 책등 접착부와 그 양옆 3~5mm에 인쇄·코팅을 넣지 않는다 (접착력 확보).
// 이 모듈은 바깥면(outside)만 출력한다 — 안쪽면 출력을 후속에서 추가할 때
// 반드시 책등 폭 ± 5mm 영역을 백지로 남길 것.

import fs from 'fs';
import path from 'path';
import type { CoverTextLayout, Project } from '../types';
import { readCharacterAsset } from '../ai/character';
import { persistOutput, renderWorkDir } from '../render/pdf';
import { assetNameFromUrl, printVariantName } from '../render/upscale';
import { compileTypstToPdf, typstText } from '../render/typst';
import { getCoverDesign } from './designs';
import type { PrintProfile } from './profiles';
import type { SpineResult } from './spine';

const esc = typstText;

/**
 * 세로쓰기 — Typst의 text(dir:)는 가로 방향만 허용해 글자를 하나씩 세로로 쌓는다
 * (기존 CSS writing-mode: vertical-rl과 동일한 결과, 한글 음절 낱자 단위 배치).
 * stack() 호출부 안은 이미 code 모드라 각 항목을 [ ] 콘텐츠 리터럴로 감싼다.
 */
function verticalStack(text: string, sizePt: number, weight: number, colorHex: string): string {
  const items = [...text].map((ch) =>
    ch === ' '
      ? 'v(3mm)'
      : `[#text(size: ${sizePt}pt, weight: ${weight}, fill: rgb("${colorHex}"))[${esc(ch)}]]`,
  );
  return `#stack(dir: ttb, spacing: 1.2mm, ${items.join(', ')})`;
}

export interface WrapCoverOptions {
  profile: PrintProfile;
  spine: SpineResult;
  /** 표지 그림 에셋 URL (publish.coverOptions에서 선택된 것) */
  coverImageUrl: string;
  title: string;
  author?: string;
  /** 날개 포함 여부 (좌우 각 profile.flapWidth) */
  flaps?: boolean;
  /** 뒷표지 소개 문구 (기본: 첫 장면 텍스트) */
  backBlurb?: string;
  /** 표지 텍스트 편집 설정 (/cover 페이지) — 제목·작가·책등 글·위치·크기·디자인 */
  layout?: CoverTextLayout;
}

export interface WrapCoverDimensions {
  /** 재단 후 표지 전체 폭 (판형폭×2 + 책등 + 날개) */
  trimWidth: number;
  trimHeight: number;
  /** bleed 포함 PDF 페이지 크기 */
  pageWidth: number;
  pageHeight: number;
  spineMm: number;
  spineTextIncluded: boolean;
  warnings: string[];
}

export function wrapCoverDimensions(profile: PrintProfile, spine: SpineResult, flaps: boolean): WrapCoverDimensions {
  const flapW = flaps ? profile.flapWidth * 2 : 0;
  const trimWidth = profile.trim.width * 2 + spine.spineMm + flapW;
  const trimHeight = profile.trim.height;
  return {
    trimWidth,
    trimHeight,
    pageWidth: trimWidth + profile.bleed * 2,
    pageHeight: trimHeight + profile.bleed * 2,
    spineMm: spine.spineMm,
    spineTextIncluded: spine.canFitSpineText,
    warnings: [...spine.warnings],
  };
}

/** 랩 표지 Typst 소스 + 이미지 자산을 만든다 (컴파일은 호출자가). */
export async function renderWrapCoverTypst(
  project: Project,
  opts: WrapCoverOptions,
): Promise<{ source: string; images: Record<string, Buffer>; dims: WrapCoverDimensions }> {
  const { profile, spine, flaps = false } = opts;
  const dims = wrapCoverDimensions(profile, spine, flaps);
  const b = profile.bleed;
  const flapW = flaps ? profile.flapWidth : 0;

  // 인쇄물이므로 업스케일 변형본(@print.jpg)이 있으면 우선 사용
  const coverName = assetNameFromUrl(opts.coverImageUrl);
  const variantBuf = coverName ? await readCharacterAsset(project.id, printVariantName(coverName)) : null;
  const buf = variantBuf ?? (await readCharacterAsset(project.id, opts.coverImageUrl));
  // 인쇄 변형본은 JPEG(@print.jpg)이므로 실제 포맷에 맞는 확장자로 Typst에 넘긴다
  // (틀린 확장자를 주면 Typst의 이미지 디코더가 포맷을 오인해 실패한다)
  const coverImageName = variantBuf ? 'cover.jpg' : 'cover.png';

  // 텍스트 편집 설정 (없으면 기존 기본값과 동일하게 동작)
  const layout = opts.layout ?? {};
  const title = layout.titleText?.trim() || opts.title;
  const author = layout.authorText?.trim() || opts.author;
  const blurb = layout.backBlurb?.trim() || opts.backBlurb || project.story.scenes[0]?.text || '';
  const clampPct = (v: number | undefined, def: number) =>
    Math.min(88, Math.max(0, typeof v === 'number' ? v : def));
  const titleYPct = layout.titleYPct !== undefined ? clampPct(layout.titleYPct, 7) : undefined;
  const authorYPct = layout.authorYPct !== undefined ? clampPct(layout.authorYPct, 88) : undefined;
  const titleSizePt = Math.min(60, Math.max(10, layout.titleSizePt ?? 26));
  const authorSizePt = Math.min(30, Math.max(7, layout.authorSizePt ?? 12));
  const titleColor = /^#[0-9a-fA-F]{3,8}$/.test(layout.titleColor ?? '') ? layout.titleColor! : '#3a2f21';
  const spineLabel = layout.spineText?.trim() || title;

  const design = getCoverDesign(layout.designId);
  const frontWidthMm = profile.trim.width + b;
  const frontHeightMm = dims.pageHeight;

  const frontContent = design.renderFront({
    title,
    author,
    frontWidthMm,
    frontHeightMm,
    titleColor,
    titleSizePt,
    authorSizePt,
    titleYPct,
    authorYPct,
    imageName: coverImageName,
  });

  const showSpineText = spine.spineMm > 0 && spine.canFitSpineText;
  const spineFontPt = Math.min(11, Math.max(6, (spine.spineMm - 1.5) * 2.2));

  // 패널 폭 (뒤 [+날개] | 책등 | 앞 [+날개], 전부 bleed 포함 페이지 좌표계 mm)
  const backW = profile.trim.width + b + flapW;
  const spineW = spine.spineMm;
  const frontW = frontWidthMm;

  const source = `
#set page(width: ${dims.pageWidth}mm, height: ${dims.pageHeight}mm, margin: 0mm, fill: rgb("#f4ead9"))
#set text(font: "Pretendard")

// ── 뒤표지 (+날개) ──────────────────────────────────────────────
#place(dx: 0mm, dy: 0mm, rect(width: ${backW}mm, height: ${dims.pageHeight}mm, fill: rgb("${design.backBg}")))
#place(dx: ${backW - profile.trim.width - 18}mm, dy: ${b + 16}mm)[
  #box(width: ${profile.trim.width}mm - 36mm)[
    #text(weight: 700, size: 13pt, fill: rgb("${design.backTextColor}"))[${esc(title)}]
  ]
]
#place(dx: ${backW - profile.trim.width - 18}mm, dy: ${b + 30}mm)[
  #box(width: ${profile.trim.width}mm - 36mm)[
    #text(size: 10.5pt, fill: rgb("${design.backTextColor}"))[${esc(blurb)}]
  ]
]

// ── 책등 ──────────────────────────────────────────────────────
#place(dx: ${backW}mm, dy: 0mm, rect(width: ${spineW}mm, height: ${dims.pageHeight}mm, fill: rgb("${design.spineBg}")))
${
  showSpineText
    ? `#place(dx: ${backW}mm, dy: ${b + 10}mm)[
  #box(width: ${spineW}mm, height: ${dims.pageHeight - 2 * (b + 10)}mm)[
    #align(center + horizon)[
      ${verticalStack(spineLabel, spineFontPt, 700, design.spineTextColor)}
      ${author ? `#v(6mm)\n      ${verticalStack(author, spineFontPt * 0.75, 400, design.spineTextColor)}` : ''}
    ]
  ]
]`
    : ''
}

// ── 앞표지 (+날개) — 그림 + 디자인 템플릿 ────────────────────────
#place(dx: ${backW + spineW}mm, dy: 0mm)[
  #box(width: ${frontW}mm, height: ${dims.pageHeight}mm, clip: true)[
    #place(image("${coverImageName}", width: 100%, height: 100%, fit: "cover"))
    ${frontContent}
  ]
]
`;

  return { source, images: buf ? { [coverImageName]: buf } : {}, dims };
}

export interface WrapCoverResult {
  pdfPath: string;
  dims: WrapCoverDimensions;
}

/** 랩 표지 PDF 생성. outDir 기본값: projects/<id>/output */
export async function renderWrapCoverPdf(
  project: Project,
  opts: WrapCoverOptions,
  outDir?: string,
): Promise<WrapCoverResult> {
  const dir = outDir ?? renderWorkDir(project.id);
  fs.mkdirSync(dir, { recursive: true });
  const { source, images, dims } = await renderWrapCoverTypst(project, opts);
  const pdfBuf = await compileTypstToPdf({ source, images });
  const pdfPath = path.join(dir, 'cover-wrap.pdf');
  fs.writeFileSync(pdfPath, pdfBuf);
  await persistOutput(project.id, pdfPath, 'cover-wrap.pdf');
  return { pdfPath, dims };
}
