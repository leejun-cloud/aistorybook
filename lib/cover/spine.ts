// 책등(세네카) 계산기 — research/print-profiles.md §1 공식과 1:1 대응.
//
//   무선(perfect):  (총 페이지 ÷ 2) × 종이 1장 두께 + 제본풀 여유(기본 +1mm)
//   중철(saddle):   책등 없음 (0mm) — 표지는 앞+뒤 2면
//   양장(hardcover): 무선 공식 + 5mm (보드+제본 여유)
//   보드북(board):   장수 × 판지 두께 (페이지 자체가 판지 — ÷2 없음)
//   면지: (총 페이지 + 면지 장수 × 4) ÷ 2 × 두께 + 여유
//   반올림: 0.5mm 단위 (3.2→3, 3.4→3.5, 3.7→3.5, 3.8→4)
//   책등 폭 < 5mm → 책등 텍스트 자동 생략 + 사용자 알림

import type { Binding, SpineFormulaConfig } from './profiles';

export interface SpineInput {
  binding: Binding;
  /** 종이 1장 두께(mm) — 프로파일 interiorPapers에서 가져온다 */
  paperThickness: number;
  pageCount: number;
  /** 면지 장수 (기본 0). 면지 1장 = 앞뒤 4페이지 상당 (§1.1) */
  endpaperSheets?: number;
  /** 프로파일별 공식 계수 override (기본: 풀 +1mm, 양장 +5mm, 0.5mm 반올림, 텍스트 최소 5mm) */
  formula?: Partial<SpineFormulaConfig>;
}

export interface SpineResult {
  /** 최종 책등 폭(mm, 반올림 후) */
  spineMm: number;
  /** 반올림 전 원값(mm) */
  rawMm: number;
  /** 책등 텍스트(제목·작가명) 인쇄 가능 여부 — minSpineForText(기본 5mm) 기준 */
  canFitSpineText: boolean;
  /** 사용자 알림 (텍스트 생략 경고 등) */
  warnings: string[];
}

const DEFAULTS: SpineFormulaConfig = {
  glueAllowance: 1.0,
  hardcoverExtra: 5.0,
  roundTo: 0.5,
  minSpineForText: 5.0,
};

/** 0.5mm 단위 반올림 — round-half-up: 3.2→3.0, 3.4→3.5, 3.7→3.5, 3.8→4.0 */
export function roundToStep(value: number, step: number): number {
  // 부동소수 오차 방지: 소수 셋째 자리까지만 본다
  return Math.round(Number((value / step).toFixed(3))) * step;
}

export function calculateSpine(input: SpineInput): SpineResult {
  const f = { ...DEFAULTS, ...input.formula };
  const warnings: string[] = [];

  if (input.pageCount <= 0 || input.paperThickness <= 0) {
    return { spineMm: 0, rawMm: 0, canFitSpineText: false, warnings: ['페이지 수·종이 두께가 유효하지 않습니다'] };
  }

  let raw: number;
  switch (input.binding) {
    case 'saddle':
      // 중철: 책등 없음. 표지 = 앞+뒤 2면만, 책등 텍스트 불가 (§1.2)
      raw = 0;
      break;
    case 'board':
      // 보드북: 페이지 자체가 판지 — 장수 × 판지 두께 (÷2 없음, §1.2)
      raw = input.pageCount * input.paperThickness;
      break;
    case 'perfect':
    case 'hardcover': {
      const effectivePages = input.pageCount + (input.endpaperSheets ?? 0) * 4;
      raw = (effectivePages / 2) * input.paperThickness + f.glueAllowance;
      if (input.binding === 'hardcover') raw += f.hardcoverExtra;
      break;
    }
  }

  const spineMm = roundToStep(raw, f.roundTo);
  const canFitSpineText = spineMm >= f.minSpineForText;

  if (input.binding === 'saddle') {
    warnings.push('중철제본은 책등이 없어 책등 텍스트를 넣을 수 없습니다.');
  } else if (!canFitSpineText) {
    warnings.push(
      `책등 폭 ${spineMm}mm < ${f.minSpineForText}mm — 책등 제목 인쇄가 어려워 책등 텍스트를 자동 생략합니다.`,
    );
  }
  if (input.binding === 'saddle' && (input.pageCount < 16 || input.pageCount > 32)) {
    warnings.push('중철제본 권장 범위(16~32p)를 벗어났습니다.');
  }

  return { spineMm, rawMm: raw, canFitSpineText, warnings };
}
