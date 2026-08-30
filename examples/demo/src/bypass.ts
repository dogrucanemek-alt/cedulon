import { createHash } from "node:crypto";
import { PolicyEngine } from "@cedulon/core";
import { audit, formatAudit } from "@cedulon/audit";
import { buildCheckpointClaims, signCheckpoint } from "@cedulon/checkpoint";
import { generateReceiptKeys, receiptHash, signReceiptUnchecked, type SignedReceipt } from "@cedulon/receipts";
import {
  RailLedger,
  bypassRailOnly,
  gatedSettleWithLedger,
  type AdapterKeys,
} from "@cedulon/x402-adapter";

const TEST_HASH = createHash("sha256").update("cedulon/test-policy").digest("hex");
const TEST_HASH_OTHER = createHash("sha256").update("cedulon/test-other").digest("hex");

export type BypassKind = "missing" | "amount" | "null-ref" | "head";

function settlePair(nowMs: number): {
  keys: AdapterKeys & { privateKeyPem: string; publicKeyPem: string };
  receipts: SignedReceipt[];
  ledger: RailLedger;
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
  const keys = { receiptPrivatePem: k.privateKeyPem, receiptPublicPem: k.publicKeyPem, ...k };
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
          nonce: `ok-${i}`.padEnd(16, "-"),
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
  return { keys, receipts, ledger };
}

export function runBypass(
  nowMs = 1_700_000_000_000,
  kind: BypassKind = "missing",
): {
  summary: string;
  guarantee: "unconditional" | "conditional";
  exitCode: number;
  text: string;
  kind: BypassKind;
} {
  const { keys, receipts, ledger } = settlePair(nowMs);

  if (kind === "missing") {
    bypassRailOnly(
      {
        req: {
          amount: 7n,
          currency: "USD",
          payee: "payee-1",
          nonce: "hidden".padEnd(16, "-"),
          nowMs: nowMs + 2,
          tool: "spend",
        },
        payer: "payer-1",
      },
      nowMs + 2,
      ledger,
    );
  }

  let auditReceipts = receipts;
  let settlements = ledger.extract();
  let checkpointClaims = buildCheckpointClaims(1, receipts, nowMs, nowMs + 10, null);

  if (kind === "amount") {
    settlements = settlements.map((s, i) => (i === 0 ? { ...s, amount: "9" } : s));
  }

  if (kind === "null-ref") {
    const ghost = signReceiptUnchecked(
      {
        payer: "payer-1",
        payee: "payee-1",
        amount: "5",
        currency: "USD",
        policyHash: TEST_HASH,
        manifestHash: null,
        noManifest: true,
        x402PaymentRef: null,
        timestampMs: nowMs,
        nonce: "ghost".padEnd(16, "-"),
        prevReceiptHash: null,
        outcome: "settled",
      },
      keys.privateKeyPem,
      keys.publicKeyPem,
    );
    auditReceipts = [ghost];
    settlements = [];
    checkpointClaims = buildCheckpointClaims(1, auditReceipts, nowMs, nowMs + 10, null);
  }

  if (kind === "head") {
    checkpointClaims = { ...checkpointClaims, chainHeadHash: TEST_HASH_OTHER };
  }

  const checkpoint = signCheckpoint(checkpointClaims, keys.privateKeyPem, keys.publicKeyPem);
  const report = audit({ receipts: auditReceipts, checkpoints: [checkpoint], settlements });
  const text = formatAudit(report, auditReceipts.length);
  return {
    summary: report.summary,
    guarantee: report.guarantee,
    exitCode: report.ok ? 0 : 1,
    text,
    kind,
  };
}

const KINDS: BypassKind[] = ["missing", "amount", "null-ref", "head"];

const isMain = process.argv[1]?.replace(/\\/g, "/").endsWith("bypass.ts");
if (isMain) {
  const arg = (process.argv[2] ?? "missing") as BypassKind | "all";
  if (arg === "all") {
    let fail = 0;
    for (const kind of KINDS) {
      const ran = runBypass(undefined, kind);
      // The guarantee travels with the verdict: this demo pins no rail key, so
      // every line here is a conditional result and says so.
      console.log(`${kind}\t${ran.summary}\tguarantee=${ran.guarantee}`);
      if (ran.exitCode !== 1) fail = 1;
    }
    process.exit(fail);
  }
  if (!KINDS.includes(arg)) {
    console.error(`unknown bypass kind: ${arg}`);
    process.exit(2);
  }
  const ran = runBypass(undefined, arg);
  console.log(ran.summary);
  process.exit(ran.exitCode);
}
