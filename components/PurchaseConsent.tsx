'use client';

import Link from 'next/link';
import { CreditPack, formatWon } from '../lib/pricing';

/**
 * 결제 전 거래조건 고지와 구매 동의.
 *
 * 전자상거래법 제13조 제2항은 청약 전에 거래조건(재화의 내용, 가격, 청약철회의 기한·
 * 행사방법·효과)을 표시하도록, 제8조 제2항은 청약 내용을 확인하고 정정할 수 있는
 * 절차를 두도록 정한다. 이 컴포넌트가 두 가지를 함께 처리한다.
 */
export function PurchaseConsent({
  pack,
  checked,
  onChange,
}: {
  pack: CreditPack | null;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="rounded-xl border border-paper-300 bg-white p-4">
      <p className="text-xs font-semibold text-ink-800">구매 조건 확인</p>

      <dl className="mt-2.5 space-y-1 text-[11px] leading-relaxed text-ink-600">
        <div className="flex gap-2">
          <dt className="w-20 shrink-0 text-ink-400">상품</dt>
          <dd>{pack ? `${pack.name} (이용권 ${pack.credits}건)` : '아래에서 선택'}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-20 shrink-0 text-ink-400">결제 금액</dt>
          <dd>{pack ? `${formatWon(pack.amount)} (부가세 포함)` : '-'}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-20 shrink-0 text-ink-400">공급 시기</dt>
          <dd>결제 승인 즉시 이용권이 적립됩니다. 유효기간은 없습니다.</dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-20 shrink-0 text-ink-400">청약철회</dt>
          <dd>
            구매일부터 7일 이내, 사용하지 않은 이용권은 전액 환불됩니다.{' '}
            <strong className="text-ink-800">
              이용권으로 프로젝트 잠금을 해제하면 그 1건은 환불되지 않습니다
            </strong>
            {' '}— 인쇄용 파일 다운로드가 즉시 열리기 때문입니다.
          </dd>
        </div>
      </dl>

      <label className="mt-3.5 flex cursor-pointer items-start gap-2 border-t border-paper-200 pt-3 text-xs text-ink-600">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-ink-800"
        />
        <span>
          위 거래 조건과{' '}
          <Link href="/terms" target="_blank" className="underline hover:text-ink-800">
            이용약관
          </Link>
          ·
          <Link href="/privacy" target="_blank" className="underline hover:text-ink-800">
            개인정보처리방침
          </Link>
          ·
          <Link href="/refund" target="_blank" className="underline hover:text-ink-800">
            환불 안내
          </Link>
          를 확인했으며, 이에 동의하고 결제를 진행합니다. <span className="text-sunset-600">(필수)</span>
        </span>
      </label>
    </div>
  );
}
