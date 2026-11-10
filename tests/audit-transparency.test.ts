import { TEST_HASH } from "./hash-fixtures.ts";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { audit } from "@cedulon/audit";
import {
  MemoryTransparencyService,
  anchorCheckpoint,
  buildCheckpointClaims,
  redactCheckpointTotals,
  signCheckpoint,
  statementHashOfCheckpoint,
  verifyCheckpoint,
  type SignedCheckpoint,
} from "@cedulon/checkpoint";
import { fixtureEd25519Pems } from "@cedulon/cose";
import {
  generateReceiptKeys,
  receiptHash,
  signReceipt,
  type SignedReceipt,
} from "@cedulon/receipts";
import { generateExtractKeys, signRailExtract, type RailSettlement } from "@cedulon/x402-adapter";

function chainReceipts(
  keys: { privateKeyPem: string; publicKeyPem: string },
  amounts: string[],
): SignedReceipt[] {
  const out: SignedReceipt[] = [];
  let prev: string | null = null;
  amounts.forEach((amount, i) => {
    const signed = signReceipt(
      {
        payer: "p",
        payee: "q",
        amount,
        currency: "USD",
        policyHash: TEST_HASH,
        manifestHash: null,
        noManifest: true,
        x402PaymentRef: `x402-n${i}`,
        timestampMs: 1_700_000_000_000 + i,
        nonce: `n${i}`.padEnd(16, "-"),
        prevReceiptHash: prev,
        outcome: "settled",
      },
      keys.privateKeyPem,
      keys.publicKeyPem,
    );
    out.push(signed);
    prev = receiptHash(signed);
  });
  return out;
}

function settlementsOf(receipts: SignedReceipt[]): RailSettlement[] {
  return receipts.map((r) => ({
    ref: r.claims.x402PaymentRef ?? r.claims.nonce,
    amount: r.claims.amount,
    currency: r.claims.currency,
    timestampMs: r.claims.timestampMs,
  }));
}

function oneCheckpoint(
  keys: { privateKeyPem: string; publicKeyPem: string },
  receipts: SignedReceipt[],
  epoch = 1,
  prev: string | null = null,
): SignedCheckpoint {
  return signCheckpoint(
    buildCheckpointClaims(epoch, receipts, 1_700_000_000_000, 1_700_000_000_010, prev),
    keys.privateKeyPem,
    keys.publicKeyPem,
  );
}

function trustedExtract(
  receipts: SignedReceipt[],
  checkpoints: SignedCheckpoint[],
  extra: Record<string, unknown> = {},
) {
  const ek = generateExtractKeys();
  const settlements = settlementsOf(receipts);
  const extract = signRailExtract(
    {
      accountId: "acct-1",
      railId: "mock-rail",
      windowStartMs: 1_700_000_000_000,
      windowEndMs: 1_700_000_000_010,
      settlements,
    },
    ek.privateKeyPem,
    ek.publicKeyPem,
  );
  return audit({
    receipts,
    checkpoints,
    settlements,
    extract,
    trust: {
      publicKeyPem: ek.publicKeyPem,
      accountId: "acct-1",
      railId: "mock-rail",
      windowStartMs: 1_700_000_000_000,
      windowEndMs: 1_700_000_000_010,
    },
    ...extra,
  });
}

