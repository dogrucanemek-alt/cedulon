import {
  findCheckpointChainBreak,
  totalsFromReceipts,
  verifyCheckpoint,
  type SignedCheckpoint,
} from "@cedulon/checkpoint";
import { receiptHash, verifyReceipt, type SignedReceipt } from "@cedulon/receipts";
import type { RailSettlement } from "@cedulon/x402-adapter";

export type FindingCode =
  | "settlement-without-receipt"
  | "receipt-without-settlement"
  | "receipt-chain-break"
  | "checkpoint-total-mismatch"
  | "ok";

export type Finding = {
  code: Exclude<FindingCode, "ok">;
  detail: string;
  id: string;
};

export type AuditReport = {
  ok: boolean;
  findings: Finding[];
  summary: string;
};

function receiptRef(r: SignedReceipt): string | null {
  return r.claims.x402PaymentRef;
}

export function findReceiptChainBreak(receipts: SignedReceipt[]): Finding | null {
  for (let i = 0; i < receipts.length; i += 1) {
    if (!verifyReceipt(receipts[i])) {
      return {
        code: "receipt-chain-break",
        id: receipts[i].claims.nonce,
        detail: `receipt ${i} signature failed`,
      };
    }
    const expected = i === 0 ? null : receiptHash(receipts[i - 1]);
    if (receipts[i].claims.prevReceiptHash !== expected) {
      return {
        code: "receipt-chain-break",
        id: receipts[i].claims.nonce,
        detail: `receipt ${i} prevReceiptHash does not match prior receipt`,
      };
    }
  }
  return null;
}

export function findSettlementsWithoutReceipt(
  receipts: SignedReceipt[],
  settlements: RailSettlement[],
): Finding[] {
  const refs = new Set(receipts.map(receiptRef).filter((x): x is string => x !== null));
  return settlements
    .filter((s) => !refs.has(s.ref))
    .map((s) => ({
      code: "settlement-without-receipt" as const,
      id: s.ref,
      detail: `settlement ${s.ref} ${s.amount} ${s.currency} has no spend receipt`,
    }));
}

export function findReceiptsWithoutSettlement(
  receipts: SignedReceipt[],
  settlements: RailSettlement[],
): Finding[] {
  const refs = new Set(settlements.map((s) => s.ref));
  return receipts
    .filter((r) => {
      const ref = receiptRef(r);
      return ref !== null && !refs.has(ref);
    })
    .map((r) => ({
      code: "receipt-without-settlement" as const,
      id: r.claims.nonce,
      detail: `receipt nonce=${r.claims.nonce} ref=${receiptRef(r)} is not on the rail extract`,
    }));
}

export function findCheckpointTotalMismatches(
  receipts: SignedReceipt[],
  checkpoints: SignedCheckpoint[],
): Finding[] {
  const findings: Finding[] = [];
  for (const cp of checkpoints) {
    if (!verifyCheckpoint(cp)) {
      findings.push({
        code: "checkpoint-total-mismatch",
        id: `epoch-${cp.claims.epoch}`,
        detail: `checkpoint epoch ${cp.claims.epoch} signature failed`,
      });
      continue;
    }
    const inWindow = receipts.filter(
      (r) => r.claims.timestampMs >= cp.claims.startMs && r.claims.timestampMs <= cp.claims.endMs,
    );
    const expected = totalsFromReceipts(inWindow);
    if (JSON.stringify(expected) !== JSON.stringify(cp.claims.totals)) {
      findings.push({
        code: "checkpoint-total-mismatch",
        id: `epoch-${cp.claims.epoch}`,
        detail: `checkpoint epoch ${cp.claims.epoch} totals ${JSON.stringify(cp.claims.totals)} != receipts ${JSON.stringify(expected)}`,
      });
    }
    if (inWindow.length !== cp.claims.receiptCount) {
      findings.push({
        code: "checkpoint-total-mismatch",
        id: `epoch-${cp.claims.epoch}-count`,
        detail: `checkpoint epoch ${cp.claims.epoch} receiptCount ${cp.claims.receiptCount} != ${inWindow.length}`,
      });
    }
  }
  const chain = findCheckpointChainBreak(checkpoints);
  if (chain) {
    findings.push({
      code: "checkpoint-total-mismatch",
      id: `checkpoint-chain-${chain.index}`,
      detail: `checkpoint chain ${chain.reason} at ${chain.index}`,
    });
  }
  return findings;
}

export function audit(input: {
  receipts: SignedReceipt[];
  checkpoints: SignedCheckpoint[];
  settlements: RailSettlement[];
}): AuditReport {
  const findings: Finding[] = [];
  findings.push(...findSettlementsWithoutReceipt(input.receipts, input.settlements));
  findings.push(...findReceiptsWithoutSettlement(input.receipts, input.settlements));
  const chain = findReceiptChainBreak(input.receipts);
  if (chain) findings.push(chain);
  findings.push(...findCheckpointTotalMismatches(input.receipts, input.checkpoints));
  const missing = findings.filter((f) => f.code === "settlement-without-receipt");
  const summary = findings.length === 0
    ? "audit: balanced"
    : missing.length > 0
      ? `audit: ${missing.length} settlement without receipt → FAIL`
      : `audit: ${findings.length} finding(s) → FAIL`;
  return { ok: findings.length === 0, findings, summary };
}

export function formatAudit(report: AuditReport, receiptCount = 0): string {
  if (report.ok) {
    return [`audit: balanced`, `receipts=${receiptCount}`, "findings=0"].join("\n");
  }
  const lines = [report.summary];
  for (const f of report.findings) {
    lines.push(`${f.code}\t${f.id}\t${f.detail}`);
  }
  return lines.join("\n");
}
