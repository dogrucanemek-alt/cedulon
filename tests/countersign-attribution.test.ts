import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { audit, type Finding } from "@cedulon/audit";
import { buildCheckpointClaims, signCheckpoint } from "@cedulon/checkpoint";
import { coseDecodeRefusalHex } from "@cedulon/cose";
import {
  counterSign,
  generateReceiptKeys,
  signReceipt,
  type SignedReceipt,
} from "@cedulon/receipts";
import { generateExtractKeys, signRailExtract } from "@cedulon/x402-adapter";

const NOW = 1_700_000_000_000;
const WINDOW_END = NOW + 3_600_000;

type Keys = { privateKeyPem: string; publicKeyPem: string };

function receiptFor(keys: Keys, ref: string, i: number): SignedReceipt {
  return signReceipt(
    {
      payer: "payer",
      payee: "payee-1",
      amount: "1",
      currency: "USD",
      policyHash: "policy-hash",
      manifestHash: null,
      noManifest: true,
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

function railWith(rail: Keys) {
  return signRailExtract(
    {
      accountId: "acct",
      railId: "rail",
      windowStartMs: NOW,
      windowEndMs: WINDOW_END,
      settlements: [{ ref: "ref-ok", amount: "1", currency: "USD", timestampMs: NOW }],
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

function findingBytes(findings: Finding[]): string {
  return JSON.stringify(findings.map((f) => ({ code: f.code, id: f.id, detail: f.detail })));
}

function named(report: { findings: Finding[]; warnings: Finding[] }, code: string): boolean {
  return [...report.findings, ...report.warnings].some((f) => f.code === code);
}

describe("countersignature attribution (break 6)", () => {
  // A countersignature travels beside the issuer signature. Anyone holding an
  // honest receipt can append one. An unverified countersignature under a pinned
  // payee key cannot be attributed to that payee, so it is discarded as approval
  // evidence. Adding one must not change the audit's fail/pass result.

  it("RED then GREEN: appending garbage does not change an honest audit's findings", () => {
    const honest = generateReceiptKeys();
    const attacker = generateReceiptKeys();
    const rail = generateExtractKeys();
    const plain = receiptFor(honest, "ref-ok", 0);
    const extract = railWith(rail);
    const base = {
      checkpoints: [checkpointFor(honest, [plain])],
      extract,
      trust: railPin(rail),
      issuerTrust: { publicKeyPem: honest.publicKeyPem },
    };

    const honestReport = audit({ ...base, receipts: [plain] });
    assert.equal(honestReport.ok, true);
    assert.deepEqual(honestReport.findings.map((f) => f.code), []);

    const forged = counterSign(plain, attacker.privateKeyPem, attacker.publicKeyPem);
    const raw = Buffer.from(forged.counterCoseHex ?? "", "hex");
    raw[raw.length - 1] ^= 0x01;
    const garbage = { ...plain, counterCoseHex: raw.toString("hex"), payeePublicKeyPem: attacker.publicKeyPem };

    const after = audit({ ...base, receipts: [garbage] });
    assert.equal(after.ok, honestReport.ok, "adding a countersignature must not change fail/pass");
    assert.equal(
      findingBytes(after.findings),
      findingBytes(honestReport.findings),
      "findings must be identical; countersignature noise belongs in warnings",
    );
    assert.ok(named(after, "countersign-bad"), "the discarded countersignature is named");
  });

  it("RED then GREEN: a pinned payee still owes a word when the countersignature is garbage", () => {
    const honest = generateReceiptKeys();
    const payee = generateReceiptKeys();
    const attacker = generateReceiptKeys();
    const rail = generateExtractKeys();
    const plain = receiptFor(honest, "ref-ok", 0);
    const extract = railWith(rail);
    const base = {
      checkpoints: [checkpointFor(honest, [plain])],
      extract,
      trust: railPin(rail),
      issuerTrust: { publicKeyPem: honest.publicKeyPem },
      payeeTrust: { "payee-1": payee.publicKeyPem },
    };

    const missing = audit({ ...base, receipts: [plain] });
    assert.ok(named(missing, "countersign-missing"));

    const forged = counterSign(plain, attacker.privateKeyPem, attacker.publicKeyPem, honest.publicKeyPem);
    const raw = Buffer.from(forged.counterCoseHex ?? "", "hex");
    raw[raw.length - 1] ^= 0x01;
    const garbage = { ...plain, counterCoseHex: raw.toString("hex"), payeePublicKeyPem: attacker.publicKeyPem };
    const after = audit({ ...base, receipts: [garbage] });

    assert.equal(after.ok, missing.ok);
    assert.equal(findingBytes(after.findings), findingBytes(missing.findings));
    assert.ok(named(after, "countersign-bad"));
    assert.ok(
      named(after, "countersign-missing"),
      "garbage is not the payee's word, so the expectation stays open",
    );
  });

  it("RED then GREEN: a valid countersignature under the pinned key is still approval", () => {
    const honest = generateReceiptKeys();
    const payee = generateReceiptKeys();
    const rail = generateExtractKeys();
    const plain = receiptFor(honest, "ref-ok", 0);
    const signed = counterSign(plain, payee.privateKeyPem, payee.publicKeyPem, honest.publicKeyPem);
    const report = audit({
      receipts: [signed],
      checkpoints: [checkpointFor(honest, [plain])],
      extract: railWith(rail),
      trust: railPin(rail),
      issuerTrust: { publicKeyPem: honest.publicKeyPem },
      payeeTrust: { "payee-1": payee.publicKeyPem },
    });
    assert.equal(report.ok, true);
    assert.deepEqual(report.findings.map((f) => f.code), []);
    assert.equal(named(report, "countersign-bad"), false);
    assert.equal(named(report, "countersign-key-mismatch"), false);
    assert.equal(named(report, "countersign-missing"), false);
    assert.equal(named(report, "unauthenticated-countersigner"), false);
  });

  it("RED then GREEN: a valid countersignature from the wrong key is discarded, not a fail", () => {
    const honest = generateReceiptKeys();
    const payee = generateReceiptKeys();
    const attacker = generateReceiptKeys();
    const rail = generateExtractKeys();
    const plain = receiptFor(honest, "ref-ok", 0);
    const forged = counterSign(plain, attacker.privateKeyPem, attacker.publicKeyPem, honest.publicKeyPem);
    const report = audit({
      receipts: [forged],
      checkpoints: [checkpointFor(honest, [plain])],
      extract: railWith(rail),
      trust: railPin(rail),
      issuerTrust: { publicKeyPem: honest.publicKeyPem },
      payeeTrust: { "payee-1": payee.publicKeyPem },
    });
    assert.equal(report.ok, true);
    assert.deepEqual(report.findings.map((f) => f.code), []);
    assert.ok(named(report, "countersign-key-mismatch"));
    assert.ok(named(report, "countersign-missing"));
  });

  it("RED then GREEN: decoder-bound countersignature refusals stay named (MUST-T4-18/19)", () => {
    const honest = generateReceiptKeys();
    const oversized = {
      ...receiptFor(honest, "ref-ok", 0),
      counterCoseHex: "00".repeat(70_000),
      payeePublicKeyPem: honest.publicKeyPem,
    };
    const large = audit({ receipts: [oversized], checkpoints: [] });
    const largeNamed = [...large.findings, ...large.warnings].find(
      (f) => f.code === "countersign-bad" && f.detail.includes("cbor-too-large"),
    );
    assert.ok(largeNamed, "cbor-too-large must stay on countersign-bad");

    const dupHex = "8445a201010102a041004100";
    assert.equal(coseDecodeRefusalHex(dupHex), "cbor-duplicate-key");
    const duplicate = {
      ...receiptFor(honest, "ref-ok", 1),
      counterCoseHex: dupHex,
      payeePublicKeyPem: honest.publicKeyPem,
    };
    const dup = audit({ receipts: [duplicate], checkpoints: [] });
    const dupNamed = [...dup.findings, ...dup.warnings].find(
      (f) => f.code === "countersign-bad" && f.detail.includes("cbor-duplicate-key"),
    );
    assert.ok(dupNamed, "cbor-duplicate-key must stay on countersign-bad");
  });
})
