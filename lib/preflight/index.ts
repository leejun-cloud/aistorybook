// 사전검사 (Preflight) — PRD §4.4 + research/print-profiles.md §4 기준.
//
// 항목:
//   1. 페이지 누락·순서   — story.scenes ↔ layout.pages 대응, 순번 연속성
//   2. 글 넘침            — 렌더된 HTML을 Playwright로 열어 텍스트 슬롯 실측 (scrollHeight)
//   3. 안전영역 침범       — 글 슬롯이 재단선 안쪽 안전영역(≥5mm)·여백 규격(§3.6) 안인지
//                            (풀블리드 그림 슬롯은 여백 규칙의 예외 — 글 슬롯에만 적용)
//   4. 이미지 실해상도     — 300dpi 기준. 1024px는 210mm 판면에서 약 124dpi → WARN + 업스케일 권고
//   5. 폰트 임베드         — 로컬 Pretendard 파일 존재 + @font-face 포함 여부
//
// WARN(비차단)은 passed=true + detail "WARN: ..." 로 표기한다 — PreflightResult.passed는
// 차단(FAIL) 항목이 없을 때 true.

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import type { PreflightItem, PreflightResult, Project } from '../types';
import { renderBookHtml } from '../render/html';
import { renderWorkDir } from '../render/pdf';
import { readCharacterAsset } from '../ai/character';
import { assetNameFromUrl, printVariantName } from '../render/upscale';
import { getProfile, type PrintProfile } from '../cover/profiles';

// 렌더러(lib/render/html.ts) 고정 판형 — 수정 금지 파일이므로 상수로 미러링
const RENDER_TRIM_MM = 210;
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
// Playwright (전역 설치본 — lib/render/pdf.ts와 같은 방식)
// ---------------------------------------------------------------------------

// Chromium 실행은 lib/render/pdf.ts와 같은 해석 순서 (Vercel 서버리스 / 로컬 / 전역)
let cachedChromium: { chromium: any; serverless: any | null } | null = null;
async function launchBrowser(): Promise<any> {
  if (!cachedChromium) {
    if (process.env.VERCEL) {
      // 서버리스: 정적 분석 가능한 dynamic import — Vercel 파일 추적에 포함된다
      const serverless = (await import('@sparticuz/chromium')).default;
      const { chromium } = await import('playwright-core');
      cachedChromium = { chromium, serverless };
    } else {
      const req = eval('require') as NodeRequire;
      let chromium: any;
      try {
        ({ chromium } = req('playwright'));
      } catch {
        const globalRoot = execSync('npm root -g', { encoding: 'utf-8' }).trim();
        ({ chromium } = req(path.join(globalRoot, 'playwright')));
      }
      cachedChromium = { chromium, serverless: null };
    }
  }
  const { chromium, serverless } = cachedChromium;
  if (serverless) {
    return chromium.launch({
      args: serverless.args,
      executablePath: await serverless.executablePath(),
      headless: true,
    });
  }
  return chromium.launch();
}

interface TextOverflow {
  sceneNumber: number;
  overflowPx: number;
}

/** 열람용 HTML을 실제로 열어 각 텍스트 슬롯의 넘침(px)을 측정한다. */
async function measureTextOverflow(project: Project): Promise<TextOverflow[]> {
  const html = await renderBookHtml(project, { mode: 'view', titlePage: false });
  const tmp = path.join(renderWorkDir(project.id), 'preflight-measure.html');
  fs.writeFileSync(tmp, html, 'utf-8');

  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.goto('file://' + tmp, { waitUntil: 'networkidle' });
    await page.evaluate(() => (document as any).fonts.ready);
    return (await page.evaluate(() => {
      const out: { sceneNumber: number; overflowPx: number }[] = [];
      document.querySelectorAll('section.sheet[data-scene]').forEach((sheet) => {
        const sceneNumber = Number(sheet.getAttribute('data-scene'));
        sheet.querySelectorAll('.slot.txt').forEach((slot) => {
          const el = slot as HTMLElement;
          const overflow = el.scrollHeight - el.clientHeight;
          if (overflow > 1) out.push({ sceneNumber, overflowPx: overflow });
        });
      });
      return out;
    })) as TextOverflow[];
  } finally {
    await browser.close();
  }
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

async function checkFontEmbed(project: Project): Promise<PreflightItem> {
  const fontsDir = path.join(process.cwd(), 'lib', 'render', 'fonts');
  const files = ['Pretendard-Regular.ttf', 'Pretendard-Bold.ttf'];
  const missing = files.filter((f) => !fs.existsSync(path.join(fontsDir, f)));
  if (missing.length) {
    return { label: '폰트 임베드', passed: false, detail: `폰트 파일 누락: ${missing.join(', ')}` };
  }
  const html = await renderBookHtml(project, { mode: 'print', sceneNumbers: [] });
  const hasFace = html.includes('@font-face') && html.includes('Pretendard-Regular.ttf');
  return {
    label: '폰트 임베드',
    passed: hasFace,
    detail: hasFace ? 'Pretendard Regular/Bold 로컬 임베드' : '@font-face 누락',
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

  // 글 넘침 — 실측
  try {
    const overflows = await measureTextOverflow(project);
    items.push({
      label: '글 넘침',
      passed: overflows.length === 0,
      detail: overflows.length
        ? overflows.map((o) => `p${o.sceneNumber} 텍스트 ${o.overflowPx}px 넘침`).join(' / ')
        : '모든 텍스트 슬롯 안에 수납됨 (렌더 실측)',
    });
  } catch (e) {
    items.push({ label: '글 넘침', passed: false, detail: `측정 실패: ${(e as Error).message}` });
  }

  items.push(checkSafeArea(project, profile));
  items.push(await checkImageResolution(project));
  items.push(await checkFontEmbed(project));
  const fmt = checkFormatProfile(profile);
  if (fmt) items.push(fmt);

  return {
    ranAt: new Date().toISOString(),
    passed: items.every((i) => i.passed),
    items,
  };
}
