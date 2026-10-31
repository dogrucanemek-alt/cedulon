// Reads a real Base USDC window — Sepolia or mainnet, selected by --usdc
// and the RPC endpoint — and reconciles it against a receipt chain, which
// is the shape of the actual job: the rail is not ours to edit, and
// whatever it reports has to be accounted for.
//
// Read-only. No wallet, no key, no transaction is sent. Set CEDULON_RPC_URL
// to a Base or Base Sepolia endpoint.
//
//   npm run demo:live -- --address 0x... --from <block> --to <block>
//   npm run demo:live -- --address 0x... --from <block> --to <block> \
//     --usdc 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
//
// Default USDC is Base Sepolia. Pass the Base mainnet contract above for
// chain 8453. With no receipts to match, every settlement the chain reports
// is a gap, and the report says so rather than balancing. Pass --receipts
// <file> to reconcile against a chain exported by npm run demo:export.

import { readFileSync } from "node:fs";
import { fetchUsdcExtract, makeRpc } from "@cedulon/base-extract";
import { audit, formatAudit } from "@cedulon/audit";
import { parseIJson } from "@cedulon/core";
import type { SignedReceipt } from "@cedulon/receipts";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i < 0 ? undefined : process.argv[i + 1];
}

const address = arg("--address");
const from = arg("--from");
const to = arg("--to");
const rpcUrl = process.env.CEDULON_RPC_URL;

if (!address || !from || !to) {
  process.stderr.write("usage: --address <0x...> --from <block> --to <block> [--receipts <file>] [--usdc <0x...>]\n");
  process.exit(2);
}
if (!rpcUrl) {
  process.stderr.write("CEDULON_RPC_URL is required (for example https://sepolia.base.org)\n");
  process.exit(2);
}

const extract = await fetchUsdcExtract({
  rpc: makeRpc(rpcUrl),
  account: address,
  fromBlock: from,
  toBlock: to,
  usdc: arg("--usdc"),
});

const receiptsFile = arg("--receipts");
const receipts: SignedReceipt[] = receiptsFile
  ? ((parseIJson(readFileSync(receiptsFile, "utf8")) as { receipts?: SignedReceipt[] }).receipts ?? [])
  : [];

const total = extract.settlements.reduce((sum, s) => sum + BigInt(s.amount), 0n);
console.log(`rail=${extract.railId}`);
console.log(`account=${extract.accountId}`);
console.log(`window=${new Date(extract.windowStartMs).toISOString()}..${new Date(extract.windowEndMs).toISOString()}`);
console.log(`settlements=${extract.settlements.length} total=${total} receipts=${receipts.length}`);

const report = audit({ receipts, checkpoints: [], settlements: extract.settlements });
console.log(formatAudit(report));

// A window the chain reported and we cannot account for is the failure this
// demo exists to show, so an unreconciled run must not exit 0.
process.exit(report.ok ? 0 : 1);
