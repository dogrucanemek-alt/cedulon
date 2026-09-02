#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { CedulonSession, MCP_SERVER_VERSION, type SpendArgs, type VerifyArgs } from "./session.ts";
import { railExtractShapeRefusal, type RailSettlement, type SignedRailExtract } from "@cedulon/x402-adapter";

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
      "Reconcile the in-process receipt chain and checkpoint against the rail extract: this server's own ledger, or a signed extract you present. Returns audit: balanced or findings, and names the account, rail and window it was computed over (scope) when an extract declared one.",
    annotations: {
      title: "Audit the receipt chain",
      readOnlyHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        extract: {
          type: "object",
          description:
            "A signed rail extract you were presented with: { body: { accountId, railId, windowStartMs, windowEndMs, settlements: [{ ref, amount, currency, timestampMs }], clockSkewMs? }, signature, publicKeyPem }. Present, it is the settlement side of the audit: this server's in-process settlement rows are not consulted, rows added through extraSettlements are refused beside it (an empty list adds nothing and is accepted), and the result carries scope. The receipt side is still this server's own receipt chain and checkpoints, so an extract for an account or rail this server did not settle on reports this server's receipts as unmatched; that is the correct reading of that pairing, not a defect. A body the library would refuse to sign (malformed window, amount outside the grammar, negative clock skew), an empty account, rail or signature, or a key that is not a PEM is refused as extract: ... before anything is reconciled. Absent, the audit runs over this server's own ledger and declares no scope.",
        },
        trust: {
          type: "object",
          description: "Rail key you hold out of band: { publicKeyPem, accountId?, railId?, windowStartMs?, windowEndMs? }",
        },
        issuerTrust: {
          type: "object",
          description: "Issuer key(s) you hold out of band: { publicKeyPem: string | string[] }. Without it the audit checks this server's records against this server's own key.",
        },
        witnessTrust: {
          type: "object",
          description: "Transparency log key you hold out of band: { publicKeyPem: string | string[] }",
        },
        payeeTrust: {
          type: "object",
          description: "Payee keys you hold out of band, keyed by payee: { \"payee-1\": publicKeyPem }",
        },
        manifest: {
          type: "object",
          description: "A Trade Manifest you were presented with. Omit for a no-manifest deployment. Present without manifestTrust is unauthenticated-manifest.",
        },
        manifestTrust: {
          type: "object",
          description: "Manifest publisher key(s) you hold out of band: { publicKeyPem: string | string[] }",
        },
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
      "Verify a spend receipt COSE_Sign1 (and payee countersignature when present). Supply expectIssuerKeyPem to check it against a key you already hold; without one the receipt is only checked against the key it carries, which any key satisfies.",
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
        expectIssuerKeyPem: {
          type: "string",
          description: "Issuer key you hold out of band. Omit and the check is self-referential.",
        },
        expectPayeeKeyPem: {
          type: "string",
          description: "Payee key you hold out of band, for the countersignature.",
        },
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

/**
 * A presented extract is taken as the caller shaped it and refused when it is
 * not the shape a signed extract has, before anything is reconciled. Coercing
 * a missing member into an empty string would let a document with no declared
 * account read as one that declared "", and the audit would name that.
 */
function asExtract(value: unknown): SignedRailExtract | undefined {
  if (value === undefined) {
    return undefined;
  }
  // null is a presented value, not an absent one. Reading it as "no extract"
  // would run the in-process audit for a caller who asked for something else
  // and could not tell the two answers apart.
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("extract: expected an object { body, signature, publicKeyPem }");
  }
  const v = value as Record<string, unknown>;
  if (typeof v.signature !== "string" || typeof v.publicKeyPem !== "string") {
    throw new Error("extract: signature and publicKeyPem must be strings");
  }
  if (typeof v.body !== "object" || v.body === null || Array.isArray(v.body)) {
    throw new Error("extract: body must be an object");
  }
  const b = v.body as Record<string, unknown>;
  if (typeof b.accountId !== "string" || typeof b.railId !== "string") {
    throw new Error("extract: body.accountId and body.railId must be strings");
  }
  if (typeof b.windowStartMs !== "number" || typeof b.windowEndMs !== "number") {
    throw new Error("extract: body.windowStartMs and body.windowEndMs must be numbers");
  }
  if (!Array.isArray(b.settlements)) {
    throw new Error("extract: body.settlements must be an array");
  }
  for (const row of b.settlements) {
    const r = row as Record<string, unknown> | null;
    if (
      r === null ||
      typeof r !== "object" ||
      typeof r.ref !== "string" ||
      typeof r.amount !== "string" ||
      typeof r.currency !== "string" ||
      typeof r.timestampMs !== "number"
    ) {
      throw new Error("extract: each settlement must be { ref: string, amount: string, currency: string, timestampMs: number }");
    }
  }
  if (b.clockSkewMs !== undefined && typeof b.clockSkewMs !== "number") {
    throw new Error("extract: body.clockSkewMs must be a number when present");
  }
  // The rule the library applies before it signs or verifies an extract:
  // safe-integer window and timestamps, the amount grammar on every row, a
  // non-negative clock skew. A body the library would refuse to sign is
  // refused here by the same name, before the audit is asked anything. A
  // review pass over the first cut of this gate found that a negative
  // clockSkewMs and an empty signature walked through the typeof checks above
  // and came back as a balanced audit under a warning, which is exactly the
  // silent acceptance this gate exists to prevent.
  const shape = railExtractShapeRefusal(v.body);
  if (shape !== null) {
    throw new Error(`extract: ${shape}`);
  }
  // Two refusals the boundary adds on top of the library's shape rule. An
  // empty account or rail is an unstated one written as a string, and the
  // audit would otherwise name "" as the population it covered. An empty
  // signature or a public key that is not a PEM cannot verify, so the audit
  // would only ever report them as an unauthenticated extract; refusing them
  // here says what is wrong with the document rather than what it fails to
  // prove.
  if (b.accountId.length === 0 || b.railId.length === 0) {
    throw new Error("extract: body.accountId and body.railId must be non-empty");
  }
  if (v.signature.length === 0) {
    throw new Error("extract: signature must be non-empty");
  }
  if (!v.publicKeyPem.includes("-----BEGIN PUBLIC KEY-----")) {
    throw new Error("extract: publicKeyPem must be an SPKI PEM public key");
  }
  // The body is passed through as presented rather than rebuilt, so the bytes
  // the signature covers are the bytes the audit canonicalises.
  return { body: v.body as SignedRailExtract["body"], signature: v.signature, publicKeyPem: v.publicKeyPem };
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
        const extract = asExtract(args.extract);
        const extraSettlements = asExtraSettlements(args.extraSettlements);
        if (extract && extraSettlements && extraSettlements.length > 0) {
          // A presented extract is the population the audit is over. A row added
          // beside it would be a charge no rail key stands behind (MUST-T10-20's
          // reasoning from the other side), so the call is refused rather than
          // reconciled with a warning. An empty list adds nothing and is not
          // refused: the rule is about rows, not about the member being present.
          return textResult(
            {
              ok: false,
              reason: "extra-settlements-with-extract",
              detail: "a presented extract is the settlement side of the audit; rows cannot be added beside it",
            },
            true,
          );
        }
        const report = session.audit({
          extract,
          extraSettlements,
          trust: args.trust as never,
          issuerTrust: args.issuerTrust as never,
          witnessTrust: args.witnessTrust as never,
          payeeTrust: args.payeeTrust as never,
          manifest: args.manifest as never,
          manifestTrust: args.manifestTrust as never,
        });
        return textResult({
          ok: report.ok,
          summary: report.summary,
          findings: report.findings,
          warnings: report.warnings,
          guarantee: report.guarantee,
          // The account, rail and window the result was computed over, present
          // exactly when the audit ran over a presented extract (MUST-T10-19 on
          // this surface). Absent, the audit was over this server's own ledger,
          // which declares no population.
          ...(report.scope ? { scope: report.scope } : {}),
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
