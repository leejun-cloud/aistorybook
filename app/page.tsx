import Link from 'next/link';
import { STYLE_LIBRARY, PUBLISHED_STYLE_PRESETS, PLOT_PATTERNS } from '../lib/demo';
import { CREDIT_PACKS, formatWon, perUnit } from '../lib/pricing';
import { PART_LABELS, PART_ORDER, ProjectPartKey } from '../lib/types';
import { BusinessFooter } from '../components/BusinessFooter';

const STEPS: Record<ProjectPartKey, { lead: string; detail: string }> = {
  story: {
    lead: '아이디어 한 줄에서 장면별 글까지',
    detail:
      '대상 연령과 쪽수를 정하면 검증된 플롯 패턴 위에서 장면마다 글·감정·배경을 씁니다. 품질 게이트가 구조를 먼저 점검합니다.',
  },
  character: {
    lead: '화풍을 고르면 얼굴이 고정됩니다',
    detail:
      '주인공 후보를 여러 장 만들어 하나를 확정하면, 그 얼굴이 텍스트 DNA로 잠겨 마지막 장면까지 같은 인물로 남습니다.',
  },
  layout: {
    lead: '그림과 글이 한 지면 위에서',
    detail:
      '장면 그림을 만들고 10종 레이아웃 위에 글상자를 올립니다. 글 크기·행간·위치를 지면 단위로 조절합니다.',
  },
  publish: {
    lead: '인쇄소에 그대로 넘길 수 있는 파일로',
    detail:
      '표지와 책등을 계산하고, 글 넘침·안전영역·300dpi 해상도를 검수해 점수를 냅니다. 고칠 수 있는 건 자동으로 고칩니다.',
  },
};

const CRAFT = [
  {
    title: '책등은 계산해서 나옵니다',
    body: '판형·제본·용지 두께·쪽수에서 책등 폭을 0.5mm 단위로 계산합니다. 5mm 미만이면 책등 글자를 알아서 뺍니다. 부크크·교보 규격 7종이 데이터로 들어 있습니다.',
  },
  {
    title: 'ISBN은 바코드로 인쇄됩니다',
    body: '13자리를 넣으면 체크디지트를 검증하고, 뒷표지 안전영역 안에 규격 폭 37.29mm의 EAN-13 바코드를 벡터로 얹습니다.',
  },
  {
    title: '검수는 점수로 나옵니다',
    body: '글이 상자를 넘치는지 Typst로 실제 조판해 mm 단위로 잽니다. 넘치면 글자 크기를 재실측하며 줄이고, 해상도가 낮으면 300dpi 변형본을 만듭니다.',
  },
];

export const dynamic = 'force-dynamic';

