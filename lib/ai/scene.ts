// 파트 3(그림 생성·조판) AI 로직.
//
//   generateSceneImageCandidates  장면별 후보 2장 생성 (레퍼런스+스타일 컨디셔닝, PRD §3.1)
//   recommendLayoutTemplate       글자 수·visualFocus·beat 기준 템플릿 추천 (PRD §3.2)
//
// 프롬프트 조립 순서(파트 2 개발자 지침):
//   NO_TEXT_IN_IMAGE_PREFIX
//   + consistencyPrefix(character.textDNA.fixed + recurringProps)
//   + 장면 서술
//   + styleClause(style)
//
// 장면별 상태(imageStatus, retryCount)는 storybloom 패턴(research/storybloom-analysis.md §4)을
// 축약해 프로젝트 JSON에 기록한다. 한 장면 실패가 전체를 막지 않도록 이 모듈의 함수는
// 장면 하나만 다루고, 실패 시에도 프로젝트 상태를 남기고 구조화된 오류를 반환한다.

import type {
  Character,
  CharacterTextDNA,
  LayoutTemplate,
  PageLayout,
  Project,
  Scene,
  SceneImageCandidate,
} from '../types';
import { generateImage, generateVisionText, parseJsonLoose, type GeminiError } from './image';
import { readCharacterAsset, saveCharacterAsset } from './character';
import {
  checkCandidatesConsistency,
  type CandidateConsistency,
  type ConsistencyResult,
} from './consistency';
import { NO_TEXT_IN_IMAGE_PREFIX, consistencyPrefix, styleClause } from '../prompts/character';
import { familyOf } from '../render/templates';

// ---------------------------------------------------------------------------
// 장면별 잡 상태 (storybloom StoryPage.imageStatus/imageRetryCount 축약판)
// ---------------------------------------------------------------------------

export interface SceneImageJobState {
  imageStatus: 'idle' | 'queued' | 'generating' | 'ready' | 'failed';
  retryCount: number;
  lastError?: string;
  updatedAt: string;
}

/** lib/types.ts를 바꾸지 않고 프로젝트 JSON에 잡 상태를 덧붙이는 확장형. */
export type ProjectWithSceneJobs = Project & {
  sceneImageJobs?: Record<string, SceneImageJobState>;
};

function jobKey(sceneNumber: number): string {
  return `scene-${sceneNumber}`;
}

function setJobState(
  project: ProjectWithSceneJobs,
  sceneNumber: number,
  patch: Partial<SceneImageJobState>,
): SceneImageJobState {
  const jobs = (project.sceneImageJobs ??= {});
  const prev = jobs[jobKey(sceneNumber)] ?? { imageStatus: 'idle' as const, retryCount: 0, updatedAt: '' };
  const next: SceneImageJobState = { ...prev, ...patch, updatedAt: new Date().toISOString() };
  jobs[jobKey(sceneNumber)] = next;
  return next;
}

export function getSceneJobState(project: ProjectWithSceneJobs, sceneNumber: number): SceneImageJobState {
  return (
    project.sceneImageJobs?.[jobKey(sceneNumber)] ?? { imageStatus: 'idle', retryCount: 0, updatedAt: '' }
  );
}

// ---------------------------------------------------------------------------
// 장면 프롬프트 조립
// ---------------------------------------------------------------------------

const TEXT_AREA_LABELS: Record<Scene['preferredTextArea'], string> = {
  'upper-left': 'upper-left',
  'upper-center': 'upper-center',
  'upper-right': 'upper-right',
  'center-left': 'center-left',
  center: 'center',
  'center-right': 'center-right',
  'lower-left': 'lower-left',
  'lower-center': 'lower-center',
  'lower-right': 'lower-right',
};

/** 후보 2장은 같은 장면을 서로 다른 구도로 — 비교 선택이 의미 있도록 (v1.0 §14 후보 원칙). */
const CANDIDATE_COMPOSITIONS: readonly string[] = [
  'Composition A: a wide storytelling shot showing the full setting around the character.',
  'Composition B: a closer three-quarter shot, nearer to the character but still showing the scene action.',
];

