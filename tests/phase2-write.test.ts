import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import { audit } from "@cedulon/audit";
import {
  BASE_SEPOLIA_USDC,
  USDC_DECIMALS,
  executeWrite,
  logsToExtract,
  planTransfer,
  type RpcLog,
} from "@cedulon/base-extract";
import { generateReceiptKeys, signReceipt } from "@cedulon/receipts";

const ACCOUNT = "0x1111111111111111111111111111111111111111";
const OTHER = "0x2222222222222222222222222222222222222222";

function padAddress(addr: string): string {
  return `0x${addr.replace(/^0x/i, "").toLowerCase().padStart(64, "0")}`;
}

function transferLog(): RpcLog {
  const amount = 10n ** BigInt(USDC_DECIMALS);
  return {
    address: BASE_SEPOLIA_USDC,
    topics: [
      "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
      padAddress(ACCOUNT),
      padAddress(OTHER),
    ],
    data: `0x${amount.toString(16).padStart(64, "0")}`,
    transactionHash: "0xabc",
    blockNumber: "0xa",
    logIndex: "0x1",
  };
}

describe("phase 2 write path (dry-run, fail-closed)", () => {
  const intended = planTransfer({
    from: ACCOUNT,
    to: OTHER,
    amount: "1000000",
  });

  it("dry-run is the default and never calls a sender", async () => {
    let called = 0;
    const result = await executeWrite(intended, [], {}, async () => {
      called += 1;
      return "0xshould-not-run";
    });
    assert.equal(result.status, "dry-run");
    assert.equal(called, 0);
    assert.equal(intended.chainId, 84532);
    assert.equal(intended.data.startsWith("0xa9059cbb"), true);
  });

  it("one gate alone is not enough to publish", async () => {
    let called = 0;
    const send = async () => {
      called += 1;
      return "0xno";
    };
    const flagOnly = await executeWrite(intended, ["--broadcast"], {}, send);
    const envOnly = await executeWrite(intended, [], { CEDULON_ALLOW_BROADCAST: "1" }, send);
    assert.equal(flagOnly.status, "dry-run");
    assert.equal(envOnly.status, "dry-run");
    assert.equal(called, 0);
  });

  it("a key on argv is refused even when both publish gates are set", async () => {
    const result = await executeWrite(
      intended,
      ["--broadcast", "--key", "do-not-read"],
      { CEDULON_ALLOW_BROADCAST: "1", CEDULON_WRITE_KEY: "env-key" },
      async () => "0xno",
    );
    assert.equal(result.status, "refused");
    if (result.status === "refused") {
      assert.equal(result.reason, "key-from-argv");
    }
  });

  it("both gates plus a file key can call a sender (injected, no network)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "cedulon-write-"));
    const keyFile = join(dir, ".write-key");
    writeFileSync(keyFile, "fixture-key\n");
    const result = await executeWrite(
      intended,
      ["--broadcast"],
      { CEDULON_ALLOW_BROADCAST: "1", CEDULON_WRITE_KEY_FILE: keyFile },
      async (_planned, key) => {
        assert.equal(key, "fixture-key");
        return "0xdead";
      },
    );
    assert.equal(result.status, "broadcast");
    if (result.status === "broadcast") {
      assert.equal(result.txHash, "0xdead");
    }
  });

  it("a receipted Base USDC settlement is not settlement-without-receipt", () => {
    const extract = logsToExtract({
      logs: [transferLog()],
      blocks: { "0xa": { timestamp: "0x64" } },
      account: ACCOUNT,
      fromBlock: 10,
      toBlock: 10,
    });
    assert.equal(extract.settlements.length, 1);
    const gap = audit({ receipts: [], checkpoints: [], settlements: extract.settlements });
    assert.equal(gap.findings.some((f) => f.code === "settlement-without-receipt"), true);

    const keys = generateReceiptKeys();
    const receipt = signReceipt(
      {
        payer: ACCOUNT,
        payee: OTHER,
        amount: extract.settlements[0].amount,
        currency: extract.settlements[0].currency,
        policyHash: "ph",
        manifestHash: null,
        noManifest: true,
        x402PaymentRef: extract.settlements[0].ref,
        timestampMs: extract.settlements[0].timestampMs,
        nonce: "n0".padEnd(16, "-"),
        prevReceiptHash: null,
        outcome: "settled",
      },
      keys.privateKeyPem,
      keys.publicKeyPem,
    );
    const closed = audit({
      receipts: [receipt],
      checkpoints: [],
      settlements: extract.settlements,
    });
    assert.equal(
      closed.findings.some((f) => f.code === "settlement-without-receipt"),
      false,
      closed.findings.map((f) => `${f.code}:${f.detail}`).join("\n"),
    );
  });
});
