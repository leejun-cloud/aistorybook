# StoryBloom (valleylmh/storybloom) 코드 분석 — aistorybook PRD v2.0 대조

- 분석 대상: `https://github.com/valleylmh/storybloom` (git clone --depth 1, 2026-08-31 시점 HEAD)
- 스택: Next.js(App Router) + TypeScript + Supabase, OpenAI 호환 텍스트 API(중계) + DashScope/Agnes/CPA(GPT-Image) 등 멀티 이미지 프로바이더
- 제품: "한 문장 → 8페이지 중/영 이중언어 그림책" (가족 인물·성장기록 특화, aistorybook과 도메인은 다르지만 스토리·캐릭터 일관성·페이지 잡 파이프라인은 거의 동일 문제)
- 핵심 파일:
  - `src/lib/story-generator.ts` (1780줄) — 스토리 텍스트 생성 시스템/유저 프롬프트, beat map, 컨트랙트 재시도
  - `src/lib/story-visual-bible.ts` (194줄) — Visual Bible(캐릭터 락) 생성·포맷
  - `src/lib/image-generator.ts` (2296줄) — 이미지 프로바이더 라우팅, 레퍼런스 이미지 합성, 재시도
  - `src/app/api/generate/route.ts`, `src/app/api/illustration/route.ts` — 잡 오케스트레이션 API
  - `src/types/index.ts` — StoryInput / StoryPage / GeneratedStory 스키마

---

## 1. 스토리 생성 파이프라인

### 1.1 시스템 프롬프트 전문 (`src/lib/story-generator.ts` 약 1583~1631행)

```
You are an expert children's picture-book author.
Create a vivid, emotionally warm, commercial-quality 8-page children's picture book.

Rules:
- Age group: ${input.ageGroup}
- ${AGE_GUIDELINES[input.ageGroup]}
- Theme: ${themeDescription}
- Character: ${input.childName}
- ${characterDescription}
- Selected family character bible:\n${familyCharacterBible}
- Fixed story visual bible:\n${formatStoryVisualBible(visualBible)}
${input.personalizationAnchor ? `- Parent-confirmed character Anchor: ...` : ""}
${personalizationRules}
${growthStoryRules || ""}
- Creative seed for this request: ${creativeSeed}
${storyDirectionRules}
- The cover title must be concise, vivid, and recognizable. Include at least one concrete action, place, or key prop from this exact story. Avoid generic titles such as "快乐的一天", "奇妙之旅", "成长故事", "A Happy Day", or "A Wonderful Journey".
- If a character reference is provided, treat it and the fixed story visual bible as binding. Do not change gender presentation, haircut, hair color, face shape, facial proportions, body proportions, exact outfit, outfit colors, patterns, footwear, or visual age between pages.
- Never invent a wardrobe change merely to match a new scene. If a page-level illustrationPrompt conflicts with the fixed outfit lock, the outfit lock wins.
- Keep one coherent illustration style across the full book: same brush texture, palette, lighting softness, line quality, and level of detail.
- Respect language mode: ${input.language}
- Narrative perspective: ${usesFirstPerson(input) ? "FIRST PERSON" : "third person"}.
${...1인칭/3인칭 분기...}
- Use concrete sensory detail on every page: visible action, setting, emotion, and one memorable image.
- Keep the story safe for ages 3-8: no violence, horror, humiliation, weapons, medical distress, or adult themes.
- Chinese text should be rhythmic and easy for parents to read aloud.
- English text should be simple, natural, and age-appropriate; avoid mixed Chinese-English sentences.
- Each page must advance the story. Avoid generic moralizing.
- Follow this exact 8-page story beat map:
${storyBeatMap.map((beat, index) => `  ${index + 1}. ${beat}`).join("\n")}
- Every illustrationPrompt must describe a concrete storybook scene, not a character portrait.
- Every page must include a castIds array. Use only ids from the selected family character bible. ...
- Every illustrationPrompt must include: setting, props, visible action, emotion, camera distance, composition, style, and "no text in image".
- Character consistency is important, but the child must change pose, gesture, facial expression, and placement to match the story moment. Do not repeat a front-facing bust portrait. The child should usually take only 25-45% of the image so the scene can tell the story.
- Before returning JSON, audit all 8 pages together: the same person must keep the same face, apparent age, hairstyle, exact outfit, footwear, and recurring key props; no toy, bag, book, blanket, food container, or other carried object may change design or disappear without a story reason.

Return only valid JSON:
{
  "coverTitle": "string",
  "pages": [
    { "page": 1, "zhText": "string", "enText": "string", "illustrationPrompt": "string", "castIds": [...] }
  ]
}
```

