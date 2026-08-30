import { TEST_HASH } from "./hash-fixtures.ts";
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { audit, type Finding } from "@cedulon/audit";
import { buildCheckpointClaims, signCheckpoint } from "@cedulon/checkpoint";
import { decodeCoseSign1, decodeProtectedHeader, hexToBytes, kidFromPublicKeyPem } from "@cedulon/cose";
import { generateReceiptKeys, signReceipt, type SignedReceipt } from "@cedulon/receipts";
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
      policyHash: TEST_HASH,
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

function railWith(rail: Keys, ref: string) {
  return signRailExtract(
    {
      accountId: "acct",
      railId: "rail",
      windowStartMs: NOW,
      windowEndMs: WINDOW_END,
      settlements: [{ ref, amount: "1", currency: "USD", timestampMs: NOW + 600_000 }],
    },
    rail.privateKeyPem,
    rail.publicKeyPem,
  );
}

function pin(issuer: Keys, rail: Keys) {
  return {
    issuerTrust: { publicKeyPem: issuer.publicKeyPem },
    trust: {
      publicKeyPem: rail.publicKeyPem,
      accountId: "acct",
      railId: "rail",
      windowStartMs: NOW,
      windowEndMs: WINDOW_END,
    },
  };
}

function tamperSig(receipt: SignedReceipt): SignedReceipt {
  const raw = Buffer.from(receipt.coseHex!, "hex");
  raw[raw.length - 1] ^= 0xff;
  return { ...receipt, coseHex: raw.toString("hex") };
}

function named(report: { findings: Finding[]; warnings: Finding[] }, code: string): boolean {
  return [...report.findings, ...report.warnings].some((f) => f.code === code);
}

function kidOf(receipt: SignedReceipt): Uint8Array {
  return decodeProtectedHeader(decodeCoseSign1(hexToBytes(receipt.coseHex!)).protectedHeader).kid;
}

function kidsEqual(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((byte, i) => byte === b[i]);
}

/**
 * Decided 2×2 (K2): kid × signature-under-pin. Carried PEM is not the
 * identity source. Source: K2 matrix + break-6 mirror (appendable surface
 * must not drop honest proof).
 */
