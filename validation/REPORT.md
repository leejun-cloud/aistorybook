# 0단계 기술 검증 — Gemini 이미지 생성 캐릭터 일관성 (PRD §2.3)

**검증일:** 2026-08-31
**검증자:** Claude (자동)
**총 API 호출 수:** 6회 (레퍼런스 1 + 장면 5) — 20회 제한 내

---

## 1. 사용한 모델 / 엔드포인트

- **모델 목록 확인:** `GET https://generativelanguage.googleapis.com/v1beta/models?key=$KEY` (실제 API 응답 기준)
  - 이 키에서 이미지 생성을 지원하는 모델(`generateContent` 지원): `gemini-2.5-flash-image`, `gemini-3-pro-image-preview`, `gemini-3-pro-image`, `gemini-3.1-flash-image-preview`, `gemini-3.1-flash-image`, `gemini-3.1-flash-lite-image`
  - **Imagen 계열은 이 키에 노출되지 않음** (imagen-* 모델 없음)
- **검증에 실제로 사용한 모델:** `gemini-2.5-flash-image` ("nano-banana" 계열, 텍스트+이미지 멀티모달 입력/출력이 가장 널리 문서화된 모델)
- **호출 엔드포인트:** `POST https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=$KEY`
- **요청 구조:** `contents[0].parts` = `[{inlineData: {mimeType: "image/png", data: <base64 레퍼런스>}}, {text: <프롬프트>}]`, `generationConfig.responseModalities: ["IMAGE","TEXT"]`
- 참고: 더 최신 `gemini-3.1-flash-image`(preview 아님, GA로 보임)와 `gemini-3-pro-image`도 이 키로 사용 가능하나, 6회 호출 모두 1차 후보인 `gemini-2.5-flash-image`로 충분히 PASS하여 재시도하지 않았음. 실제 구현 시 두 모델을 A/B 비교해 볼 가치 있음(§6 권고 참고).

---

## 2. 절차

1. 텍스트 프롬프트만으로 레퍼런스 1장 생성 (`results/ref.png`)
2. 레퍼런스 이미지(base64 inlineData) + 장면별 텍스트를 함께 전달하여 5개 장면 연속 생성 (`results/scene-1.png` ~ `scene-5.png`)
3. 모든 요청에 고정 접두어 사용:
   > "Keep the exact same character as in the reference image: same face shape and expression style, same blue overalls, same red backpack, same warm watercolor children's storybook illustration style with soft textures and gentle line art."

---

## 3. 장면별 일관성 평가표

| 장면 | 내용 | 얼굴형 | 멜빵바지(파란색) | 빨간 가방 | 화풍(수채화) | 판정 | 관찰 |
|---|---|---|---|---|---|---|---|
| ref | 기준 레퍼런스 | - | - | - | - | - | 흰 배경, 전신, 또렷한 눈매·주둥이 |
| scene-1 | 숲길 걷기 | 유지 | 유지 | 유지 (착용) | 유지 | **유지** | 옆모습이라 얼굴 윤곽이 살짝 더 각지지만 동일 캐릭터로 명확히 인식됨 |
| scene-2 | 폭풍우 속 공포 | 부분 훼손 | 유지 | 유지 (착용) | 유지 | **부분훼손** | 귀가 레퍼런스보다 더 길고 처짐(무서워하는 포즈 영향으로 추정), 겁먹은 표정 자체는 훌륭하게 표현됨 |
| scene-3 | 다람쥐 포옹 | 유지 | 유지 | 유지 (착용) | 유지 | **유지** | 눈매·주둥이 라인이 레퍼런스와 거의 동일. 포옹이 아닌 손잡기 포즈로 나왔으나(프롬프트 이행 이슈, 일관성과 무관) 캐릭터 자체는 매우 일치 |
| scene-4 | 절벽 결심 | 유지 | 유지 | 유지 (착용) | 유지 | **유지** | 6장 중 레퍼런스와 얼굴이 가장 가까움. 바람에 날리는 털 표현으로 장면감 부여 |
| scene-5 | 석양 뒷모습 | 유지(추정) | 유지 | 유지 (착용, 두드러짐) | 유지 | **유지** | 뒷모습이라 얼굴 정면 비교 불가하나 귀·몸 비율·색감 일치. 발 색이 살짝 진하게 나왔으나 미세한 차이 |

**요약: 5장 중 4장 "유지", 1장(scene-2) "부분훼손"(귀 형태 변형, 나머지 고정요소는 유지).**

---

## 4. 종합 판정: **PASS**

기준: 5장 중 4장 이상 일관 → 충족(4/5 완전 유지, 1/5 부분훼손이나 핵심 식별요소인 멜빵바지·가방·화풍은 전 장면에서 100% 유지).

