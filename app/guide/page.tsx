import Link from 'next/link';
import { PART_LABELS, PART_ORDER, ProjectPartKey } from '../../lib/types';

export const metadata = { title: '제작 과정 — AI 동화제작' };

const GUIDE: Record<ProjectPartKey, { summary: string; items: string[] }> = {
  story: {
    summary: '아이디어 한 줄 → 장면별 글 초고',
    items: [
      '대상 연령과 장면 수(8~24쪽 프리셋)를 정합니다.',
      '브레인스토밍 대화로 원하는 느낌을 좁힙니다.',
      '플롯 패턴을 골라 장면별 글·감정·배경·인물을 뽑습니다.',
      '품질 게이트가 이야기 구조를 점검한 뒤 승인합니다.',
    ],
  },
  character: {
    summary: '화풍 확정 → 주인공 얼굴 고정',
    items: [
      '화풍 도감에서 고르거나 참고 그림을 직접 올립니다.',
      '주인공 후보 그림을 여러 장 만들어 하나를 확정합니다.',
      '확정된 얼굴은 텍스트 DNA(고정/금지 요소)로 잠깁니다.',
      '이후 모든 장면에서 같은 얼굴이 유지됩니다.',
    ],
  },
  layout: {
    summary: '장면 그림 생성 → 지면 조판',
    items: [
      '장면마다 그림 후보를 만들고 고릅니다.',
      '10종 레이아웃 템플릿 위에 그림·글상자를 배치합니다.',
      '글 크기·행간·색·위치를 지면 단위로 조절합니다.',
      '초안(draft) 그림을 최종(final) 해상도로 올립니다.',
    ],
  },
  publish: {
    summary: '표지 제작 → 검수 → 인쇄용 PDF',
    items: [
      '표지 후보를 만들고 제목·작가명·책등·뒷표지 문구를 편집합니다.',
      '판형과 인쇄 프로파일(부크크·교보)에 맞춰 책등 두께를 계산합니다.',
      '사전검사로 글 넘침 · 안전영역 · 300dpi 해상도 · 폰트 임베드를 점검하고 검수 점수를 받습니다.',
      '열람용 PDF와 인쇄용 본문·표지 PDF를 내려받습니다.',
    ],
  },
};

export default function GuidePage() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 overflow-y-auto px-6 py-12">
      <h1 className="font-display text-3xl font-bold text-ink-800">제작 과정</h1>
      <p className="mt-2 text-sm leading-relaxed text-ink-600">
        각 단계는 승인해야 다음으로 넘어갑니다. 앞 단계로 돌아가 언제든 고칠 수 있습니다.
      </p>

      <ol className="mt-10 space-y-8">
        {PART_ORDER.map((part, i) => {
          const g = GUIDE[part];
          return (
            <li key={part} className="rounded-2xl border border-paper-200 bg-white p-6">
              <div className="flex items-baseline gap-3">
                <span className="font-display text-2xl font-bold text-paper-300">{i + 1}</span>
                <h2 className="font-serif text-lg font-bold text-ink-800">{PART_LABELS[part]}</h2>
                <span className="text-xs text-ink-400">{g.summary}</span>
              </div>
              <ul className="mt-4 space-y-2 text-sm text-ink-600">
                {g.items.map((item) => (
                  <li key={item} className="flex gap-2">
                    <span className="text-sunset-500">·</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ol>

      <div className="mt-12 text-center">
        <Link
          href="/dashboard"
          className="inline-block rounded-full bg-ink-800 px-6 py-3 text-sm font-medium text-paper-50 hover:bg-ink-600"
        >
          작업실로 가기
        </Link>
      </div>
    </main>
  );
}