/** 장면 안에 등장하는 확정 캐릭터들을 찾는다. id가 안 맞으면 확정 캐릭터 전체로 폴백. */
function resolveSceneCharacters(project: Project, scene: Scene): Character[] {
  const confirmed = project.character.characters.filter((c) => c.confirmed && c.referenceImageUrl);
  const matched = confirmed.filter((c) => scene.characters.includes(c.id));
  return matched.length > 0 ? matched : confirmed;
}

export interface ScenePromptOptions {
  /** refs 마지막에 이 책의 완성 페이지(스타일 앵커)가 붙었는지 — 장면 간 스타일 드리프트 방지 */
  hasStyleAnchor?: boolean;
  /** 이전 라운드의 DNA 위반 사유 — negative 지시로 재생성에 반영 */
  avoidNotes?: string[];
}

export function buildScenePrompt(
  project: Project,
  scene: Scene,
  characters: Character[],
  compositionIndex: number,
  opts: ScenePromptOptions = {},
): string {
  // consistencyPrefix에는 등장 캐릭터의 fixed + recurringProps를 합쳐 넣는다.
  const fixedElements = characters.flatMap((c) => {
    const dna = c.textDNA as CharacterTextDNA & { recurringProps?: string[] };
    return [...dna.fixed, ...(dna.recurringProps ?? [])];
  });

  const extras = scene.characters.filter((id) => !characters.some((c) => c.id === id));
  const sceneDescription =
    `Children's picture-book scene illustration. ` +
    `Scene: ${scene.text} ` +
    `Setting: ${scene.location}. Emotion of the scene: ${scene.emotion}. ` +
    `Visual focus: ${scene.visualFocus}. ` +
    (extras.length > 0
      ? `Background characters may appear only as small distant supporting figures: ${extras.join(', ')}. `
      : '') +
    // storybloom SHOT_PLAN 흡수: 정면 흉상 반복 방지 + 25~45% 프레임 점유
    `This is a story scene, not a character portrait: the main character changes pose and placement to match the moment ` +
    `and takes roughly 25-45% of the frame so the setting can tell the story. ` +
    `${CANDIDATE_COMPOSITIONS[compositionIndex] ?? ''} ` +
    // 조판 예약 영역: 글이 들어갈 곳은 배경을 단순하게 (PRD §3.1)
    `Layout reservation: keep the ${TEXT_AREA_LABELS[scene.preferredTextArea]} area of the image visually simple and ` +
    `uncluttered — a calm, low-detail background region with soft colors, no important objects and no character there, ` +
    `because the book text will be placed over that area later. ` +
    `Square 1:1 composition with color reaching every edge (full-bleed printing).`;

  // 스타일 앵커: 이미 확정된 페이지를 refs 마지막에 붙였을 때의 지시 (드리프트 방지)
  const anchorClause = opts.hasStyleAnchor
    ? ` The LAST reference image is a finished page from this same picture book: match its exact painting technique, color palette, lighting and rendering style so all pages look like one book.`
    : '';

  // 이전 라운드 DNA 위반의 negative 지시 (일관성 자동 교정 루프)
  const avoidClause =
    opts.avoidNotes && opts.avoidNotes.length > 0
      ? ` Previous attempts violated the character lock. Strictly avoid repeating these mistakes: ${opts.avoidNotes.join('; ')}.`
      : '';

  return (
    NO_TEXT_IN_IMAGE_PREFIX +
    consistencyPrefix(fixedElements) +
    avoidClause +
    sceneDescription +
    anchorClause +
    styleClause(project.character.style)
  );
}

// ---------------------------------------------------------------------------
// 후보 2장 생성 (PRD §3.1)
// ---------------------------------------------------------------------------

export interface SceneGenerationResult {
  ok: boolean;
  sceneNumber: number;
  candidates: SceneImageCandidate[];
  failures: { index: number; error: GeminiError }[];
  jobState: SceneImageJobState;
}

export interface SceneGenerationOptions extends ScenePromptOptions {
  /** 재생성 라운드용 에셋 파일명 접미사 (예: '-r2') — 이전 라운드 후보를 덮어쓰지 않기 위함 */
  assetSuffix?: string;
}

