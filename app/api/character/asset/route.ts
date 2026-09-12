import { NextRequest, NextResponse } from 'next/server';
import { readCharacterAsset } from '../../../../lib/ai/character';
import { loadOwnedProject } from '../../../../lib/auth/require';

// GET /api/character/asset?projectId=<id>&name=<file.png>
// projects/<id>/assets/에 저장된 이미지를 서빙한다.
// 프로젝트 JSON에 기록되는 imageUrl이 이 라우트를 가리킨다.
export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get('projectId');
  const name = req.nextUrl.searchParams.get('name');
  if (!projectId || !name) {
    return NextResponse.json({ error: 'projectId, name이 필요합니다' }, { status: 400 });
  }
  // 이 라우트가 프로젝트 JSON의 imageUrl이 가리키는 곳이다 — 확인이 없으면
  // projectId만 알면 남의 삽화를 전부 내려받을 수 있다.
  const owned = await loadOwnedProject(projectId);
  if ('error' in owned) return owned.error;

  const data = await readCharacterAsset(projectId, name);
  if (!data) return NextResponse.json({ error: '에셋 없음' }, { status: 404 });
  return new NextResponse(new Uint8Array(data), {
    headers: { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' },
  });
}
