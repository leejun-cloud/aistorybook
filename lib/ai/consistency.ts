// DNA 일관성 자동 검사 (파트 4 §1).
//
// 실측 근거: 파트 3 장면 생성 6장 중 1장(scene-3-cand-1)에서 스타일 참고 이미지의
// 의상(파란 멜빵바지+빨간 배낭)이 캐릭터에 누출됨 (tests/scene/run-record.json).
// 후보 2장 체제로 회피는 가능하지만 사람 눈에 의존했다 — 이 모듈이 그 검사를 자동화한다.
//
// 설계: lib/ai/scene.ts를 수정하지 않는 후처리 훅. API 라우트(app/api/scene/generate)가
// 생성 결과의 후보 이미지를 이 함수로 채점해 응답에 덧붙인다.

import type { Character, CharacterTextDNA, Project, Scene } from '../types';
import { generateVisionText, parseJsonLoose, type GeminiError } from './image';
import { readCharacterAsset } from './character';

export interface ConsistencyCheckItem {
  /** 검사한 DNA 항목 (fixed/forbidden/recurringProps의 원문) */
  element: string;
  kind: 'fixed' | 'forbidden' | 'recurringProp';
  /** fixed·recurringProp: 유지됨 / forbidden: 부재함 → true */
  ok: boolean;
  note?: string;
}

export interface ConsistencyResult {
  ok: true;
  /** 모든 항목 통과 여부 */
  passed: boolean;
  /** 0~100 — (통과 항목 / 전체 항목) */
  score: number;
  items: ConsistencyCheckItem[];
  /** 실패 항목 요약 (한국어 한 문장) */
  summary: string;
}

export type ConsistencyOutcome = ConsistencyResult | { ok: false; error: GeminiError };

interface DnaWithProps extends CharacterTextDNA {
  recurringProps?: string[];
}

function sceneCharacters(project: Project, scene: Scene): Character[] {
  const confirmed = project.character.characters.filter((c) => c.confirmed);
  const matched = confirmed.filter((c) => scene.characters.includes(c.id));
  return matched.length > 0 ? matched : confirmed;
}

function checkPrompt(characters: Character[]): string {
  const sections = characters.map((c) => {
    const dna = c.textDNA as DnaWithProps;
    return `Character "${c.name}":
FIXED (must be present and unchanged):
${dna.fixed.map((e, i) => `F${i}: ${e}`).join('\n')}
FORBIDDEN (must NOT appear on this character):
${dna.forbidden.map((e, i) => `X${i}: ${e}`).join('\n')}
RECURRING PROPS (must appear with the same design):
${(dna.recurringProps ?? []).map((e, i) => `P${i}: ${e}`).join('\n') || '(none)'}`;
  });

  return `You are a continuity inspector for a children's picture book.
The attached image is a generated scene illustration. Check it against the character DNA lock below.

${sections.join('\n\n')}

For EVERY listed item, judge from the image:
- FIXED item: ok=true only if the element is visibly maintained (or plausibly maintained when partially occluded by pose/blanket/props — occlusion alone is not a violation).
- FORBIDDEN item: ok=true only if the element is ABSENT. Clothing, outfits, backpacks, hats worn as part of the story scene text are still violations if the DNA forbids outfits — unless the item is explicitly part of the scene (e.g. a pot hat the story mentions). Be strict about leaked clothing like overalls or backpacks.
- RECURRING PROP: ok=true only if the prop appears with the same design.

Return only valid JSON (no markdown fences):
{
  "items": [
    { "element": "<verbatim DNA text>", "kind": "fixed|forbidden|recurringProp", "ok": true, "note": "<short reason, Korean>" }
  ],
  "summary": "<one Korean sentence: overall verdict and the most important violation if any>"
}`;
}

/**
 * 생성된 장면 이미지 1장이 캐릭터 DNA(fixed 유지 / forbidden 부재 / recurringProps 존재)를
 * 지키는지 Gemini vision으로 JSON 채점한다.
 *
 * 장면 텍스트를 함께 주어 "장면이 명시한 소품(냄비 모자 등)"은 위반으로 오판하지 않게 한다.
 */
export async function checkSceneConsistency(
  project: Project,
  scene: Scene,
  imageBuffer: Buffer,
): Promise<ConsistencyOutcome> {
  const characters = sceneCharacters(project, scene);
  if (characters.length === 0) {
    return {
      ok: false,
      error: { code: 'no-text', message: '확정된 캐릭터가 없어 DNA 검사를 할 수 없습니다', attempts: 0 },
    };
  }

  const prompt =
    checkPrompt(characters) +
    `\n\nContext — the scene text this image illustrates (props mentioned here are allowed): ${scene.text}`;

  const res = await generateVisionText(prompt, [imageBuffer]);
  if (!res.ok) return res;

  const parsed = parseJsonLoose<{ items: ConsistencyCheckItem[]; summary?: string }>(res.text);
  if (!parsed || !Array.isArray(parsed.items) || parsed.items.length === 0) {
    return {
      ok: false,
      error: { code: 'no-text', message: `일관성 JSON 파싱 실패: ${res.text.slice(0, 200)}`, attempts: 1 },
    };
  }

  const items = parsed.items.map((it) => ({
    element: String(it.element ?? ''),
    kind: (['fixed', 'forbidden', 'recurringProp'].includes(it.kind) ? it.kind : 'fixed') as ConsistencyCheckItem['kind'],
    ok: it.ok === true,
    note: it.note,
  }));
  const passedCount = items.filter((i) => i.ok).length;
  const passed = passedCount === items.length;
  return {
    ok: true,
    passed,
    score: Math.round((passedCount / items.length) * 100),
    items,
    summary: parsed.summary ?? (passed ? '모든 DNA 항목 통과' : '일부 DNA 항목 위반'),
  };
}

export interface CandidateConsistency {
  candidateId: string;
  result: ConsistencyOutcome;
}

/**
 * 후처리 훅: 장면 생성 API 응답에 덧붙일 후보별 DNA 검사.
 * 후보의 저장된 에셋을 읽어 checkSceneConsistency를 각각 실행한다.
 * (scene.ts는 건드리지 않는다 — 라우트에서 이 함수만 조합)
 */
export async function checkCandidatesConsistency(
  project: Project,
  scene: Scene,
  candidates: { id: string; url: string }[],
): Promise<CandidateConsistency[]> {
  const out: CandidateConsistency[] = [];
  for (const cand of candidates) {
    const buf = readCharacterAsset(project.id, cand.url);
    if (!buf) {
      out.push({
        candidateId: cand.id,
        result: { ok: false, error: { code: 'no-image', message: `에셋을 읽을 수 없음: ${cand.url}`, attempts: 0 } },
      });
      continue;
    }
    out.push({ candidateId: cand.id, result: await checkSceneConsistency(project, scene, buf) });
  }
  return out;
}
