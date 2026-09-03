import { NextRequest, NextResponse } from 'next/server';
import { loadProject, saveProject } from '../../../../lib/store';

// GET  /api/project/<id>  → { project }
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const project = await loadProject(params.id);
  if (!project) return NextResponse.json({ error: 'project 없음' }, { status: 404 });
  return NextResponse.json({ project });
}

// PUT  /api/project/<id>  body: { project }  → 전체 프로젝트 JSON 저장
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const { project } = await req.json();
  if (!project || project.id !== params.id) {
    return NextResponse.json({ error: 'project 불일치' }, { status: 400 });
  }
  await saveProject(project);
  return NextResponse.json({ ok: true });
}
