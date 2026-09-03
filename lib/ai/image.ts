// Gemini 이미지 생성 클라이언트.
//
// validation/gen.mjs(0단계 검증 PASS)의 호출 방식을 그대로 코드화했다:
//   - 모델: gemini-2.5-flash-image
//   - 엔드포인트: POST .../v1beta/models/<model>:generateContent?key=<KEY>
//   - 레퍼런스 이미지는 contents[0].parts 앞쪽에 inlineData(base64)로 전달
//   - generationConfig.responseModalities: ["IMAGE", "TEXT"]
//
// API 키: GEMINI_API_KEY 환경변수 (.env.local — Next.js가 자동 로드).

const IMAGE_MODEL = process.env.GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image';
const TEXT_MODEL = process.env.GEMINI_TEXT_MODEL || 'gemini-2.5-flash';
const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

export interface GeneratedImage {
  /** PNG 바이너리 */
  data: Buffer;
  mimeType: string;
  model: string;
  elapsedMs: number;
}

export interface GeminiError {
  code: 'no-key' | 'http' | 'no-image' | 'no-text' | 'network';
  message: string;
  /** HTTP 오류일 때 상태코드 */
  status?: number;
  /** 총 시도 횟수 (재시도 포함) */
  attempts: number;
}

export type ImageResult = { ok: true; image: GeneratedImage } | { ok: false; error: GeminiError };
export type TextResult = { ok: true; text: string; elapsedMs: number } | { ok: false; error: GeminiError };

function apiKey(): string | null {
  return process.env.GEMINI_API_KEY?.trim() || null;
}

interface Part {
  text?: string;
  inlineData?: { mimeType: string; data: string };
}

function buildParts(prompt: string, referenceImages?: Buffer[]): Part[] {
  const parts: Part[] = [];
  for (const img of referenceImages ?? []) {
    // 매직 바이트로 mime 판별 (기본 PNG, JPEG 레퍼런스도 허용)
    const mimeType = img[0] === 0xff && img[1] === 0xd8 ? 'image/jpeg' : 'image/png';
    parts.push({ inlineData: { mimeType, data: img.toString('base64') } });
  }
  parts.push({ text: prompt });
  return parts;
}

async function callGemini(
  model: string,
  parts: Part[],
  responseModalities: string[],
): Promise<{ ok: true; parts: Part[]; elapsedMs: number } | { ok: false; error: Omit<GeminiError, 'attempts'> }> {
  const key = apiKey();
  if (!key) {
    return { ok: false, error: { code: 'no-key', message: 'GEMINI_API_KEY가 설정되지 않았습니다 (.env.local 확인)' } };
  }
  const body = {
    contents: [{ role: 'user', parts }],
    generationConfig: { responseModalities },
  };
  const t0 = Date.now();
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}/${model}:generateContent?key=${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (e) {
    return { ok: false, error: { code: 'network', message: `네트워크 오류: ${(e as Error).message}` } };
  }
  const elapsedMs = Date.now() - t0;
  const text = await res.text();
  if (!res.ok) {
    return {
      ok: false,
      error: { code: 'http', status: res.status, message: `Gemini HTTP ${res.status}: ${text.slice(0, 500)}` },
    };
  }
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, error: { code: 'http', status: res.status, message: '응답 JSON 파싱 실패' } };
  }
  const outParts: Part[] = json.candidates?.[0]?.content?.parts ?? [];
  return { ok: true, parts: outParts, elapsedMs };
}

/**
 * 이미지 1장을 생성한다. referenceImages를 주면 레퍼런스 조건부 생성
 * (캐릭터 일관성·부분 수정·스타일 컨디셔닝)이 된다.
 * 실패 시 1회 재시도 후 구조화된 오류를 반환한다.
 */
export async function generateImage(prompt: string, referenceImages?: Buffer[]): Promise<ImageResult> {
  const parts = buildParts(prompt, referenceImages);
  let lastError: Omit<GeminiError, 'attempts'> = { code: 'no-image', message: '이미지가 반환되지 않았습니다' };
  for (let attempt = 1; attempt <= 2; attempt++) {
    const res = await callGemini(IMAGE_MODEL, parts, ['IMAGE', 'TEXT']);
    if (res.ok) {
      const imgPart = res.parts.find((p) => p.inlineData?.data);
      if (imgPart?.inlineData) {
        return {
          ok: true,
          image: {
            data: Buffer.from(imgPart.inlineData.data, 'base64'),
            mimeType: imgPart.inlineData.mimeType || 'image/png',
            model: IMAGE_MODEL,
            elapsedMs: res.elapsedMs,
          },
        };
      }
      lastError = { code: 'no-image', message: '응답에 이미지 파트가 없습니다' };
    } else {
      lastError = res.error;
      if (res.error.code === 'no-key') return { ok: false, error: { ...res.error, attempts: attempt } };
    }
    if (attempt === 2) return { ok: false, error: { ...lastError, attempts: attempt } };
  }
  return { ok: false, error: { ...lastError, attempts: 2 } };
}

/**
 * 텍스트(주로 JSON) 응답을 받는 멀티모달 vision 호출.
 * 스타일 분석·텍스트 DNA 추출에 사용. 실패 시 1회 재시도.
 */
export async function generateVisionText(prompt: string, images?: Buffer[]): Promise<TextResult> {
  const parts = buildParts(prompt, images);
  let lastError: Omit<GeminiError, 'attempts'> = { code: 'no-text', message: '텍스트가 반환되지 않았습니다' };
  for (let attempt = 1; attempt <= 2; attempt++) {
    const res = await callGemini(TEXT_MODEL, parts, ['TEXT']);
    if (res.ok) {
      const text = res.parts
        .map((p) => p.text ?? '')
        .join('')
        .trim();
      if (text) return { ok: true, text, elapsedMs: res.elapsedMs };
      lastError = { code: 'no-text', message: '응답에 텍스트 파트가 없습니다' };
    } else {
      lastError = res.error;
      if (res.error.code === 'no-key') return { ok: false, error: { ...res.error, attempts: attempt } };
    }
  }
  return { ok: false, error: { ...lastError, attempts: 2 } };
}

/** 마크다운 코드펜스에 싸여 오는 JSON 응답을 관대하게 파싱한다. */
export function parseJsonLoose<T>(text: string): T | null {
  const stripped = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  try {
    return JSON.parse(stripped) as T;
  } catch {
    const start = stripped.indexOf('{');
    const end = stripped.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(stripped.slice(start, end + 1)) as T;
      } catch {
        return null;
      }
    }
    return null;
  }
}
