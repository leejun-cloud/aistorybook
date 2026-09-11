// 본문 PDF 렌더 — Typst 컴파일(lib/render/book.ts) 결과를 파일로 저장하고 스토리지에 올린다.
// 이전엔 Playwright/Chromium으로 HTML을 인쇄했으나, Typst 도입으로 브라우저 없이
// 네이티브 컴파일만으로 PDF가 나온다 (서버리스 배포가 훨씬 가벼워진다).

import fs from 'fs';
import os from 'os';
import path from 'path';
import type { Project } from '../types';
import { renderBookPdf, type RenderOptions } from './book';
import { isCloudStorage, writeStoredFile } from '../storage';

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

  const jobs: { mode: RenderOptions['mode']; pdf: string; name: string }[] = [
    { mode: 'view', pdf: path.join(dir, 'book-view.pdf'), name: 'book-view.pdf' },
    { mode: 'print', pdf: path.join(dir, 'book-print.pdf'), name: 'book-print.pdf' },
  ];

  for (const job of jobs) {
    const pdfBuf = await renderBookPdf(project, { ...opts, mode: job.mode });
    fs.writeFileSync(job.pdf, pdfBuf);
    await persistOutput(project.id, job.pdf, job.name);
  }

  return { viewingPdfPath: jobs[0].pdf, printPdfPath: jobs[1].pdf };
}
