import { NextRequest, NextResponse } from 'next/server';
import { readCharacterAsset } from '../../../../lib/ai/character';

// GET /api/character/asset?projectId=<id>&name=<file.png>
// projects/<id>/assets/에 저장된 이미지를 서빙한다.
// 프로젝트 JSON에 기록되는 imageUrl이 이 라우트를 가리킨다.
export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get('projectId');
  const name = req.nextUrl.searchParams.get('name');
  if (!projectId || !name) {
    return NextResponse.json({ error: 'projectId, name이 필요합니다' }, { status: 400 });
  }
  const data = readCharacterAsset(projectId, name);
  if (!data) return NextResponse.json({ error: '에셋 없음' }, { status: 404 });
  return new NextResponse(new Uint8Array(data), {
    headers: { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' },
  });
}
