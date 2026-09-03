// 인쇄용 업스케일 — sharp(Lanczos3 + 약한 샤픈) 기반.
//
// 생성 이미지 1024px는 210mm 판면에서 약 124dpi로 인쇄 기준(300dpi)에 미달한다
// (research/print-profiles.md §4-5 "업스케일 단계 필수"). 원본 에셋은 그대로 두고
// `<이름>@print.png` 인쇄 변형본을 만들어, 인쇄용 본문/랩 표지 렌더러가 있으면
// 그것을 쓰고 없으면 원본으로 폴백한다.
//
// 참고: 모델 기반 초해상(Real-ESRGAN 등)이 디테일 복원에는 더 좋지만 의존성이
// 무겁다. 수채화·일러스트처럼 부드러운 화풍에서는 Lanczos3 리샘플 + 약한 샤픈이
// 인쇄용 표준 처리로 충분하다.

import path from 'path';
import sharp from 'sharp';
import type { Project } from '../types';
import { readStoredFile, storedFileMtime, writeStoredFile } from '../storage';

// lib/render/html.ts 판형 상수와 동일 (수정 금지 미러링 — preflight/index.ts와 같은 방식)
const TRIM_MM = 210;
const BLEED_MM = 3;
const TARGET_DPI = 300;

/** 풀블리드(트림+재단여분 216mm)를 300dpi로 채우는 픽셀 폭 */
export const PRINT_TARGET_PX = Math.ceil(((TRIM_MM + 2 * BLEED_MM) / 25.4) * TARGET_DPI); // 2552

const assetPath = (projectId: string, name: string) =>
  `projects/${path.basename(projectId)}/assets/${path.basename(name)}`;

/** /api/character/asset?...&name=<file> URL 또는 파일명 → 에셋 파일명 */
export function assetNameFromUrl(nameOrUrl: string): string | null {
  if (nameOrUrl.startsWith('/api/')) {
    const q = nameOrUrl.split('?')[1] ?? '';
    const name = new URLSearchParams(q).get('name');
    return name ? path.basename(name) : null;
  }
  return path.basename(nameOrUrl);
}

/**
 * 원본 에셋명 → 인쇄 변형본 에셋명 (scene-1-cand-0.png → scene-1-cand-0@print.jpg).
 * 변형본은 고품질 JPEG(q92, 4:4:4) — 2552px PNG는 장당 ~15MB로 12장이면 인쇄
 * HTML(data URI)이 수백 MB가 된다. 일러스트 계열에서 q92 JPEG는 시각적으로
 * 무손실에 가깝고 PDF 내부 이미지 압축의 표준 처리다.
 */
export function printVariantName(name: string): string {
  return name.replace(/\.(png|jpe?g)$/i, '') + '@print.jpg';
}

export interface UpscaleReport {
  name: string;
  action: 'upscaled' | 'skipped';
  detail: string;
}

/** 에셋 1장의 인쇄 변형본을 (없거나 원본보다 오래됐으면) 생성한다. */
export async function ensurePrintVariant(projectId: string, nameOrUrl: string): Promise<UpscaleReport> {
  const name = assetNameFromUrl(nameOrUrl);
  if (!name) return { name: nameOrUrl, action: 'skipped', detail: '에셋명을 해석할 수 없음' };

  const srcPath = assetPath(projectId, name);
  const variantPath = assetPath(projectId, printVariantName(name));
  const [srcMtime, variantMtime] = await Promise.all([
    storedFileMtime(srcPath),
    storedFileMtime(variantPath),
  ]);
  if (srcMtime === null) return { name, action: 'skipped', detail: '원본 파일 없음' };
  if (variantMtime !== null && variantMtime >= srcMtime) {
    return { name, action: 'skipped', detail: '변형본이 이미 최신' };
  }

  const srcBuf = await readStoredFile(srcPath);
  if (!srcBuf) return { name, action: 'skipped', detail: '원본을 읽을 수 없음' };

  const meta = await sharp(srcBuf).metadata();
  const width = meta.width ?? 0;
  if (width >= PRINT_TARGET_PX) {
    return { name, action: 'skipped', detail: `원본 ${width}px — 이미 목표(${PRINT_TARGET_PX}px) 이상` };
  }

  const out: Buffer = await sharp(srcBuf)
    .resize(PRINT_TARGET_PX, PRINT_TARGET_PX, { kernel: 'lanczos3', fit: 'fill' })
    .sharpen({ sigma: 1 })
    .jpeg({ quality: 92, chromaSubsampling: '4:4:4' })
    .toBuffer();
  await writeStoredFile(variantPath, out);
  return { name, action: 'upscaled', detail: `${width}px → ${PRINT_TARGET_PX}px (300dpi)` };
}

/**
 * 프로젝트의 인쇄 대상 이미지 전부(페이지 슬롯에 확정된 그림 + 선택된 표지)의
 * 인쇄 변형본을 보장한다. 인쇄용 PDF 렌더 직전에 호출.
 */
export async function ensurePrintAssets(project: Project): Promise<UpscaleReport[]> {
  const urls = new Set<string>();
  for (const page of project.layout.pages) {
    for (const slot of page.slots) {
      if (slot.imageUrl) urls.add(slot.imageUrl);
    }
  }
  const selectedCover = project.publish.coverOptions.find(
    (c) => c.id === project.publish.selectedCoverId && c.imageUrl,
  );
  if (selectedCover?.imageUrl) urls.add(selectedCover.imageUrl);

  const reports: UpscaleReport[] = [];
  for (const url of urls) {
    reports.push(await ensurePrintVariant(project.id, url));
  }
  return reports;
}