describe("A — transparency witness on the audit path", () => {
  it("RED: checkpoint-withheld when the log has a checkpoint the chain does not present", () => {
    const k = generateReceiptKeys();
    const receipts = chainReceipts(k, ["1"]);
    const presented = oneCheckpoint(k, receipts, 1);
    const withheld = signCheckpoint(
      buildCheckpointClaims(2, receipts, 1_700_000_000_010, 1_700_000_000_020, statementHashOfCheckpoint(presented)),
      k.privateKeyPem,
      k.publicKeyPem,
    );
    const ts = new MemoryTransparencyService(fixtureEd25519Pems());
    const presentedReceipt = anchorCheckpoint(ts, presented);
    const withheldReceipt = anchorCheckpoint(ts, withheld);
    const report = audit({
      receipts,
      checkpoints: [presented],
      settlements: settlementsOf(receipts),
      inclusionReceipts: [presentedReceipt, withheldReceipt],
      witnessTrust: { publicKeyPem: ts.publicKeyPem },
    });
    assert.equal(report.ok, false);
    assert.equal(
      report.findings.some((f) => f.code === "checkpoint-withheld"),
      true,
      `expected checkpoint-withheld, got ${JSON.stringify(report.findings)}`,
    );
    assert.equal(
      report.findings.some((f) => f.code === "window-coverage"),
      false,
      "withheld is not window-coverage",
    );
  });

  it("checkpoint-not-anchored is a warning when the witness is configured but this checkpoint has no receipt", () => {
    const k = generateReceiptKeys();
    const receipts = chainReceipts(k, ["1"]);
    const cp = oneCheckpoint(k, receipts);
    const report = trustedExtract(receipts, [cp], {
      inclusionReceipts: [],
      witnessTrust: { publicKeyPem: fixtureEd25519Pems().publicKeyPem },
    });
    assert.equal(report.ok, true);
    assert.equal(report.guarantee, "conditional");
    assert.equal(
      report.warnings.some((f) => f.code === "checkpoint-not-anchored"),
      true,
    );
    assert.equal(
      report.findings.some((f) => f.code === "checkpoint-not-anchored"),
      false,
    );
  });

  it("a witness that holds the checkpoint adds nothing to the report", () => {
    const k = generateReceiptKeys();
    const receipts = chainReceipts(k, ["1"]);
    const cp = oneCheckpoint(k, receipts);
    const ts = new MemoryTransparencyService(fixtureEd25519Pems());
    const inc = anchorCheckpoint(ts, cp);
    const issuerTrust = { publicKeyPem: k.publicKeyPem };
    const witnessTrust = { publicKeyPem: ts.publicKeyPem };
    const held = trustedExtract(receipts, [cp], {
      inclusionReceipts: [inc],
      issuerTrust,
      witnessTrust,
    });
    assert.equal(held.ok, true);
    assert.equal(
      held.warnings.some((w) => w.code === "witness-inclusion-not-exercised"),
      true,
      "layer-2 was not presented, so the report names that it was not exercised",
    );
    const none = trustedExtract(receipts, [cp], { issuerTrust });
    assert.deepEqual(held.findings, none.findings);
  });

  it("omitting inclusionReceipts keeps today's report (backward compatible)", () => {
    const k = generateReceiptKeys();
    const receipts = chainReceipts(k, ["1"]);
    const cp = oneCheckpoint(k, receipts);
    const without = trustedExtract(receipts, [cp], {
      issuerTrust: { publicKeyPem: k.publicKeyPem },
    });
    // Pinned to the pre-witness behaviour, not to another run of the same call.
    assert.equal(without.ok, true);
    assert.equal(without.guarantee, "unconditional");
    assert.deepEqual(without.findings, []);
    assert.equal(
      without.warnings.every((w) => w.code === "counterparty-unbound"),
      true,
    );
    assert.equal(without.summary, "audit: balanced");
  });

  it("window-coverage still fires on its own condition, without a withheld finding", () => {
    const k = generateReceiptKeys();
    const receipts = chainReceipts(k, ["1", "2"]);
    const gap = signCheckpoint(
      buildCheckpointClaims(1, [receipts[0]], 1_700_000_000_000, 1_700_000_000_001, null),
      k.privateKeyPem,
      k.publicKeyPem,
    );
    const report = audit({
      receipts,
      checkpoints: [gap],
      settlements: settlementsOf(receipts),
    });
    assert.equal(
      report.findings.some((f) => f.code === "window-coverage"),
      true,
    );
    assert.equal(
      report.findings.some((f) => f.code === "checkpoint-withheld"),
      false,
    );
  });

  it("a grafted body from the issuer on another statement does not accuse withholding", () => {
    const honest = generateReceiptKeys();
    const receipts = chainReceipts(honest, ["1"]);
    const presented = oneCheckpoint(honest, receipts, 1);
    const withheld = signCheckpoint(
      buildCheckpointClaims(2, receipts, 1_700_000_000_010, 1_700_000_000_020, statementHashOfCheckpoint(presented)),
      honest.privateKeyPem,
      honest.publicKeyPem,
    );
    const ts = new MemoryTransparencyService(fixtureEd25519Pems());
    const presentedReceipt = anchorCheckpoint(ts, presented);
    const foreign = ts.register("deadbeef");
    const grafted = { ...foreign, checkpoint: presented };
    const framed = audit({
      receipts,
      checkpoints: [presented],
      settlements: settlementsOf(receipts),
      inclusionReceipts: [presentedReceipt, grafted],
      witnessTrust: { publicKeyPem: ts.publicKeyPem },
      issuerTrust: { publicKeyPem: honest.publicKeyPem },
    });
    assert.equal(
      framed.findings.some((f) => f.code === "checkpoint-withheld"),
      false,
      `a body that is not the logged statement must not accuse: ${JSON.stringify(framed.findings)}`,
    );
    assert.equal(
      framed.warnings.some((w) => w.code === "witness-entry-unattributable"),
      true,
      "a body that does not bind the logged statement still needs a counted warning",
    );

    const withheldReceipt = anchorCheckpoint(ts, withheld);
    const real = audit({
      receipts,
      checkpoints: [presented],
      settlements: settlementsOf(receipts),
      inclusionReceipts: [presentedReceipt, withheldReceipt],
      witnessTrust: { publicKeyPem: ts.publicKeyPem },
      issuerTrust: { publicKeyPem: honest.publicKeyPem },
    });
    assert.equal(
      real.findings.some((f) => f.code === "checkpoint-withheld"),
      true,
      `a real withheld epoch must still accuse: ${JSON.stringify(real.findings)}`,
    );
  });

  it("without an issuer pin a foreign checkpoint in the log does not accuse withholding", () => {
    const honest = generateReceiptKeys();
    const foreign = generateReceiptKeys();
    const receipts = chainReceipts(honest, ["1"]);
    const presented = oneCheckpoint(honest, receipts, 1);
    const stranger = signCheckpoint(
      buildCheckpointClaims(9, receipts, 1_700_000_000_010, 1_700_000_000_020, null),
      foreign.privateKeyPem,
      foreign.publicKeyPem,
    );
    const ts = new MemoryTransparencyService(fixtureEd25519Pems());
    const presentedReceipt = anchorCheckpoint(ts, presented);
    const strangerReceipt = anchorCheckpoint(ts, stranger);
    const report = audit({
      receipts,
      checkpoints: [presented],
      settlements: settlementsOf(receipts),
      inclusionReceipts: [presentedReceipt, strangerReceipt],
      witnessTrust: { publicKeyPem: ts.publicKeyPem },
    });
    assert.equal(
      report.findings.some((f) => f.code === "checkpoint-withheld"),
      false,
      `foreign entry must not accuse: ${JSON.stringify(report.findings)}`,
    );
    assert.equal(
      report.warnings.some((w) => w.code === "witness-entry-unattributable"),
      true,
      "foreign entry is counted as unattributable",
    );
  });

  it("without an issuer pin a same-key withheld body still accuses", () => {
    const k = generateReceiptKeys();
    const receipts = chainReceipts(k, ["1"]);
    const presented = oneCheckpoint(k, receipts, 1);
    const withheld = signCheckpoint(
      buildCheckpointClaims(2, receipts, 1_700_000_000_010, 1_700_000_000_020, statementHashOfCheckpoint(presented)),
      k.privateKeyPem,
      k.publicKeyPem,
    );
    const ts = new MemoryTransparencyService(fixtureEd25519Pems());
    const presentedReceipt = anchorCheckpoint(ts, presented);
    const withheldReceipt = anchorCheckpoint(ts, withheld);
    const report = audit({
      receipts,
      checkpoints: [presented],
      settlements: settlementsOf(receipts),
      inclusionReceipts: [presentedReceipt, withheldReceipt],
      witnessTrust: { publicKeyPem: ts.publicKeyPem },
    });
    assert.equal(
      report.findings.some((f) => f.code === "checkpoint-withheld"),
      true,
      `same-key withheld must accuse: ${JSON.stringify(report.findings)}`,
    );
  });

  it("a body whose claims disagree with its COSE is not silent in the witness", () => {
    const k = generateReceiptKeys();
    const receipts = chainReceipts(k, ["1"]);
    const presented = oneCheckpoint(k, receipts, 1);
    const withheld = signCheckpoint(
      buildCheckpointClaims(2, receipts, 1_700_000_000_010, 1_700_000_000_020, statementHashOfCheckpoint(presented)),
      k.privateKeyPem,
      k.publicKeyPem,
    );
    const ts = new MemoryTransparencyService(fixtureEd25519Pems());
    const presentedReceipt = anchorCheckpoint(ts, presented);
    const withheldReceipt = anchorCheckpoint(ts, withheld);
    const tampered = {
      ...withheldReceipt,
      checkpoint: {
        ...withheldReceipt.checkpoint!,
        claims: { ...withheldReceipt.checkpoint!.claims, epoch: 99 },
      },
    };
    assert.equal(statementHashOfCheckpoint(tampered.checkpoint), withheldReceipt.statementHash);
    assert.equal(verifyCheckpoint(tampered.checkpoint), false);
    const report = audit({
      receipts,
      checkpoints: [presented],
      settlements: settlementsOf(receipts),
      inclusionReceipts: [presentedReceipt, tampered],
      witnessTrust: { publicKeyPem: ts.publicKeyPem },
      issuerTrust: { publicKeyPem: k.publicKeyPem },
    });
    assert.equal(
      report.findings.some((f) => f.code === "checkpoint-withheld"),
      false,
      `tampered claims must not accuse: ${JSON.stringify(report.findings)}`,
    );
    assert.equal(
      report.warnings.some((w) => w.code === "witness-entry-unattributable"),
      true,
      "tampered body still enters the unattributable count",
    );
  });

  it("an empty or unreadable witness pin warns as unauthenticated, not as unanchored", () => {
    const k = generateReceiptKeys();
    const receipts = chainReceipts(k, ["1"]);
    const cp = oneCheckpoint(k, receipts);
    const ts = new MemoryTransparencyService(fixtureEd25519Pems());
    const inc = anchorCheckpoint(ts, cp);
    const base = {
      receipts,
      checkpoints: [cp],
      settlements: settlementsOf(receipts),
      inclusionReceipts: [inc],
      issuerTrust: { publicKeyPem: k.publicKeyPem },
    };

    for (const publicKeyPem of [[], ["not a key"]] as const) {
      const report = audit({
        ...base,
        witnessTrust: { publicKeyPem },
      });
      assert.equal(
        report.warnings.some((w) => w.code === "unauthenticated-witness"),
        true,
        `pin ${JSON.stringify(publicKeyPem)} must warn unauthenticated-witness`,
      );
      assert.equal(
        report.warnings.some((w) => w.code === "checkpoint-not-anchored"),
        false,
        `pin ${JSON.stringify(publicKeyPem)} must not invent checkpoint-not-anchored`,
      );
      assert.match(
        report.warnings.find((w) => w.code === "unauthenticated-witness")!.detail,
        /pin was supplied but no key in it could be read/,
      );
    }
  });
});

