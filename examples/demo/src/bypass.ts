import { PolicyEngine } from "@cedulon/core";
import { audit, formatAudit } from "@cedulon/audit";
import { buildCheckpointClaims, signCheckpoint } from "@cedulon/checkpoint";
import { generateReceiptKeys, receiptHash } from "@cedulon/receipts";
import {
  RailLedger,
  bypassRailOnly,
  gatedSettleWithLedger,
  type AdapterKeys,
} from "@cedulon/x402-adapter";

export function runBypass(nowMs = 1_700_000_000_000): {
  summary: string;
  exitCode: number;
  text: string;
} {
  const engine = new PolicyEngine({
    maxAmount: 10n,
    maxCumulative: 30n,
    maxPayments: 3,
    windowMs: 3_600_000,
    allowedPayees: ["payee-1"],
    allowedCurrencies: ["USD"],
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
          payee: "payee-1",
          nonce: `ok-${i}`,
          nowMs: nowMs + i,
          tool: "spend",
        },
        payer: "payer-1",
        paymentHeader: "mock",
      },
      keys,
      nowMs + i,
      ledger,
      prev,
    );
    if (result.status !== 200) {
      throw new Error("expected gated allow");
    }
    receipts.push(result.receipt);
    prev = receiptHash(result.receipt);
  }
  bypassRailOnly(
    {
      req: {
        amount: 7n,
        currency: "USD",
        payee: "payee-1",
        nonce: "hidden",
        nowMs: nowMs + 2,
        tool: "spend",
      },
      payer: "payer-1",
    },
    nowMs + 2,
    ledger,
  );
  const checkpoint = signCheckpoint(
    buildCheckpointClaims(1, receipts, nowMs, nowMs + 10, null),
    k.privateKeyPem,
    k.publicKeyPem,
  );
  const report = audit({ receipts, checkpoints: [checkpoint], settlements: ledger.extract() });
  const text = formatAudit(report, receipts.length);
  return { summary: report.summary, exitCode: report.ok ? 0 : 1, text };
}

const isMain = process.argv[1]?.replace(/\\/g, "/").endsWith("bypass.ts");
if (isMain) {
  const ran = runBypass();
  console.log(ran.summary);
  process.exit(ran.exitCode);
}
