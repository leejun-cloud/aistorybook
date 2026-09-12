// 세션 — 클라이언트가 받은 Firebase ID 토큰을 서버가 세션 쿠키로 바꿔 들고 있는다.
//
// ID 토큰을 그대로 쿠키에 넣지 않는 이유: 만료가 1시간이라 계속 갱신해야 하고,
// httpOnly로 못 넣으면 XSS에 그대로 노출된다. Firebase 세션 쿠키는 서버가 발급하고
// 검증하므로 httpOnly로 둘 수 있다.

import { cookies } from 'next/headers';
import { getAdminAuth, authConfigured } from './admin';

export const SESSION_COOKIE = 'aisb_session';
/** 세션 유효기간 14일 (Firebase 최대 14일) */
export const SESSION_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

export interface SessionUser {
  uid: string;
  email?: string;
  name?: string;
  picture?: string;
}

/**
 * 현재 로그인한 사용자. 인증이 설정되지 않은 배포에서는 null을 반환하고,
 * 호출부가 "로그인 없는 단일 계정" 모드로 동작한다 (lib/credits.ts 참고).
 */
export async function currentUser(): Promise<SessionUser | null> {
  const auth = getAdminAuth();
  if (!auth) return null;

  const cookie = cookies().get(SESSION_COOKIE)?.value;
  if (!cookie) return null;

  try {
    // checkRevoked: 로그아웃·비활성화된 계정의 세션을 즉시 무효화한다
    const decoded = await auth.verifySessionCookie(cookie, true);
    return {
      uid: decoded.uid,
      email: decoded.email,
      name: decoded.name as string | undefined,
      picture: decoded.picture as string | undefined,
    };
  } catch {
    return null;
  }
}

/** 데이터 구분에 쓰는 키. 인증 미설정 배포에서는 공용 계정 하나로 묶인다. */
export async function currentAccountKey(): Promise<string> {
  const user = await currentUser();
  if (user) return user.uid;
  return authConfigured() ? 'anonymous' : 'local';
}

/** 운영자 계정인지 — 소유자 정보가 없는 기존 프로젝트를 볼 수 있다 */
export function isMaster(user: SessionUser | null): boolean {
  const master = process.env.MASTER_EMAIL?.trim().toLowerCase();
  return Boolean(master && user?.email?.toLowerCase() === master);
}
