import { isValidAmountText, type PolicyEngine, type SpendRequest } from "@cedulon/core";
import { gatedSettle, type AdapterKeys, type PayResult } from "@cedulon/x402-adapter";
import type { SignedManifest } from "@cedulon/manifest";

export type ToolCall = {
  name: string;
  arguments: Record<string, unknown>;
};

export type ToolResult = {
  content: { type: "text"; text: string }[];
  isError: boolean;
};

/**
 * Default names only. A guard keyed on tool names covers the names it was told
 * about and nothing else, so a host whose paying tool is called something else
 * has to say so through `spendTools`. Stated as a default rather than left to
 * look like coverage.
 */
export const DEFAULT_SPEND_TOOLS = ["spend", "pay"] as const;

export type GuardDeps = {
  engine: PolicyEngine | null;
  keys: AdapterKeys;
  payer: string;
  nowMs: number;
  inner?: (call: ToolCall) => ToolResult;
  /** Tool names this host settles payments through. Replaces the default set. */
  spendTools?: Iterable<string>;
};

export function wrapToolsCall(deps: GuardDeps): (call: ToolCall) => ToolResult {
  const spendTools = new Set(deps.spendTools ?? DEFAULT_SPEND_TOOLS);
  return (call: ToolCall): ToolResult => {
    if (!spendTools.has(call.name)) {
      if (deps.inner) {
        return deps.inner(call);
      }
      return {
        content: [{ type: "text", text: `ok:${call.name}` }],
        isError: false,
      };
    }
    // Checked as text before BigInt() erases the spelling; see MUST-T8-2.
    if (!isValidAmountText(call.arguments.amount)) {
      return {
        content: [{ type: "text", text: "denied:malformed-amount" }],
        isError: true,
      };
    }
    const req = argsToRequest(call.arguments, deps.nowMs);
    const manifest = call.arguments.manifest as SignedManifest | undefined;
    const result: PayResult = gatedSettle(
      deps.engine,
      {
        req,
        payer: deps.payer,
        manifest,
        paymentHeader: "mock-signed",
      },
      deps.keys,
      deps.nowMs,
    );
    if (result.status !== 200) {
      return {
        content: [{ type: "text", text: `denied:${result.reason}` }],
        isError: true,
      };
    }
    return {
      content: [{ type: "text", text: `paid:${result.receipt.claims.nonce}` }],
      isError: false,
    };
  };
}

function argsToRequest(args: Record<string, unknown>, nowMs: number): SpendRequest {
  return {
    amount: BigInt(String(args.amount ?? "0")),
    currency: String(args.currency ?? ""),
    payee: String(args.payee ?? ""),
    nonce: String(args.nonce ?? ""),
    nowMs,
    tool: "spend",
  };
}
