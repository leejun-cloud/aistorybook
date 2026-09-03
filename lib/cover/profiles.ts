// 출판 프로파일 데이터 (research/print-profiles.md §3.5·§5 정본과 1:1 대응).
//
// 명명된 프로파일: 부크크1~4, 교보1~3. 수치는 하드코딩 계수가 아니라 데이터 —
// POD사가 공지하는 실측값이 나오면 이 배열만 갱신한다 (print-profiles.md §1.3 지침).

export type Binding = 'saddle' | 'perfect' | 'hardcover' | 'board';

export interface InteriorPaper {
  name: string;
  /** 1장 두께(mm) — print-profiles.md §1.3 */
  sheetThickness: number;
}

export interface SpineFormulaConfig {
  /** 무선제본 접착제 여유(mm). 기본 +1mm (print-profiles.md §1.1) */
  glueAllowance: number;
  /** 양장 보드+제본 여유(mm). §1.2 */
  hardcoverExtra: number;
  /** 반올림 단위(mm). §1.1 */
  roundTo: number;
  /** 이 폭 미만이면 책등 텍스트 자동 생략 (§1.3 예시 검산) */
  minSpineForText: number;
}

export interface PrintProfile {
  /** 명명된 프로파일 id — "bookk-2" 등 */
  id: string;
  /** 사용자 노출 이름 — "부크크2" 등 (print-profiles.md §3.5) */
  displayName: string;
  vendor: 'bookk' | 'kyobo' | 'custom';
  /** 판형 이름 (A5, B5, ...) */
  format: string;
  trim: { width: number; height: number };
  bleed: number;
  /** 이 프로파일에서 허용되는 제본 방식 */
  bindings: Binding[];
  spineFormula: SpineFormulaConfig;
  interiorPapers: InteriorPaper[];
  coverPapers: string[];
  /** 날개 폭(mm) — 부크크 규격체크 도구 기준 좌우 각 100mm (§2) */
  flapWidth: number;
  /** 내지 여백 규격 (§3.6) — 글 슬롯 사전검사 기준 */
  margins: {
    top: number; // 상하 기본 30mm 권장 (20~40 범위)
    bottom: number;
    outer: number; // 바깥 20~25mm
    innerExtra: number; // 안쪽 = 바깥 + 3mm (200p 초과 시 +5)
  };
  /** 재단선 안쪽 안전영역(mm) — 글·핵심 요소 최소 이격 (§3.6·§4) */
  safeArea: number;
}

// §1.1·§1.2 공통 공식 설정 (프로파일별로 덮어쓸 수 있는 계수)
const DEFAULT_SPINE_FORMULA: SpineFormulaConfig = {
  glueAllowance: 1.0,
  hardcoverExtra: 5.0,
  roundTo: 0.5,
  minSpineForText: 5.0,
};

// §1.3 종이 1장 두께 기본값
export const INTERIOR_PAPERS: InteriorPaper[] = [
  { name: '백색모조 80g', sheetThickness: 0.095 },
  { name: '백색모조 100g', sheetThickness: 0.115 },
  { name: '이라이트 80g', sheetThickness: 0.106 },
  { name: '스노우지 100g', sheetThickness: 0.09 },
  { name: '아트지 150g', sheetThickness: 0.12 },
];

const BOOKK_COVER_PAPERS = ['스노우 250g', '아르떼 210g'];
const KYOBO_COVER_PAPERS = ['아르떼 210g', '스노우 250g', '아트지 250g', '아트지 150g'];
const MARGINS = { top: 30, bottom: 30, outer: 20, innerExtra: 3 };

export const PRINT_PROFILES: PrintProfile[] = [
  // ---- 부크크 (공식 규격체크 도구 기준 4종 확정 지원, §3.5) ----
  {
    id: 'bookk-1', displayName: '부크크1', vendor: 'bookk', format: 'A5 (국판)',
    trim: { width: 148, height: 210 }, bleed: 3,
    bindings: ['saddle', 'perfect'], spineFormula: DEFAULT_SPINE_FORMULA,
    interiorPapers: INTERIOR_PAPERS, coverPapers: BOOKK_COVER_PAPERS,
    flapWidth: 100, margins: MARGINS, safeArea: 5,
  },
  {
    id: 'bookk-2', displayName: '부크크2', vendor: 'bookk', format: 'B5 (46배판)',
    trim: { width: 182, height: 257 }, bleed: 3,
    bindings: ['saddle', 'perfect'], spineFormula: DEFAULT_SPINE_FORMULA,
    interiorPapers: INTERIOR_PAPERS, coverPapers: BOOKK_COVER_PAPERS,
    flapWidth: 100, margins: MARGINS, safeArea: 5,
  },
  {
    id: 'bookk-3', displayName: '부크크3', vendor: 'bookk', format: 'A4 (국배판)',
    trim: { width: 210, height: 297 }, bleed: 3,
    bindings: ['saddle', 'perfect'], spineFormula: DEFAULT_SPINE_FORMULA,
    interiorPapers: INTERIOR_PAPERS, coverPapers: BOOKK_COVER_PAPERS,
    flapWidth: 100, margins: MARGINS, safeArea: 5,
  },
  {
    id: 'bookk-4', displayName: '부크크4', vendor: 'bookk', format: '46판',
    trim: { width: 127, height: 188 }, bleed: 3,
    bindings: ['saddle', 'perfect'], spineFormula: DEFAULT_SPINE_FORMULA,
    interiorPapers: INTERIOR_PAPERS, coverPapers: BOOKK_COVER_PAPERS,
    flapWidth: 100, margins: MARGINS, safeArea: 5,
  },
  // ---- 교보 바로출판 POD (무선제본 전용, §3) ----
  {
    id: 'kyobo-1', displayName: '교보1', vendor: 'kyobo', format: 'A5',
    trim: { width: 148, height: 210 }, bleed: 3,
    bindings: ['perfect'], spineFormula: DEFAULT_SPINE_FORMULA,
    interiorPapers: INTERIOR_PAPERS, coverPapers: KYOBO_COVER_PAPERS,
    flapWidth: 100, margins: MARGINS, safeArea: 5,
  },
  {
    id: 'kyobo-2', displayName: '교보2', vendor: 'kyobo', format: 'B5',
    trim: { width: 182, height: 257 }, bleed: 3,
    bindings: ['perfect'], spineFormula: DEFAULT_SPINE_FORMULA,
    interiorPapers: INTERIOR_PAPERS, coverPapers: KYOBO_COVER_PAPERS,
    flapWidth: 100, margins: MARGINS, safeArea: 5,
  },
  {
    id: 'kyobo-3', displayName: '교보3', vendor: 'kyobo', format: '신국판',
    trim: { width: 152, height: 225 }, bleed: 3,
    bindings: ['perfect'], spineFormula: DEFAULT_SPINE_FORMULA,
    interiorPapers: INTERIOR_PAPERS, coverPapers: KYOBO_COVER_PAPERS,
    flapWidth: 100, margins: MARGINS, safeArea: 5,
  },
];

export function getProfile(id: string): PrintProfile | null {
  return PRINT_PROFILES.find((p) => p.id === id) ?? null;
}

export function getInteriorPaper(profile: PrintProfile, name: string): InteriorPaper | null {
  return profile.interiorPapers.find((p) => p.name === name) ?? null;
}
