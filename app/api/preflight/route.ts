import { NextRequest, NextResponse } from 'next/server';
import { loadProject, saveProject } from '../../../lib/store';
import { runPreflight } from '../../../lib/preflight';

export const maxDuration = 300;

// POST /api/preflight
// body: { projectId, profileId? }
// → 사전검사 실행 후 결과를 project.publish.preflight에 기록.
export async function POST(req: NextRequest) {
  const { projectId, profileId } = await req.json().catch(() => ({}));
  if (!projectId) return NextResponse.json({ error: 'projectId가 필요합니다' }, { status: 400 });
  const project = loadProject(projectId);
  if (!project) return NextResponse.json({ error: 'project 없음' }, { status: 404 });

  try {
    const result = await runPreflight(project, { profileId });
    project.publish.preflight = result;
    saveProject(project);
    return NextResponse.json({ preflight: result });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
