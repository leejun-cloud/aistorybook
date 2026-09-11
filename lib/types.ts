// aistorybook 데이터 모델
//
// PRD.md 기준:
//   장면(Scene)          §1.3
//   캐릭터(Character)     §2.2
//   페이지 조판(PageLayout) §3.2 (v1.0 8.8.2 스키마를 이 저장소에서 재구성 —
//                           원본 v1.0 문서는 이 폴더에 없어 PRD §3.2·§4.1
//                           서술을 근거로 슬롯 기반 모델로 재현했다. 다른
//                           개발자가 실제 v1.0 스키마를 갖고 있다면 이 타입을
//                           기준으로 맞춰 넣으면 된다.)
//   프로젝트 전체 구조     §5, §6

// ---------------------------------------------------------------------------
// 파트 1: 스토리 (§1.3)
// ---------------------------------------------------------------------------

/** 문장의 출처. 사용자가 직접 쓴 문장은 이후 재생성에서 AI가 덮어쓰지 않는다 (원문 보존 원칙). */
export type TextSource = 'user' | 'ai';

export interface Scene {
  sceneNumber: number;
  beat: string;
  text: string;
  textSource: TextSource;
  characters: string[]; // Character.id 참조
  location: string;
  emotion: string;
  visualFocus: string;
  preferredTextArea:
    | 'upper-left' | 'upper-center' | 'upper-right'
    | 'center-left' | 'center' | 'center-right'
    | 'lower-left' | 'lower-center' | 'lower-right';
}

/** patterns/*.md 라이브러리의 한 항목 (§1.1 레이어 A) */
export interface PlotPattern {
  id: string;
  name: string;
  description: string;
  emotionCurve: string;
  ageRange: string;
  commonFailure: string;
}

export interface StoryPart {
  idea: string;
  targetAge: string;
  /** 장면 수 — 프리셋(8/12/16/20/24) 또는 자유 입력 (4~40) */
  sceneCount: number;
  desiredMood: string;
  selectedPatternIds: string[];
  scenes: Scene[];
  /** AI 작가도우미 브레인스토밍 대화 (스토리 생성 전 기획 단계) */
  brainstorm?: {
    messages: { role: 'user' | 'assistant'; text: string }[];
    /** 대화를 정리한 기획안 — finalize 시 채워짐 */
    brief?: {
      idea: string;
      characters: { name: string; description: string }[];
      targetAge: string;
      desiredMood: string;
      summary: string;
    };
  };
  /** 자동 품질 게이트 결과 (§1.1 통과 기준) */
  qualityGate?: {
    passed: boolean;
    checkedAt: string;
    items: { label: string; passed: boolean; note?: string }[];
  };
  approved: boolean;
}

// ---------------------------------------------------------------------------
// 파트 2: 캐릭터 · 스타일 (§2.2)
// ---------------------------------------------------------------------------

export interface CharacterTextDNA {
  /** 고정 요소: 머리·의상·소품 등 매 장면 유지되어야 하는 특징 */
  fixed: string[];
  /** 금지 요소: 절대 등장하면 안 되는 특징 */
  forbidden: string[];
}

export interface CharacterCandidate {
  id: string;
  imageUrl: string;
  note?: string;
}

export interface Character {
  id: string;
  name: string;
  description: string;
  candidates: CharacterCandidate[];
  /** 확정된 공식 레퍼런스 이미지 (candidates 중 하나 선택, 또는 부분 수정 결과) */
  referenceImageUrl?: string;
  textDNA: CharacterTextDNA;
  confirmed: boolean;
}

export type StyleSource = 'upload' | 'library';

export interface StyleSpec {
  source: StyleSource;
  /** source === 'upload'일 때: 업로드한 참고 그림 */
  referenceImageUrls: string[];
  /** AI가 추출한 스타일 서술 (재료·선·팔레트·질감·배경 밀도) */
  description: string;
  /** source === 'library'일 때 선택한 기본 스타일 id */
  libraryStyleId?: string;
  /** 저작권 원칙 동의 여부 (§2.1) */
  copyrightAcknowledged: boolean;
}

export interface CharacterPart {
  style: StyleSpec;
  characters: Character[];
  approved: boolean;
}

// ---------------------------------------------------------------------------
// 파트 3: 그림 생성 · 조판 (§3.2)
// ---------------------------------------------------------------------------

export type SlotType = 'image' | 'text';

/** 조판 템플릿(L01~L10) 안의 한 슬롯. 좌표는 펼침면 기준 0~1 분수. */
export interface LayoutSlot {
  id: string;
  type: SlotType;
  x: number;
  y: number;
  width: number;
  height: number;
  /** type === 'text'일 때 권장 정렬 */
  align?: 'left' | 'center' | 'right';
}

