import { TEST_HASH, TEST_HASH_OTHER } from "./hash-fixtures.ts";
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { audit, type AuditInput } from "@cedulon/audit";
import { buildCheckpointClaims, signCheckpoint, verifyCheckpoint } from "@cedulon/checkpoint";
import { signDecisionToken, verifyDecisionToken } from "@cedulon/core";
import {
  generateManifestKeys,
  manifestHash,
  signManifest,
  verifyManifest,
  type SignedManifest,
} from "@cedulon/manifest";
import {
  counterSign,
  generateReceiptKeys,
  makeDisputeBundle,
  signReceipt,
  verifyDisputeBundle,
  verifyReceipt,
  type SignedReceipt,
} from "@cedulon/receipts";
import {
  generateExtractKeys,
  signRailExtract,
  verifyRailExtract,
  type SignedRailExtract,
} from "@cedulon/x402-adapter";

const NOW = 1_700_000_000_000;
const WINDOW_END = NOW + 3_600_000;

type Keys = { privateKeyPem: string; publicKeyPem: string };

function receiptFor(keys: Keys, ref: string, i: number, boundTo: string | null = null): SignedReceipt {
  return signReceipt(
    {
      payer: "payer",
      payee: "payee",
      amount: "1",
      currency: "USD",
      policyHash: TEST_HASH,
      manifestHash: boundTo,
      noManifest: boundTo === null,
      x402PaymentRef: ref,
      timestampMs: NOW + i,
      nonce: `n${i}`.padEnd(16, "-"),
      prevReceiptHash: null,
      outcome: "settled",
    },
    keys.privateKeyPem,
    keys.publicKeyPem,
  );
}

function checkpointFor(keys: Keys, receipts: SignedReceipt[]) {
  return signCheckpoint(
    buildCheckpointClaims(1, receipts, NOW, WINDOW_END, null),
    keys.privateKeyPem,
    keys.publicKeyPem,
  );
}

function railWith(rail: Keys, ref = "ref-ok"): SignedRailExtract {
  return signRailExtract(
    {
      accountId: "acct",
      railId: "rail",
      windowStartMs: NOW,
      windowEndMs: WINDOW_END,
      settlements: [{ ref, amount: "1", currency: "USD", timestampMs: NOW }],
    },
    rail.privateKeyPem,
    rail.publicKeyPem,
  );
}

function railPin(rail: Keys) {
  return {
    publicKeyPem: rail.publicKeyPem,
    accountId: "acct",
    railId: "rail",
    windowStartMs: NOW,
    windowEndMs: WINDOW_END,
  };
}

function manifestBody() {
  return {
    description: "one unit of work",
    amount: "1",
    currency: "USD",
    acceptanceCriteriaHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    cancelCondition: "none",
    expiresAtMs: NOW + 60_000,
  };
}

function balanced(honest: Keys, rail: Keys): AuditInput {
  const good = receiptFor(honest, "ref-ok", 0);
  return {
    receipts: [good],
    checkpoints: [checkpointFor(honest, [good])],
    extract: railWith(rail),
    trust: railPin(rail),
    issuerTrust: { publicKeyPem: honest.publicKeyPem },
  };
}

// balanced() spends under no manifest, which is the right fixture for asking
// who signed one. It is the wrong fixture for asking whether the audit stays
// quiet on an honest one: a manifest no receipt references is a finding of its
// own (pass9, case 93). This window is actually spent under the terms.
function balancedUnder(honest: Keys, rail: Keys, manifest: SignedManifest): AuditInput {
  const good = receiptFor(honest, "ref-ok", 0, manifestHash(manifest));
  return {
    receipts: [good],
    checkpoints: [checkpointFor(honest, [good])],
    extract: railWith(rail),
    trust: railPin(rail),
    issuerTrust: { publicKeyPem: honest.publicKeyPem },
  };
}

function withManifest(input: AuditInput, manifest: SignedManifest, pin?: string | readonly string[]): AuditInput {
  return {
    ...input,
    manifest,
    ...(pin === undefined ? {} : { manifestTrust: { publicKeyPem: pin } }),
  };
}

