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
    assert.equal(
      report.findings.some((f) => f.id.startsWith("checkpoint-chain-")),
      false,
    );
  });

  it("honest epoch links presented as 2 then 1 then 3 have no chain break", () => {
    const k = generateReceiptKeys();
    const cp1 = emptyCheckpoint(k, 1, T0, T1, null);
    const cp2 = emptyCheckpoint(k, 2, T1, T2, checkpointHash(cp1));
    const cp3 = emptyCheckpoint(k, 3, T2, T3, checkpointHash(cp2));
    const report = audit({ receipts: [], checkpoints: [cp2, cp1, cp3], settlements: [] });
    assert.equal(report.ok, true, JSON.stringify(report.findings));
    assert.equal(
      report.findings.some((f) => f.id.startsWith("checkpoint-chain-")),
      false,
    );
  });
});
