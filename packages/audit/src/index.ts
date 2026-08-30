import { createHash } from "node:crypto";
import {
  coseDecodeRefusalHex,
  decodeCoseSign1,
  decodeProtectedHeader,
  hexToBytes,
  kidFromPublicKeyPem,
  sameSpkiKey,
  toSpkiDer,
} from "@cedulon/cose";
import {
  applyInclusionProof,
  findCheckpointChainBreak,
  findEquivocation,
  statementHashOfCheckpoint,
  totalsFromReceipts,
  verifyCheckpoint,
  verifyCheckpointUnderPin,
  verifyInclusionReceipt,
  type InclusionProof,
  type InclusionReceipt,
  type SignedCheckpoint,
} from "@cedulon/checkpoint";
import { manifestHash, verifyManifest, type SignedManifest } from "@cedulon/manifest";
import {
  countersignDeliveredHashHex,
  hashClaimRefusal,
  receiptEncodeRefusal,
  receiptHash,
  verifyCounterSignature,
  verifyReceipt,
  verifyReceiptUnderPin,
  type SignedReceipt,
} from "@cedulon/receipts";
import {
  DEFAULT_CLOCK_SKEW_MS,
  railExtractEncodeRefusal,
  verifyRailExtract,
  type RailExtractBody,
  type RailSettlement,
  type SignedRailExtract,
} from "@cedulon/x402-adapter";

export { DEFAULT_CLOCK_SKEW_MS };

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
  "unauthenticated-manifest",
  "countersign-missing",
  "witness-entry-unattributable",
  "issuer-key-mismatch",
  "countersign-key-mismatch",
  "extract-key-mismatch",
  "manifest-key-mismatch",
  "manifest-covers-no-receipt",
  "manifest-terms-mismatch",
  "extract-scope-mismatch",
  "extract-settlement-mismatch",
  "trust-key-unreadable",
  "unstated-audit-window",
  "malformed-amount",
  "malformed-policy-hash",
  "malformed-request-hash",
  "malformed-acceptance-criteria-hash",
  "malformed-manifest-hash",
  "malformed-receipt-hash",
  "malformed-prev-receipt-hash",
  "malformed-chain-head-hash",
  "malformed-prev-checkpoint-hash",
  "malformed-ap-two-mandate-hash",
  "countersign-bad",
  "checkpoint-not-anchored",
  "checkpoint-withheld",
  "checkpoint-totals-redacted",
  "carried-key-mismatch",
  "boundary-deferred",
  "beneficiary-mismatch",
  "counterparty-unbound",
  "delivery-mismatch",
  "witness-inclusion-invalid",
  "witness-inclusion-not-exercised",
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

function pinPemsOf(pin: string | readonly string[]): string[] {
  return typeof pin === "string" ? [pin] : [...pin];
}

function receiptAttestedByPins(r: SignedReceipt, pins: readonly string[]): boolean {
  return pins.some((pem) => toSpkiDer(pem) !== null && verifyReceiptUnderPin(r, pem));
}

function checkpointAttestedByPins(cp: SignedCheckpoint, pins: readonly string[]): boolean {
  return pins.some((pem) => toSpkiDer(pem) !== null && verifyCheckpointUnderPin(cp, pem));
}

function kidMatchesPin(coseHex: string, pinPem: string): boolean {
  try {
    const kid = decodeProtectedHeader(decodeCoseSign1(hexToBytes(coseHex)).protectedHeader).kid;
    const pinKid = kidFromPublicKeyPem(pinPem);
    return kid.length === pinKid.length && kid.every((byte, i) => byte === pinKid[i]);
  } catch {
    return false;
  }
}