describe("issuer pin matrix (decided)", () => {
  it("cell: PEM matches pin and signature verifies under the pin → attested", () => {
    const honest = generateReceiptKeys();
    const rail = generateExtractKeys();
    const receipt = receiptFor(honest, "ref-ok", 0);
    assert.equal(
      kidsEqual(kidOf(receipt), kidFromPublicKeyPem(honest.publicKeyPem)),
      true,
      "honest COSE kid is the pin",
    );
    const report = audit({
      receipts: [receipt],
      checkpoints: [checkpointFor(honest, [receipt])],
      extract: railWith(rail, "ref-ok"),
      ...pin(honest, rail),
    });
    assert.equal(named(report, "issuer-key-mismatch"), false);
    assert.equal(named(report, "receipt-chain-break"), false);
    assert.equal(named(report, "unauthenticated-issuer"), false);
    assert.equal(report.ok, true);
  });

  it("cell: PEM matches pin and signature fails under the pin → attested, receipt-chain-break", () => {
    const honest = generateReceiptKeys();
    const rail = generateExtractKeys();
    const receipt = tamperSig(receiptFor(honest, "ref-ok", 0));
    assert.equal(
      kidsEqual(kidOf(receipt), kidFromPublicKeyPem(honest.publicKeyPem)),
      true,
      "tamper keeps the honest kid",
    );
    const report = audit({
      receipts: [receipt],
      checkpoints: [checkpointFor(honest, [receipt])],
      extract: railWith(rail, "ref-ok"),
      ...pin(honest, rail),
    });
    assert.equal(named(report, "issuer-key-mismatch"), false, "PEM still matches the pin");
    assert.equal(named(report, "receipt-chain-break"), true);
    assert.ok(
      report.findings.some((f) => f.code === "receipt-chain-break" && f.detail.includes("signature failed")),
    );
    assert.equal(report.ok, false);
  });

  it("cell: PEM ≠ pin, self-signature valid under the foreign key → issuer-key-mismatch, not attested", () => {
    const honest = generateReceiptKeys();
    const foreign = generateReceiptKeys();
    const rail = generateExtractKeys();
    const receipt = receiptFor(foreign, "ref-ok", 0);
    assert.equal(
      kidsEqual(kidOf(receipt), kidFromPublicKeyPem(honest.publicKeyPem)),
      false,
      "foreign kid is not the pin",
    );
    const report = audit({
      receipts: [receipt],
      checkpoints: [],
      extract: railWith(rail, "ref-ok"),
      ...pin(honest, rail),
    });
    assert.equal(named(report, "issuer-key-mismatch"), true);
    assert.equal(named(report, "unauthenticated-issuer"), false);
    assert.equal(
      report.findings.some((f) => f.code === "settlement-without-receipt"),
      true,
      "a rejected receipt is not coverage",
    );
    assert.equal(report.ok, false);
  });

  it("cell: PEM ≠ pin and the signature is also invalid → issuer-key-mismatch", () => {
    const honest = generateReceiptKeys();
    const foreign = generateReceiptKeys();
    const rail = generateExtractKeys();
    const receipt = tamperSig(receiptFor(foreign, "ref-ok", 0));
    const report = audit({
      receipts: [receipt],
      checkpoints: [],
      extract: railWith(rail, "ref-ok"),
      ...pin(honest, rail),
    });
    assert.equal(named(report, "issuer-key-mismatch"), true);
    assert.equal(
      named(report, "receipt-chain-break"),
      false,
      "rejected receipts are not walked as the issuer chain",
    );
  });

  it("unpinned: carried-key verification is not evidence → unauthenticated-issuer, whole list weighed", () => {
    const honest = generateReceiptKeys();
    const rail = generateExtractKeys();
    const receipt = receiptFor(honest, "ref-ok", 0);
    const report = audit({
      receipts: [receipt],
      checkpoints: [checkpointFor(honest, [receipt])],
      extract: railWith(rail, "ref-ok"),
      trust: {
        publicKeyPem: rail.publicKeyPem,
        accountId: "acct",
        railId: "rail",
        windowStartMs: NOW,
        windowEndMs: WINDOW_END,
      },
    });
    assert.equal(named(report, "unauthenticated-issuer"), true);
    assert.equal(named(report, "issuer-key-mismatch"), false);
    assert.equal(report.ok, true, "the books still balance against the carried key");
    assert.equal(report.guarantee, "conditional");
  });

  it("decided: swapping carried PEM off an honest COSE stays attested (pin-under-signature)", () => {
    const honest = generateReceiptKeys();
    const attacker = generateReceiptKeys();
    const rail = generateExtractKeys();
    const honestReceipt = receiptFor(honest, "ref-ok", 0);
    const honestReport = audit({
      receipts: [honestReceipt],
      checkpoints: [],
      extract: railWith(rail, "ref-ok"),
      ...pin(honest, rail),
    });
    const swapped: SignedReceipt = { ...honestReceipt, publicKeyPem: attacker.publicKeyPem };
    assert.equal(
      kidsEqual(kidOf(swapped), kidFromPublicKeyPem(honest.publicKeyPem)),
      true,
      "COSE kid still names the pin",
    );
    const report = audit({
      receipts: [swapped],
      checkpoints: [],
      extract: railWith(rail, "ref-ok"),
      ...pin(honest, rail),
    });
    const hard = (r: { findings: Finding[] }) =>
      JSON.stringify(r.findings.map((f) => ({ code: f.code, id: f.id, detail: f.detail })));
    assert.equal(hard(report), hard(honestReport), "findings other than warnings stay byte-identical");
    assert.equal(report.ok, honestReport.ok);
    assert.equal(named(report, "issuer-key-mismatch"), false);
    assert.equal(
      report.warnings.some((w) => w.code === "carried-key-mismatch"),
      true,
    );
  });

  it("decided: pin-invalid with a matching kid is still dropped", () => {
    const honest = generateReceiptKeys();
    const attacker = generateReceiptKeys();
    const rail = generateExtractKeys();
    const foreign = receiptFor(attacker, "ref-ok", 0);
    const report = audit({
      receipts: [foreign],
      checkpoints: [],
      extract: railWith(rail, "ref-ok"),
      ...pin(honest, rail),
    });
    assert.equal(named(report, "issuer-key-mismatch"), true);
    assert.equal(report.ok, false);
  });
});
