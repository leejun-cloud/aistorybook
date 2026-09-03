import fs from 'fs';
import path from 'path';
import { NextRequest, NextResponse } from 'next/server';
import { loadProject, saveProject } from '../../../../lib/store';
import { renderBookPdfs } from '../../../../lib/render/pdf';
import { ensurePrintAssets } from '../../../../lib/render/upscale';

export const maxDuration = 300;

// POST /api/render/pdf
// body: { projectId, sceneNumbers? }
// → 열람용/인쇄용 PDF 2종 렌더 후 프로젝트 outputs에 기록.
export async function POST(req: NextRequest) {
  const { projectId, sceneNumbers } = await req.json().catch(() => ({}));
  if (!projectId) return NextResponse.json({ error: 'projectId가 필요합니다' }, { status: 400 });
  const project = loadProject(projectId);
  if (!project) return NextResponse.json({ error: 'project 없음' }, { status: 404 });

  try {
    // 인쇄 품질 보장: 렌더 전에 확정 이미지 전부의 300dpi 변형본을 생성 (print 렌더가 사용)
    const upscale = await ensurePrintAssets(project);
    const result = await renderBookPdfs(project, undefined, { sceneNumbers });
    project.publish.outputs.viewingPdfUrl = `/api/render/pdf?projectId=${encodeURIComponent(projectId)}&kind=view`;
    project.publish.outputs.printBodyPdfUrl = `/api/render/pdf?projectId=${encodeURIComponent(projectId)}&kind=print`;
    saveProject(project);
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

  const outDir = path.join(process.cwd(), 'projects', path.basename(projectId), 'output');
  const files = {
    view: path.join(outDir, 'book-view.pdf'),
    print: path.join(outDir, 'book-print.pdf'),
  };

  if (kind === 'view' || kind === 'print') {
    const file = files[kind];
    if (!fs.existsSync(file)) return NextResponse.json({ error: 'PDF 없음 — 먼저 POST로 렌더하세요' }, { status: 404 });
    return new NextResponse(new Uint8Array(fs.readFileSync(file)), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="book-${kind}.pdf"`,
        'Cache-Control': 'no-store',
      },
    });
  }

  return NextResponse.json({
    view: fs.existsSync(files.view),
    print: fs.existsSync(files.print),
  });
}