function receiptBelongsToPin(r: SignedReceipt, pins: readonly string[]): boolean {
  for (const pem of pins) {
    if (toSpkiDer(pem) === null) continue;
    if (sameSpkiKey(r.publicKeyPem, pem)) return true;
    if (r.coseHex && kidMatchesPin(r.coseHex, pem)) return true;
  }
  return false;
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

/**
 * Verification answers whether an object is good for anything; when the answer
 * is no, this asks whether the reason was a bound this profile names
 * (MUST-T4-18, MUST-T4-19) rather than a signature verdict. An operator reading
 * "signature failed" for an input the decoder refused cannot tell a limit from
 * a forgery.
 *
 * The question is asked of the bytes rather than caught from the verifier on
 * purpose: a verifier that threw would put every one of its callers a forgotten
 * try/catch away from a crash, which is how a 65KB checkpoint took a whole
 * audit down between one revision and the next. Forgetting to ask here costs a
 * less specific message, never an exception.
 */
function verifiesOrRefusal(
  check: () => boolean,
  coseHex?: string | null,
): { ok: boolean; refusal: string | null } {
  const ok = check();
  return { ok, refusal: ok ? null : coseDecodeRefusalHex(coseHex) };
}

/**
 * Issuer order is the prevReceiptHash chain, not the order the receipts
 * were presented. Presentation is a bag; the chain is rebuilt from the
 * links, then walked.
 */
export function orderByIssuerChain(receipts: SignedReceipt[]): {
  ordered: SignedReceipt[];
  leftover: SignedReceipt[];
} {
  if (receipts.length === 0) {
    return { ordered: [], leftover: [] };
  }
  const remaining = new Set(receipts);
  const starts = receipts.filter((r) => r.claims.prevReceiptHash === null);
  const ordered: SignedReceipt[] = [];
  let current = starts.length === 1 ? starts[0] : null;
  while (current && remaining.has(current)) {
    remaining.delete(current);
    ordered.push(current);
    let nextHash: string | null = null;
    try {
      nextHash = receiptHash(current);
    } catch {
      break;
    }
    const nexts = [...remaining].filter((r) => r.claims.prevReceiptHash === nextHash);
    if (nexts.length !== 1) {
      break;
    }
    current = nexts[0];
  }
  return { ordered, leftover: [...remaining] };
}

function receiptVerifiesForChain(receipt: SignedReceipt, pinPems?: readonly string[]): boolean {
  if (pinPems && pinPems.length > 0) {
    return pinPems.some((pem) => toSpkiDer(pem) !== null && verifyReceiptUnderPin(receipt, pem));
  }
  return verifyReceipt(receipt);
}

export function findReceiptChainBreak(
  receipts: SignedReceipt[],
  pinPems?: readonly string[],
): Finding | null {
  const { ordered, leftover } = orderByIssuerChain(receipts);
  if (leftover.length > 0) {
    return {
      code: "receipt-chain-break",
      id: leftover[0].claims.nonce,
      detail: `receipt chain could not place nonce=${leftover[0].claims.nonce}; issuer order is the prevReceiptHash links, not presentation order`,
    };
  }
  for (let i = 0; i < ordered.length; i += 1) {
    const v = verifiesOrRefusal(() => receiptVerifiesForChain(ordered[i], pinPems), ordered[i].coseHex);
    const jcs = v.ok ? null : receiptEncodeRefusal(ordered[i]);
    if (v.refusal !== null || jcs !== null) {
      return {
        code: "receipt-chain-break",
        id: ordered[i].claims.nonce,
        detail:
          v.refusal !== null
            ? `receipt ${i} refused: ${v.refusal} - a decoder bound or duplicate key (MUST-T4-18, MUST-T4-19), not a signature verdict`
            : `receipt ${i} refused: ${jcs} - not a signature verdict`,
      };
    }
    if (!v.ok) {
      return {
        code: "receipt-chain-break",
        id: ordered[i].claims.nonce,
        detail: `receipt ${i} signature failed`,
      };
    }
    let expected: string | null = null;
    if (i > 0) {
      try {
        expected = receiptHash(ordered[i - 1]);
      } catch (err) {
        const name = err instanceof Error && err.message !== "" ? err.message : "unencodable";
        return {
          code: "receipt-chain-break",
          id: ordered[i - 1].claims.nonce,
          detail: `receipt ${i - 1} refused: ${name} - not a signature verdict`,
        };
      }
    }
    if (ordered[i].claims.prevReceiptHash !== expected) {
      return {
        code: "receipt-chain-break",
        id: ordered[i].claims.nonce,
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
  return [...findReceiptDefects(receipts), ...findReceiptRefClashes(receipts)];
}

/**
 * Defects keyed by the offending receipt's own nonce. These accuse nobody else,
 * so they are reported for every receipt submitted - a receipt the verifier
 * rejected can still be malformed, and saying so costs the honest side nothing.
 */
export function findReceiptDefects(receipts: SignedReceipt[]): Finding[] {
  const findings: Finding[] = [];
  for (const r of receipts.filter(isSettled)) {
    if (receiptRef(r) === null) {
      findings.push({
        code: "settled-without-ref",
        id: r.claims.nonce,
        detail: `settled receipt nonce=${r.claims.nonce} has null rail ref`,
      });
    }
  }
  return findings;
}

/**
 * A clash between two receipts, keyed by the rail ref they share. That ref may
 * be one the honest issuer legitimately used, so this question is asked only of
 * the receipts the verifier accepts.
 */
export function findReceiptRefClashes(receipts: SignedReceipt[]): Finding[] {
  const findings: Finding[] = [];
  const withRef = receipts
    .filter(isSettled)
    .map((r) => ({ ref: receiptRef(r), id: r.claims.nonce, side: "receipt" as const }))
    .filter((x): x is typeof x & { ref: string } => x.ref !== null);
  pushDuplicateRefs(withRef, findings);
  return findings;
}

export type SettlementBoundary = {
  windowStartMs: number;
  windowEndMs: number;
  clockSkewMs: number;
  /** Set when a following window was presented and verified. */
  nextRefs?: ReadonlySet<string>;
};

function clockSkewOf(body: RailExtractBody): number {
  return typeof body.clockSkewMs === "number" ? body.clockSkewMs : DEFAULT_CLOCK_SKEW_MS;
}

export function findSettlementMatches(
  receipts: SignedReceipt[],
  settlements: RailSettlement[],
  boundary?: SettlementBoundary,
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

  // Reported by findReceiptRefClashes over the accepted set; here the set is
  // only needed to know which refs the aggregate walk covers.
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

  const consecutive = Boolean(boundary?.nextRefs);
  const lowerCut = boundary ? boundary.windowStartMs + boundary.clockSkewMs : null;
  const upperCut = boundary ? boundary.windowEndMs - boundary.clockSkewMs : null;

  for (const [ref, s] of settlementsByRef) {
    const r = receiptsByRef.get(ref);
    if (!r) {
      const nearStart = lowerCut !== null && s.timestampMs < lowerCut;
      if (nearStart && !consecutive) {
        findings.push({
          code: "boundary-deferred",
          id: ref,
          severity: "warn",
          detail: `settlement ${s.ref} sits inside the opening δ (${boundary!.clockSkewMs} ms) and is unmatched; deferred rather than settlement-without-receipt`,
        });
      } else {
        findings.push({
          code: "settlement-without-receipt",
          id: ref,
          detail: `settlement ${s.ref} ${s.amount} ${s.currency} has no spend receipt`,
        });
      }
      continue;
    }
    if (r.claims.amount !== s.amount || r.claims.currency !== s.currency) {
      findings.push({
        code: "settlement-mismatch",
        id: ref,
        detail: `settlement ${ref} ${s.amount} ${s.currency} != receipt ${r.claims.amount} ${r.claims.currency}`,
      });
    }
    if (typeof s.beneficiary === "string" && r.claims.payee !== s.beneficiary) {
      findings.push({
        code: "beneficiary-mismatch",
        id: ref,
        detail: `settlement ${ref} beneficiary ${JSON.stringify(s.beneficiary)} != receipt payee ${JSON.stringify(r.claims.payee)}`,
      });
    }
  }

  for (const [ref, r] of receiptsByRef) {
    if (!settlementsByRef.has(ref)) {
      const nearEnd = upperCut !== null && r.claims.timestampMs >= upperCut;
      if (nearEnd && consecutive && boundary!.nextRefs!.has(ref)) {
        continue;
      }
      if (nearEnd && !consecutive) {
        findings.push({
          code: "boundary-deferred",
          id: r.claims.nonce,
          severity: "warn",
          detail: `receipt nonce=${r.claims.nonce} ref=${ref} sits inside the closing δ (${boundary!.clockSkewMs} ms) and is unmatched; deferred rather than receipt-without-settlement`,
        });
      } else {
        findings.push({
          code: "receipt-without-settlement",
          id: r.claims.nonce,
          detail: `receipt nonce=${r.claims.nonce} ref=${ref} is not on the rail extract`,
        });
      }
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

  const chained = orderByIssuerChain(receipts);
  for (const r of [...chained.ordered, ...chained.leftover]) {
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
    const v = verifiesOrRefusal(() => verifyCheckpoint(cp), cp.coseHex);
    if (!v.ok) {
      findings.push({
        code: "checkpoint-total-mismatch",
        id: `epoch-${cp.claims.epoch}`,
        detail:
          v.refusal !== null
            ? `checkpoint epoch ${cp.claims.epoch} refused: ${v.refusal} - a decoder bound or duplicate key (MUST-T4-18, MUST-T4-19), not a signature verdict`
            : `checkpoint epoch ${cp.claims.epoch} signature failed`,
      });
      continue;
    }
    const inWindow = receiptsInWindow(receipts, cp);
    const inWindowOnChain = receiptsInWindow(orderByIssuerChain(receipts).ordered, cp);
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
    let expectedHead: string | null = null;
    if (inWindowOnChain.length > 0) {
      try {
        expectedHead = receiptHash(inWindowOnChain[inWindowOnChain.length - 1]);
      } catch (err) {
        const name = err instanceof Error && err.message !== "" ? err.message : "unencodable";
        findings.push({
          code: "checkpoint-head-mismatch",
          id: `epoch-${cp.claims.epoch}-head`,
          detail: `checkpoint epoch ${cp.claims.epoch} chain head refused: ${name} - not a signature verdict`,
        });
        continue;
      }
    }
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
  // A named decoder refusal makes the receipt unverifiable, and an
  // unverifiable receipt is left out (MUST-T11-15) - it must not become an
  // uncaught exception that takes the whole audit down with it.
  if (witnessKeyPem === undefined) {
    return verifiesOrRefusal(() => verifyInclusionReceipt(rec), rec.coseHex).ok;
  }
  const pems = typeof witnessKeyPem === "string" ? [witnessKeyPem] : witnessKeyPem;
  return pems.some((pem) => verifiesOrRefusal(() => verifyInclusionReceipt(rec, pem), rec.coseHex).ok);
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
  attestsCheckpoint?: ((cp: SignedCheckpoint) => boolean) | null,
): SignedCheckpoint[] {
  const out: SignedCheckpoint[] = [];
  for (const rec of receipts) {
    if (!inclusionFromPinnedLog(rec, witnessKeyPem) || !rec.checkpoint) {
      continue;
    }
    if (attestsCheckpoint && !attestsCheckpoint(rec.checkpoint)) {
      continue;
    }
    if (statementHashOfCheckpoint(rec.checkpoint) !== rec.statementHash) {
      continue;
    }
    const carried = rec.checkpoint;
    if (!verifiesOrRefusal(() => verifyCheckpoint(carried), carried.coseHex).ok) {
      continue;
    }
    out.push(carried);
  }
  return out;
}

function findTransparencyWitness(
  checkpoints: SignedCheckpoint[],
  inclusionReceipts: InclusionReceipt[],
  witnessKeyPem?: string | readonly string[],
  attestsCheckpoint?: ((cp: SignedCheckpoint) => boolean) | null,
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
    (r) => r.checkpoint && (!attestsCheckpoint || attestsCheckpoint(r.checkpoint)),
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

  // Cannot name who logged these, so they are not accusations - but a real
  // withholding goes silent if stripping the body is enough to bury it. Counted
  // rather than listed: entries with no body are free to produce, and one
  // warning each would let an attacker bury the findings under volume.
  const unattributable = anchoring.filter(
    (rec) => !rec.checkpoint && !presentedHashes.has(rec.statementHash),
  );
  if (unattributable.length > 0) {
    warnings.push({
      code: "witness-entry-unattributable",
      id: "witness",
      detail: `the witness holds ${unattributable.length} statement(s) this chain does not present and which carry no body to say whose they are; first is ${unattributable[0].statementHash}`,
      severity: "warn",
    });
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
 * by it, so anyone holding an honest receipt can append one of their own. An
 * unverified countersignature cannot be attributed to a pinned payee, so it is
 * discarded as approval evidence and reported as a warning. Adding one must
 * not change the audit's fail/pass result.
 */
function findCountersignFindings(input: {
  receipts: SignedReceipt[];
  payeeTrust?: PayeeTrustPins;
  manifest?: SignedManifest;
}): { warnings: Finding[]; findings: Finding[] } {
  const warnings: Finding[] = [];
  const findings: Finding[] = [];
  const countersigned = input.receipts.filter((r) => r.counterCoseHex);
  const approved = new Set<string>();
  for (const r of countersigned) {
    const pinned = input.payeeTrust?.[r.claims.payee];
    const v = verifiesOrRefusal(() => verifyCounterSignature(r), r.counterCoseHex);
    if (!v.ok) {
      warnings.push({
        code: "countersign-bad",
        id: r.claims.nonce,
        severity: "warn",
        detail:
          v.refusal !== null
            ? `payee countersignature on nonce=${r.claims.nonce} refused: ${v.refusal} - a decoder bound or duplicate key (MUST-T4-18, MUST-T4-19), not a signature verdict; unattributable, discarded`
            : `payee countersignature on nonce=${r.claims.nonce} failed verify; unattributable, discarded`,
      });
      continue;
    }
    if (pinned === undefined) {
      continue;
    }
    const carried = r.payeePublicKeyPem;
    if (carried === undefined || !sameSpkiKey(carried, pinned)) {
      warnings.push({
        code: "countersign-key-mismatch",
        id: r.claims.nonce,
        severity: "warn",
        detail: `the countersignature on nonce=${r.claims.nonce} is by a key other than the one pinned for payee ${r.claims.payee}, so it is not that payee approving the payment; unattributable, discarded`,
      });
      continue;
    }
    approved.add(r.claims.nonce);
  }
  // Naming a payee key is the verifier saying it expects that payee's word on
  // these payments. A garbage or foreign countersignature is not that word, so
  // the expectation stays open - otherwise appending junk would delete the
  // question the pin asked.
  for (const r of input.receipts) {
    if (isSettled(r) && input.payeeTrust?.[r.claims.payee] !== undefined && !approved.has(r.claims.nonce)) {
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
  const acceptance = input.manifest?.body.acceptanceCriteriaHash;
  if (typeof acceptance === "string") {
    for (const r of input.receipts) {
      if (!approved.has(r.claims.nonce)) {
        continue;
      }
      const delivered = countersignDeliveredHashHex(r);
      if (delivered !== null && delivered !== acceptance) {
        findings.push({
          code: "delivery-mismatch",
          id: r.claims.nonce,
          detail: `attributable countersignature on nonce=${r.claims.nonce} deliveredHash ${delivered} != manifest acceptanceCriteriaHash ${acceptance}`,
        });
      }
    }
  }
  return { warnings, findings };
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
  /**
   * A Trade Manifest the caller was presented with. Absent is a no-manifest
   * deployment, not a gap. Present without a pin, or with a pin that cannot be
   * read or does not match, is the thing that must not pass in silence.
   */
  manifest?: SignedManifest;
  /** Publisher key the verifier holds out of band. Same shape as issuerTrust. */
  manifestTrust?: IssuerTrustPin;
  /** Checkpoint inclusion receipts. Absent ⇒ today's behaviour. Present ⇒ T11 witness is configured. */
  inclusionReceipts?: InclusionReceipt[];
  /** Following rail window; closes `boundary-deferred` records that match it. */
  nextExtract?: SignedRailExtract;
  /**
   * Layer-2 pair (RFC 9942 §5.2.1): candidate registered statement bytes +
   * inclusion proof. Both present ⇒ proof is applied. Omitted ⇒ named as
   * not exercised when inclusion receipts were supplied.
   */
  layer2?: {
    candidateStatementHex: string;
    inclusionProof?: InclusionProof;
  };
};

/** Largest honest audit in this suite is 41 receipts (case 86). 100× that. */
export const AUDIT_MAX_RECEIPTS = 4_096;
/** Same bound for rail rows. A window that large is a different product. */
export const AUDIT_MAX_SETTLEMENTS = 4_096;
/** Epochs in one report. */
export const AUDIT_MAX_CHECKPOINTS = 256;
/** Inclusion receipts; case 79 uses 51. */
export const AUDIT_MAX_INCLUSIONS = 4_096;

function assertAuditBounds(input: AuditInput): void {
  if (input.receipts.length > AUDIT_MAX_RECEIPTS) {
    throw new Error("audit-too-large");
  }
  if (input.checkpoints.length > AUDIT_MAX_CHECKPOINTS) {
    throw new Error("audit-too-large");
  }
  const settlements = input.extract ? input.extract.body.settlements : (input.settlements ?? []);
  if (settlements.length > AUDIT_MAX_SETTLEMENTS) {
    throw new Error("audit-too-large");
  }
  if ((input.inclusionReceipts?.length ?? 0) > AUDIT_MAX_INCLUSIONS) {
    throw new Error("audit-too-large");
  }
}

function pushHashRefusal(
  findings: Finding[],
  field: Parameters<typeof hashClaimRefusal>[0],
  value: unknown,
  id: string,
  nullable = false,
): void {
  const code = hashClaimRefusal(field, value, nullable);
  if (code) {
    findings.push({
      code: code as FindingCode,
      id,
      detail: `${field} ${JSON.stringify(value)} is not 64-character lowercase hex SHA-256`,
    });
  }
}

function findMalformedHashClaims(input: AuditInput): Finding[] {
  const findings: Finding[] = [];
  for (const r of input.receipts) {
    pushHashRefusal(findings, "policyHash", r.claims.policyHash, r.claims.nonce);
    pushHashRefusal(findings, "manifestHash", r.claims.manifestHash, r.claims.nonce, true);
    pushHashRefusal(findings, "prevReceiptHash", r.claims.prevReceiptHash, r.claims.nonce, true);
  }
  for (const cp of input.checkpoints) {
    const id = `epoch-${cp.claims.epoch}`;
    pushHashRefusal(findings, "chainHeadHash", cp.claims.chainHeadHash, id, true);
    pushHashRefusal(findings, "prevCheckpointHash", cp.claims.prevCheckpointHash, id, true);
  }
  if (input.manifest) {
    pushHashRefusal(
      findings,
      "acceptanceCriteriaHash",
      input.manifest.body.acceptanceCriteriaHash,
      "manifest",
    );
    pushHashRefusal(findings, "ap2MandateHash", input.manifest.body.ap2MandateHash ?? null, "manifest", true);
  }
  return findings;
}

export function audit(input: AuditInput): AuditReport {
  assertAuditBounds(input);
  const findings: Finding[] = [...findMalformedHashClaims(input)];
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

    const signatureVerifies = input.trust
      ? verifyRailExtract(input.extract, input.trust.publicKeyPem)
      : verifyRailExtract(input.extract);

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

    // When the signature does not verify, the encoder may be the one that
    // refused (a non-finite number is a document RFC 8785 has no encoding
    // for). The refusal keeps its name in the report, the same split the
    // COSE side makes: "signature failed" for a refused body would leave an
    // operator unable to tell a limit from a forgery.
    const encodeRefusal = signatureVerifies ? null : railExtractEncodeRefusal(input.extract);

    if (!input.trust) {
      warnings.push({
        code: "unauthenticated-extract",
        id: "extract",
        detail: signatureVerifies
          ? "no verifier-supplied rail key; the signature proves internal consistency, not that the named rail produced the extract, so the completeness guarantee is conditional"
          : encodeRefusal !== null
            ? `rail extract body was refused: ${encodeRefusal} - not a signature verdict; no rail key was pinned and the completeness guarantee is conditional`
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
          detail:
            encodeRefusal !== null
              ? `a rail key was pinned but the extract body was refused: ${encodeRefusal} - not a signature verdict`
              : "a rail key was pinned but the extract signature does not verify against the key it carries",
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

  // A presented manifest is a fifth signed object. No-manifest is a deployment
  // choice and is silent here. Presented-but-unauthenticated is the bypass.
  if (input.manifest) {
    if (!input.manifestTrust) {
      warnings.push({
        code: "unauthenticated-manifest",
        id: "manifest",
        detail:
          "no verifier-supplied manifest key; the signature proves internal consistency, not that the named party published the terms, so the completeness guarantee is conditional",
        severity: "warn",
      });
    } else {
      const { usable: manifestDers, unreadable } = pinnedKeys(input.manifestTrust.publicKeyPem);
      if (unreadable > 0 || manifestDers.length === 0) {
        findings.push({
          code: "trust-key-unreadable",
          id: "manifest",
          detail:
            manifestDers.length === 0
              ? "no pinned manifest key could be read as a public key; supply PEM or base64 SPKI"
              : `${unreadable} of the pinned manifest keys could not be read as a public key; the rest are still in use`,
        });
      }
      if (manifestDers.length > 0) {
        const pems =
          typeof input.manifestTrust.publicKeyPem === "string"
            ? [input.manifestTrust.publicKeyPem]
            : input.manifestTrust.publicKeyPem;
        const answers = pems.some(
          (pem) => toSpkiDer(pem) !== null && verifiesOrRefusal(() => verifyManifest(input.manifest!, pem), input.manifest!.coseHex).ok,
        );
        if (!answers) {
          const refusal = coseDecodeRefusalHex(input.manifest.coseHex);
          findings.push({
            code: "manifest-key-mismatch",
            id: "manifest",
            detail:
              refusal !== null
                ? `the presented Trade Manifest was refused: ${refusal} - a decoder bound or duplicate key (MUST-T4-18, MUST-T4-19), not a key verdict`
                : "the presented Trade Manifest is signed by a key other than the pinned manifest key, or does not verify against it",
          });
        }
      }
    }

    // Attribution answers who published the terms. It does not answer which
    // spends were made under them, and those are two different questions. A
    // manifest whose hash appears on no presented receipt describes some
    // other window; presenting it beside a set of noManifest receipts would
    // otherwise leave a report that reads as terms-backed and is not.
    const presentedHash = manifestHash(input.manifest);
    const covered = input.receipts.some((r) => r.claims.manifestHash === presentedHash);
    if (!covered) {
      warnings.push({
        code: "manifest-covers-no-receipt",
        id: "manifest",
        detail:
          "the presented Trade Manifest is referenced by no presented receipt; it states terms nothing here was spent under, so the completeness guarantee is conditional",
        severity: "warn",
      });
    }

    // Naming a manifest is not obeying one. The terms walk itself sits
    // after the issuer pin is resolved: a charge needs a set the
    // verifier can vouch for, and that set is not ready here. Cover
    // stays on the presented list; it is a name, not a charge.
  }

  // The rail pin answers who reported the settlements. It says nothing about who
  // was entitled to issue receipts for them, and a receipt verified against the
  // key it carries only proves it is internally consistent. So the receipts that
  // count as coverage are the ones answering to a second root, stated out of band.
  let attested = input.receipts;
  // Null while no issuer key was stated: there is no attested/unattested split
  // to make, and every check falls back to the whole submitted list.
  let attestsCheckpoint: ((cp: SignedCheckpoint) => boolean) | null = null;
  let issuerPins: string[] = [];
  // True only when a pin was supplied and at least one key in it could be read.
  let issuerPinUsable = false;
  if (!input.issuerTrust) {
    // Only worth saying when the audit actually leans on an issued object. An
    // audit with no receipts and no checkpoints rests on the extract alone, and
    // warning about a root it never used would cheapen the warning.
    if (input.receipts.length > 0 || input.checkpoints.length > 0) {
      warnings.push({
        code: "unauthenticated-issuer",
        id: "issuer",
        detail:
          "no verifier-supplied issuer key; receipt and checkpoint signatures prove internal consistency, not that the named issuer produced them. Without one there is no way to tell a receipt from this issuer apart from any other, so every receipt submitted is weighed as one set and the completeness guarantee is conditional",
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
      issuerPins = pinPemsOf(input.issuerTrust.publicKeyPem).filter((pem) => toSpkiDer(pem) !== null);
      attestsCheckpoint = (cp) => checkpointAttestedByPins(cp, issuerPins);
      issuerPinUsable = issuerDers.length > 0;
      // Naming a mismatch when the pin itself could not be read would blame the
      // receipts for the verifier's own broken setting - and every receipt at
      // once. `trust-key-unreadable` above already says what went wrong; nothing
      // is attested, so the settlements come back uncovered on their own.
      const namesMismatches = issuerDers.length > 0;
      // Attestation is pin-under-signature (K2). The carried PEM is not the
      // identity source; a kid match without a pin-valid signature still drops.
      const rejected = namesMismatches
        ? input.receipts.filter((r) => !receiptAttestedByPins(r, issuerPins))
        : [];
      const foreign = rejected.filter((r) => !receiptBelongsToPin(r, issuerPins));
      const NAMED_LIMIT = 10;
      if (foreign.length > NAMED_LIMIT) {
        findings.push({
          code: "issuer-key-mismatch",
          id: "receipts",
          detail: `${foreign.length} receipts are signed by a key other than the pinned issuer key, so none of them is coverage for any settlement; first is nonce=${foreign[0].claims.nonce}`,
        });
      } else {
        for (const r of foreign) {
          findings.push({
            code: "issuer-key-mismatch",
            id: r.claims.nonce,
            detail: `receipt nonce=${r.claims.nonce} is signed by a key other than the pinned issuer key, so it is not coverage for ${r.claims.x402PaymentRef ?? "any settlement"}`,
          });
        }
      }
      for (const cp of namesMismatches ? input.checkpoints : []) {
        if (!attestsCheckpoint(cp)) {
          findings.push({
            code: "issuer-key-mismatch",
            id: `epoch-${cp.claims.epoch}`,
            detail: `checkpoint epoch ${cp.claims.epoch} is signed by a key other than the pinned issuer key`,
          });
        }
      }
      attested = input.receipts.filter((r) => receiptAttestedByPins(r, issuerPins));
      for (const r of attested) {
        const verifying = issuerPins.filter((pem) => verifyReceiptUnderPin(r, pem));
        if (verifying.length > 0 && !verifying.some((pem) => sameSpkiKey(r.publicKeyPem, pem))) {
          warnings.push({
            code: "carried-key-mismatch",
            id: r.claims.nonce,
            severity: "warn",
            detail: `receipt nonce=${r.claims.nonce} verifies under a pinned issuer key but the carried publicKeyPem is not that key`,
          });
        }
      }
      for (const cp of input.checkpoints.filter((c) => attestsCheckpoint!(c))) {
        const verifying = issuerPins.filter((pem) => verifyCheckpointUnderPin(cp, pem));
        if (verifying.length > 0 && !verifying.some((pem) => sameSpkiKey(cp.publicKeyPem, pem))) {
          warnings.push({
            code: "carried-key-mismatch",
            id: `epoch-${cp.claims.epoch}`,
            severity: "warn",
            detail: `checkpoint epoch ${cp.claims.epoch} verifies under a pinned issuer key but the carried publicKeyPem is not that key`,
          });
        }
      }
    }
  }
  // Presentation order carries no weight. Rebuild the attested bag from the
  // prevReceiptHash links so every later walk (chain head, window coverage,
  // settlement match order) sees the same issuer order.
  {
    const chained = orderByIssuerChain(attested);
    attested = [...chained.ordered, ...chained.leftover];
  }

  // A terms mismatch is a charge: this receipt broke the terms it named.
  // The same split as receiptRef clashes. With a usable pin the walk is
  // attested, so a foreign receipt never invents a verdict. Without one
  // the departure is said out loud, but not as a finding against a set
  // the verifier cannot vouch for. Cover, above, stays on the presented
  // list: silencing a name is not the same as inventing a charge.
  // Moved below the pin on purpose. Lifting attested above the manifest
  // block would also move issuer-key-mismatch before cover and the
  // manifest-key checks; those checks do not need the pin, and their
  // order is the order they are asked.
  if (input.manifest) {
    const presentedHash = manifestHash(input.manifest);
    const terms = input.manifest.body;
    for (const r of issuerPinUsable ? attested : input.receipts) {
      if (r.claims.manifestHash !== presentedHash) continue;
      const broken: string[] = [];
      if (r.claims.amount !== terms.amount) {
        broken.push(`amount ${r.claims.amount} against manifest ${terms.amount}`);
      }
      if (r.claims.currency !== terms.currency) {
        broken.push(`currency ${r.claims.currency} against manifest ${terms.currency}`);
      }
      if (r.claims.timestampMs > terms.expiresAtMs) {
        broken.push(`settled at ${r.claims.timestampMs} after the manifest expired at ${terms.expiresAtMs}`);
      }
      if (typeof terms.payee === "string" && r.claims.payee !== terms.payee) {
        broken.push(`payee ${JSON.stringify(r.claims.payee)} against manifest ${JSON.stringify(terms.payee)}`);
      }
      if (broken.length > 0) {
        const charge = {
          code: "manifest-terms-mismatch" as const,
          id: r.claims.x402PaymentRef ?? r.claims.nonce,
          detail: `the receipt carries the hash of this Trade Manifest but departs from it: ${broken.join("; ")}. A gate applying MUST-T8-2 and MUST-T3-3 would have refused this payment`,
        };
        if (issuerPinUsable) findings.push(charge);
        else warnings.push({ ...charge, severity: "warn" });
      }
    }
  }

  // Ref membership wins: a receipt whose ref appears on this extract is
  // reconciled against it even when its own timestampMs sits outside the
  // window. The timestamp sieve applies only to receipts the extract does
  // not name (K5).
  const extractRefs = new Set(reconciled.map((s) => s.ref));
  const inScope = input.extract
    ? attested.filter((r) => {
        const ref = receiptRef(r);
        if (ref !== null && extractRefs.has(ref)) {
          return true;
        }
        return (
          r.claims.timestampMs >= input.extract!.body.windowStartMs &&
          r.claims.timestampMs < input.extract!.body.windowEndMs
        );
      })
    : attested;

  // Self-consistency is a question about the receipts this verifier accepts. Run
  // it over everything submitted and an attacker mints a receipt claiming a rail
  // ref the honest issuer already used, and the duplicate lands on the honest
  // set. Where there is no accepted set - no issuer key, or one nothing could be
  // read from - the submitted set is the only thing there is to be consistent
  // about, and its clashes are worth saying out loud.
  // Two questions with two different subjects. What a receipt says about itself
  // is asked of everything submitted; what two receipts say about each other is
  // asked of the set this verifier accepts, or of everything when there is no
  // accepted set to speak of.
  findings.push(...findReceiptDefects(input.receipts));
  // With an issuer key a clash is between receipts the verifier accepts, so it
  // is a failure. Without one nothing distinguishes a submitted receipt from any
  // other, so the same clash cannot be pinned on anyone - said out loud, but not
  // as a verdict against a set the verifier cannot vouch for.
  for (const clash of findReceiptRefClashes(issuerPinUsable ? attested : input.receipts)) {
    if (issuerPinUsable) {
      findings.push(clash);
    } else {
      warnings.push({ ...clash, severity: "warn" });
    }
  }
  const nextOk = Boolean(
    input.nextExtract &&
      (input.trust
        ? verifyRailExtract(input.nextExtract, input.trust.publicKeyPem)
        : verifyRailExtract(input.nextExtract)),
  );
  const settlementBoundary: SettlementBoundary | undefined = input.extract
    ? {
        windowStartMs: input.extract.body.windowStartMs,
        windowEndMs: input.extract.body.windowEndMs,
        clockSkewMs: clockSkewOf(input.extract.body),
        ...(nextOk
          ? { nextRefs: new Set(input.nextExtract!.body.settlements.map((s) => s.ref)) }
          : {}),
      }
    : undefined;
  findings.push(...findSettlementMatches(inScope, reconciled, settlementBoundary));
  const manifestPayeeBound = Boolean(input.manifest && typeof input.manifest.body.payee === "string");
  const beneficiaryBound = reconciled.some((s) => typeof s.beneficiary === "string");
  if (input.extract && !manifestPayeeBound && !beneficiaryBound) {
    warnings.push({
      code: "counterparty-unbound",
      id: "counterparty",
      severity: "warn",
      detail:
        "ref/amount/currency closed against the extract; counterparty identity was not bound",
    });
  }
  // Every check below reasons about what the issuer published. Walking the whole
  // submitted list instead means one receipt from a key the verifier already
  // rejected writes "the checkpoint lied" and "the chain is broken" against an
  // honest issuer - noise that argues for switching the pin off.
  const attestedCheckpoints = attestsCheckpoint
    ? input.checkpoints.filter((cp) => attestsCheckpoint!(cp))
    : input.checkpoints;
  const countersign = findCountersignFindings({
    receipts: issuerPinUsable ? attested : input.receipts,
    payeeTrust: input.payeeTrust,
    manifest: input.manifest,
  });
  warnings.push(...countersign.warnings);
  findings.push(...countersign.findings);
  const chainWalk = issuerPinUsable
    ? input.receipts.filter(
        (r) => receiptAttestedByPins(r, issuerPins) || receiptBelongsToPin(r, issuerPins),
      )
    : attested;
  const chain = findReceiptChainBreak(chainWalk, issuerPinUsable ? issuerPins : undefined);
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
        attestsCheckpoint,
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
        attestsCheckpoint,
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

  if (input.layer2) {
    const proof = input.layer2.inclusionProof;
    if (proof === undefined) {
      findings.push({
        code: "witness-inclusion-invalid",
        id: "witness-layer2",
        detail: "layer-2 inclusion input was presented without an inclusion proof",
      });
    } else {
      try {
        const candidate = Buffer.from(input.layer2.candidateStatementHex, "hex");
        if (candidate.length === 0 && input.layer2.candidateStatementHex.length > 0) {
          throw new Error("hex");
        }
        const leaf = createHash("sha256").update(candidate).digest("hex");
        const root = applyInclusionProof(leaf, proof);
        const pinned = input.witnessTrust?.publicKeyPem;
        const hit = (input.inclusionReceipts ?? []).some((rec) => {
          if (rec.statementHash !== leaf || rec.treeHead !== root || proof.leafIndex !== rec.index) {
            return false;
          }
          return inclusionFromPinnedLog(rec, pinned);
        });
        if (!hit) {
          findings.push({
            code: "witness-inclusion-invalid",
            id: "witness-layer2",
            detail:
              "candidate statement bytes and inclusion proof do not reproduce a witness-signed tree head",
          });
        }
      } catch {
        findings.push({
          code: "witness-inclusion-invalid",
          id: "witness-layer2",
          detail: "layer-2 inclusion input could not be applied",
        });
      }
    }
  } else if (input.inclusionReceipts && input.inclusionReceipts.length > 0) {
    warnings.push({
      code: "witness-inclusion-not-exercised",
      id: "witness-layer2",
      severity: "warn",
      detail: "witness attested the statement hash; log membership was not proven",
    });
  }

  // A signed redaction is honest but unverifiable: say so, and drop the claim to
  // conditional. Only a checkpoint that verifies gets to make this claim — an
  // unverifiable one has already been reported above.
  for (const cp of attestedCheckpoints) {
    if (cp.claims.totals === null && verifiesOrRefusal(() => verifyCheckpoint(cp), cp.coseHex).ok) {
      warnings.push({
        code: "checkpoint-totals-redacted",
        id: `epoch-${cp.claims.epoch}`,
        detail: `checkpoint epoch ${cp.claims.epoch} was signed with its totals withheld; totals comparison skipped`,
        severity: "warn",
      });
    }
  }

  for (const f of findings.filter((item) => item.severity === "warn")) {
    warnings.push(f);
  }
  const hard = findings.filter((f) => f.severity !== "warn");
  const missing = hard.filter((f) => f.code === "settlement-without-receipt");
  const summary =
    hard.length === 0
      ? "audit: balanced"
      : missing.length > 0
        ? `audit: ${missing.length} settlement without receipt → FAIL`
        : `audit: ${hard.length} finding(s) → FAIL`;
  // A scope record (`counterparty-unbound`) names what was not bound; it is
  // not a doubt about the evidence that was authenticated.
  const scopeOnly = new Set<FindingCode>(["counterparty-unbound"]);
  const guaranteeWarnings = warnings.filter((w) => !scopeOnly.has(w.code));
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
      f.code === "manifest-key-mismatch",
  );
  return {
    ok: hard.length === 0,
    findings: hard,
    warnings,
    guarantee: guaranteeWarnings.length === 0 && !doubtedEvidence ? "unconditional" : "conditional",
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
