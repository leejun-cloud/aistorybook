import { CreditPackList } from '../../components/CreditPackList';
import { BusinessFooter } from '../../components/BusinessFooter';

export const metadata = { title: '이용권 — AI 동화제작' };
export const dynamic = 'force-dynamic';

const INCLUDED = [
  '장면 그림 생성과 재생성, 레이아웃 조판',
  '표지 제작 · 책등 자동 계산 · ISBN 바코드',
  '사전검사 리포트와 자동 수정',
  '열람용 PDF · 인쇄용 본문/표지 PDF · 유통 패키지',
];

export default function PricingPage() {
  return (
    <>
    <main className="mx-auto w-full max-w-4xl flex-1 overflow-y-auto px-6 py-12">
      <h1 className="font-display text-3xl font-bold text-ink-800">이용권</h1>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-600">
        과금 단위는 <strong className="text-ink-800">작업 프로젝트 1건</strong>입니다. 한 번 잠금을 푼
        책은 이후 추가 결제 없이 다시 내려받을 수 있습니다. 스토리·캐릭터·조판 단계는 결제 전에도
        모두 써볼 수 있고, 다운로드 시점에만 이용권이 쓰입니다.
      </p>

      <div className="mt-10">
        <CreditPackList />
      </div>

      <section className="mt-14 rounded-2xl border border-paper-200 bg-white p-6">
        <h2 className="font-serif text-lg font-bold text-ink-800">이용권 1건에 포함되는 것</h2>
        <ul className="mt-4 grid gap-2 text-sm text-ink-600 sm:grid-cols-2">
          {INCLUDED.map((item) => (
            <li key={item} className="flex gap-2">
              <span className="text-sunset-500">·</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </section>

      <p className="mt-8 text-xs leading-relaxed text-ink-400">
        결제는 토스페이먼츠를 통해 처리됩니다. 결제 후 잔여 이용권은 작업실과 이 페이지에서 확인할 수
        있습니다.
      </p>
    </main>
    <BusinessFooter />
    </>
  );
}
