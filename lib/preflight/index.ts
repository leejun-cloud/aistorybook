// 사전검사 (Preflight) — PRD §4.4 + research/print-profiles.md §4 기준.
//
// 항목:
//   1. 페이지 누락·순서   — story.scenes ↔ layout.pages 대응, 순번 연속성
//   2. 글 넘침            — Typst measure()로 각 텍스트 슬롯의 실제 조판 높이를 실측
//                            (기존 Playwright DOM scrollHeight 방식보다 더 정밀한 mm 단위 측정)
//   3. 안전영역 침범       — 글 슬롯이 재단선 안쪽 안전영역(≥5mm)·여백 규격(§3.6) 안인지
//                            (풀블리드 그림 슬롯은 여백 규칙의 예외 — 글 슬롯에만 적용)
//   4. 이미지 실해상도     — 300dpi 기준. 1024px는 210mm 판면에서 약 124dpi → WARN + 업스케일 권고
//   5. 폰트 임베드         — 로컬 Pretendard 파일 존재 여부
//
// WARN(비차단)은 passed=true + detail "WARN: ..." 로 표기한다 — PreflightResult.passed는
// 차단(FAIL) 항목이 없을 때 true.

import fs from 'fs';
import path from 'path';
import type { PreflightItem, PreflightResult, Project } from '../types';
import { slotRectMm, TEXT_PAD_MM, TRIM_MM as RENDER_TRIM_MM } from '../render/book';
import { getTemplate } from '../render/templates';
import { measureTypstHeightsMm } from '../render/typst';
import { readCharacterAsset } from '../ai/character';
import { assetNameFromUrl, printVariantName } from '../render/upscale';
import { getProfile, type PrintProfile } from '../cover/profiles';

const TARGET_DPI = 300;

export interface PreflightOptions {
  /** 출판 프로파일 id (부크크1~4 = bookk-1~4, 교보1~3 = kyobo-1~3). 여백·안전영역 기준 */
  profileId?: string;
}

// ---------------------------------------------------------------------------
// PNG/JPEG 크기 파싱 (의존성 없이 — 인쇄 변형본 @print.jpg 포함)
// ---------------------------------------------------------------------------

function pngSize(buf: Buffer): { width: number; height: number } | null {
  if (buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47) return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

function jpegSize(buf: Buffer): { width: number; height: number } | null {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) {
      i++;
      continue;
    }
    const marker = buf[i + 1];
    // SOF0~SOF15 (DHT/JPG/DAC 제외)에 프레임 크기가 있다
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
    }
    i += 2 + buf.readUInt16BE(i + 2);
  }
  return null;
}

function imageSize(buf: Buffer): { width: number; height: number } | null {
  return pngSize(buf) ?? jpegSize(buf);
}

// ---------------------------------------------------------------------------
// 글 넘침 — Typst measure()로 실측 (lib/render/book.ts의 렌더 기하와 동일한 산수)
// ---------------------------------------------------------------------------

interface TextOverflow {
  sceneNumber: number;
  overflowMm: number;
}

async function measureTextOverflow(project: Project): Promise<TextOverflow[]> {
  const sceneByNumber = new Map(project.story.scenes.map((s) => [s.sceneNumber, s]));
  const jobs: { sceneNumber: number; text: string; widthMm: number; heightMm: number; fontSizePt: number; leading: number }[] = [];

  for (const page of project.layout.pages) {
    const template = getTemplate(page.templateId);
    for (const slot of template.slots) {
      if (slot.type !== 'text') continue;
      const data = page.slots.find((s) => s.slotId === slot.id);
      const text = data?.text ?? sceneByNumber.get(page.sceneNumber)?.text ?? '';
      if (!text.trim()) continue;
      const rect = slotRectMm(slot);
      jobs.push({
        sceneNumber: page.sceneNumber,
        text,
        widthMm: rect.w - 2 * TEXT_PAD_MM.x,
        heightMm: rect.h - 2 * TEXT_PAD_MM.y,
        fontSizePt: data?.fontSizePx ? data.fontSizePx * 0.75 : 13.5,
        leading: (data?.lineHeight ?? 1.85) - 1,
      });
    }
  }
  if (jobs.length === 0) return [];

  const measured = await measureTypstHeightsMm(jobs);
  const overflows: TextOverflow[] = [];
  jobs.forEach((job, i) => {
    const overflowMm = measured[i] - job.heightMm;
    if (overflowMm > 0.5) overflows.push({ sceneNumber: job.sceneNumber, overflowMm });
  });
  return overflows;
}

