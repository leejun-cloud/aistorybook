// AI 연동 배럴 — 파트별 실제 구현의 공개 창구.
//
// PRD §5 기술 구조: "어댑터 구조로 공급자 교체 가능" — Gemini 호출은 lib/ai/image.ts
// (이미지·vision)와 lib/ai/story.ts(텍스트)에 격리되어 있고, 이 파일은 공급자 중립
// 시그니처만 재수출한다. 공급자를 바꿀 때는 그 두 파일만 교체하면 된다.

// --- 파트 1: 스토리 (구현: lib/ai/story.ts) --------------------------------

export {
  generateStoryDraft,
  runStoryQualityGate,
  regenerateScene,
  loadPatternLibrary,
  selectPatterns,
} from './story';
export type { StoryDraftInput, QualityGateResult } from './story';

// --- 파트 2: 캐릭터 · 스타일 (구현: lib/ai/character.ts) --------------------

export {
  extractStyleFromReference,
  generateCharacterCandidates,
  refineCharacter,
  buildCharacterDNA,
  saveCharacterAsset,
  readCharacterAsset,
  assetUrl,
} from './character';
export type { ExtractedStyle, CharacterDNA, CandidateImage } from './character';

export { generateImage, generateVisionText } from './image';

// --- 파트 3: 그림 생성 · 조판 (구현: lib/ai/scene.ts) -----------------------

export {
  generateSceneImageCandidates,
  generateSceneCandidatesVerified,
  selectSceneImage,
  recommendLayoutTemplate,
  getSceneJobState,
  applySceneCandidates,
} from './scene';
export type {
  SceneGenerationResult,
  VerifiedSceneResult,
  TemplateRecommendation,
  ProjectWithSceneJobs,
} from './scene';

// --- 파트 4: 조절 · 인쇄 -----------------------------------------------------
// DNA 일관성 자동 검사 (구현: lib/ai/consistency.ts)

export { checkSceneConsistency, checkCandidatesConsistency } from './consistency';
export type { ConsistencyResult, ConsistencyOutcome, CandidateConsistency } from './consistency';

// 표지 생성: lib/cover/generate.ts · 사전검사: lib/preflight/index.ts ·
// PDF 렌더: lib/render/pdf.ts · 업스케일: lib/render/upscale.ts
// (fs·playwright 의존이라 클라이언트 번들에 섞이지 않도록 여기서 재수출하지 않는다)
