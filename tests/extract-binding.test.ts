import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { audit } from "@cedulon/audit";
import { PolicyEngine } from "@cedulon/core";
import { fixtureEd25519Pems } from "@cedulon/cose";
import {
  RailLedger,
  gatedSettleWithLedger,
  generateExtractKeys,
  type AdapterKeys,
} from "@cedulon/x402-adapter";

const NOW = 1_700_000_000_000;

function adapterKeys(): AdapterKeys {
  const signer = fixtureEd25519Pems();
  return { receiptPrivatePem: signer.privateKeyPem, receiptPublicPem: signer.publicKeyPem };
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

describe("rail extract binding", () => {
  it("14 RED then GREEN: an off-book row inside a signed extract is reconciled, not skipped", () => {
    const rail = generateExtractKeys();
    const ledger = new RailLedger();
    ledger.record({ ref: "off-book-1", amount: "7", currency: "USD", timestampMs: NOW });
    const extract = ledger.signedExtract(rail.privateKeyPem, rail.publicKeyPem);

    // RED before the fix: the caller could hand over an empty array and the
    // off-book row inside the extract was never examined.
    const red = audit({
      receipts: [],
      checkpoints: [],
      settlements: [],
      extract,
      trust: { publicKeyPem: rail.publicKeyPem },
    });
    assert.equal(red.ok, false);
    assert.equal(
      red.findings.some((f) => f.code === "settlement-without-receipt" && f.id === "off-book-1"),
      true,
    );
    assert.equal(
      red.findings.some((f) => f.code === "extract-settlement-mismatch"),
      true,
      "the empty caller array is itself reported",
    );

    const clean = new RailLedger();
    const green = audit({
      receipts: [],
      checkpoints: [],
      extract: clean.signedExtract(rail.privateKeyPem, rail.publicKeyPem),
      trust: { publicKeyPem: rail.publicKeyPem },
    });
    assert.equal(green.ok, true);
    assert.equal(green.guarantee, "unconditional");
  });

  it("15 RED then GREEN: an unpinned or attacker-signed extract cannot reach an unconditional guarantee", () => {
    const attacker = generateExtractKeys();
    const rail = generateExtractKeys();
    const ledger = new RailLedger();
    const forged = ledger.signedExtract(attacker.privateKeyPem, attacker.publicKeyPem);

    const unpinned = audit({ receipts: [], checkpoints: [], extract: forged });
    assert.equal(unpinned.guarantee, "conditional", "a self-signed extract proves nothing on its own");
    assert.equal(unpinned.warnings.some((f) => f.code === "unauthenticated-extract"), true);

    const pinned = audit({
      receipts: [],
      checkpoints: [],
      extract: forged,
      trust: { publicKeyPem: rail.publicKeyPem },
    });
    assert.equal(pinned.ok, false);
    assert.equal(pinned.findings.some((f) => f.code === "extract-key-mismatch"), true);

    const green = audit({
      receipts: [],
      checkpoints: [],
      extract: ledger.signedExtract(rail.privateKeyPem, rail.publicKeyPem),
      trust: { publicKeyPem: rail.publicKeyPem },
    });
    assert.equal(green.ok, true);
    assert.equal(green.guarantee, "unconditional");
  });

  it("16 RED then GREEN: an extract outside the expected account, rail, or window fails closed", () => {
    const rail = generateExtractKeys();
    const ledger = new RailLedger();
    const extract = ledger.signedExtract(rail.privateKeyPem, rail.publicKeyPem, "other-account", "other-rail");

    const red = audit({
      receipts: [],
      checkpoints: [],
      extract,
      trust: { publicKeyPem: rail.publicKeyPem, accountId: "mock-account", railId: "mock-rail" },
    });
    assert.equal(red.ok, false);
    assert.equal(red.findings.filter((f) => f.code === "extract-scope-mismatch").length, 2);

    const green = audit({
      receipts: [],
      checkpoints: [],
      extract: ledger.signedExtract(rail.privateKeyPem, rail.publicKeyPem),
      trust: { publicKeyPem: rail.publicKeyPem, accountId: "mock-account", railId: "mock-rail" },
    });
    assert.equal(green.ok, true);
  });

  it("17 RED then GREEN: a repeated ref names the amount that is unaccounted for", () => {
    const ledger = new RailLedger();
    const result = gatedSettleWithLedger(
      engine(),
      {
        req: { amount: 1n, currency: "USD", payee: "payee-1", nonce: "real", nowMs: NOW, tool: "spend" },
        payer: "payer-1",
        paymentHeader: "mock",
      },
      adapterKeys(),
      NOW,
      ledger,
      null,
    );
    const receipt = (result as any).receipt;
    const legitRef = receipt.claims.x402PaymentRef;
    ledger.record({ ref: legitRef, amount: "7", currency: "USD", timestampMs: NOW + 1 });

    const red = audit({ receipts: [receipt], checkpoints: [], settlements: ledger.extract() });
    assert.equal(red.ok, false);
    const gap = red.findings.find((f) => f.code === "settlement-without-receipt" && f.id === legitRef);
    assert.ok(gap, "the repeated ref no longer swallows the finding");
    assert.match(gap.detail, /7 USD unaccounted/);

    const clean = new RailLedger();
    const ok = gatedSettleWithLedger(
      engine(),
      {
        req: { amount: 1n, currency: "USD", payee: "payee-1", nonce: "solo", nowMs: NOW, tool: "spend" },
        payer: "payer-1",
        paymentHeader: "mock",
      },
      adapterKeys(),
      NOW,
      clean,
      null,
    );
    const green = audit({
      receipts: [(ok as any).receipt],
      checkpoints: [],
      settlements: clean.extract(),
    });
    assert.equal(green.findings.some((f) => f.code === "settlement-without-receipt"), false);
  });
});
