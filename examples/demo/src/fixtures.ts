import { PolicyEngine } from "@cedulon/core";
import { audit, type Finding } from "@cedulon/audit";
import {
  buildCheckpointClaims,
  checkpointHash,
  signCheckpoint,
  type SignedCheckpoint,
} from "@cedulon/checkpoint";
import { fixtureEd25519Pems } from "@cedulon/cose";
import { receiptHash, type SignedReceipt } from "@cedulon/receipts";
import {
  RailLedger,
  bypassRailOnly,
  gatedSettleWithLedger,
  type AdapterKeys,
  type RailSettlement,
} from "@cedulon/x402-adapter";

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
  totals: Record<string, string> | null;
  chainHead: string | null;
  hash: string;
};

export type PanelFixture = {
  scenario: "balanced" | "bypass";
  ok: boolean;
  banner: string;
  summary: string;
  receipts: PanelReceipt[];
  gapAfter: number | null;
  settlements: RailSettlement[];
  checkpoints: PanelCheckpoint[];
  findings: Finding[];
};

const NOW = 1_700_000_000_000;

function signerKeys(): { privateKeyPem: string; publicKeyPem: string } {
  return fixtureEd25519Pems();
}

function engine(): PolicyEngine {
  return new PolicyEngine({
    maxAmount: 10n,
    maxCumulative: 30n,
    maxPayments: 3,
    windowMs: 3_600_000,
    allowedPayees: ["payee-1"],
    allowedCurrencies: ["USD"],
  });
}

function toPanelReceipt(r: SignedReceipt): PanelReceipt {
  return {
    payer: r.claims.payer,
    payee: r.claims.payee,
    amount: r.claims.amount,
    currency: r.claims.currency,
    nonce: r.claims.nonce,
    ref: r.claims.x402PaymentRef,
    hash: receiptHash(r),
    prevHash: r.claims.prevReceiptHash,
  };
}

function toPanelCheckpoint(cp: SignedCheckpoint): PanelCheckpoint {
  return {
    epoch: cp.claims.epoch,
    startMs: cp.claims.startMs,
    endMs: cp.claims.endMs,
    receiptCount: cp.claims.receiptCount,
    totals: cp.claims.totals,
    chainHead: cp.claims.chainHeadHash,
    hash: checkpointHash(cp),
  };
}

function settlePair(ledger: RailLedger, adapterKeys: AdapterKeys): SignedReceipt[] {
  const receipts: SignedReceipt[] = [];
  let prev: string | null = null;
  const pdp = engine();
  for (let i = 0; i < 2; i += 1) {
    const result = gatedSettleWithLedger(
      pdp,
      {
        req: {
          amount: 1n,
          currency: "USD",
          payee: "payee-1",
          nonce: `ok-${i}`,
          nowMs: NOW + i,
          tool: "spend",
        },
        payer: "payer-1",
        paymentHeader: "mock",
      },
      adapterKeys,
      NOW + i,
      ledger,
      prev,
    );
    if (result.status !== 200) {
      throw new Error("fixture-settle-failed");
    }
    receipts.push(result.receipt);
    prev = receiptHash(result.receipt);
  }
  return receipts;
}

function pack(
  scenario: "balanced" | "bypass",
  receipts: SignedReceipt[],
  checkpoints: SignedCheckpoint[],
  settlements: RailSettlement[],
  gapAfter: number | null,
): PanelFixture {
  const report = audit({ receipts, checkpoints, settlements });
  return {
    scenario,
    ok: report.ok,
    banner: report.ok ? "BALANCED" : "1 SETTLEMENT WITHOUT RECEIPT → FAIL",
    summary: report.summary,
    receipts: receipts.map(toPanelReceipt),
    gapAfter,
    settlements,
    checkpoints: checkpoints.map(toPanelCheckpoint),
    findings: report.findings,
  };
}

export function exportBalanced(): PanelFixture {
  const signer = signerKeys();
  const adapterKeys: AdapterKeys = {
    receiptPrivatePem: signer.privateKeyPem,
    receiptPublicPem: signer.publicKeyPem,
  };
  const ledger = new RailLedger();
  const receipts = settlePair(ledger, adapterKeys);
  const checkpoint = signCheckpoint(
    buildCheckpointClaims(1, receipts, NOW, NOW + 10, null),
    signer.privateKeyPem,
    signer.publicKeyPem,
  );
  return pack("balanced", receipts, [checkpoint], ledger.extract(), null);
}

export function exportBypass(): PanelFixture {
  const signer = signerKeys();
  const adapterKeys: AdapterKeys = {
    receiptPrivatePem: signer.privateKeyPem,
    receiptPublicPem: signer.publicKeyPem,
  };
  const ledger = new RailLedger();
  const receipts = settlePair(ledger, adapterKeys);
  bypassRailOnly(
    {
      req: {
        amount: 7n,
        currency: "USD",
        payee: "payee-1",
        nonce: "hidden",
        nowMs: NOW + 2,
        tool: "spend",
      },
      payer: "payer-1",
    },
    NOW + 2,
    ledger,
  );
  const checkpoint = signCheckpoint(
    buildCheckpointClaims(1, receipts, NOW, NOW + 10, null),
    signer.privateKeyPem,
    signer.publicKeyPem,
  );
  return pack("bypass", receipts, [checkpoint], ledger.extract(), receipts.length - 1);
}

export function stableStringify(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}
