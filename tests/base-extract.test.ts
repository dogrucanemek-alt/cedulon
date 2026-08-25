import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AMOUNT_RE } from "@cedulon/receipts";
import { audit } from "@cedulon/audit";
import {
  BASE_SEPOLIA_USDC,
  TRANSFER_TOPIC0,
  USDC_DECIMALS,
  logsToExtract,
  type RpcLog,
} from "@cedulon/base-extract";

/*
 * Fixtures are synthesized from the ERC-20 Transfer ABI
 * (topic0 = keccak256("Transfer(address,address,uint256)"), indexed from/to,
 * uint256 data). Layout matches Base Sepolia USDC
 * (Circle 0x036CbD53842c5426634e7929541eC2318f3dCF7e). Not captured from a node.
 */
const ACCOUNT = "0x1111111111111111111111111111111111111111";
const OTHER = "0x2222222222222222222222222222222222222222";
const STRANGER = "0x3333333333333333333333333333333333333333";

function padAddress(addr: string): string {
  return `0x${addr.replace(/^0x/i, "").toLowerCase().padStart(64, "0")}`;
}

function encodeUint256(n: bigint): string {
  return `0x${n.toString(16).padStart(64, "0")}`;
}

function transferLog(input: {
  from: string;
  to: string;
  amount: bigint;
  tx: string;
  block: number;
  logIndex: number;
}): RpcLog {
  return {
    address: BASE_SEPOLIA_USDC,
    topics: [TRANSFER_TOPIC0, padAddress(input.from), padAddress(input.to)],
    data: encodeUint256(input.amount),
    transactionHash: input.tx,
    blockNumber: `0x${input.block.toString(16)}`,
    logIndex: `0x${input.logIndex.toString(16)}`,
  };
}

const blocks = {
  "0xa": { timestamp: "0x64" },
  "0xb": { timestamp: "0xc8" },
};

describe("base-extract USDC log transform", () => {
  it("maps inbound and outbound transfers for the account", () => {
    const extract = logsToExtract({
      logs: [
        transferLog({ from: OTHER, to: ACCOUNT, amount: 1_000_000n, tx: "0xaaa", block: 10, logIndex: 1 }),
        transferLog({ from: ACCOUNT, to: OTHER, amount: 250_000n, tx: "0xbbb", block: 11, logIndex: 2 }),
        transferLog({ from: OTHER, to: STRANGER, amount: 9n, tx: "0xccc", block: 11, logIndex: 3 }),
      ],
      blocks,
      account: ACCOUNT,
      fromBlock: 10,
      toBlock: 11,
    });
    assert.equal(extract.accountId.toLowerCase(), ACCOUNT.toLowerCase());
    assert.equal(extract.railId, "base-sepolia-usdc");
    assert.equal(extract.settlements.length, 2);
    assert.equal(extract.settlements[0].amount, "1000000");
    assert.equal(extract.settlements[0].currency, "USDC");
    assert.equal(extract.settlements[0].timestampMs, 100_000);
    assert.equal(extract.settlements[1].amount, "250000");
    assert.equal(extract.settlements[1].timestampMs, 200_000);
    assert.equal(AMOUNT_RE.test(extract.settlements[0].amount), true);
  });

  it("keeps both Transfer events in one transaction", () => {
    const extract = logsToExtract({
      logs: [
        transferLog({ from: OTHER, to: ACCOUNT, amount: 5n, tx: "0xdup", block: 10, logIndex: 4 }),
        transferLog({ from: ACCOUNT, to: OTHER, amount: 2n, tx: "0xdup", block: 10, logIndex: 5 }),
      ],
      blocks,
      account: ACCOUNT,
      fromBlock: 10,
      toBlock: 10,
    });
    assert.equal(extract.settlements.length, 2);
    assert.notEqual(extract.settlements[0].ref, extract.settlements[1].ref);
    assert.equal(extract.settlements[0].ref.startsWith("0xdup"), true);
  });

  it("includes a zero-value transfer and keeps USDC decimals atomic", () => {
    const oneUsdc = 10n ** BigInt(USDC_DECIMALS);
    const extract = logsToExtract({
      logs: [
        transferLog({ from: OTHER, to: ACCOUNT, amount: 0n, tx: "0xzero", block: 10, logIndex: 0 }),
        transferLog({ from: OTHER, to: ACCOUNT, amount: oneUsdc, tx: "0xone", block: 10, logIndex: 1 }),
      ],
      blocks,
      account: ACCOUNT,
      fromBlock: 10,
      toBlock: 10,
    });
    assert.equal(extract.settlements[0].amount, "0");
    assert.equal(extract.settlements[1].amount, "1000000");
    assert.equal(extract.settlements[1].amount.includes("."), false);
    assert.equal(AMOUNT_RE.test(extract.settlements[0].amount), true);
    assert.equal(AMOUNT_RE.test(extract.settlements[1].amount), true);
  });

  it("produces settlements the audit engine already accepts", () => {
    const extract = logsToExtract({
      logs: [transferLog({ from: OTHER, to: ACCOUNT, amount: 3n, tx: "0xaud", block: 10, logIndex: 8 })],
      blocks,
      account: ACCOUNT,
      fromBlock: 10,
      toBlock: 10,
    });
    const report = audit({
      receipts: [],
      checkpoints: [],
      settlements: extract.settlements,
    });
    assert.equal(report.ok, false);
    assert.equal(report.findings.some((f) => f.code === "settlement-without-receipt"), true);
  });
});
