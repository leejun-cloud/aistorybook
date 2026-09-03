import path from 'path';
import { NextRequest, NextResponse } from 'next/server';
import { loadProject, saveProject } from '../../../../lib/store';
import { readStoredFile } from '../../../../lib/storage';
import { getProfile, getInteriorPaper, type Binding } from '../../../../lib/cover/profiles';
import { calculateSpine } from '../../../../lib/cover/spine';
import { renderWrapCoverPdf } from '../../../../lib/cover/wrap';
import { ensurePrintVariant } from '../../../../lib/render/upscale';

export const maxDuration = 300;

const BINDINGS: Binding[] = ['saddle', 'perfect', 'hardcover', 'board'];

// POST /api/cover/render
// body: { projectId, coverId?, profileId, binding, paperName, pageCount?, flaps?, author?, spineMmOverride? }
// → 책등 자동 계산(사용자 override 가능, print-profiles.md §2) 후 랩 표지 PDF 렌더.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { projectId, coverId, profileId, binding, paperName, flaps, author, spineMmOverride } = body;
  if (!projectId || !profileId || !binding || !paperName) {
    return NextResponse.json({ error: 'projectId, profileId, binding, paperName이 필요합니다' }, { status: 400 });
  }
  const project = await loadProject(projectId);
  if (!project) return NextResponse.json({ error: 'project 없음' }, { status: 404 });

  const profile = getProfile(profileId);
  if (!profile) return NextResponse.json({ error: `프로파일 없음: ${profileId}` }, { status: 400 });
  if (!BINDINGS.includes(binding)) return NextResponse.json({ error: `제본 방식 없음: ${binding}` }, { status: 400 });
  if (!profile.bindings.includes(binding)) {
    return NextResponse.json(
      { error: `${profile.displayName}은(는) ${binding} 제본을 지원하지 않습니다 (지원: ${profile.bindings.join(', ')})` },
      { status: 400 },
    );
  }
  const paper = getInteriorPaper(profile, paperName);
  if (!paper) return NextResponse.json({ error: `내지 종이 없음: ${paperName}` }, { status: 400 });

  // 페이지 수: 명시 없으면 조판 페이지 수 사용 (표제지 포함 +1)
  const pageCount = typeof body.pageCount === 'number' ? body.pageCount : project.layout.pages.length + 1;

  const spine = calculateSpine({
    binding,
    paperThickness: paper.sheetThickness,
    pageCount,
    endpaperSheets: typeof body.endpaperSheets === 'number' ? body.endpaperSheets : undefined,
    formula: profile.spineFormula,
  });
  // 부크크 도구 기준 책등은 사용자가 직접 수정 가능 (§2) — override가 오면 그 값으로
  if (typeof spineMmOverride === 'number' && spineMmOverride >= 0) {
    spine.spineMm = spineMmOverride;
    spine.canFitSpineText = spineMmOverride >= profile.spineFormula.minSpineForText;
  }

  const selected =
    project.publish.coverOptions.find((c) => c.id === (coverId ?? project.publish.selectedCoverId)) ??
    project.publish.coverOptions.find((c) => c.imageUrl);
  if (!selected?.imageUrl) {
    return NextResponse.json({ error: '표지 이미지가 없습니다 — 먼저 /api/cover/generate 실행' }, { status: 400 });
  }

  try {
    // 인쇄 품질 보장: 표지 이미지의 300dpi 변형본 생성 (wrap 렌더가 우선 사용)
    await ensurePrintVariant(projectId, selected.imageUrl);
    const result = await renderWrapCoverPdf(project, {
      profile,
      spine,
      coverImageUrl: selected.imageUrl,
      title: project.title,
      author: typeof author === 'string' ? author : selected.author,
      flaps: !!flaps,
      layout: project.publish.coverLayout, // /cover 편집 페이지의 텍스트·위치 설정
    });
    project.publish.selectedCoverId = selected.id;
    project.publish.outputs.printCoverPdfUrl = `/api/cover/render?projectId=${encodeURIComponent(projectId)}`;
    await saveProject(project);
    return NextResponse.json({
      status: 'done',
      spine,
      dims: result.dims,
      printCoverPdfUrl: project.publish.outputs.printCoverPdfUrl,
      files: { html: result.htmlPath, pdf: result.pdfPath },
    });
  } catch (e) {
    return NextResponse.json({ status: 'failed', error: (e as Error).message }, { status: 500 });
  }
}

// GET /api/cover/render?projectId=<id> → 랩 표지 PDF 스트리밍
export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get('projectId');
  if (!projectId) return NextResponse.json({ error: 'projectId가 필요합니다' }, { status: 400 });
  const buf = await readStoredFile(`projects/${path.basename(projectId)}/output/cover-wrap.pdf`);
  if (!buf) return NextResponse.json({ error: 'PDF 없음 — 먼저 POST로 렌더하세요' }, { status: 404 });
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename="cover-wrap.pdf"',
      'Cache-Control': 'no-store',
    },
  });
}
