import Link from 'next/link';
import { PUBLISHED_STYLE_PRESETS, STYLE_LIBRARY } from '../../lib/demo';

export const metadata = { title: '화풍 도감 — AI 동화제작' };

export default function SamplesPage() {
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 overflow-y-auto px-6 py-12">
      <h1 className="font-display text-3xl font-bold text-ink-800">화풍 도감</h1>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-600">
        아래 그림은 모두 이 스튜디오의 이미지 엔진이 실제로 생성한 예시입니다. 고른 화풍은 캐릭터
        얼굴과 모든 장면에 같은 기준으로 적용됩니다.
      </p>

      <section className="mt-12">
        <h2 className="font-serif text-xl font-bold text-ink-800">기본 화풍</h2>
        <p className="mt-1 text-sm text-ink-400">재료와 질감으로 나눈 여섯 가지 기본 계열.</p>
        <ul className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {STYLE_LIBRARY.map((s) => (
            <li key={s.id} className="overflow-hidden rounded-2xl border border-paper-200 bg-white">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={s.exampleUrl} alt={s.name} className="aspect-square w-full object-cover" />
              <div className="p-4">
                <h3 className="font-serif font-bold text-ink-800">{s.name}</h3>
                <p className="mt-1 text-sm text-ink-600">{s.description}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-16">
        <h2 className="font-serif text-xl font-bold text-ink-800">출판 사례 계열</h2>
        <p className="mt-1 max-w-2xl text-sm text-ink-400">
          실제 출판 그림책들에서 검증된 미학을 &ldquo;재사용 가능한 스타일 특성&rdquo;으로만 정리한
          프리셋입니다. 특정 작품·캐릭터·구도를 지칭하지 않습니다. 화풍과 함께 어울리는 분위기와
          글상자 기본값까지 한 번에 적용됩니다.
        </p>
        <ul className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {PUBLISHED_STYLE_PRESETS.map((s) => (
            <li key={s.id} className="overflow-hidden rounded-2xl border border-paper-200 bg-white">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={s.exampleUrl} alt={s.name} className="aspect-square w-full object-cover" />
              <div className="p-4">
                <h3 className="font-serif font-bold text-ink-800">{s.name}</h3>
                <p className="mt-1 text-sm text-ink-600">{s.description}</p>
                <dl className="mt-3 space-y-1 text-xs text-ink-400">
                  <div className="flex gap-2">
                    <dt className="shrink-0">어울리는 분위기</dt>
                    <dd className="text-ink-600">{s.mood}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="shrink-0">글 배치</dt>
                    <dd className="text-ink-600">{s.textBox === 'box' ? '그림 위 글상자' : '여백에 글'}</dd>
                  </div>
                </dl>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <div className="mt-16 rounded-2xl border border-paper-200 bg-paper-50 p-8 text-center">
        <p className="font-serif text-lg text-ink-800">마음에 드는 화풍을 찾으셨나요?</p>
        <Link
          href="/dashboard"
          className="mt-4 inline-block rounded-full bg-ink-800 px-6 py-3 text-sm font-medium text-paper-50 hover:bg-ink-600"
        >
          이 화풍으로 책 만들기
        </Link>
      </div>
    </main>
  );
}
