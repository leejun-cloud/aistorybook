// 이용권 계정 분리 검증.
//
// 로그인을 붙인 이유가 "A가 결제한 이용권을 B가 못 쓰게" 하는 것이므로,
// 그게 실제로 지켜지는지 여기서 못 박는다. 처음 작성했을 때 loadEntitlements가
// 모듈 상수를 얕게 복사해 배열이 전 계정에 공유되는 결함이 있었고, 이 테스트가 잡았다.

import { loadEntitlements, createOrder, markOrderPaid, consumeCreditFor } from '../../lib/credits';
import { deleteStoredFile } from '../../lib/storage';

const A = 'test-acct-a';
const B = 'test-acct-b';

let failures = 0;
function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? '✓' : '✗'} ${label} — 실제 ${JSON.stringify(actual)}, 기대 ${JSON.stringify(expected)}`);
}

async function cleanup() {
  for (const k of [A, B]) await deleteStoredFile(`account/${k}/entitlements.json`).catch(() => {});
}

(async () => {
  await cleanup();

  // A가 단건 구매 후 승인
  const order = await createOrder(A, 'single');
  await markOrderPaid(A, order.orderId, 'test-payment-key');

  check('A 잔액', (await loadEntitlements(A)).credits, 1);
  check('B 잔액 (A와 분리)', (await loadEntitlements(B)).credits, 0);
  check('B 주문 목록이 비어 있음', (await loadEntitlements(B)).orders.length, 0);

  // B가 A의 주문번호로 적립을 시도하면 실패해야 한다
  let blocked = false;
  try {
    await markOrderPaid(B, order.orderId, 'test-payment-key');
  } catch {
    blocked = true;
  }
  check('B가 A 주문번호로 적립 시도 → 차단', blocked, true);

  // 중복 승인 콜백이 와도 두 번 적립되지 않는다
  await markOrderPaid(A, order.orderId, 'test-payment-key');
  check('A 중복 승인 후 잔액 그대로', (await loadEntitlements(A)).credits, 1);

  // A가 잠금 해제해도 B는 같은 프로젝트를 못 연다
  const ra = await consumeCreditFor(A, 'proj-shared');
  const rb = await consumeCreditFor(B, 'proj-shared');
  check('A 잠금 해제 성공', ra.ok, true);
  check('A 잔액 차감', ra.remaining, 0);
  check('B는 이용권이 없어 실패', rb.ok, false);

  await cleanup();

  if (failures > 0) {
    console.error(`\n실패 ${failures}건`);
    process.exit(1);
  }
  console.log('\nisolation.test.ts — 계정 분리 검증 전부 통과');
})();
