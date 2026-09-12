import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';
import { AuthButton } from '../components/AuthButton';

export const metadata: Metadata = {
  title: 'AI 동화제작 — 아이디어에서 인쇄 가능한 그림책까지',
  description:
    '스토리 · 캐릭터 · 그림 · 조판 · 인쇄까지, 그림책 한 권을 끝까지 만드는 AI 제작 스튜디오. 화풍 도감에서 그림체를 고르고 인쇄용 PDF로 내려받으세요.',
  openGraph: {
    title: 'AI 동화제작',
    description: '아이디어 한 줄에서 인쇄 가능한 그림책 PDF까지 — AI 동화책 제작 스튜디오',
    type: 'website',
    locale: 'ko_KR',
  },
};

const NAV = [
  { href: '/samples', label: '화풍 도감' },
  { href: '/guide', label: '제작 과정' },
  { href: '/pricing', label: '이용권' },
  { href: '/dashboard', label: '내 작업실' },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700&family=Noto+Serif+KR:wght@400;700;900&family=Gowun+Dodum&display=swap"
        />
      </head>
      <body className="flex h-screen flex-col">
        <header className="flex items-center justify-between border-b border-paper-200 bg-paper-50/90 px-6 py-3 backdrop-blur">
          <Link href="/" className="font-display text-lg font-bold tracking-tight text-ink-800">
            AI 동화제작
          </Link>
          <nav className="flex items-center gap-1 text-sm text-ink-600">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-full px-3 py-1.5 transition-colors hover:bg-paper-200 hover:text-ink-800"
              >
                {item.label}
              </Link>
            ))}
            <span className="ml-2"><AuthButton /></span>
          </nav>
        </header>
        <div className="flex flex-1 flex-col overflow-hidden">{children}</div>
      </body>
    </html>
  );
}
