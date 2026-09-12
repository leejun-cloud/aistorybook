import { LegalPage, Ordered } from '../../components/LegalPage';
import { BusinessFooter } from '../../components/BusinessFooter';
import { businessInfo } from '../../lib/legal/business';

export const metadata = { title: '개인정보처리방침 — AI 동화제작' };
export const dynamic = 'force-dynamic';

/** 개인정보를 제공받는 곳 — 실제로 연동된 것만 적는다 */
const PROCESSORS = [
  {
    name: '토스페이먼츠(주)',
    purpose: '신용카드 등 결제 처리 및 결제 취소',
    items: '결제수단 정보, 결제 승인 정보',
    country: '대한민국',
  },
  {
    name: 'Google LLC (Gemini API)',
    purpose: '스토리 문장 및 삽화 생성',
    items: '이용자가 입력한 아이디어·장면 글, 업로드한 참고 이미지',
    country: '미국',
  },
  {
    name: 'Vercel Inc.',
    purpose: '서비스 호스팅 및 산출물 파일 저장',
    items: '프로젝트 데이터, 생성된 이미지·PDF, 접속 로그',
    country: '미국',
  },
];

export default function PrivacyPage() {
  const biz = businessInfo();

  return (
    <>
      <LegalPage
        title="개인정보처리방침"
        updatedAt="2026년 9월 12일"
        intro={
          <p>
            {biz.companyName}(이하 &ldquo;회사&rdquo;)는 「개인정보 보호법」에 따라 이용자의 개인정보를
            보호하고 관련 고충을 신속하게 처리하기 위해 다음과 같이 개인정보처리방침을 수립·공개합니다.
          </p>
        }
        sections={[
          {
            heading: '1. 수집하는 개인정보 항목과 수집 방법',
            body: (
              <>
                <p>
                  회사는 서비스 이용에 필요한 최소한의 정보만 수집합니다. 현재 서비스는 회원가입 없이
                  이용할 수 있으며, 이름·생년월일 등 신원 정보를 별도로 수집하지 않습니다.
                </p>
                <Ordered
                  items={[
                    <>
                      <strong className="text-ink-800">이용자가 직접 입력하는 제작 정보</strong> — 책의
                      아이디어, 장면 글, 등장인물 설명, 업로드한 참고 이미지, 서지정보(저자명·출판사·ISBN·책
                      소개). 이 중 저자명 등 이용자가 스스로 입력한 개인정보가 포함될 수 있습니다.
                    </>,
                    <>
                      <strong className="text-ink-800">결제 정보</strong> — 이용권 구매 시 주문번호, 결제
                      금액, 결제 승인 정보, 결제 일시. 카드번호·유효기간 등 결제수단 정보는 결제대행사가
                      처리하며 회사는 보관하지 않습니다.
                    </>,
                    <>
                      <strong className="text-ink-800">환불 문의 시</strong> — 이메일 주소와 문의 내용
                      (이용자가 문의 메일을 보낸 경우에 한합니다).
                    </>,
                    <>
                      <strong className="text-ink-800">자동으로 생성되는 정보</strong> — 접속 IP, 접속
                      일시, 브라우저 정보 등 서비스 운영 과정에서 생성되는 로그.
                    </>,
                  ]}
                />
              </>
            ),
          },
          {
            heading: '2. 개인정보의 처리 목적',
            body: (
              <Ordered
                items={[
                  '그림책 제작 서비스의 제공 — 입력하신 내용을 바탕으로 글과 삽화를 생성하고, 작업 내용을 저장해 다음 접속 시 이어서 작업할 수 있게 합니다.',
                  '이용권 결제와 환불 처리, 구매 내역 관리',
                  '문의 응대 및 분쟁 처리',
                  '서비스 장애 대응과 부정 이용 방지',
                ]}
              />
            ),
          },
          {
            heading: '3. 개인정보의 보유 및 이용 기간',
            body: (
              <>
                <Ordered
                  items={[
                    '제작 정보(프로젝트) — 이용자가 삭제를 요청할 때까지 보관합니다.',
                    '결제·환불 기록 — 「전자상거래 등에서의 소비자보호에 관한 법률」에 따라 계약 또는 청약철회 기록 5년, 대금결제 및 재화 공급 기록 5년, 소비자 불만 또는 분쟁처리 기록 3년간 보관합니다.',
                    '접속 로그 — 「통신비밀보호법」에 따라 3개월간 보관합니다.',
                  ]}
                />
              </>
            ),
          },
          {
            heading: '4. 개인정보의 처리 위탁 및 국외 이전',
            body: (
              <>
                <p>
                  회사는 서비스 제공을 위해 아래와 같이 개인정보 처리를 위탁하고 있으며, 일부는 국외에서
                  처리됩니다. 이용자가 입력한 아이디어와 장면 글은 삽화·문장 생성을 위해 Google의 생성형
                  인공지능 서비스로 전송됩니다.
                </p>
                <div className="overflow-x-auto">
                  <table className="mt-2 w-full min-w-[34rem] border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-paper-300 text-left text-ink-400">
                        <th className="py-2 pr-4 font-medium">수탁자</th>
                        <th className="py-2 pr-4 font-medium">위탁 업무</th>
                        <th className="py-2 pr-4 font-medium">이전 항목</th>
                        <th className="py-2 font-medium">이전 국가</th>
                      </tr>
                    </thead>
                    <tbody>
                      {PROCESSORS.map((p) => (
                        <tr key={p.name} className="border-b border-paper-200 align-top">
                          <td className="py-2.5 pr-4 font-medium text-ink-800">{p.name}</td>
                          <td className="py-2.5 pr-4">{p.purpose}</td>
                          <td className="py-2.5 pr-4">{p.items}</td>
                          <td className="py-2.5">{p.country}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-ink-400">
                  이전 시기와 방법: 서비스 이용 시점에 네트워크를 통해 전송됩니다. 보유 기간: 각 수탁자의
                  정책에 따르며, 회사와의 위탁계약 종료 시까지입니다. 이용자는 국외 이전을 거부할 수
                  있으나, 이 경우 삽화·문장 생성 기능을 이용하실 수 없습니다.
                </p>
              </>
            ),
          },
          {
            heading: '5. 개인정보의 제3자 제공',
            body: (
              <p>
                회사는 이용자의 개인정보를 제2조의 목적 범위를 넘어 제3자에게 제공하지 않습니다. 다만
                법령에 따라 수사기관 등이 적법한 절차로 요구하는 경우에는 예외로 합니다.
              </p>
            ),
          },
          {
            heading: '6. 이용자의 권리와 행사 방법',
            body: (
              <>
                <p>
                  이용자는 언제든지 자신의 개인정보에 대한 열람·정정·삭제·처리정지를 요구할 수 있습니다.
                  프로젝트 데이터는 서비스 화면에서 직접 삭제하실 수 있으며, 그 밖의 요청은 아래 연락처로
                  접수해 주시면 지체 없이 처리합니다.
                </p>
                <p className="text-ink-400">
                  다만 법령에 따라 보관 의무가 있는 결제·환불 기록은 보유 기간이 끝날 때까지 삭제가
                  제한될 수 있습니다.
                </p>
              </>
            ),
          },
          {
            heading: '7. 개인정보의 파기',
            body: (
              <p>
                보유 기간이 지나거나 처리 목적이 달성된 개인정보는 지체 없이 파기합니다. 전자적 파일은
                복구할 수 없는 방법으로 삭제하며, 출력물은 분쇄하거나 소각합니다.
              </p>
            ),
          },
          {
            heading: '8. 만 14세 미만 아동의 개인정보',
            body: (
              <p>
                이 서비스는 그림책을 <strong className="text-ink-800">만드는 사람</strong>을 위한
                제작 도구로, 만 14세 이상을 대상으로 합니다. 회사는 만 14세 미만 아동의 개인정보를
                수집하지 않으며, 수집된 사실이 확인되면 즉시 파기합니다.
              </p>
            ),
          },
          {
            heading: '9. 개인정보의 안전성 확보 조치',
            body: (
              <Ordered
                items={[
                  '전송 구간 암호화 — 서비스의 모든 통신은 HTTPS로 암호화됩니다.',
                  '접근 권한 최소화 — 저장된 산출물 파일은 비공개 접근으로 설정되며, 운영에 필요한 최소 인원만 접근합니다.',
                  '결제 정보 비보관 — 카드 정보는 결제대행사가 처리하고 회사 서버에 저장하지 않습니다.',
                ]}
              />
            ),
          },
          {
            heading: '10. 개인정보 보호책임자 및 문의',
            body: (
              <>
                <p>
                  개인정보 보호책임자: {biz.ceo} ({biz.companyName})
                  <br />
                  연락처: {biz.email} · {biz.phone}
                </p>
                <p className="text-ink-400">
                  개인정보 침해에 대한 신고·상담이 필요하시면 개인정보침해신고센터(국번없이 118),
                  대검찰청 사이버수사과(1301), 경찰청 사이버수사국(182)에 문의하실 수 있습니다.
                </p>
              </>
            ),
          },
          {
            heading: '11. 방침의 변경',
            body: (
              <p>
                이 방침을 변경하는 경우 시행 7일 전부터 서비스 내에 공지합니다. 다만 이용자 권리에 중대한
                변경이 있는 경우에는 30일 전에 공지합니다.
              </p>
            ),
          },
        ]}
      />
      <BusinessFooter />
    </>
  );
}
