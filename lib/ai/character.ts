// 파트 2(캐릭터·스타일) AI 로직.
//
//   extractStyleFromReference   업로드 참고 그림 → 스타일 서술 JSON (PRD §2.1 경로 A)
//   generateCharacterCandidates 후보 4장, 실루엣·체형·머리 차별화 (PRD §2.2)
//   refineCharacter             확정 전 부분 수정 ("머리만 바꿔줘") — 레퍼런스 조건부 생성
//   buildCharacterDNA           확정 이미지 → 텍스트 DNA (고정/소품/금지) — storybloom 소품 락 반영
//
// 이미지 파일 저장 헬퍼(saveCharacterAsset 등)도 여기 둔다 — API 라우트
// (app/api/character/**, app/api/style/**)가 공유한다.

import path from 'path';
import type { CharacterTextDNA, StyleSpec } from '../types';
import { readStoredFile, writeStoredFile } from '../storage';
import { generateImage, generateVisionText, parseJsonLoose, type GeminiError } from './image';
import {
  CANDIDATE_VARIATIONS,
  STYLE_EXTRACTION_PROMPT,
  candidatePrompt,
  dnaExtractionPrompt,
  refinePrompt,
} from '../prompts/character';

// ---------------------------------------------------------------------------
// 타입
// ---------------------------------------------------------------------------

/** AI가 추출한 구조화 스타일 서술. StyleSpec.description에는 summary를 넣는다. */
export interface ExtractedStyle {
  material: string;
  line: string;
  palette: string;
  texture: string;
  backgroundDensity: string;
  summary: string;
}

/**
 * 텍스트 DNA. lib/types.ts의 CharacterTextDNA(fixed/forbidden)에
 * storybloom 소품 연속성 락(recurringProps)을 명시 필드로 추가한 확장형.
 * Character.textDNA에 그대로 대입 가능하다(구조적 상위 타입).
 */
export interface CharacterDNA extends CharacterTextDNA {
  recurringProps: string[];
}

export interface CandidateImage {
  /** 0~3. CANDIDATE_VARIATIONS 인덱스와 일치 */
  index: number;
  variation: string;
  image: Buffer;
  elapsedMs: number;
}

export type AiFailure = { ok: false; error: GeminiError };

// ---------------------------------------------------------------------------
// 스타일 분석 (PRD §2.1)
// ---------------------------------------------------------------------------

export async function extractStyleFromReference(
  images: Buffer[],
): Promise<{ ok: true; style: ExtractedStyle } | AiFailure> {
  const res = await generateVisionText(STYLE_EXTRACTION_PROMPT, images);
  if (!res.ok) return res;
  const parsed = parseJsonLoose<ExtractedStyle>(res.text);
  if (!parsed || !parsed.summary) {
    return {
      ok: false,
      error: { code: 'no-text', message: `스타일 JSON 파싱 실패: ${res.text.slice(0, 200)}`, attempts: 1 },
    };
  }
  return { ok: true, style: parsed };
}

// ---------------------------------------------------------------------------
// 캐릭터 후보 4장 (PRD §2.2)
// ---------------------------------------------------------------------------

/**
 * 후보 4장을 생성한다. 각 후보에 서로 다른 실루엣·체형·머리 차별화 지시를 주고,
 * 배경·구도·스타일은 동일하게 유지한다. 스타일이 업로드 기반이면 참고 그림을
 * 레퍼런스로 함께 전달한다(스타일 컨디셔닝).
 * 일부 실패해도 성공한 후보는 반환한다 (전량 실패 시에만 오류).
 */
