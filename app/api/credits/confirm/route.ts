import { NextRequest, NextResponse } from 'next/server';
import { findOrder, markOrderFailed, markOrderPaid } from '../../../../lib/credits';
import { tossSecretKey } from '../../../../lib/payments/config';
import { requireUser } from '../../../../lib/auth/require';

// POST /api/credits/confirm  body: { paymentKey, orderId, amount }
// 결제창 성공 리다이렉트 후 호출. Toss 승인 API를 서버에서 호출해 실제 결제를
// 확정하고, 성공했을 때만 이용권을 적립한다.
//
// 금액은 서버에 저장해 둔 주문(pending)의 amount와 대조한다 — 클라이언트가
// 보낸 금액을 그대로 승인에 넘기면 금액 변조로 소액 결제 후 이용권을 받아갈 수 있다.
export async function POST(req: NextRequest) {
  const session = await requireUser();
  if ('error' in session) return session.error;
  const accountKey = session.viewer.accountKey;

  const { paymentKey, orderId, amount } = await req.json().catch(() => ({}));
  if (!paymentKey || !orderId) {
    return NextResponse.json({ error: 'paymentKey·orderId가 필요합니다' }, { status: 400 });
  }

  // 다른 계정의 주문번호로는 찾히지 않는다 — 남의 결제를 자기 계정에 적립할 수 없다
  const order = await findOrder(accountKey, orderId);
  if (!order) return NextResponse.json({ error: '주문을 찾을 수 없습니다' }, { status: 404 });
  if (order.status === 'paid') {
    return NextResponse.json({ status: 'already-paid', credits: order.credits });
  }
  if (Number(amount) !== order.amount) {
    await markOrderFailed(accountKey, orderId, `금액 불일치 (요청 ${amount} ≠ 주문 ${order.amount})`);
    return NextResponse.json({ error: '결제 금액이 주문과 다릅니다' }, { status: 400 });
  }

  const secret = tossSecretKey();
  if (!secret) return NextResponse.json({ error: '결제 모듈 미설정' }, { status: 503 });

  const auth = Buffer.from(`${secret}:`).toString('base64');
  const res = await fetch('https://api.tosspayments.com/v1/payments/confirm', {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ paymentKey, orderId, amount: order.amount }),
  });
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    await markOrderFailed(accountKey, orderId, data?.message ?? `승인 실패 (${res.status})`);
    return NextResponse.json({ error: data?.message ?? '결제 승인에 실패했습니다' }, { status: res.status });
  }

  const e = await markOrderPaid(accountKey, orderId, paymentKey);
  return NextResponse.json({ status: 'paid', granted: order.credits, credits: e.credits });
}
