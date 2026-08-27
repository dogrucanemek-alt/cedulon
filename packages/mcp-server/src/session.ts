import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname } from "node:path";
import { audit, type Finding } from "@cedulon/audit";
import {
  buildCheckpointClaims,
  checkpointHash,
  signCheckpoint,
  type SignedCheckpoint,
} from "@cedulon/checkpoint";
import { PolicyEngine, policyDocument, type Policy } from "@cedulon/core";
import { claimsFromCbor, generateReceiptKeys, receiptHash, verifyCounterSignature, verifyReceipt, type SignedReceipt } from "@cedulon/receipts";
import { decodeCoseSign1 } from "@cedulon/cose";
import {
  RailLedger,
  gatedSettleWithLedger,
  type AdapterKeys,
  type RailSettlement,
} from "@cedulon/x402-adapter";

// Read from package.json rather than restating it: the version reaches clients
// through `initialize` and through `cedulon_status`, and a second hand-written
// copy drifts the moment a release bumps only one of them.
export const MCP_SERVER_VERSION: string = createRequire(import.meta.url)("../package.json").version;

export type SpendArgs = {
  amount: string;
  currency: string;
  payee: string;
  nonce: string;
  tool?: string;
};

export type SpendOk = { ok: true; receipt: SignedReceipt };
export type SpendDeny = { ok: false; reason: string };
export type SpendOutcome = SpendOk | SpendDeny;

export type AuditArgs = {
  extraSettlements?: RailSettlement[];
};

export type StatusReport = {
  version: string;
  policy: Record<string, unknown>;
  receiptCount: number;
  chainHead: string | null;
};

export type PanelReceipt = {
  payer: string;
  payee: string;
  amount: string;
  currency: string;
  nonce: string;
  ref: string | null;
  hash: string;
  prevHash: string | null;
};

export type PanelCheckpoint = {
  epoch: number;
  startMs: number;
  endMs: number;
  receiptCount: number;
  /** `null` when the checkpoint was signed with its totals withheld. */
  totals: Record<string, string> | null;
  chainHead: string | null;
  hash: string;
};

export type LedgerExport = {
  scenario: "balanced" | "bypass";
  ok: boolean;
  banner: string;
  summary: string;
  receipts: PanelReceipt[];
  gapAfter: number | null;
  settlements: RailSettlement[];
  checkpoints: PanelCheckpoint[];
  findings: Finding[];
  // A balance means nothing without the conditions it was reached under, so
  // the export carries them rather than leaving the reader to assume.
  guarantee: "unconditional" | "conditional";
  warnings: Finding[];
};

export type VerifyArgs = {
  receipt?: SignedReceipt;
  coseHex?: string;
  publicKeyPem?: string;
  counterCoseHex?: string;
  payeePublicKeyPem?: string;
};

type Persisted = {
  version: 1;
  nextDecision: number;
  keys: AdapterKeys;
  receipts: SignedReceipt[];
  settlements: RailSettlement[];
  checkpoints: SignedCheckpoint[];
  usedNonces: string[];
  consumedDecisions: string[];
  counters: { windowStartMs: number; allowedCount: number; allowedSum: string };
};

function envOr(name: string, fallback: string): string {
  const v = process.env[name];
  return v === undefined || v === "" ? fallback : v;
}

function optionalList(name: string, fallback: readonly string[] | undefined): readonly string[] | undefined {
  const v = process.env[name];
  if (v === undefined) {
    return fallback;
  }
  if (v === "" || v === "*") {
    return undefined;
  }
  return v.split(",").map((s) => s.trim()).filter(Boolean);
}

export function policyFromEnv(): Policy {
  return {
    maxAmount: BigInt(envOr("CEDULON_MAX_AMOUNT", "10")),
    maxCumulative: BigInt(envOr("CEDULON_MAX_CUMULATIVE", "30")),
    maxPayments: Number(envOr("CEDULON_MAX_PAYMENTS", "3")),
    windowMs: Number(envOr("CEDULON_WINDOW_MS", "3600000")),
    allowedPayees: optionalList("CEDULON_ALLOWED_PAYEES", ["payee-1"]),
    allowedCurrencies: optionalList("CEDULON_ALLOWED_CURRENCIES", ["USD"]),
    allowedTools: optionalList("CEDULON_ALLOWED_TOOLS", undefined),
  };
}

