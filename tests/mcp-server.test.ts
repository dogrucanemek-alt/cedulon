import assert from "node:assert/strict";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { generateExtractKeys, signRailExtract } from "@cedulon/x402-adapter";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const serverEntry = join(root, "packages", "mcp-server", "src", "index.ts");
const packageVersion: string = JSON.parse(
  readFileSync(join(root, "packages", "mcp-server", "package.json"), "utf8"),
).version;

const TOOL_NAMES = [
  "cedulon_spend",
  "cedulon_audit",
  "cedulon_verify_receipt",
  "cedulon_export_ledger",
  "cedulon_status",
] as const;

type JsonRpc = {
  jsonrpc?: string;
  id?: number | string;
  method?: string;
  result?: unknown;
  error?: { code: number; message: string };
  params?: unknown;
};

class StdioRpc {
  private buf = Buffer.alloc(0);
  private nextId = 1;
  private readonly pending = new Map<
    number,
    { resolve: (v: JsonRpc) => void; reject: (e: Error) => void }
  >();
  private readonly child: ChildProcessWithoutNullStreams;

  constructor(env: NodeJS.ProcessEnv = {}) {
    this.child = spawn(process.execPath, ["--experimental-strip-types", "--conditions=development", serverEntry], {
      cwd: root,
      env: { ...process.env, ...env },
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.child.stdout.on("data", (chunk: Buffer) => this.onData(chunk));
    this.child.stderr.on("data", () => {
      /* protocol must stay on stdout; ignore logs */
    });
    this.child.on("error", (err) => {
      for (const p of this.pending.values()) p.reject(err);
      this.pending.clear();
    });
    this.child.on("exit", (code) => {
      for (const p of this.pending.values()) {
        p.reject(new Error(`mcp-server exited ${code}`));
      }
      this.pending.clear();
    });
  }

  async handshake(): Promise<JsonRpc> {
    const init = await this.request("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "cedulon-mcp-test", version: "0.0.1" },
    });
    this.notify("notifications/initialized", {});
    return init;
  }

  request(method: string, params: unknown): Promise<JsonRpc> {
    const id = this.nextId;
    this.nextId += 1;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`timeout waiting for ${method}`));
      }, 8_000);
      this.pending.set(id, {
        resolve: (v) => {
          clearTimeout(timer);
          resolve(v);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      });
      this.write({ jsonrpc: "2.0", id, method, params });
    });
  }

  notify(method: string, params: unknown): void {
    this.write({ jsonrpc: "2.0", method, params });
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
    const res = await this.request("tools/call", { name, arguments: args });
    assert.equal(res.error, undefined, JSON.stringify(res.error));
    const result = res.result as {
      content?: Array<{ type: string; text?: string }>;
      isError?: boolean;
    };
    const text = result.content?.find((c) => c.type === "text")?.text;
    assert.equal(typeof text, "string");
    return { isError: Boolean(result.isError), body: JSON.parse(text as string) };
  }

  close(): void {
    this.child.kill();
  }

  private write(msg: unknown): void {
    this.child.stdin.write(`${JSON.stringify(msg)}\n`);
  }

  private onData(chunk: Buffer): void {
    this.buf = Buffer.concat([this.buf, chunk]);
    while (true) {
      const idx = this.buf.indexOf("\n");
      if (idx < 0) {
        return;
      }
      const line = this.buf.slice(0, idx).toString("utf8").replace(/\r$/, "");
      this.buf = this.buf.slice(idx + 1);
      if (!line) {
        continue;
      }
      const parsed = JSON.parse(line) as JsonRpc;
      if (parsed.id === undefined) {
        continue;
      }
      const pending = this.pending.get(Number(parsed.id));
      if (pending) {
        this.pending.delete(Number(parsed.id));
        pending.resolve(parsed);
      }
    }
  }
}

