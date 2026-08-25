import { generateReceiptKeys } from "@cedulon/receipts";
import { unguardedSettle } from "@cedulon/x402-adapter";

const nowMs = 1_700_000_000_000;
const k = generateReceiptKeys();
let allowed = 0;
for (let i = 0; i < 100; i += 1) {
  const result = unguardedSettle(
    {
      req: {
        amount: 1n,
        currency: "USD",
        payee: "payee-1",
        nonce: `u-${i}`,
        nowMs,
      },
      payer: "payer-1",
    },
    { receiptPrivatePem: k.privateKeyPem, receiptPublicPem: k.publicKeyPem },
    nowMs,
  );
  if (result.status === 200) {
    allowed += 1;
  }
}
console.log(`UNGUARDED allowed=${allowed}`);
