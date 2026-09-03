// 랩 표지 렌더 — 앞표지 + 책등 + 뒷표지(+날개 옵션) 한 장 HTML → PDF.
//
// 부크크 공식 규격체크 로직(research/print-profiles.md §2)과 1:1 대응:
//   표지 전체 폭 = 판형폭 × 2 + 책등 + (날개 시 100 × 2)
//   표지 전체 높이 = 판형 높이
//   구성(왼→오): [왼날개] 뒷표지 | 책등 | 앞표지 [오른날개]
//   재단여백(bleed) 3mm — PDF 페이지는 사방 +3mm.
//
// 표지 그림 = AI(generate.ts), 제목·작가명 = HTML 텍스트 (PRD §4.3 그림/글자 분리).
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
import { persistOutput, printHtmlToPdf, renderWorkDir } from '../render/pdf';
import { assetNameFromUrl, printVariantName } from '../render/upscale';
import type { PrintProfile } from './profiles';
import type { SpineResult } from './spine';

const FONTS_DIR = path.join(process.cwd(), 'lib', 'render', 'fonts');
const fontUri = (f: string) => 'file://' + path.join(FONTS_DIR, f);

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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
  /** 표지 텍스트 편집 설정 (/cover 페이지) — 제목·작가·책등 글·위치·크기 */
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