/** 조판 템플릿 정의 (L01~L10, §3.2) */
export interface LayoutTemplate {
  id: string; // "L01" ~ "L10"
  name: string;
  description: string;
  slots: LayoutSlot[];
}

export type ImageGenStatus = 'idle' | 'queued' | 'generating' | 'ready' | 'failed';

export interface SceneImageCandidate {
  id: string;
  url: string;
  upscaled: boolean;
}

/** 한 장면이 실제로 조판된 결과 — 페이지 조판 JSON의 핵심 단위 (v1.0 8.8.2 상당) */
export interface PageLayout {
  sceneNumber: number;
  templateId: string;
  slots: {
    slotId: string;
    /** type: 'image' 슬롯 채움 */
    imageUrl?: string;
    imageStatus?: ImageGenStatus;
    candidates?: SceneImageCandidate[];
    /** type: 'text' 슬롯 채움 (Scene.text와 동기화, 슬롯 단위로 스타일 override 가능) */
    text?: string;
    fontSizePx?: number;
    lineHeight?: number;
    color?: string;
    /** 그림 위 글의 배경 처리 — 'box' 반투명 상자(기본) / 'none' 상자 없이 글로우만 */
    textBox?: 'box' | 'none';
  }[];
  /** 슬롯 편집에서 그림 위치 조정 (§4.1) */
  transform?: { scale: number; offsetX: number; offsetY: number };
}

export interface LayoutPart {
  templates: LayoutTemplate[];
  pages: PageLayout[];
  /** 새 페이지의 글 상자 기본값 (슬롯별 textBox가 우선) — 스타일 프리셋/레퍼런스가 설정 */
  textBoxDefault?: 'box' | 'none';
  approved: boolean;
}

// ---------------------------------------------------------------------------
// 파트 4: 조절 · 인쇄 (§4.3, §4.4)
// ---------------------------------------------------------------------------

export interface CoverOption {
  id: string;
  concept: 'character' | 'scene' | 'symbol';
  imageUrl: string;
  title: string;
  author?: string;
}

export interface PreflightItem {
  label: string;
  passed: boolean;
  detail?: string;
}

export interface PreflightResult {
  ranAt: string;
  passed: boolean;
  items: PreflightItem[];
}

/** 랩 표지 텍스트 편집 설정 (/cover 편집 페이지) — 값이 없으면 wrap.ts 기본값 */
export interface CoverTextLayout {
  /** 표지 디자인 템플릿 id (lib/cover/designs.ts COVER_DESIGNS) — 기본: 스타일 기반 추천값 */
  designId?: string;
  /** 표지 제목 (기본: 프로젝트 제목) */
  titleText?: string;
  authorText?: string;
  /** 책등에 넣을 글 (기본: 제목). 책등 5mm 미만이면 자동 생략 */
  spineText?: string;
  /** 뒷표지 소개 문구 (기본: 첫 장면 텍스트) */
  backBlurb?: string;
  /** 제목 세로 위치 — 판형 높이의 % (0 위 ~ 85 아래, 기본 7) */
  titleYPct?: number;
  titleSizePt?: number;
  titleColor?: string;
  /** 작가명 세로 위치 — % (기본 88) */
  authorYPct?: number;
  authorSizePt?: number;
}

export interface PublishPart {
  coverOptions: CoverOption[];
  selectedCoverId?: string;
  /** 랩 표지 텍스트·위치 편집 결과 */
  coverLayout?: CoverTextLayout;
  preflight?: PreflightResult;
  outputs: {
    viewingPdfUrl?: string;
    printBodyPdfUrl?: string;
    printCoverPdfUrl?: string;
    webBookUrl?: string;
    pagePngUrls?: string[];
  };
  approved: boolean;
}

// ---------------------------------------------------------------------------
// 프로젝트 전체 (§5, §6)
// ---------------------------------------------------------------------------

export type ProjectPartKey = 'story' | 'character' | 'layout' | 'publish';

export interface Project {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  story: StoryPart;
  character: CharacterPart;
  layout: LayoutPart;
  publish: PublishPart;
}

/** 대시보드 목록용 요약 */
export interface ProjectSummary {
  id: string;
  title: string;
  updatedAt: string;
  approvedParts: ProjectPartKey[];
  currentPart: ProjectPartKey;
}

export const PART_LABELS: Record<ProjectPartKey, string> = {
  story: '스토리',
  character: '캐릭터·스타일',
  layout: '그림·조판',
  publish: '조절·인쇄',
};

export const PART_ORDER: ProjectPartKey[] = ['story', 'character', 'layout', 'publish'];

export function partApproved(project: Project, part: ProjectPartKey): boolean {
  return project[part].approved;
}

export function currentPart(project: Project): ProjectPartKey {
  for (const part of PART_ORDER) {
    if (!partApproved(project, part)) return part;
  }
  return 'publish';
}
