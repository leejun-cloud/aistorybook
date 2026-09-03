import { NextRequest, NextResponse } from 'next/server';
import { loadProject, saveProject } from '../../../../lib/store';
import { regenerateScene } from '../../../../lib/ai/story';

// POST /api/story/scene
// body: { projectId, sceneNumber, note }
// "이 장면 다시" — 사용자 지시(note)를 반영해 해당 장면만 재생성한다.
// textSource === 'user'인 장면은 덮어쓰지 않는다 (원문 보존 원칙, PRD §1.2).
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const { projectId, sceneNumber, note } = body ?? {};
  if (!projectId || typeof sceneNumber !== 'number' || !note) {
    return NextResponse.json({ error: 'projectId, sceneNumber, note 필수' }, { status: 400 });
  }

  const project = loadProject(projectId);
  if (!project) return NextResponse.json({ error: 'project 없음' }, { status: 404 });

  const idx = project.story.scenes.findIndex((s) => s.sceneNumber === sceneNumber);
  if (idx < 0) return NextResponse.json({ error: `장면 ${sceneNumber} 없음` }, { status: 404 });

  const scene = project.story.scenes[idx];
  if (scene.textSource === 'user') {
    return NextResponse.json(
      { error: '사용자가 직접 쓴 장면은 AI가 덮어쓰지 않습니다.', scene },
      { status: 409 },
    );
  }

  try {
    const revised = await regenerateScene(scene, note, project.story.scenes);
    project.story.scenes[idx] = revised;
    saveProject(project);
    return NextResponse.json({ scene: revised });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