/** 이미 확정된(슬롯에 선택된) 가장 앞 페이지의 이미지 — 후속 장면의 스타일 앵커. */
async function findStyleAnchor(project: Project, currentSceneNumber: number): Promise<Buffer | null> {
  const pages = project.layout.pages
    .filter((p) => p.sceneNumber !== currentSceneNumber)
    .sort((a, b) => a.sceneNumber - b.sceneNumber);
  for (const page of pages) {
    const url = page.slots.find((s) => s.slotId === 'image-1')?.imageUrl;
    if (!url) continue;
    const buf = await readCharacterAsset(project.id, url);
    if (buf) return buf;
  }
  return null;
}

/**
 * 장면 이미지 생성에 쓸 레퍼런스 묶음 — 캐릭터 확정 레퍼런스 → 스타일 참고 이미지
 * → 스타일 앵커(확정 페이지) 순. generateSceneImageCandidates/generateSceneDraft가 공유.
 */
async function buildSceneRefs(
  project: Project,
  scene: Scene,
  characters: Character[],
): Promise<{ refs: Buffer[]; hasStyleAnchor: boolean }> {
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
  const anchor = await findStyleAnchor(project, scene.sceneNumber);
  if (anchor) refs.push(anchor);
  return { refs, hasStyleAnchor: !!anchor };
}

/**
 * 장면 하나의 이미지 후보 2장을 생성한다.
 * - 캐릭터 레퍼런스 + 스타일 참고 이미지를 함께 전달 (0단계 검증 방식)
 * - 이미 확정된 페이지가 있으면 그 이미지를 스타일 앵커로 refs 마지막에 추가
 *   (장면 간 스타일 드리프트 방지 — 특히 라이브러리 스타일처럼 참고 그림이 없을 때)
 * - 후보는 각각 독립 시도 — 1장만 성공해도 ok
 * - 결과(후보 목록·imageStatus·retryCount)를 project(mutable)에 기록한다.
 *   저장(saveProject)은 호출자 책임.
 */
export async function generateSceneImageCandidates(
  project: ProjectWithSceneJobs,
  scene: Scene,
  opts: SceneGenerationOptions = {},
): Promise<SceneGenerationResult> {
  const prevState = getSceneJobState(project, scene.sceneNumber);
  const isRetry = prevState.imageStatus === 'failed' || prevState.imageStatus === 'ready';
  setJobState(project, scene.sceneNumber, {
    imageStatus: 'generating',
    retryCount: isRetry ? prevState.retryCount + 1 : prevState.retryCount,
  });
  syncPageSlot(project, scene.sceneNumber, { imageStatus: 'generating' });

  const characters = resolveSceneCharacters(project, scene);

  // 레퍼런스: 캐릭터 확정 레퍼런스(들) 먼저, 스타일 참고 이미지, 스타일 앵커(확정 페이지) 순.
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
  const anchor = await findStyleAnchor(project, scene.sceneNumber);
  if (anchor) refs.push(anchor);

  const promptOpts: ScenePromptOptions = { ...opts, hasStyleAnchor: !!anchor };
  const suffix = opts.assetSuffix ?? '';
  const results = await Promise.all(
    CANDIDATE_COMPOSITIONS.map((_, i) =>
      generateImage(buildScenePrompt(project, scene, characters, i, promptOpts), refs.length > 0 ? refs : undefined),
    ),
  );

  const candidates: SceneImageCandidate[] = [];
  const failures: { index: number; error: GeminiError }[] = [];
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.ok) {
      const name = `scene-${scene.sceneNumber}-cand-${i}${suffix}.png`;
      const url = await saveCharacterAsset(project.id, name, r.image.data);
      candidates.push({ id: `scene-${scene.sceneNumber}-cand-${i}${suffix}`, url, upscaled: false });
    } else {
      failures.push({ index: i, error: r.error });
    }
  }

  const ok = candidates.length > 0;
  const jobState = setJobState(project, scene.sceneNumber, {
    imageStatus: ok ? 'ready' : 'failed',
    lastError: ok ? undefined : failures[0]?.error.message,
  });
  syncPageSlot(project, scene.sceneNumber, {
    imageStatus: ok ? 'ready' : 'failed',
    candidates,
  });

  return { ok, sceneNumber: scene.sceneNumber, candidates, failures, jobState };
}

/**
 * 장면 초안 이미지 1장을 빠르게 생성해 즉시 확정한다 — 후보 비교·DNA 검증 없음.
 * 파트3 진입 시 전 페이지를 일괄로 빠르게 채우는 용도. 텍스트 슬롯도 함께 채워
 * 바로 미리보기로 보일 수 있게 한다. 나중에 마음에 들면 그대로, 아니면
 * generateSceneCandidatesVerified로 개별/일괄 고화질화한다.
 */