// ---------------------------------------------------------------------------
// 개별 검사
// ---------------------------------------------------------------------------

function checkPageOrder(project: Project): PreflightItem {
  const sceneNums = project.story.scenes.map((s) => s.sceneNumber).sort((a, b) => a - b);
  const pageNums = project.layout.pages.map((p) => p.sceneNumber).sort((a, b) => a - b);
  const missing = sceneNums.filter((n) => !pageNums.includes(n));
  const orphan = pageNums.filter((n) => !sceneNums.includes(n));
  const dup = pageNums.filter((n, i) => pageNums.indexOf(n) !== i);
  const problems: string[] = [];
  if (missing.length) problems.push(`장면 ${missing.join(', ')}의 페이지 누락`);
  if (orphan.length) problems.push(`장면 없는 페이지 ${orphan.join(', ')}`);
  if (dup.length) problems.push(`중복 페이지 ${dup.join(', ')}`);
  return {
    label: '페이지 누락·순서',
    passed: problems.length === 0,
    detail: problems.length ? problems.join(' / ') : `${pageNums.length}페이지, 순번 연속·중복 없음`,
  };
}

function checkSafeArea(project: Project, profile: PrintProfile | null): PreflightItem {
  const safe = (profile?.safeArea ?? 5) / RENDER_TRIM_MM; // 분수 좌표로 환산
  const marginRec = 20 / RENDER_TRIM_MM; // §3.6 바깥 여백 권장 하한 20mm
  const fails: string[] = [];
  const warns: string[] = [];
  for (const page of project.layout.pages) {
    const template = project.layout.templates.find((t) => t.id === page.templateId);
    for (const slot of template?.slots ?? []) {
      if (slot.type !== 'text') continue; // 풀블리드 그림은 여백 규칙 예외 (§3.6)
      const edges = Math.min(slot.x, slot.y, 1 - (slot.x + slot.width), 1 - (slot.y + slot.height));
      if (edges < safe - 1e-6) {
        fails.push(`p${page.sceneNumber} 글 슬롯이 안전영역(재단선 안쪽 ${profile?.safeArea ?? 5}mm) 침범`);
      } else if (edges < marginRec - 1e-6) {
        warns.push(`p${page.sceneNumber} 글 슬롯이 권장 여백(20mm) 안쪽 — 오버레이 템플릿이면 허용`);
      }
    }
  }
  const detail = fails.length
    ? fails.join(' / ')
    : warns.length
      ? `WARN: ${warns.join(' / ')}`
      : '모든 글 슬롯이 안전영역 안';
  return { label: '안전영역 침범', passed: fails.length === 0, detail };
}

async function checkImageResolution(project: Project): Promise<PreflightItem> {
  const problems: string[] = [];
  let checked = 0;
  for (const page of project.layout.pages) {
    const template = project.layout.templates.find((t) => t.id === page.templateId);
    for (const slotData of page.slots) {
      if (!slotData.imageUrl) continue;
      const slotDef = template?.slots.find((s) => s.id === slotData.slotId && s.type === 'image');
      if (!slotDef) continue;
      // 인쇄 렌더는 업스케일 변형본(@print.png)을 쓰므로, 있으면 그것을 기준으로 판정
      const name = assetNameFromUrl(slotData.imageUrl);
      const variantBuf = name ? await readCharacterAsset(project.id, printVariantName(name)) : null;
      const buf = variantBuf ?? (await readCharacterAsset(project.id, slotData.imageUrl));
      const size = buf ? imageSize(buf) : null;
      if (!size) {
        problems.push(`p${page.sceneNumber} 이미지 파일을 읽을 수 없음`);
        continue;
      }
      checked++;
      // 슬롯 실물 폭(mm) — 확대(transform.scale)하면 유효 해상도는 더 떨어진다
      const scale = page.transform?.scale ?? 1;
      const slotWidthMm = slotDef.width * RENDER_TRIM_MM;
      const effectiveDpi = Math.round((size.width / scale) / (slotWidthMm / 25.4));
      if (effectiveDpi < TARGET_DPI) {
        problems.push(
          `p${page.sceneNumber} ${size.width}px → 약 ${effectiveDpi}dpi (기준 ${TARGET_DPI}dpi 미달)` +
            (variantBuf ? '' : ' — 인쇄 PDF 렌더 시 자동 업스케일됨'),
        );
      }
    }
  }
  // 해상도 미달은 POD 인쇄가 거부되진 않고, 인쇄 렌더가 자동 업스케일하므로 WARN (비차단)
  const hasProblem = problems.length > 0;
  return {
    label: '이미지 실해상도 (300dpi)',
    passed: true,
    detail: hasProblem ? `WARN: ${problems.join(' / ')}` : `${checked}장 모두 ${TARGET_DPI}dpi 이상 (인쇄 변형본 기준)`,
  };
}