유저 프롬프트(같은 파일, 약 1632~1650행)는 `childName`, 1인칭 여부, 일러스트 스타일, `creativeSeed`(매 요청 랜덤 문자열), 커스텀/장르 방향, 선택적 아이 정보를 한 줄로 이어붙이고 "JSON만 반환, 마크다운 금지"로 마무리.

**8-비트 구조** (`STORY_BEATS`, 50~59행): 오프닝→정착→몰입→전개→변주→하이라이트→마무리→클로징. 별도로 실사 가족 성장기록용 `DOCUMENTARY_STORY_BEATS`(61~69행)가 있어 "허구적 장애물/교훈 금지, 사실 그대로" 버전을 분리해둠.

**모델**: 텍스트 = `gemini-3-flash`(CPA 중계, `DEFAULT_CPA_STORY_MODEL`) 또는 `agnes-2.5-flash`. 이미지 = DashScope(Qwen 계열), Cloudflare, HuggingFace, CPA(GPT-Image) 등 다중 프로바이더를 가중치+폴백 순서로 라우팅(`getWeightedImageProviders`, `getProviderFallbackOrder`).

**품질 게이트 / 재시도**: `generateStoryText`는 JSON 파싱·서사 정합성(`isCustomStoryAligned`, `isNarrativePerspectiveAligned`) 실패 시 `MAX_STORY_TEXT_CONTRACT_ATTEMPTS`만큼 "이전 응답 + 수정 지시(`getStoryTextRepairInstruction`)"를 낮은 temperature로 재요청하는 self-repair 루프를 돈다. PRD v2.0의 "품질 게이트 → AI 1회 자가수정" 설계와 원리가 동일.

**"AI 티" 제거 전략의 차이**: StoryBloom은 금지목록을 프롬프트에 명시하지 않고, 대신 (a) 매 요청 랜덤 `creativeSeed` + `RANDOM_STORY_DIRECTIONS`에서 뽑은 setting/object/helper/obstacle/action 조합으로 "이전 생성과 다른 이야기"를 강제하고 (b) temperature/topP를 커스텀 테마 0.68 / 자유 테마 0.95로 다르게 준다. PRD v2.0의 "금지 목록 명시" 방식과는 결이 다르지만 상호 보완 가능(반복 패턴 회피는 StoryBloom 쪽이 더 구체적).

---

## 2. Visual Bible / 캐릭터 일관성 (`src/lib/story-visual-bible.ts`)

`StoryVisualBible` 구조:
```ts
{
  version: 1,
  seriesStyleLock: string,   // 스타일별 고정 렌더링 문구 (watercolor/cartoon/fairytale)
  paletteLock: string,       // 스타일별 고정 팔레트 문구
  continuityPolicy: string,  // "매 페이지는 이전 페이지가 아니라 이 bible에서 독립 생성" + 소품 추적 정책
  characters: [{
    id, name,
    identityLock: string,    // 얼굴형·헤어·피부톤·체형 등 고정
    outfitLock: string,      // 의상 고정 (테마별 특수 처리 포함, 아래)
    referenceGuidance: string, // 실사 레퍼런스 vs 캐노니컬 카툰 레퍼런스 중 무엇이 우선인지
  }]
}
```

핵심 아이디어 3가지:

1. **테마 감지형 의상 고정**: 정규식으로 "취침/수영" 등 테마를 감지해(`FIXED_OUTFIT_PATTERNS`) 페이지마다 무작위로 잠옷/수영복이 바뀌는 걸 막는 사전 정의 의상 세트(`SLEEP_OUTFITS`, `POOL_OUTFITS`, 캐릭터 인덱스로 결정론적 배정)를 프롬프트에 박아 넣는다. 순수 텍스트 지시보다 훨씬 강함.
2. **레퍼런스 우선순위 명시**: 실사 사진(`sourceReferenceAssetPath`)과 확정 카툰 레퍼런스(`canonicalReferenceAssetPath`)가 둘 다 있을 때 "실사=얼굴 정체성/나이/피부톤 권위, 카툰=헤어 실루엣/체형/렌더링 권위, 의상은 텍스트 락이 최종 승자"로 역할을 분리(`getReferenceGuidance`). PRD v2.0 §2.2가 "레퍼런스 1장 + 텍스트 DNA 보강"이라 명시한 것과 정확히 같은 발상이나, StoryBloom은 레퍼런스 소스가 2개(실사/카툰)일 때의 우선순위 충돌까지 명시적으로 해결해둔 점이 더 정교함.
3. **소품 연속성 정책(`getRecurringPropPolicy`)**: 좋아하는 장난감/음식/부모가 확인한 사실을 "RECURRING TOY LOCK", "FOOD PROP LOCK"으로 별도 태깅해 "한 번 등장한 소품은 스토리상 명시적으로 내려놓기 전까진 디자인이 바뀌면 안 된다"고 강제. `formatStoryVisualBible()`은 `castIds`로 해당 페이지에 등장하는 캐릭터의 락만 필터링해 프롬프트 토큰을 절약한다(`castIdSet` 필터).

