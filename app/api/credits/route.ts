import { NextResponse } from 'next/server';
import { loadEntitlements } from '../../../lib/credits';
import { getViewer } from '../../../lib/auth/require';

export const dynamic = 'force-dynamic';

// GET /api/credits → 로그인한 계정의 잔여 이용권과 결제 내역
export async function GET() {
  const viewer = await getViewer();
  if (!viewer.user && viewer.accountKey === 'anonymous') {
    return NextResponse.json({ credits: 0, unlockedProjectIds: [], orders: [], needsLogin: true });
  }

  const e = await loadEntitlements(viewer.accountKey);
  return NextResponse.json({
    credits: e.credits,
    unlockedProjectIds: e.unlockedProjectIds,
    orders: e.orders.slice(-20).reverse(),
  });
}
