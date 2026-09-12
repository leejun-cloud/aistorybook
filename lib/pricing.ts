// 이용권 요금제 — 클라이언트(요금 페이지·결제 모달)와 서버(주문 생성·적립)가
// 같은 정본을 쓴다. fs 의존이 없어야 클라이언트 번들에 들어갈 수 있다.
//
// 과금 단위는 "작업 프로젝트 1건". 한 번 잠금 해제한 프로젝트의 PDF·패키지는
// 추가 결제 없이 다시 내려받을 수 있다 (project.publish.unlockedAt).

export interface CreditPack {
  id: string;
  name: string;
  /** 적립되는 이용권 수 (1 = 프로젝트 1건) */
  credits: number;
  /** 총 결제 금액(원) */
  amount: number;
  /** 강조 문구 — 없으면 표시 안 함 */
  badge?: string;
  description: string;
}

export const CREDIT_PACKS: CreditPack[] = [
  {
    id: 'single',
    name: '프로젝트 1건',
    credits: 1,
    amount: 3900,
    description: '책 한 권을 끝까지 만들고 인쇄용 파일까지 받습니다.',
  },
  {
    id: 'pack3',
    name: '이용권 3건',
    credits: 3,
    amount: 9900,
    badge: '가장 많이 선택',
    description: '시리즈나 여러 편을 준비 중이라면.',
  },
  {
    id: 'pack10',
    name: '이용권 10건',
    credits: 10,
    amount: 29900,
    badge: '건당 최저가',
    description: '꾸준히 만드는 분을 위한 묶음.',
  },
];

export function getPack(id: string): CreditPack | undefined {
  return CREDIT_PACKS.find((p) => p.id === id);
}

/** 이용권 1건당 단가(원) — 소수점 버림 */
export function perUnit(pack: CreditPack): number {
  return Math.floor(pack.amount / pack.credits);
}

export function formatWon(amount: number): string {
  return `₩${amount.toLocaleString('ko-KR')}`;
}
