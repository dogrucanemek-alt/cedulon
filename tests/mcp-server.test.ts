import assert from "node:assert/strict";
import { spawn, type ChildProcess, type ChildProcessWithoutNullStreams } from "node:child_process";
import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { generateExtractKeys, signRailExtract } from "@cedulon/x402-adapter";
import { type GroupKill, KILL_GRACE_MS, signalGroup, taskkillTree } from "../scripts/bounded-run.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const serverEntry = join(root, "packages", "mcp-server", "src", "index.ts");
const packageVersion: string = JSON.parse(
  readFileSync(join(root, "packages", "mcp-server", "package.json"), "utf8"),
).version;

const isWindows = process.platform === "win32";

/** Bound on one JSON-RPC request. */
const REQUEST_TIMEOUT_MS = 8_000;
/**
 * How long close() waits for the server to exit once its stdin is closed,
 * before it ends the tree. Measured on Windows at 12 ms.
 */
const CLOSE_EXIT_MS = 30_000;

/** The `{ timeout }` of a case that sends `requests` requests and closes one server. */
function caseTimeout(requests: number, exitWaitMs = CLOSE_EXIT_MS): number {
  return requests * REQUEST_TIMEOUT_MS + exitWaitMs + 3 * KILL_GRACE_MS + 10_000;
}

/** A stand-in server: it answers every request, and ignores both its stdin closing and SIGTERM. */
const STUBBORN_SERVER = [
  `process.on("SIGTERM", () => {});`,
  `process.stdin.on("data", (b) => {`,
  `  for (const line of b.toString("utf8").split("\\n").filter(Boolean)) {`,
  `    const m = JSON.parse(line);`,
  `    if (m.id !== undefined) process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: m.id, result: {} }) + "\\n");`,
  `  }`,
  `});`,
  `setInterval(() => {}, 1000);`,
  `setTimeout(() => process.exit(0), 60000);`,
].join("\n");

/** A stand-in tree killer: it ends no tree, never exits on its own, and ignores SIGTERM. */
const HUNG_KILLER = [
  `process.on("SIGTERM", () => {});`,
  `setInterval(() => {}, 1000);`,
  `setTimeout(() => process.exit(0), 60000);`,
].join("\n");

/** A stand-in tree killer that ends no tree and never exits, even once it is sent a signal. */
class StuckKiller extends EventEmitter {
  readonly pid = undefined;
  readonly exitCode = null;
  readonly signalCode = null;
  readonly signals: Array<NodeJS.Signals | number | undefined> = [];
  unrefed = false;

  kill(signal?: NodeJS.Signals | number): boolean {
    this.signals.push(signal);
    return true;
  }

  unref(): void {
    this.unrefed = true;
  }
}

/**
 * Resolves true once `proc` has exited, or has failed to start, as its own
 * events report it; false after `ms`. An error once it has started is a
 * failed signal, so the bound still applies.
 */
function endsWithin(proc: ChildProcess, ms: number): Promise<boolean> {
  if (proc.exitCode !== null || proc.signalCode !== null) return Promise.resolve(true);
  return new Promise((resolve) => {
    const done = (ended: boolean): void => {
      clearTimeout(timer);
      proc.off("exit", onEnd);
      proc.off("close", onEnd);
      proc.off("error", onError);
      resolve(ended);
    };
    const onEnd = (): void => done(true);
    const onError = (): void => {
      if (proc.pid === undefined) done(true);
    };
    const timer = setTimeout(() => done(false), ms);
    proc.on("exit", onEnd);
    proc.on("close", onEnd);
    proc.on("error", onError);
  });
}

/**
 * Waits KILL_GRACE_MS for the process ending a tree to exit. One still
 * running is sent SIGKILL and waited on for KILL_GRACE_MS more; one running
 * after that is unref()'d, so that it cannot hold the suite. Returns why the
 * tree may not have been ended.
 */
async function awaitTreeKiller(killer: ChildProcess): Promise<string | undefined> {
  if (await endsWithin(killer, KILL_GRACE_MS)) {
    return killer.pid === undefined ? "its tree killer could not start" : undefined;
  }
  killer.kill("SIGKILL");
  if (await endsWithin(killer, KILL_GRACE_MS)) {
    return `its tree killer had not exited ${KILL_GRACE_MS} ms after it started, and was ended`;
  }
  killer.unref();
  return `its tree killer had not exited ${KILL_GRACE_MS} ms after it started, nor ${KILL_GRACE_MS} ms after it was ended, and was let go`;
}

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

