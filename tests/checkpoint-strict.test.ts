import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { findWindowCoverage } from "@cedulon/audit";
import {
  buildCheckpointClaims,
  checkpointHash,
  signCheckpoint,
  verifyCheckpoint,
  verifyCheckpointUnderPin,
  type CheckpointClaims,
  type SignedCheckpoint,
} from "@cedulon/checkpoint";
import { generateReceiptKeys } from "@cedulon/receipts";

function emptyClaims(overrides: Partial<CheckpointClaims> = {}): CheckpointClaims {
  return {
    epoch: 1,
    startMs: 1_700_000_000_000,
    endMs: 1_700_000_001_000,
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
      const signed = signedEmpty({ [field]: -1 });
      // The carried claims mirror what was signed; the payload still decodes
      // under a lax num() and would match. After the uint gate it must not.
      assert.equal(verifyCheckpoint(signed), false);
      assert.equal(verifyCheckpointUnderPin(signed, signed.publicKeyPem), false);
    });
  }
});

describe("findWindowCoverage refuses non-positive-length windows", () => {
  it("startMs === endMs is window-coverage", () => {
    const k = generateReceiptKeys();
    const cp = signCheckpoint(
      buildCheckpointClaims(1, [], 100, 100, null),
      k.privateKeyPem,
      k.publicKeyPem,
    );
    const findings = findWindowCoverage([], [cp]);
    assert.equal(
      findings.some(
        (f) =>
          f.code === "window-coverage" &&
          f.id === "epoch-1-bounds" &&
          /startMs < endMs/.test(f.detail),
      ),
      true,
      JSON.stringify(findings),
    );
  });

  it("endMs < startMs is window-coverage", () => {
    const k = generateReceiptKeys();
    const cp = signCheckpoint(
      buildCheckpointClaims(2, [], 200, 100, null),
      k.privateKeyPem,
      k.publicKeyPem,
    );
    const findings = findWindowCoverage([], [cp]);
    assert.equal(
      findings.some(
        (f) =>
          f.code === "window-coverage" &&
          f.id === "epoch-2-bounds" &&
          /startMs < endMs/.test(f.detail),
      ),
      true,
      JSON.stringify(findings),
    );
  });
});
