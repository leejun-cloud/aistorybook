// Typst 컴파일 공통 헬퍼 — 표지(cover/wrap.ts)·내지(render/html.ts) 렌더러가 공유한다.
//
// HTML/CSS + Playwright 대신 Typst를 쓰는 이유: CSS는 "화면에 흐르는 문서"용 언어라
// 인쇄(재단선·블리드·정밀 mm 배치)를 흉내내려면 해킹이 쌓인다 (예: text-shadow를
// 겹쳐 발광 효과를 흉내내던 것). Typst는 애초에 이런 인쇄용 배치·그라디언트·벡터
// 도형이 1급 기능이라 더 정밀하고 코드도 단순하다.
//
// typst-ts-node-compiler는 sharp와 같은 방식의 플랫폼별 프리빌드 네이티브 애드온이라
// (chromium처럼 fs로 읽는 bin/ 폴더가 아니라 require()로 해석되는 표준 .node 모듈)
// Vercel 서버리스에서 별도 파일 추적 설정 없이 그대로 동작한다.
//
// 이미지처럼 메모리에 있는 바이트는 실파일 없이 mapShadow(가상 경로)로 주입한다.
// Typst 워크스페이스 밖 경로는 거부되므로, 항상 workspace 하위 가상 경로를 쓴다.

import fs from 'fs';
import os from 'os';
import path from 'path';

const FONTS_DIR = path.join(process.cwd(), 'lib', 'render', 'fonts');

let NodeCompilerCtor: typeof import('@myriaddreamin/typst-ts-node-compiler').NodeCompiler | null = null;
async function loadNodeCompiler() {
  if (!NodeCompilerCtor) {
    ({ NodeCompiler: NodeCompilerCtor } = await import('@myriaddreamin/typst-ts-node-compiler'));
  }
  return NodeCompilerCtor;
}

export interface TypstCompileInput {
  /** Typst 소스 (마크업) */
  source: string;
  /** 가상 경로(예: 'cover.png') → 이미지 바이트. source에서 image("cover.png")로 참조 */
  images?: Record<string, Buffer>;
}

/** Typst 소스를 PDF 바이트로 컴파일한다. 워크스페이스는 임시 디렉터리에 격리. */
export async function compileTypstToPdf(input: TypstCompileInput): Promise<Buffer> {
  const NodeCompiler = await loadNodeCompiler();
  // 실행마다 격리된 워크스페이스 — mapShadow 경로가 이 루트 하위여야 한다
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'aistorybook-typst-'));
  try {
    const compiler = NodeCompiler.create({ workspace, fontArgs: [{ fontPaths: [FONTS_DIR] }] });
    for (const [name, data] of Object.entries(input.images ?? {})) {
      compiler.mapShadow(path.join(workspace, name), data);
    }
    const mainPath = path.join(workspace, 'main.typ');
    compiler.mapShadow(mainPath, Buffer.from(input.source, 'utf-8'));
    const result = compiler.pdf({ mainFilePath: mainPath });
    if (!result) throw new Error('Typst 컴파일 실패 (PDF 생성 안 됨) — 소스 문법을 확인하세요');
    return Buffer.from(result);
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
}

export interface TypstMeasureJob {
  text: string;
  widthMm: number;
  fontSizePt: number;
  /** par(leading:)에 들어갈 값 (line-height - 1, em 단위) */
  leading: number;
}

/**
 * 여러 텍스트 블록을 지정된 폭으로 조판했을 때의 실제 높이(mm)를 한 번의 컴파일로 일괄
 * 측정한다 — Typst의 measure()+metadata()+query() 조합 (사전검사 글 넘침 실측에 사용).
 * DOM scrollHeight 방식보다 정밀한 mm 단위 결과를 준다.
 */
export async function measureTypstHeightsMm(jobs: TypstMeasureJob[]): Promise<number[]> {
  if (jobs.length === 0) return [];
  const NodeCompiler = await loadNodeCompiler();
  const fs = await import('fs');
  const os = await import('os');
  const path = await import('path');
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'aistorybook-typst-measure-'));
  try {
    const compiler = NodeCompiler.create({ workspace, fontArgs: [{ fontPaths: [FONTS_DIR] }] });
    const blocks = jobs.map(
      (job, i) => `#context {
  let h = measure(par(leading: ${job.leading.toFixed(3)}em)[#text(font: "Pretendard", size: ${job.fontSizePt}pt)[${typstText(job.text)}]], width: ${job.widthMm}mm).height
  [#metadata((i: ${i}, h: h / 1mm)) <measure>]
}`,
    );
    const mainPath = path.join(workspace, 'main.typ');
    compiler.mapShadow(mainPath, Buffer.from(blocks.join('\n'), 'utf-8'));
    const doc = compiler.compile({ mainFilePath: mainPath });
    if (!doc.result) throw new Error('Typst 측정 컴파일 실패');
    const rows = compiler.query(doc.result, { selector: '<measure>' }) as {
      value: { i: number; h: number };
    }[];
    const heights = new Array<number>(jobs.length).fill(0);
    for (const row of rows) heights[row.value.i] = row.value.h;
    return heights;
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
}

/** Typst 문자열 리터럴 이스케이프 (큰따옴표·백슬래시). */
export function typstStr(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/** Typst 마크업 컨텍스트에서 특수문자(#, [, ], @ 등)를 이스케이프해 순수 텍스트로 삽입한다. */
export function typstText(s: string): string {
  return s.replace(/[\\#\[\]@_*`<>$]/g, (c) => `\\${c}`);
}
