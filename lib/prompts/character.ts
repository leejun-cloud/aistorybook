// 파트 2(캐릭터·스타일) 프롬프트 모음.
//
// 근거:
//   - validation/REPORT.md — "같은 얼굴/의상/스타일 유지" 고정 접두어가 일관성에 유효함을 실측
//   - research/storybloom-analysis.md [흡수] 항목:
//       · continuityPolicy: 매 생성은 이전 결과가 아니라 고정 바이블(레퍼런스+DNA)에서 독립 생성
//       · 소품 연속성 락(RECURRING PROP LOCK)
//       · 레퍼런스 우선순위 해소: 이미지 레퍼런스 vs 텍스트 락 충돌 시 텍스트 락이 승자
//   - PRD §3.1 / v1.0 §8.7.3 — 이미지 안 글자·워터마크 금지 (모든 프롬프트 공통)
//   - PRD §5.7 — 저작권 원칙: 원작 캐릭터·고유 구도는 서술에 포함 금지

import type { StyleSpec } from '../types';

/** PRD §3.1 — 모든 이미지 생성 프롬프트에 반드시 포함하는 글자 금지 접두어. */
export const NO_TEXT_IN_IMAGE_PREFIX =
  'Do not render any text, letters, words, numbers, captions, logos, signatures, or watermarks anywhere in the image. ';

/**
 * storybloom continuityPolicy 흡수: 레퍼런스 이미지가 붙는 모든 생성에 쓰는 고정 접두어.
 * validation/gen.mjs에서 검증된 "같은 얼굴/의상/스타일 유지" 문구의 일반화 버전.
 */
export function consistencyPrefix(fixedElements: string[]): string {
  const fixed = fixedElements.length > 0 ? ` Fixed elements that must not change: ${fixedElements.join('; ')}.` : '';
  return (
    'Keep the exact same character as in the reference image: same face shape, same hairstyle, ' +
    'same outfit and colors, same body proportions, same illustration style.' +
    fixed +
    ' Treat this as an independent generation from the same fixed character reference, never a continuation of any previous image.' +
    ' If this instruction conflicts with the reference image, this written lock wins. '
  );
}

/** 스타일 서술이 있으면 프롬프트 뒤에 붙일 스타일 절. */
export function styleClause(style: StyleSpec): string {
  if (!style.description) return '';
  return ` Illustration style: ${style.description}`;
}

// ---------------------------------------------------------------------------
// 1. 스타일 분석 (extractStyleFromReference)
// ---------------------------------------------------------------------------

export const STYLE_EXTRACTION_PROMPT = `You are an art-style analyst for a children's picture-book studio.
Look at the attached reference illustration(s) and extract ONLY the visual style, as JSON.

COPYRIGHT RULES (mandatory):
- Describe only reusable style qualities: medium/materials, line quality, color palette, texture, background density.
- NEVER mention or describe the original characters, their names, the specific composition, story, title, logo, or any element that would identify the original work.
- The description must be generic enough that it could apply to a brand-new illustration with completely different characters.

Return only valid JSON (no markdown fences):
{
  "material": "medium and materials, e.g. soft watercolor with gouache accents",
  "line": "line quality, e.g. gentle pencil outlines, loose and sketchy",
  "palette": "dominant colors and overall temperature",
  "texture": "surface texture, e.g. grainy paper texture, dry-brush edges",
  "backgroundDensity": "how detailed/dense backgrounds are, e.g. sparse washes with negative space",
  "summary": "one English sentence combining all of the above, usable directly inside an image-generation prompt"
}`;

// ---------------------------------------------------------------------------
// 2. 캐릭터 후보 4장 (generateCharacterCandidates)
// ---------------------------------------------------------------------------

/**
 * PRD §2.2 / v1.0 §8.6.3 — 후보 4장은 실루엣·체형·머리를 의도적으로 차별화한다.
 * 배경·구도·스타일은 같게 유지해 비교가 쉽도록 한다.
 */