`continuityPolicy` 문구가 인상적: *"Treat every illustration as an independent scene generated from this same fixed bible, never from the previous page."* — 즉 페이지-투-페이지 체이닝(이전 이미지를 조건으로 다음 이미지 생성)이 아니라 **매번 같은 고정 bible을 참조하는 독립 생성** 방식. 체이닝은 에러가 누적되는데, 고정 소스 방식은 그 문제를 원천 차단한다.

---

## 3. 이미지 생성 입력 구성 (`src/lib/image-generator.ts`)

- 프로바이더별로 프롬프트 앞에 **"스토리 장면이지 인물 초상이 아니다"**를 강제하는 하드코딩된 헤더를 붙인다(예: DashScope용, 1157~1164행):
  > "Highest priority: create a story scene, not a character portrait. ... the child should not fill the whole frame; usually show full body or three-quarter body and keep the child around 25-45%..."
  이는 스토리 생성 프롬프트의 `STORYBOOK_COMPOSITION_RULES`(story-generator.ts)와 이미지 생성 프롬프트 양쪽에 이중으로 박아 넣어 일관성 강제를 텍스트 단계 + 이미지 단계 양쪽에서 시도한다.
- `SHOT_PLAN`(story-generator.ts 71~79행): 페이지별로 "cover 3/4바디 → wide establishing → medium discovery → dynamic action → obstacle → climax → group → quiet ending" 식으로 카메라/구도를 page index에 고정 배정. 매 페이지가 같은 정면 초상이 되는 걸 방지하는 8단계 샷 플랜.
- 레퍼런스 이미지는 멀티모달 메시지의 `image` 파트로 직접 첨부(`{ image: referenceImage }, { text: promptText }`), family character별 레퍼런스는 캐싱(`rememberFamilyReference`)해 재요청 비용을 줄인다.
- 이미지 프로바이더는 가중치 폴백 체인(`getWeightedImageProviders`, `getProviderFallbackOrder`, `getImageToImageFallbackOrder`)으로 구성되어 1차 프로바이더 실패 시 자동으로 다음 프로바이더로 넘어간다. `canUseDemoImages()`는 모든 프로바이더 미설정/실패 시 데모 이미지로 폴백(`createDemoImage`) — 개발/로컬 환경에서 파이프라인이 완전히 막히지 않게 하는 안전장치.

---

## 4. 페이지별 생성·재시도 / 잡·상태 관리

`StoryPage.imageStatus`(`src/types/index.ts` 196~224행) 상태값과 메타데이터:
```ts
imageStatus?: ImageStatus;         // pending | demo | complete | failed 등
imageError?: string;
imagePlannedProvider?: ImageProvider;
imageProvider?: ImageProvider;      // 실제 사용된 프로바이더 (계획과 다를 수 있음)
imageStartedAt?: string;
imageAttemptId?: string;            // 늦게 도착하거나 중복인 워커 응답을 거부하기 위한 불투명 클레임 토큰
imageDurableJob?: boolean;          // 큐 소유 여부(ack 모호할 때도 true 유지)
imageJobId?: string;                // 상태 폴링용 잡 포인터
imageCompletedAt?: string;
imageDurationMs?: number;
imageRequestCount?: number;
imageRetryCount?: number;
imageAttempts?: ImageAttemptMetric[]; // 시도별 이력 배열
imageQuality?: IllustrationQualityReport;
```

