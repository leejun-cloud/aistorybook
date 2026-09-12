// 토스페이먼츠 키 읽기.
//
// 클라이언트 키는 브라우저에 노출되도록 설계된 공개 키지만, 이 앱은 결제창을 열기
// 직전에 /api/credits/order 응답으로 내려준다. 그래서 NEXT_PUBLIC_ 접두사가 필요 없고,
// 키 보관소(mvpkit)에 어떤 이름으로 들어 있든 서버에서 골라 쓸 수 있다.
//
// 이름이 프로젝트마다 제각각이라(다른 저장소는 VITE_ / NEXT_PUBLIC_TOSS_PAYMENTS_ 등)
// 흔한 철자를 순서대로 본다.

const CLIENT_KEY_NAMES = [
  'TOSS_CLIENT_KEY',
  'NEXT_PUBLIC_TOSS_CLIENT_KEY',
  'VITE_TOSS_CLIENT_KEY',
  'NEXT_PUBLIC_TOSS_PAYMENTS_CLIENT_KEY',
];

export function tossClientKey(): string | undefined {
  for (const name of CLIENT_KEY_NAMES) {
    const value = process.env[name];
    if (value) return value;
  }
  return undefined;
}

export function tossSecretKey(): string | undefined {
  return process.env.TOSS_SECRET_KEY || undefined;
}

/** 결제 모듈을 쓸 수 있는 상태인지 — 둘 중 하나라도 없으면 결제 진입을 막는다 */
export function paymentsConfigured(): boolean {
  return Boolean(tossClientKey() && tossSecretKey());
}
