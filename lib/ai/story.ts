// 파트 1 스토리 — Gemini 구현 (PRD §1.1~§1.3)
//
// lib/ai/index.ts의 시그니처에 맞춘 실제 구현. index.ts 배선은 지휘자가 한다.
// - generateStoryDraft: 메타프롬프트 + 플롯 패턴으로 장면 초안 생성
// - runQualityGate: 통과 기준 5종 채점 → 미달 시 self-repair 1회 (storybloom 패턴)
// - regenerateScene: 장면 단건 재생성 (textSource === 'user'는 덮어쓰지 않음)

import fs from 'fs';
import path from 'path';
import { PlotPattern, Scene } from '../types';
import {
  buildGateSystemPrompt,
  buildRepairSystemPrompt,
  buildSceneRegenSystemPrompt,
  buildStorySystemPrompt,
  buildStoryUserPrompt,
  QUALITY_GATE_CRITERIA,
} from '../prompts/story-meta';

// --- Gemini 호출 ----------------------------------------------------------

// 스토리(창작·채점) 전용 모델 — GEMINI_STORY_MODEL로 상위 모델 승급 가능.
// (예: pro 계열 — 초안·게이트 품질이 오르고 텍스트라 비용 증가는 미미)
const GEMINI_MODEL =
  process.env.GEMINI_STORY_MODEL || process.env.GEMINI_MODEL || 'gemini-3-flash-preview';

function apiKey(): string {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) throw new Error('GEMINI_API_KEY 환경변수가 없습니다 (.env.local 확인)');
  return key;
}

async function callGemini(system: string, user: string, temperature: number): Promise<string> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey()}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: user }] }],
        generationConfig: { temperature, responseMimeType: 'application/json' },
      }),
    },
  );
  if (!res.ok) {
    throw new Error(`Gemini API ${res.status}: ${(await res.text()).slice(0, 500)}`);
  }
  const json = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
  if (!text) throw new Error('Gemini 응답에 텍스트가 없습니다');
  return text;
}

function parseJson<T>(raw: string): T {
  // responseMimeType: application/json이라도 방어적으로 코드펜스를 벗긴다.
  const stripped = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  return JSON.parse(stripped) as T;
}

// --- JSON 컨트랙트 self-repair 루프 (storybloom generateStoryText 패턴) -----

const TEXT_AREAS: Scene['preferredTextArea'][] = [
  'upper-left', 'upper-center', 'upper-right',
  'center-left', 'center', 'center-right',
  'lower-left', 'lower-center', 'lower-right',
];

/** 응답 JSON이 Scene 컨트랙트를 지켰는지 검사. 위반이면 사유 문자열 반환. */
function sceneContractFailure(scenes: unknown, expectedCount: number): string | null {
  if (!Array.isArray(scenes)) return 'scenes가 배열이 아님';
  if (scenes.length !== expectedCount) return `장면 수가 ${scenes.length}개 (${expectedCount}개여야 함)`;
  for (const s of scenes as Record<string, unknown>[]) {
    if (typeof s.sceneNumber !== 'number') return 'sceneNumber 누락';
    if (typeof s.beat !== 'string' || !s.beat) return `장면 ${s.sceneNumber}: beat 누락`;
    if (typeof s.text !== 'string' || !s.text.trim()) return `장면 ${s.sceneNumber}: text 누락`;
    if (!Array.isArray(s.characters)) return `장면 ${s.sceneNumber}: characters 누락`;
    if (typeof s.location !== 'string') return `장면 ${s.sceneNumber}: location 누락`;
    if (typeof s.emotion !== 'string') return `장면 ${s.sceneNumber}: emotion 누락`;
    if (typeof s.visualFocus !== 'string') return `장면 ${s.sceneNumber}: visualFocus 누락`;
    if (!TEXT_AREAS.includes(s.preferredTextArea as Scene['preferredTextArea']))
      return `장면 ${s.sceneNumber}: preferredTextArea 값 오류 (${String(s.preferredTextArea)})`;
  }
  return null;
}

/**
 * Gemini 호출 → JSON 파싱 → 컨트랙트 검사. 실패하면 이전 응답 + 수정 지시를
 * 붙여 낮은 temperature로 재요청하는 self-repair 루프 (최대 attempts회).
 */
