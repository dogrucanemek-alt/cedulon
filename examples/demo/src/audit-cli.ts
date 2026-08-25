import { PolicyEngine } from "@cedulon/core";
import { audit, formatAudit } from "@cedulon/audit";
import { buildCheckpointClaims, signCheckpoint } from "@cedulon/checkpoint";
import { generateReceiptKeys, receiptHash } from "@cedulon/receipts";
import { RailLedger, gatedSettleWithLedger, type AdapterKeys } from "@cedulon/x402-adapter";

const nowMs = 1_700_000_000_000;
const engine = new PolicyEngine({
  maxAmount: 10n,
  maxCumulative: 30n,
  maxPayments: 3,
  windowMs: 3_600_000,
});
const k = generateReceiptKeys();
const keys: AdapterKeys = { receiptPrivatePem: k.privateKeyPem, receiptPublicPem: k.publicKeyPem };
const ledger = new RailLedger();
const receipts = [];
let prev: string | null = null;
for (let i = 0; i < 2; i += 1) {
  const result = gatedSettleWithLedger(
    engine,
    {
      req: {
        amount: 1n,
        currency: "USD",
        payee: "q",
        nonce: `ok-${i}`,
        nowMs: nowMs + i,
        tool: "spend",
      },
      payer: "p",
      paymentHeader: "mock",
    },
    keys,
    nowMs + i,
    ledger,
    prev,
  );
  if (result.status !== 200) {
    console.error("audit fixture failed to settle");
    process.exit(2);
  }
  receipts.push(result.receipt);
  prev = receiptHash(result.receipt);
}
const checkpoint = signCheckpoint(
  buildCheckpointClaims(1, receipts, nowMs, nowMs + 10, null),
  k.privateKeyPem,
  k.publicKeyPem,
);
const report = audit({ receipts, checkpoints: [checkpoint], settlements: ledger.extract() });
console.log(formatAudit(report, receipts.length));
process.exit(report.ok ? 0 : 1);