export async function renderWrapCoverHtml(project: Project, opts: WrapCoverOptions): Promise<{ html: string; dims: WrapCoverDimensions }> {
  const { profile, spine, flaps = false } = opts;
  const dims = wrapCoverDimensions(profile, spine, flaps);
  const b = profile.bleed;
  const flapW = flaps ? profile.flapWidth : 0;

  // 인쇄물이므로 업스케일 변형본(@print.jpg)이 있으면 우선 사용
  const coverName = assetNameFromUrl(opts.coverImageUrl);
  const variantBuf = coverName ? await readCharacterAsset(project.id, printVariantName(coverName)) : null;
  const buf = variantBuf ?? (await readCharacterAsset(project.id, opts.coverImageUrl));
  const coverUri = buf
    ? `data:image/${variantBuf ? 'jpeg' : 'png'};base64,${buf.toString('base64')}`
    : null;

  // 텍스트 편집 설정 (없으면 기존 기본값과 동일하게 동작)
  const layout = opts.layout ?? {};
  const title = layout.titleText?.trim() || opts.title;
  const author = layout.authorText?.trim() || opts.author;
  const blurb = layout.backBlurb?.trim() || opts.backBlurb || project.story.scenes[0]?.text || '';
  const clampPct = (v: number | undefined, def: number) =>
    Math.min(88, Math.max(0, typeof v === 'number' ? v : def));
  const titleYPct = clampPct(layout.titleYPct, 7);
  const authorYPct = clampPct(layout.authorYPct, 88);
  const titleSizePt = Math.min(60, Math.max(10, layout.titleSizePt ?? 26));
  const authorSizePt = Math.min(30, Math.max(7, layout.authorSizePt ?? 12));
  const titleColor = /^#[0-9a-fA-F]{3,8}$/.test(layout.titleColor ?? '') ? layout.titleColor! : '#3a2f21';
  const spineLabel = layout.spineText?.trim() || title;

  // 패널 x 오프셋 (bleed 포함 페이지 좌표, 왼→오: [왼날개] 뒤 | 책등 | 앞 [오른날개])
  const backX = b + flapW;
  const spineX = backX + profile.trim.width;
  const frontX = spineX + spine.spineMm;

  const spineText =
    spine.spineMm > 0 && spine.canFitSpineText
      ? `<div class="spine-text">${esc(spineLabel)}${author ? `<span class="spine-author">${esc(author)}</span>` : ''}</div>`
      : '';

  const html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8">
<title>${esc(opts.title)} — 랩 표지</title>
<style>
@font-face { font-family: "Pretendard"; src: url("${fontUri('Pretendard-Regular.ttf')}"); font-weight: 400; }
@font-face { font-family: "Pretendard"; src: url("${fontUri('Pretendard-Bold.ttf')}"); font-weight: 700; }
@page { size: ${dims.pageWidth}mm ${dims.pageHeight}mm; margin: 0; }
* { margin: 0; padding: 0; box-sizing: border-box; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { font-family: "Pretendard", sans-serif; width: ${dims.pageWidth}mm; height: ${dims.pageHeight}mm;
  position: relative; overflow: hidden; background: #f4ead9; word-break: keep-all; }

/* 배경 그림: 앞표지 패널 + 그 위/좌우 bleed까지 채운다 */
.panel { position: absolute; top: 0; height: ${dims.pageHeight}mm; overflow: hidden; }
.front { left: ${frontX}mm; width: ${profile.trim.width + b}mm; }
.front .art { position: absolute; inset: 0;
  ${coverUri ? `background: url('${coverUri}') center / cover no-repeat;` : 'background: #e8dcc8;'} }
.back { left: ${backX - b - flapW}mm; width: ${profile.trim.width + b + flapW}mm; background: #efe3cf; }
.spine { left: ${spineX}mm; width: ${spine.spineMm}mm; background: #d9c9ad; }

/* 앞표지 텍스트 — 위치·크기는 coverLayout(%·pt), 기본은 상단 7%/하단 88% */
.front .title { position: absolute; top: ${b + (titleYPct / 100) * profile.trim.height}mm; left: 10mm; right: 10mm;
  font-size: ${titleSizePt}pt; font-weight: 700; text-align: center; color: ${titleColor};
  text-shadow: 0 0 3mm rgba(255,252,244,0.9), 0 0 6mm rgba(255,252,244,0.7); }
.front .author { position: absolute; top: ${b + (authorYPct / 100) * profile.trim.height}mm; left: 10mm; right: 10mm;
  font-size: ${authorSizePt}pt; font-weight: 400; text-align: center; color: #4a3f2f;
  text-shadow: 0 0 2mm rgba(255,252,244,0.9); }

/* 책등 텍스트 — 세로쓰기 */
.spine-text { position: absolute; top: ${b + 10}mm; bottom: ${b + 10}mm; left: 0; right: 0;
  writing-mode: vertical-rl; display: flex; align-items: center; justify-content: flex-start;
  font-weight: 700; color: #3a2f21;
  font-size: ${Math.min(11, Math.max(6, (spine.spineMm - 1.5) * 2.2))}pt; }
.spine-author { margin-top: 6mm; font-weight: 400; font-size: 0.75em; }

/* 뒷표지 */
.back .blurb { position: absolute; top: ${b + 30}mm; right: ${flapW + 18}mm; width: ${profile.trim.width - 40}mm;
  font-size: 10.5pt; line-height: 2; color: #4a3f2f; text-align: left; }
.back .back-title { position: absolute; top: ${b + 16}mm; right: ${flapW + 18}mm;
  font-size: 13pt; font-weight: 700; color: #3a2f21; }
</style>
</head>
<body>
  <div class="panel back">
    <div class="back-title">${esc(title)}</div>
    <div class="blurb">${esc(blurb)}</div>
  </div>
  <div class="panel spine">${spineText}</div>
  <div class="panel front">
    <div class="art"></div>
    <div class="title">${esc(title)}</div>
    ${author ? `<div class="author">${esc(author)} 지음</div>` : ''}
  </div>
</body>
</html>`;

  return { html, dims };
}

export interface WrapCoverResult {
  htmlPath: string;
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
  const { html, dims } = await renderWrapCoverHtml(project, opts);
  const htmlPath = path.join(dir, 'cover-wrap.html');
  const pdfPath = path.join(dir, 'cover-wrap.pdf');
  fs.writeFileSync(htmlPath, html, 'utf-8');
  await printHtmlToPdf(htmlPath, pdfPath);
  await persistOutput(project.id, pdfPath, 'cover-wrap.pdf');
  return { htmlPath, pdfPath, dims };
}