`src/app/api/illustration/route.ts`의 핵심 패턴:
- **페이지 단위 잡**: `POST`는 단일 페이지 하나만 재생성 요청("이 페이지만 다시")을 받는다. `isRetry` 플래그는 `imageStatus`가 `failed`/`complete`일 때 자동 감지되고, 재시도할 때마다 `imageRetryCount`를 증가시킨다(169~190행 부근).
- **경합 방지**: `imageAttemptId`로 클레임을 발급하고, 늦게 도착한 워커의 응답이나 중복 응답을 거부(`matchesIllustrationGenerationJob`, `isMatchingIllustrationPageJob`).
- **durable job 복구**: `isPastDurableRecoveryThreshold`로 오래 `pending`인 잡을 감지해 `failed`로 강등하고 재시도 가능 상태(`retryable`)로 전환 — 워커가 죽어도 영원히 pending에 머무르지 않게 하는 타임아웃 기반 복구.
- **개별 실패가 전체를 막지 않음**: `story.status`(전체 책 상태)는 `pages.some(pending|demo)` 여부로만 계산되고, 개별 페이지 `failed`는 그 페이지만의 상태로 남아 나머지 페이지 진행과 독립적이다 — PRD v2.0 §3.1 "실패한 페이지만 재시도, 한 페이지 실패가 책 전체를 막지 않는다"와 정확히 같은 설계.
- **속도 제한**: `getIllustrationRateLimitPerStory()`로 스토리당 재생성 요청 횟수 제한(429 + `Retry-After` 헤더).

---

## 5. 전체 아키텍처

```
src/app/api/
  generate/route.ts       스토리 텍스트 생성 오케스트레이션 (잡 생성, 컨트랙트 재시도, 캐릭터 인식 연동)
  illustration/route.ts   페이지별 이미지 생성 잡 (GET=상태 폴링, POST=생성/재시도)
  character-recognition/  업로드 사진 → 캐릭터 인식/DNA 추출
  pollinations-image/     보조 이미지 프로바이더
  story-assets/, audio/, share/, cron/, webhooks/ ...

src/lib/
  story-generator.ts      시스템/유저 프롬프트 조립, beat map, JSON 컨트랙트 재시도
  story-visual-bible.ts   Visual Bible 생성/포맷 (캐릭터 락)
  image-generator.ts      멀티 프로바이더 이미지 생성, 레퍼런스 합성, 재시도/폴백
  repositories/, persistence/, sync/   Supabase 영속화 + 로컬 캐시 동기화
  reader/                 낭독(TTS), 페이지 리더
  library/                기존 콘텐츠 라이브러리(시리즈, 삼자경 등 프리셋 소스북)

src/types/index.ts        StoryInput / StoryPage / GeneratedStory / StoryVisualBible 스키마
supabase/                 DB 마이그레이션 (Postgres)
```

데이터 모델은 파일시스템 JSON이 아니라 **Supabase(Postgres)** 기반이며, `revision`(모놀리식 CAS: compare-and-swap) 필드로 동시 쓰기 충돌을 방지한다(`GeneratedStory.revision`).

---

## 6. StoryPage 스키마 전문 (참고용)

```ts
export interface StoryPage {
  page: number;
  zhText: string;
  enText: string;
  illustrationPrompt: string;
  castIds?: string[];
  imageUrl?: string;
  imageStatus?: ImageStatus;
  imageError?: string;
  imagePlannedProvider?: ImageProvider;
  imageProvider?: ImageProvider;
  imageStartedAt?: string;
  imageAttemptId?: string;
  imageDurableJob?: boolean;
  imageJobId?: string;
  imageCompletedAt?: string;
  imageDurationMs?: number;
  imageRequestCount?: number;
  imageRetryCount?: number;
  imageAttempts?: ImageAttemptMetric[];
  imageQuality?: IllustrationQualityReport;
  sampleImage?: SampleImageAssets;
}
```

---

## 7. PRD v2.0 대조 — [흡수] / [참고] / [배제]

### [흡수] 그대로 또는 변형해 가져올 것

