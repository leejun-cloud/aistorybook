// 이용권 보관소 — 프로젝트 파일과 같은 스토리지 계층(로컬 FS / Vercel Blob)에
// 계정별로 한 파일씩 둔다.
//
// 모든 함수가 accountKey(로그인 uid)를 받는다. 이게 없으면 잔액이 전체 공유되어
// A가 결제한 이용권으로 B가 잠금을 풀 수 있다.

import path from 'path';
import { readStoredFile, writeStoredFile } from './storage';
import { getPack } from './pricing';

const accountFile = (accountKey: string) => `account/${path.basename(accountKey)}/entitlements.json`;

export type OrderStatus = 'pending' | 'paid' | 'failed';

export interface CreditOrder {
  orderId: string;
  packId: string;
  amount: number;
  credits: number;
  status: OrderStatus;
  createdAt: string;
  paidAt?: string;
  /** Toss 결제 키 — 승인 후 기록 */
  paymentKey?: string;
  /** 실패 사유 */
  error?: string;
}

export interface Entitlements {
  credits: number;
  orders: CreditOrder[];
  /** 이용권을 써서 잠금 해제한 프로젝트 id 목록 (중복 차감 방지) */
  unlockedProjectIds: string[];
}

/**
 * 빈 상태는 매번 새로 만든다. 모듈 레벨 상수를 `{ ...EMPTY }`로 얕게 복사하면
 * orders·unlockedProjectIds 배열이 모든 계정에 공유되어, 한 계정이 push한 주문이
 * 다른 계정에서도 보인다 (계정 분리 테스트에서 실제로 잡힌 결함).
 */
function emptyEntitlements(): Entitlements {
  return { credits: 0, orders: [], unlockedProjectIds: [] };
}

export async function loadEntitlements(accountKey: string): Promise<Entitlements> {
  const buf = await readStoredFile(accountFile(accountKey));
  if (!buf) return emptyEntitlements();
  try {
    const parsed = JSON.parse(buf.toString('utf-8')) as Partial<Entitlements>;
    return {
      credits: parsed.credits ?? 0,
      orders: parsed.orders ?? [],
      unlockedProjectIds: parsed.unlockedProjectIds ?? [],
    };
  } catch {
    return emptyEntitlements();
  }
}

async function save(accountKey: string, e: Entitlements): Promise<void> {
  await writeStoredFile(accountFile(accountKey), JSON.stringify(e, null, 2));
}

/** 주문번호 — Toss 요구사항(6~64자, 영숫자·하이픈) */
export function newOrderId(packId: string): string {
  return `aisb-${packId}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** 결제창을 띄우기 전에 주문을 pending으로 먼저 적어 둔다 (승인 단계에서 금액 대조용) */
export async function createOrder(accountKey: string, packId: string): Promise<CreditOrder> {
  const pack = getPack(packId);
  if (!pack) throw new Error(`알 수 없는 이용권 상품: ${packId}`);
  const e = await loadEntitlements(accountKey);
  const order: CreditOrder = {
    orderId: newOrderId(packId),
    packId: pack.id,
    amount: pack.amount,
    credits: pack.credits,
    status: 'pending',
    createdAt: new Date().toISOString(),
  };
  e.orders.push(order);
  await save(accountKey, e);
  return order;
}

export async function findOrder(accountKey: string, orderId: string): Promise<CreditOrder | undefined> {
  const e = await loadEntitlements(accountKey);
  return e.orders.find((o) => o.orderId === orderId);
}

/**
 * 결제 승인 성공을 반영해 이용권을 적립한다.
 * 이미 paid인 주문이면 아무것도 하지 않는다 (승인 콜백 중복 호출 방어).
 */
export async function markOrderPaid(accountKey: string, orderId: string, paymentKey: string): Promise<Entitlements> {
  const e = await loadEntitlements(accountKey);
  const order = e.orders.find((o) => o.orderId === orderId);
  if (!order) throw new Error('주문을 찾을 수 없습니다');
  if (order.status === 'paid') return e;
  order.status = 'paid';
  order.paidAt = new Date().toISOString();
  order.paymentKey = paymentKey;
  e.credits += order.credits;
  await save(accountKey, e);
  return e;
}

export async function markOrderFailed(accountKey: string, orderId: string, reason: string): Promise<void> {
  const e = await loadEntitlements(accountKey);
  const order = e.orders.find((o) => o.orderId === orderId);
  if (!order || order.status === 'paid') return;
  order.status = 'failed';
  order.error = reason;
  await save(accountKey, e);
}

export interface ConsumeResult {
  ok: boolean;
  /** 이미 해제된 프로젝트라 차감하지 않았음 */
  alreadyUnlocked?: boolean;
  remaining: number;
  reason?: string;
}

/** 프로젝트 1건 잠금 해제 — 이용권 1건 차감. 잔액이 없으면 ok:false */
export async function consumeCreditFor(accountKey: string, projectId: string): Promise<ConsumeResult> {
  const e = await loadEntitlements(accountKey);
  if (e.unlockedProjectIds.includes(projectId)) {
    return { ok: true, alreadyUnlocked: true, remaining: e.credits };
  }
  if (e.credits < 1) {
    return { ok: false, remaining: e.credits, reason: '이용권이 없습니다' };
  }
  e.credits -= 1;
  e.unlockedProjectIds.push(projectId);
  await save(accountKey, e);
  return { ok: true, remaining: e.credits };
}
