import { NextRequest, NextResponse } from 'next/server';
import { createOrder } from '../../../../lib/credits';
import { getPack } from '../../../../lib/pricing';

// POST /api/credits/order  body: { packId }
// → 결제창을 띄우기 전 주문을 pending으로 생성한다. 금액은 서버의 CREDIT_PACKS가
//   정본 — 클라이언트가 보낸 금액은 신뢰하지 않는다.
export async function POST(req: NextRequest) {
  const { packId } = await req.json().catch(() => ({}));
  const pack = getPack(packId);
  if (!pack) return NextResponse.json({ error: '알 수 없는 상품입니다' }, { status: 400 });

  if (!process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY || !process.env.TOSS_SECRET_KEY) {
    return NextResponse.json(
      { error: '결제 모듈이 아직 설정되지 않았습니다. 잠시 후 다시 시도해 주세요.' },
      { status: 503 },
    );
  }

  const order = await createOrder(pack.id);
  return NextResponse.json({
    orderId: order.orderId,
    orderName: `AI 동화제작 ${pack.name}`,
    amount: order.amount,
    credits: order.credits,
    clientKey: process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY,
  });
}
