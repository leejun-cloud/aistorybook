'use client';

import { useEffect, useState } from 'react';
import { CREDIT_PACKS, formatWon, getPack, perUnit } from '../lib/pricing';
import { PurchaseConsent } from './PurchaseConsent';

/**
 * 이용권 구매 목록. 결제창은 Toss SDK를 동적 import 한다 —
 * SDK가 window에 의존하므로 서버 렌더 시점에 불러오면 안 된다.
 */
export function CreditPackList({ returnTo }: { returnTo?: string }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [credits, setCredits] = useState<number | null>(null);
  // 전자상거래법 제8조·제13조 — 거래조건 확인 동의 없이는 결제창을 열지 않는다
  const [selected, setSelected] = useState<string | null>(null);
  const [agreed, setAgreed] = useState(false);

  useEffect(() => {
    fetch('/api/credits')
      .then((r) => r.json())
      .then((d) => setCredits(d.credits ?? 0))
      .catch(() => setCredits(null));
  }, []);

  const buy = async (packId: string) => {
    if (!agreed) {
      setSelected(packId);
      setError('결제를 진행하려면 구매 조건에 동의해 주세요.');
      return;
    }
    setBusy(packId);
    setError(null);
    try {
      const res = await fetch('/api/credits/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packId }),
      });
      const order = await res.json();
      if (res.status === 401) {
        setError('이용권은 계정별로 관리됩니다. 오른쪽 위에서 로그인해 주세요.');
        setBusy(null);
        return;
      }
      if (!res.ok) throw new Error(order.error ?? '주문 생성에 실패했습니다');

      const { loadTossPayments } = await import('@tosspayments/payment-sdk');
      const toss = await loadTossPayments(order.clientKey);
      const back = returnTo ? `&returnTo=${encodeURIComponent(returnTo)}` : '';
      await toss.requestPayment('카드', {
        amount: order.amount,
        orderId: order.orderId,
        orderName: order.orderName,
        successUrl: `${window.location.origin}/payment/success?_=1${back}`,
        failUrl: `${window.location.origin}/payment/fail`,
      });
    } catch (e) {
      // 사용자가 결제창을 닫은 경우도 여기로 온다 — 조용히 되돌린다
      const msg = (e as Error).message;
      setError(msg.includes('취소') || msg.includes('CANCEL') ? null : msg);
      setBusy(null);
    }
  };

  return (
    <div>
      {credits !== null && (
        <p className="mb-6 text-sm text-ink-400">
          잔여 이용권 <span className="font-semibold text-ink-800">{credits}건</span>
        </p>
      )}

      <ul className="grid gap-5 sm:grid-cols-3">
        {CREDIT_PACKS.map((pack) => (
          <li
            key={pack.id}
            className={[
              'relative flex flex-col rounded-2xl border bg-white p-6',
              pack.badge ? 'border-sunset-400 shadow-sm' : 'border-paper-200',
            ].join(' ')}
          >
            {pack.badge && (
              <span className="absolute -top-2.5 left-6 rounded-full bg-sunset-500 px-2.5 py-0.5 text-[11px] font-medium text-white">
                {pack.badge}
              </span>
            )}
            <h3 className="font-serif text-lg font-bold text-ink-800">{pack.name}</h3>
            <p className="mt-1 text-sm text-ink-400">{pack.description}</p>

            <div className="mt-5">
              <span className="font-display text-3xl font-bold text-ink-800">{formatWon(pack.amount)}</span>
              {pack.credits > 1 && (
                <span className="ml-2 text-sm text-ink-400">1건당 {formatWon(perUnit(pack))}</span>
              )}
            </div>

            <button
              onClick={() => {
                setSelected(pack.id);
                buy(pack.id);
              }}
              disabled={busy !== null}
              className={[
                'mt-6 rounded-full px-4 py-2.5 text-sm font-semibold transition-colors disabled:opacity-50',
                pack.badge
                  ? 'bg-sunset-500 text-white hover:bg-sunset-600'
                  : 'bg-ink-800 text-paper-50 hover:bg-ink-600',
              ].join(' ')}
            >
              {busy === pack.id ? '결제창 여는 중…' : '지금 결제하기'}
            </button>
          </li>
        ))}
      </ul>

      <div className="mt-6">
        <PurchaseConsent pack={selected ? getPack(selected) ?? null : null} checked={agreed} onChange={setAgreed} />
      </div>

      {error && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</p>}
    </div>
  );
}
