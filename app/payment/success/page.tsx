import { Suspense } from 'react';
import { PaymentSuccessClient } from '../../../components/PaymentSuccessClient';

export const metadata = { title: '결제 확인 중 — AI 동화제작' };

export default function PaymentSuccessPage() {
  return (
    <Suspense fallback={<div className="p-12 text-ink-400">불러오는 중…</div>}>
      <PaymentSuccessClient />
    </Suspense>
  );
}
