// Playwright/Chromium 인쇄 PDF 렌더링 — bookforge scripts/print_pdf.mjs의 TS 재작성.
//
// Chromium 해석 순서:
//   1. Vercel(서버리스): playwright-core + @sparticuz/chromium (서버리스용 chromium 바이너리)
//   2. 로컬: playwright 의존성 → 없으면 전역 설치본(npm root -g) 폴백
// Next.js 번들러가 동적 require를 정적 분석하지 못하도록 eval('require')로 로드한다.
//
// 산출물 경로: 중간 HTML/PDF는 로컬은 projects/<id>/output, 클라우드는 /tmp에 쓰고
// 최종 PDF를 스토리지(projects/<id>/output/*.pdf)에 업로드한다.

import { execSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { Project } from '../types';
import { renderBookHtml, type RenderOptions } from './html';
import { isCloudStorage, writeStoredFile } from '../storage';

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

/** HTML 파일 → PDF (preferCSSPageSize — @page 크기를 그대로 쓴다). */
export async function printHtmlToPdf(htmlPath: string, pdfPath: string): Promise<void> {
  const browser = await launchBrowser();
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

/** 렌더 작업용 로컬 디렉터리 — 로컬은 projects/<id>/output, 클라우드는 /tmp. */
export function renderWorkDir(projectId: string): string {
  if (isCloudStorage()) {
    const dir = path.join(os.tmpdir(), 'aistorybook', path.basename(projectId));
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }
  const dir = path.join(process.cwd(), 'projects', path.basename(projectId), 'output');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** 산출 PDF를 스토리지 키(projects/<id>/output/<name>)로 올린다. 로컬 모드에서 이미 그 위치면 생략. */
export async function persistOutput(projectId: string, localFile: string, name: string): Promise<string> {
  const key = `projects/${path.basename(projectId)}/output/${name}`;
  if (!isCloudStorage() && localFile === path.join(process.cwd(), key)) return key;
  await writeStoredFile(key, fs.readFileSync(localFile));
  return key;
}

export interface BookPdfResult {
  viewingPdfPath: string; // 열람용 (재단선 없음, 210×210)
  printPdfPath: string; // 인쇄용 (재단여분+재단선 포함, 226×226)
  viewingHtmlPath: string;
  printHtmlPath: string;
}

/**
 * 프로젝트 → 열람용/인쇄용 PDF 2종.
 * outDir 기본값: 로컬 projects/<id>/output, 클라우드 /tmp (최종 PDF는 스토리지에 업로드).
 */
export async function renderBookPdfs(
  project: Project,
  outDir?: string,
  opts?: Omit<RenderOptions, 'mode'>,
): Promise<BookPdfResult> {
  const dir = outDir ?? renderWorkDir(project.id);
  fs.mkdirSync(dir, { recursive: true });

  const jobs: { mode: RenderOptions['mode']; html: string; pdf: string; name: string }[] = [
    { mode: 'view', html: path.join(dir, 'book-view.html'), pdf: path.join(dir, 'book-view.pdf'), name: 'book-view.pdf' },
    { mode: 'print', html: path.join(dir, 'book-print.html'), pdf: path.join(dir, 'book-print.pdf'), name: 'book-print.pdf' },
  ];

  for (const job of jobs) {
    fs.writeFileSync(job.html, await renderBookHtml(project, { ...opts, mode: job.mode }), 'utf-8');
    await printHtmlToPdf(job.html, job.pdf);
    await persistOutput(project.id, job.pdf, job.name);
  }

  return {
    viewingPdfPath: jobs[0].pdf,
    printPdfPath: jobs[1].pdf,
    viewingHtmlPath: jobs[0].html,
    printHtmlPath: jobs[1].html,
  };
}
