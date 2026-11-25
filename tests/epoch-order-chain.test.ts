import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { audit } from "@cedulon/audit";
import {
  buildCheckpointClaims,
  checkpointHash,
  signCheckpoint,
  type SignedCheckpoint,
} from "@cedulon/checkpoint";
import { generateReceiptKeys } from "@cedulon/receipts";

const T0 = 1_700_000_000_000;
const T1 = T0 + 1_000;
const T2 = T1 + 1_000;
const T3 = T2 + 1_000;

function emptyCheckpoint(
  keys: { privateKeyPem: string; publicKeyPem: string },
  epoch: number,
  startMs: number,
  endMs: number,
  prevCheckpointHash: string | null,
): SignedCheckpoint {
  return signCheckpoint(
    buildCheckpointClaims(epoch, [], startMs, endMs, prevCheckpointHash),
    keys.privateKeyPem,
    keys.publicKeyPem,
  );
}

describe("checkpoint chain walks in epoch order", () => {
  it("presentation order 3 then 1 then 2 with presentation-order links is a chain break", () => {
    const k = generateReceiptKeys();
    // Issuer signs and presents epoch 3 -> 1 -> 2, linking each prevCheckpointHash
    // to the previous presented member. Windows stay adjacent in epoch order so
    // window coverage alone stays quiet.
    const cp3 = emptyCheckpoint(k, 3, T2, T3, null);
    const cp1 = emptyCheckpoint(k, 1, T0, T1, checkpointHash(cp3));
    const cp2 = emptyCheckpoint(k, 2, T1, T2, checkpointHash(cp1));
    const presented = [cp3, cp1, cp2];
    const report = audit({ receipts: [], checkpoints: presented, settlements: [] });
    assert.equal(report.ok, false, JSON.stringify(report.findings));
    assert.equal(
      report.findings.some(
        (f) =>
          f.code === "checkpoint-total-mismatch" &&
          f.id === "checkpoint-chain-1" &&
          /broken-link/.test(f.detail),
      ),
      true,
      JSON.stringify(report.findings),
    );
  });

  it("honest epoch order 1 then 2 then 3 has no chain break", () => {
    const k = generateReceiptKeys();
    const cp1 = emptyCheckpoint(k, 1, T0, T1, null);
    const cp2 = emptyCheckpoint(k, 2, T1, T2, checkpointHash(cp1));
    const cp3 = emptyCheckpoint(k, 3, T2, T3, checkpointHash(cp2));
    const report = audit({ receipts: [], checkpoints: [cp1, cp2, cp3], settlements: [] });
    assert.equal(report.ok, true, JSON.stringify(report.findings));
  });

  it("honest epoch links presented as 2 then 1 then 3 have no chain break", () => {
    const k = generateReceiptKeys();
    const cp1 = emptyCheckpoint(k, 1, T0, T1, null);
    const cp2 = emptyCheckpoint(k, 2, T1, T2, checkpointHash(cp1));
    const cp3 = emptyCheckpoint(k, 3, T2, T3, checkpointHash(cp2));
    const report = audit({ receipts: [], checkpoints: [cp2, cp1, cp3], settlements: [] });
    assert.equal(report.ok, true, JSON.stringify(report.findings));
  });

  it("the same checkpoint object twice reports the chain break at the second presented index", () => {
    const k = generateReceiptKeys();
    const cp1 = emptyCheckpoint(k, 1, T0, T1, null);
    const cp2 = emptyCheckpoint(k, 2, T1, T2, "11".repeat(32));
    const presented = [cp1, cp2, cp1];
    const report = audit({ receipts: [], checkpoints: presented, settlements: [] });
    const chain = report.findings.find(
      (f) => f.code === "checkpoint-total-mismatch" && f.id.startsWith("checkpoint-chain-"),
    );
    assert.ok(chain, JSON.stringify(report.findings));
    assert.equal(chain.id, "checkpoint-chain-2", JSON.stringify(report.findings));
  });
});

