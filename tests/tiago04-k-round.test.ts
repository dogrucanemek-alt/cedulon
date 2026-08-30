import { TEST_HASH } from "./hash-fixtures.ts";
import { createHash } from "node:crypto";
import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import { audit } from "@cedulon/audit";
import {
  MemoryTransparencyService,
  applyInclusionProof,
  buildCheckpointClaims,
  signCheckpoint,
  verifyInclusionReceipt,
} from "@cedulon/checkpoint";
import { generateManifestKeys, signManifest } from "@cedulon/manifest";
import {
  counterSign,
  countersignDeliveredHashHex,
  generateReceiptKeys,
  signReceipt,
  verifyCounterSignature,
} from "@cedulon/receipts";
import { generateExtractKeys, signRailExtract } from "@cedulon/x402-adapter";

const NOW = 1_700_000_000_000;
const WINDOW_END = NOW + 3_600_000;

function settledReceipt(
  keys: { privateKeyPem: string; publicKeyPem: string },
  payee = "payee-1",
) {
  return signReceipt(
    {
      payer: "payer",
      payee,
      amount: "1",
      currency: "USD",
      policyHash: TEST_HASH,
      manifestHash: null,
      noManifest: true,
      x402PaymentRef: "ref-ok",
      timestampMs: NOW,
      nonce: "n0".padEnd(16, "-"),
      prevReceiptHash: null,
      outcome: "settled",
    },
    keys.privateKeyPem,
    keys.publicKeyPem,
  );
}

