import { NextRequest, NextResponse } from 'next/server';
import { canAccess, loadProject, saveProject } from '../../../../lib/store';
import { getViewer } from '../../../../lib/auth/require';

export const dynamic = 'force-dynamic';

const FORBIDDEN = NextResponse.json({ error: '이 프로젝트에 접근할 수 없습니다' }, { status: 403 });

// GET  /api/project/<id>  → { project }
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const { uid, master } = await getViewer();
  const project = await loadProject(params.id);
  if (!project) return NextResponse.json({ error: 'project 없음' }, { status: 404 });
  if (!canAccess(project, uid, master)) return FORBIDDEN;
  return NextResponse.json({ project });
}

// PUT  /api/project/<id>  body: { project }  → 전체 프로젝트 JSON 저장
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const { uid, master } = await getViewer();
  const { project } = await req.json();
  if (!project || project.id !== params.id) {
    return NextResponse.json({ error: 'project 불일치' }, { status: 400 });
  }

  const stored = await loadProject(params.id);
  if (!stored) return NextResponse.json({ error: 'project 없음' }, { status: 404 });
  if (!canAccess(stored, uid, master)) return FORBIDDEN;

  // 소유자와 잠금 해제 시각은 서버만 정한다 — 클라이언트가 보낸 값을 그대로 저장하면
  // 결제 없이 unlockedAt을 넣거나 남의 프로젝트를 자기 것으로 바꿀 수 있다.
  await saveProject({
    ...project,
    ownerUid: stored.ownerUid,
    publish: { ...project.publish, unlockedAt: stored.publish.unlockedAt },
  });
  return NextResponse.json({ ok: true });
}
