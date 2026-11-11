import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

import { CedulonSession } from "../packages/mcp-server/src/session.ts";

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

describe("checkpoint uint claims reject negatives and non-safe integers", () => {
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

    it(`signCheckpoint and checkpointToCbor refuse ${field} = 1.5 as checkpoint-uint`, () => {
      const claims = emptyClaims({ [field]: 1.5 });
      assert.throws(() => checkpointToCbor(claims), /checkpoint-uint/);
      const k = generateReceiptKeys();
      assert.throws(
        () => signCheckpoint(claims, k.privateKeyPem, k.publicKeyPem),
        /checkpoint-uint/,
      );
    });

    it(`signCheckpoint and checkpointToCbor refuse ${field} = MAX_SAFE_INTEGER + 1 as checkpoint-uint`, () => {
      const claims = emptyClaims({ [field]: Number.MAX_SAFE_INTEGER + 1 });
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
  it("startMs === endMs yields no window-coverage finding", () => {
    const k = generateReceiptKeys();
    const cp = signCheckpoint(
      buildCheckpointClaims(1, [], 100, 100, null),
      k.privateKeyPem,
      k.publicKeyPem,
    );
    const findings = findWindowCoverage([], [cp]);
    assert.equal(
      findings.some((f) => f.code === "window-coverage"),
      false,
      JSON.stringify(findings),
    );
  });

  it("endMs < startMs yields no window-coverage finding", () => {
    const k = generateReceiptKeys();
    const cp = signCheckpoint(
      buildCheckpointClaims(2, [], 200, 100, null),
      k.privateKeyPem,
      k.publicKeyPem,
    );
    const findings = findWindowCoverage([], [cp]);
    assert.equal(
      findings.some((f) => f.code === "window-coverage"),
      false,
      JSON.stringify(findings),
    );
  });
});

describe("export does not throw when a stored checkpoint has dirty coseHex", () => {
  it("a persisted checkpoint whose coseHex gains a zz suffix exports hash null with the hard finding", () => {
    const dir = mkdtempSync(join(tmpdir(), "cedulon-export-dirty-"));
    const statePath = join(dir, "state.json");
    try {
      const writer = new CedulonSession({ statePath });
      assert.equal(
        writer.spend(
          { amount: "1", currency: "USD", payee: "payee-1", nonce: "n0".padEnd(16, "-"), tool: "spend" },
          1,
        ).ok,
        true,
      );
      const clean = writer.exportLedger();
      assert.equal(clean.checkpoints.length, 1);
      assert.equal(typeof clean.checkpoints[0].hash, "string");

      const saved = JSON.parse(readFileSync(statePath, "utf8")) as {
        checkpoints: Array<{ coseHex: string }>;
      };
      assert.equal(saved.checkpoints.length, 1);
      saved.checkpoints[0].coseHex = `${saved.checkpoints[0].coseHex}zz`;
      writeFileSync(statePath, JSON.stringify(saved));

      const loaded = new CedulonSession({ statePath });
      let exported!: ReturnType<CedulonSession["exportLedger"]>;
      assert.doesNotThrow(() => {
        exported = loaded.exportLedger();
      });
      assert.equal(exported.checkpoints.length, 1);
      assert.equal(exported.checkpoints[0].hash, null);
      assert.equal(hasSignatureFailed(exported.findings), true, JSON.stringify(exported.findings));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
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

  it("a dirty witness body with a valid presented checkpoint does not throw and yields no signature finding", () => {
    const k = generateReceiptKeys();
    const signed = signCheckpoint(
      buildCheckpointClaims(1, [], START, END, null),
      k.privateKeyPem,
      k.publicKeyPem,
    );
    const dirtyBody = { ...signed, coseHex: `${signed.coseHex}zz` };
    const ts = new MemoryTransparencyService(fixtureEd25519Pems());
    const inc = { ...anchorCheckpoint(ts, signed), checkpoint: dirtyBody };
    let report!: ReturnType<typeof audit>;
    assert.doesNotThrow(() => {
      report = audit({
        receipts: [],
        checkpoints: [signed],
        inclusionReceipts: [inc],
        witnessTrust: { publicKeyPem: ts.publicKeyPem },
      });
    });
    assert.equal(report.ok, true);
    assert.equal(report.findings.length, 0, JSON.stringify(report.findings));
    assert.equal(hasSignatureFailed(report.findings), false, JSON.stringify(report.findings));
    assert.equal(
      report.warnings.some((w) => w.code === "checkpoint-not-anchored"),
      false,
      JSON.stringify(report.warnings),
    );
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

  it("auditWindows with a dirty witness body and a valid presented checkpoint does not throw and yields no signature finding", () => {
    const k = generateReceiptKeys();
    const signed = signCheckpoint(
      buildCheckpointClaims(1, [], START, END, null),
      k.privateKeyPem,
      k.publicKeyPem,
    );
    const dirtyBody = { ...signed, coseHex: `${signed.coseHex}zz` };
    const ts = new MemoryTransparencyService(fixtureEd25519Pems());
    const inc = { ...anchorCheckpoint(ts, signed), checkpoint: dirtyBody };
    const extract = emptyExtract();
    let report!: ReturnType<typeof auditWindows>;
    assert.doesNotThrow(() => {
      report = auditWindows({
        inclusionReceipts: [inc],
        witnessTrust: { publicKeyPem: ts.publicKeyPem },
        windows: [{ receipts: [], checkpoints: [signed], extract }],
      });
    });
    assert.equal(report.ok, true);
    const windowFindings = report.windows.flatMap((w) => w.findings);
    assert.equal(windowFindings.length, 0, JSON.stringify(windowFindings));
    assert.equal(hasSignatureFailed(windowFindings), false, JSON.stringify(windowFindings));
    const windowWarnings = report.windows.flatMap((w) => w.warnings);
    assert.equal(
      windowWarnings.some((w) => w.code === "checkpoint-not-anchored"),
      false,
      JSON.stringify(windowWarnings),
    );
  });
});