export default function LandingPage() {
  const styles = [...STYLE_LIBRARY.slice(0, 3), ...PUBLISHED_STYLE_PRESETS.slice(0, 3)];
  const single = CREDIT_PACKS[0];

  return (
    <main className="flex-1 overflow-y-auto">
      {/* ── 히어로 ─────────────────────────────────────────── */}
      <section className="relative overflow-hidden border-b border-paper-200 bg-paper-50">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-6 py-24 lg:grid-cols-[1fr_1.1fr] lg:py-32">
          <div>
            <p className="font-display text-xs tracking-[0.2em] text-sunset-600">AI 동화제작 STUDIO</p>
            <h1 className="mt-6 font-serif text-[2.6rem] font-black leading-[1.15] tracking-tight text-ink-800 sm:text-5xl">
              아이디어 한 줄이
              <br />
              <span className="text-sunset-600">한 권의 책</span>이 되도록
            </h1>
            <p className="mt-7 max-w-md text-[0.95rem] leading-relaxed text-ink-600">
              스토리를 쓰고, 그림을 그리고, 지면을 잡고, 인쇄용 파일까지 검수해서 내보냅니다.
              그림책 한 권을 끝까지 만드는 데 필요한 과정이 전부 한자리에 있습니다.
            </p>
            <div className="mt-10 flex flex-wrap gap-3">
              <Link
                href="/dashboard"
                className="rounded-full bg-ink-800 px-7 py-3.5 text-sm font-semibold text-paper-50 shadow-sm transition-colors hover:bg-ink-600"
              >
                책 만들기 시작
              </Link>
              <Link
                href="/samples"
                className="rounded-full border border-paper-300 bg-white/60 px-7 py-3.5 text-sm font-semibold text-ink-600 transition-colors hover:bg-white"
              >
                화풍 도감 둘러보기
              </Link>
            </div>
            <p className="mt-6 text-xs text-ink-400">
              제작 단계는 무료로 써보고, 인쇄용 파일을 받을 때만 {formatWon(single.amount)}.
            </p>
          </div>

          <div className="relative">
            <div className="overflow-hidden rounded-[1.75rem] border border-paper-200 bg-white shadow-[0_24px_60px_-30px_rgba(43,39,31,0.45)]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/landing/hero.jpg"
                alt="완성된 그림책과 작업 중인 삽화"
                className="aspect-[3/2] w-full object-cover"
              />
            </div>
            <div className="absolute -bottom-8 -left-6 hidden w-40 overflow-hidden rounded-2xl border border-paper-200 bg-white shadow-[0_18px_40px_-24px_rgba(43,39,31,0.5)] sm:block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/landing/stack.jpg" alt="인쇄된 그림책들" className="aspect-square w-full object-cover" />
            </div>
          </div>
        </div>
      </section>

      {/* ── 네 단계 (좌우 교차 서술형) ──────────────────────── */}
      <section className="mx-auto max-w-5xl px-6 py-24">
        <p className="font-display text-xs tracking-[0.2em] text-sunset-600">PROCESS</p>
        <h2 className="mt-3 font-serif text-3xl font-bold text-ink-800">네 단계로 끝납니다</h2>

        <div className="mt-14 space-y-px overflow-hidden rounded-2xl border border-paper-200 bg-paper-200">
          {PART_ORDER.map((part, i) => {
            const step = STEPS[part];
            return (
              <div key={part} className="grid gap-4 bg-white p-7 sm:grid-cols-[auto_14rem_1fr] sm:items-baseline">
                <span className="font-display text-2xl font-bold text-paper-300">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <div>
                  <h3 className="font-serif text-lg font-bold text-ink-800">{PART_LABELS[part]}</h3>
                  <p className="mt-1 text-xs text-sunset-600">{step.lead}</p>
                </div>
                <p className="text-sm leading-relaxed text-ink-600">{step.detail}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── 실제 지면 ──────────────────────────────────────── */}
      <section className="border-y border-paper-200 bg-paper-50">
        <div className="mx-auto grid max-w-6xl items-center gap-14 px-6 py-24 lg:grid-cols-2">
          <div className="overflow-hidden rounded-[1.5rem] border border-paper-200 bg-white shadow-[0_24px_60px_-34px_rgba(43,39,31,0.5)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/landing/spread.jpg" alt="펼친 그림책 지면" className="aspect-[3/2] w-full object-cover" />
          </div>
          <div>
            <p className="font-display text-xs tracking-[0.2em] text-sunset-600">PRINT-READY</p>
            <h2 className="mt-3 font-serif text-3xl font-bold leading-snug text-ink-800">
              화면에서 예쁜 것과
              <br />
              인쇄해서 예쁜 것은 다릅니다
            </h2>
            <dl className="mt-10 space-y-7">
              {CRAFT.map((item) => (
                <div key={item.title}>
                  <dt className="font-serif font-bold text-ink-800">{item.title}</dt>
                  <dd className="mt-1.5 text-sm leading-relaxed text-ink-600">{item.body}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>

      {/* ── 화풍 도감 ──────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-6 py-24">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-display text-xs tracking-[0.2em] text-sunset-600">STYLE INDEX</p>
            <h2 className="mt-3 font-serif text-3xl font-bold text-ink-800">화풍 도감</h2>
            <p className="mt-3 max-w-lg text-sm leading-relaxed text-ink-600">
              아래 그림은 설명이 아니라 이 스튜디오가 실제로 생성한 결과입니다. 고른 화풍은 캐릭터
              얼굴부터 마지막 장면까지 같은 기준으로 적용됩니다.
            </p>
          </div>
          <Link href="/samples" className="shrink-0 text-sm font-medium text-sunset-600 hover:underline">
            12종 전체 보기 →
          </Link>
        </div>

        <ul className="mt-12 grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-6">
          {styles.map((s) => (
            <li key={s.id} className="group">
              <div className="overflow-hidden rounded-xl border border-paper-200 bg-white">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={s.exampleUrl}
                  alt={s.name}
                  className="aspect-square w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                />
              </div>
              <p className="mt-2.5 text-center text-xs font-medium text-ink-600">{s.name}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* ── 플롯 패턴 ──────────────────────────────────────── */}
      <section className="border-y border-paper-200 bg-paper-50">
        <div className="mx-auto max-w-5xl px-6 py-24">
          <p className="font-display text-xs tracking-[0.2em] text-sunset-600">PLOT PATTERNS</p>
          <h2 className="mt-3 font-serif text-3xl font-bold text-ink-800">
            빈 화면에서 시작하지 않습니다
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-600">
            고전 그림책에서 반복되는 이야기 골격을 패턴으로 정리했습니다. 각 패턴에는 그 형식이 흔히
            실패하는 지점까지 적혀 있어, 초고가 그 함정을 피해서 나옵니다.
          </p>

          <ul className="mt-12 grid gap-x-10 gap-y-8 sm:grid-cols-2">
            {PLOT_PATTERNS.map((p) => (
              <li key={p.id} className="border-t border-paper-300 pt-5">
                <div className="flex items-baseline gap-2">
                  <h3 className="font-serif text-base font-bold text-ink-800">{p.name}</h3>
                  <span className="text-xs text-ink-400">{p.ageRange}</span>
                </div>
                <p className="mt-2 text-sm text-ink-600">{p.description}</p>
                <p className="mt-2 text-xs leading-relaxed text-ink-400">
                  <span className="text-sunset-600">흔한 실패</span> — {p.commonFailure}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── 요금 ───────────────────────────────────────────── */}
      <section className="mx-auto max-w-5xl px-6 py-24 text-center">
        <p className="font-display text-xs tracking-[0.2em] text-sunset-600">PRICING</p>
        <h2 className="mt-3 font-serif text-3xl font-bold text-ink-800">만들어 보고, 받을 때 결제합니다</h2>
        <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-ink-600">
          과금 단위는 작업 프로젝트 1건입니다. 스토리·캐릭터·조판은 결제 전에 다 써볼 수 있고,
          인쇄용 파일을 내려받을 때만 이용권이 쓰입니다. 한 번 푼 책은 평생 다시 받을 수 있습니다.
        </p>

        <ul className="mx-auto mt-12 flex max-w-2xl flex-wrap items-center justify-center gap-x-10 gap-y-4 text-sm">
          {CREDIT_PACKS.map((pack) => (
            <li key={pack.id} className="flex items-baseline gap-2">
              <span className="font-display text-xl font-bold text-ink-800">{formatWon(pack.amount)}</span>
              <span className="text-ink-400">
                {pack.name}
                {pack.credits > 1 && ` · 1건당 ${formatWon(perUnit(pack))}`}
              </span>
            </li>
          ))}
        </ul>

        <div className="mt-12 flex flex-wrap justify-center gap-3">
          <Link
            href="/dashboard"
            className="rounded-full bg-ink-800 px-7 py-3.5 text-sm font-semibold text-paper-50 transition-colors hover:bg-ink-600"
          >
            책 만들기 시작
          </Link>
          <Link
            href="/pricing"
            className="rounded-full border border-paper-300 px-7 py-3.5 text-sm font-semibold text-ink-600 transition-colors hover:bg-paper-100"
          >
            이용권 자세히 보기
          </Link>
        </div>
      </section>

      <BusinessFooter />
    </main>
  );
}
