import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { audit, auditWindows, findWindowCoverage } from "@cedulon/audit";
import {
  MemoryTransparencyService,
  anchorCheckpoint,
  buildCheckpointClaims,
  checkpointHash,
  checkpointToCbor,
  signCheckpoint,
  verifyCheckpoint,
  verifyCheckpointUnderPin,
  type CheckpointClaims,
  type SignedCheckpoint,
} from "@cedulon/checkpoint";
import {
  CTY_CHECKPOINT,
  cborMap,
  encodeCbor,
  fixtureEd25519Pems,
  signCoseSign1,
} from "@cedulon/cose";
import { generateReceiptKeys } from "@cedulon/receipts";
import { generateExtractKeys, signRailExtract } from "@cedulon/x402-adapter";

const CHECKPOINT_CLAIM = {
  epoch: -70101,
  startMs: -70102,
  endMs: -70103,
  receiptCount: -70104,
  chainHeadHash: -70105,
  totals: -70106,
  prevCheckpointHash: -70107,
} as const;

const START = 1_700_000_000_000;
const END = 1_700_000_001_000;

function emptyClaims(overrides: Partial<CheckpointClaims> = {}): CheckpointClaims {
  return {
    epoch: 1,
    startMs: START,
    endMs: END,
    receiptCount: 0,
    chainHeadHash: null,
    totals: {},
    prevCheckpointHash: null,
    ...overrides,
  };
}

function signedEmpty(overrides: Partial<CheckpointClaims> = {}): SignedCheckpoint {
  const k = generateReceiptKeys();
  return signCheckpoint(emptyClaims(overrides), k.privateKeyPem, k.publicKeyPem);
}

/** Bypass encode/sign uint gates so tests can mint deliberately non-uint payloads. */
function signCheckpointClaimsRaw(
  claims: CheckpointClaims,
  privateKeyPem: string,
  publicKeyPem: string,
): SignedCheckpoint {
  const payload = encodeCbor(
    cborMap([
      [CHECKPOINT_CLAIM.epoch, claims.epoch],
      [CHECKPOINT_CLAIM.startMs, claims.startMs],
      [CHECKPOINT_CLAIM.endMs, claims.endMs],
      [CHECKPOINT_CLAIM.receiptCount, claims.receiptCount],
      [CHECKPOINT_CLAIM.chainHeadHash, claims.chainHeadHash],
      [CHECKPOINT_CLAIM.totals, claims.totals === null ? null : cborMap([])],
      [CHECKPOINT_CLAIM.prevCheckpointHash, claims.prevCheckpointHash],
    ]),
  );
  const cose = signCoseSign1(payload, privateKeyPem, CTY_CHECKPOINT);
  return {
    claims,
    publicKeyPem,
    encoding: "cose",
    coseHex: Buffer.from(cose).toString("hex"),
  };
}

function emptyExtract() {
  const ek = generateExtractKeys();
  return signRailExtract(
    {
      accountId: "acct",
      railId: "rail",
      windowStartMs: START,
      windowEndMs: END,
      settlements: [],
    },
    ek.privateKeyPem,
    ek.publicKeyPem,
  );
}

function hasSignatureFailed(findings: ReadonlyArray<{ code: string; detail: string }>): boolean {
  return findings.some(
    (f) => f.code === "checkpoint-total-mismatch" && /signature failed/.test(f.detail),
  );
}

describe("checkpoint coseHex is consumed as strict lowercase hex", () => {
  it("a trailing zz suffix does not verify as the original checkpoint", () => {
    const signed = signedEmpty();
    assert.equal(verifyCheckpoint(signed), true);
    const dirty = { ...signed, coseHex: `${signed.coseHex}zz` };
    assert.equal(verifyCheckpoint(dirty), false);
    assert.equal(verifyCheckpointUnderPin(dirty, signed.publicKeyPem), false);
  });

  it("odd-length hex, uppercase hex, and the empty string do not verify", () => {
    const signed = signedEmpty();
    for (const coseHex of [`${signed.coseHex}a`, signed.coseHex.toUpperCase(), ""]) {
      const dirty = { ...signed, coseHex };
      assert.equal(verifyCheckpoint(dirty), false, JSON.stringify(coseHex));
      assert.equal(verifyCheckpointUnderPin(dirty, signed.publicKeyPem), false, JSON.stringify(coseHex));
    }
  });

  it("checkpointHash refuses coseHex that is not clean hex", () => {
    const signed = signedEmpty();
    assert.equal(typeof checkpointHash(signed), "string");
    for (const coseHex of [`${signed.coseHex}zz`, `${signed.coseHex}a`, signed.coseHex.toUpperCase(), ""]) {
      assert.throws(() => checkpointHash({ ...signed, coseHex }), /cose-hex/, JSON.stringify(coseHex));
    }
  });
});

describe("checkpoint uint claims reject negatives", () => {
  for (const field of ["epoch", "startMs", "endMs", "receiptCount"] as const) {
    it(`a well-signed checkpoint with ${field} = -1 does not verify`, () => {
      const k = generateReceiptKeys();
      const signed = signCheckpointClaimsRaw(
        emptyClaims({ [field]: -1 }),
        k.privateKeyPem,
        k.publicKeyPem,
      );
      assert.equal(verifyCheckpoint(signed), false);
      assert.equal(verifyCheckpointUnderPin(signed, signed.publicKeyPem), false);
    });

    it(`signCheckpoint and checkpointToCbor refuse ${field} = -1 as checkpoint-uint`, () => {
      const claims = emptyClaims({ [field]: -1 });
      assert.throws(() => checkpointToCbor(claims), /checkpoint-uint/);
      const k = generateReceiptKeys();
      assert.throws(
        () => signCheckpoint(claims, k.privateKeyPem, k.publicKeyPem),
        /checkpoint-uint/,
      );
    });
  }
});