export const CANDIDATE_VARIATIONS: readonly string[] = [
  'Variation A — compact and round: a small, rounded silhouette, chubby body, short rounded head shape with small ears/hair volume.',
  'Variation B — tall and slender: an elongated silhouette, slim lanky body, narrow head with longer ears/hair giving a vertical outline.',
  'Variation C — sturdy and wide: a broad, stable silhouette, stocky strong body, wide head with thick ears/hair mass.',
  'Variation D — soft and droopy: an asymmetric relaxed silhouette, soft pear-shaped body, tilted head with drooping ears/wavy hair.',
];

/**
 * 저작권 원칙(PRD §2.1/§5.7): 스타일 참고 이미지가 레퍼런스로 붙을 때, 그 안의
 * 캐릭터·의상·소품·구도가 새 캐릭터로 새어 들어오는 것을 막는 절.
 * (실측에서 이 절 없이 생성하면 참고 그림 속 캐릭터의 의상·소품이 그대로 복제됨을 확인)
 */
export const STYLE_REF_ONLY_CLAUSE =
  'The attached reference image(s) are for ART STYLE ONLY (medium, line quality, palette, texture, background density). ' +
  'Do NOT copy or reuse any character, creature, outfit, clothing, accessory, prop, or composition that appears in them — ' +
  'design a completely new character from the written description alone. ';

export function candidatePrompt(
  description: string,
  style: StyleSpec,
  variationIndex: number,
  hasStyleReferenceImages = false,
): string {
  const variation = CANDIDATE_VARIATIONS[variationIndex] ?? CANDIDATE_VARIATIONS[0];
  return (
    NO_TEXT_IN_IMAGE_PREFIX +
    (hasStyleReferenceImages ? STYLE_REF_ONLY_CLAUSE : '') +
    `Children's picture-book character design candidate. Character description: ${description}. ` +
    `${variation} ` +
    'Full body, standing, facing slightly toward the viewer, neutral friendly pose, plain solid off-white background, ' +
    'centered composition, soft even lighting. This is a character design sheet image, so the character fills most of the frame.' +
    styleClause(style)
  );
}

// ---------------------------------------------------------------------------
// 3. 부분 수정 (refineCharacter)
// ---------------------------------------------------------------------------

export function refinePrompt(instruction: string): string {
  return (
    NO_TEXT_IN_IMAGE_PREFIX +
    'Edit the character in the reference image. Change ONLY the following, and keep everything else ' +
    '(face, body proportions, outfit, colors, pose, background, illustration style) exactly identical to the reference: ' +
    instruction
  );
}

// ---------------------------------------------------------------------------
// 4. 텍스트 DNA 추출 (buildCharacterDNA)
// ---------------------------------------------------------------------------

/**
 * PRD §2.2 — 확정 이미지에서 고정 요소(머리·의상·소품)와 금지 요소를 추출.
 * storybloom 소품 연속성 락 반영: 반복 등장 소품(recurringProps)을 명시 필드로 분리 —
 * "한 번 등장한 핵심 소품은 명시적 서사 사건 없이 디자인이 바뀌거나 사라지면 안 된다."
 */
export function dnaExtractionPrompt(description: string): string {
  return `You are building a character continuity lock ("text DNA") for a children's picture book.
The attached image is the CONFIRMED official reference for this character. Character concept: ${description}.

Extract, as JSON, the visual elements that must stay identical in every future scene, plus elements that must never appear. Be concrete about colors, shapes, and counts (e.g. "sky-blue overalls with two yellow buttons", not "cute clothes").

Return only valid JSON (no markdown fences):
{
  "fixed": ["face/head shape and features", "hairstyle or ear shape and length", "exact outfit with colors", "body proportions", "..."],
  "recurringProps": ["carried or worn props that must keep the same design in every scene, e.g. a red backpack — empty array if none"],
  "forbidden": ["elements that must never appear on this character, e.g. different outfit colors, glasses, extra accessories, realistic photo style"]
}`;
}