describe("the manifest root", () => {
  it("90 RED then GREEN: an attacker-signed manifest passes the audit with no findings", () => {
    // The published 0.3.1 path: audit() has no manifest root, so a presented
    // Trade Manifest is dropped on the floor. verifyManifest without a pin
    // then answers its own question. Together that is the fifth copy of the
    // self-authenticating loop -03 closed for issuer, payee, witness and
    // decision.
    const honest = generateReceiptKeys();
    const rail = generateExtractKeys();
    const attacker = generateManifestKeys();
    const forged = signManifest(manifestBody(), attacker.privateKeyPem, attacker.publicKeyPem);

    const silent = audit(withManifest(balanced(honest, rail), forged));
    assert.ok(
      silent.warnings.some((w) => w.code === "unauthenticated-manifest"),
      `presented, unpinned: expected unauthenticated-manifest, got findings=${silent.findings.map((f) => f.code).join(",") || "none"} warnings=${silent.warnings.map((w) => w.code).join(",") || "none"} ok=${silent.ok} guarantee=${silent.guarantee}`,
    );
    assert.equal(silent.guarantee, "conditional");

    const merchant = generateManifestKeys();
    const pinned = audit(withManifest(balanced(honest, rail), forged, merchant.publicKeyPem));
    assert.equal(pinned.ok, false, "a pin the manifest does not answer to must fail the audit");
    assert.ok(
      pinned.findings.some((f) => f.code === "manifest-key-mismatch"),
      `pinned to the merchant: expected manifest-key-mismatch, got ${pinned.findings.map((f) => f.code).join(",") || "none"}`,
    );
  });

  it("91 RED then GREEN: a no-manifest audit is not made conditional by the fifth root", () => {
    const honest = generateReceiptKeys();
    const rail = generateExtractKeys();
    const report = audit(balanced(honest, rail));
    assert.equal(report.findings.length, 0, report.findings.map((f) => f.code).join(","));
    assert.equal(
      report.warnings.some((w) => w.code === "unauthenticated-manifest"),
      false,
      "a deployment that presents no manifest is not a missing-root gap",
    );
    assert.equal(report.guarantee, "unconditional");
  });

  it("92 RED then GREEN: an unreadable manifest pin is a configuration fault", () => {
    const honest = generateReceiptKeys();
    const rail = generateExtractKeys();
    const merchant = generateManifestKeys();
    const signed = signManifest(manifestBody(), merchant.privateKeyPem, merchant.publicKeyPem);
    const report = audit(withManifest(balanced(honest, rail), signed, "not-a-key"));
    assert.ok(report.findings.some((f) => f.code === "trust-key-unreadable" && f.id === "manifest"));
    assert.equal(report.ok, false);
    assert.equal(report.guarantee, "conditional");
  });

  it("93 GREEN on arrival once 90 is closed: a pinned honest manifest stays silent", () => {
    const honest = generateReceiptKeys();
    const rail = generateExtractKeys();
    const merchant = generateManifestKeys();
    const signed = signManifest(manifestBody(), merchant.privateKeyPem, merchant.publicKeyPem);
    const report = audit(withManifest(balancedUnder(honest, rail, signed), signed, merchant.publicKeyPem));
    assert.equal(report.findings.length, 0, report.findings.map((f) => f.code).join(","));
    assert.equal(
      report.warnings.some((w) => w.code === "unauthenticated-manifest" || w.code === "trust-key-unreadable"),
      false,
    );
    assert.equal(report.guarantee, "unconditional");
  });
});

