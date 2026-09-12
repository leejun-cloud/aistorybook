import { NextRequest, NextResponse } from 'next/server';
import { saveProject } from '../../../../lib/store';
import { loadOwnedProject } from '../../../../lib/auth/require';
import { readCharacterAsset, refineCharacter, saveCharacterAsset } from '../../../../lib/ai/character';

export const maxDuration = 300;

// POST /api/character/refine
// body: { projectId, characterId, candidateId, instruction }
// → 확정 전 부분 수정 ("머리만 바꿔줘"). 레퍼런스 조건부 생성으로 대상 후보를
//   기반 이미지 삼아 지시된 부분만 바꾼 새 후보를 추가한다.
export async function POST(req: NextRequest) {
  const { projectId, characterId, candidateId, instruction } = await req.json().catch(() => ({}));
  if (!projectId || !characterId || !candidateId || !instruction) {
    return NextResponse.json(
      { error: 'projectId, characterId, candidateId, instruction이 필요합니다' },
      { status: 400 },
    );
  }
  const owned = await loadOwnedProject(projectId);
  if ('error' in owned) return owned.error;
  const project = owned.project;
  const character = project.character.characters.find((c) => c.id === characterId);
  if (!character) return NextResponse.json({ error: 'character 없음' }, { status: 404 });
  const base = character.candidates.find((c) => c.id === candidateId);
  if (!base) return NextResponse.json({ error: 'candidate 없음' }, { status: 404 });
  const baseImage = await readCharacterAsset(projectId, base.imageUrl);
  if (!baseImage) return NextResponse.json({ error: '후보 이미지 파일 없음' }, { status: 404 });

  const result = await refineCharacter(baseImage, instruction);
  if (!result.ok) {
    return NextResponse.json({ error: '부분 수정 실패', detail: result.error }, { status: 502 });
  }

  const refinedId = `${candidateId}-r${Date.now().toString(36)}`;
  const url = await saveCharacterAsset(projectId, `${refinedId}.png`, result.image);
  const refined = { id: refinedId, imageUrl: url, note: `부분 수정: ${instruction}` };
  character.candidates.push(refined);
  await saveProject(project);

  return NextResponse.json({ candidate: refined });
}