describe("findWindowCoverage does not invent a length rule the draft omits", () => {
  it("startMs === endMs is not window-coverage", () => {
    const k = generateReceiptKeys();
    const cp = signCheckpoint(
      buildCheckpointClaims(1, [], 100, 100, null),
      k.privateKeyPem,
      k.publicKeyPem,
    );
    const findings = findWindowCoverage([], [cp]);
    assert.equal(
      findings.some((f) => f.code === "window-coverage" && f.id === "epoch-1-bounds"),
      false,
      JSON.stringify(findings),
    );
  });

  it("endMs < startMs is not window-coverage", () => {
    const k = generateReceiptKeys();
    const cp = signCheckpoint(
      buildCheckpointClaims(2, [], 200, 100, null),
      k.privateKeyPem,
      k.publicKeyPem,
    );
    const findings = findWindowCoverage([], [cp]);
    assert.equal(
      findings.some((f) => f.code === "window-coverage" && f.id === "epoch-2-bounds"),
      false,
      JSON.stringify(findings),
    );
  });
});

describe("audit does not throw when checkpointHash would refuse dirty coseHex", () => {
  it("a presented checkpoint whose coseHex gains a zz suffix returns a hard finding", () => {
    const k = generateReceiptKeys();
    const signed = signCheckpoint(
      buildCheckpointClaims(1, [], START, END, null),
      k.privateKeyPem,
      k.publicKeyPem,
    );
    const dirty = { ...signed, coseHex: `${signed.coseHex}zz` };
    const witnessTrust = { publicKeyPem: fixtureEd25519Pems().publicKeyPem };
    let report!: ReturnType<typeof audit>;
    assert.doesNotThrow(() => {
      report = audit({
        receipts: [],
        checkpoints: [dirty],
        inclusionReceipts: [],
        witnessTrust,
      });
    });
    assert.equal(report.ok, false);
    assert.equal(hasSignatureFailed(report.findings), true, JSON.stringify(report.findings));
  });

  it("a witness inclusion body whose coseHex gains a zz suffix returns a hard finding", () => {
    const k = generateReceiptKeys();
    const signed = signCheckpoint(
      buildCheckpointClaims(1, [], START, END, null),
      k.privateKeyPem,
      k.publicKeyPem,
    );
    const dirty = { ...signed, coseHex: `${signed.coseHex}zz` };
    const ts = new MemoryTransparencyService(fixtureEd25519Pems());
    const inc = { ...anchorCheckpoint(ts, signed), checkpoint: dirty };
    let report!: ReturnType<typeof audit>;
    assert.doesNotThrow(() => {
      report = audit({
        receipts: [],
        checkpoints: [dirty],
        inclusionReceipts: [inc],
        witnessTrust: { publicKeyPem: ts.publicKeyPem },
      });
    });
    assert.equal(report.ok, false);
    assert.equal(hasSignatureFailed(report.findings), true, JSON.stringify(report.findings));
  });

  it("auditWindows does not throw for the dirty presented checkpoint and returns the hard finding", () => {
    const k = generateReceiptKeys();
    const signed = signCheckpoint(
      buildCheckpointClaims(1, [], START, END, null),
      k.privateKeyPem,
      k.publicKeyPem,
    );
    const dirty = { ...signed, coseHex: `${signed.coseHex}zz` };
    const extract = emptyExtract();
    const witnessTrust = { publicKeyPem: fixtureEd25519Pems().publicKeyPem };
    let report!: ReturnType<typeof auditWindows>;
    assert.doesNotThrow(() => {
      report = auditWindows({
        inclusionReceipts: [],
        witnessTrust,
        windows: [{ receipts: [], checkpoints: [dirty], extract }],
      });
    });
    assert.equal(report.ok, false);
    const windowFindings = report.windows.flatMap((w) => w.findings);
    assert.equal(hasSignatureFailed(windowFindings), true, JSON.stringify(windowFindings));
  });

  it("auditWindows does not throw for a dirty witness body and returns the hard finding", () => {
    const k = generateReceiptKeys();
    const signed = signCheckpoint(
      buildCheckpointClaims(1, [], START, END, null),
      k.privateKeyPem,
      k.publicKeyPem,
    );
    const dirty = { ...signed, coseHex: `${signed.coseHex}zz` };
    const ts = new MemoryTransparencyService(fixtureEd25519Pems());
    const inc = { ...anchorCheckpoint(ts, signed), checkpoint: dirty };
    const extract = emptyExtract();
    let report!: ReturnType<typeof auditWindows>;
    assert.doesNotThrow(() => {
      report = auditWindows({
        inclusionReceipts: [inc],
        witnessTrust: { publicKeyPem: ts.publicKeyPem },
        windows: [{ receipts: [], checkpoints: [dirty], extract }],
      });
    });
    assert.equal(report.ok, false);
    const windowFindings = report.windows.flatMap((w) => w.findings);
    assert.equal(hasSignatureFailed(windowFindings), true, JSON.stringify(windowFindings));
  });
});