describe("pin optionality, measured rather than guessed", () => {
  it("97 RED then GREEN: a manifest the pin rejects does not charge anyone", () => {
    // The sharpest shape in this profile: evidence the verifier has explicitly
    // refused must not be able to manufacture a negative result. A manifest
    // that fails its pin still supplied the terms and the acceptance hash that
    // two hard findings were written from.
    const honest = generateReceiptKeys();
    const rail = generateExtractKeys();
    const merchant = generateManifestKeys();
    const attacker = generateManifestKeys();
    const forged = signManifest(
      { ...manifestBody(), payee: "SOMEONE-ELSE" },
      attacker.privateKeyPem,
      attacker.publicKeyPem,
    );
    const bound = receiptFor(honest, "ref-ok", 0, manifestHash(forged));
    const countersigned = counterSign(
      bound,
      merchant.privateKeyPem,
      merchant.publicKeyPem,
      undefined,
      TEST_HASH_OTHER,
    );
    const report = audit({
      receipts: [countersigned],
      checkpoints: [checkpointFor(honest, [countersigned])],
      settlements: [{ ref: "ref-ok", amount: "1", currency: "USD", timestampMs: NOW }],
      extract: railWith(rail),
      trust: railPin(rail),
      issuerTrust: { publicKeyPem: honest.publicKeyPem },
      payeeTrust: { payee: merchant.publicKeyPem },
      manifest: forged,
      manifestTrust: { publicKeyPem: merchant.publicKeyPem },
    });

    assert.ok(
      report.findings.some((f) => f.code === "manifest-key-mismatch"),
      `the pin must reject this manifest first, got ${report.findings.map((f) => f.code).join(",") || "none"}`,
    );
    assert.equal(
      report.findings.some((f) => f.code === "delivery-mismatch"),
      false,
      "a rejected manifest's acceptanceCriteriaHash must not accuse the payee of a bad delivery",
    );
    assert.equal(
      report.findings.some((f) => f.code === "manifest-terms-mismatch"),
      false,
      "a rejected manifest's terms must not charge the receipt with departing from them",
    );
  });

  it("98 RED then GREEN: a rail extract the pin rejects does not charge anyone", () => {
    // Case 97's twin on the money axis. A rejected Trade Manifest may not
    // supply the terms a charge is written from; a rejected rail extract may
    // not supply the settlement rows one is written from either. Here the
    // attacker signs an extract with their own key and puts a different amount
    // on an honest receipt's ref: without the gate the report names
    // extract-key-mismatch and then convicts that receipt out of the same
    // refused document.
    const honest = generateReceiptKeys();
    const rail = generateExtractKeys();
    const attacker = generateExtractKeys();
    const good = receiptFor(honest, "ref-ok", 0);
    const forged = signRailExtract(
      {
        accountId: "acct",
        railId: "rail",
        windowStartMs: NOW,
        windowEndMs: WINDOW_END,
        settlements: [{ ref: "ref-ok", amount: "2", currency: "USD", timestampMs: NOW }],
      },
      attacker.privateKeyPem,
      attacker.publicKeyPem,
    );
    const report = audit({
      receipts: [good],
      checkpoints: [checkpointFor(honest, [good])],
      extract: forged,
      trust: railPin(rail),
      issuerTrust: { publicKeyPem: honest.publicKeyPem },
    });

    assert.ok(
      report.findings.some((f) => f.code === "extract-key-mismatch"),
      `the pin must reject this extract first, got ${report.findings.map((f) => f.code).join(",") || "none"}`,
    );
    assert.equal(
      report.findings.some((f) => f.code === "settlement-mismatch"),
      false,
      "a rejected extract's rows must not charge a receipt with a mismatched settlement",
    );
    assert.equal(
      report.findings.some((f) => f.code === "settlement-without-receipt"),
      false,
      "a rejected extract's rows must not report money as unaccounted for",
    );
    assert.equal(
      report.findings.some((f) => f.code === "receipt-without-settlement"),
      false,
      "a rejected extract's silence must not leave an honest receipt unmatched",
    );
    assert.ok(
      report.warnings.some((w) => w.code === "settlement-comparison-skipped"),
      "the report must say the reconciliation did not run rather than omitting it in silence",
    );
    assert.equal(report.guarantee, "conditional", "a refused extract cannot support an unconditional guarantee");
  });

  it("96 RED then GREEN: counterparty-unbound stops reporting a reconciliation that did not close", () => {
    // The message asserted a state the same report contradicts: it said ref,
    // amount and currency closed against the extract while a settlement on
    // that extract had no receipt at all.
    const honest = generateReceiptKeys();
    const rail = generateExtractKeys();
    const good = receiptFor(honest, "ref-ok", 0);
    const settlements = [
      { ref: "ref-ok", amount: "1", currency: "USD", timestampMs: NOW },
      { ref: "orphan-1", amount: "9", currency: "USD", timestampMs: NOW + 3_600_000 },
    ];
    const wide = { windowStartMs: NOW - 3_600_000, windowEndMs: NOW + 7_200_000 };
    const extract = signRailExtract(
      { accountId: "acct", railId: "rail", ...wide, settlements },
      rail.privateKeyPem,
      rail.publicKeyPem,
    );
    const open = audit({
      receipts: [good],
      checkpoints: [checkpointFor(honest, [good])],
      settlements,
      extract,
      trust: { publicKeyPem: rail.publicKeyPem, accountId: "acct", railId: "rail", ...wide },
    });
    assert.ok(
      open.findings.some((f) => f.code === "settlement-without-receipt"),
      `expected an unmatched settlement, got ${open.findings.map((f) => f.code).join(",") || "none"}`,
    );
    const unbound = open.warnings.find((w) => w.code === "counterparty-unbound");
    assert.ok(unbound, "expected counterparty-unbound beside it");
    assert.doesNotMatch(
      unbound.detail,
      /closed against the extract/,
      "a settlement with no receipt is not a closed reconciliation, so the message must not report one",
    );
  });

  it("95 RED then GREEN: the unpinned manifest warning does not report a check the audit never runs", () => {
    // Measured, not assumed: with no manifest pin nothing verifies the
    // manifest, so its own warning must not describe what a signature proved.
    const honest = generateReceiptKeys();
    const rail = generateExtractKeys();
    const merchant = generateManifestKeys();
    const manifest = signManifest(manifestBody(), merchant.privateKeyPem, merchant.publicKeyPem);
    const hex = manifest.coseHex;
    const tampered = {
      ...manifest,
      coseHex: hex.slice(0, hex.length - 2) + (hex.slice(-2) === "00" ? "01" : "00"),
    };

    const intact = audit(withManifest(balancedUnder(honest, rail, manifest), manifest));
    const broken = audit(withManifest(balancedUnder(honest, rail, tampered), tampered));
    assert.deepEqual(
      broken.findings.map((f) => f.code),
      intact.findings.map((f) => f.code),
      "no manifest pin: an altered signature is indistinguishable from an intact one",
    );

    const warning = intact.warnings.find((w) => w.code === "unauthenticated-manifest");
    assert.ok(warning, "expected unauthenticated-manifest on a presented, unpinned manifest");
    assert.doesNotMatch(
      warning.detail,
      /proves internal consistency/,
      "the audit runs no signature check on an unpinned manifest, so its message must not report one",
    );
  });

  it("94 measures what each verify function does without a pin", () => {
    const honest = generateReceiptKeys();
    const attacker = generateReceiptKeys();
    const rail = generateExtractKeys();
    const merchant = generateManifestKeys();
    const forgedManifest = signManifest(manifestBody(), attacker.privateKeyPem, attacker.publicKeyPem);
    const honestManifest = signManifest(manifestBody(), merchant.privateKeyPem, merchant.publicKeyPem);
    const receipt = receiptFor(attacker, "ref-x", 0);
    const extract = railWith(rail);

    assert.equal(verifyManifest(forgedManifest), true, "verifyManifest unpinned: self-check passes");
    assert.equal(verifyManifest(forgedManifest, merchant.publicKeyPem), false, "verifyManifest pinned: foreign key fails");
    assert.equal(verifyManifest(honestManifest, merchant.publicKeyPem), true);

    assert.equal(verifyReceipt(receipt), true, "verifyReceipt unpinned: self-check passes");
    assert.equal(verifyReceipt(receipt, honest.publicKeyPem), false);

    assert.equal(verifyRailExtract(extract), true, "verifyRailExtract unpinned: self-check passes");
    assert.equal(
      verifyRailExtract(extract, honest.publicKeyPem),
      false,
      "verifyRailExtract must take the rail pin so MUST-T10-8 can be asked here, not only later in audit()",
    );
    assert.equal(verifyRailExtract(extract, rail.publicKeyPem), true);

    const cp = checkpointFor(attacker, [receipt]);
    assert.equal(verifyCheckpoint(cp), true, "verifyCheckpoint unpinned: self-check passes");
    assert.equal(verifyCheckpoint(cp, honest.publicKeyPem), false);

    const token = signDecisionToken(
      {
        requestHash: TEST_HASH,
        policyHash: TEST_HASH,
        expiryMs: NOW + 60_000,
        nonce: "n0".padEnd(16, "-"),
        singleUseId: "single",
      },
      attacker.privateKeyPem,
      attacker.publicKeyPem,
    );
    assert.equal(verifyDecisionToken(token, NOW), true, "verifyDecisionToken unpinned: self-check passes");
    assert.equal(verifyDecisionToken(token, NOW, honest.publicKeyPem), false);

    const bundle = makeDisputeBundle({
      manifestCanonical: "m",
      receiptCanonical: "r",
      deliveryBytes: Buffer.from("x"),
      acceptanceCriteriaHash: TEST_HASH_OTHER,
    });
    assert.equal(verifyDisputeBundle(bundle), true, "verifyDisputeBundle is hash consistency, not a signature");
  });
});
