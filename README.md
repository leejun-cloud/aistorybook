# AI 동화책 제작 스튜디오

PRD.md 기준 웹앱 (Next.js 14 · TypeScript · Tailwind). 아이디어 → 스토리 → 캐릭터·스타일 → 그림·조판 → 조절·인쇄의 4파트가 브라우저 UI부터 Gemini 연동, 인쇄용 PDF까지 전부 배선되어 있다.

## 실행

```bash
pnpm install                       # playwright·sharp 포함 (Chromium: npx playwright install chromium)
echo 'GEMINI_API_KEY=...' > .env.local
pnpm dev                           # http://localhost:3000
pnpm build                         # 프로덕션 빌드
pnpm test:spine                    # 책등 계산 단위 테스트
pnpm test:e2e                      # 골든 런: 아이디어 → PDF 3종 전체 파이프라인 (실 API 호출, 수 분)
```

## 품질 장치 (관문 + 자동 교정)

- **스토리 best-of-N**: 초안 N개(기본 2) 병렬 생성 → 게이트 채점 → 최고점 채택 (`lib/ai/story.ts`)
- **품질 게이트 5종**: 채점 → self-repair(최대 2회) → 재채점. **게이트 통과 없이는 스토리 승인 불가**
- **DNA 일관성 자동 교정**: 장면 후보를 vision 채점, 전원 80점 미만이면 위반 사유를 negative로 자동 재생성(최대 2회) (`lib/ai/scene.ts`)
- **스타일 앵커**: 확정된 첫 페이지 이미지를 후속 장면의 레퍼런스로 추가 — 장면 간 스타일 드리프트 방지
- **300dpi 업스케일**: 인쇄 렌더 전 sharp(Lanczos3)로 `@print.jpg` 변형본 자동 생성 (`lib/render/upscale.ts`)
- **사전검사**: 페이지 누락·순서 / 글 넘침(렌더 실측) / 안전영역 / 실해상도 / 폰트 임베드

## 구조

- `app/` — `/`(대시보드), `/story`, `/character`, `/layout`, `/publish` + `app/api/**` (스토리·캐릭터·장면·표지·렌더·사전검사)
- `components/` — 파트별 3패널 클라이언트 (전 파트 API 배선 완료)
- `lib/ai/` — Gemini 연동: `story.ts`(초안·게이트) `character.ts`(후보·DNA) `scene.ts`(장면·검증 루프) `consistency.ts`(vision 채점) `image.ts`(공급자 격리)
- `lib/render/` — 조판 HTML → Playwright PDF, `upscale.ts`(인쇄 변형본)
- `lib/cover/` — 책등 계산·랩 표지 (정본: `research/print-profiles.md`)
- `patterns/` — 플롯 패턴 라이브러리 (비트 배치·흔한 실패 포함)
- `lib/store.ts` — 파일시스템 저장소 (`projects/<id>/project.json`)