type StdioRpcOptions = {
  env?: NodeJS.ProcessEnv;
  /** Node arguments for the server; the mcp-server entry unless a case stands in its own. */
  args?: readonly string[];
  /** Names the server in close()'s refusal. */
  label?: string;
  exitWaitMs?: number;
  /** For tests only: stands in for ending the tree; returns why the tree may not have been ended, if it may not. */
  endTree?: (pid: number) => Promise<string | undefined>;
  /** For tests only: stands in for `taskkill /T /F`, on every platform, as the process that ends the tree. */
  killer?: (pid: number) => ChildProcess;
  /** For tests only: stands in for process.kill, which every signal sent by number goes through. */
  signal?: GroupKill;
};

class StdioRpc {
  private buf = Buffer.alloc(0);
  private nextId = 1;
  private readonly pending = new Map<
    number,
    { resolve: (v: JsonRpc) => void; reject: (e: Error) => void }
  >();
  private readonly child: ChildProcessWithoutNullStreams;
  private readonly label: string;
  private readonly exitWaitMs: number;
  private readonly endTree: (pid: number) => Promise<string | undefined>;
  private readonly startKiller: ((pid: number) => ChildProcess) | undefined;
  private readonly signal: GroupKill;

  constructor({ env = {}, args, label = "mcp-server", exitWaitMs = CLOSE_EXIT_MS, endTree, killer, signal }: StdioRpcOptions = {}) {
    this.label = label;
    this.exitWaitMs = exitWaitMs;
    this.endTree = endTree ?? ((pid) => this.endTreeOf(pid));
    this.startKiller = killer;
    this.signal = signal ?? ((p, s) => void process.kill(p, s));
    // On POSIX the server leads its own process group, so close() can end
    // what it started with it.
    this.child = spawn(process.execPath, [...(args ?? ["--experimental-strip-types", "--conditions=development", serverEntry])], {
      cwd: root,
      env: { ...process.env, ...env },
      stdio: ["pipe", "pipe", "pipe"],
      detached: !isWindows,
      windowsHide: true,
    });
    // A write to a server that has exited fails here; the exit handler
    // below already rejects what was pending.
    this.child.stdin.on("error", () => {});
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
      }, REQUEST_TIMEOUT_MS);
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

  get pid(): number | undefined {
    return this.child.pid;
  }

  /** The server has exited and its exit has been seen. */
  get exited(): boolean {
    return this.child.exitCode !== null || this.child.signalCode !== null;
  }

  get exitCode(): number | null {
    return this.child.exitCode;
  }

  /**
   * Close stdin and wait up to exitWaitMs for the server to exit. If it does
   * not, end its tree: SIGKILL to the process group it leads on POSIX,
   * `taskkill /T /F` on Windows, both from scripts/bounded-run.ts. The
   * taskkill process is itself bounded, as awaitTreeKiller describes. A
   * server still running KILL_GRACE_MS after that is refused by name. On
   * POSIX the group is sent SIGKILL once the server has exited, as
   * runBounded does, so nothing it started outlives the case.
   */
  async close(): Promise<void> {
    const pid = this.child.pid;
    if (pid === undefined) return;
    this.child.stdin.end();
    if (!(await this.waitForExit(this.exitWaitMs))) {
      const unended = await this.endTree(pid);
      if (!(await this.waitForExit(KILL_GRACE_MS))) {
        this.child.stdout.destroy();
        this.child.stderr.destroy();
        this.child.unref();
        const why = unended === undefined ? "" : `; ${unended}`;
        throw new Error(
          `${this.label} (pid ${pid}) is still running ${this.exitWaitMs} ms after its stdin closed and ${KILL_GRACE_MS} ms after its tree was ended${why}`,
        );
      }
    }
    if (!isWindows) {
      const leftover = signalGroup(pid, "SIGKILL", this.signal, {
        leaderReaped: true,
        platform: process.platform,
      });
      if (leftover !== undefined) throw new Error(`${this.label} (pid ${pid}) exited, and its process group could not be signalled: ${leftover}`);
    }
  }

  /**
   * Ends a server close() left running, through its own child object. A
   * server whose exit has been seen is not signalled: it has been reaped, and
   * its PID may name another process by now. Returns whether a signal was sent.
   */
  endQuietly(): boolean {
    if (this.exited) return false;
    return this.child.kill("SIGKILL");
  }

  /** Resolves true once the server's own exit event has been seen; false after `ms`. */
  waitForExit(ms: number): Promise<boolean> {
    if (this.exited) return Promise.resolve(true);
    return new Promise((resolve) => {
      const onExit = () => {
        clearTimeout(timer);
        resolve(true);
      };
      const timer = setTimeout(() => {
        this.child.off("exit", onExit);
        resolve(false);
      }, ms);
      this.child.once("exit", onExit);
    });
  }

  /** Ends the tree the server leads; returns why the tree may not have been ended. */
  private async endTreeOf(pid: number): Promise<string | undefined> {
    if (isWindows || this.startKiller !== undefined) return awaitTreeKiller((this.startKiller ?? taskkillTree)(pid));
    const code = signalGroup(pid, "SIGKILL", this.signal, {
      leaderReaped: this.exited,
      platform: process.platform,
    });
    return code === undefined ? undefined : `its process group could not be signalled: ${code}`;
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
  it("introduces itself as the version it ships as", { timeout: caseTimeout(1) }, async () => {
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
      await rpc.close();
    }
  });

  it("the mcpb manifest lists the tools the server actually exposes", { timeout: caseTimeout(2) }, async () => {
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
      await rpc.close();
    }
  });

  it("initialize then tools/list exposes five named schemas", { timeout: caseTimeout(2) }, async () => {
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
      await rpc.close();
    }
  });

  it("every tool carries the annotations the directory requires", { timeout: caseTimeout(2) }, async () => {
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
      await rpc.close();
    }
  });

  it("spend allow returns a signed receipt; over-limit is deny", { timeout: caseTimeout(4) }, async () => {
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
      await rpc.close();
    }
  });

  it("audit is balanced after allow, and flags an injected bypass extract", { timeout: caseTimeout(4) }, async () => {
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
      await rpc.close();
    }
  });

  it("audit over a presented extract names the scope it was computed over, and refuses rows added beside it", { timeout: caseTimeout(19) }, async () => {
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
          /^extract: malformed-extract-window/,
        ],
        [
          "window start written as 1e309, which JSON-RPC carries as null",
          {
            body: { ...body, windowStartMs: 1e309 },
            signature: extract.signature,
            publicKeyPem: keys.publicKeyPem,
          },
          /^extract: /,
        ],
      ];
      for (const [name, hostile, reason] of refused) {
        const res = await rpc.callTool("cedulon_audit", { extract: hostile, trust });
        assert.equal(res.isError, true, `${name}: the gate let the extract through`);
        assert.match(String((res.body as { reason?: string }).reason), reason, name);
        assert.equal("scope" in (res.body as object), false, `${name}: a refused extract named a scope`);
      }

      // null is a presented value, not an absent one: it is refused, not read
      // as "audit the in-process ledger".
      const nul = await rpc.callTool("cedulon_audit", { extract: null });
      assert.equal(nul.isError, true);
      assert.match(String((nul.body as { reason?: string }).reason), /^extract: expected an object/);

      // An empty extraSettlements list adds no row, so it is not refused, and
      // the result still names its scope.
      const emptyBeside = await rpc.callTool("cedulon_audit", { extract, trust, extraSettlements: [] });
      assert.equal(emptyBeside.isError, false);
      assert.equal((emptyBeside.body as { ok?: boolean }).ok, true);
      assert.deepEqual((emptyBeside.body as { scope?: unknown }).scope, overBody.scope);

      // Without a trust pin the extract is checked against the key it carries,
      // which establishes internal consistency and attests nothing: the audit
      // says so, the guarantee is conditional, and the scope is still named,
      // because an extract was presented and the population is known.
      const unpinned = await rpc.callTool("cedulon_audit", { extract });
      assert.equal(unpinned.isError, false);
      const unpinnedBody = unpinned.body as { guarantee?: string; warnings?: Array<{ code: string }>; scope?: unknown };
      assert.equal(unpinnedBody.guarantee, "conditional");
      assert.equal(unpinnedBody.warnings?.some((w) => w.code === "unauthenticated-extract"), true);
      assert.deepEqual(unpinnedBody.scope, overBody.scope);

      // An extract for an account this server did not settle on: the receipt
      // side is still this server's chain, so its receipt comes back unmatched
      // against that population. The in-process settlement rows are not in
      // the comparison at all - if they were, the audit would report that the
      // caller-supplied rows differ from the signed extract.
      const foreignKeys = generateExtractKeys();
      const foreignBody = {
        accountId: "acct-elsewhere-0001",
        railId: "rail-elsewhere-0001",
        windowStartMs: paidAt - 3_600_000,
        windowEndMs: paidAt + 3_600_000,
        settlements: [],
      };
      const foreign = signRailExtract(foreignBody, foreignKeys.privateKeyPem, foreignKeys.publicKeyPem);
      const elsewhere = await rpc.callTool("cedulon_audit", {
        extract: foreign,
        trust: { publicKeyPem: foreignKeys.publicKeyPem, accountId: foreignBody.accountId, railId: foreignBody.railId },
      });
      assert.equal(elsewhere.isError, false);
      const elsewhereBody = elsewhere.body as { ok?: boolean; findings?: Array<{ code: string; id: string }>; scope?: { accountId?: string } };
      assert.equal(elsewhereBody.ok, false);
      assert.equal(elsewhereBody.findings?.some((f) => f.code === "receipt-without-settlement"), true);
      assert.equal(elsewhereBody.findings?.some((f) => f.code === "extract-settlement-mismatch"), false);
      assert.equal(elsewhereBody.scope?.accountId, foreignBody.accountId);

      // A member the rail added to the body travels through the gate as
      // signed: the signature covers it, so it is neither stripped nor
      // rebuilt.
      const extended = signRailExtract({ ...body, vendorField: "signed-too" } as typeof body, keys.privateKeyPem, keys.publicKeyPem);
      const withExtra = await rpc.callTool("cedulon_audit", { extract: extended, trust });
      assert.equal(withExtra.isError, false);
      assert.equal((withExtra.body as { ok?: boolean }).ok, true);

      // The ledger export is over the in-process ledger and names no scope,
      // whatever extract the last audit call was over.
      const exported = await rpc.callTool("cedulon_export_ledger", {});
      assert.equal(exported.isError, false);
      assert.equal("scope" in (exported.body as object), false);
    } finally {
      await rpc.close();
    }
  });

  it("RED then GREEN: audit results and the ledger export carry the class counts", { timeout: caseTimeout(5) }, async () => {
    type Counts = {
      receipts: Record<string, number>;
      settlements: Record<string, number>;
    };
    const conserved = (counts: unknown, label: string): Counts => {
      assert.ok(counts && typeof counts === "object", `${label} carries counts`);
      const c = counts as Counts;
      const r = c.receipts;
      const s = c.settlements;
      assert.equal(r.inScope, r.aborted + r.settled, `${label}: in-scope receipts split into aborted and settled`);
      assert.equal(
        r.settled,
        r.matched + r.deferred + r.carried + r.unmatched + r.repeated + r.unreconciled,
        `${label}: every settled receipt lands in one class`,
      );
      assert.equal(
        s.rows,
        s.matched + s.deferred + s.unmatched + s.repeated + s.unreconciled,
        `${label}: every row lands in one class`,
      );
      assert.equal(r.matched, s.matched, `${label}: a match is one receipt against one row`);
      return c;
    };
    const rpc = new StdioRpc();
    try {
      await rpc.handshake();
      const paid = await rpc.callTool("cedulon_spend", {
        amount: "1",
        currency: "USD",
        payee: "payee-1",
        nonce: "count-nonce-0001",
        tool: "spend",
      });
      assert.equal(paid.isError, false);
      const claims = (
        paid.body as {
          receipt?: { claims?: { amount?: string; currency?: string; timestampMs?: number; x402PaymentRef?: string } };
        }
      ).receipt?.claims;
      const paidAt = claims!.timestampMs as number;

      // Over the server's own ledger: one receipt, one row, matched.
      const own = await rpc.callTool("cedulon_audit", {});
      assert.equal(own.isError, false);
      const ownCounts = conserved((own.body as { counts?: unknown }).counts, "own-ledger audit");
      assert.equal(ownCounts.receipts.submitted, 1);
      assert.equal(ownCounts.receipts.matched, 1);
      assert.equal(ownCounts.settlements.rows, 1);

      // Over a presented extract that does not name the receipt: the receipt
      // is unmatched and the row is unmatched, and the counts say so beside
      // the findings.
      const keys = generateExtractKeys();
      const body = {
        accountId: "acct-count-0001",
        railId: "rail-count-0001",
        windowStartMs: paidAt - 3_600_000,
        windowEndMs: paidAt + 3_600_000,
        settlements: [{ ref: "someone-else", amount: "1", currency: "USD", timestampMs: paidAt }],
      };
      const extract = signRailExtract(body, keys.privateKeyPem, keys.publicKeyPem);
      const over = await rpc.callTool("cedulon_audit", {
        extract,
        trust: {
          publicKeyPem: keys.publicKeyPem,
          accountId: body.accountId,
          railId: body.railId,
          windowStartMs: body.windowStartMs,
          windowEndMs: body.windowEndMs,
        },
      });
      assert.equal(over.isError, false);
      const overCounts = conserved((over.body as { counts?: unknown }).counts, "extract audit");
      assert.equal(overCounts.receipts.unmatched, 1);
      assert.equal(overCounts.settlements.unmatched, 1);
      assert.equal(overCounts.receipts.matched, 0);

      // The export is over the in-process ledger, so it carries that audit's counts.
      const exported = await rpc.callTool("cedulon_export_ledger", {});
      assert.equal(exported.isError, false);
      assert.deepEqual((exported.body as { counts?: unknown }).counts, ownCounts);
    } finally {
      await rpc.close();
    }
  });

  it("status reports version, policy, receipt count, and chain head", { timeout: caseTimeout(4) }, async () => {
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
      await rpc.close();
    }
  });
});