export class CedulonSession {
  readonly engine: PolicyEngine;
  readonly ledger = new RailLedger();
  readonly keys: AdapterKeys;
  readonly receipts: SignedReceipt[] = [];
  checkpoints: SignedCheckpoint[] = [];
  readonly payer: string;
  private readonly statePath: string | null;

  constructor(opts?: { policy?: Policy; keys?: AdapterKeys; statePath?: string | null; payer?: string }) {
    this.payer = opts?.payer ?? envOr("CEDULON_PAYER", "payer-1");
    this.statePath = opts?.statePath !== undefined ? opts.statePath : process.env.CEDULON_STATE_PATH || null;
    this.engine = new PolicyEngine(opts?.policy ?? policyFromEnv());
    const generated = generateReceiptKeys();
    this.keys = opts?.keys ?? {
      receiptPrivatePem: generated.privateKeyPem,
      receiptPublicPem: generated.publicKeyPem,
    };
    if (this.statePath) {
      this.load();
    }
  }

  spend(args: SpendArgs, nowMs = Date.now()): SpendOutcome {
    const prev = this.receipts.length === 0 ? null : receiptHash(this.receipts[this.receipts.length - 1]);
    const result = gatedSettleWithLedger(
      this.engine,
      {
        req: {
          amount: BigInt(args.amount),
          currency: args.currency,
          payee: args.payee,
          nonce: args.nonce,
          nowMs,
          tool: args.tool ?? "spend",
        },
        payer: this.payer,
        paymentHeader: "mock",
      },
      this.keys,
      nowMs,
      this.ledger,
      prev,
    );
    if (result.status !== 200) {
      return { ok: false, reason: result.reason };
    }
    this.receipts.push(result.receipt);
    this.rebuildCheckpoint(nowMs);
    this.save();
    return { ok: true, receipt: result.receipt };
  }

  audit(args: AuditArgs = {}) {
    const settlements = [...this.ledger.extract(), ...(args.extraSettlements ?? [])];
    return audit({
      receipts: this.receipts,
      checkpoints: this.checkpoints,
      settlements,
    });
  }

  status(): StatusReport {
    return {
      version: MCP_SERVER_VERSION,
      policy: policyDocument(this.engine.policy),
      receiptCount: this.receipts.length,
      chainHead: this.receipts.length === 0 ? null : receiptHash(this.receipts[this.receipts.length - 1]),
    };
  }

  exportLedger(): LedgerExport {
    const report = this.audit();
    const gap = report.findings.find((f) => f.code === "settlement-without-receipt");
    return {
      scenario: report.ok ? "balanced" : "bypass",
      ok: report.ok,
      banner: report.ok ? "BALANCED" : report.summary,
      summary: report.summary,
      receipts: this.receipts.map((r) => ({
        payer: r.claims.payer,
        payee: r.claims.payee,
        amount: r.claims.amount,
        currency: r.claims.currency,
        nonce: r.claims.nonce,
        ref: r.claims.x402PaymentRef,
        hash: receiptHash(r),
        prevHash: r.claims.prevReceiptHash,
      })),
      gapAfter: gap ? Math.max(this.receipts.length - 1, 0) : null,
      settlements: this.ledger.extract(),
      checkpoints: this.checkpoints.map((cp) => ({
        epoch: cp.claims.epoch,
        startMs: cp.claims.startMs,
        endMs: cp.claims.endMs,
        receiptCount: cp.claims.receiptCount,
        totals: cp.claims.totals,
        chainHead: cp.claims.chainHeadHash,
        hash: checkpointHash(cp),
      })),
      findings: report.findings,
      guarantee: report.guarantee,
      warnings: report.warnings,
    };
  }

