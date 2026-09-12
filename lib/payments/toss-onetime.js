// Toss 단건결제 클라이언트 헬퍼. @tosspayments/payment-sdk 필요.
import { loadTossPayments } from "@tosspayments/payment-sdk";

export async function requestTossPayment({ amount, orderId, orderName, successUrl, failUrl }) {
  const toss = await loadTossPayments(process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY);
  await toss.requestPayment("카드", { amount, orderId, orderName, successUrl, failUrl });
}
