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
  verifyInclusionEnvelope,
} from "@cedulon/checkpoint";
import {
  buildInclusionProof,
  merkleRoot,
  rfc9162InclusionProof,
  rfc9162LeafHash,
  rfc9162Root,
  rfc9162VerifyInclusion,
} from "@cedulon/checkpoint";
import { generateManifestKeys, manifestHash, signManifest } from "@cedulon/manifest";
import {
  counterSign,
  countersignDeliveredHashHex,
  generateReceiptKeys,
  signReceipt,
  verifyCounterSignature,
} from "@cedulon/receipts";
import { generateExtractKeys, signRailExtract } from "@cedulon/x402-adapter";
import { CTY_INCLUSION, cborMap, encodeCbor, signCoseSign1 } from "@cedulon/cose";

const NOW = 1_700_000_000_000;
const WINDOW_END = NOW + 3_600_000;

function settledReceipt(
  keys: { privateKeyPem: string; publicKeyPem: string },
  payee = "payee-1",
  names: string | null = null,
) {
  return signReceipt(
    {
      payer: "payer",
      payee,
      amount: "1",
      currency: "USD",
      policyHash: TEST_HASH,
      manifestHash: names,
      noManifest: names === null,
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
      settledReceipt(honest, "payee-1", manifestHash(manifest)),
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
      settledReceipt(honest, "payee-1", manifestHash(manifest)),
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
    const base = settledReceipt(honest, "payee-1", manifestHash(manifest));
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

// Tiago, core-04 reading (22 Oct 2026), point 2: the delivery comparison is
// asked only of receipts that name the presented manifest, as MUST-T8-9 is, and
// never of a manifest a stated publisher pin refused.
describe("Tiago core-04 #2: deliveredHash is compared only against the manifest the receipt names", () => {
  function terms(keys: { privateKeyPem: string; publicKeyPem: string }, description = "terms") {
    return signManifest(
      {
        description,
        amount: "1",
        currency: "USD",
        acceptanceCriteriaHash: TEST_HASH,
        cancelCondition: "none",
        expiresAtMs: NOW + 60_000,
      },
      keys.privateKeyPem,
      keys.publicKeyPem,
    );
  }

  function run(names: string | null, presented: ReturnType<typeof signManifest>, publisherPin: string) {
    const honest = generateReceiptKeys();
    const payee = generateReceiptKeys();
    const rail = generateExtractKeys();
    const receipt = counterSign(
      settledReceipt(honest, "payee-1", names),
      payee.privateKeyPem,
      payee.publicKeyPem,
      honest.publicKeyPem,
      "a".repeat(64),
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
    return audit({
      receipts: [receipt],
      checkpoints: [signCheckpoint(buildCheckpointClaims(1, [receipt], NOW, WINDOW_END, null), honest.privateKeyPem, honest.publicKeyPem)],
      extract,
      manifest: presented,
      manifestTrust: { publicKeyPem: publisherPin },
      issuerTrust: { publicKeyPem: honest.publicKeyPem },
      payeeTrust: { "payee-1": payee.publicKeyPem },
      trust: { publicKeyPem: rail.publicKeyPem, accountId: "acct", railId: "rail", windowStartMs: NOW, windowEndMs: WINDOW_END },
    });
  }

  it("a noManifest receipt is not compared with the presented manifest", () => {
    const merchant = generateManifestKeys();
    const report = run(null, terms(merchant), merchant.publicKeyPem);
    assert.equal(report.findings.some((f) => f.code === "delivery-mismatch"), false);
  });

  it("a receipt that names a different manifest is not compared with the presented one", () => {
    const merchant = generateManifestKeys();
    const elsewhere = manifestHash(terms(merchant, "another deal"));
    const report = run(elsewhere, terms(merchant), merchant.publicKeyPem);
    assert.equal(report.findings.some((f) => f.code === "delivery-mismatch"), false);
  });

  it("a manifest the publisher pin refused is not compared at all; the refusal stands", () => {
    const merchant = generateManifestKeys();
    const stranger = generateManifestKeys();
    const presented = terms(stranger);
    const report = run(manifestHash(presented), presented, merchant.publicKeyPem);
    assert.equal(report.findings.some((f) => f.code === "delivery-mismatch"), false);
    assert.equal(report.findings.some((f) => f.code === "manifest-key-mismatch"), true);
  });

  it("a receipt that names the presented, accepted manifest is still compared", () => {
    const merchant = generateManifestKeys();
    const presented = terms(merchant);
    const report = run(manifestHash(presented), presented, merchant.publicKeyPem);
    assert.equal(report.findings.some((f) => f.code === "delivery-mismatch"), true);
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
    // MUST-T11-18: HASH(candidate) must equal the receipt leaf. A valid
    // proof for the checkpoint plus a different statement's bytes is not coverage.
    const swapped = audit({
      ...base,
      layer2: { candidateStatementHex: receipt.coseHex!, inclusionProof: inc.inclusionProof },
    });
    assert.equal(
      swapped.findings.some((f) => f.code === "witness-inclusion-invalid"),
      true,
      "proof for A plus candidate B must be witness-inclusion-invalid",
    );
    // The candidate hex is consumed whole: a trailing non-hex suffix used to
    // decode to the same bytes and pass (gate review of 25c24c3, FIX-1).
    const dirtyHex = audit({
      ...base,
      layer2: { candidateStatementHex: `${cp.coseHex}zz`, inclusionProof: inc.inclusionProof },
    });
    assert.equal(
      dirtyHex.findings.some((f) => f.code === "witness-inclusion-invalid"),
      true,
      "a candidate that is not clean hex must be witness-inclusion-invalid",
    );
    // A witness-signed envelope at index 1 with an empty path: the path returns
    // the leaf unchanged, so leaf == treeHead, and only the structural rule
    // (the index must resolve to the root) refuses it (FIX-2).
    const leaf = createHash("sha256").update(Buffer.from(cp.coseHex, "hex")).digest("hex");
    const impossibleCose = signCoseSign1(
      encodeCbor(cborMap([[1, leaf], [2, 1], [3, leaf]])),
      honest.privateKeyPem,
      CTY_INCLUSION,
    );
    const impossible = audit({
      ...base,
      inclusionReceipts: [
        {
          ...inc,
          statementHash: leaf,
          index: 1,
          treeHead: leaf,
          alg: undefined,
          treeSize: undefined,
          coseHex: Buffer.from(impossibleCose).toString("hex"),
          inclusionProof: { leafIndex: 1, siblings: [] },
          checkpoint: cp,
        },
      ],
      layer2: { candidateStatementHex: cp.coseHex, inclusionProof: { leafIndex: 1, siblings: [] } },
    });
    assert.equal(
      impossible.findings.some((f) => f.code === "witness-inclusion-invalid"),
      true,
      "an index that does not resolve to the root must be witness-inclusion-invalid",
    );
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
    // Internally consistent under RFC 9162; the witness pin below is what refuses it.
    assert.equal(
      rfc9162VerifyInclusion(forged.leafHash!, forged.inclusionProof!, forged.treeHead),
      true,
    );
    const leaf = createHash("sha256").update(Buffer.from(cp.coseHex, "hex")).digest("hex");
    // Legacy pad-even proof so the historical applyInclusionProof assert still holds.
    const rfcProof = forged.inclusionProof!;
    const rfcHead = forged.treeHead;
    forged.inclusionProof = buildInclusionProof([leaf], 0);
    forged.treeHead = merkleRoot([leaf]);
    assert.equal(applyInclusionProof(leaf, forged.inclusionProof!), forged.treeHead);
    forged.inclusionProof = rfcProof;
    forged.treeHead = rfcHead;
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
    assert.equal(verifyInclusionEnvelope(legacy, honest.publicKeyPem), true);
    void _proof;
  });

  it("layer-2 proof with an unknown alg is witness-inclusion-invalid", () => {
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
      layer2: {
        candidateStatementHex: cp.coseHex,
        inclusionProof: { ...inc.inclusionProof!, alg: "something-else" as never },
      },
    });
    const finding = report.findings.find((f) => f.code === "witness-inclusion-invalid");
    assert.ok(finding);
    assert.equal(finding!.detail, "layer-2 inclusion proof names an unknown tree algorithm");
  });

  it("layer-2 receipt with a one-bit flipped leafHash is witness-inclusion-invalid", () => {
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
    assert.ok(inc.leafHash);
    assert.ok(inc.inclusionProof);
    const flippedLeaf =
      (inc.leafHash!.startsWith("0") ? "1" : "0") + inc.leafHash!.slice(1);
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
      inclusionReceipts: [{ ...inc, leafHash: flippedLeaf, checkpoint: cp }],
      trust: {
        publicKeyPem: rail.publicKeyPem,
        accountId: "acct",
        railId: "rail",
        windowStartMs: NOW,
        windowEndMs: WINDOW_END,
      },
      layer2: { candidateStatementHex: cp.coseHex, inclusionProof: inc.inclusionProof },
    });
    assert.equal(
      report.findings.some((f) => f.code === "witness-inclusion-invalid"),
      true,
    );
  });

  it("layer-2 proof treeSize from another receipt is witness-inclusion-invalid", () => {
    const honest = generateReceiptKeys();
    const otherKeys = generateReceiptKeys();
    const rail = generateExtractKeys();
    const receipt = settledReceipt(honest);
    const cp = signCheckpoint(
      buildCheckpointClaims(1, [receipt], NOW, WINDOW_END, null),
      honest.privateKeyPem,
      honest.publicKeyPem,
    );
    // Index 0 in a 3-leaf tree: treeSize 3→4 keeps the same path and root (B1).
    const fillers = ["aa", "bb"];
    const leafHashes = [cp.coseHex, ...fillers].map((hex) =>
      rfc9162LeafHash(Buffer.from(hex, "hex")),
    );
    const treeHead = rfc9162Root(leafHashes);
    const inclusionProof = rfc9162InclusionProof(leafHashes, 0);
    const treeSize = 3;
    const statementHash = createHash("sha256").update(Buffer.from(cp.coseHex, "hex")).digest("hex");
    const leafHash = rfc9162LeafHash(Buffer.from(cp.coseHex, "hex"));
    const payload = encodeCbor(
      cborMap([
        [1, statementHash],
        [2, 0],
        [3, treeHead],
        [4, treeSize],
        [5, "rfc9162-sha256"],
      ]),
    );
    const inc = {
      statementHash,
      leafHash,
      index: 0,
      treeHead,
      treeSize,
      alg: "rfc9162-sha256" as const,
      issuerPublicKeyPem: honest.publicKeyPem,
      coseHex: Buffer.from(signCoseSign1(payload, honest.privateKeyPem, CTY_INCLUSION)).toString("hex"),
      inclusionProof,
      checkpoint: cp,
    };
    const otherLog = new MemoryTransparencyService(otherKeys);
    otherLog.register("aa");
    otherLog.register("bb");
    otherLog.register("cc");
    otherLog.register("dd");
    const foreign = { ...otherLog.register(cp.coseHex), checkpoint: cp };
    assert.notEqual(foreign.treeSize, treeSize);
    // Neighbouring size 4 still walks this path against the size-3 root (B1).
    const borrowed = 4;
    assert.equal(
      rfc9162VerifyInclusion(leafHash, { ...inclusionProof, treeSize: borrowed }, treeHead),
      true,
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
      checkpoints: [cp],
      extract,
      issuerTrust: { publicKeyPem: honest.publicKeyPem },
      witnessTrust: { publicKeyPem: honest.publicKeyPem },
      inclusionReceipts: [inc, foreign],
      trust: {
        publicKeyPem: rail.publicKeyPem,
        accountId: "acct",
        railId: "rail",
        windowStartMs: NOW,
        windowEndMs: WINDOW_END,
      },
      layer2: {
        candidateStatementHex: cp.coseHex,
        inclusionProof: { ...inclusionProof, treeSize: borrowed },
      },
    });
    assert.equal(
      report.findings.some((f) => f.code === "witness-inclusion-invalid"),
      true,
      JSON.stringify(report.findings),
    );
  });
});