  verify(args: VerifyArgs): { ok: boolean; receipt: boolean; countersignature: boolean | null } {
    const signed = receiptFromArgs(args);
    const receiptOk = verifyReceipt(signed);
    if (!signed.counterCoseHex) {
      return { ok: receiptOk, receipt: receiptOk, countersignature: null };
    }
    const counterOk = verifyCounterSignature(signed);
    return { ok: receiptOk && counterOk, receipt: receiptOk, countersignature: counterOk };
  }

  private rebuildCheckpoint(nowMs: number): void {
    if (this.receipts.length === 0) {
      this.checkpoints = [];
      return;
    }
    const startMs = this.receipts[0].claims.timestampMs;
    const last = this.receipts[this.receipts.length - 1].claims.timestampMs;
    const endMs = Math.max(last + 1, nowMs + 1);
    this.checkpoints = [
      signCheckpoint(
        buildCheckpointClaims(1, this.receipts, startMs, endMs, null),
        this.keys.receiptPrivatePem,
        this.keys.receiptPublicPem,
      ),
    ];
  }

  private load(): void {
    if (!this.statePath) {
      return;
    }
    let raw: string;
    try {
      raw = readFileSync(this.statePath, "utf8");
    } catch {
      return;
    }
    const parsed = JSON.parse(raw) as Persisted;
    if (parsed.version !== 1) {
      throw new Error("cedulon-state-version");
    }
    this.keys.receiptPrivatePem = parsed.keys.receiptPrivatePem;
    this.keys.receiptPublicPem = parsed.keys.receiptPublicPem;
    this.receipts.splice(0, this.receipts.length, ...parsed.receipts);
    this.checkpoints = parsed.checkpoints;
    for (const row of parsed.settlements) {
      this.ledger.record(row);
    }
    for (const n of parsed.usedNonces) {
      this.engine.store.usedNonces.add(n);
    }
    for (const d of parsed.consumedDecisions) {
      this.engine.store.consumedDecisions.add(d);
    }
    this.engine.store.counters = {
      windowStartMs: parsed.counters.windowStartMs,
      allowedCount: parsed.counters.allowedCount,
      allowedSum: BigInt(parsed.counters.allowedSum),
    };
    (this.engine as unknown as { nextDecision: number }).nextDecision = parsed.nextDecision;
  }

  private save(): void {
    if (!this.statePath) {
      return;
    }
    const payload: Persisted = {
      version: 1,
      nextDecision: (this.engine as unknown as { nextDecision: number }).nextDecision,
      keys: this.keys,
      receipts: this.receipts,
      settlements: this.ledger.extract(),
      checkpoints: this.checkpoints,
      usedNonces: [...this.engine.store.usedNonces],
      consumedDecisions: [...this.engine.store.consumedDecisions],
      counters: {
        windowStartMs: this.engine.store.counters.windowStartMs,
        allowedCount: this.engine.store.counters.allowedCount,
        allowedSum: this.engine.store.counters.allowedSum.toString(),
      },
    };
    mkdirSync(dirname(this.statePath), { recursive: true });
    writeFileSync(this.statePath, `${JSON.stringify(payload)}\n`);
  }
}

export function receiptFromArgs(args: VerifyArgs): SignedReceipt {
  if (args.receipt) {
    return args.receipt;
  }
  const coseHex = String(args.coseHex ?? "");
  const publicKeyPem = String(args.publicKeyPem ?? "");
  if (!coseHex || !publicKeyPem) {
    throw new Error("verify-receipt-args");
  }
  const msg = decodeCoseSign1(Buffer.from(coseHex, "hex"));
  return {
    claims: claimsFromCbor(msg.payload),
    signature: Buffer.from(msg.signature).toString("base64"),
    publicKeyPem,
    encoding: "cose",
    coseHex,
    counterCoseHex: args.counterCoseHex,
    payeePublicKeyPem: args.payeePublicKeyPem,
  };
}