describe("Tiago -04 K8 deliveredHash (decided)", () => {
  it("matching deliveredHash on an attributable countersign is silent", () => {
    const honest = generateReceiptKeys();
    const payee = generateReceiptKeys();
    const merchant = generateManifestKeys();
    const rail = generateExtractKeys();
    const manifest = signManifest(
      {
        description: "terms",
        amount: "1",
        currency: "USD",
        acceptanceCriteriaHash: TEST_HASH,
        cancelCondition: "none",
        expiresAtMs: NOW + 60_000,
      },
      merchant.privateKeyPem,
      merchant.publicKeyPem,
    );
    const receipt = counterSign(
      settledReceipt(honest),
      payee.privateKeyPem,
      payee.publicKeyPem,
      honest.publicKeyPem,
      TEST_HASH,
    );
    assert.equal(countersignDeliveredHashHex(receipt), TEST_HASH);
    const extract = signRailExtract(
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
    const report = audit({
      receipts: [receipt],
      checkpoints: [signCheckpoint(buildCheckpointClaims(1, [receipt], NOW, WINDOW_END, null), honest.privateKeyPem, honest.publicKeyPem)],
      extract,
      manifest,
      manifestTrust: { publicKeyPem: merchant.publicKeyPem },
      issuerTrust: { publicKeyPem: honest.publicKeyPem },
      payeeTrust: { "payee-1": payee.publicKeyPem },
      trust: {
        publicKeyPem: rail.publicKeyPem,
        accountId: "acct",
        railId: "rail",
        windowStartMs: NOW,
        windowEndMs: WINDOW_END,
      },
    });
    assert.equal(report.findings.some((f) => f.code === "delivery-mismatch"), false);
  });

  it("mismatched deliveredHash on an attributable countersign is delivery-mismatch", () => {
    const honest = generateReceiptKeys();
    const payee = generateReceiptKeys();
    const merchant = generateManifestKeys();
    const rail = generateExtractKeys();
    const other = "a".repeat(64);
    const manifest = signManifest(
      {
        description: "terms",
        amount: "1",
        currency: "USD",
        acceptanceCriteriaHash: TEST_HASH,
        cancelCondition: "none",
        expiresAtMs: NOW + 60_000,
      },
      merchant.privateKeyPem,
      merchant.publicKeyPem,
    );
    const receipt = counterSign(
      settledReceipt(honest),
      payee.privateKeyPem,
      payee.publicKeyPem,
      honest.publicKeyPem,
      other,
    );
    const extract = signRailExtract(
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
    const report = audit({
      receipts: [receipt],
      checkpoints: [signCheckpoint(buildCheckpointClaims(1, [receipt], NOW, WINDOW_END, null), honest.privateKeyPem, honest.publicKeyPem)],
      extract,
      manifest,
      manifestTrust: { publicKeyPem: merchant.publicKeyPem },
      issuerTrust: { publicKeyPem: honest.publicKeyPem },
      payeeTrust: { "payee-1": payee.publicKeyPem },
      trust: {
        publicKeyPem: rail.publicKeyPem,
        accountId: "acct",
        railId: "rail",
        windowStartMs: NOW,
        windowEndMs: WINDOW_END,
      },
    });
    assert.equal(report.findings.some((f) => f.code === "delivery-mismatch"), true);
    assert.equal(report.ok, false);
  });

  it("deliveredHash on garbage countersign is discarded and does not change ok", () => {
    const honest = generateReceiptKeys();
    const payee = generateReceiptKeys();
    const junk = generateReceiptKeys();
    const merchant = generateManifestKeys();
    const rail = generateExtractKeys();
    const manifest = signManifest(
      {
        description: "terms",
        amount: "1",
        currency: "USD",
        acceptanceCriteriaHash: TEST_HASH,
        cancelCondition: "none",
        expiresAtMs: NOW + 60_000,
      },
      merchant.privateKeyPem,
      merchant.publicKeyPem,
    );
    const base = settledReceipt(honest);
    const honestCs = counterSign(base, payee.privateKeyPem, payee.publicKeyPem, honest.publicKeyPem, TEST_HASH);
    const garbage = counterSign(base, junk.privateKeyPem, junk.publicKeyPem, honest.publicKeyPem, "b".repeat(64));
    const extract = signRailExtract(
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
    const pins = {
      extract,
      manifest,
      manifestTrust: { publicKeyPem: merchant.publicKeyPem },
      issuerTrust: { publicKeyPem: honest.publicKeyPem },
      payeeTrust: { "payee-1": payee.publicKeyPem },
      trust: {
        publicKeyPem: rail.publicKeyPem,
        accountId: "acct",
        railId: "rail",
        windowStartMs: NOW,
        windowEndMs: WINDOW_END,
      },
    };
    const clean = audit({
      receipts: [honestCs],
      checkpoints: [signCheckpoint(buildCheckpointClaims(1, [honestCs], NOW, WINDOW_END, null), honest.privateKeyPem, honest.publicKeyPem)],
      ...pins,
    });
    const dirty = audit({
      receipts: [garbage],
      checkpoints: [signCheckpoint(buildCheckpointClaims(1, [garbage], NOW, WINDOW_END, null), honest.privateKeyPem, honest.publicKeyPem)],
      ...pins,
    });
    assert.equal(dirty.findings.some((f) => f.code === "delivery-mismatch"), false);
    assert.equal(dirty.ok, clean.ok);
  });

  it("a countersignature without deliveredHash still verifies (optional member)", () => {
    const honest = generateReceiptKeys();
    const payee = generateReceiptKeys();
    const signed = counterSign(settledReceipt(honest), payee.privateKeyPem, payee.publicKeyPem, honest.publicKeyPem);
    assert.equal(verifyCounterSignature(signed, payee.publicKeyPem), true);
    assert.equal(countersignDeliveredHashHex(signed), null);
  });
});

describe("Tiago -04 K1 layer-2 inclusion (decided)", () => {
  it("an honest proof verifies; a one-byte sibling flip is witness-inclusion-invalid", () => {
    const honest = generateReceiptKeys();
    const rail = generateExtractKeys();
    const receipt = settledReceipt(honest);
    const cp = signCheckpoint(
      buildCheckpointClaims(1, [receipt], NOW, WINDOW_END, null),
      honest.privateKeyPem,
      honest.publicKeyPem,
    );
    const log = new MemoryTransparencyService(honest);
    const inc = log.register(cp.coseHex);
    assert.ok(inc.inclusionProof);
    const extract = signRailExtract(
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
    const base = {
      receipts: [receipt],
      checkpoints: [cp],
      extract,
      issuerTrust: { publicKeyPem: honest.publicKeyPem },
      witnessTrust: { publicKeyPem: honest.publicKeyPem },
      inclusionReceipts: [{ ...inc, checkpoint: cp }],
      trust: {
        publicKeyPem: rail.publicKeyPem,
        accountId: "acct",
        railId: "rail",
        windowStartMs: NOW,
        windowEndMs: WINDOW_END,
      },
    };
    const honestLayer = audit({
      ...base,
      layer2: { candidateStatementHex: cp.coseHex, inclusionProof: inc.inclusionProof },
    });
    assert.equal(honestLayer.findings.some((f) => f.code === "witness-inclusion-invalid"), false);
    assert.equal(honestLayer.warnings.some((w) => w.code === "witness-inclusion-not-exercised"), false);
    const flipped = {
      ...inc.inclusionProof!,
      siblings: inc.inclusionProof!.siblings.map((s, i) =>
        i === 0 ? (s.startsWith("00") ? `01${s.slice(2)}` : `00${s.slice(2)}`) : s,
      ),
    };
    if (flipped.siblings.length === 0) {
      flipped.siblings = ["11".repeat(32)];
    }
    const broken = audit({
      ...base,
      layer2: { candidateStatementHex: cp.coseHex, inclusionProof: flipped },
    });
    assert.equal(broken.findings.some((f) => f.code === "witness-inclusion-invalid"), true);
  });

  it("the old path without a proof is named witness-inclusion-not-exercised", () => {
    const honest = generateReceiptKeys();
    const rail = generateExtractKeys();
    const receipt = settledReceipt(honest);
    const cp = signCheckpoint(
      buildCheckpointClaims(1, [receipt], NOW, WINDOW_END, null),
      honest.privateKeyPem,
      honest.publicKeyPem,
    );
    const log = new MemoryTransparencyService(honest);
    const inc = log.register(cp.coseHex);
    const extract = signRailExtract(
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
    const report = audit({
      receipts: [receipt],
      checkpoints: [cp],
      extract,
      issuerTrust: { publicKeyPem: honest.publicKeyPem },
      witnessTrust: { publicKeyPem: honest.publicKeyPem },
      inclusionReceipts: [{ ...inc, checkpoint: cp }],
      trust: {
        publicKeyPem: rail.publicKeyPem,
        accountId: "acct",
        railId: "rail",
        windowStartMs: NOW,
        windowEndMs: WINDOW_END,
      },
    });
    assert.equal(
      report.warnings.some((w) => w.code === "witness-inclusion-not-exercised"),
      true,
    );
  });

  it("a forged root/proof pair does not pass the witness signature", () => {
    const honest = generateReceiptKeys();
    const attacker = generateReceiptKeys();
    const receipt = settledReceipt(honest);
    const cp = signCheckpoint(
      buildCheckpointClaims(1, [receipt], NOW, WINDOW_END, null),
      honest.privateKeyPem,
      honest.publicKeyPem,
    );
    const forgedLog = new MemoryTransparencyService(attacker);
    const forged = forgedLog.register(cp.coseHex);
    const leaf = createHash("sha256").update(Buffer.from(cp.coseHex, "hex")).digest("hex");
    assert.equal(applyInclusionProof(leaf, forged.inclusionProof!), forged.treeHead);
    const report = audit({
      receipts: [receipt],
      checkpoints: [cp],
      issuerTrust: { publicKeyPem: honest.publicKeyPem },
      witnessTrust: { publicKeyPem: honest.publicKeyPem },
      inclusionReceipts: [forged],
      layer2: { candidateStatementHex: cp.coseHex, inclusionProof: forged.inclusionProof },
    });
    assert.equal(report.findings.some((f) => f.code === "witness-inclusion-invalid"), true);
  });

  it("an old inclusion receipt without inclusionProof still verifies as a signature", () => {
    const honest = generateReceiptKeys();
    const log = new MemoryTransparencyService(honest);
    const receipt = settledReceipt(honest);
    const inc = log.register(receipt.coseHex!);
    const { inclusionProof: _proof, ...legacy } = inc;
    assert.equal(verifyInclusionReceipt(legacy, honest.publicKeyPem), true);
    void _proof;
  });
});
