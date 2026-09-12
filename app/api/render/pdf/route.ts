import path from 'path';
import { NextRequest, NextResponse } from 'next/server';
import { saveProject } from '../../../../lib/store';
import { loadOwnedProject } from '../../../../lib/auth/require';
import { renderBookPdfs } from '../../../../lib/render/pdf';
import { ensurePrintAssets } from '../../../../lib/render/upscale';
import { readStoredFile, storedFileExists } from '../../../../lib/storage';
import { isUnlocked, LOCKED_MESSAGE } from '../../../../lib/publish/gate';

export const maxDuration = 300;

// POST /api/render/pdf
// body: { projectId, sceneNumbers? }
// → 열람용/인쇄용 PDF 2종 렌더 후 프로젝트 outputs에 기록.
export async function POST(req: NextRequest) {
  const { projectId, sceneNumbers } = await req.json().catch(() => ({}));
  if (!projectId) return NextResponse.json({ error: 'projectId가 필요합니다' }, { status: 400 });
  const owned1 = await loadOwnedProject(projectId);
  if ('error' in owned1) return owned1.error;
  const project = owned1.project;

  try {
    // 인쇄 품질 보장: 렌더 전에 확정 이미지 전부의 300dpi 변형본을 생성 (print 렌더가 사용)
    const upscale = await ensurePrintAssets(project);
    const result = await renderBookPdfs(project, undefined, { sceneNumbers });
    project.publish.outputs.viewingPdfUrl = `/api/render/pdf?projectId=${encodeURIComponent(projectId)}&kind=view`;
    project.publish.outputs.printBodyPdfUrl = `/api/render/pdf?projectId=${encodeURIComponent(projectId)}&kind=print`;
    await saveProject(project);
    return NextResponse.json({
      status: 'done',
      viewingPdfUrl: project.publish.outputs.viewingPdfUrl,
      printBodyPdfUrl: project.publish.outputs.printBodyPdfUrl,
      files: { view: result.viewingPdfPath, print: result.printPdfPath },
      upscaled: upscale.filter((u) => u.action === 'upscaled').length,
    });
  } catch (e) {
    return NextResponse.json({ status: 'failed', error: (e as Error).message }, { status: 500 });
  }
}

// GET /api/render/pdf?projectId=<id>            → 렌더 상태 (outputs 존재 여부)
// GET /api/render/pdf?projectId=<id>&kind=view|print → PDF 파일 스트리밍
export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get('projectId');
  const kind = req.nextUrl.searchParams.get('kind');
  if (!projectId) return NextResponse.json({ error: 'projectId가 필요합니다' }, { status: 400 });

  const keys = {
    view: `projects/${path.basename(projectId)}/output/book-view.pdf`,
    print: `projects/${path.basename(projectId)}/output/book-print.pdf`,
  };

  if (kind === 'view' || kind === 'print') {
    // 인쇄용만 잠금 — 열람용 미리보기는 결제 전에도 열린다
    if (kind === 'print') {
      const owned2 = await loadOwnedProject(projectId);
      if ('error' in owned2) return owned2.error;
      const project = owned2.project;
      if (!isUnlocked(project)) return NextResponse.json({ error: LOCKED_MESSAGE }, { status: 402 });
    }
    const buf = await readStoredFile(keys[kind]);
    if (!buf) return NextResponse.json({ error: 'PDF 없음 — 먼저 POST로 렌더하세요' }, { status: 404 });
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="book-${kind}.pdf"`,
        'Cache-Control': 'no-store',
      },
    });
  }

  return NextResponse.json({
    view: await storedFileExists(keys.view),
    print: await storedFileExists(keys.print),
  });
}