describe("B — equivocation via the witness", () => {
  it("RED: same epoch, one checkpoint presented, a different verified copy in the witness", () => {
    const k = generateReceiptKeys();
    const a = chainReceipts(k, ["1"]);
    const b = chainReceipts(k, ["2"]);
    const presented = signCheckpoint(
      buildCheckpointClaims(7, a, 1_700_000_000_000, 1_700_000_000_010, null),
      k.privateKeyPem,
      k.publicKeyPem,
    );
    const other = signCheckpoint(
      buildCheckpointClaims(7, b, 1_700_000_000_000, 1_700_000_000_010, null),
      k.privateKeyPem,
      k.publicKeyPem,
    );
    const ts = new MemoryTransparencyService(fixtureEd25519Pems());
    const presentedReceipt = anchorCheckpoint(ts, presented);
    const otherReceipt = anchorCheckpoint(ts, other);
    const report = audit({
      receipts: a,
      checkpoints: [presented],
      settlements: settlementsOf(a),
      inclusionReceipts: [presentedReceipt, otherReceipt],
      witnessTrust: { publicKeyPem: ts.publicKeyPem },
    });
    assert.equal(report.ok, false);
    assert.equal(
      report.findings.some((f) => f.code === "equivocation" && f.id === "epoch-7"),
      true,
      `expected equivocation on epoch 7, got ${JSON.stringify(report.findings)}`,
    );
  });
});

