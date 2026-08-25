import {
  findCheckpointChainBreak,
  findEquivocation,
  totalsFromReceipts,
  verifyCheckpoint,
  type SignedCheckpoint,
} from "@cedulon/checkpoint";
import { receiptHash, verifyReceipt, type SignedReceipt } from "@cedulon/receipts";
import {
  verifyRailExtract,
  type RailSettlement,
  type SignedRailExtract,
} from "@cedulon/x402-adapter";

export type FindingCode =
  | "settlement-without-receipt"
  | "receipt-without-settlement"
  | "receipt-chain-break"
  | "checkpoint-total-mismatch"
  | "checkpoint-head-mismatch"
  | "duplicate-ref"
  | "settlement-mismatch"
  | "equivocation"
  | "window-coverage"
  | "settled-without-ref"
  | "unauthenticated-extract"
  | "ok";

export type Finding = {
  code: Exclude<FindingCode, "ok">;
  detail: string;
  id: string;
  severity?: "fail" | "warn";
};

export type AuditReport = {
  ok: boolean;
  findings: Finding[];
  warnings: Finding[];
  guarantee: "unconditional" | "conditional";
  summary: string;
};

function receiptRef(r: SignedReceipt): string | null {
  return r.claims.x402PaymentRef;
}

function isSettled(r: SignedReceipt): boolean {
  return r.claims.outcome === "settled";
}

export function inCheckpointWindow(timestampMs: number, cp: SignedCheckpoint): boolean {
  return timestampMs >= cp.claims.startMs && timestampMs < cp.claims.endMs;
}

