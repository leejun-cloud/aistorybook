import { NextRequest, NextResponse } from 'next/server';
import { findOrder, markOrderFailed, markOrderPaid } from '../../../../lib/credits';

// POST /api/credits/confirm  body: { paymentKey, orderId, amount }
// 결제창 성공 리다이렉트 후 호출. Toss 승인 API를 서버에서 호출해 실제 결제를
// 확정하고, 성공했을 때만 이용권을 적립한다.
//
// 금액은 서버에 저장해 둔 주문(pending)의 amount와 대조한다 — 클라이언트가
// 보낸 금액을 그대로 승인에 넘기면 금액 변조로 소액 결제 후 이용권을 받아갈 수 있다.
export async function POST(req: NextRequest) {
  const { paymentKey, orderId, amount } = await req.json().catch(() => ({}));
  if (!paymentKey || !orderId) {
    return NextResponse.json({ error: 'paymentKey·orderId가 필요합니다' }, { status: 400 });
  }

  const order = await findOrder(orderId);
  if (!order) return NextResponse.json({ error: '주문을 찾을 수 없습니다' }, { status: 404 });
  if (order.status === 'paid') {
    return NextResponse.json({ status: 'already-paid', credits: order.credits });
  }
  if (Number(amount) !== order.amount) {
    await markOrderFailed(orderId, `금액 불일치 (요청 ${amount} ≠ 주문 ${order.amount})`);
    return NextResponse.json({ error: '결제 금액이 주문과 다릅니다' }, { status: 400 });
  }

  const secret = process.env.TOSS_SECRET_KEY;
  if (!secret) return NextResponse.json({ error: '결제 모듈 미설정' }, { status: 503 });

  const auth = Buffer.from(`${secret}:`).toString('base64');
  const res = await fetch('https://api.tosspayments.com/v1/payments/confirm', {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ paymentKey, orderId, amount: order.amount }),
  });
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    await markOrderFailed(orderId, data?.message ?? `승인 실패 (${res.status})`);
    return NextResponse.json({ error: data?.message ?? '결제 승인에 실패했습니다' }, { status: res.status });
  }

  const e = await markOrderPaid(orderId, paymentKey);
  return NextResponse.json({ status: 'paid', granted: order.credits, credits: e.credits });
}
