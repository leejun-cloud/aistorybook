'use client';

import { useCallback, useEffect, useState } from 'react';
import { CREDIT_PACKS, formatWon, getPack, perUnit } from '../lib/pricing';
import { PurchaseConsent } from './PurchaseConsent';

interface Props {
  projectId: string;
  projectTitle: string;
  unlockedAt?: string;
  /** 잠금 해제 성공 시 부모가 프로젝트를 다시 읽도록 */
  onUnlocked: (unlockedAt: string) => void;
}

/**
 * 인쇄용 파일 잠금 해제. 잔여 이용권이 있으면 바로 차감해 풀고, 없으면
 * 이용권 구매(토스 결제창)로 넘긴다 — 결제 후 돌아오면 이 프로젝트로 복귀한다.
 */
export function UnlockPanel({ projectId, projectTitle, unlockedAt, onUnlocked }: Props) {
  const [credits, setCredits] = useState<number | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string>('single');
  const [agreed, setAgreed] = useState(false);

  const refresh = useCallback(() => {
    fetch('/api/credits')
      .then((r) => r.json())
      .then((d) => setCredits(d.credits ?? 0))
      .catch(() => setCredits(null));
  }, []);

  useEffect(refresh, [refresh]);

  if (unlockedAt) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
        <p className="font-semibold">잠금 해제됨</p>
        <p className="mt-1 text-xs text-emerald-700">
          {new Date(unlockedAt).toLocaleString('ko-KR')}에 해제 — 인쇄용 파일과 출판 패키지를 추가 결제
          없이 언제든 다시 내려받을 수 있습니다.
        </p>
      </div>
    );
  }

  const unlock = async () => {
    setBusy('unlock');
    setError(null);
    try {
      const res = await fetch('/api/credits/unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      });
      const d = await res.json();
      if (res.status === 401) throw new Error('이용권은 계정별로 관리됩니다. 오른쪽 위에서 로그인해 주세요.');
      if (!res.ok) throw new Error(d.error ?? '잠금 해제에 실패했습니다');
      setCredits(d.credits ?? 0);
      onUnlocked(d.unlockedAt);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const buy = async (packId: string) => {
    setSelected(packId);
    if (!agreed) {
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
      const returnTo = `/publish?project=${encodeURIComponent(projectId)}`;
      await toss.requestPayment('카드', {
        amount: order.amount,
        orderId: order.orderId,
        orderName: order.orderName,
        successUrl: `${window.location.origin}/payment/success?returnTo=${encodeURIComponent(returnTo)}`,
        failUrl: `${window.location.origin}/payment/fail`,
      });
    } catch (e) {
      const msg = (e as Error).message;
      setError(msg.includes('취소') || msg.includes('CANCEL') ? null : msg);
      setBusy(null);
    }
  };

  const single = CREDIT_PACKS[0];
  const bundles = CREDIT_PACKS.slice(1);

  return (
    <div className="rounded-xl border border-paper-300 bg-paper-50 p-5">
      <h2 className="font-serif text-base font-bold text-ink-800">
        잠금 해제 후 바로 다운로드할 수 있습니다
      </h2>

      {credits !== null && credits > 0 ? (
        <>
          <p className="mt-2 text-sm text-ink-600">
            잔여 이용권 <strong className="text-ink-800">{credits}건</strong> — 1건이 사용됩니다.
          </p>
          <button
            onClick={unlock}
            disabled={busy !== null}
            className="mt-4 rounded-full bg-ink-800 px-5 py-2.5 text-sm font-semibold text-paper-50 hover:bg-ink-600 disabled:opacity-50"
          >
            {busy === 'unlock' ? '해제 중…' : `이용권으로 잠금 해제 — 「${projectTitle}」`}
          </button>
        </>
      ) : (
        <>
          <div className="mt-3 flex items-baseline gap-3">
            <span className="font-display text-3xl font-bold text-ink-800">{formatWon(single.amount)}</span>
            <span className="text-sm text-ink-400">프로젝트 1건 — 「{projectTitle}」</span>
          </div>
          <button
            onClick={() => buy(single.id)}
            disabled={busy !== null}
            className="mt-4 w-full rounded-full bg-ink-800 px-5 py-2.5 text-sm font-semibold text-paper-50 hover:bg-ink-600 disabled:opacity-50 sm:w-auto sm:px-8"
          >
            {busy === single.id ? '결제창 여는 중…' : '지금 결제하기'}
          </button>

          <p className="mt-6 text-xs font-medium text-ink-400">또는 더 저렴하게</p>
          <ul className="mt-2 grid gap-2 sm:grid-cols-2">
            {bundles.map((pack) => (
              <li key={pack.id}>
                <button
                  onClick={() => buy(pack.id)}
                  disabled={busy !== null}
                  className="flex w-full items-center justify-between rounded-xl border border-paper-300 bg-white px-4 py-3 text-left transition-colors hover:border-sunset-400 disabled:opacity-50"
                >
                  <span>
                    <span className="block text-sm font-semibold text-ink-800">{pack.name}</span>
                    <span className="block text-xs text-ink-400">1건당 {formatWon(perUnit(pack))}</span>
                  </span>
                  <span className="font-display text-lg font-bold text-ink-800">{formatWon(pack.amount)}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {(credits === null || credits < 1) && (
        <div className="mt-5">
          <PurchaseConsent pack={getPack(selected) ?? null} checked={agreed} onChange={setAgreed} />
        </div>
      )}

      {error && <p className="mt-3 rounded-lg bg-red-50 p-2.5 text-xs text-red-600">{error}</p>}
    </div>
  );
}