async function generateScenesWithContract(
  system: string,
  user: string,
  expectedCount: number,
  temperature: number,
  attempts = 3,
): Promise<Scene[]> {
  let lastError = '';
  let lastResponse = '';
  for (let attempt = 0; attempt < attempts; attempt++) {
    const prompt =
      attempt === 0
        ? user
        : [
            user,
            '',
            '이전 응답이 형식 검사에 실패했다:',
            `실패 사유: ${lastError}`,
            '이전 응답:',
            lastResponse.slice(0, 8000),
            '',
            '실패 사유를 고쳐 같은 이야기의 완전한 JSON을 다시 반환하라. JSON 외 텍스트 금지.',
          ].join('\n');
    const raw = await callGemini(system, prompt, attempt === 0 ? temperature : 0.3);
    lastResponse = raw;
    let parsed: { scenes?: unknown };
    try {
      parsed = parseJson<{ scenes?: unknown }>(raw);
    } catch (e) {
      lastError = `JSON 파싱 실패: ${(e as Error).message}`;
      continue;
    }
    const failure = sceneContractFailure(parsed.scenes, expectedCount);
    if (failure) {
      lastError = failure;
      continue;
    }
    return (parsed.scenes as Scene[]).map((s, i) => ({
      sceneNumber: i + 1,
      beat: s.beat,
      text: s.text.trim(),
      textSource: 'ai' as const,
      characters: s.characters.map(String),
      location: s.location,
      emotion: s.emotion,
      visualFocus: s.visualFocus,
      preferredTextArea: s.preferredTextArea,
    }));
  }
  throw new Error(`스토리 JSON 컨트랙트 실패 (${attempts}회 시도): ${lastError}`);
}

// --- 플롯 패턴 라이브러리 (patterns/*.md, PRD §1.1 레이어 A) ----------------

const patternsDir = () => path.join(process.cwd(), 'patterns');

