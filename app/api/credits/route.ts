import { NextResponse } from 'next/server';
import { loadEntitlements } from '../../../lib/credits';

export const dynamic = 'force-dynamic';

// GET /api/credits → 잔여 이용권과 결제 내역
export async function GET() {
  const e = await loadEntitlements();
  return NextResponse.json({
    credits: e.credits,
    unlockedProjectIds: e.unlockedProjectIds,
    orders: e.orders.slice(-20).reverse(),
  });
}
