import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { AMOUNT_RE } from "@cedulon/receipts";
import { audit } from "@cedulon/audit";
import {
  BASE_SEPOLIA_USDC,
  RAIL_ID,
  TRANSFER_TOPIC0,
  USDC_DECIMALS,
  fetchUsdcExtract,
  logsToExtract,
  type RpcLog,
  type RpcPost,
} from "@cedulon/base-extract";

/** Circle USDC on Base. Public contract address, not a credential. */
const BASE_USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

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
  address?: string;
}): RpcLog {
  return {
    address: input.address ?? BASE_SEPOLIA_USDC,
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

function fakeRpc(opts: {
  chainId?: string;
  logs?: RpcLog[];
  blocks?: Record<string, { timestamp: string }>;
  calls?: Array<{ method: string; params: unknown[] }>;
}): RpcPost {
  return async (method, params) => {
    opts.calls?.push({ method, params });
    if (method === "eth_chainId") {
      return opts.chainId ?? "0x14a34";
    }
    if (method === "eth_getLogs") {
      return opts.logs ?? [];
    }
    if (method === "eth_getBlockByNumber") {
      const num = String(params[0] ?? "").toLowerCase();
      return opts.blocks?.[num] ?? opts.blocks?.[String(params[0])] ?? null;
    }
    throw new Error(`unexpected-rpc ${method}`);
  };
}

describe("base-extract rail id follows the USDC contract", () => {
  it("exported RAIL_ID stays the Sepolia name", () => {
    assert.equal(RAIL_ID, "base-sepolia-usdc");
  });

  it("maps Base mainnet USDC to base-usdc", () => {
    const extract = logsToExtract({
      logs: [
        transferLog({
          from: OTHER,
          to: ACCOUNT,
          amount: 1n,
          tx: "0xmain",
          block: 10,
          logIndex: 1,
          address: BASE_USDC,
        }),
      ],
      blocks,
      account: ACCOUNT,
      fromBlock: 10,
      toBlock: 10,
      usdc: BASE_USDC,
    });
    assert.equal(extract.railId, "base-usdc");
  });

  it("maps Base Sepolia USDC to base-sepolia-usdc", () => {
    const extract = logsToExtract({
      logs: [transferLog({ from: OTHER, to: ACCOUNT, amount: 1n, tx: "0xsep", block: 10, logIndex: 1 })],
      blocks,
      account: ACCOUNT,
      fromBlock: 10,
      toBlock: 10,
      usdc: BASE_SEPOLIA_USDC,
    });
    assert.equal(extract.railId, "base-sepolia-usdc");
  });

  it("refuses an unknown USDC contract instead of guessing a rail id", () => {
    assert.throws(
      () =>
        logsToExtract({
          logs: [
            transferLog({
              from: OTHER,
              to: ACCOUNT,
              amount: 1n,
              tx: "0xunk",
              block: 10,
              logIndex: 1,
              address: "0x0000000000000000000000000000000000000001",
            }),
          ],
          blocks,
          account: ACCOUNT,
          fromBlock: 10,
          toBlock: 10,
          usdc: "0x0000000000000000000000000000000000000001",
        }),
      { message: "unknown-usdc-contract" },
    );
  });

  it("uses an explicit railId when the USDC contract is not in the map", () => {
    const extract = logsToExtract({
      logs: [
        transferLog({
          from: OTHER,
          to: ACCOUNT,
          amount: 1n,
          tx: "0xexp",
          block: 10,
          logIndex: 1,
          address: "0x0000000000000000000000000000000000000001",
        }),
      ],
      blocks,
      account: ACCOUNT,
      fromBlock: 10,
      toBlock: 10,
      usdc: "0x0000000000000000000000000000000000000001",
      railId: "custom-usdc",
    });
    assert.equal(extract.railId, "custom-usdc");
  });

  it("fetchUsdcExtract labels mainnet USDC as base-usdc when the chain matches", async () => {
    const extract = await fetchUsdcExtract({
      rpc: fakeRpc({
        chainId: "0x2105",
        logs: [
          transferLog({
            from: OTHER,
            to: ACCOUNT,
            amount: 1n,
            tx: "0xmn",
            block: 10,
            logIndex: 1,
            address: BASE_USDC,
          }),
        ],
        blocks: { "0xa": { timestamp: "0x64" } },
      }),
      account: ACCOUNT,
      fromBlock: 10,
      toBlock: 10,
      usdc: BASE_USDC,
    });
    assert.equal(extract.railId, "base-usdc");
  });

  it("fetchUsdcExtract refuses a known USDC on the wrong chain", async () => {
    await assert.rejects(
      () =>
        fetchUsdcExtract({
          rpc: fakeRpc({
            chainId: "0x14a34",
            logs: [],
            blocks: { "0xa": { timestamp: "0x64" } },
          }),
          account: ACCOUNT,
          fromBlock: 10,
          toBlock: 10,
          usdc: BASE_USDC,
        }),
      { message: "usdc-chain-mismatch" },
    );
  });
});

describe("base-extract window follows the requested block range", () => {
  it("does not collapse a wide range onto a single event timestamp", () => {
    const wide = {
      "0xa": { timestamp: "0x64" },
      "0xb": { timestamp: "0xc8" },
      "0xc": { timestamp: "0x12c" },
    };
    const extract = logsToExtract({
      logs: [transferLog({ from: OTHER, to: ACCOUNT, amount: 1n, tx: "0xlone", block: 11, logIndex: 1 })],
      blocks: wide,
      account: ACCOUNT,
      fromBlock: 10,
      toBlock: 12,
    });
    assert.equal(extract.windowStartMs, 100_000);
    assert.equal(extract.windowEndMs, 300_001);
    assert.equal(extract.settlements.length, 1);
    assert.equal(extract.settlements[0].timestampMs, 200_000);
  });

  it("empty logs still take the window from the boundary blocks", () => {
    const extract = logsToExtract({
      logs: [],
      blocks,
      account: ACCOUNT,
      fromBlock: 10,
      toBlock: 11,
    });
    assert.equal(extract.settlements.length, 0);
    assert.equal(extract.windowStartMs, 100_000);
    assert.equal(extract.windowEndMs, 200_001);
  });

  it("missing boundary block is missing-boundary-block, not a silent event window", () => {
    assert.throws(
      () =>
        logsToExtract({
          logs: [transferLog({ from: OTHER, to: ACCOUNT, amount: 1n, tx: "0xmiss", block: 10, logIndex: 1 })],
          blocks: { "0xa": { timestamp: "0x64" } },
          account: ACCOUNT,
          fromBlock: 10,
          toBlock: 20,
        }),
      { message: "missing-boundary-block 20" },
    );
  });

  it("fetchUsdcExtract reads both boundary blocks even when no Transfer fired", async () => {
    const calls: Array<{ method: string; params: unknown[] }> = [];
    const extract = await fetchUsdcExtract({
      rpc: fakeRpc({
        chainId: "0x14a34",
        logs: [],
        blocks: {
          "0xa": { timestamp: "0x64" },
          "0xb": { timestamp: "0xc8" },
        },
        calls,
      }),
      account: ACCOUNT,
      fromBlock: 10,
      toBlock: 11,
    });
    const blockCalls = calls
      .filter((c) => c.method === "eth_getBlockByNumber")
      .map((c) => String(c.params[0]).toLowerCase());
    assert.equal(blockCalls.includes("0xa"), true);
    assert.equal(blockCalls.includes("0xb"), true);
    assert.equal(extract.windowStartMs, 100_000);
    assert.equal(extract.windowEndMs, 200_001);
    assert.equal(extract.railId, "base-sepolia-usdc");
  });
});

describe("live-audit demo source", () => {
  const liveAudit = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "..", "examples", "demo", "src", "live-audit.ts"),
    "utf8",
  );

  it("does not print guarantee= a second time after formatAudit", () => {
    assert.match(liveAudit, /formatAudit\(report\)/);
    assert.equal(/console\.log\(`guarantee=/.test(liveAudit), false);
  });

  it("header and --usdc cover Base mainnet as well as Sepolia", () => {
    assert.match(liveAudit, /mainnet/i);
    assert.match(liveAudit, /--usdc/);
    assert.match(liveAudit, /0x833589fcd6edb6e08f4c7c32d4f71b54bda02913/i);
  });
});