function parseFrontmatter(md: string): Record<string, string> {
  const m = md.match(/^---\n([\s\S]*?)\n---/);
  const out: Record<string, string> = {};
  if (!m) return out;
  for (const line of m[1].split('\n')) {
    const idx = line.indexOf(':');
    if (idx > 0) out[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return out;
}

/** patterns/*.md 전체를 PlotPattern 목록으로 반환 */
export function loadPatternLibrary(): PlotPattern[] {
  return fs
    .readdirSync(patternsDir())
    .filter((f) => f.endsWith('.md'))
    .map((f) => {
      const fm = parseFrontmatter(fs.readFileSync(path.join(patternsDir(), f), 'utf-8'));
      return {
        id: fm.id ?? f.replace(/\.md$/, ''),
        name: fm.name ?? f,
        description: fm.description ?? '',
        emotionCurve: fm.emotionCurve ?? '',
        ageRange: fm.ageRange ?? '',
        commonFailure: fm.commonFailure ?? '',
      };
    });
}

function loadPatternMarkdown(id: string): string {
  const file = path.join(patternsDir(), `${path.basename(id)}.md`);
  return fs.readFileSync(file, 'utf-8');
}

/** 아이디어에 어울리는 패턴 1~2개 자동 선택 (PRD §1.2, 사용자가 바꿀 수 있음) */
export async function selectPatterns(idea: string, targetAge: string): Promise<string[]> {
  const library = loadPatternLibrary();
  const system = [
    '너는 그림책 편집자다. 아이디어에 가장 어울리는 플롯 패턴을 1~2개 고른다.',
    '패턴 목록:',
    ...library.map((p) => `- id: ${p.id} — ${p.name}: ${p.description} (적합: ${p.ageRange})`),
    '',
    'JSON만 반환: { "patternIds": ["id1"] } 또는 { "patternIds": ["id1", "id2"] }',
  ].join('\n');
  const raw = await callGemini(system, `아이디어: ${idea}\n대상 연령: ${targetAge}`, 0.2);
  const parsed = parseJson<{ patternIds?: unknown }>(raw);
  const valid = new Set(library.map((p) => p.id));
  const ids = Array.isArray(parsed.patternIds)
    ? parsed.patternIds.map(String).filter((id) => valid.has(id)).slice(0, 2)
    : [];
  return ids.length > 0 ? ids : [library[0].id];
}

// --- 스토리 생성 -----------------------------------------------------------

export interface StoryDraftInput {
  idea: string;
  targetAge: string;
  /** 장면 수 (4~40) */
  sceneCount: number;
  desiredMood: string;
  patterns: PlotPattern[];
}

/**
 * 메타프롬프트(레이어 B) + 플롯 패턴(레이어 A)으로 장면 초안 생성.
 *
 * best-of-N: 초안을 N개(기본 2, STORY_DRAFT_CANDIDATES) 병렬 생성하고
 * 품질 게이트 채점기로 각각 점수를 매겨 통과 항목이 가장 많은 초안을 채택한다.
 * 초안 1발(temperature 0.9의 복권)의 품질 분산을 줄이는 장치.
 */
export async function generateStoryDraft(input: StoryDraftInput): Promise<Scene[]> {
  const metaInput = {
    idea: input.idea,
    targetAge: input.targetAge,
    sceneCount: input.sceneCount,
    desiredMood: input.desiredMood,
    patternMarkdowns: input.patterns.map((p) => loadPatternMarkdown(p.id)),
  };
  const system = buildStorySystemPrompt(metaInput);
  const user = buildStoryUserPrompt(metaInput);

  const n = Math.max(1, Math.min(4, Number(process.env.STORY_DRAFT_CANDIDATES) || 2));
  const settled = await Promise.allSettled(
    Array.from({ length: n }, () => generateScenesWithContract(system, user, input.sceneCount, 0.9)),
  );
  const drafts = settled
    .filter((r): r is PromiseFulfilledResult<Scene[]> => r.status === 'fulfilled')
    .map((r) => r.value);
  if (drafts.length === 0) {
    throw (settled[0] as PromiseRejectedResult).reason;
  }
  if (drafts.length === 1) return drafts[0];

  // 각 초안을 게이트 기준으로 채점 → 통과 수 최다 초안 채택 (동점이면 앞선 것)
  const scores = await Promise.all(
    drafts.map(async (d) => {
      try {
        return (await scoreScenes(d)).filter((it) => it.passed).length;
      } catch {
        return -1; // 채점 실패 초안은 후순위
      }
    }),
  );
  let best = 0;
  for (let i = 1; i < drafts.length; i++) if (scores[i] > scores[best]) best = i;
  return drafts[best];
}

// --- 품질 게이트 ------------------------------------------------------------

export interface QualityGateResult {
  passed: boolean;
  items: { label: string; passed: boolean; note?: string }[];
  revisedScenes: Scene[];
}

function formatScenesForPrompt(scenes: Scene[]): string {
  return JSON.stringify(
    scenes.map((s) => ({
      sceneNumber: s.sceneNumber,
      beat: s.beat,
      text: s.text,
      ...(s.textSource === 'user' ? { locked: true } : {}),
    })),
    null,
    2,
  );
}

async function scoreScenes(scenes: Scene[]): Promise<{ label: string; passed: boolean; note?: string }[]> {
  const raw = await callGemini(buildGateSystemPrompt(), `원고:\n${formatScenesForPrompt(scenes)}`, 0.1);
  const parsed = parseJson<{ items?: { label?: string; passed?: boolean; note?: string }[] }>(raw);
  const byLabel = new Map((parsed.items ?? []).map((it) => [it.label, it]));
  // 채점표는 항상 기준 5종 순서·이름으로 정규화한다. 누락 항목은 fail 처리.
  return QUALITY_GATE_CRITERIA.map((c) => {
    const it = byLabel.get(c.label);
    return {
      label: c.label,
      passed: it?.passed === true,
      note: it?.note ?? (it ? undefined : '채점 응답에 항목 누락'),
    };
  });
}

/**
 * 통과 기준 5종 채점 → 미달 항목이 있으면 self-repair → 재채점을
 * 통과할 때까지 반복한다 (수리 최대 2회 — 수확 체감 상한, storybloom 패턴 확장).
 * textSource === 'user' 장면은 코드 레벨에서 원문을 복원해 절대 덮어쓰지 않는다.
 */
export async function runQualityGate(scenes: Scene[]): Promise<QualityGateResult> {
  const MAX_REPAIRS = 2;
  let current = scenes;
  let items = await scoreScenes(current);

  for (let round = 0; round < MAX_REPAIRS; round++) {
    const failed = items.filter((it) => !it.passed);
    if (failed.length === 0) break;

    // self-repair: 미달 사유를 들고 원고를 스스로 수정
    const repairUser = ['원고:', formatScenesForPrompt(current), '', '미달 항목을 고친 전체 원고 JSON을 반환하라.'].join('\n');
    let revised: Scene[];
    try {
      revised = await generateScenesWithContract(
        buildRepairSystemPrompt(failed),
        repairUser,
        current.length,
        0.6,
      );
    } catch {
      // 수정 실패 시 현재 원고 유지 + 마지막 채점 결과 반환
      break;
    }

    // 원문 보존 원칙: 사용자 문장은 프롬프트 지시와 무관하게 코드에서 복원
    current = current.map((original, i) => {
      if (original.textSource === 'user') return original;
      const r = revised[i];
      return { ...r, sceneNumber: original.sceneNumber, beat: original.beat, textSource: 'ai' as const };
    });
    items = await scoreScenes(current);
  }

  return {
    passed: items.every((it) => it.passed),
    items,
    revisedScenes: current,
  };
}

/** lib/ai/index.ts의 runStoryQualityGate 시그니처와 동일 — 배선용 별칭 */
export const runStoryQualityGate = runQualityGate;

// --- 장면 재생성 -------------------------------------------------------------

/**
 * 사용자 지시를 반영해 한 장면만 재생성한다.
 * textSource === 'user'인 장면은 덮어쓰지 않고 그대로 반환한다 (원문 보존 원칙).
 * context: 앞뒤 흐름 유지를 위해 책 전체 장면을 함께 전달 (선택).
 */
export async function regenerateScene(
  scene: Scene,
  instruction: string,
  context?: Scene[],
): Promise<Scene> {
  if (scene.textSource === 'user') return scene;

  const contextBlock = context
    ? `책 전체 원고 (흐름 참고용):\n${JSON.stringify(context.map((s) => ({ sceneNumber: s.sceneNumber, beat: s.beat, text: s.text })), null, 2)}\n\n`
    : '';
  const user = [
    contextBlock + `다시 쓸 장면:`,
    JSON.stringify(
      {
        sceneNumber: scene.sceneNumber,
        beat: scene.beat,
        text: scene.text,
        characters: scene.characters,
        location: scene.location,
        emotion: scene.emotion,
        visualFocus: scene.visualFocus,
        preferredTextArea: scene.preferredTextArea,
      },
      null,
      2,
    ),
    '',
    `사용자 지시: ${instruction}`,
    '이 장면 하나를 지시에 맞게 다시 써서 장면 JSON 객체만 반환하라.',
  ].join('\n');

  let lastError = '';
  for (let attempt = 0; attempt < 3; attempt++) {
    const raw = await callGemini(
      buildSceneRegenSystemPrompt(),
      attempt === 0 ? user : `${user}\n\n이전 응답이 형식 오류(${lastError})였다. 올바른 JSON 객체만 반환하라.`,
      attempt === 0 ? 0.8 : 0.3,
    );
    try {
      const s = parseJson<Record<string, unknown>>(raw);
      const failure = sceneContractFailure([{ ...s, sceneNumber: scene.sceneNumber }], 1);
      if (failure) {
        lastError = failure;
        continue;
      }
      return {
        sceneNumber: scene.sceneNumber,
        beat: scene.beat,
        text: String(s.text).trim(),
        textSource: 'ai',
        characters: (s.characters as string[]).map(String),
        location: String(s.location),
        emotion: String(s.emotion),
        visualFocus: String(s.visualFocus),
        preferredTextArea: s.preferredTextArea as Scene['preferredTextArea'],
      };
    } catch (e) {
      lastError = (e as Error).message;
    }
  }
  throw new Error(`장면 재생성 실패: ${lastError}`);
}
