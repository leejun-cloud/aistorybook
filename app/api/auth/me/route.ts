import { NextResponse } from 'next/server';
import { currentUser, isMaster } from '../../../../lib/auth/session';
import { authConfigured } from '../../../../lib/auth/admin';

export const dynamic = 'force-dynamic';

// GET /api/auth/me → 현재 로그인 상태
export async function GET() {
  const user = await currentUser();
  return NextResponse.json({
    authEnabled: authConfigured(),
    user,
    isMaster: isMaster(user),
  });
}
