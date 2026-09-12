import Link from 'next/link';
import { LegalPage, Ordered } from '../../components/LegalPage';
import { BusinessFooter } from '../../components/BusinessFooter';
import { businessInfo } from '../../lib/legal/business';

export const metadata = { title: '환불·청약철회 안내 — AI 동화제작' };
export const dynamic = 'force-dynamic';

export default function RefundPage() {
  const biz = businessInfo();

  return (
    <>
      <LegalPage
        title="환불 · 청약철회 안내"
        updatedAt="2026년 9월 12일"
        intro={
          <div className="rounded-xl border border-paper-300 bg-paper-50 p-5">
            <p className="font-semibold text-ink-800">한 줄 요약</p>
            <p className="mt-2">
              <strong className="text-ink-800">아직 쓰지 않은 이용권은 구매일로부터 7일 이내 전액 환불</strong>
              됩니다. 이미 프로젝트 잠금 해제에 사용한 이용권은, 인쇄용 파일이 이미 전달된 것이므로
              환불되지 않습니다.
            </p>
          </div>
        }
        sections={[
          {
            heading: '1. 청약철회가 가능한 경우',
            body: (
              <>
                <p>
                  「전자상거래 등에서의 소비자보호에 관한 법률」 제17조 제1항에 따라, 이용권을 구매한
                  날부터 <strong className="text-ink-800">7일 이내</strong>에 청약철회를 하실 수 있습니다.
                </p>
                <Ordered
                  items={[
                    '구매한 이용권을 한 건도 사용하지 않은 경우 — 결제 금액 전액을 환불합니다.',
                    '묶음 이용권(3건·10건)의 일부만 사용한 경우 — 사용한 건수를 단건 정가(₩3,900) 기준으로 차감하고, 남은 금액을 환불합니다. 차감액이 결제 금액을 넘는 경우 환불액은 0원입니다.',
                    '표시·광고 내용과 다르거나 계약 내용과 다르게 이행된 경우 — 그 사실을 안 날부터 30일 이내, 공급받은 날부터 3개월 이내에 청약철회를 하실 수 있습니다.',
                  ]}
                />
              </>
            ),
          },
          {
            heading: '2. 청약철회가 제한되는 경우',
            body: (
              <>
                <p>
                  같은 법 제17조 제2항 제5호 및 같은 법 시행령 제21조에 따라,{' '}
                  <strong className="text-ink-800">
                    이용권을 사용해 프로젝트의 잠금을 해제한 시점부터
                  </strong>{' '}
                  해당 이용권 1건에 대해서는 청약철회가 제한됩니다. 잠금 해제와 동시에 인쇄용 본문 PDF,
                  인쇄용 표지 PDF, 출판 패키지의 다운로드가 열리며, 이는 복제가 가능한 디지털 콘텐츠의
                  제공이 개시된 것에 해당하기 때문입니다.
                </p>
                <p>
                  회사는 위 법령이 요구하는 바에 따라, 구매 전에 서비스를 충분히 확인하실 수 있도록 다음을
                  무료로 제공합니다.
                </p>
                <Ordered
                  items={[
                    '스토리 생성, 캐릭터·화풍 설정, 삽화 생성, 조판, 표지 제작, 사전검사까지 제작 전 과정',
                    '완성된 책의 열람용 미리보기 PDF — 실제 지면을 그대로 확인하실 수 있습니다',
                    '화풍 도감에서 실제 생성된 예시 그림 12종',
                  ]}
                />
                <p className="text-ink-400">
                  즉, 무엇을 받게 되는지 결제 전에 전부 확인하실 수 있으며, 결제는 그 결과물을 인쇄용
                  파일로 내보내는 시점에만 필요합니다.
                </p>
              </>
            ),
          },
          {
            heading: '3. 회사의 귀책으로 인한 환불',
            body: (
              <p>
                다음의 경우에는 이용권 사용 여부와 관계없이 전액 환불하거나 이용권을 복구해 드립니다.
                서비스 장애로 산출물이 생성되지 않거나 손상된 경우, 결제가 중복 처리된 경우, 회사가
                서비스를 종료하는 경우입니다.
              </p>
            ),
          },
          {
            heading: '4. 환불 신청 방법과 처리 기간',
            body: (
              <>
                <Ordered
                  items={[
                    <>
                      {biz.email}로 <strong className="text-ink-800">결제하신 주문번호</strong>와 환불 사유를
                      보내주시면 됩니다. 주문번호는 이용권 페이지의 결제 내역에서 확인하실 수 있습니다.
                    </>,
                    '회사는 신청을 받은 날부터 3영업일 이내에 환불 가능 여부를 회신합니다.',
                    '환불이 확정되면 같은 법 제18조 제2항에 따라 3영업일 이내에 결제 취소를 요청합니다. 카드 결제의 경우 카드사 처리 일정에 따라 실제 취소 반영까지 영업일 기준 3~5일이 추가로 소요될 수 있습니다.',
                  ]}
                />
                <p className="text-ink-400">
                  청약철회로 인한 결제 취소 수수료는 회사가 부담하며, 이용자에게 청구하지 않습니다.
                </p>
              </>
            ),
          },
          {
            heading: '5. 잠금 해제 이후의 재다운로드',
            body: (
              <p>
                한 번 잠금을 해제한 프로젝트는 추가 결제 없이 언제든 다시 내려받을 수 있습니다. 파일을
                분실하셨다면 해당 프로젝트의{' '}
                <Link href="/dashboard" className="font-semibold text-sunset-600 underline">
                  작업실
                </Link>
                에서 다시 다운로드하시면 됩니다.
              </p>
            ),
          },
          {
            heading: '6. 분쟁 조정',
            body: (
              <p>
                환불에 관해 회사와 합의가 이루어지지 않는 경우, 한국소비자원 소비자상담센터(국번없이
                1372) 또는 공정거래위원회 전자거래분쟁조정위원회에 조정을 신청하실 수 있습니다.
              </p>
            ),
          },
        ]}
      />
      <BusinessFooter />
    </>
  );
}
