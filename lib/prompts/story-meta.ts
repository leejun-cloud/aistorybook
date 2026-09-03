// 스토리 메타프롬프트 (PRD §1.1 레이어 B)
//
// "무엇을 쓰라"가 아니라 "무엇을 하지 말라 + 어떤 기준을 통과하라"로 구성한다.
// 플롯 패턴 md 내용(레이어 A) + 사용자 아이디어 + 연령/분량을 받아
// Gemini에 넣을 시스템/유저 프롬프트를 조립한다.

export interface StoryMetaInput {
  idea: string;
  targetAge: string;
  /** 장면 수 (4~40) — 패턴 md의 비트 배치는 8/12/16 기준, 그 외는 프롬프트에서 재배치 지시 */
  sceneCount: number;
  desiredMood: string;
  /** 선택된 패턴 md 파일의 원문 (1~2개) */
  patternMarkdowns: string[];
}

/** 금지 목록 — AI 티의 실체 (PRD §1.1 레이어 B) */
export const FORBIDDEN_LIST = [
  '교훈을 문장으로 설명하지 마라. "~하다는 것을 깨달았어요", "~이 소중하다는 걸 알게 되었어요" 류의 문장은 어디에도 넣지 마라. 교훈은 인물의 행동과 그 결과로만 드러나야 한다.',
  '모든 문장을 같은 길이·같은 리듬으로 쓰지 마라. 짧은 문장과 긴 문장을 섞어라. 소리 내어 읽을 때 리듬이 살아야 한다.',
  '감정을 형용사로 서술하지 마라("슬펐어요", "무서웠어요", "기뻤어요" 금지). 행동으로 보여라(예: "문 뒤에서 한참 나오지 않았어요").',
  '갈등이 저절로, 또는 우연히, 또는 어른의 개입으로 풀리는 결말을 쓰지 마라. 주인공이 절정에서 스스로 선택하고 움직여야 한다.',
  '부사를 남발하지 마라. "그러던 어느 날", "옛날 옛적에", "행복하게 살았답니다" 같은 상투적 전환구·관용구를 쓰지 마라.',
  '캐릭터가 나이에 안 맞게 어른스러운 대사를 하게 하지 마라. 아이는 아이의 어휘와 논리로 말한다.',
] as const;

/** 통과 기준 — 스토리 품질 게이트 5종 (PRD §1.1 레이어 B) */
export const QUALITY_GATE_CRITERIA = [
  { label: '주인공의 능동적 선택', question: '주인공이 절정에서 스스로 선택하고 행동하는가? (우연·조력자·어른이 대신 해결하면 실패)' },
  { label: '낭독 리듬', question: '소리 내어 읽었을 때 리듬이 사는가? 문장 길이가 다양하고, 반복·의성어·호흡이 낭독에 어울리는가? (그림책은 낭독물이다)' },
  { label: '교훈의 간접성', question: '교훈이 행동과 결과로 드러나는가? 교훈을 직접 설명하는 문장("~을 깨달았어요" 류)이 하나도 없는가?' },
  { label: '장면 내 사건 진행', question: '모든 장면 안에서 실제 사건이 진행되는가? 인물이 가만히 있고 묘사만 하는 정지된 페이지가 없는가?' },
  { label: '마지막 문장의 힘', question: '마지막 문장이 다시 읽고 싶은 문장인가? 여운이 있고, 설명으로 끝나지 않는가?' },
] as const;

const SCENE_SCHEMA = `{
  "cast": [
    {
      "id": "장면 characters에 쓰는 짧은 영문 id (예: rabbit_kori)",
      "name": "인물의 한국어 이름",
      "description": "성격 + 그림으로 그릴 수 있는 겉모습 (색·체형·소품 포함, 2~3문장 한국어)"
    }
  ],
  "scenes": [
    {
      "sceneNumber": 1,
      "beat": "이 장면의 비트 이름 (선택한 패턴의 비트 배치에서 가져올 것)",
      "text": "이 장면의 본문. 대상 연령이 낭독으로 듣기 좋은 1~4문장.",
      "characters": ["등장 캐릭터의 짧은 영문 id — 반드시 cast의 id 중에서"],
      "location": "장소 (한국어, 간결하게)",
      "emotion": "이 장면의 감정 (한국어, 간결하게)",
      "visualFocus": "그림이 포착해야 할 한 가지 시각적 초점 (한국어)",
      "preferredTextArea": "upper-left | upper-center | upper-right | center-left | center | center-right | lower-left | lower-center | lower-right 중 하나 — 글이 놓일 위치. 그림의 초점을 피해서 고를 것"
    }
  ]
}`;

