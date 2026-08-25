import type { RailExtractBody, RailSettlement } from "@cedulon/x402-adapter";

/** Circle USDC on Base Sepolia. Public contract address, not a credential. */
export const BASE_SEPOLIA_USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
export const TRANSFER_TOPIC0 =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
export const USDC_DECIMALS = 6;
export const RAIL_ID = "base-sepolia-usdc";

export type RpcLog = {
  address: string;
  topics: string[];
  data: string;
  transactionHash: string;
  blockNumber: string;
  logIndex: string;
};

export type RpcBlock = {
  timestamp: string;
};

export type DecodeTransfer = {
  from: string;
  to: string;
  amount: string;
  txHash: string;
  blockNumber: string;
  logIndex: string;
};

export function normalizeAddress(addr: string): string {
  const hex = addr.replace(/^0x/i, "").toLowerCase();
  if (hex.length === 64) {
    return `0x${hex.slice(24)}`;
  }
  return `0x${hex.padStart(40, "0")}`;
}

export function padTopicAddress(addr: string): string {
  return `0x${normalizeAddress(addr).slice(2).padStart(64, "0")}`;
}

export function hexToBigInt(hex: string): bigint {
  return BigInt(hex);
}

export function decodeTransferLog(log: RpcLog): DecodeTransfer | null {
  if (!log.topics[0] || log.topics[0].toLowerCase() !== TRANSFER_TOPIC0) {
    return null;
  }
  if (log.topics.length < 3) {
    return null;
  }
  return {
    from: normalizeAddress(log.topics[1]),
    to: normalizeAddress(log.topics[2]),
    amount: hexToBigInt(log.data || "0x0").toString(),
    txHash: log.transactionHash.toLowerCase(),
    blockNumber: log.blockNumber,
    logIndex: log.logIndex,
  };
}

export function involvesAccount(decoded: DecodeTransfer, account: string): boolean {
  const who = normalizeAddress(account);
  return decoded.from === who || decoded.to === who;
}

/**
 * ref is `${txHash}:${logIndex}`. A bare tx hash collides when one
 * transaction emits two Transfer events; the suffix keeps RailSettlement
 * refs unique so the existing audit engine can consume the extract.
 */
export function settlementRef(txHash: string, logIndex: string): string {
  return `${txHash.toLowerCase()}:${Number(logIndex)}`;
}

export function logsToExtract(input: {
  logs: RpcLog[];
  blocks: Record<string, RpcBlock>;
  account: string;
  fromBlock: number;
  toBlock: number;
  currency?: string;
  decimals?: number;
}): RailExtractBody {
  const currency = input.currency ?? "USDC";
  const settlements: RailSettlement[] = [];
  for (const log of input.logs) {
    const decoded = decodeTransferLog(log);
    if (!decoded || !involvesAccount(decoded, input.account)) {
      continue;
    }
    const block = input.blocks[log.blockNumber] ?? input.blocks[log.blockNumber.toLowerCase()];
    if (!block) {
      throw new Error(`missing-block ${log.blockNumber}`);
    }
    const timestampMs = Number(hexToBigInt(block.timestamp)) * 1000;
    settlements.push({
      ref: settlementRef(decoded.txHash, decoded.logIndex),
      amount: decoded.amount,
      currency,
      timestampMs,
    });
  }
  const times = settlements.map((s) => s.timestampMs);
  return {
    accountId: normalizeAddress(input.account),
    railId: RAIL_ID,
    windowStartMs: times.length === 0 ? 0 : Math.min(...times),
    windowEndMs: times.length === 0 ? 0 : Math.max(...times) + 1,
    settlements,
  };
}

export type RpcPost = (method: string, params: unknown[]) => Promise<unknown>;

export function makeRpc(rpcUrl: string, fetchImpl: typeof fetch = fetch): RpcPost {
  return async (method, params) => {
    const res = await fetchImpl(rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
    if (!res.ok) {
      throw new Error(`rpc-http ${res.status}`);
    }
    const body = (await res.json()) as { result?: unknown; error?: { message?: string } };
    if (body.error) {
      throw new Error(`rpc-error ${body.error.message ?? "unknown"}`);
    }
    return body.result;
  };
}

export async function fetchUsdcExtract(input: {
  rpc: RpcPost;
  account: string;
  fromBlock: number | string;
  toBlock: number | string;
  usdc?: string;
}): Promise<RailExtractBody> {
  const usdc = input.usdc ?? BASE_SEPOLIA_USDC;
  const accountTopic = padTopicAddress(input.account);
  const range = {
    fromBlock: toHexBlock(input.fromBlock),
    toBlock: toHexBlock(input.toBlock),
    address: usdc,
  };
  const [outLogs, inLogs] = await Promise.all([
    input.rpc("eth_getLogs", [{ ...range, topics: [TRANSFER_TOPIC0, accountTopic] }]),
    input.rpc("eth_getLogs", [{ ...range, topics: [TRANSFER_TOPIC0, null, accountTopic] }]),
  ]);
  const logs = dedupeLogs([...(asLogs(outLogs)), ...(asLogs(inLogs))]);
  const blockNums = [...new Set(logs.map((l) => l.blockNumber))];
  const blocks: Record<string, RpcBlock> = {};
  for (const num of blockNums) {
    const block = (await input.rpc("eth_getBlockByNumber", [num, false])) as RpcBlock | null;
    if (!block) {
      throw new Error(`missing-block ${num}`);
    }
    blocks[num] = { timestamp: block.timestamp };
  }
  return logsToExtract({
    logs,
    blocks,
    account: input.account,
    fromBlock: Number(input.fromBlock),
    toBlock: Number(input.toBlock),
  });
}

function toHexBlock(n: number | string): string {
  if (typeof n === "string" && n.startsWith("0x")) {
    return n;
  }
  return `0x${BigInt(n).toString(16)}`;
}

function asLogs(value: unknown): RpcLog[] {
  if (!Array.isArray(value)) {
    throw new Error("eth_getLogs-shape");
  }
  return value as RpcLog[];
}

function dedupeLogs(logs: RpcLog[]): RpcLog[] {
  const seen = new Set<string>();
  const out: RpcLog[] = [];
  for (const log of logs) {
    const key = `${log.transactionHash}:${log.logIndex}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(log);
  }
  return out;
}
