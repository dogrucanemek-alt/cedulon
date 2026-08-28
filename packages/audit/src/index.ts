import { sameSpkiKey, toSpkiDer } from "@cedulon/cose";
import {
  findCheckpointChainBreak,
  findEquivocation,
  statementHashOfCheckpoint,
  totalsFromReceipts,
  verifyCheckpoint,
  verifyInclusionReceipt,
  type InclusionReceipt,
  type SignedCheckpoint,
} from "@cedulon/checkpoint";
import { receiptHash, verifyCounterSignature, verifyReceipt, type SignedReceipt } from "@cedulon/receipts";
import {
  verifyRailExtract,
  type RailSettlement,
  type SignedRailExtract,
} from "@cedulon/x402-adapter";

export const FINDING_CODES = [
  "settlement-without-receipt",
  "receipt-without-settlement",
  "receipt-chain-break",
  "checkpoint-total-mismatch",
  "checkpoint-head-mismatch",
  "duplicate-ref",
  "settlement-mismatch",
  "equivocation",
  "window-coverage",
  "settled-without-ref",
  "unauthenticated-extract",
  "unauthenticated-issuer",
  "unauthenticated-witness",
  "unauthenticated-countersigner",
  "countersign-missing",
  "issuer-key-mismatch",
  "countersign-key-mismatch",
  "extract-key-mismatch",
  "extract-scope-mismatch",
  "extract-settlement-mismatch",
  "trust-key-unreadable",
  "unstated-audit-window",
  "malformed-amount",
  "countersign-bad",
  "checkpoint-not-anchored",
  "checkpoint-withheld",
  "checkpoint-totals-redacted",
] as const;

export type FindingCode = (typeof FINDING_CODES)[number];

/** Diagnostic envelope version. Not a wire format until a later draft says so. */
export const FINDING_OBJECT_VERSION = 1;

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

/**
 * The issuer key the verifier holds out of band. The rail pin says who reported
 * the settlements; this says who was entitled to issue receipts and checkpoints
 * for them. Without it an attacker mints a key, signs a receipt for a settlement
 * they were never authorised to make, and the row stops looking uncovered.
 */
export type IssuerTrustPin = {
  /**
   * One key, or every key the verifier accepts. A single pin turns an honest key
   * rotation into a wall of findings, and the way out an operator reaches for is
   * to stop pinning at all - so the set is stated rather than assumed to be one.
   */
  publicKeyPem: string | readonly string[];
};

/** Payee keys the verifier holds, keyed by the payee named in the receipt. */
export type PayeeTrustPins = Readonly<Record<string, string>>;

/**
 * Reads a pin as SPKI DER, keeping the keys it could read and counting the ones
 * it could not. One mistyped key in a rotation set must not throw away the
 * others, and a set nothing could be read from must withhold trust rather than
 * fall back to accepting everything.
 */
function pinnedKeys(pin: string | readonly string[]): { usable: Buffer[]; unreadable: number } {
  const pems = typeof pin === "string" ? [pin] : pin;
  const usable: Buffer[] = [];
  let unreadable = 0;
  for (const pem of pems) {
    const der = toSpkiDer(pem);
    if (der === null) {
      unreadable += 1;
    } else {
      usable.push(der);
    }
  }
  return { usable, unreadable };
}

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

/**
 * Defects the submitted receipts have on their own terms: a settled receipt that
 * names no rail ref, and two receipts claiming the same one. Neither is a claim
 * about who signed them, so neither depends on a trust root - and an unreadable
 * pin used to take both down with it, quietly simplifying the picture.
 */
export function findReceiptSelfConsistency(receipts: SignedReceipt[]): Finding[] {
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

  const withRef = settled
    .map((r) => ({ ref: receiptRef(r), id: r.claims.nonce, side: "receipt" as const }))
    .filter((x): x is typeof x & { ref: string } => x.ref !== null);
  pushDuplicateRefs(withRef, findings);
  return findings;
}

