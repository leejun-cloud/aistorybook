// Playwright/Chromium 인쇄 PDF 렌더링 — bookforge scripts/print_pdf.mjs의 TS 재작성.
//
// playwright는 로컬 의존성(package.json)을 우선 쓰고, 없으면 전역 설치본으로
// 폴백한다 (bookforge SKILL.md 방식: `npm root -g`에서 해석).
// Next.js 번들러가 동적 require를 정적 분석하지 못하도록 eval('require')로 로드한다.

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import type { Project } from '../types';
import { renderBookHtml, type RenderOptions } from './html';

let cachedChromium: any = null;

function loadChromium(): any {
  if (cachedChromium) return cachedChromium;
  const req = eval('require') as NodeRequire;
  let chromium: any;
  try {
    ({ chromium } = req('playwright'));
  } catch {
    const globalRoot = execSync('npm root -g', { encoding: 'utf-8' }).trim();
    ({ chromium } = req(path.join(globalRoot, 'playwright')));
  }
  cachedChromium = chromium;
  return chromium;
}

/** HTML 파일 → PDF (preferCSSPageSize — @page 크기를 그대로 쓴다). */
export async function printHtmlToPdf(htmlPath: string, pdfPath: string): Promise<void> {
  const chromium = loadChromium();
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto('file://' + path.resolve(htmlPath), { waitUntil: 'networkidle' });
    await page.evaluate(() => (document as any).fonts.ready);
    fs.mkdirSync(path.dirname(pdfPath), { recursive: true });
    await page.pdf({
      path: pdfPath,
      preferCSSPageSize: true,
      printBackground: true,
      displayHeaderFooter: false,
    });
  } finally {
    await browser.close();
  }
}

export interface BookPdfResult {
  viewingPdfPath: string; // 열람용 (재단선 없음, 210×210)
  printPdfPath: string; // 인쇄용 (재단여분+재단선 포함, 226×226)
  viewingHtmlPath: string;
  printHtmlPath: string;
}

/**
 * 프로젝트 → 열람용/인쇄용 PDF 2종.
 * outDir 기본값: projects/<id>/output
 */
export async function renderBookPdfs(
  project: Project,
  outDir?: string,
  opts?: Omit<RenderOptions, 'mode'>,
): Promise<BookPdfResult> {
  const dir = outDir ?? path.join(process.cwd(), 'projects', path.basename(project.id), 'output');
  fs.mkdirSync(dir, { recursive: true });

  const jobs: { mode: RenderOptions['mode']; html: string; pdf: string }[] = [
    { mode: 'view', html: path.join(dir, 'book-view.html'), pdf: path.join(dir, 'book-view.pdf') },
    { mode: 'print', html: path.join(dir, 'book-print.html'), pdf: path.join(dir, 'book-print.pdf') },
  ];

  for (const job of jobs) {
    fs.writeFileSync(job.html, renderBookHtml(project, { ...opts, mode: job.mode }), 'utf-8');
    await printHtmlToPdf(job.html, job.pdf);
  }

  return {
    viewingPdfPath: jobs[0].pdf,
    printPdfPath: jobs[1].pdf,
    viewingHtmlPath: jobs[0].html,
    printHtmlPath: jobs[1].html,
  };
}
