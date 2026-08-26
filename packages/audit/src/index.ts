import { createPublicKey } from "node:crypto";

import {
  findCheckpointChainBreak,
  findEquivocation,
  totalsFromReceipts,
  verifyCheckpoint,
  type SignedCheckpoint,
} from "@cedulon/checkpoint";
import { receiptHash, verifyCounterSignature, verifyReceipt, type SignedReceipt } from "@cedulon/receipts";
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
  | "extract-key-mismatch"
  | "extract-scope-mismatch"
  | "extract-settlement-mismatch"
  | "trust-key-unreadable"
  | "unstated-audit-window"
  | "malformed-amount"
  | "countersign-bad";

/**
 * Trust root the verifier supplies out of band. Without it a rail extract only
 * proves internal consistency: any key can sign any body, including its own.
 */
export type RailTrustPin = {
  publicKeyPem: string;
  accountId?: string;
  railId?: string;
  windowStartMs?: number;
  windowEndMs?: number;
};

export type Finding = {
  code: FindingCode;
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

  // A ref that repeats is skipped by the ref-keyed match below, so compare the
  // aggregate settled amount against the aggregate receipted amount instead.
  // Otherwise a repeated ref hides the amount that is unaccounted for.
  for (const ref of skip) {
    let malformed = false;
    const add = (into: Map<string, bigint>, currency: string, amount: string): void => {
      let parsed: bigint;
      try {
        parsed = BigInt(amount);
      } catch {
        // An amount the audit cannot read is itself a finding. Throwing here
        // would take down the whole report over one bad row.
        malformed = true;
        findings.push({
          code: "malformed-amount",
          id: ref,
          detail: `ref ${ref} carries the amount ${JSON.stringify(amount)}, which is not an integer`,
        });
        return;
      }
      into.set(currency, (into.get(currency) ?? 0n) + parsed);
    };

    const settledByCurrency = new Map<string, bigint>();
    for (const item of settlementItems) {
      if (item.ref !== ref) continue;
      add(settledByCurrency, item.settlement.currency, item.settlement.amount);
    }
    const receiptedByCurrency = new Map<string, bigint>();
    for (const item of receiptItems) {
      if (item.ref !== ref) continue;
      add(receiptedByCurrency, item.receipt.claims.currency, item.receipt.claims.amount);
    }
    if (malformed) {
      continue;
    }
    // Walk both sides: a currency that appears only among the receipts is a
    // receipt with nothing settled behind it, and iterating the settled side
    // alone would report nothing at all for it.
    const currencies = new Set([...settledByCurrency.keys(), ...receiptedByCurrency.keys()]);
    for (const currency of currencies) {
      const settled = settledByCurrency.get(currency) ?? 0n;
      const receipted = receiptedByCurrency.get(currency) ?? 0n;
      if (settled > receipted) {
        findings.push({
          code: "settlement-without-receipt",
          id: ref,
          detail: `ref ${ref} settled ${settled} ${currency} against ${receipted} ${currency} receipted; ${settled - receipted} ${currency} unaccounted`,
        });
      } else if (settled < receipted) {
        findings.push({
          code: "settlement-mismatch",
          id: ref,
          detail: `ref ${ref} settled ${settled} ${currency} against ${receipted} ${currency} receipted`,
        });
      }
    }
  }

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

/**
 * A key is bytes, not text. Compare SPKI DER so the same key still matches
 * when a rail publishes it in another envelope, and so an unreadable key is
 * distinguishable from one that simply differs.
 */
function toSpkiDer(key: string): Buffer | null {
  const trimmed = key.trim();
  const attempts = trimmed.includes("-----BEGIN")
    ? [{ key: trimmed, format: "pem" as const }]
    : [
        {
          key: Buffer.from(trimmed.replace(/\s+/g, ""), "base64"),
          format: "der" as const,
          type: "spki" as const,
        },
      ];
  for (const attempt of attempts) {
    try {
      return createPublicKey(attempt as Parameters<typeof createPublicKey>[0]).export({
        type: "spki",
        format: "der",
      });
    } catch {
      // fall through to the next shape
    }
  }
  return null;
}

function settlementKey(s: RailSettlement): string {
  return [s.ref, s.amount, s.currency, s.timestampMs].join("\u0000");
}

function sameSettlements(a: RailSettlement[], b: RailSettlement[]): boolean {
  if (a.length !== b.length) return false;
  const left = a.map(settlementKey).sort();
  const right = b.map(settlementKey).sort();
  return left.every((k, i) => k === right[i]);
}

export function audit(input: {
  receipts: SignedReceipt[];
  checkpoints: SignedCheckpoint[];
  settlements?: RailSettlement[];
  extract?: SignedRailExtract;
  trust?: RailTrustPin;
}): AuditReport {
  const findings: Finding[] = [];
  const warnings: Finding[] = [];

  // When an extract is supplied it is the subject of the audit: reconcile the
  // rows it actually carries, never a separate array the caller hands over.
  const reconciled = input.extract ? input.extract.body.settlements : (input.settlements ?? []);

  if (input.extract) {
    if (input.settlements && !sameSettlements(input.settlements, input.extract.body.settlements)) {
      findings.push({
        code: "extract-settlement-mismatch",
        id: "extract",
        detail: `caller supplied ${input.settlements.length} settlement(s) that differ from the ${input.extract.body.settlements.length} in the signed extract; the extract is authoritative`,
      });
    }

    const signatureVerifies = verifyRailExtract(input.extract);

    // An extract that declares one window and carries rows from outside it has
    // not reported on the period it claims to cover. This holds whether or not
    // a key was pinned, so it is checked before the trust branch.
    for (const row of input.extract.body.settlements) {
      if (
        row.timestampMs < input.extract.body.windowStartMs ||
        row.timestampMs >= input.extract.body.windowEndMs
      ) {
        findings.push({
          code: "extract-scope-mismatch",
          id: row.ref,
          detail: `settlement ${row.ref} at ${row.timestampMs} is outside the declared window ${input.extract.body.windowStartMs}..${input.extract.body.windowEndMs}`,
        });
      }
    }

    if (!input.trust) {
      warnings.push({
        code: "unauthenticated-extract",
        id: "extract",
        detail: signatureVerifies
          ? "no verifier-supplied rail key; the signature proves internal consistency, not that the named rail produced the extract, so the completeness guarantee is conditional"
          : "rail extract signature failed and no rail key was pinned; completeness guarantee is conditional",
        severity: "warn",
      });
    } else {
      // A pin is the verifier stating what it expects. Once stated, every way of
      // failing to meet it is a finding, including a signature that does not
      // verify at all: checking the pin only on the path where the signature
      // already verified would fail open on the worse input.
      const t = input.trust;
      const body = input.extract.body;
      const pinnedDer = toSpkiDer(t.publicKeyPem);
      if (pinnedDer === null) {
        // The verifier's own configuration is broken. Saying "mismatch" here
        // would blame the extract for a key we could not read.
        findings.push({
          code: "trust-key-unreadable",
          id: "extract",
          detail: "the pinned rail key could not be read as a public key; supply PEM or base64 SPKI",
        });
      } else if (!signatureVerifies) {
        findings.push({
          code: "extract-key-mismatch",
          id: "extract",
          detail: "a rail key was pinned but the extract signature does not verify against the key it carries",
        });
      } else {
        const carriedDer = toSpkiDer(input.extract.publicKeyPem);
        if (carriedDer === null || !carriedDer.equals(pinnedDer)) {
          findings.push({
            code: "extract-key-mismatch",
            id: "extract",
            detail: "rail extract is signed by a key other than the pinned rail key",
          });
        }
      }
      if (t.accountId !== undefined && body.accountId !== t.accountId) {
        findings.push({
          code: "extract-scope-mismatch",
          id: "extract",
          detail: `rail extract covers account ${body.accountId}, not the expected ${t.accountId}`,
        });
      }
      if (t.railId !== undefined && body.railId !== t.railId) {
        findings.push({
          code: "extract-scope-mismatch",
          id: "extract",
          detail: `rail extract covers rail ${body.railId}, not the expected ${t.railId}`,
        });
      }
      if (t.windowStartMs !== undefined && body.windowStartMs > t.windowStartMs) {
        findings.push({
          code: "extract-scope-mismatch",
          id: "extract",
          detail: `rail extract starts at ${body.windowStartMs}, after the expected window start ${t.windowStartMs}`,
        });
      }
      if (t.windowEndMs !== undefined && body.windowEndMs < t.windowEndMs) {
        findings.push({
          code: "extract-scope-mismatch",
          id: "extract",
          detail: `rail extract ends at ${body.windowEndMs}, before the expected window end ${t.windowEndMs}`,
        });
      }
      if (t.windowStartMs === undefined || t.windowEndMs === undefined) {
        // Without a stated period the extract picks its own scope, and an
        // extract that reports on a millisecond balances as easily as one that
        // reports on a month. Pinning the key says who signed; only a stated
        // window says what the signature had to cover.
        warnings.push({
          code: "unstated-audit-window",
          id: "extract",
          detail:
            "no audit window was stated, so the extract defines the period it reports on; completeness guarantee is conditional",
          severity: "warn",
        });
      }
    }
  } else {
    warnings.push({
      code: "unauthenticated-extract",
      id: "extract",
      detail: input.trust
        ? "a rail key was pinned but no extract was supplied, so there is nothing to check it against; completeness guarantee is conditional"
        : "rail extract is unsigned; completeness guarantee is conditional",
      severity: "warn",
    });
  }

  // An extract reports on the period it declares. Matching receipts from
  // outside that period against it would call an honest later spend a
  // completeness failure, so they are out of scope for this extract; auditing
  // a longer period means obtaining extracts that cover it.
  const inScope = input.extract
    ? input.receipts.filter(
        (r) =>
          r.claims.timestampMs >= input.extract!.body.windowStartMs &&
          r.claims.timestampMs < input.extract!.body.windowEndMs,
      )
    : input.receipts;

  findings.push(...findSettlementMatches(inScope, reconciled));
  for (const r of input.receipts) {
    if (!r.counterCoseHex) {
      continue;
    }
    if (!verifyCounterSignature(r)) {
      findings.push({
        code: "countersign-bad",
        id: r.claims.nonce,
        detail: `payee countersignature on nonce=${r.claims.nonce} failed verify`,
      });
    }
  }
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
  // A finding that says the extract itself cannot be trusted also removes the
  // unconditional claim; otherwise a report could name a key mismatch and still
  // describe its own guarantee as unconditional.
  const doubtedExtract = hard.some(
    (f) =>
      f.code === "extract-key-mismatch" ||
      f.code === "trust-key-unreadable" ||
      f.code === "extract-scope-mismatch" ||
      f.code === "extract-settlement-mismatch",
  );
  return {
    ok: hard.length === 0,
    findings: hard,
    warnings,
    guarantee: warnings.length === 0 && !doubtedExtract ? "unconditional" : "conditional",
    summary,
  };
}

export function formatAudit(report: AuditReport, receiptCount = 0): string {
  const lines = report.ok
    ? [`audit: balanced`, `receipts=${receiptCount}`, "findings=0"]
    : [report.summary, ...report.findings.map((f) => `${f.code}\t${f.id}\t${f.detail}`)];
  // Warnings decide whether the balance means anything, so an operator has to
  // see them on the passing path too, not only in the returned object.
  lines.push(`guarantee=${report.guarantee}`);
  for (const w of report.warnings) {
    lines.push(`warn\t${w.code}\t${w.detail}`);
  }
  return lines.join("\n");
}