export function findSettlementMatches(
  receipts: SignedReceipt[],
  settlements: RailSettlement[],
): Finding[] {
  const findings: Finding[] = [];
  const settled = receipts.filter(isSettled);

  const receiptItems = settled
    .map((r) => ({ ref: receiptRef(r), id: r.claims.nonce, side: "receipt" as const, receipt: r }))
    .filter((x): x is typeof x & { ref: string } => x.ref !== null);
  const settlementItems = settlements.map((s) => ({
    ref: s.ref,
    id: s.ref,
    side: "settlement" as const,
    settlement: s,
  }));

  // Reported by findReceiptSelfConsistency, which runs over everything submitted;
  // here the set is only needed to know which refs the aggregate walk covers.
  const dupeReceipt = pushDuplicateRefs(receiptItems, []);
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
    if (cp.claims.totals !== null && JSON.stringify(expected) !== JSON.stringify(cp.claims.totals)) {
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

/** A log may publish under more than one key, the same way an issuer may. */
function inclusionFromPinnedLog(
  rec: InclusionReceipt,
  witnessKeyPem?: string | readonly string[],
): boolean {
  if (witnessKeyPem === undefined) {
    return verifyInclusionReceipt(rec);
  }
  const pems = typeof witnessKeyPem === "string" ? [witnessKeyPem] : witnessKeyPem;
  return pems.some((pem) => verifyInclusionReceipt(rec, pem));
}

/**
 * `attestsIssuer` is the second question: the witness pin says which log spoke,
 * and this says whether the statement that log holds was signed by the issuer
 * under audit. Without it a pinned log can carry a body anyone minted into the
 * epoch pool.
 */
function verifiedWitnessCheckpoints(
  receipts: InclusionReceipt[],
  witnessKeyPem?: string | readonly string[],
  attestsIssuer?: ((pem: string) => boolean) | null,
): SignedCheckpoint[] {
  const out: SignedCheckpoint[] = [];
  for (const rec of receipts) {
    if (!inclusionFromPinnedLog(rec, witnessKeyPem) || !rec.checkpoint) {
      continue;
    }
    if (attestsIssuer && !attestsIssuer(rec.checkpoint.publicKeyPem)) {
      continue;
    }
    if (statementHashOfCheckpoint(rec.checkpoint) !== rec.statementHash) {
      continue;
    }
    if (!verifyCheckpoint(rec.checkpoint)) {
      continue;
    }
    out.push(rec.checkpoint);
  }
  return out;
}

function findTransparencyWitness(
  checkpoints: SignedCheckpoint[],
  inclusionReceipts: InclusionReceipt[],
  witnessKeyPem?: string | readonly string[],
  attestsIssuer?: ((pem: string) => boolean) | null,
): { findings: Finding[]; warnings: Finding[] } {
  const findings: Finding[] = [];
  const warnings: Finding[] = [];
  // Two different questions, so two different sets.
  //
  // Anchoring only needs the hash: an entry that binds this checkpoint proves it
  // was logged, whoever else can read the body.
  const anchoring = inclusionReceipts.filter((r) => inclusionFromPinnedLog(r, witnessKeyPem));
  const witnessHashes = new Set(anchoring.map((r) => r.statementHash));

  // Accusing an issuer of withholding an epoch needs to know whose epoch it is.
  // A log holds statements from everyone who uses it, and an entry with no body
  // names nobody - stripping the body off a genuine entry is free, and it used
  // to be enough to report an honest issuer for hiding something never theirs.
  const accusing = anchoring.filter(
    (r) => r.checkpoint && (!attestsIssuer || attestsIssuer(r.checkpoint.publicKeyPem)),
  );
  const presentedHashes = new Set(checkpoints.map(statementHashOfCheckpoint));

  for (const cp of checkpoints) {
    const hash = statementHashOfCheckpoint(cp);
    if (!witnessHashes.has(hash)) {
      warnings.push({
        code: "checkpoint-not-anchored",
        id: `epoch-${cp.claims.epoch}`,
        detail: `checkpoint epoch ${cp.claims.epoch} has no inclusion receipt in the configured witness`,
        severity: "warn",
      });
    }
  }

  for (const rec of accusing) {
    if (!presentedHashes.has(rec.statementHash)) {
      findings.push({
        code: "checkpoint-withheld",
        id: rec.statementHash,
        detail: `inclusion receipt index ${rec.index} binds statement ${rec.statementHash}, which is not in the presented checkpoint chain`,
      });
    }
  }

  return { findings, warnings };
}

/**
 * A countersignature travels beside the issuer signature without being covered
 * by it, so anyone holding an honest receipt can append one of their own and it
 * reads as the payee having approved the payment. Checking it against the key it
 * carries answers a question that answers itself; the payee key has to come from
 * the verifier. Findings go into `findings`; the return value is the warnings.
 */
function findCountersignFindings(
  input: { receipts: SignedReceipt[]; payeeTrust?: PayeeTrustPins },
  findings: Finding[],
): Finding[] {
  const warnings: Finding[] = [];
  const countersigned = input.receipts.filter((r) => r.counterCoseHex);
  for (const r of countersigned) {
    const pinned = input.payeeTrust?.[r.claims.payee];
    if (!verifyCounterSignature(r)) {
      findings.push({
        code: "countersign-bad",
        id: r.claims.nonce,
        detail: `payee countersignature on nonce=${r.claims.nonce} failed verify`,
      });
      continue;
    }
    if (pinned === undefined) {
      continue;
    }
    const carried = r.payeePublicKeyPem;
    if (carried === undefined || !sameSpkiKey(carried, pinned)) {
      findings.push({
        code: "countersign-key-mismatch",
        id: r.claims.nonce,
        detail: `the countersignature on nonce=${r.claims.nonce} is by a key other than the one pinned for payee ${r.claims.payee}, so it is not that payee approving the payment`,
      });
    }
  }
  // Naming a payee key is the verifier saying it expects that payee's word on
  // these payments. Dropping the countersignature would otherwise drop the
  // question with it, so deleting the evidence - or a failed forgery - would
  // read as nothing to answer.
  for (const r of input.receipts) {
    if (
      isSettled(r) &&
      !r.counterCoseHex &&
      input.payeeTrust?.[r.claims.payee] !== undefined
    ) {
      warnings.push({
        code: "countersign-missing",
        id: r.claims.nonce,
        detail: `a payee key is pinned for ${r.claims.payee} but receipt nonce=${r.claims.nonce} carries no countersignature from them`,
        severity: "warn",
      });
    }
  }
  const unpinned = countersigned.filter((r) => input.payeeTrust?.[r.claims.payee] === undefined);
  if (unpinned.length > 0) {
    warnings.push({
      code: "unauthenticated-countersigner",
      id: "countersigner",
      detail: `${unpinned.length} receipt(s) carry a countersignature checked only against the key travelling with them; without a verifier-supplied payee key that is not evidence the payee approved anything`,
      severity: "warn",
    });
  }
  return warnings;
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

export type AuditInput = {
  receipts: SignedReceipt[];
  checkpoints: SignedCheckpoint[];
  settlements?: RailSettlement[];
  extract?: SignedRailExtract;
  trust?: RailTrustPin;
  issuerTrust?: IssuerTrustPin;
  /** The transparency log's key, held out of band. Same argument as the two above. */
  witnessTrust?: IssuerTrustPin;
  /** Payee keys the verifier holds, keyed by payee. Same argument again. */
  payeeTrust?: PayeeTrustPins;
  /** Checkpoint inclusion receipts. Absent ⇒ today's behaviour. Present ⇒ T11 witness is configured. */
  inclusionReceipts?: InclusionReceipt[];
};

export function audit(input: AuditInput): AuditReport {
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

  // The rail pin answers who reported the settlements. It says nothing about who
  // was entitled to issue receipts for them, and a receipt verified against the
  // key it carries only proves it is internally consistent. So the receipts that
  // count as coverage are the ones answering to a second root, stated out of band.
  let attested = input.receipts;
  // Null while no issuer key was stated: there is no attested/unattested split
  // to make, and every check falls back to the whole submitted list.
  let attestsIssuer: ((pem: string) => boolean) | null = null;
  if (!input.issuerTrust) {
    // Only worth saying when the audit actually leans on an issued object. An
    // audit with no receipts and no checkpoints rests on the extract alone, and
    // warning about a root it never used would cheapen the warning.
    if (input.receipts.length > 0 || input.checkpoints.length > 0) {
      warnings.push({
        code: "unauthenticated-issuer",
        id: "issuer",
        detail:
          "no verifier-supplied issuer key; receipt and checkpoint signatures prove internal consistency, not that the named issuer produced them, so the completeness guarantee is conditional",
        severity: "warn",
      });
    }
  } else {
    const { usable: issuerDers, unreadable } = pinnedKeys(input.issuerTrust.publicKeyPem);
    if (unreadable > 0 || issuerDers.length === 0) {
      // The verifier's own configuration is broken. Calling this a mismatch would
      // blame the receipts for a key we could not read.
      findings.push({
        code: "trust-key-unreadable",
        id: "issuer",
        detail:
          issuerDers.length === 0
            ? "no pinned issuer key could be read as a public key, so nothing is attested; supply PEM or base64 SPKI"
            : `${unreadable} of the pinned issuer keys could not be read as a public key; the rest are still in use`,
      });
    }
    {
      const attests = (pem: string): boolean => {
        if (issuerDers.length === 0) {
          // Withholding trust, not handing it out: a pin nobody could read is
          // the one case where falling back to "accept everything" turns a
          // broken setting into a bypass.
          return false;
        }
        const der = toSpkiDer(pem);
        return der !== null && issuerDers.some((pinned) => pinned.equals(der));
      };
      attestsIssuer = attests;
      // Naming a mismatch when the pin itself could not be read would blame the
      // receipts for the verifier's own broken setting - and every receipt at
      // once. `trust-key-unreadable` above already says what went wrong; nothing
      // is attested, so the settlements come back uncovered on their own.
      const namesMismatches = issuerDers.length > 0;
      // Reported and then set aside: a receipt from another key is evidence about
      // that key, not coverage of the settlement it names. Leaving it in the
      // reconciliation is exactly how a forged receipt silences a naked row.
      for (const r of namesMismatches ? input.receipts : []) {
        if (!attests(r.publicKeyPem)) {
          findings.push({
            code: "issuer-key-mismatch",
            id: r.claims.nonce,
            detail: `receipt nonce=${r.claims.nonce} is signed by a key other than the pinned issuer key, so it is not coverage for ${r.claims.x402PaymentRef ?? "any settlement"}`,
          });
        }
      }
      for (const cp of namesMismatches ? input.checkpoints : []) {
        if (!attests(cp.publicKeyPem)) {
          findings.push({
            code: "issuer-key-mismatch",
            id: `epoch-${cp.claims.epoch}`,
            detail: `checkpoint epoch ${cp.claims.epoch} is signed by a key other than the pinned issuer key`,
          });
        }
      }
      attested = input.receipts.filter((r) => attests(r.publicKeyPem));
    }
  }

  // An extract reports on the period it declares. Matching receipts from
  // outside that period against it would call an honest later spend a
  // completeness failure, so they are out of scope for this extract; auditing
  // a longer period means obtaining extracts that cover it.
  const inScope = input.extract
    ? attested.filter(
        (r) =>
          r.claims.timestampMs >= input.extract!.body.windowStartMs &&
          r.claims.timestampMs < input.extract!.body.windowEndMs,
      )
    : attested;

  findings.push(...findReceiptSelfConsistency(input.receipts));
  findings.push(...findSettlementMatches(inScope, reconciled));
  // Every check below reasons about what the issuer published. Walking the whole
  // submitted list instead means one receipt from a key the verifier already
  // rejected writes "the checkpoint lied" and "the chain is broken" against an
  // honest issuer - noise that argues for switching the pin off.
  const attestedCheckpoints = attestsIssuer
    ? input.checkpoints.filter((cp) => attestsIssuer!(cp.publicKeyPem))
    : input.checkpoints;
  warnings.push(
    ...findCountersignFindings({ receipts: attested, payeeTrust: input.payeeTrust }, findings),
  );
  const chain = findReceiptChainBreak(attested);
  if (chain) findings.push(chain);
  findings.push(...findCheckpointTotalMismatches(attested, attestedCheckpoints));
  findings.push(...findWindowCoverage(attested, attestedCheckpoints));

  // A witness only adds evidence once the verifier has named the log. Until then
  // its inclusion receipts are a log anyone could have invented, and letting them
  // reach the epoch pool lets an attacker report the honest issuer for publishing
  // two checkpoints of one epoch. The warning says why they were left out.
  const witnessConfigured = Boolean(input.inclusionReceipts && input.witnessTrust);
  const witnessCheckpoints = witnessConfigured
    ? verifiedWitnessCheckpoints(
        input.inclusionReceipts!,
        (input.witnessTrust as IssuerTrustPin).publicKeyPem,
        attestsIssuer,
      )
    : [];
  const equiv = findEquivocationFinding([...attestedCheckpoints, ...witnessCheckpoints]);
  if (equiv) findings.push(equiv);

  if (input.inclusionReceipts) {
    if (witnessConfigured) {
      const witness = findTransparencyWitness(
        attestedCheckpoints,
        input.inclusionReceipts,
        (input.witnessTrust as IssuerTrustPin).publicKeyPem,
        attestsIssuer,
      );
      findings.push(...witness.findings);
      warnings.push(...witness.warnings);
    } else {
      warnings.push({
        code: "unauthenticated-witness",
        id: "witness",
        detail:
          "no verifier-supplied witness key; an inclusion receipt is checked against the key it carries, so it says a log exists rather than that the named log anchored anything, and it was left out of the comparison",
        severity: "warn",
      });
    }
  }

  // A signed redaction is honest but unverifiable: say so, and drop the claim to
  // conditional. Only a checkpoint that verifies gets to make this claim — an
  // unverifiable one has already been reported above.
  for (const cp of attestedCheckpoints) {
    if (cp.claims.totals === null && verifyCheckpoint(cp)) {
      warnings.push({
        code: "checkpoint-totals-redacted",
        id: `epoch-${cp.claims.epoch}`,
        detail: `checkpoint epoch ${cp.claims.epoch} was signed with its totals withheld; totals comparison skipped`,
        severity: "warn",
      });
    }
  }

  const hard = findings.filter((f) => f.severity !== "warn");
  const missing = hard.filter((f) => f.code === "settlement-without-receipt");
  const summary =
    hard.length === 0
      ? "audit: balanced"
      : missing.length > 0
        ? `audit: ${missing.length} settlement without receipt → FAIL`
        : `audit: ${hard.length} finding(s) → FAIL`;
  // A finding that says the evidence itself cannot be trusted also removes the
  // unconditional claim; otherwise a report could name a key mismatch and still
  // describe its own guarantee as unconditional.
  const doubtedEvidence = hard.some(
    (f) =>
      f.code === "extract-key-mismatch" ||
      f.code === "trust-key-unreadable" ||
      f.code === "extract-scope-mismatch" ||
      f.code === "extract-settlement-mismatch" ||
      f.code === "issuer-key-mismatch" ||
      f.code === "countersign-key-mismatch",
  );
  return {
    ok: hard.length === 0,
    findings: hard,
    warnings,
    guarantee: warnings.length === 0 && !doubtedEvidence ? "unconditional" : "conditional",
    summary,
  };
}

export type FindingObject = {
  findingObjectVersion: typeof FINDING_OBJECT_VERSION;
  ok: boolean;
  guarantee: AuditReport["guarantee"];
  summary: string;
  receipts: number;
  findings: Finding[];
  warnings: Finding[];
};

export function toFindingObject(report: AuditReport, receiptCount = 0): FindingObject {
  return {
    findingObjectVersion: FINDING_OBJECT_VERSION,
    ok: report.ok,
    guarantee: report.guarantee,
    summary: report.summary,
    receipts: receiptCount,
    findings: report.findings,
    warnings: report.warnings,
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
