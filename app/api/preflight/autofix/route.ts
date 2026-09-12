import { NextRequest, NextResponse } from 'next/server';
import { saveProject } from '../../../../lib/store';
import { loadOwnedProject } from '../../../../lib/auth/require';
import { runAutofix } from '../../../../lib/preflight/autofix';
import { runPreflight } from '../../../../lib/preflight';

export const maxDuration = 300;

// POST /api/preflight/autofix
// body: { projectId, profileId? }
// → 자동 수정 가능한 항목(글 넘침·저해상도)을 처리하고 사전검사를 다시 실행한다.
export async function POST(req: NextRequest) {
  const { projectId, profileId } = await req.json().catch(() => ({}));
  if (!projectId) return NextResponse.json({ error: 'projectId가 필요합니다' }, { status: 400 });
  const owned = await loadOwnedProject(projectId);
  if ('error' in owned) return owned.error;
  const project = owned.project;

  try {
    const fix = await runAutofix(project);
    // 수정 결과를 반영한 점수를 바로 보여주기 위해 재검사까지 한 번에 돌린다
    const preflight = await runPreflight(project, { profileId });
    project.publish.preflight = preflight;
    await saveProject(project);
    return NextResponse.json({ changes: fix.changes, remaining: fix.remaining, preflight });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