describe("mcp-server stdio JSON-RPC", () => {
  it("introduces itself as the version it ships as", async () => {
    // 0.2.1 went to npm announcing 0.2.0, because the version was written out
    // a second time in the source and only the manifest was bumped. Clients see
    // this string, and so does cedulon_status.
    const rpc = new StdioRpc();
    try {
      const init = await rpc.handshake();
      assert.equal(init.error, undefined);
      const info = (init.result as { serverInfo: { name: string; version: string } }).serverInfo;
      assert.equal(info.name, "cedulon");
      assert.equal(info.version, packageVersion);
    } finally {
      rpc.close();
    }
  });

  it("the mcpb manifest lists the tools the server actually exposes", async () => {
    // The bundle ships a tool list of its own, which a desktop host shows
    // before anything runs. A tool renamed here and not there would advertise
    // something the server does not answer to.
    const { mcpbManifest } = await import("../scripts/mcpb-manifest.ts");
    const manifest = mcpbManifest();
    const rpc = new StdioRpc();
    try {
      await rpc.handshake();
      const listed = await rpc.request("tools/list", {});
      const actual = (listed.result as { tools: Array<{ name: string }> }).tools.map((t) => t.name).sort();
      assert.deepEqual(manifest.tools.map((t: { name: string }) => t.name).sort(), actual);
      assert.equal(manifest.version, packageVersion);
    } finally {
      rpc.close();
    }
  });

  it("initialize then tools/list exposes five named schemas", async () => {
    const rpc = new StdioRpc();
    try {
      const init = await rpc.handshake();
      assert.equal(init.error, undefined);
      const listed = await rpc.request("tools/list", {});
      assert.equal(listed.error, undefined);
      const tools = (listed.result as { tools: Array<{ name: string; inputSchema?: unknown }> }).tools;
      assert.equal(tools.length, 5);
      assert.deepEqual(
        tools.map((t) => t.name).sort(),
        [...TOOL_NAMES].sort(),
      );
      for (const tool of tools) {
        assert.equal((tool.inputSchema as { type?: string } | undefined)?.type, "object");
      }
    } finally {
      rpc.close();
    }
  });

  it("every tool carries the annotations the directory requires", async () => {
    // The Anthropic connector directory rejects a submission whose tools lack
    // a title and the applicable read-only or destructive hint. Reading them
    // off the wire is what a reviewer's client does.
    const rpc = new StdioRpc();
    try {
      await rpc.handshake();
      const listed = await rpc.request("tools/list", {});
      const tools = (
        listed.result as {
          tools: Array<{
            name: string;
            annotations?: { title?: string; readOnlyHint?: boolean; destructiveHint?: boolean };
          }>;
        }
      ).tools;
      for (const tool of tools) {
        const a = tool.annotations;
        assert.ok(a, `${tool.name} has no annotations`);
        assert.equal(typeof a.title, "string", `${tool.name} has no annotation title`);
        assert.notEqual(a.title, "", `${tool.name} has an empty annotation title`);
        assert.equal(typeof a.readOnlyHint, "boolean", `${tool.name} declares no readOnlyHint`);
        if (a.readOnlyHint === false) {
          assert.equal(
            typeof a.destructiveHint,
            "boolean",
            `${tool.name} writes, so it must say whether it is destructive`,
          );
        }
      }
    } finally {
      rpc.close();
    }
  });

  it("spend allow returns a signed receipt; over-limit is deny", async () => {
    const rpc = new StdioRpc();
    try {
      await rpc.handshake();
      const allowed = await rpc.callTool("cedulon_spend", {
        amount: "1",
        currency: "USD",
        payee: "payee-1",
        nonce: "allow-nonce-0001",
        tool: "spend",
      });
      assert.equal(allowed.isError, false);
      const okBody = allowed.body as {
        ok?: boolean;
        receipt?: { claims?: { amount?: string; payee?: string }; coseHex?: string };
      };
      assert.equal(okBody.ok, true);
      assert.equal(okBody.receipt?.claims?.amount, "1");
      assert.equal(okBody.receipt?.claims?.payee, "payee-1");
      assert.equal(typeof okBody.receipt?.coseHex, "string");

      const denied = await rpc.callTool("cedulon_spend", {
        amount: "11",
        currency: "USD",
        payee: "payee-1",
        nonce: "deny-nonce-00002",
        tool: "spend",
      });
      assert.equal(denied.isError, true);
      const denyBody = denied.body as { ok?: boolean; reason?: string };
      assert.equal(denyBody.ok, false);
      assert.equal(denyBody.reason, "limit-amount");

      const verified = await rpc.callTool("cedulon_verify_receipt", {
        receipt: okBody.receipt,
      });
      assert.equal(verified.isError, false);
      const verifyBody = verified.body as { ok?: boolean; receipt?: boolean; countersignature?: null };
      assert.equal(verifyBody.ok, true);
      assert.equal(verifyBody.receipt, true);
      assert.equal(verifyBody.countersignature, null);
    } finally {
      rpc.close();
    }
  });

  it("audit is balanced after allow, and flags an injected bypass extract", async () => {
    const rpc = new StdioRpc();
    try {
      await rpc.handshake();
      const paid = await rpc.callTool("cedulon_spend", {
        amount: "1",
        currency: "USD",
        payee: "payee-1",
        nonce: "audit-nonce-0001",
        tool: "spend",
      });
      assert.equal(paid.isError, false);

      const balanced = await rpc.callTool("cedulon_audit", {});
      assert.equal(balanced.isError, false);
      const balancedBody = balanced.body as { ok?: boolean; summary?: string; findings?: unknown[] };
      assert.equal(balancedBody.ok, true);
      assert.equal(balancedBody.summary, "audit: balanced");
      assert.equal(balancedBody.findings?.length, 0);

      const bypass = await rpc.callTool("cedulon_audit", {
        extraSettlements: [
          { ref: "bypass-hidden", amount: "7", currency: "USD", timestampMs: 1_700_000_000_099 },
        ],
      });
      assert.equal(bypass.isError, false);
      const bypassBody = bypass.body as {
        ok?: boolean;
        summary?: string;
        findings?: Array<{ code: string; id: string }>;
      };
      assert.equal(bypassBody.ok, false);
      assert.equal(
        bypassBody.findings?.some((f) => f.code === "settlement-without-receipt" && f.id === "bypass-hidden"),
        true,
      );
    } finally {
      rpc.close();
    }
  });

  it("audit over a presented extract names the scope it was computed over, and refuses rows added beside it", async () => {
    const rpc = new StdioRpc();
    try {
      await rpc.handshake();
      const paid = await rpc.callTool("cedulon_spend", {
        amount: "1",
        currency: "USD",
        payee: "payee-1",
        nonce: "scope-nonce-0001",
        tool: "spend",
      });
      assert.equal(paid.isError, false);
      const claims = (
        paid.body as {
          receipt?: { claims?: { amount?: string; currency?: string; timestampMs?: number; x402PaymentRef?: string } };
        }
      ).receipt?.claims;
      assert.equal(typeof claims?.timestampMs, "number");
      assert.equal(typeof claims?.x402PaymentRef, "string");
      const paidAt = claims!.timestampMs as number;

      // The in-process audit declares no population, so it names none.
      const own = await rpc.callTool("cedulon_audit", {});
      assert.equal(own.isError, false);
      assert.equal("scope" in (own.body as object), false);

      // A rail extract presented to the audit is the settlement side, and the
      // result names the account, rail and window that extract declared.
      const keys = generateExtractKeys();
      const body = {
        accountId: "acct-scope-0001",
        railId: "rail-scope-0001",
        windowStartMs: paidAt - 3_600_000,
        windowEndMs: paidAt + 3_600_000,
        settlements: [
          {
            ref: claims!.x402PaymentRef as string,
            amount: claims!.amount as string,
            currency: claims!.currency as string,
            timestampMs: paidAt,
          },
        ],
      };
      const extract = signRailExtract(body, keys.privateKeyPem, keys.publicKeyPem);
      const trust = {
        publicKeyPem: keys.publicKeyPem,
        accountId: body.accountId,
        railId: body.railId,
        windowStartMs: body.windowStartMs,
        windowEndMs: body.windowEndMs,
      };
      const over = await rpc.callTool("cedulon_audit", { extract, trust });
      assert.equal(over.isError, false);
      const overBody = over.body as { ok?: boolean; summary?: string; scope?: unknown };
      assert.equal(overBody.ok, true);
      assert.equal(overBody.summary, "audit: balanced");
      assert.deepEqual(overBody.scope, {
        accountId: body.accountId,
        railId: body.railId,
        windowStartMs: body.windowStartMs,
        windowEndMs: body.windowEndMs,
      });

      // Rows cannot be added beside a presented extract: the extract is the
      // population, and a row outside it would be a charge no key stands behind.
      const beside = await rpc.callTool("cedulon_audit", {
        extract,
        trust,
        extraSettlements: [
          { ref: "bypass-beside-extract", amount: "7", currency: "USD", timestampMs: paidAt + 1 },
        ],
      });
      assert.equal(beside.isError, true);
      assert.equal((beside.body as { reason?: string }).reason, "extra-settlements-with-extract");

      // A malformed extract is refused before anything is reconciled.
      const malformed = await rpc.callTool("cedulon_audit", {
        extract: { body: { accountId: "acct-scope-0001" }, signature: "", publicKeyPem: keys.publicKeyPem },
      });
      assert.equal(malformed.isError, true);
      assert.match(String((malformed.body as { reason?: string }).reason), /^extract:/);

      // The same for a body the library itself would refuse to sign, and for
      // the three shapes the boundary refuses on top of that rule. Each of
      // these once walked through the gate and came back as a balanced audit
      // under a warning; the gate now names what is wrong with the document.
      const refused: Array<[string, Record<string, unknown>, RegExp]> = [
        [
          "negative clock skew",
          { body: { ...body, clockSkewMs: -1 }, signature: extract.signature, publicKeyPem: keys.publicKeyPem },
          /^extract: malformed-extract-clockSkewMs/,
        ],
        [
          "amount outside the grammar",
          {
            body: { ...body, settlements: [{ ...body.settlements[0], amount: "01" }] },
            signature: extract.signature,
            publicKeyPem: keys.publicKeyPem,
          },
          /^extract: renamed-settlement-amount/,
        ],
        [
          "empty account",
          { body: { ...body, accountId: "" }, signature: extract.signature, publicKeyPem: keys.publicKeyPem },
          /^extract: body\.accountId and body\.railId must be non-empty/,
        ],
        [
          "empty signature",
          { body, signature: "", publicKeyPem: keys.publicKeyPem },
          /^extract: signature must be non-empty/,
        ],
        [
          "public key that is not a PEM",
          { body, signature: extract.signature, publicKeyPem: "not-a-pem" },
          /^extract: publicKeyPem must be an SPKI PEM public key/,
        ],
        [
          "window that ends before it starts",
          {
            body: { ...body, windowStartMs: body.windowEndMs, windowEndMs: body.windowStartMs },
            signature: extract.signature,
            publicKeyPem: keys.publicKeyPem,
          },
          /^extract: body\.windowEndMs must be later than body\.windowStartMs/,
        ],
      ];
      for (const [name, hostile, reason] of refused) {
        const res = await rpc.callTool("cedulon_audit", { extract: hostile, trust });
        assert.equal(res.isError, true, `${name}: the gate let the extract through`);
        assert.match(String((res.body as { reason?: string }).reason), reason, name);
        assert.equal("scope" in (res.body as object), false, `${name}: a refused extract named a scope`);
      }
    } finally {
      rpc.close();
    }
  });

  it("status reports version, policy, receipt count, and chain head", async () => {
    const rpc = new StdioRpc();
    try {
      await rpc.handshake();
      const before = await rpc.callTool("cedulon_status", {});
      const beforeBody = before.body as {
        version?: string;
        policy?: { maxAmount?: string };
        receiptCount?: number;
        chainHead?: string | null;
      };
      assert.equal(beforeBody.version, packageVersion);
      assert.equal(beforeBody.policy?.maxAmount, "10");
      assert.equal(beforeBody.receiptCount, 0);
      assert.equal(beforeBody.chainHead, null);

      await rpc.callTool("cedulon_spend", {
        amount: "2",
        currency: "USD",
        payee: "payee-1",
        nonce: "status-nonce-0001",
        tool: "spend",
      });
      const after = await rpc.callTool("cedulon_status", {});
      const afterBody = after.body as { receiptCount?: number; chainHead?: string | null };
      assert.equal(afterBody.receiptCount, 1);
      assert.equal(typeof afterBody.chainHead, "string");
    } finally {
      rpc.close();
    }
  });
});
