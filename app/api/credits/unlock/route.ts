import { NextRequest, NextResponse } from 'next/server';
import { loadProject, saveProject } from '../../../../lib/store';
import { consumeCreditFor, loadEntitlements } from '../../../../lib/credits';

// POST /api/credits/unlock  body: { projectId }
// → 이용권 1건을 차감하고 프로젝트 다운로드 잠금을 푼다.
//   이미 해제된 프로젝트는 다시 차감하지 않는다 (평생 재다운로드).
export async function POST(req: NextRequest) {
  const { projectId } = await req.json().catch(() => ({}));
  if (!projectId) return NextResponse.json({ error: 'projectId가 필요합니다' }, { status: 400 });

  const project = await loadProject(projectId);
  if (!project) return NextResponse.json({ error: 'project 없음' }, { status: 404 });

  if (project.publish.unlockedAt) {
    const e = await loadEntitlements();
    return NextResponse.json({ status: 'already-unlocked', unlockedAt: project.publish.unlockedAt, credits: e.credits });
  }

  const result = await consumeCreditFor(projectId);
  if (!result.ok) {
    return NextResponse.json({ error: result.reason ?? '이용권이 부족합니다', credits: result.remaining }, { status: 402 });
  }

  project.publish.unlockedAt = new Date().toISOString();
  await saveProject(project);
  return NextResponse.json({ status: 'unlocked', unlockedAt: project.publish.unlockedAt, credits: result.remaining });
}
