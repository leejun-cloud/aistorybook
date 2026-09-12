'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

type State =
  | { kind: 'confirming' }
  | { kind: 'done'; granted: number; credits: number; returnTo?: string }
  | { kind: 'error'; message: string };

/**
 * Toss 결제창 성공 리다이렉트 착지점. 여기서 서버 승인(/api/credits/confirm)을
 * 호출해야 실제 결제가 확정되고 이용권이 적립된다 — 리다이렉트만으로는 결제가
 * 끝난 것이 아니다.
 */
export function PaymentSuccessClient() {
  const params = useSearchParams();
  const [state, setState] = useState<State>({ kind: 'confirming' });
  // React 18 StrictMode에서 effect가 두 번 도는 것을 막는다 (중복 승인 호출 방지)
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const paymentKey = params.get('paymentKey');
    const orderId = params.get('orderId');
    const amount = params.get('amount');
    const returnTo = params.get('returnTo') ?? undefined;

    if (!paymentKey || !orderId || !amount) {
      setState({ kind: 'error', message: '결제 정보가 올바르지 않습니다.' });
      return;
    }

    fetch('/api/credits/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paymentKey, orderId, amount: Number(amount) }),
    })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? '결제 승인에 실패했습니다');
        setState({ kind: 'done', granted: d.granted ?? 0, credits: d.credits ?? 0, returnTo });
      })
      .catch((e) => setState({ kind: 'error', message: (e as Error).message }));
  }, [params]);

  return (
    <main className="mx-auto w-full max-w-md flex-1 overflow-y-auto px-6 py-24 text-center">
      {state.kind === 'confirming' && (
        <>
          <h1 className="font-serif text-xl font-bold text-ink-800">결제를 확인하고 있습니다</h1>
          <p className="mt-3 text-sm text-ink-400">창을 닫지 말고 잠시만 기다려 주세요.</p>
        </>
      )}

      {state.kind === 'done' && (
        <>
          <h1 className="font-serif text-xl font-bold text-ink-800">결제가 완료되었습니다</h1>
          <p className="mt-3 text-sm text-ink-600">
            이용권 {state.granted}건이 적립되었습니다. 현재 잔여 {state.credits}건.
          </p>
          <Link
            href={state.returnTo ?? '/dashboard'}
            className="mt-8 inline-block rounded-full bg-ink-800 px-6 py-3 text-sm font-medium text-paper-50 hover:bg-ink-600"
          >
            {state.returnTo ? '작업 이어서 하기' : '작업실로 가기'}
          </Link>
        </>
      )}

      {state.kind === 'error' && (
        <>
          <h1 className="font-serif text-xl font-bold text-ink-800">결제 승인에 실패했습니다</h1>
          <p className="mt-3 text-sm text-red-600">{state.message}</p>
          <Link
            href="/pricing"
            className="mt-8 inline-block rounded-full border border-paper-300 px-6 py-3 text-sm font-medium text-ink-600 hover:bg-paper-100"
          >
            이용권 페이지로
          </Link>
        </>
      )}
    </main>
  );
}