export function receiptsInWindow(receipts: SignedReceipt[], cp: SignedCheckpoint): SignedReceipt[] {
  return receipts.filter((r) => inCheckpointWindow(r.claims.timestampMs, cp));
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

function pushDuplicateRefs(
  items: Array<{ ref: string; id: string; side: "receipt" | "settlement" }>,
  findings: Finding[],
): Set<string> {
  const seen = new Map<string, number>();
  for (const item of items) {
    seen.set(item.ref, (seen.get(item.ref) ?? 0) + 1);
  }
  const dupes = new Set<string>();
  for (const [ref, n] of seen) {
    if (n > 1) {
      dupes.add(ref);
      findings.push({
        code: "duplicate-ref",
        id: ref,
        detail: `${items.find((x) => x.ref === ref)?.side ?? "item"} ref ${ref} appears ${n} times`,
      });
    }
  }
  return dupes;
}

export function findSettlementMatches(
  receipts: SignedReceipt[],
  settlements: RailSettlement[],
): Finding[] {
  const findings: Finding[] = [];
  const settled = receipts.filter(isSettled);

  for (const r of settled) {
    if (receiptRef(r) === null) {
      findings.push({
        code: "settled-without-ref",
        id: r.claims.nonce,
        detail: `settled receipt nonce=${r.claims.nonce} has null rail ref`,
      });
    }
  }

  const receiptItems = settled
    .map((r) => ({ ref: receiptRef(r), id: r.claims.nonce, side: "receipt" as const, receipt: r }))
    .filter((x): x is typeof x & { ref: string } => x.ref !== null);
  const settlementItems = settlements.map((s) => ({
    ref: s.ref,
    id: s.ref,
    side: "settlement" as const,
    settlement: s,
  }));

  const dupeReceipt = pushDuplicateRefs(receiptItems, findings);
  const dupeSettlement = pushDuplicateRefs(settlementItems, findings);
  const skip = new Set<string>([...dupeReceipt, ...dupeSettlement]);

  const receiptsByRef = new Map<string, SignedReceipt>();
  for (const item of receiptItems) {
    if (!skip.has(item.ref)) {
      receiptsByRef.set(item.ref, item.receipt);
    }
  }
  const settlementsByRef = new Map<string, RailSettlement>();
  for (const item of settlementItems) {
    if (!skip.has(item.ref)) {
      settlementsByRef.set(item.ref, item.settlement);
    }
  }

  for (const [ref, s] of settlementsByRef) {
    const r = receiptsByRef.get(ref);
    if (!r) {
      findings.push({
        code: "settlement-without-receipt",
        id: ref,
        detail: `settlement ${s.ref} ${s.amount} ${s.currency} has no spend receipt`,
      });
      continue;
    }
    if (r.claims.amount !== s.amount || r.claims.currency !== s.currency) {
      findings.push({
        code: "settlement-mismatch",
        id: ref,
        detail: `settlement ${ref} ${s.amount} ${s.currency} != receipt ${r.claims.amount} ${r.claims.currency}`,
      });
    }
  }

  for (const [ref, r] of receiptsByRef) {
    if (!settlementsByRef.has(ref)) {
      findings.push({
        code: "receipt-without-settlement",
        id: r.claims.nonce,
        detail: `receipt nonce=${r.claims.nonce} ref=${ref} is not on the rail extract`,
      });
    }
  }

  return findings;
}

/** @deprecated use findSettlementMatches */
export function findSettlementsWithoutReceipt(
  receipts: SignedReceipt[],
  settlements: RailSettlement[],
): Finding[] {
  return findSettlementMatches(receipts, settlements).filter((f) => f.code === "settlement-without-receipt");
}

/** @deprecated use findSettlementMatches */
export function findReceiptsWithoutSettlement(
  receipts: SignedReceipt[],
  settlements: RailSettlement[],
): Finding[] {
  return findSettlementMatches(receipts, settlements).filter((f) => f.code === "receipt-without-settlement");
}

export function findWindowCoverage(
  receipts: SignedReceipt[],
  checkpoints: SignedCheckpoint[],
): Finding[] {
  const findings: Finding[] = [];
  const ordered = [...checkpoints].sort((a, b) => a.claims.epoch - b.claims.epoch);
  for (let i = 1; i < ordered.length; i += 1) {
    const prev = ordered[i - 1];
    const cur = ordered[i];
    if (cur.claims.epoch !== prev.claims.epoch + 1) {
      findings.push({
        code: "window-coverage",
        id: `epoch-${cur.claims.epoch}`,
        detail: `checkpoint epochs must be consecutive; ${prev.claims.epoch} then ${cur.claims.epoch}`,
      });
    }
    if (cur.claims.startMs !== prev.claims.endMs) {
      findings.push({
        code: "window-coverage",
        id: `epoch-${cur.claims.epoch}-adjacent`,
        detail: `checkpoint windows must be adjacent; epoch ${prev.claims.epoch} ends ${prev.claims.endMs} but ${cur.claims.epoch} starts ${cur.claims.startMs}`,
      });
    }
  }

  for (const r of receipts) {
    const hits = checkpoints.filter((cp) => inCheckpointWindow(r.claims.timestampMs, cp));
    if (hits.length === 0) {
      findings.push({
        code: "window-coverage",
        id: r.claims.nonce,
        detail: `receipt nonce=${r.claims.nonce} ts=${r.claims.timestampMs} is in no checkpoint window`,
      });
    } else if (hits.length > 1) {
      findings.push({
        code: "window-coverage",
        id: r.claims.nonce,
        detail: `receipt nonce=${r.claims.nonce} is in ${hits.length} checkpoint windows`,
      });
    }
  }
  return findings;
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
    const inWindow = receiptsInWindow(receipts, cp);
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
    const expectedHead = inWindow.length === 0 ? null : receiptHash(inWindow[inWindow.length - 1]);
    if (cp.claims.chainHeadHash !== expectedHead) {
      findings.push({
        code: "checkpoint-head-mismatch",
        id: `epoch-${cp.claims.epoch}-head`,
        detail: `checkpoint epoch ${cp.claims.epoch} chainHeadHash ${cp.claims.chainHeadHash} != ${expectedHead}`,
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

export function findEquivocationFinding(checkpoints: SignedCheckpoint[]): Finding | null {
  const hit = findEquivocation(checkpoints);
  if (!hit) {
    return null;
  }
  return {
    code: "equivocation",
    id: `epoch-${hit.epoch}`,
    detail: `epoch ${hit.epoch} has ${hit.hashes.length} distinct checkpoint hashes`,
  };
}

export function audit(input: {
  receipts: SignedReceipt[];
  checkpoints: SignedCheckpoint[];
  settlements: RailSettlement[];
  extract?: SignedRailExtract;
}): AuditReport {
  const findings: Finding[] = [];
  const warnings: Finding[] = [];

  if (input.extract) {
    if (!verifyRailExtract(input.extract)) {
      warnings.push({
        code: "unauthenticated-extract",
        id: "extract",
        detail: "rail extract signature failed; completeness guarantee is conditional",
        severity: "warn",
      });
    }
  } else {
    warnings.push({
      code: "unauthenticated-extract",
      id: "extract",
      detail: "rail extract is unsigned; completeness guarantee is conditional",
      severity: "warn",
    });
  }

  findings.push(...findSettlementMatches(input.receipts, input.settlements));
  const chain = findReceiptChainBreak(input.receipts);
  if (chain) findings.push(chain);
  findings.push(...findCheckpointTotalMismatches(input.receipts, input.checkpoints));
  findings.push(...findWindowCoverage(input.receipts, input.checkpoints));
  const equiv = findEquivocationFinding(input.checkpoints);
  if (equiv) findings.push(equiv);

  const hard = findings.filter((f) => f.severity !== "warn");
  const missing = hard.filter((f) => f.code === "settlement-without-receipt");
  const summary =
    hard.length === 0
      ? "audit: balanced"
      : missing.length > 0
        ? `audit: ${missing.length} settlement without receipt → FAIL`
        : `audit: ${hard.length} finding(s) → FAIL`;
  return {
    ok: hard.length === 0,
    findings: hard,
    warnings,
    guarantee: warnings.length === 0 ? "unconditional" : "conditional",
    summary,
  };
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