export async function generateSceneDraft(
  project: ProjectWithSceneJobs,
  scene: Scene,
): Promise<{ ok: true; sceneNumber: number; imageUrl: string } | { ok: false; sceneNumber: number; error: string }> {
  syncPageSlot(project, scene.sceneNumber, { imageStatus: 'generating' });
  setJobState(project, scene.sceneNumber, { imageStatus: 'generating' });

  const characters = resolveSceneCharacters(project, scene);
  const { refs, hasStyleAnchor } = await buildSceneRefs(project, scene, characters);
  const prompt = buildScenePrompt(project, scene, characters, 0, { hasStyleAnchor });
  const res = await generateImage(prompt, refs.length > 0 ? refs : undefined);

  if (!res.ok) {
    setJobState(project, scene.sceneNumber, { imageStatus: 'failed', lastError: res.error.message });
    syncPageSlot(project, scene.sceneNumber, { imageStatus: 'failed' });
    return { ok: false, sceneNumber: scene.sceneNumber, error: res.error.message };
  }

  const name = `scene-${scene.sceneNumber}-draft.png`;
  const url = await saveCharacterAsset(project.id, name, res.image.data);
  const candidate: SceneImageCandidate = { id: `scene-${scene.sceneNumber}-draft`, url, upscaled: false };
  setJobState(project, scene.sceneNumber, { imageStatus: 'ready' });
  syncPageSlot(project, scene.sceneNumber, {
    imageStatus: 'ready',
    candidates: [candidate],
    imageUrl: url,
    imageQuality: 'draft',
  });
  const page = project.layout.pages.find((p) => p.sceneNumber === scene.sceneNumber);
  const textSlot = page?.slots.find((s) => s.slotId === 'text-1');
  if (textSlot) textSlot.text = scene.text;
  else page?.slots.push({ slotId: 'text-1', text: scene.text });

  return { ok: true, sceneNumber: scene.sceneNumber, imageUrl: url };
}

/** layout.pages에서 해당 장면의 이미지 슬롯을 찾아 갱신한다. 페이지가 없으면 만든다. */
function syncPageSlot(
  project: Project,
  sceneNumber: number,
  patch: {
    imageStatus?: PageLayout['slots'][number]['imageStatus'];
    candidates?: SceneImageCandidate[];
    imageUrl?: string;
    imageQuality?: PageLayout['slots'][number]['imageQuality'];
  },
): void {
  let page = project.layout.pages.find((p) => p.sceneNumber === sceneNumber);
  if (!page) {
    page = {
      sceneNumber,
      templateId: project.layout.templates[0]?.id ?? 'L01',
      slots: [{ slotId: 'image-1', imageStatus: 'idle', candidates: [] }, { slotId: 'text-1' }],
    };
    project.layout.pages.push(page);
    project.layout.pages.sort((a, b) => a.sceneNumber - b.sceneNumber);
  }
  let slot = page.slots.find((s) => s.slotId === 'image-1');
  if (!slot) {
    slot = { slotId: 'image-1' };
    page.slots.unshift(slot);
  }
  if (patch.imageStatus !== undefined) slot.imageStatus = patch.imageStatus;
  if (patch.candidates !== undefined) slot.candidates = patch.candidates;
  if (patch.imageUrl !== undefined) slot.imageUrl = patch.imageUrl;
  if (patch.imageQuality !== undefined) slot.imageQuality = patch.imageQuality;
}

// ---------------------------------------------------------------------------
// 일관성 검증 루프 — 생성 → DNA 검사 → 미달 시 위반 사유를 negative로 재생성
// (파트 4 §1의 자동 검사를 "감지"에서 "교정"으로 승격. 라우트·E2E가 공유)
// ---------------------------------------------------------------------------

/** 이 점수(0~100) 이상인 후보가 1장이라도 있으면 통과 */
const CONSISTENCY_PASS_SCORE = 80;
/** 최초 1회 + 재생성 최대 2회 */
const MAX_GENERATION_ROUNDS = 3;

