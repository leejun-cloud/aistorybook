import Link from 'next/link';
import { businessInfo, BIZ_LOOKUP_URL } from '../lib/legal/business';

const LEGAL_LINKS = [
  { href: '/terms', label: '이용약관' },
  { href: '/privacy', label: '개인정보처리방침', strong: true },
  { href: '/refund', label: '환불·청약철회' },
];

/**
 * 전자상거래법 제10조가 요구하는 사업자 정보 표시. 결제가 있는 서비스의 모든
 * 화면에서 닿을 수 있어야 하므로 푸터에 둔다.
 * 개인정보처리방침은 다른 항목과 구분되게 표시해야 한다 (정보통신망법 제27조의2).
 */
export function BusinessFooter() {
  const biz = businessInfo();

  const rows: [string, string][] = [
    ['상호', biz.companyName],
    ['대표자', biz.ceo],
    ['사업자등록번호', biz.regNo],
    ['통신판매업신고', biz.mailOrderNo],
    ['주소', biz.address],
    ['전화', biz.phone],
    ['이메일', biz.email],
    ['호스팅 제공자', biz.host],
  ];

  return (
    <footer className="border-t border-paper-200 bg-paper-50 px-6 py-12">
      <div className="mx-auto max-w-5xl">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <span className="font-display text-sm text-ink-600">{biz.serviceName}</span>
          <nav className="flex flex-wrap gap-5 text-xs text-ink-400">
            <Link href="/samples" className="hover:text-ink-600">화풍 도감</Link>
            <Link href="/guide" className="hover:text-ink-600">제작 과정</Link>
            <Link href="/pricing" className="hover:text-ink-600">이용권</Link>
            {LEGAL_LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={l.strong ? 'font-semibold text-ink-600 hover:text-ink-800' : 'hover:text-ink-600'}
              >
                {l.label}
              </Link>
            ))}
          </nav>
        </div>

        <dl className="mt-8 grid gap-x-8 gap-y-1.5 border-t border-paper-200 pt-6 text-[11px] leading-relaxed text-ink-400 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map(([label, value]) => (
            <div key={label} className="flex gap-2">
              <dt className="shrink-0">{label}</dt>
              <dd className="text-ink-600">{value}</dd>
            </div>
          ))}
        </dl>

        <p className="mt-5 text-[11px] leading-relaxed text-ink-400">
          {biz.companyName}는 통신판매중개자가 아닌 통신판매업자로서 이 사이트에서 판매되는 이용권에
          대해 책임을 집니다. 사업자 정보는{' '}
          <a href={BIZ_LOOKUP_URL} target="_blank" rel="noreferrer" className="underline hover:text-ink-600">
            공정거래위원회 통신판매사업자 조회
          </a>
          에서 확인하실 수 있습니다.
        </p>
      </div>
    </footer>
  );
}