1. **8-비트 스토리 구조를 실제 코드로 프롬프트에 박는 패턴** — `STORY_BEATS` 배열(story-generator.ts 50~59행)을 그대로 PRD v2.0의 `patterns/*.md` 플롯 패턴 라이브러리 구현체의 참고 템플릿으로 사용. 특히 "Page 1: 제목/전제를 반복하지 말고 즉시 사건 시작" 같은 구체적 실패 방지 지침은 PRD의 "금지 목록"에 그대로 편입 가능.
2. **Visual Bible의 `continuityPolicy` 원칙** (`story-visual-bible.ts` 161행) — "매 삽화는 이전 페이지가 아니라 항상 같은 고정 bible에서 독립 생성"이라는 명시적 선언을 프롬프트에 넣는 것. PRD v2.0 §2.2/§3.1의 "확정 레퍼런스 1장 + 장면별 조건부 생성" 설계에 이 문구를 그대로 흡수하면 이미지 생성 모델이 페이지 체이닝(누적 오차)로 흐르는 걸 방지.
3. **소품 연속성 락(RECURRING TOY/FOOD LOCK)** — PRD에는 캐릭터 외형 고정만 있고 소품(가방·인형 등) 연속성 규칙이 없음. `getRecurringPropPolicy()`(image visual bible 117~142행) 패턴을 그대로 이식 — "한 번 등장한 핵심 소품은 명시적 서사 사건 없이 디자인이 바뀌거나 사라지면 안 된다."
4. **실사 vs 확정 레퍼런스 우선순위 해소 로직** (`getReferenceGuidance()`, story-visual-bible.ts 61~75행) — PRD §2.3에서 검증하려는 "레퍼런스 1장으로 충분한가" 리스크에 대한 보조 대책. 레퍼런스가 2종(원본 사진 + 확정 카툰) 있을 때 각각 무엇을 권위로 삼을지 텍스트로 명시하는 방식은 그대로 채택 가치 있음.
5. **StoryPage 상태 필드 세트** (`imageStatus/imageAttemptId/imageDurableJob/imageJobId/imageRetryCount/imageAttempts`) — PRD v2.0의 "페이지별 생성 잡" 설계(§3.1, §5 작업 큐)에 그대로 이식 가능한 스키마. 특히 `imageAttemptId`(경합 방지 클레임 토큰)와 `isPastDurableRecoveryThreshold`(pending 타임아웃 자동 강등) 패턴은 BullMQ/단순 잡 테이블 어느 쪽을 택하든 반드시 필요한 안전장치이므로 흡수 권장.
6. **8단계 샷 플랜(`SHOT_PLAN`)과 "25~45% 프레임 점유, 정면 흉상 반복 금지" 구도 규칙** — PRD §3.1의 "조판 예약 영역은 배경을 단순하게"와 결합 가능. 정면 인물 반복(여권사진화)은 그림책 이미지 생성에서 흔한 실패 모드인데 StoryBloom은 이를 텍스트/이미지 프롬프트 양쪽에서 명시적으로 막고 있어 그대로 채택할 가치가 큼.
7. **JSON 컨트랙트 self-repair 재시도 루프**(`generateStoryText`, contractFailure/previousResponse/repair instruction) — PRD의 "자동 품질 게이트 실행 → 미달 항목은 AI가 스스로 1회 수정"(§1.2)을 그대로 코드화한 참고 구현. 이전 응답 전문을 다시 넣고 낮은 temperature로 재시도하는 방식은 그대로 이식 가능.

### [참고] 개념만 참고할 것

1. **테마 감지형 의상 고정 세트(SLEEP_OUTFITS/POOL_OUTFITS)** — StoryBloom은 정규식으로 테마를 감지해 하드코딩된 의상 문자열 풀에서 결정론적으로 배정한다. aistorybook은 도메인이 가족 성장기록이 아니라 범용 그림책이라 테마 종류가 훨씬 다양하므로, 하드코딩 세트 대신 "확정 캐릭터 레퍼런스에서 의상을 고정 파싱해 텍스트 DNA로 저장"(PRD §2.2가 이미 채택한 방식)이 더 일반적. 다만 "테마가 의상을 바꿔야 하는 특수 케이스(잠옷/수영복 등)를 감지해 대응"하는 발상 자체는 참고할 가치 있음.
2. **랜덤 `creativeSeed` + `RANDOM_STORY_DIRECTIONS`로 반복 패턴 회피** — PRD v2.0은 "금지 목록"으로 AI 티를 제거하려 하는데, StoryBloom처럼 "같은 테마라도 배경/오브젝트/조력자/장애물 조합을 매번 랜덤 선택"하는 방식은 "판에 박힌 스토리(예: 반딧불 정원 남발)"를 막는 보완책으로 참고할만함. 단, PRD는 플롯 패턴 라이브러리(quest/transformation/friendship 등)가 이미 이 역할을 어느정도 하므로 필수 흡수는 아님.
3. **멀티 이미지 프로바이더 가중치 폴백 체인** — PRD v2.0 §5는 "어댑터 구조로 공급자 교체 가능"만 명시. StoryBloom의 실제 구현(DashScope/Cloudflare/HuggingFace/CPA 가중치+순서 폴백, 프로바이더별 프롬프트 헤더 분기)은 나중에 이미지 생성 신뢰성을 높이려 할 때 설계 참고용으로 남겨두되, MVP 단계에서는 Gemini 이미지 생성 단일 프로바이더로 충분(PRD §2.3 검증 우선).
4. **데모 이미지 자동 폴백(`canUseDemoImages`)** — 로컬/개발 환경에서 이미지 API 미설정 시 자동으로 목업 이미지를 채우는 패턴은 개발 편의성 측면에서 참고할만하나 PRD 범위 밖.

