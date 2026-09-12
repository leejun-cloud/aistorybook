import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth } from '../../../../lib/auth/admin';
import { SESSION_COOKIE, SESSION_MAX_AGE_MS } from '../../../../lib/auth/session';

export const dynamic = 'force-dynamic';

// POST /api/auth/session  body: { idToken }
// 클라이언트가 Firebase 로그인으로 받은 ID 토큰을 검증해 httpOnly 세션 쿠키로 바꾼다.
export async function POST(req: NextRequest) {
  const auth = getAdminAuth();
  if (!auth) return NextResponse.json({ error: '로그인이 설정되지 않은 서버입니다' }, { status: 503 });

  const { idToken } = await req.json().catch(() => ({}));
  if (!idToken) return NextResponse.json({ error: 'idToken이 필요합니다' }, { status: 400 });

  try {
    // 발급 직후의 토큰만 받는다 — 오래된 토큰으로 장기 세션을 만들지 못하게
    const decoded = await auth.verifyIdToken(idToken, true);
    if (Date.now() / 1000 - decoded.auth_time > 5 * 60) {
      return NextResponse.json({ error: '다시 로그인해 주세요' }, { status: 401 });
    }

    const sessionCookie = await auth.createSessionCookie(idToken, { expiresIn: SESSION_MAX_AGE_MS });
    const res = NextResponse.json({ uid: decoded.uid, email: decoded.email });
    res.cookies.set(SESSION_COOKIE, sessionCookie, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_MAX_AGE_MS / 1000,
    });
    return res;
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 401 });
  }
}

// DELETE /api/auth/session → 로그아웃. 세션 쿠키를 지우고 해당 사용자의 기존 세션을
// 전부 무효화한다 (verifySessionCookie(checkRevoked)가 즉시 걸러낸다).
export async function DELETE() {
  const auth = getAdminAuth();
  const res = NextResponse.json({ ok: true });

  if (auth) {
    const { cookies } = await import('next/headers');
    const cookie = cookies().get(SESSION_COOKIE)?.value;
    if (cookie) {
      try {
        const decoded = await auth.verifySessionCookie(cookie);
        await auth.revokeRefreshTokens(decoded.sub);
      } catch {
        // 이미 만료·무효한 쿠키 — 지우기만 하면 된다
      }
    }
  }

  res.cookies.set(SESSION_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 });
  return res;
}
