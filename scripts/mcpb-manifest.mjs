// Builds the MCPB manifest from the package that actually ships, so the bundle
// cannot claim a version the server does not report. Kept free of network and
// filesystem side effects so a test can compare its tool list against the tools
// the server really exposes.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

export function mcpbManifest() {
  const pkg = JSON.parse(readFileSync(join(root, "packages", "mcp-server", "package.json"), "utf8"));
  // The one-line pitch comes from server.json so the bundle and the registry
  // entry say the same thing; package.json's own description is npm's shelf
  // copy and reads differently on purpose.
  const server = JSON.parse(readFileSync(join(root, "server.json"), "utf8"));
  const entry = "node_modules/@cedulon/mcp-server/dist/index.js";

  return {
    manifest_version: "0.2",
    name: "cedulon",
    display_name: "Cedulon",
    version: pkg.version,
    description: server.description,
    long_description:
      "Cedulon puts a fail-closed policy gate in front of agent spending and issues a signed COSE receipt for every allowed payment. An audit reconciles the receipt chain against a rail extract and names what is missing, so a settlement with no receipt is caught rather than assumed. It settles on a mock rail: no wallet is held and no transaction is signed.",
    author: { name: "Emek Can Dogru", url: "https://github.com/dogrucanemek-alt" },
    homepage: "https://github.com/dogrucanemek-alt/cedulon",
    documentation: "https://github.com/dogrucanemek-alt/cedulon/blob/master/docs/QUICKSTART.md",
    repository: { type: "git", url: "https://github.com/dogrucanemek-alt/cedulon" },
    license: pkg.license,
    keywords: ["audit", "receipts", "policy", "spend", "cose", "x402"],
    server: {
      type: "node",
      entry_point: entry,
      mcp_config: {
        command: "node",
        args: [`\${__dirname}/${entry}`],
        env: {
          CEDULON_MAX_AMOUNT: "${user_config.max_amount}",
          CEDULON_MAX_CUMULATIVE: "${user_config.max_cumulative}",
          CEDULON_MAX_PAYMENTS: "${user_config.max_payments}",
          CEDULON_STATE_PATH: "${user_config.state_path}",
        },
      },
    },
    tools: [
      { name: "cedulon_spend", description: "Policy-gated spend on the mock rail; allow returns a signed receipt" },
      { name: "cedulon_audit", description: "Reconcile the receipt chain and checkpoint against the rail extract" },
      { name: "cedulon_verify_receipt", description: "Verify a spend receipt COSE_Sign1 and any payee countersignature" },
      { name: "cedulon_export_ledger", description: "Export receipts, checkpoint, and rail extract as JSON" },
      { name: "cedulon_status", description: "Server version, policy summary, receipt count, and chain head" },
    ],
    user_config: {
      max_amount: {
        type: "string",
        title: "Per-payment cap",
        description: "Largest amount a single payment may carry before the gate denies it",
        default: "10",
        required: false,
      },
      max_cumulative: {
        type: "string",
        title: "Window cap",
        description: "Largest total the policy window may reach",
        default: "30",
        required: false,
      },
      max_payments: {
        type: "number",
        title: "Payments per window",
        description: "How many payments the policy window allows",
        default: 3,
        required: false,
      },
      state_path: {
        type: "file",
        title: "Ledger file",
        description:
          "Optional JSON file that keeps the receipt chain across restarts; leave empty to hold it in memory only",
        required: false,
      },
    },
    compatibility: { runtimes: { node: ">=20.0.0" } },
  };
}