### [배제] 우리 설계와 충돌하거나 불필요한 것

1. **Supabase(Postgres) 기반 영속화, `revision` 필드의 CAS 동시성 제어** — PRD v2.0 §5는 MVP를 "파일시스템 + 프로젝트 JSON"으로 명시. StoryBloom은 다중 사용자 SaaS(가족 계정, 공유 링크, 크론잡, 웹훅)를 전제로 한 아키텍처라 동시성 제어가 필수였지만, aistorybook MVP는 단일 사용자 로컬 세션이므로 이 복잡도는 불필요. 후속 PostgreSQL 전환 시점에는 재검토.
2. **가족 캐릭터 인식(character-recognition API), 성장기록/Documentary 트리트먼트, 뉴스레터·크론·웹훅** — StoryBloom 고유의 "가족 성장 앨범" 도메인 기능으로 aistorybook의 "학생/교사/작가용 범용 동화책 제작 스튜디오" 정체성과 무관. 배제.
3. **1인칭/3인칭 내레이션 자동 분기, 중/영 이중언어 동시 생성** — aistorybook PRD는 이중언어나 시점 선택을 요구사항으로 명시하지 않음(한국어 단일 언어, 3인칭 기본으로 추정). 코드 유지보수 부담만 늘리므로 지금 단계에서는 배제하고 필요해지면 그때 스키마에 추가.
4. **Konva/Fabric 등 자유 편집 관련 코드 없음(해당 없음)** — StoryBloom에는 조판/슬롯 편집 UI 자체가 없다(그림+텍스트를 고정 레이아웃으로만 렌더링). 따라서 PRD v2.0 파트4(슬롯 편집, MCP 편집 도우미, bookforge 조판 이식)에 참고할 코드가 이 레포에는 없음 — 이 부분은 계속 bookforge/lecture-video 자산에 의존.
5. **삼자경(sanzijing) 등 프리셋 콘텐츠 라이브러리 모듈** — 저작권 있는 고전 콘텐츠 재구성 기능으로, PRD v2.0 §2.1의 "저작권 원칙(원작 캐릭터·문장·로고·고유 구도는 생성 입력에서 제외)"과 상충 소지가 있어 참고하지 않음.

---

## 핵심 발견 요약 (5줄)

1. StoryBloom의 시스템 프롬프트는 "금지 목록 + 8비트 구조 + 캐릭터/소품 락 + 구도 규칙"을 한 프롬프트에 모두 욱여넣는 방식으로, PRD v2.0의 메타프롬프트 설계와 철학이 사실상 같다.
2. Visual Bible의 결정적 문구는 "매 페이지를 이전 페이지가 아니라 항상 같은 고정 bible에서 독립 생성하라"는 선언이며, 이는 페이지 체이닝의 오차 누적을 막는 핵심 장치로 PRD에 곧바로 흡수 가능하다.
3. 캐릭터 외형뿐 아니라 "소품(장난감/음식) 연속성 락"까지 별도로 챙기는데, 이는 PRD에 없는 개념이라 반드시 추가해야 할 항목이다.
4. 페이지별 잡 상태 스키마(`imageAttemptId`, `imageDurableJob`, `imageRetryCount`, pending 타임아웃 자동 강등)는 "실패 페이지만 재시도, 한 페이지가 전체를 막지 않는다"는 PRD 원칙을 실제로 구현하는 데 필요한 최소 필드 세트를 보여준다.
5. StoryBloom에는 조판/슬롯 편집 기능이 아예 없으므로, aistorybook의 파트3(조판) · 파트4(편집)는 이 레포가 아니라 계속 bookforge/lecture-video 자산에서 가져와야 한다.
