// 표지 이미지 생성 — 3방향(캐릭터 중심 / 장면 / 상징), PRD §4.3.
//
// 파트 2의 레퍼런스 조건부 생성 방식을 재사용한다:
//   - 확정 캐릭터 레퍼런스 이미지를 함께 전달 + consistencyPrefix(DNA fixed/recurringProps)
//   - 업로드 스타일이면 스타일 참고 이미지도 전달 + STYLE_REF_ONLY_CLAUSE (의상 누출 방지)
//   - 제목·작가명은 이미지에 넣지 않는다 (NO_TEXT_IN_IMAGE_PREFIX) — 텍스트는 HTML/SVG (wrap.ts)

import type { Character, CharacterTextDNA, CoverOption, Project } from '../types';
import { generateImage, type GeminiError } from '../ai/image';
import { readCharacterAsset, saveCharacterAsset } from '../ai/character';
import {
  NO_TEXT_IN_IMAGE_PREFIX,
  STYLE_REF_ONLY_CLAUSE,
  consistencyPrefix,
  styleClause,
} from '../prompts/character';

export type CoverConcept = CoverOption['concept'];

const CONCEPT_DIRECTIONS: Record<CoverConcept, string> = {
  character:
    'Cover direction 1 — CHARACTER-CENTERED: the main character large and front-and-center, ' +
    'making warm eye contact with the reader, minimal simple background.',
  scene:
    'Cover direction 2 — KEY SCENE: the main character inside an evocative moment from the story, ' +
    'environment telling the story around them, character at 30-45% of the frame.',
  symbol:
    'Cover direction 3 — SYMBOLIC: a poetic composition built around the story\'s key object or motif, ' +
    'the character small or partially present, strong single visual idea.',
};

function confirmedCharacters(project: Project): Character[] {
  return project.character.characters.filter((c) => c.confirmed && c.referenceImageUrl);
}

function coverPrompt(project: Project, concept: CoverConcept, characters: Character[]): string {
  const fixedElements = characters.flatMap((c) => {
    const dna = c.textDNA as CharacterTextDNA & { recurringProps?: string[] };
    return [...dna.fixed, ...(dna.recurringProps ?? [])];
  });
  const storyHint =
    project.story.scenes.length > 0
      ? `Story essence: ${project.story.scenes[0].text} ... ${project.story.scenes[project.story.scenes.length - 1]?.text ?? ''}`
      : '';
  const hasStyleRefs = project.character.style.source === 'upload';
  return (
    NO_TEXT_IN_IMAGE_PREFIX +
    (hasStyleRefs ? STYLE_REF_ONLY_CLAUSE : '') +
    consistencyPrefix(fixedElements) +
    `Children's picture-book FRONT COVER illustration (portrait orientation feel, but compose so the ` +
    `center-safe area works when cropped). ${CONCEPT_DIRECTIONS[concept]} ` +
    `Mood: ${project.story.desiredMood || 'warm and gentle'}. ${storyHint} ` +
    // 제목 자리: 상단 1/4은 단순하게 — 제목은 HTML 텍스트로 얹는다 (PRD §4.3 그림/글자 분리)
    `Keep the top quarter of the image visually calm and simple with soft low-detail background, ` +
    `because the book title will be typeset over that area later. ` +
    `Rich color reaching every edge (full-bleed printing).` +
    styleClause(project.character.style)
  );
}

export interface CoverGenerationResult {
  ok: boolean;
  options: CoverOption[];
  failures: { concept: CoverConcept; error: GeminiError }[];
}

/**
 * 표지 후보 3방향을 생성해 assets에 저장하고 project.publish.coverOptions를 갱신한다.
 * (저장 saveProject는 호출자 책임 — scene.ts와 같은 계약)
 * concepts를 지정하면 해당 방향만 생성한다 (재생성·호출 절약용).
 */
export async function generateCoverOptions(
  project: Project,
  concepts: CoverConcept[] = ['character', 'scene', 'symbol'],
): Promise<CoverGenerationResult> {
  const characters = confirmedCharacters(project);

  // 레퍼런스: 캐릭터 확정 레퍼런스 먼저, 업로드 스타일 참고 뒤에 (파트 3과 동일 순서)
  const refs: Buffer[] = [];
  for (const c of characters) {
    const buf = c.referenceImageUrl ? await readCharacterAsset(project.id, c.referenceImageUrl) : null;
    if (buf) refs.push(buf);
  }
  if (project.character.style.source === 'upload') {
    for (const url of project.character.style.referenceImageUrls) {
      const buf = await readCharacterAsset(project.id, url);
      if (buf) refs.push(buf);
    }
  }

  const results = await Promise.all(
    concepts.map((concept) =>
      generateImage(coverPrompt(project, concept, characters), refs.length > 0 ? refs : undefined),
    ),
  );

  const failures: { concept: CoverConcept; error: GeminiError }[] = [];
  const options: CoverOption[] = [];
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const concept = concepts[i];
    if (!r.ok) {
      failures.push({ concept, error: r.error });
      continue;
    }
    const url = await saveCharacterAsset(project.id, `cover-${concept}.png`, r.image.data);
    const option: CoverOption = {
      id: `cover-${concept}`,
      concept,
      imageUrl: url,
      title: project.title,
    };
    options.push(option);
    // publish.coverOptions 갱신 (같은 concept 항목 교체, 없으면 추가)
    const idx = project.publish.coverOptions.findIndex((o) => o.concept === concept);
    if (idx >= 0) project.publish.coverOptions[idx] = { ...project.publish.coverOptions[idx], ...option };
    else project.publish.coverOptions.push(option);
  }

  return { ok: options.length > 0, options, failures };
}
