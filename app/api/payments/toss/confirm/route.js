// Toss 단건결제 승인 (서버). 클라이언트 결제 후 paymentKey/orderId/amount 로 승인.
export async function POST(req) {
  const { paymentKey, orderId, amount } = await req.json();
  const secret = process.env.TOSS_SECRET_KEY;
  const auth = Buffer.from(secret + ":").toString("base64");
  const res = await fetch("https://api.tosspayments.com/v1/payments/confirm", {
    method: "POST",
    headers: { Authorization: "Basic " + auth, "Content-Type": "application/json" },
    body: JSON.stringify({ paymentKey, orderId, amount }),
  });
  const data = await res.json();
  return new Response(JSON.stringify(data), { status: res.status, headers: { "Content-Type": "application/json" } });
}
