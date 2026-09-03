import { NextRequest, NextResponse } from 'next/server';
import { createProject, listProjects, saveProject } from '../../../lib/store';
import { applyReferenceToProject, loadReference } from '../../../lib/reference';

// GET  → 프로젝트 목록 (대시보드)
export async function GET() {
  return NextResponse.json({ projects: await listProjects() });
}

// POST { title, referenceId? } → 새 프로젝트 생성 (목업 시드로 초기화).
// referenceId를 주면 저장된 스타일 레퍼런스(화풍 앵커 이미지 + 분위기 + 조판)를
// 적용해 시작한다 — 스토리·인물만 새로 만들면 같은 스타일의 책이 나온다.
export async function POST(req: NextRequest) {
  const { title, referenceId } = await req.json().catch(() => ({ title: '' }));
  const project = await createProject(title ?? '');
  if (referenceId) {
    const reference = await loadReference(String(referenceId));
    if (!reference) return NextResponse.json({ error: `레퍼런스 없음: ${referenceId}` }, { status: 400 });
    await applyReferenceToProject(project, reference);
    await saveProject(project);
  }
  return NextResponse.json({ project });
}
