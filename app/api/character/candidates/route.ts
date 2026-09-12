import { NextRequest, NextResponse } from 'next/server';
import { saveProject } from '../../../../lib/store';
import { loadOwnedProject } from '../../../../lib/auth/require';
import { Character } from '../../../../lib/types';
import {
  generateCharacterCandidates,
  readCharacterAsset,
  saveCharacterAsset,
} from '../../../../lib/ai/character';

export const maxDuration = 300;

// POST /api/character/candidates
// body: { projectId, description, characterId?, name? }
// → 후보 4장 생성(실루엣·체형·머리 차별화), projects/<id>/assets/ 저장,
//   프로젝트 JSON의 캐릭터에 candidates 기록.
export async function POST(req: NextRequest) {
  const { projectId, description, characterId, name } = await req.json().catch(() => ({}));
  if (!projectId || !description) {
    return NextResponse.json({ error: 'projectId, description이 필요합니다' }, { status: 400 });
  }
  const owned = await loadOwnedProject(projectId);
  if ('error' in owned) return owned.error;
  const project = owned.project;

  // 스타일이 업로드 기반이면 참고 그림을 스타일 컨디셔닝 레퍼런스로 전달
  const style = project.character.style;
  const styleRefs =
    style.source === 'upload'
      ? (await Promise.all(style.referenceImageUrls.map((u) => readCharacterAsset(projectId, u)))).filter(
          (b): b is Buffer => b !== null,
        )
      : [];

  const result = await generateCharacterCandidates(description, style, styleRefs);
  if (!result.ok) {
    return NextResponse.json({ error: '후보 생성 실패', detail: result.error }, { status: 502 });
  }

  const id = characterId || `char-${Date.now().toString(36)}`;
  const candidates = await Promise.all(
    result.candidates.map(async (c) => {
      const url = await saveCharacterAsset(projectId, `${id}-cand-${c.index}.png`, c.image);
      return { id: `${id}-cand-${c.index}`, imageUrl: url, note: c.variation };
    }),
  );

  let character = project.character.characters.find((c) => c.id === id);
  if (!character) {
    character = {
      id,
      name: name || description.slice(0, 20),
      description,
      candidates: [],
      textDNA: { fixed: [], forbidden: [] },
      confirmed: false,
    } satisfies Character;
    project.character.characters.push(character);
  }
  character.description = description;
  character.candidates = candidates;
  character.confirmed = false;
  character.referenceImageUrl = undefined;
  await saveProject(project);

  return NextResponse.json({ characterId: id, candidates, failures: result.failures });
}
