// ISBN(EAN-13) 바코드 — 뒷표지 우하단에 인쇄한다.
//
// 서점 유통에는 표지에 EAN-13 바코드가 필요하다. 외부 의존성 없이 모듈 패턴을
// 직접 인코딩해 Typst 사각형으로 그린다 (표지 전체가 Typst 조판이므로 래스터
// 이미지를 끼워 넣는 것보다 선명하다 — 벡터로 남아 인쇄 해상도에 독립적).
//
// 규격 (ISO/IEC 15420, 100% 배율):
//   모듈 폭 0.33mm × 95모듈 = 31.35mm, 바 높이 22.85mm
//   구성: 좌 가드(101) + 좌 6자리(7모듈) + 센터 가드(01010) + 우 6자리 + 우 가드(101)
//   가드 바는 아래로 5모듈 더 내려온다 (0.33 × 5 = 1.65mm)
//   좌우 여백(quiet zone) 좌 11모듈 · 우 7모듈 — 스캐너 인식에 필수

const L = ['0001101','0011001','0010011','0111101','0100011','0110001','0101111','0111011','0110111','0001011'];
const G = ['0100111','0110011','0011011','0100001','0011101','0111001','0000101','0010001','0001001','0010111'];
const R = ['1110010','1100110','1101100','1000010','1011100','1001110','1010000','1000100','1001000','1110100'];

/** 첫 자리로 정해지는 좌측 6자리의 L/G 배치 */
const PARITY = ['LLLLLL','LLGLGG','LLGGLG','LLGGGL','LGLLGG','LGGLLG','LGGGLL','LGLGLG','LGLGGL','LGGLGL'];

export const MODULE_MM = 0.33;
export const BAR_HEIGHT_MM = 22.85;
/** 가드 바가 아래로 더 내려오는 길이 */
const GUARD_EXTRA_MM = MODULE_MM * 5;
const QUIET_LEFT_MODULES = 11;
const QUIET_RIGHT_MODULES = 7;
/** 숫자 표기 줄 높이 */
const DIGIT_ROW_MM = 3.2;

/** 하이픈·공백 제거 후 13자리 숫자만 남긴다 */
export function normalizeIsbn(raw: string): string {
  return raw.replace(/[^0-9]/g, '');
}

/** EAN-13 체크디지트 — 앞 12자리로 계산 */
export function ean13CheckDigit(first12: string): number {
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += Number(first12[i]) * (i % 2 === 0 ? 1 : 3);
  }
  return (10 - (sum % 10)) % 10;
}

export interface IsbnValidation {
  valid: boolean;
  digits: string;
  /** 사용자에게 보여줄 문제 설명 — valid면 undefined */
  problem?: string;
}

export function validateIsbn(raw: string | undefined): IsbnValidation {
  const digits = normalizeIsbn(raw ?? '');
  if (digits.length === 0) return { valid: false, digits, problem: 'ISBN이 비어 있습니다.' };
  if (digits.length !== 13) {
    return { valid: false, digits, problem: `13자리 숫자가 필요합니다 (현재 ${digits.length}자리).` };
  }
  if (!/^(978|979)/.test(digits)) {
    return { valid: false, digits, problem: '도서 ISBN은 978 또는 979로 시작합니다.' };
  }
  if (ean13CheckDigit(digits.slice(0, 12)) !== Number(digits[12])) {
    return { valid: false, digits, problem: '체크디지트가 맞지 않습니다 — 숫자를 다시 확인해 주세요.' };
  }
  return { valid: true, digits };
}

/** 13자리 → 95개 모듈 문자열("0"=흰, "1"=검정) */
export function ean13Modules(digits: string): string {
  const parity = PARITY[Number(digits[0])];
  let out = '101';
  for (let i = 0; i < 6; i++) {
    const d = Number(digits[i + 1]);
    out += parity[i] === 'L' ? L[d] : G[d];
  }
  out += '01010';
  for (let i = 0; i < 6; i++) {
    out += R[Number(digits[i + 7])];
  }
  return out + '101';
}

export interface BarcodeBox {
  widthMm: number;
  heightMm: number;
}

/** 흰 여백·숫자줄 포함 전체 박스 크기 */
export function barcodeBox(): BarcodeBox {
  const modules = 95 + QUIET_LEFT_MODULES + QUIET_RIGHT_MODULES;
  return {
    widthMm: modules * MODULE_MM,
    heightMm: BAR_HEIGHT_MM + GUARD_EXTRA_MM + DIGIT_ROW_MM,
  };
}

/** 가드 바 위치(모듈 인덱스) — 이 구간만 아래로 더 길게 그린다 */
function isGuard(i: number): boolean {
  return (i >= 0 && i < 3) || (i >= 45 && i < 50) || (i >= 92 && i < 95);
}

/**
 * EAN-13 바코드를 Typst 콘텐츠로 렌더. 반환값은 `#box(...)` 한 덩어리라
 * `#place(dx:, dy:)[ ... ]` 안에 그대로 넣을 수 있다.
 *
 * 유효하지 않은 ISBN이면 null — 호출부가 바코드를 생략한다.
 */
export function renderIsbnBarcodeTypst(raw: string | undefined): string | null {
  const { valid, digits } = validateIsbn(raw);
  if (!valid) return null;

  const modules = ean13Modules(digits);
  const box = barcodeBox();
  const barsTop = 0;

  const rects: string[] = [];
  for (let i = 0; i < modules.length; i++) {
    if (modules[i] !== '1') continue;
    const h = BAR_HEIGHT_MM + (isGuard(i) ? GUARD_EXTRA_MM : 0);
    const dx = (QUIET_LEFT_MODULES + i) * MODULE_MM;
    rects.push(
      `#place(dx: ${dx.toFixed(3)}mm, dy: ${barsTop}mm, rect(width: ${MODULE_MM}mm, height: ${h.toFixed(3)}mm, fill: black, stroke: none))`,
    );
  }

  // 숫자 표기: 선행 1자리는 좌측 여백에, 나머지는 좌/우 그룹 아래 중앙
  const digitY = BAR_HEIGHT_MM + GUARD_EXTRA_MM - 0.4;
  const digitText = (x: number, w: number, t: string) =>
    `#place(dx: ${x.toFixed(3)}mm, dy: ${digitY.toFixed(3)}mm)[#box(width: ${w.toFixed(3)}mm)[#align(center)[#text(size: 7pt, fill: black, font: "Pretendard")[${t}]]]]`;

  const leftGroupX = (QUIET_LEFT_MODULES + 3) * MODULE_MM;
  const rightGroupX = (QUIET_LEFT_MODULES + 50) * MODULE_MM;
  const groupW = 42 * MODULE_MM;

  rects.push(digitText(0, QUIET_LEFT_MODULES * MODULE_MM, digits[0]));
  rects.push(digitText(leftGroupX, groupW, digits.slice(1, 7)));
  rects.push(digitText(rightGroupX, groupW, digits.slice(7)));

  return `#box(width: ${box.widthMm.toFixed(3)}mm, height: ${box.heightMm.toFixed(3)}mm, fill: white)[
${rects.join('\n')}
]`;
}
