import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: 'AI 동화책 제작 스튜디오',
  description: '아이디어에서 인쇄 가능한 동화책 PDF까지',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="flex h-screen flex-col">
        <header className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-3">
          <Link href="/" className="text-lg font-bold text-brand-600">
            AI 동화책 제작 스튜디오
          </Link>
        </header>
        <div className="flex flex-1 flex-col overflow-hidden">{children}</div>
      </body>
    </html>
  );
}
