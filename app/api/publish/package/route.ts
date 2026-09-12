import { NextRequest, NextResponse } from 'next/server';
import { loadProject } from '../../../../lib/store';
import { buildPublishPackage } from '../../../../lib/publish/package';

export const maxDuration = 300;

// GET /api/publish/package?projectId=<id>
// → 인쇄용 PDF·열람용 PDF·서지정보·검수리포트를 묶은 ZIP을 스트리밍.
//   이용권으로 잠금 해제된 프로젝트만 받을 수 있다.
export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get('projectId');
  if (!projectId) return NextResponse.json({ error: 'projectId가 필요합니다' }, { status: 400 });

  const project = await loadProject(projectId);
  if (!project) return NextResponse.json({ error: 'project 없음' }, { status: 404 });

  if (!project.publish.unlockedAt) {
    return NextResponse.json({ error: '이용권으로 잠금을 먼저 해제해 주세요' }, { status: 402 });
  }

  const pkg = await buildPublishPackage(project);
  return new NextResponse(new Uint8Array(pkg.zip), {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(pkg.fileName)}`,
      'X-Package-Missing': encodeURIComponent(pkg.missing.join(',')),
      'Cache-Control': 'no-store',
    },
  });
}
