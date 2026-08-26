#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { CedulonSession, MCP_SERVER_VERSION, type SpendArgs, type VerifyArgs } from "./session.ts";
import type { RailSettlement } from "@cedulon/x402-adapter";

const session = new CedulonSession();

const TOOLS = [
  {
    name: "cedulon_spend",
    description:
      "Policy-gated spend on the mock rail. Allow returns a signed COSE receipt JSON. Deny returns the fail-closed reason.",
    annotations: {
      title: "Spend on the mock rail",
      // Appends a receipt and consumes window budget. It overwrites nothing,
      // and repeating it spends again, so it is neither destructive nor
      // idempotent. No socket is opened; see openWorldHint below.
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        amount: { type: "string", description: "Integer amount as a decimal string" },
        currency: { type: "string" },
        payee: { type: "string" },
        nonce: { type: "string" },
        tool: { type: "string", description: "Calling tool name recorded on the request" },
      },
      required: ["amount", "currency", "payee", "nonce"],
    },
  },
  {
    name: "cedulon_audit",
    description:
      "Reconcile the in-process receipt chain and checkpoint against the rail extract. Returns audit: balanced or findings.",
    annotations: {
      title: "Audit the receipt chain",
      readOnlyHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        extraSettlements: {
          type: "array",
          description: "Optional extra extract rows, used to inject a bypass settlement in tests",
          items: {
            type: "object",
            properties: {
              ref: { type: "string" },
              amount: { type: "string" },
              currency: { type: "string" },
              timestampMs: { type: "number" },
            },
            required: ["ref", "amount", "currency", "timestampMs"],
          },
        },
      },
    },
  },
  {
    name: "cedulon_verify_receipt",
    description:
      "Verify a spend receipt COSE_Sign1 (and payee countersignature when present).",
    annotations: {
      title: "Verify a spend receipt",
      readOnlyHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        receipt: { type: "object", description: "Full SignedReceipt object from cedulon_spend" },
        coseHex: { type: "string" },
        publicKeyPem: { type: "string" },
        counterCoseHex: { type: "string" },
        payeePublicKeyPem: { type: "string" },
      },
    },
  },
  {
    name: "cedulon_export_ledger",
    description:
      "Export receipts, checkpoint, and rail extract in the same JSON shape as npm run demo:export.",
    annotations: {
      title: "Export the ledger",
      readOnlyHint: true,
      openWorldHint: false,
    },
    inputSchema: { type: "object", additionalProperties: false, properties: {} },
  },
  {
    name: "cedulon_status",
    description: "Server version, policy summary, receipt count, and chain head hash.",
    annotations: {
      title: "Server status",
      readOnlyHint: true,
      openWorldHint: false,
    },
    inputSchema: { type: "object", additionalProperties: false, properties: {} },
  },
] as const;

function textResult(body: unknown, isError = false) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(body) }],
    isError,
  };
}

function asSpendArgs(args: Record<string, unknown>): SpendArgs {
  return {
    amount: String(args.amount ?? ""),
    currency: String(args.currency ?? ""),
    payee: String(args.payee ?? ""),
    nonce: String(args.nonce ?? ""),
    tool: args.tool === undefined ? undefined : String(args.tool),
  };
}

function asExtraSettlements(value: unknown): RailSettlement[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value.map((row) => {
    const r = row as Record<string, unknown>;
    return {
      ref: String(r.ref ?? ""),
      amount: String(r.amount ?? ""),
      currency: String(r.currency ?? ""),
      timestampMs: Number(r.timestampMs ?? 0),
    };
  });
}

const server = new Server({ name: "cedulon", version: MCP_SERVER_VERSION }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [...TOOLS] }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const args = (request.params.arguments ?? {}) as Record<string, unknown>;
  try {
    switch (request.params.name) {
      case "cedulon_spend": {
        const outcome = session.spend(asSpendArgs(args));
        return textResult(outcome, !outcome.ok);
      }
      case "cedulon_audit": {
        const report = session.audit({ extraSettlements: asExtraSettlements(args.extraSettlements) });
        return textResult({
          ok: report.ok,
          summary: report.summary,
          findings: report.findings,
          warnings: report.warnings,
          guarantee: report.guarantee,
        });
      }
      case "cedulon_verify_receipt": {
        return textResult(session.verify(args as VerifyArgs));
      }
      case "cedulon_export_ledger": {
        return textResult(session.exportLedger());
      }
      case "cedulon_status": {
        return textResult(session.status());
      }
      default:
        return textResult({ ok: false, reason: "unknown-tool" }, true);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "tool-fault";
    return textResult({ ok: false, reason: message }, true);
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
