// 브레인스토밍 — AI 작가도우미와의 대화형 기획 (스토리 생성 전 단계).
//
// 흐름: 등장인물 → 배경 → 갈등·사건 → 결말 방향·느낌 → 대상 연령 순서로
// 한 번에 하나씩 대화하며 정리 → finalize에서 대화를 구조화된 기획안(brief)으로
// 요약해 스토리 생성 입력(아이디어·분위기·등장인물)을 자동으로 채운다.

const GEMINI_MODEL =
  process.env.GEMINI_STORY_MODEL || process.env.GEMINI_MODEL || 'gemini-3-flash-preview';

export interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
}

export interface BrainstormBrief {
  idea: string;
  characters: { name: string; description: string }[];
  targetAge: string;
  desiredMood: string;
  summary: string;
}

function apiKey(): string {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) throw new Error('GEMINI_API_KEY 환경변수가 없습니다 (.env.local 확인)');
  return key;
}

async function callGeminiChat(
  system: string,
  messages: ChatMessage[],
  temperature: number,
  json = false,
): Promise<string> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey()}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: messages.map((m) => ({
          role: m.role === 'user' ? 'user' : 'model',
          parts: [{ text: m.text }],
        })),
        generationConfig: { temperature, ...(json ? { responseMimeType: 'application/json' } : {}) },
      }),
    },
  );
  if (!res.ok) throw new Error(`Gemini API ${res.status}: ${(await res.text()).slice(0, 500)}`);
  const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
  if (!text) throw new Error('Gemini 응답에 텍스트가 없습니다');
  return text;
}

const COACH_SYSTEM = `너는 그림책 기획을 돕는 다정한 작가 도우미다. 사용자(작가)와 대화하며 동화책의 재료를 차례로 함께 정리한다.

## 진행 순서 (한 번에 한 주제만)
1. 주인공과 등장인물 — 누구인지, 이름, 성격, 겉모습(그림으로 그릴 특징)
2. 배경 — 장소, 계절, 시간대
3. 갈등·사건 — 주인공이 겪을 일, 어떤 어려움인지
4. 결말의 방향과 남기고 싶은 느낌·감정
5. 대상 연령

## 대화 규칙
- 답변은 짧게 (3~5문장). 질문은 한 번에 1개만.
- 사용자가 막히거나 "모르겠다"고 하면 구체적인 예시를 2~3개 제안하라.
- 사용자의 아이디어를 절대 무시하지 말고, 받아서 한 뼘 더 발전시켜라.
- 유명 동화·애니메이션의 캐릭터나 고유 설정을 그대로 제안하지 마라.
- 주제가 하나 정리될 때마다 "지금까지 정리된 것"을 1~2줄로 요약하고 다음 주제로 넘어가라.
- 5가지가 모두 채워지면: 전체를 5줄 이내로 정리해 보여주고 "이제 준비가 됐어요 — 아래 [정리해서 스토리 만들기]를 누르면 이 내용으로 스토리를 만들어 드려요."라고 안내하라.
- 항상 한국어, 따뜻하고 격려하는 말투.`;

/** 대화 이어가기: 전체 히스토리(마지막이 user)를 주면 도우미의 다음 답을 반환. */
export async function brainstormReply(messages: ChatMessage[]): Promise<string> {
  return callGeminiChat(COACH_SYSTEM, messages, 0.8);
}

/** 첫 인사 (대화가 비어 있을 때) */
export const BRAINSTORM_GREETING =
  '안녕하세요, 함께 동화책을 기획해 볼 작가 도우미예요. 먼저 주인공부터 정해 볼까요? ' +
  '어떤 인물(또는 동물)이 떠오르세요? 막연해도 괜찮아요 — 예를 들면 "겁 많은 아기 고슴도치", ' +
  '"말을 아끼는 꼬마 로봇", "구름을 모으는 할머니" 같은 것도 좋아요.';

const FINALIZE_SYSTEM = `너는 그림책 편집자다. 아래 작가와 도우미의 브레인스토밍 대화에서 확정된 내용만 뽑아 기획안 JSON으로 정리한다.

규칙:
- 대화에서 사용자가 승인·선택한 내용을 우선하라. 도우미의 제안 중 사용자가 반응하지 않은 것은 넣지 마라.
- idea는 스토리 생성기에 넣을 한 문장 (주인공 + 갈등 + 방향이 다 들어가게).
- characters의 description에는 그림으로 그릴 수 있는 겉모습 특징을 반드시 포함하라 (색·체형·소품 등). 대화에 없으면 대화 맥락에 어울리게 지어서 채워라.
- 대화에 없는 항목은 무난한 기본값으로: targetAge "5~7세", desiredMood는 대화의 정서에서 유추.

아래 JSON만 반환하라. 코드펜스·설명 금지.
{
  "idea": "한 문장 아이디어",
  "characters": [ { "name": "이름", "description": "성격 + 겉모습 (그림용 특징 포함)" } ],
  "targetAge": "5~7세",
  "desiredMood": "원하는 느낌",
  "summary": "기획안 전체 요약 3~4문장 (한국어)"
}`;

/** 대화 전체를 구조화된 기획안으로 정리한다. */
export async function finalizeBrainstorm(messages: ChatMessage[]): Promise<BrainstormBrief> {
  const transcript = messages
    .map((m) => `${m.role === 'user' ? '작가' : '도우미'}: ${m.text}`)
    .join('\n\n');
  const raw = await callGeminiChat(
    FINALIZE_SYSTEM,
    [{ role: 'user', text: `대화록:\n${transcript}\n\n이 대화를 기획안 JSON으로 정리하라.` }],
    0.3,
    true,
  );
  const stripped = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  const parsed = JSON.parse(stripped) as Partial<BrainstormBrief>;
  if (!parsed.idea || typeof parsed.idea !== 'string') throw new Error('기획안 정리 실패: idea 누락');
  return {
    idea: parsed.idea,
    characters: Array.isArray(parsed.characters)
      ? parsed.characters
          .filter((c) => c && typeof c.name === 'string' && typeof c.description === 'string')
          .slice(0, 4)
      : [],
    targetAge: typeof parsed.targetAge === 'string' && parsed.targetAge ? parsed.targetAge : '5~7세',
    desiredMood: typeof parsed.desiredMood === 'string' ? parsed.desiredMood : '',
    summary: typeof parsed.summary === 'string' ? parsed.summary : '',
  };
}