export interface VerifiedSceneResult extends SceneGenerationResult {
  consistency: CandidateConsistency[];
  /** 실행된 생성 라운드 수 (1 = 재생성 없음) */
  rounds: number;
  /** 최고 후보의 DNA 점수. null = 검사 자체가 실패해 판단 불가 */
  bestScore: number | null;
}

function collectViolationNotes(consistency: CandidateConsistency[]): string[] {
  const notes = new Set<string>();
  for (const c of consistency) {
    if (!c.result.ok) continue;
    for (const item of c.result.items) {
      if (item.ok) continue;
      notes.add(item.note ? `${item.element} (${item.note})` : item.element);
    }
  }
  return [...notes].slice(0, 6);
}

/** 페이지 슬롯의 후보 목록을 지정한 세트로 되돌린다 (best 라운드 복원용). */
export function applySceneCandidates(
  project: Project,
  sceneNumber: number,
  candidates: SceneImageCandidate[],
): void {
  syncPageSlot(project, sceneNumber, { imageStatus: 'ready', candidates });
}

/**
 * 후보 생성 + DNA 일관성 자동 교정 루프.
 * 모든 후보가 CONSISTENCY_PASS_SCORE 미만이면 위반 사유를 negative 프롬프트로
 * 넣어 재생성한다 (최대 2회 추가). 라운드 중 최고 점수 후보 세트를 채택한다.
 * 검사(vision) 자체가 실패하면 판단 불가 — 생성된 후보를 그대로 수용한다.
 */
export async function generateSceneCandidatesVerified(
  project: ProjectWithSceneJobs,
  scene: Scene,
): Promise<VerifiedSceneResult> {
  let avoidNotes: string[] = [];
  let best: { result: SceneGenerationResult; consistency: CandidateConsistency[]; score: number | null } | null = null;
  let rounds = 0;

  for (let round = 0; round < MAX_GENERATION_ROUNDS; round++) {
    rounds++;
    const result = await generateSceneImageCandidates(project, scene, {
      avoidNotes,
      assetSuffix: round === 0 ? '' : `-r${round + 1}`,
    });
    if (!result.ok) {
      if (best) break; // 재생성 실패 — 이전 라운드 결과로 폴백
      return { ...result, consistency: [], rounds, bestScore: null };
    }

    const consistency = await checkCandidatesConsistency(project, scene, result.candidates);
    const scores = consistency
      .filter((c) => c.result.ok)
      .map((c) => (c.result as ConsistencyResult).score);
    const score = scores.length > 0 ? Math.max(...scores) : null;

    if (best === null || score === null || (best.score !== null && score > best.score)) {
      best = { result, consistency, score };
    }
    if (score === null || score >= CONSISTENCY_PASS_SCORE) break; // 통과 또는 판단 불가 → 종료

    avoidNotes = collectViolationNotes(consistency);
    if (avoidNotes.length === 0) break; // 위반 사유가 특정되지 않으면 재생성 무의미
  }

  // best 라운드가 마지막 라운드가 아닐 수 있으므로 페이지 슬롯을 best 세트로 확정
  applySceneCandidates(project, scene.sceneNumber, best!.result.candidates);
  return { ...best!.result, consistency: best!.consistency, rounds, bestScore: best!.score };
}

/** 후보 중 1장을 확정하고 페이지 슬롯과 텍스트 슬롯을 채운다. 저장은 호출자 책임. */
export function selectSceneImage(
  project: ProjectWithSceneJobs,
  scene: Scene,
  candidateId: string,
): { ok: true; imageUrl: string } | { ok: false; error: string } {
  const page = project.layout.pages.find((p) => p.sceneNumber === scene.sceneNumber);
  const slot = page?.slots.find((s) => s.slotId === 'image-1');
  const cand = slot?.candidates?.find((c) => c.id === candidateId);
  if (!page || !slot || !cand) return { ok: false, error: `후보를 찾을 수 없습니다: ${candidateId}` };
  slot.imageUrl = cand.url;
  slot.imageStatus = 'ready';
  const textSlot = page.slots.find((s) => s.slotId === 'text-1');
  if (textSlot) textSlot.text = scene.text;
  else page.slots.push({ slotId: 'text-1', text: scene.text });
  return { ok: true, imageUrl: cand.url };
}

// ---------------------------------------------------------------------------
// 템플릿 추천 (PRD §3.2 — 글자 수·visualFocus·장면 중요도(beat) 기준)
// ---------------------------------------------------------------------------

