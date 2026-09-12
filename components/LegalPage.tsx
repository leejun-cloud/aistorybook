import { ReactNode } from 'react';

export interface LegalSection {
  heading: string;
  body: ReactNode;
}

/** 약관·방침 공통 지면 — 조문 구조를 그대로 읽히게 하는 산문형 레이아웃 */
export function LegalPage({
  title,
  updatedAt,
  intro,
  sections,
}: {
  title: string;
  updatedAt: string;
  intro?: ReactNode;
  sections: LegalSection[];
}) {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 overflow-y-auto px-6 py-14">
      <h1 className="font-display text-3xl font-bold text-ink-800">{title}</h1>
      <p className="mt-2 text-xs text-ink-400">시행일 {updatedAt}</p>
      {intro && <div className="mt-6 text-sm leading-relaxed text-ink-600">{intro}</div>}

      <div className="mt-12 space-y-10">
        {sections.map((s) => (
          <section key={s.heading}>
            <h2 className="font-serif text-base font-bold text-ink-800">{s.heading}</h2>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-ink-600">{s.body}</div>
          </section>
        ))}
      </div>
    </main>
  );
}

/** 약관 본문에서 쓰는 번호 목록 */
export function Ordered({ items }: { items: ReactNode[] }) {
  return (
    <ol className="space-y-2">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2.5">
          <span className="shrink-0 text-ink-400">{i + 1}.</span>
          <span>{item}</span>
        </li>
      ))}
    </ol>
  );
}
