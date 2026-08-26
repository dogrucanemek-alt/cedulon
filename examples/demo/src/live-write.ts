// Constructs a Base Sepolia USDC transfer and, by default, prints it.
// It does not sign or send. Publishing requires both `--broadcast` and
// CEDULON_ALLOW_BROADCAST=1, plus a key from CEDULON_WRITE_KEY or
// CEDULON_WRITE_KEY_FILE. A key on argv is refused.

import {
  executeWrite,
  formatWriteResult,
  planTransfer,
} from "@cedulon/base-extract";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i < 0 ? undefined : process.argv[i + 1];
}

const to = arg("--to");
const amount = arg("--amount");
const from = arg("--from") ?? process.env.CEDULON_WRITE_FROM;

if (!to || !amount || !from) {
  process.stderr.write(
    "usage: --from <0x...> --to <0x...> --amount <atomic-usdc>\n" +
      "from may be CEDULON_WRITE_FROM. default is dry-run.\n",
  );
  process.exit(2);
}

const intended = planTransfer({ from, to, amount });
const result = await executeWrite(intended, process.argv, process.env);
process.stdout.write(`${formatWriteResult(result)}\n`);
process.exit(result.status === "dry-run" ? 0 : result.status === "broadcast" ? 0 : 2);
