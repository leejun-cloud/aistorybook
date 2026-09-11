import { NextRequest, NextResponse } from 'next/server';
import { loadProject, saveProject } from '../../../../lib/store';
import {
  generateCharacterOne,
  buildCharacterDNA,
  readCharacterAsset,
  saveCharacterAsset,
} from '../../../../lib/ai/character';

export const maxDuration = 120;

// POST /api/character/quick
// body: { projectId, characterId }
// 등장인물 일괄 생성용 — 후보 4장 → 선택 → 확정의 3단계를 1장 생성 → 즉시 확정으로
// 줄인다 (변경하고 싶으면 /api/character/candidates의 4-변주 경로를 따로 쓴다).
export async function POST(req: NextRequest) {
  const { projectId, characterId } = await req.json().catch(() => ({}));
  if (!projectId || !characterId) {
    return NextResponse.json({ error: 'projectId, characterId가 필요합니다' }, { status: 400 });
  }
  const project = await loadProject(projectId);
  if (!project) return NextResponse.json({ error: 'project 없음' }, { status: 404 });
  const character = project.character.characters.find((c) => c.id === characterId);
  if (!character) return NextResponse.json({ error: 'character 없음' }, { status: 404 });

  const style = project.character.style;
  const styleRefs =
    style.source === 'upload'
      ? (await Promise.all(style.referenceImageUrls.map((u) => readCharacterAsset(projectId, u)))).filter(
          (b): b is Buffer => b !== null,
        )
      : [];

  const imgResult = await generateCharacterOne(character.description, style, styleRefs);
  if (!imgResult.ok) {
    return NextResponse.json({ error: '캐릭터 생성 실패', detail: imgResult.error }, { status: 502 });
  }

  const url = await saveCharacterAsset(projectId, `${characterId}-quick.png`, imgResult.image);
  const dnaResult = await buildCharacterDNA(imgResult.image, character.description);
  if (!dnaResult.ok) {
    // 이미지는 남기되(다시 만들기에서 재사용 가능) 확정은 하지 않는다
    character.candidates = [{ id: `${characterId}-quick`, imageUrl: url, note: '빠른 생성' }];
    await saveProject(project);
    return NextResponse.json({ error: 'DNA 추출 실패', detail: dnaResult.error }, { status: 502 });
  }

  character.candidates = [{ id: `${characterId}-quick`, imageUrl: url, note: '빠른 생성' }];
  character.referenceImageUrl = url;
  character.textDNA = dnaResult.dna;
  character.confirmed = true;
  await saveProject(project);

  return NextResponse.json({ characterId, imageUrl: url, textDNA: dnaResult.dna });
}