/** 초안 생성용 시스템 프롬프트 */
export function buildStorySystemPrompt(input: StoryMetaInput): string {
  return [
    `너는 한국어 그림책 작가다. 서점 매대에 놓여도 어색하지 않은, 재미와 감동이 있는 동화를 쓴다.`,
    ``,
    `## 이야기의 뼈대로 삼을 플롯 패턴`,
    `아래 패턴의 감정 곡선과 ${input.sceneCount}장면 비트 배치를 뼈대로 삼되, 문장과 설정은 온전히 새로 지어라.`,
    ...([8, 12, 16].includes(input.sceneCount)
      ? []
      : [
          `패턴의 비트 배치는 8/12/16장면 기준이다. ${input.sceneCount}장면에 맞게 가장 가까운 배치를 기준으로 ` +
            `비트를 자연스럽게 늘리거나 합쳐 재배치하라 — 감정 곡선의 순서와 절정의 위치(후반 3/4 지점)는 유지할 것.`,
        ]),
    ``,
    ...input.patternMarkdowns.map((md) => `---\n${md.trim()}\n---`),
    ``,
    `## 절대 금지 목록 (하나라도 어기면 실패작이다)`,
    ...FORBIDDEN_LIST.map((rule, i) => `${i + 1}. ${rule}`),
    ``,
    `## 통과해야 할 기준`,
    ...QUALITY_GATE_CRITERIA.map((c, i) => `${i + 1}. [${c.label}] ${c.question}`),
    ``,
    `## 작법 지침`,
    `- 대상 연령: ${input.targetAge}. 이 나이가 듣고 이해하는 어휘로, 그러나 유치하지 않게.`,
    `- 분량: 정확히 ${input.sceneCount}개 장면. 장면당 본문 1~4문장.`,
    `- 원하는 느낌: ${input.desiredMood}`,
    `- 1장면부터 곧장 사건으로 시작하라. 배경 설명·인물 소개로 시작하지 마라.`,
    `- 장면마다 인물이 무언가를 하게 하라. 그림으로 그릴 수 있는 구체적 행동과 사물을 담아라.`,
    `- 의성어·의태어·반복 구절을 아껴서, 그러나 효과적인 자리에 써라. 낭독하는 어른과 듣는 아이가 함께 즐거워야 한다.`,
    `- 유명 동화의 문장·캐릭터·고유 설정을 가져오지 마라. 구조만 빌리고 살은 전부 새로 지어라.`,
    ``,
    `## 출력 형식`,
    `아래 JSON만 반환하라. 마크다운 코드펜스, 설명, 그 외 텍스트 금지.`,
    SCENE_SCHEMA,
  ].join('\n');
}

/** 초안 생성용 유저 프롬프트 */
export function buildStoryUserPrompt(input: StoryMetaInput): string {
  return [
    `아이디어: ${input.idea}`,
    `대상 연령: ${input.targetAge} / 분량: ${input.sceneCount}장면 / 원하는 느낌: ${input.desiredMood}`,
    `이 아이디어로 ${input.sceneCount}장면 동화를 JSON으로 써라.`,
  ].join('\n');
}

/** 품질 게이트 채점용 시스템 프롬프트 */
export function buildGateSystemPrompt(): string {
  return [
    `너는 어린이 그림책 전문 편집자다. 주어진 동화 원고를 아래 5가지 기준으로 냉정하게 채점한다.`,
    `기준을 확실히 충족할 때만 pass다. 애매하면 fail로 판정하고 이유를 적어라.`,
    ``,
    ...QUALITY_GATE_CRITERIA.map((c, i) => `${i + 1}. [${c.label}] ${c.question}`),
    ``,
    `추가로, 다음 금지 목록 위반이 보이면 해당 기준을 fail 처리하고 note에 위반 문장을 인용하라:`,
    ...FORBIDDEN_LIST.map((rule, i) => `- ${rule}`),
    ``,
    `아래 JSON만 반환하라. 코드펜스·설명 금지.`,
    `{`,
    `  "items": [`,
    `    { "label": "기준 이름 (위 5개 이름 그대로)", "passed": true, "note": "판정 근거 한두 문장. fail이면 문제 장면 번호와 인용 포함" }`,
    `  ]`,
    `}`,
  ].join('\n');
}

/** 게이트 미달 항목 self-repair용 시스템 프롬프트 */
export function buildRepairSystemPrompt(failedItems: { label: string; note?: string }[]): string {
  return [
    `너는 한국어 그림책 작가다. 아래 원고는 품질 게이트에서 다음 항목이 미달 판정을 받았다.`,
    ``,
    ...failedItems.map((it) => `- [${it.label}] ${it.note ?? ''}`),
    ``,
    `미달 항목만 고치기 위해 필요한 최소한의 장면만 수정하라. 잘 된 장면은 그대로 두어라.`,
    `"locked": true 표시가 있는 장면은 사용자가 직접 쓴 문장이므로 절대 수정하지 마라 — 원문 그대로 반환하라.`,
    ``,
    `## 절대 금지 목록`,
    ...FORBIDDEN_LIST.map((rule, i) => `${i + 1}. ${rule}`),
    ``,
    `장면 수·sceneNumber·beat는 유지하고, 아래 JSON만 반환하라. 코드펜스·설명 금지.`,
    SCENE_SCHEMA,
  ].join('\n');
}

/** 장면 단건 재생성용 시스템 프롬프트 */
export function buildSceneRegenSystemPrompt(): string {
  return [
    `너는 한국어 그림책 작가다. 완성된 동화에서 한 장면만 사용자의 지시에 따라 다시 쓴다.`,
    `앞뒤 장면과 자연스럽게 이어져야 하고, 인물·장소·톤은 책 전체와 일치해야 한다.`,
    ``,
    `## 절대 금지 목록`,
    ...FORBIDDEN_LIST.map((rule, i) => `${i + 1}. ${rule}`),
    ``,
    `sceneNumber와 beat는 유지하라. 아래 JSON(장면 1개 객체)만 반환하라. 코드펜스·설명 금지.`,
    `{`,
    `  "sceneNumber": 1, "beat": "...", "text": "...", "characters": ["..."],`,
    `  "location": "...", "emotion": "...", "visualFocus": "...", "preferredTextArea": "..."`,
    `}`,
  ].join('\n');
}
