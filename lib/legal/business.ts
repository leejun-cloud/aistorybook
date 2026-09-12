// 사업자 정보 — 전자상거래 등에서의 소비자보호에 관한 법률 제10조(사업자의 신원 등에
// 대한 표시)가 요구하는 항목. 값은 환경변수에서만 읽는다 (저장소에 넣지 않는다).
//
// 이 정보는 서버 컴포넌트에서 읽어 클라이언트로 내려준다 — 어차피 화면에 공개되는
// 정보라 비밀이 아니지만, 환경변수 이름을 브라우저 번들에 고정하지 않기 위해서다.

/** 이 앱의 이름. 사업자 등록 정보가 아니라 서비스 식별자라 코드에 고정한다 —
 *  키 보관소의 VITE_BIZ_SERVICE_NAME은 같은 사업자의 다른 서비스명일 수 있다. */
export const SERVICE_NAME = 'AI 동화제작';

export interface BusinessInfo {
  serviceName: string;
  companyName: string;
  ceo: string;
  /** 사업자등록번호 */
  regNo: string;
  /** 통신판매업 신고번호 */
  mailOrderNo: string;
  address: string;
  phone: string;
  email: string;
  /** 호스팅 서비스 제공자 */
  host: string;
  /** 분쟁 시 관할 법원 */
  court: string;
}

const MISSING = '(미등록)';

function env(name: string): string {
  return process.env[name]?.trim() || MISSING;
}

export function businessInfo(): BusinessInfo {
  return {
    serviceName: SERVICE_NAME,
    companyName: env('VITE_BIZ_COMPANY_NAME'),
    ceo: env('VITE_BIZ_CEO'),
    regNo: env('VITE_BIZ_REG_NO'),
    mailOrderNo: env('VITE_BIZ_MAILORDER_NO'),
    address: env('VITE_BIZ_ADDRESS'),
    phone: env('VITE_BIZ_PHONE'),
    email: env('VITE_BIZ_EMAIL'),
    host: env('VITE_BIZ_HOST'),
    court: env('VITE_BIZ_COURT'),
  };
}

/**
 * 결제를 열어도 되는 상태인지 — 상호·대표자·사업자등록번호·통신판매업신고번호·
 * 연락처가 모두 있어야 한다. 하나라도 비면 표시 의무를 못 지키는 상태라 결제를 막는다.
 */
export function businessInfoComplete(info: BusinessInfo = businessInfo()): boolean {
  return [info.companyName, info.ceo, info.regNo, info.mailOrderNo, info.email].every(
    (v) => v && v !== MISSING,
  );
}

/** 사업자등록번호 확인 링크 (국세청 사업자등록상태 조회) */
export const BIZ_LOOKUP_URL = 'https://www.ftc.go.kr/bizCommPop.do';