describe("closing the stdio server leaves no process behind", () => {
  it("close() lets a server that exits when its stdin closes exit on its own, and waits for it", { timeout: caseTimeout(1) }, async () => {
    const rpc = new StdioRpc();
    try {
      await rpc.handshake();
      const started = Date.now();
      await rpc.close();
      const elapsed = Date.now() - started;
      assert.equal(rpc.exited, true, "close() returned before the server exited");
      assert.equal(rpc.exitCode, 0, "the server was ended rather than left to exit");
      assert.ok(elapsed < CLOSE_EXIT_MS, `the server took ${elapsed} ms to exit once its stdin closed`);
    } finally {
      rpc.endQuietly();
    }
  });

  it("RED then GREEN: close() ends a server that ignores its stdin closing and SIGTERM at its bound, and returns once it has exited", { timeout: caseTimeout(1, 1000) }, async () => {
    const exitWaitMs = 1000;
    const rpc = new StdioRpc({ args: ["-e", STUBBORN_SERVER], label: "stubborn server", exitWaitMs });
    try {
      // Answered only once its SIGTERM handler is in place.
      await rpc.request("ping", {});
      const started = Date.now();
      await rpc.close();
      const elapsed = Date.now() - started;
      assert.equal(rpc.exited, true, "close() returned before the server exited");
      assert.ok(elapsed >= exitWaitMs - 50, `close() ended the server after ${elapsed} ms, before its ${exitWaitMs} ms wait`);
      assert.ok(elapsed < exitWaitMs + 3 * KILL_GRACE_MS + 3000, `close() took ${elapsed} ms`);
    } finally {
      rpc.endQuietly();
    }
  });

  it("RED then GREEN: a server still running after its tree was ended is refused by name", { timeout: caseTimeout(1, 1000) }, async () => {
    const exitWaitMs = 1000;
    const rpc = new StdioRpc({
      args: ["-e", STUBBORN_SERVER],
      label: "stubborn server",
      exitWaitMs,
      endTree: async () => undefined,
    });
    const pid = rpc.pid;
    try {
      await rpc.request("ping", {});
      const started = Date.now();
      await assert.rejects(
        async () => rpc.close(),
        new Error(
          `stubborn server (pid ${pid}) is still running ${exitWaitMs} ms after its stdin closed and ${KILL_GRACE_MS} ms after its tree was ended`,
        ),
      );
      const elapsed = Date.now() - started;
      assert.ok(elapsed >= exitWaitMs + KILL_GRACE_MS - 50, `close() gave up after ${elapsed} ms`);
    } finally {
      rpc.endQuietly();
    }
    assert.equal(await rpc.waitForExit(2000), true, "the server is still running after it was ended");
  });

  it("RED then GREEN: close() ends a tree killer that has not exited at its bound, and waits for it", { timeout: caseTimeout(1, 1000) }, async () => {
    const exitWaitMs = 1000;
    const killers: ChildProcess[] = [];
    const rpc = new StdioRpc({
      args: ["-e", STUBBORN_SERVER],
      label: "stubborn server",
      exitWaitMs,
      killer: () => {
        const killer = spawn(process.execPath, ["-e", HUNG_KILLER], { stdio: "ignore", windowsHide: true });
        killer.on("error", () => {});
        killers.push(killer);
        return killer;
      },
    });
    try {
      await rpc.request("ping", {});
      const started = Date.now();
      const refusal = await rpc.close().then(
        () => undefined,
        (err: unknown) => err,
      );
      const elapsed = Date.now() - started;
      assert.equal(killers.length, 1, "close() did not start one tree killer");
      const [killer] = killers;
      assert.ok(killer.exitCode !== null || killer.signalCode !== null, "the tree killer is still running after close() returned");
      assert.ok(elapsed < exitWaitMs + 3 * KILL_GRACE_MS + 3000, `close() took ${elapsed} ms`);
      // The stand-in ends no tree, so the server is still running, and is refused by name.
      assert.ok(refusal instanceof Error, "close() returned with the server still running");
      assert.equal(
        refusal.message,
        `stubborn server (pid ${rpc.pid}) is still running ${exitWaitMs} ms after its stdin closed and ${KILL_GRACE_MS} ms after its tree was ended; its tree killer had not exited ${KILL_GRACE_MS} ms after it started, and was ended`,
      );
    } finally {
      for (const killer of killers) if (killer.exitCode === null && killer.signalCode === null) killer.kill("SIGKILL");
      rpc.endQuietly();
    }
    assert.equal(await rpc.waitForExit(2000), true, "the server is still running after it was ended");
  });

  it("RED then GREEN: close() lets go of a tree killer that has not exited even once it was ended, and returns at its bound", { timeout: caseTimeout(1, 1000) }, async () => {
    const exitWaitMs = 1000;
    const stuck = new StuckKiller();
    const rpc = new StdioRpc({
      args: ["-e", STUBBORN_SERVER],
      label: "stubborn server",
      exitWaitMs,
      killer: () => stuck as unknown as ChildProcess,
    });
    try {
      await rpc.request("ping", {});
      const started = Date.now();
      const refusal = await rpc.close().then(
        () => undefined,
        (err: unknown) => err,
      );
      const elapsed = Date.now() - started;
      assert.deepEqual(stuck.signals, ["SIGKILL"], "the tree killer was not ended at its bound");
      assert.equal(stuck.unrefed, true, "a tree killer that is still running holds the event loop");
      assert.ok(elapsed < exitWaitMs + 3 * KILL_GRACE_MS + 3000, `close() took ${elapsed} ms`);
      assert.ok(refusal instanceof Error, "close() returned with the server still running");
      assert.equal(
        refusal.message,
        `stubborn server (pid ${rpc.pid}) is still running ${exitWaitMs} ms after its stdin closed and ${KILL_GRACE_MS} ms after its tree was ended; its tree killer had not exited ${KILL_GRACE_MS} ms after it started, nor ${KILL_GRACE_MS} ms after it was ended, and was let go`,
      );
    } finally {
      rpc.endQuietly();
    }
    assert.equal(await rpc.waitForExit(2000), true, "the server is still running after it was ended");
  });

  it("RED then GREEN: a server that has exited is not signalled again", { timeout: caseTimeout(1) }, async () => {
    const sent: Array<[number, NodeJS.Signals]> = [];
    const rpc = new StdioRpc({
      // Records every signal sent by number; only a group signal is passed on.
      signal: (target, signal) => {
        sent.push([target, signal]);
        if (target < 0) process.kill(target, signal);
      },
    });
    const pid = rpc.pid;
    assert.ok(pid !== undefined, "the server never started");
    try {
      await rpc.handshake();
      await rpc.close();
      assert.equal(rpc.exited, true, "close() returned before the server exited");
    } finally {
      rpc.endQuietly();
    }
    assert.equal(rpc.endQuietly(), false, "a server whose exit was seen was signalled");
    assert.deepEqual(
      sent.filter(([target]) => target === pid),
      [],
      `a signal went to pid ${pid} after the server had exited`,
    );
    // On POSIX, close() sends what is left of the group SIGKILL, by its group ID, once.
    assert.deepEqual(sent, isWindows ? [] : [[-pid, "SIGKILL"]]);
  });
});
