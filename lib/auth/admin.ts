// Firebase Admin — 서버에서 세션 쿠키를 검증한다.
//
// mvpkit이 만들어 준 api/_admin.js는 Vite/서버리스 함수 배치를 전제로 해서 이 앱
// (Next.js App Router)에서는 로드되지 않는다. 필요한 부분(서비스계정 로딩)만 옮겼다.

import admin from 'firebase-admin';

function loadServiceAccount(): admin.ServiceAccount | null {
  const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_B64;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!b64 && !raw) return null;

  const text = b64 ? Buffer.from(b64, 'base64').toString('utf8') : raw!;
  let json: Record<string, string>;
  try {
    json = JSON.parse(text);
  } catch {
    return null;
  }
  // 환경변수를 거치며 개행이 이스케이프된 경우 되돌린다
  if (json.private_key?.includes('\\n')) {
    json.private_key = json.private_key.replace(/\\n/g, '\n');
  }
  return json as unknown as admin.ServiceAccount;
}

/** 인증을 쓸 수 있는 배포인지 — 서비스계정이 없으면 로그인 없이 동작한다 */
export function authConfigured(): boolean {
  return loadServiceAccount() !== null;
}

export function getAdminAuth(): admin.auth.Auth | null {
  const sa = loadServiceAccount();
  if (!sa) return null;
  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(sa) });
  }
  return admin.auth();
}
