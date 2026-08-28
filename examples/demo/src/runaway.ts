import { PolicyEngine, type Policy } from "@cedulon/core";
import {
  generateReceiptKeys,
  receiptHash,
  verifyReceipt,
  type SignedReceipt,
} from "@cedulon/receipts";
import { gatedSettle, type AdapterKeys } from "@cedulon/x402-adapter";

export const RUNAWAY_POLICY: Policy = {
  maxAmount: 10n,
  maxCumulative: 30n,
  maxPayments: 3,
  windowMs: 3_600_000,
  allowedPayees: ["payee-1"],
  allowedCurrencies: ["USD"],
};

export function runRunaway(nowMs = 1_700_000_000_000): {
  allowed: number;
  blocked: number;
  receipts: SignedReceipt[];
  /** The key this run signed with, so the caller can check against it. */
  issuerPublicKeyPem: string;
} {
  const engine = new PolicyEngine(RUNAWAY_POLICY);
  const keys: AdapterKeys = (() => {
    const k = generateReceiptKeys();
    return { receiptPrivatePem: k.privateKeyPem, receiptPublicPem: k.publicKeyPem };
  })();
  const receipts: SignedReceipt[] = [];
  let allowed = 0;
  let blocked = 0;
  let prev: string | null = null;
  for (let i = 0; i < 100; i += 1) {
    const result = gatedSettle(
      engine,
      {
        req: {
          amount: 1n,
          currency: "USD",
          payee: "payee-1",
          nonce: `n-${i}`.padEnd(16, "-"),
          nowMs,
          tool: "spend",
        },
        payer: "payer-1",
        paymentHeader: "mock",
      },
      keys,
      nowMs,
      prev,
    );
    if (result.status === 200) {
      allowed += 1;
      receipts.push(result.receipt);
      prev = receiptHash(result.receipt);
    } else {
      blocked += 1;
    }
  }
  return { allowed, blocked, receipts, issuerPublicKeyPem: keys.receiptPublicPem };
}

export function assertRunaway(result: ReturnType<typeof runRunaway>): void {
  if (result.allowed !== 3 || result.blocked !== 97) {
    throw new Error(`unexpected counts ${result.allowed}/${result.blocked}`);
  }
  // Against the key the caller holds, not the one each receipt carries.
  if (!result.receipts.every((r) => verifyReceipt(r, result.issuerPublicKeyPem))) {
    throw new Error("receipt verify failed");
  }
}
