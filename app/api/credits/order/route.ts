import { NextRequest, NextResponse } from 'next/server';
import { createOrder } from '../../../../lib/credits';
import { getPack } from '../../../../lib/pricing';
import { paymentsConfigured, tossClientKey } from '../../../../lib/payments/config';
import { businessInfoComplete } from '../../../../lib/legal/business';
import { requireUser } from '../../../../lib/auth/require';

// POST /api/credits/order  body: { packId }
// → 결제창을 띄우기 전 주문을 pending으로 생성한다. 금액은 서버의 CREDIT_PACKS가
//   정본 — 클라이언트가 보낸 금액은 신뢰하지 않는다.
export async function POST(req: NextRequest) {
  // 이용권은 계정별로 적립된다 — 로그인 없이는 결제를 시작하지 않는다
  const auth = await requireUser();
  if ('error' in auth) return auth.error;

  const { packId } = await req.json().catch(() => ({}));
  const pack = getPack(packId);
  if (!pack) return NextResponse.json({ error: '알 수 없는 상품입니다' }, { status: 400 });

  // 전자상거래법 제10조 — 사업자 정보를 표시하지 못하는 상태로는 판매하지 않는다
  if (!businessInfoComplete()) {
    return NextResponse.json(
      { error: '사업자 정보가 등록되지 않아 결제를 진행할 수 없습니다. 운영자에게 문의해 주세요.' },
      { status: 503 },
    );
  }

  if (!paymentsConfigured()) {
    return NextResponse.json(
      { error: '결제 모듈이 아직 설정되지 않았습니다. 잠시 후 다시 시도해 주세요.' },
      { status: 503 },
    );
  }

  const order = await createOrder(auth.viewer.accountKey, pack.id);
  return NextResponse.json({
    orderId: order.orderId,
    orderName: `AI 동화제작 ${pack.name}`,
    amount: order.amount,
    credits: order.credits,
    clientKey: tossClientKey(),
  });
}
