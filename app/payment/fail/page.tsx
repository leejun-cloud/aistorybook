import Link from 'next/link';

export const metadata = { title: '결제 실패 — AI 동화제작' };

export default function PaymentFailPage() {
  return (
    <main className="mx-auto w-full max-w-md flex-1 overflow-y-auto px-6 py-24 text-center">
      <h1 className="font-serif text-xl font-bold text-ink-800">결제가 완료되지 않았습니다</h1>
      <p className="mt-3 text-sm text-ink-600">
        결제창을 닫았거나 승인이 거절되었습니다. 이용권은 차감되지 않았습니다.
      </p>
      <Link
        href="/pricing"
        className="mt-8 inline-block rounded-full bg-ink-800 px-6 py-3 text-sm font-medium text-paper-50 hover:bg-ink-600"
      >
        다시 시도하기
      </Link>
    </main>
  );
}