describe("C — checkpoint totals redaction", () => {
  /** Sign a checkpoint for these receipts with its totals withheld. */
  function redactedCheckpoint(
    keys: { privateKeyPem: string; publicKeyPem: string },
    receipts: SignedReceipt[],
  ): SignedCheckpoint {
    return signCheckpoint(
      redactCheckpointTotals(
        buildCheckpointClaims(1, receipts, 1_700_000_000_000, 1_700_000_000_010, null),
      ),
      keys.privateKeyPem,
      keys.publicKeyPem,
    );
  }

  it("RED: redacted totals warn and stay conditional, and do not fail", () => {
    const k = generateReceiptKeys();
    const receipts = chainReceipts(k, ["1"]);
    const report = trustedExtract(receipts, [redactedCheckpoint(k, receipts)]);
    assert.equal(report.ok, true);
    assert.equal(report.guarantee, "conditional");
    assert.equal(
      report.warnings.some((f) => f.code === "checkpoint-totals-redacted"),
      true,
    );
  });

  it("redacted totals do not produce checkpoint-total-mismatch", () => {
    const k = generateReceiptKeys();
    const receipts = chainReceipts(k, ["1"]);
    const report = audit({
      receipts,
      checkpoints: [redactedCheckpoint(k, receipts)],
      settlements: settlementsOf(receipts),
    });
    assert.equal(
      report.findings.some((f) => f.code === "checkpoint-total-mismatch"),
      false,
      `redacted totals must not be a mismatch: ${JSON.stringify(report.findings)}`,
    );
  });

  it("the redaction is inside the signature, so it survives a round trip", () => {
    const k = generateReceiptKeys();
    const receipts = chainReceipts(k, ["1"]);
    const cp = redactedCheckpoint(k, receipts);
    assert.equal(verifyCheckpoint(cp), true);
    assert.equal(cp.claims.totals, null);
    // Claiming totals that the signature does not carry is caught.
    const forged = { ...cp, claims: { ...cp.claims, totals: { USD: "1" } } };
    assert.equal(verifyCheckpoint(forged), false);
  });

  it("an empty totals object is not a redaction", () => {
    const k = generateReceiptKeys();
    const receipts = chainReceipts(k, ["1"]);
    const empty = signCheckpoint(
      { ...buildCheckpointClaims(1, receipts, 1_700_000_000_000, 1_700_000_000_010, null), totals: {} },
      k.privateKeyPem,
      k.publicKeyPem,
    );
    const report = audit({
      receipts,
      checkpoints: [empty],
      settlements: settlementsOf(receipts),
    });
    assert.equal(report.ok, false);
    assert.equal(
      report.findings.some((f) => f.code === "checkpoint-total-mismatch"),
      true,
    );
    assert.equal(
      report.warnings.some((f) => f.code === "checkpoint-totals-redacted"),
      false,
    );
  });

  it("a structural claim missing from the payload is fail-closed", () => {
    const k = generateReceiptKeys();
    const receipts = chainReceipts(k, ["1"]);
    const cp = oneCheckpoint(k, receipts);
    // The COSE payload still says epoch 1; the presented claims say epoch 9.
    const forged = { ...cp, claims: { ...cp.claims, epoch: 9 } };
    assert.equal(verifyCheckpoint(forged), false);
    const report = audit({
      receipts,
      checkpoints: [forged],
      settlements: settlementsOf(receipts),
    });
    assert.equal(report.ok, false);
  });

  it("a checkpoint whose signed totals are wrong fails however it is presented", () => {
    const k = generateReceiptKeys();
    const receipts = chainReceipts(k, ["1"]);
    const honest = buildCheckpointClaims(1, receipts, 1_700_000_000_000, 1_700_000_000_010, null);
    // The receipts settle 1 USD. This checkpoint signs a claim of 999.
    const liar = signCheckpoint(
      { ...honest, totals: { USD: "999" } },
      k.privateKeyPem,
      k.publicKeyPem,
    );
    const asSigned = audit({
      receipts,
      checkpoints: [liar],
      settlements: settlementsOf(receipts),
    });
    assert.equal(asSigned.ok, false, "a lying checkpoint must fail as signed");

    // Same COSE bytes, re-presented as though the totals had been withheld.
    // Redaction lives inside the signature, so this cannot clear the mismatch.
    const dressed = { ...liar, claims: { ...liar.claims, totals: null } };
    const asDressed = audit({
      receipts,
      checkpoints: [dressed],
      settlements: settlementsOf(receipts),
    });
    assert.equal(
      asDressed.ok,
      false,
      `redaction asserted outside the signature must not clear a mismatch: ${JSON.stringify(asDressed)}`,
    );
    assert.equal(
      asDressed.warnings.some((f) => f.code === "checkpoint-totals-redacted"),
      false,
      "an unverifiable checkpoint does not get to claim a redaction",
    );
  });
});