export interface TemplateRecommendation {
  templateId: string;
  /** Gemini가 준 선호 순위 (1순위 포함) */
  rankedIds: string[];
  reason: string;
  /** Gemini 실패로 휴리스틱 폴백을 썼는지 */
  usedFallback: boolean;
}

function recommendationPrompt(scene: Scene, templates: LayoutTemplate[]): string {
  const list = templates
    .map((t) => `- ${t.id}: ${t.name} — ${t.description}`)
    .join('\n');
  return `You are a picture-book layout designer. Pick the best page layout templates for this scene.

Scene:
- beat (story importance): ${scene.beat}
- text length: ${scene.text.length} Korean characters
- text: ${scene.text}
- visual focus: ${scene.visualFocus}
- emotion: ${scene.emotion}
- preferred text area: ${scene.preferredTextArea}

Available templates:
${list}

Rules:
- Long text (over 90 chars) needs a template with a generous dedicated text zone, not a small overlay.
- Climactic or emotionally intense beats deserve full-bleed image templates.
- Quiet or intimate beats suit smaller vignette-style image templates.
- The text zone position should be compatible with the scene's preferred text area.

Return only valid JSON (no markdown fences):
{ "ranked": ["best template id", "second choice", "third choice"], "reason": "one short sentence in Korean" }`;
}

/** 코드 레벨 규칙: 같은 템플릿이 3연속이 되지 않게 한다. */
function avoidTripleRepeat(rankedIds: string[], recentTemplateIds: string[], all: LayoutTemplate[]): string {
  const lastTwo = recentTemplateIds.slice(-2);
  const wouldTriple = (id: string) => lastTwo.length === 2 && lastTwo[0] === id && lastTwo[1] === id;
  for (const id of rankedIds) {
    if (all.some((t) => t.id === id) && !wouldTriple(id)) return id;
  }
  // 전부 3연속이 되는 극단 케이스: 목록에서 다른 템플릿 아무거나
  const alt = all.find((t) => !wouldTriple(t.id));
  return alt?.id ?? rankedIds[0] ?? all[0].id;
}

/** Gemini 실패 시 휴리스틱: 글자 수·beat 키워드로 결정 (파이프라인이 막히지 않게). */
function fallbackRecommend(scene: Scene, templates: LayoutTemplate[]): string[] {
  const long = scene.text.length > 90;
  const climax = /절정|극복|선택|위기|클라이맥스/.test(scene.beat);
  const order = climax && !long ? ['L01', 'L07', 'L06'] : long ? ['L03', 'L02', 'L05'] : ['L02', 'L05', 'L08'];
  return order.filter((id) => templates.some((t) => t.id === id)).concat(templates.map((t) => t.id));
}

export async function recommendLayoutTemplate(
  scene: Scene,
  templates: LayoutTemplate[],
  recentTemplateIds: string[] = [],
): Promise<TemplateRecommendation> {
  // 책의 첫 페이지에서 정해진 글자 방향 계열로 이후 페이지를 제한한다 — 책 전체의
  // 시각적 통일감을 위해 (같은 책 안에서 좌상단·우하단·측면 칼럼이 뒤섞이지 않게).
  const lockedFamily = recentTemplateIds.length > 0 ? familyOf(recentTemplateIds[0]) : null;
  const candidates = lockedFamily
    ? templates.filter((t) => familyOf(t.id) === lockedFamily)
    : templates;
  const pool = candidates.length > 0 ? candidates : templates;

  const res = await generateVisionText(recommendationPrompt(scene, pool));
  if (res.ok) {
    const parsed = parseJsonLoose<{ ranked: string[]; reason: string }>(res.text);
    if (parsed && Array.isArray(parsed.ranked) && parsed.ranked.length > 0) {
      const templateId = avoidTripleRepeat(parsed.ranked, recentTemplateIds, pool);
      return { templateId, rankedIds: parsed.ranked, reason: parsed.reason ?? '', usedFallback: false };
    }
  }
  const ranked = fallbackRecommend(scene, pool);
  return {
    templateId: avoidTripleRepeat(ranked, recentTemplateIds, pool),
    rankedIds: ranked.slice(0, 3),
    reason: '휴리스틱 폴백(글자 수·beat 기준)',
    usedFallback: true,
  };
}