function checkFontEmbed(): PreflightItem {
  const fontsDir = path.join(process.cwd(), 'lib', 'render', 'fonts');
  const files = ['Pretendard-Regular.ttf', 'Pretendard-Bold.ttf'];
  const missing = files.filter((f) => !fs.existsSync(path.join(fontsDir, f)));
  return {
    label: '폰트 임베드',
    passed: missing.length === 0,
    detail: missing.length ? `폰트 파일 누락: ${missing.join(', ')}` : 'Pretendard Regular/Bold 로컬 임베드 (Typst fontPaths)',
  };
}

function checkFormatProfile(profile: PrintProfile | null): PreflightItem | null {
  if (!profile) return null;
  const match = profile.trim.width === RENDER_TRIM_MM && profile.trim.height === RENDER_TRIM_MM;
  return {
    label: `판형 대응 (${profile.displayName} ${profile.format})`,
    passed: true,
    detail: match
      ? '본문 판형과 프로파일 판형 일치'
      : `WARN: 본문은 210×210 정사각, 프로파일은 ${profile.trim.width}×${profile.trim.height} — ` +
        `정사각 판형은 부크크·교보 표준 프리셋에 없음 (print-profiles.md §2). 입점 전 판형 확정 필요`,
  };
}

// ---------------------------------------------------------------------------
// 실행
// ---------------------------------------------------------------------------

export async function runPreflight(project: Project, opts: PreflightOptions = {}): Promise<PreflightResult> {
  const profile = opts.profileId ? getProfile(opts.profileId) : null;

  const items: PreflightItem[] = [];
  items.push(checkPageOrder(project));

  // 글 넘침 — Typst measure()로 실측
  try {
    const overflows = await measureTextOverflow(project);
    items.push({
      label: '글 넘침',
      passed: overflows.length === 0,
      detail: overflows.length
        ? overflows.map((o) => `p${o.sceneNumber} 텍스트 ${o.overflowMm.toFixed(1)}mm 넘침`).join(' / ')
        : '모든 텍스트 슬롯 안에 수납됨 (렌더 실측)',
    });
  } catch (e) {
    items.push({ label: '글 넘침', passed: false, detail: `측정 실패: ${(e as Error).message}` });
  }

  items.push(checkSafeArea(project, profile));
  items.push(await checkImageResolution(project));
  items.push(checkFontEmbed());
  const fmt = checkFormatProfile(profile);
  if (fmt) items.push(fmt);

  return {
    ranAt: new Date().toISOString(),
    passed: items.every((i) => i.passed),
    items,
    score: scoreItems(items),
  };
}

/**
 * 검수 점수 0~100. FAIL 항목은 -20, WARN(통과했지만 detail이 "WARN:"으로 시작)은 -5.
 * 대시보드 카드와 인쇄 단계에서 "검수 N점"으로 노출된다.
 */
export function scoreItems(items: PreflightItem[]): number {
  let score = 100;
  for (const item of items) {
    if (!item.passed) score -= 20;
    else if (item.detail?.startsWith('WARN')) score -= 5;
  }
  return Math.max(0, score);
}
