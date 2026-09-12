import { NextRequest, NextResponse } from 'next/server';
import { saveProject } from '../../../lib/store';
import { loadOwnedProject } from '../../../lib/auth/require';
import { runPreflight } from '../../../lib/preflight';

export const maxDuration = 300;

// POST /api/preflight
// body: { projectId, profileId? }
// → 사전검사 실행 후 결과를 project.publish.preflight에 기록.
export async function POST(req: NextRequest) {
  const { projectId, profileId } = await req.json().catch(() => ({}));
  if (!projectId) return NextResponse.json({ error: 'projectId가 필요합니다' }, { status: 400 });
  const owned = await loadOwnedProject(projectId);
  if ('error' in owned) return owned.error;
  const project = owned.project;

  try {
    const result = await runPreflight(project, { profileId });
    project.publish.preflight = result;
    await saveProject(project);
    return NextResponse.json({ preflight: result });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
