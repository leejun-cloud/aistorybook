import { NextRequest, NextResponse } from 'next/server';
import { saveProject } from '../../../../lib/store';
import { loadOwnedProject } from '../../../../lib/auth/require';
import { buildCharacterDNA, readCharacterAsset } from '../../../../lib/ai/character';

export const maxDuration = 300;

// POST /api/character/confirm
// body: { projectId, characterId, candidateId }
// → 선택한 후보를 공식 레퍼런스로 확정하고, 이미지에서 텍스트 DNA
//   (고정 요소 / 반복 소품 / 금지 요소)를 추출해 프로젝트 JSON에 저장한다.
export async function POST(req: NextRequest) {
  const { projectId, characterId, candidateId } = await req.json().catch(() => ({}));
  if (!projectId || !characterId || !candidateId) {
    return NextResponse.json({ error: 'projectId, characterId, candidateId가 필요합니다' }, { status: 400 });
  }
  const owned = await loadOwnedProject(projectId);
  if ('error' in owned) return owned.error;
  const project = owned.project;
  const character = project.character.characters.find((c) => c.id === characterId);
  if (!character) return NextResponse.json({ error: 'character 없음' }, { status: 404 });
  const chosen = character.candidates.find((c) => c.id === candidateId);
  if (!chosen) return NextResponse.json({ error: 'candidate 없음' }, { status: 404 });
  const image = await readCharacterAsset(projectId, chosen.imageUrl);
  if (!image) return NextResponse.json({ error: '후보 이미지 파일 없음' }, { status: 404 });

  const result = await buildCharacterDNA(image, character.description);
  if (!result.ok) {
    return NextResponse.json({ error: 'DNA 추출 실패', detail: result.error }, { status: 502 });
  }

  character.referenceImageUrl = chosen.imageUrl;
  character.textDNA = result.dna; // CharacterDNA ⊃ CharacterTextDNA (recurringProps 포함 저장)
  character.confirmed = true;
  await saveProject(project);

  return NextResponse.json({ characterId, referenceImageUrl: chosen.imageUrl, textDNA: result.dna });
}
