import Link from 'next/link';
import { STYLE_LIBRARY, PUBLISHED_STYLE_PRESETS, PLOT_PATTERNS } from '../lib/demo';
import { PART_LABELS, PART_ORDER } from '../lib/types';

const STEP_DETAIL: Record<(typeof PART_ORDER)[number], string> = {
  story: '아이디어 한 줄과 대상 연령을 넣으면 플롯 패턴에 맞춰 장면별 글을 씁니다.',
  character: '화풍을 고르고 주인공 얼굴을 확정하면 모든 장면에 같은 얼굴이 유지됩니다.',
  layout: '장면마다 그림을 만들고 10종 레이아웃 위에 글상자를 올려 지면을 잡습니다.',
  publish: '표지를 만들고 넘침·안전영역·해상도를 검수한 뒤 인쇄용 PDF로 내려받습니다.',
};

export default function LandingPage() {
  const styles = [...STYLE_LIBRARY.slice(0, 3), ...PUBLISHED_STYLE_PRESETS.slice(0, 3)];

  return (
    <main className="flex-1 overflow-y-auto">
      {/* 히어로 */}
      <section className="border-b border-paper-200 bg-paper-50">
        <div className="mx-auto max-w-5xl px-6 py-20 text-center">
          <p className="font-display text-sm tracking-widest text-sunset-600">AI 동화제작</p>
          <h1 className="mt-4 font-serif text-4xl font-black leading-tight text-ink-800 sm:text-5xl">
            아이디어 한 줄이
            <br />
            인쇄 가능한 그림책 한 권이 되도록
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-ink-600">
            스토리 · 캐릭터 · 그림 · 조판 · 검수 · 인쇄용 PDF까지. 그림책 제작의 전 과정을 한자리에서
            끝내는 AI 스튜디오입니다.
          </p>
          <div className="mt-10 flex justify-center gap-3">
            <Link
              href="/dashboard"
              className="rounded-full bg-ink-800 px-6 py-3 text-sm font-medium text-paper-50 transition-colors hover:bg-ink-600"
            >
              책 만들기 시작
            </Link>
            <Link
              href="/samples"
              className="rounded-full border border-paper-300 px-6 py-3 text-sm font-medium text-ink-600 transition-colors hover:bg-paper-100"
            >
              화풍 도감 둘러보기
            </Link>
          </div>
        </div>
      </section>

      {/* 4단계 */}
      <section className="mx-auto max-w-5xl px-6 py-20">
        <h2 className="font-display text-2xl font-bold text-ink-800">제작은 네 단계로 끝납니다</h2>
        <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PART_ORDER.map((part, i) => (
            <li key={part} className="rounded-2xl border border-paper-200 bg-white p-5">
              <span className="font-display text-3xl font-bold text-paper-300">{i + 1}</span>
              <h3 className="mt-2 font-serif font-bold text-ink-800">{PART_LABELS[part]}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-400">{STEP_DETAIL[part]}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* 화풍 도감 미리보기 */}
      <section className="border-y border-paper-200 bg-paper-50">
        <div className="mx-auto max-w-5xl px-6 py-20">
          <div className="flex items-end justify-between">
            <div>
              <h2 className="font-display text-2xl font-bold text-ink-800">화풍 도감</h2>
              <p className="mt-2 text-sm text-ink-400">
                실제로 생성된 예시 그림을 보고 고르세요. 고른 화풍은 책 전체에 일관되게 적용됩니다.
              </p>
            </div>
            <Link href="/samples" className="shrink-0 text-sm text-sunset-600 hover:underline">
              전체 보기 →
            </Link>
          </div>
          <ul className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            {styles.map((s) => (
              <li key={s.id} className="overflow-hidden rounded-xl border border-paper-200 bg-white">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={s.exampleUrl} alt={s.name} className="aspect-square w-full object-cover" />
                <p className="px-2 py-2 text-center text-xs font-medium text-ink-600">{s.name}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* 플롯 패턴 */}
      <section className="mx-auto max-w-5xl px-6 py-20">
        <h2 className="font-display text-2xl font-bold text-ink-800">검증된 플롯 패턴 위에서 씁니다</h2>
        <p className="mt-2 text-sm text-ink-400">
          고전 그림책에서 반복되는 이야기 골격을 패턴으로 정리했습니다. 각 패턴에는 흔히 실패하는
          지점까지 적혀 있어, 초고가 그 함정을 피해 갑니다.
        </p>
        <ul className="mt-8 grid gap-4 sm:grid-cols-2">
          {PLOT_PATTERNS.map((p) => (
            <li key={p.id} className="rounded-2xl border border-paper-200 bg-white p-5">
              <div className="flex items-baseline gap-2">
                <h3 className="font-serif font-bold text-ink-800">{p.name}</h3>
                <span className="text-xs text-ink-400">{p.ageRange}</span>
              </div>
              <p className="mt-2 text-sm text-ink-600">{p.description}</p>
              <p className="mt-2 text-xs text-ink-400">흔한 실패 — {p.commonFailure}</p>
            </li>
          ))}
        </ul>
      </section>

      <footer className="border-t border-paper-200 bg-paper-50 px-6 py-10 text-center text-xs text-ink-400">
        AI 동화제작 — 아이디어에서 인쇄 가능한 그림책까지
      </footer>
    </main>
  );
}
