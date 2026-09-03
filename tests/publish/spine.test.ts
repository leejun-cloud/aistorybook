// 책등 계산기 단위 테스트 — research/print-profiles.md §1 검산.
// 실행: npx tsx tests/publish/spine.test.ts

import assert from 'node:assert/strict';
import { calculateSpine, roundToStep } from '../../lib/cover/spine';

// 반올림 규칙 (§1.1): 3.2→3, 3.4→3.5, 3.7→3.5, 3.8→4
assert.equal(roundToStep(3.2, 0.5), 3);
assert.equal(roundToStep(3.4, 0.5), 3.5);
assert.equal(roundToStep(3.7, 0.5), 3.5);
assert.equal(roundToStep(3.8, 0.5), 4);

// 품질 기준 1: 32p × 0.15mm 무선 = 32÷2×0.15 = 2.4 + 풀 1 = 3.4 → 3.5mm, 텍스트 불가 경고
{
  const r = calculateSpine({ binding: 'perfect', paperThickness: 0.15, pageCount: 32 });
  assert.equal(r.rawMm.toFixed(2), '3.40');
  assert.equal(r.spineMm, 3.5);
  assert.equal(r.canFitSpineText, false);
  assert.ok(r.warnings.some((w) => w.includes('자동 생략')), '텍스트 생략 경고가 있어야 함');
}

// 품질 기준 2: 200p × 0.115mm 무선 = 100×0.115 = 11.5 + 1 = 12.5mm, 텍스트 가능
{
  const r = calculateSpine({ binding: 'perfect', paperThickness: 0.115, pageCount: 200 });
  assert.equal(r.rawMm.toFixed(2), '12.50');
  assert.equal(r.spineMm, 12.5);
  assert.equal(r.canFitSpineText, true);
  assert.equal(r.warnings.length, 0);
}

// 중철: 책등 0, 텍스트 불가 (§1.2)
{
  const r = calculateSpine({ binding: 'saddle', paperThickness: 0.115, pageCount: 24 });
  assert.equal(r.spineMm, 0);
  assert.equal(r.canFitSpineText, false);
  assert.ok(r.warnings.some((w) => w.includes('중철')));
}

// 양장: 무선 공식 + 5mm (§1.2) — 200p×0.115 = 12.5 + 5 = 17.5
{
  const r = calculateSpine({ binding: 'hardcover', paperThickness: 0.115, pageCount: 200 });
  assert.equal(r.spineMm, 17.5);
  assert.equal(r.canFitSpineText, true);
}

// 보드북: 장수 × 판지 두께, ÷2 없음 (§1.2) — 10장 × 1.2mm = 12mm
{
  const r = calculateSpine({ binding: 'board', paperThickness: 1.2, pageCount: 10 });
  assert.equal(r.spineMm, 12);
}

// 면지: (총 페이지 + 면지 장수 × 4) ÷ 2 × 두께 + 여유 (§1.1)
// 32p + 면지 2장(=8p 상당) = 40 → 20×0.115 = 2.3 + 1 = 3.3 → 3.5
{
  const r = calculateSpine({ binding: 'perfect', paperThickness: 0.115, pageCount: 32, endpaperSheets: 2 });
  assert.equal(r.rawMm.toFixed(2), '3.30');
  assert.equal(r.spineMm, 3.5);
}

console.log('spine.test.ts — 8개 검산 전부 통과');
