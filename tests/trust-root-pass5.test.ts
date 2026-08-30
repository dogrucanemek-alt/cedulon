import { strict as assert } from "node:assert";
import { chmodSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";

import { audit } from "@cedulon/audit";
import {
  MemoryTransparencyService,
  anchorCheckpoint,
  buildCheckpointClaims,
  signCheckpoint,
} from "@cedulon/checkpoint";
import {
  counterSign,
  generateReceiptKeys,
  signReceipt,
  signReceiptUnchecked,
  type SignedReceipt,
} from "@cedulon/receipts";
import { generateExtractKeys, signRailExtract } from "@cedulon/x402-adapter";

import { CedulonSession } from "../packages/mcp-server/src/session.ts";

const NOW = 1_700_000_000_000;
const WINDOW_END = NOW + 3_600_000;

type Keys = { privateKeyPem: string; publicKeyPem: string };

function receiptFor(
  keys: Keys,
  ref: string | null,
  amount: string,
  i: number,
  prev: string | null = null,
): SignedReceipt {
  const claims = {
    payer: "payer",
    payee: "payee-1",
    amount,
    currency: "USD",
    policyHash: "policy-hash",
    manifestHash: null,
    noManifest: true,
    x402PaymentRef: ref,
    timestampMs: NOW + i,
    nonce: `n${i}`.padEnd(16, "-"),
    prevReceiptHash: prev,
    outcome: "settled" as const,
  };
  // A settled receipt with a null ref is exactly what `settled-without-ref`
  // reports, so it has to be minted past the issuer's own check.
  return ref === null
    ? signReceiptUnchecked(claims, keys.privateKeyPem, keys.publicKeyPem)
    : signReceipt(claims, keys.privateKeyPem, keys.publicKeyPem);
}

function checkpointFor(keys: Keys, receipts: SignedReceipt[], epoch = 1) {
  return signCheckpoint(
    buildCheckpointClaims(epoch, receipts, NOW, WINDOW_END, null),
    keys.privateKeyPem,
    keys.publicKeyPem,
  );
}

function railWith(
  rail: Keys,
  settlements: Array<{ ref: string; amount: string; currency: string; timestampMs: number }>,
) {
  return signRailExtract(
    { accountId: "acct", railId: "rail", windowStartMs: NOW, windowEndMs: WINDOW_END, settlements },
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

describe("trust roots, fifth pass", () => {
  it("65 RED then GREEN: an unreadable pin does not take the receipts' own defects with it", () => {
    // Coverage is a claim about the issuer, so an unreadable pin rightly attests
    // nothing. But "these two receipts claim the same rail ref" and "this settled
    // receipt names no rail ref" are statements about the submitted set itself.
    // Losing them means a broken pin quietly simplifies the picture.
    const honest = generateReceiptKeys();
    const rail = generateExtractKeys();
    const dupeA = receiptFor(honest, "ref-ok", "1", 0);
    const dupeB = receiptFor(honest, "ref-ok", "1", 1);
    const nullRef = receiptFor(honest, null, "1", 2);
    const extract = railWith(rail, [{ ref: "ref-ok", amount: "1", currency: "USD", timestampMs: NOW }]);
    const base = {
      receipts: [dupeA, dupeB, nullRef],
      checkpoints: [checkpointFor(honest, [dupeA])],
      extract,
      trust: railPin(rail),
    };

    const readable = audit({ ...base, issuerTrust: { publicKeyPem: honest.publicKeyPem } });
    for (const code of ["duplicate-ref", "settled-without-ref"] as const) {
      assert.ok(
        readable.findings.some((f) => f.code === code),
        `${code} is reported when the pin can be read`,
      );
    }

    const broken = audit({ ...base, issuerTrust: { publicKeyPem: "not-a-key" } });
    assert.ok(broken.findings.some((f) => f.code === "trust-key-unreadable"));
    assert.ok(
      broken.findings.some((f) => f.code === "settled-without-ref"),
      "a defect keyed by the offending receipt is still a failure",
    );
    // A clash is between two receipts, and with nothing readable to tell them
    // apart it cannot be pinned on either - said out loud, not as a verdict.
    assert.ok(
      broken.warnings.some((w) => w.code === "duplicate-ref"),
      "the clash is reported as a warning instead",
    );
  });

  it("71 RED then GREEN: a foreign receipt cannot write the honest set's own defects", () => {
    // Running the self-consistency checks over everything submitted fixed one
    // hole and reopened another: an attacker mints a receipt claiming a rail ref
    // the honest issuer already used, and `duplicate-ref` lands on the honest
    // set. Self-consistency is a question about the receipts the verifier
    // accepts - when there is no notion of acceptance, it is about all of them.
    const honest = generateReceiptKeys();
    const attacker = generateReceiptKeys();
    const rail = generateExtractKeys();
    const good = receiptFor(honest, "ref-ok", "1", 0);
    const shadow = receiptFor(attacker, "ref-ok", "1", 7);
    const extract = railWith(rail, [{ ref: "ref-ok", amount: "1", currency: "USD", timestampMs: NOW }]);
    const base = {
      checkpoints: [checkpointFor(honest, [good])],
      extract,
      trust: railPin(rail),
    };

    const pinned = audit({
      ...base,
      receipts: [good, shadow],
      issuerTrust: { publicKeyPem: honest.publicKeyPem },
    });
    assert.ok(pinned.findings.some((f) => f.code === "issuer-key-mismatch"));
    assert.equal(
      pinned.findings.some((f) => f.code === "duplicate-ref"),
      false,
      "a receipt the verifier rejected is not one of the honest issuer's duplicates",
    );

    // With no issuer key there is no accepted set, so the submitted one is the
    // only thing to be consistent about, and the clash is worth reporting.
    const unpinned = audit({ ...base, receipts: [good, shadow] });
    assert.ok(
      unpinned.warnings.some((w) => w.code === "duplicate-ref"),
      "reported, but not as a verdict against a set the verifier cannot vouch for",
    );
  });

  it("66 RED then GREEN: without an issuer key a witness proves anchoring but accuses nobody", () => {
    // The accusing filter only ran when an issuer key was configured. With a
    // pinned log and no issuer pin, an entry copied out of an honest log with
    // its body removed still reported this chain as hiding a checkpoint.
    const honest = generateReceiptKeys();
    const stranger = generateReceiptKeys();
    const witness = generateReceiptKeys();
    const rail = generateExtractKeys();
    const good = receiptFor(honest, "ref-ok", "1", 0);
    const extract = railWith(rail, [{ ref: "ref-ok", amount: "1", currency: "USD", timestampMs: NOW }]);
    const mine = checkpointFor(honest, [good], 1);
    const theirs = checkpointFor(stranger, [good], 5);

    const log = new MemoryTransparencyService(witness);
    const mineInclusion = anchorCheckpoint(log, mine);
    const { checkpoint: _dropped, ...bodyless } = anchorCheckpoint(log, theirs);

    const report = audit({
      receipts: [good],
      checkpoints: [mine],
      extract,
      trust: railPin(rail),
      witnessTrust: { publicKeyPem: witness.publicKeyPem },
      inclusionReceipts: [mineInclusion, bodyless],
    });
    assert.equal(
      report.findings.some((f) => f.code === "checkpoint-withheld"),
      false,
      "an entry that names no issuer cannot accuse this one, pinned issuer or not",
    );
    // The anchoring it does prove still counts.
    assert.equal(
      report.warnings.some((w) => w.code === "checkpoint-not-anchored"),
      false,
    );
  });

  it("67 RED then GREEN: removing a countersignature does not remove the question", () => {
    // Naming a payee key states an expectation. If dropping the countersignature
    // also drops the expectation, an attacker deletes the evidence - or their own
    // failed forgery - and the report goes back to unconditional.
    const honest = generateReceiptKeys();
    const payee = generateReceiptKeys();
    const attacker = generateReceiptKeys();
    const rail = generateExtractKeys();
    const plain = receiptFor(honest, "ref-ok", "1", 0);
    const extract = railWith(rail, [{ ref: "ref-ok", amount: "1", currency: "USD", timestampMs: NOW }]);
    const base = {
      checkpoints: [checkpointFor(honest, [plain])],
      extract,
      trust: railPin(rail),
      issuerTrust: { publicKeyPem: honest.publicKeyPem },
      payeeTrust: { "payee-1": payee.publicKeyPem },
    };

    const signedByPayee = counterSign(plain, payee.privateKeyPem, payee.publicKeyPem, honest.publicKeyPem);
    const green = audit({ ...base, receipts: [signedByPayee] });
    assert.deepEqual(green.findings.map((f) => f.code), []);
    assert.equal(green.guarantee, "unconditional");

    const forged = counterSign(plain, attacker.privateKeyPem, attacker.publicKeyPem, honest.publicKeyPem);
    const caught = audit({ ...base, receipts: [forged] });
    assert.ok(caught.findings.some((f) => f.code === "countersign-key-mismatch"));

    // The attacker deletes the countersignature instead of forging one.
    const stripped = audit({ ...base, receipts: [plain] });
    assert.ok(
      stripped.warnings.some((w) => w.code === "countersign-missing"),
      "a payee key was named and this receipt carries nothing from that payee",
    );
    assert.equal(stripped.guarantee, "conditional");
  });

  it("68 RED then GREEN: a state file is only owner-only if its directory is too", () => {
    // Mode 0600 on the file says who can open it. A world-writable directory says
    // who can replace it, which reaches the same private key by another route.
    const dir = mkdtempSync(join(tmpdir(), "cedulon-dir-"));
    const statePath = join(dir, "nested", "state.json");
    const session = new CedulonSession({ statePath });
    assert.equal(
      session.spend({ amount: "1", currency: "USD", payee: "payee-1", nonce: "n0".padEnd(16, "-") }, 1).ok,
      true,
    );

    if (process.platform === "win32") {
      assert.equal(session.status().stateProtection, "encrypted-at-rest");
    } else {
      assert.equal(session.status().stateProtection, "owner-only");
      chmodSync(dirname(statePath), 0o777);
      assert.equal(
        session.status().stateProtection,
        "unprotected-on-this-platform",
        "anyone who can write the directory can replace the file",
      );
    }
  });

  it("69 RED then GREEN: a missing state file is not the same answer as an unprotected one", () => {
    // "The file has no protection" and "there is no file" are different facts and
    // used to share a string. An operator acting on the first would be chasing a
    // permission problem that does not exist.
    const statePath = join(mkdtempSync(join(tmpdir(), "cedulon-absent-")), "state.json");
    const session = new CedulonSession({ statePath });
    assert.equal(session.status().stateProtection, "absent", "nothing has been written yet");

    assert.equal(
      session.spend({ amount: "1", currency: "USD", payee: "payee-1", nonce: "n0".padEnd(16, "-") }, 1).ok,
      true,
    );
    assert.notEqual(session.status().stateProtection, "absent");

    rmSync(statePath);
    assert.equal(session.status().stateProtection, "absent");
  });

  it("70 RED then GREEN: the state path is refused when it is a symlink", (t) => {
    // A symlink at the state path is read through on load, so an attacker who can
    // place one decides what this server starts up believing. Refusing the path
    // outright is the only answer that does not depend on write ordering.
    const dir = mkdtempSync(join(tmpdir(), "cedulon-link-"));
    const real = join(dir, "real.json");
    const link = join(dir, "state.json");
    writeFileSync(real, "{}\n", { mode: 0o600 });
    try {
      symlinkSync(real, link);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "EPERM" || code === "EACCES") {
        if (process.platform === "win32") {
          t.skip("creating a symlink needs privilege on this host (Developer Mode off); measured on POSIX instead");
        }
        return;
      }
      throw err;
    }

    assert.throws(
      () => new CedulonSession({ statePath: link }),
      /cedulon-state-symlink/,
      "what the path points at is not this server's to decide",
    );
  });
});
