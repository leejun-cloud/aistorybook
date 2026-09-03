import { NextRequest, NextResponse } from 'next/server';
import { loadProject } from '../../../lib/store';
import { listReferences, saveReferenceFromProject } from '../../../lib/reference';

// GET  → 스타일 레퍼런스 목록 (새 책 만들기의 선택지)
export async function GET() {
  return NextResponse.json({ references: await listReferences() });
}

// POST { projectId, name? } → 프로젝트를 스타일 레퍼런스로 저장
// (스타일 서술 + 앵커 이미지(표지·확정 페이지) + 분위기·연령·분량·조판 기본값)
export async function POST(req: NextRequest) {
  const { projectId, name } = await req.json().catch(() => ({}));
  if (!projectId) return NextResponse.json({ error: 'projectId가 필요합니다' }, { status: 400 });
  const project = await loadProject(projectId);
  if (!project) return NextResponse.json({ error: 'project 없음' }, { status: 404 });

  const result = await saveReferenceFromProject(project, name);
  if (typeof result === 'string') return NextResponse.json({ error: result }, { status: 400 });
  return NextResponse.json({ reference: result });
}
