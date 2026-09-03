import { NextRequest, NextResponse } from 'next/server';
import { readReferenceAsset } from '../../../../lib/reference';

// GET /api/reference/asset?id=<ref-id>&name=<file>
// references/<id>/에 저장된 앵커 이미지를 서빙한다 (대시보드 썸네일용).
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  const name = req.nextUrl.searchParams.get('name');
  if (!id || !name) return NextResponse.json({ error: 'id, name이 필요합니다' }, { status: 400 });
  const data = await readReferenceAsset(id, name);
  if (!data) return NextResponse.json({ error: '에셋 없음' }, { status: 404 });
  const mime = name.endsWith('.jpg') || name.endsWith('.jpeg') ? 'image/jpeg' : 'image/png';
  return new NextResponse(new Uint8Array(data), {
    headers: { 'Content-Type': mime, 'Cache-Control': 'no-store' },
  });
}
