import { fetchUsdcExtract, makeRpc } from "./index.ts";

function arg(name: string): string | undefined {
  const idx = process.argv.indexOf(name);
  if (idx < 0) {
    return undefined;
  }
  return process.argv[idx + 1];
}

const address = arg("--address");
const from = arg("--from");
const to = arg("--to");
const rpcUrl = process.env.CEDULON_RPC_URL;

if (!address || !from || !to) {
  process.stderr.write("usage: --address <0x...> --from <block> --to <block>\n");
  process.exit(2);
}
if (!rpcUrl) {
  process.stderr.write("CEDULON_RPC_URL is required\n");
  process.exit(2);
}

const extract = await fetchUsdcExtract({
  rpc: makeRpc(rpcUrl),
  account: address,
  fromBlock: from,
  toBlock: to,
  usdc: arg("--usdc"),
});
process.stdout.write(`${JSON.stringify(extract, null, 2)}\n`);
