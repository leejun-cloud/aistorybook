// 최종 출판 패키지 — 인쇄소·서점에 그대로 넘길 수 있는 ZIP 한 덩어리로 묶는다.
//
// 담는 것:
//   인쇄용/본문.pdf, 인쇄용/표지.pdf   — 재단선 포함 인쇄 입고용
//   열람용/미리보기.pdf                 — 검토·공유용
//   서지정보.txt                        — 제목·저자·ISBN·판형·쪽수·소개문
//   검수리포트.txt                      — 사전검사 점수와 항목별 결과
//
// 없는 파일은 조용히 건너뛰고, 무엇이 빠졌는지 missing으로 돌려준다 — 표지를
// 아직 안 만들었다고 패키지 생성 자체가 막히면 곤란하다.

import path from 'path';
import type { Project } from '../types';
import { readStoredFile } from '../storage';
import { createZip, type ZipEntry } from './zip';

const out = (projectId: string, name: string) =>
  `projects/${path.basename(projectId)}/output/${name}`;

function serialSafe(title: string): string {
  return title.replace(/[\/\\:*?"<>|]/g, '_').trim() || 'book';
}

function bibliography(project: Project): string {
  const m = project.publish.meta ?? {};
  const lines = [
    `제목: ${project.title}`,
    `저자: ${m.author ?? '(미입력)'}`,
    `출판사: ${m.publisher ?? '(미입력)'}`,
    `ISBN: ${m.isbn ?? '(미입력)'}`,
    `대상 독자: ${m.readerAge ?? project.story.targetAge ?? '(미입력)'}`,
    `장면 수: ${project.story.scenes.length}장면`,
    `유통 예정: ${m.platforms?.length ? m.platforms.join(', ') : '(미선택)'}`,
    '',
    '책 소개',
    '--------',
    m.blurb?.trim() || '(미입력)',
  ];
  return lines.join('\n') + '\n';
}

function auditReport(project: Project): string {
  const pf = project.publish.preflight;
  if (!pf) return '사전검사를 아직 실행하지 않았습니다.\n';
  const head = [
    `검사 시각: ${new Date(pf.ranAt).toLocaleString('ko-KR')}`,
    `검수 점수: ${pf.score ?? '-'}점`,
    `판정: ${pf.passed ? '통과 (인쇄 입고 가능)' : '수정 필요'}`,
    '',
  ];
  const items = pf.items.map((i) => {
    const mark = i.passed ? (i.detail?.startsWith('WARN') ? '[주의]' : '[통과]') : '[실패]';
    return `${mark} ${i.label}${i.detail ? ` — ${i.detail}` : ''}`;
  });
  return [...head, ...items].join('\n') + '\n';
}

export interface PackageResult {
  zip: Buffer;
  fileName: string;
  /** 담지 못한 항목 설명 */
  missing: string[];
  /** 실제로 담긴 파일 경로 */
  included: string[];
}

export async function buildPublishPackage(project: Project): Promise<PackageResult> {
  const entries: ZipEntry[] = [];
  const missing: string[] = [];

  const files: { key: string; zipName: string; label: string }[] = [
    { key: 'book-print.pdf', zipName: '인쇄용/본문.pdf', label: '인쇄용 본문 PDF' },
    { key: 'cover-wrap.pdf', zipName: '인쇄용/표지.pdf', label: '인쇄용 랩 표지 PDF' },
    { key: 'book-view.pdf', zipName: '열람용/미리보기.pdf', label: '열람용 PDF' },
  ];

  for (const f of files) {
    const buf = await readStoredFile(out(project.id, f.key));
    if (buf) entries.push({ name: f.zipName, data: buf });
    else missing.push(f.label);
  }

  entries.push({ name: '서지정보.txt', data: Buffer.from(bibliography(project), 'utf-8') });
  entries.push({ name: '검수리포트.txt', data: Buffer.from(auditReport(project), 'utf-8') });

  return {
    zip: createZip(entries),
    fileName: `${serialSafe(project.title)}-출판패키지.zip`,
    missing,
    included: entries.map((e) => e.name),
  };
}

/** 서지정보 입력 상태 — UI의 "입력됨 / 누락됨" 배지용 */
export function metaCompleteness(project: Project): { field: string; label: string; filled: boolean }[] {
  const m = project.publish.meta ?? {};
  return [
    { field: 'author', label: '저자', filled: Boolean(m.author?.trim()) },
    { field: 'blurb', label: '책 소개', filled: Boolean(m.blurb?.trim()) },
    { field: 'isbn', label: 'ISBN', filled: Boolean(m.isbn?.trim()) },
    { field: 'publisher', label: '출판사', filled: Boolean(m.publisher?.trim()) },
    { field: 'platforms', label: '유통 플랫폼', filled: Boolean(m.platforms?.length) },
  ];
}