레퍼런스 이미지 1장 + 텍스트만으로 서로 다른 5개 장면(각도·감정·조명·구도가 크게 다름)에 걸쳐 캐릭터 정체성이 실사용 가능한 수준으로 유지됨을 확인. PRD §2.3의 "확정 레퍼런스 1장 + 장면별 레퍼런스 조건부 생성" 설계가 유효함.

---

## 5. 응답 시간 / API 제약 관찰

- **응답 시간:** 레퍼런스 7.6초, 장면별 10.8~13.8초 (평균 약 11.2초). 6회 호출 모두 200 OK, `finishReason: STOP`.
- **해상도:** 모든 출력이 **1024×1024 고정**. 이번 요청에서 별도 해상도/종횡비 파라미터를 지정하지 않았음 — `imageConfig` 등으로 커스텀 가능한지는 이번 검증 범위 밖(추가 확인 필요).
- **토큰/과금 신호:** `usageMetadata`에 `candidatesTokenCount: 1290` (IMAGE modality)로 이미지 1장당 거의 고정된 토큰 비용이 잡힘. 레퍼런스 이미지를 입력으로 넣을 때 `promptTokensDetails`에 IMAGE 258토큰이 추가로 잡힘(레퍼런스 재사용 비용). 응답 헤더에서는 별도의 요금/쿼터 헤더(`x-ratelimit-*` 등)는 노출되지 않음 — 표준 HTTP 헤더만 확인됨.
- **이미지 내 텍스트:** 6장 모두 이미지 안에 글자가 삽입되지 않음 (PRD의 "이미지 안 글자 금지" 요건과 자연히 부합).
- **키 권한:** 이번 키는 이미지 생성 모델 6종에 정상 접근 가능했음 — 별도 결제/권한 이슈 없음.
- **모델 후보:** 이 키에서 `gemini-3-pro-image`, `gemini-3.1-flash-image` 등 더 최신 이미지 모델도 노출됨. 이번 검증은 1차 후보(`gemini-2.5-flash-image`)로 PASS했기 때문에 재시도하지 않았으나, 실제 구현 단계에서 품질/속도/비용 비교 대상으로 남겨둠.

---

## 6. 파트 3 구현 권고

1. **프롬프트 구조:** 매 장면 요청 앞에 고정 "캐릭터 고정요소 문장"(얼굴형·의상 색·소품·화풍을 명시적으로 나열)을 접두어로 항상 포함할 것. 이번 검증에서 이 접두어가 명확히 효과가 있었음(특히 scene-4처럼 구체적 소품/색상을 다시 언급한 장면일수록 일관성이 더 좋았음).
2. **레퍼런스 전달 방식:** 매 요청마다 레퍼런스 PNG를 `inlineData`로 새로 첨부(현재 방식)하는 것으로 충분함. 별도의 파인튜닝/캐싱 없이도 5개 장면에서 일관성 확보됨.
3. **취약 지점 — 귀/신체 부위 왜곡(scene-2):** 감정 강도가 높은 장면(공포·격한 동작)에서 신체 비례(특히 귀)가 흔들리는 경향 관찰됨. 프롬프트에 "ears same shape and length as reference" 같은 부위별 고정 문구를 추가하거나, 이런 장면은 자동 검사(§3.1의 "캐릭터 고정 요소 유지" 자동 검사)에서 더 엄격한 임계값을 적용할 것을 권고.
4. **후보 2장 생성 전략(v1.0 §14 유지 사항)과 결합:** 이번 검증은 장면당 1장만 생성했음. 실제 구현에서는 PRD대로 페이지당 후보 2장을 생성해 더 일관된 쪽을 선택하는 절차를 두면 scene-2류의 부분훼손 리스크를 완화할 수 있음.
5. **해상도:** 기본 출력이 1024×1024로 고정되는 것으로 관찰됨. 인쇄용 고해상도가 필요하면 별도 업스케일 단계(PRD가 이미 전제한 "후보 저해상도 → 선택 후 업스케일" 파이프라인)가 반드시 필요함 — 모델 자체의 네이티브 해상도를 인쇄 해상도로 가정하면 안 됨.
6. **모델 이원화 여지:** `gemini-2.5-flash-image`로 이미 PASS했으나, 최신 `gemini-3.1-flash-image`/`gemini-3-pro-image`가 이 키에 노출되어 있으므로 구현 초기에 동일 시나리오로 A/B 비교하여 품질·속도·비용 중 더 유리한 쪽을 채택할 것을 권고.

---

## 7. 산출물

- `validation/results/ref.png` — 레퍼런스 캐릭터
- `validation/results/scene-1.png` ~ `scene-5.png` — 5개 장면
- `validation/results/*.meta.json` — 각 호출의 상태코드/응답시간/토큰 사용량/finishReason 기록
- `validation/gen.mjs` — 재현용 스크립트 (env 파일에서 키를 직접 읽음, 키 자체는 어디에도 출력/복사하지 않음)
