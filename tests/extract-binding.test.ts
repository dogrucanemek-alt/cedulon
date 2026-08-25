import { strict as assert } from "node:assert";
import { createPublicKey } from "node:crypto";
import { describe, it } from "node:test";

import { audit, formatAudit } from "@cedulon/audit";
import { PolicyEngine } from "@cedulon/core";
import { fixtureEd25519Pems } from "@cedulon/cose";
import {
  RailLedger,
  gatedSettleWithLedger,
  generateExtractKeys,
  signRailExtract,
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
  it("18 RED then GREEN: an off-book row inside a signed extract is reconciled, not skipped", () => {
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

  it("19 RED then GREEN: an unpinned or attacker-signed extract cannot reach an unconditional guarantee", () => {
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

  it("20 RED then GREEN: an extract outside the expected account, rail, or window fails closed", () => {
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

  it("21 RED then GREEN: a repeated ref names the amount that is unaccounted for", () => {
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

  it("22 RED then GREEN: once a key is pinned, a signature that does not verify fails closed", () => {
    const rail = generateExtractKeys();
    const ledger = new RailLedger();
    const good = ledger.signedExtract(rail.privateKeyPem, rail.publicKeyPem);
    const tampered = { ...good, signature: "aa" };

    // RED before the fix: the pin was only compared on the branch where the
    // signature already verified, so the worse input took the softer path and
    // came back ok: true with a mere warning.
    const red = audit({
      receipts: [],
      checkpoints: [],
      extract: tampered,
      trust: { publicKeyPem: rail.publicKeyPem },
    });
    assert.equal(red.ok, false, "a pinned verifier does not accept an unverifiable extract");
    assert.equal(red.findings.some((f) => f.code === "extract-key-mismatch"), true);

    const green = audit({
      receipts: [],
      checkpoints: [],
      extract: good,
      trust: { publicKeyPem: rail.publicKeyPem },
    });
    assert.equal(green.ok, true);
  });

  it("23 RED then GREEN: a doubted extract is never described as an unconditional guarantee", () => {
    const attacker = generateExtractKeys();
    const rail = generateExtractKeys();
    const ledger = new RailLedger();
    const forged = ledger.signedExtract(attacker.privateKeyPem, attacker.publicKeyPem);

    // RED before the fix: guarantee was derived from warnings alone, so a report
    // could name extract-key-mismatch and still call itself unconditional.
    const red = audit({
      receipts: [],
      checkpoints: [],
      extract: forged,
      trust: { publicKeyPem: rail.publicKeyPem },
    });
    assert.equal(red.findings.some((f) => f.code === "extract-key-mismatch"), true);
    assert.equal(red.guarantee, "conditional");

    const green = audit({
      receipts: [],
      checkpoints: [],
      extract: ledger.signedExtract(rail.privateKeyPem, rail.publicKeyPem),
      trust: { publicKeyPem: rail.publicKeyPem },
    });
    assert.equal(green.guarantee, "unconditional");
  });

  it("24 RED then GREEN: the operator-facing output carries the guarantee and its warnings", () => {
    // RED before the fix: formatAudit printed "audit: balanced / receipts / findings=0"
    // and nothing else, so a conditional pass was indistinguishable from a
    // pinned one in the only output an operator reads.
    const unpinned = audit({ receipts: [], checkpoints: [], settlements: [] });
    const red = formatAudit(unpinned, 0);
    assert.match(red, /guarantee=conditional/);
    assert.match(red, /warn\tunauthenticated-extract/);

    const rail = generateExtractKeys();
    const ledger = new RailLedger();
    const green = formatAudit(
      audit({
        receipts: [],
        checkpoints: [],
        extract: ledger.signedExtract(rail.privateKeyPem, rail.publicKeyPem),
        trust: { publicKeyPem: rail.publicKeyPem },
      }),
      0,
    );
    assert.match(green, /guarantee=unconditional/);
    assert.equal(/warn\t/.test(green), false);
  });

  it("26 RED then GREEN: the same rail key in another encoding still matches the pin", () => {
    const rail = generateExtractKeys();
    const ledger = new RailLedger();
    const extract = ledger.signedExtract(rail.privateKeyPem, rail.publicKeyPem);

    // A rail that publishes its key as bare base64 SPKI rather than PEM. Same
    // key, same bytes; only the envelope differs. Comparing PEM text called
    // this a mismatch, which fails closed against an honest rail.
    const bareBase64 = createPublicKey(rail.publicKeyPem)
      .export({ type: "spki", format: "der" })
      .toString("base64");

    const green = audit({
      receipts: [],
      checkpoints: [],
      extract,
      trust: { publicKeyPem: bareBase64 },
    });
    assert.equal(green.ok, true, "the same key in another encoding is the same key");
    assert.equal(green.guarantee, "unconditional");

    const other = generateExtractKeys();
    const red = audit({
      receipts: [],
      checkpoints: [],
      extract,
      trust: { publicKeyPem: other.publicKeyPem },
    });
    assert.equal(red.findings.some((f) => f.code === "extract-key-mismatch"), true);
  });

  it("27 RED then GREEN: a pin the audit cannot read is named, not silently a mismatch", () => {
    const rail = generateExtractKeys();
    const ledger = new RailLedger();
    const extract = ledger.signedExtract(rail.privateKeyPem, rail.publicKeyPem);

    // RED before the fix: an unreadable pin compared unequal and was reported
    // as extract-key-mismatch, so an operator could not tell a forged extract
    // from their own malformed configuration.
    const red = audit({
      receipts: [],
      checkpoints: [],
      extract,
      trust: { publicKeyPem: "-----BEGIN PUBLIC KEY-----\nnot-a-key\n-----END PUBLIC KEY-----" },
    });
    assert.equal(red.ok, false, "an unreadable pin fails closed");
    assert.equal(red.findings.some((f) => f.code === "trust-key-unreadable"), true);
    assert.equal(
      red.findings.some((f) => f.code === "extract-key-mismatch"),
      false,
      "and is not confused with a key that simply does not match",
    );

    const green = audit({
      receipts: [],
      checkpoints: [],
      extract,
      trust: { publicKeyPem: rail.publicKeyPem },
    });
    assert.equal(green.ok, true);
  });

  it("28 RED then GREEN: a settlement outside the extract's declared window is named", () => {
    const rail = generateExtractKeys();
    // The rail declares one window but carries a row from outside it. Nothing
    // checked that the rows and the declared window agree, so the extract
    // could cover a period it did not actually report on.
    const strayed = signRailExtract(
      {
        accountId: "acct-1",
        railId: "rail-1",
        windowStartMs: NOW,
        windowEndMs: NOW + 1_000,
        settlements: [
          { ref: "inside", amount: "1", currency: "USD", timestampMs: NOW + 10 },
          { ref: "strayed", amount: "9", currency: "USD", timestampMs: NOW + 5_000 },
        ],
      },
      rail.privateKeyPem,
      rail.publicKeyPem,
    );

    const red = audit({
      receipts: [],
      checkpoints: [],
      extract: strayed,
      trust: { publicKeyPem: rail.publicKeyPem },
    });
    const stray = red.findings.find((f) => f.code === "extract-scope-mismatch" && f.id === "strayed");
    assert.ok(stray, "the row outside the declared window is named by its ref");
    assert.match(stray.detail, /outside the declared window/);
    assert.equal(
      red.findings.some((f) => f.code === "extract-scope-mismatch" && f.id === "inside"),
      false,
      "the row inside the window is not flagged",
    );

    const clean = signRailExtract(
      {
        accountId: "acct-1",
        railId: "rail-1",
        windowStartMs: NOW,
        windowEndMs: NOW + 1_000,
        settlements: [{ ref: "inside", amount: "1", currency: "USD", timestampMs: NOW + 10 }],
      },
      rail.privateKeyPem,
      rail.publicKeyPem,
    );
    const green = audit({
      receipts: [],
      checkpoints: [],
      extract: clean,
      trust: { publicKeyPem: rail.publicKeyPem },
    });
    assert.equal(green.findings.some((f) => f.code === "extract-scope-mismatch"), false);
  });

  it("25 RED then GREEN: an amount the audit cannot read is a finding, not a crash", () => {
    const ledger = new RailLedger();
    ledger.record({ ref: "dup", amount: "1.5", currency: "USD", timestampMs: NOW });
    ledger.record({ ref: "dup", amount: "2", currency: "USD", timestampMs: NOW + 1 });

    // RED before the fix: BigInt("1.5") threw out of audit() and took the whole
    // report down over one unreadable row.
    const red = audit({ receipts: [], checkpoints: [], settlements: ledger.extract() });
    assert.equal(red.ok, false);
    assert.equal(red.findings.some((f) => f.code === "malformed-amount" && f.id === "dup"), true);

    const clean = new RailLedger();
    clean.record({ ref: "solo", amount: "2", currency: "USD", timestampMs: NOW });
    const green = audit({ receipts: [], checkpoints: [], settlements: clean.extract() });
    assert.equal(green.findings.some((f) => f.code === "malformed-amount"), false);
  });
});
