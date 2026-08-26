import { readFileSync } from "node:fs";

/** Same public Circle USDC as index.ts. Duplicated to avoid an import cycle. */
const BASE_SEPOLIA_USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";

/** Base Sepolia. Public chain id, not a credential. */
export const BASE_SEPOLIA_CHAIN_ID = 84532;
export const ERC20_TRANSFER_SELECTOR = "0xa9059cbb";

function normalizeAddress(addr: string): string {
  const hex = addr.replace(/^0x/i, "").toLowerCase();
  if (hex.length === 64) {
    return `0x${hex.slice(24)}`;
  }
  return `0x${hex.padStart(40, "0")}`;
}

export type IntendedTransfer = {
  chainId: typeof BASE_SEPOLIA_CHAIN_ID;
  railId: "base-sepolia-usdc";
  token: string;
  from: string;
  to: string;
  amount: string;
  data: string;
};

export function encodeTransferCalldata(to: string, amount: string): string {
  const addr = normalizeAddress(to).slice(2).padStart(64, "0");
  const amt = BigInt(amount).toString(16).padStart(64, "0");
  return `${ERC20_TRANSFER_SELECTOR}${addr}${amt}`;
}

export function planTransfer(input: { from: string; to: string; amount: string }): IntendedTransfer {
  if (!/^(0|[1-9][0-9]*)$/.test(input.amount)) {
    throw new Error("malformed-amount");
  }
  return {
    chainId: BASE_SEPOLIA_CHAIN_ID,
    railId: "base-sepolia-usdc",
    token: BASE_SEPOLIA_USDC,
    from: normalizeAddress(input.from),
    to: normalizeAddress(input.to),
    amount: input.amount,
    data: encodeTransferCalldata(input.to, input.amount),
  };
}

export function argvRequestsKey(argv: string[]): boolean {
  return argv.some(
    (a) => a === "--key" || a === "--private-key" || a.startsWith("--key=") || a.startsWith("--private-key="),
  );
}

export function loadWriteKey(env: NodeJS.ProcessEnv): string {
  const inline = env.CEDULON_WRITE_KEY;
  if (inline && inline.trim() !== "") {
    return inline.trim();
  }
  const file = env.CEDULON_WRITE_KEY_FILE;
  if (file && file.trim() !== "") {
    return readFileSync(file, "utf8").trim();
  }
  throw new Error("missing-write-key");
}

export function broadcastAllowed(argv: string[], env: NodeJS.ProcessEnv): boolean {
  return argv.includes("--broadcast") && env.CEDULON_ALLOW_BROADCAST === "1";
}

export type WriteResult =
  | { status: "dry-run"; intended: IntendedTransfer }
  | { status: "refused"; reason: string; intended: IntendedTransfer }
  | { status: "broadcast"; intended: IntendedTransfer; txHash: string };

export type BroadcastFn = (intended: IntendedTransfer, key: string) => Promise<string>;

/**
 * Default is dry-run. Publishing requires `--broadcast` and
 * CEDULON_ALLOW_BROADCAST=1, and a key from the environment or a file.
 * A key on argv is refused. The default broadcast function is not
 * attached here; a caller that wants to send must pass one.
 */
export async function executeWrite(
  intended: IntendedTransfer,
  argv: string[],
  env: NodeJS.ProcessEnv,
  send?: BroadcastFn,
): Promise<WriteResult> {
  if (argvRequestsKey(argv)) {
    return { status: "refused", reason: "key-from-argv", intended };
  }
  if (!broadcastAllowed(argv, env)) {
    return { status: "dry-run", intended };
  }
  let key: string;
  try {
    key = loadWriteKey(env);
  } catch (e) {
    return { status: "refused", reason: (e as Error).message, intended };
  }
  if (!send) {
    return { status: "refused", reason: "no-sender", intended };
  }
  const txHash = await send(intended, key);
  return { status: "broadcast", intended, txHash };
}

export function formatWriteResult(result: WriteResult): string {
  const lines = [
    `chain=base-sepolia (${result.intended.chainId})`,
    `token=${result.intended.token}`,
    `from=${result.intended.from}`,
    `to=${result.intended.to}`,
    `amount=${result.intended.amount}`,
    `data=${result.intended.data}`,
  ];
  if (result.status === "dry-run") {
    lines.unshift("dry-run: would send");
    lines.push("broadcast=refused (need --broadcast and CEDULON_ALLOW_BROADCAST=1)");
  } else if (result.status === "refused") {
    lines.unshift(`broadcast: refused (${result.reason})`);
  } else {
    lines.unshift(`broadcast: sent ${result.txHash}`);
  }
  return lines.join("\n");
}
