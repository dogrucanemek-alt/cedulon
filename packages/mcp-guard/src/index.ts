import type { PolicyEngine, SpendRequest } from "@agent-trade-protocol/core";
import { gatedSettle, type AdapterKeys, type PayResult } from "@agent-trade-protocol/x402-adapter";
import type { SignedManifest } from "@agent-trade-protocol/manifest";

export type ToolCall = {
  name: string;
  arguments: Record<string, unknown>;
};

export type ToolResult = {
  content: { type: "text"; text: string }[];
  isError: boolean;
};

const SPEND_TOOLS = new Set(["spend", "pay"]);

export type GuardDeps = {
  engine: PolicyEngine | null;
  keys: AdapterKeys;
  payer: string;
  nowMs: number;
  inner?: (call: ToolCall) => ToolResult;
};

export function wrapToolsCall(deps: GuardDeps): (call: ToolCall) => ToolResult {
  return (call: ToolCall): ToolResult => {
    if (!SPEND_TOOLS.has(call.name)) {
      if (deps.inner) {
        return deps.inner(call);
      }
      return {
        content: [{ type: "text", text: `ok:${call.name}` }],
        isError: false,
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