describe("MUST-T11-8 epoch and window checks run on the working set", () => {
  // Measured: under a usable pin a foreign checkpoint, and without a pin a
  // refused one, are outside the working set. Inserting either between two
  // honest checkpoints that skip an epoch must not silence the consecutive /
  // adjacent findings the remaining pair raises on its own.
  it("a foreign checkpoint under a usable pin cannot fill an epoch gap", () => {
    const issuer = generateReceiptKeys();
    const stranger = generateReceiptKeys();
    const cp1 = emptyCheckpoint(issuer, 1, T0, T1, null);
    const foreign = emptyCheckpoint(stranger, 2, T1, T2, checkpointHash(cp1));
    const cp3 = emptyCheckpoint(issuer, 3, T2, T3, checkpointHash(foreign));
    const report = audit({
      receipts: [],
      checkpoints: [cp1, foreign, cp3],
      settlements: [],
      issuerTrust: { publicKeyPem: issuer.publicKeyPem },
    });
    assert.ok(report.findings.some((f) => f.code === "issuer-key-mismatch" && f.id === "epoch-2"));
    assert.ok(
      report.findings.some((f) => f.code === "window-coverage" && f.id === "epoch-3" && /consecutive/.test(f.detail)),
      JSON.stringify(report.findings),
    );
  });

  it("a foreign checkpoint under a usable pin cannot fill a window adjacency gap", () => {
    const issuer = generateReceiptKeys();
    const stranger = generateReceiptKeys();
    const cp1 = emptyCheckpoint(issuer, 1, T0, T1, null);
    const foreign = emptyCheckpoint(stranger, 2, T1, T2, checkpointHash(cp1));
    const cp3 = emptyCheckpoint(issuer, 3, T2, T3, checkpointHash(foreign));
    const report = audit({
      receipts: [],
      checkpoints: [cp1, foreign, cp3],
      settlements: [],
      issuerTrust: { publicKeyPem: issuer.publicKeyPem },
    });
    assert.ok(
      report.findings.some((f) => f.code === "window-coverage" && f.id === "epoch-3-adjacent"),
      JSON.stringify(report.findings),
    );
  });

  it("a refused checkpoint without a pin cannot fill an epoch gap", () => {
    const k = generateReceiptKeys();
    const cp1 = emptyCheckpoint(k, 1, T0, T1, null);
    const mid = emptyCheckpoint(k, 2, T1, T2, checkpointHash(cp1));
    const refused = { ...mid, coseHex: mid.coseHex + "00" };
    const cp3 = emptyCheckpoint(k, 3, T2, T3, checkpointHash(mid));
    const report = audit({ receipts: [], checkpoints: [cp1, refused, cp3], settlements: [] });
    assert.ok(report.findings.some((f) => f.id === "epoch-2" && /refused: cbor-trailing/.test(f.detail)));
    assert.ok(
      report.findings.some((f) => f.code === "window-coverage" && f.id === "epoch-3" && /consecutive/.test(f.detail)),
      JSON.stringify(report.findings),
    );
  });

  it("a refused checkpoint without a pin cannot fill a window adjacency gap", () => {
    const k = generateReceiptKeys();
    const cp1 = emptyCheckpoint(k, 1, T0, T1, null);
    const mid = emptyCheckpoint(k, 2, T1, T2, checkpointHash(cp1));
    const refused = { ...mid, coseHex: mid.coseHex + "00" };
    const cp3 = emptyCheckpoint(k, 3, T2, T3, checkpointHash(mid));
    const report = audit({ receipts: [], checkpoints: [cp1, refused, cp3], settlements: [] });
    assert.ok(
      report.findings.some((f) => f.code === "window-coverage" && f.id === "epoch-3-adjacent"),
      JSON.stringify(report.findings),
    );
  });
});