export async function generateCharacterCandidates(
  description: string,
  style: StyleSpec,
  styleReferenceImages?: Buffer[],
): Promise<{ ok: true; candidates: CandidateImage[]; failures: { index: number; error: GeminiError }[] } | AiFailure> {
  const refs = styleReferenceImages && styleReferenceImages.length > 0 ? styleReferenceImages : undefined;
  const results = await Promise.all(
    CANDIDATE_VARIATIONS.map((_, i) => generateImage(candidatePrompt(description, style, i, !!refs), refs)),
  );
  const candidates: CandidateImage[] = [];
  const failures: { index: number; error: GeminiError }[] = [];
  results.forEach((r, i) => {
    if (r.ok) {
      candidates.push({ index: i, variation: CANDIDATE_VARIATIONS[i], image: r.image.data, elapsedMs: r.image.elapsedMs });
    } else {
      failures.push({ index: i, error: r.error });
    }
  });
  if (candidates.length === 0) {
    return { ok: false, error: failures[0]?.error ?? { code: 'no-image', message: '후보 생성 전량 실패', attempts: 2 } };
  }
  return { ok: true, candidates, failures };
}

// ---------------------------------------------------------------------------
// 부분 수정 (PRD §2.2 — "머리만 바꿔줘")
// ---------------------------------------------------------------------------

export async function refineCharacter(
  baseImage: Buffer,
  instruction: string,
): Promise<{ ok: true; image: Buffer; elapsedMs: number } | AiFailure> {
  const res = await generateImage(refinePrompt(instruction), [baseImage]);
  if (!res.ok) return res;
  return { ok: true, image: res.image.data, elapsedMs: res.image.elapsedMs };
}

// ---------------------------------------------------------------------------
// 텍스트 DNA (PRD §2.2 + storybloom 소품 연속성 락)
// ---------------------------------------------------------------------------

export async function buildCharacterDNA(
  image: Buffer,
  description: string,
): Promise<{ ok: true; dna: CharacterDNA } | AiFailure> {
  const res = await generateVisionText(dnaExtractionPrompt(description), [image]);
  if (!res.ok) return res;
  const parsed = parseJsonLoose<Partial<CharacterDNA>>(res.text);
  if (!parsed || !Array.isArray(parsed.fixed)) {
    return {
      ok: false,
      error: { code: 'no-text', message: `DNA JSON 파싱 실패: ${res.text.slice(0, 200)}`, attempts: 1 },
    };
  }
  return {
    ok: true,
    dna: {
      fixed: parsed.fixed,
      recurringProps: Array.isArray(parsed.recurringProps) ? parsed.recurringProps : [],
      forbidden: Array.isArray(parsed.forbidden) ? parsed.forbidden : [],
    },
  };
}

// ---------------------------------------------------------------------------
// 에셋 저장 — projects/<id>/assets/ (실제 I/O는 lib/storage.ts — 로컬 fs / Vercel Blob)
// ---------------------------------------------------------------------------

function assetPath(projectId: string, name: string): string {
  return `projects/${path.basename(projectId)}/assets/${path.basename(name)}`;
}

/** 이미지 버퍼를 projects/<id>/assets/<name>에 저장하고, 조회용 URL을 반환한다. */
export async function saveCharacterAsset(projectId: string, name: string, data: Buffer): Promise<string> {
  const safeName = path.basename(name);
  await writeStoredFile(assetPath(projectId, safeName), data);
  return assetUrl(projectId, safeName);
}

/** GET /api/character/asset 라우트가 서빙하는 URL. 프로젝트 JSON에는 이 값을 기록한다. */
export function assetUrl(projectId: string, name: string): string {
  return `/api/character/asset?projectId=${encodeURIComponent(projectId)}&name=${encodeURIComponent(name)}`;
}

/** assetUrl 또는 파일명으로 저장된 에셋을 읽는다. 없으면 null. */
export async function readCharacterAsset(projectId: string, nameOrUrl: string): Promise<Buffer | null> {
  let name = nameOrUrl;
  if (nameOrUrl.startsWith('/api/')) {
    const q = nameOrUrl.split('?')[1] ?? '';
    const m = new URLSearchParams(q).get('name');
    if (!m) return null;
    name = m;
  }
  return readStoredFile(assetPath(projectId, name));
}
