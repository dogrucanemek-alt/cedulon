import { runBounded } from "../scripts/bounded-run.ts";
import { npmCli } from "./helpers/npm-cli.ts";

/**
 * Bound on one documented command. Measured on Windows at 2.4 s for
 * `npx tsc --noEmit` and under 0.5 s for each `npm run` script.
 */
export const DOCUMENTED_COMMAND_TIMEOUT_MS = 30_000;
const DOCUMENTED_OUTPUT_BYTES = 1024 * 1024;

/** A fenced ```bash block immediately followed by a fenced block with no language. */
export type DocumentedRun = {
  command: string;
  expected: string;
  optional: boolean;
};

export function documentedRuns(markdown: string): DocumentedRun[] {
  const fences = [...markdown.matchAll(/```(\w*)\r?\n([\s\S]*?)```/g)].map((m) => ({
    lang: m[1],
    body: m[2],
  }));
  const runs: DocumentedRun[] = [];
  for (let i = 0; i < fences.length - 1; i += 1) {
    const [block, next] = [fences[i], fences[i + 1]];
    if (block.lang !== "bash" || next.lang !== "") continue;
    const lines = block.body.trim().split(/\r?\n/);
    const optional = lines[0] === "# optional";
    const commandLines = optional ? lines.slice(1) : lines;
    // Only single-command blocks have one output block to compare against.
    if (commandLines.length !== 1) continue;
    runs.push({
      command: commandLines[0].trim(),
      expected: next.body.trim().replace(/\r\n/g, "\n"),
      optional,
    });
  }
  return runs;
}

/**
 * Runs a documented command, bounded by DOCUMENTED_COMMAND_TIMEOUT_MS. Only
 * `npm run <script>` and `npx tsc --noEmit` are allowed. Does not run
 * `test:all` (that would recurse). A script's non-zero exit is not an error
 * here: the bypass demos exit non-zero by design, and their stdout is what
 * the doc prints.
 */
export async function runDocumentedCommand(command: string, cwd: string): Promise<string> {
  if (command === "npm run test:all") {
    throw new Error("refusing to run test:all from inside the suite");
  }
  if (command === "npx tsc --noEmit") {
    const { stdout } = await runBounded({
      label: command,
      ...npmCli(command, "npx", ["tsc", "--noEmit"]),
      cwd,
      timeoutMs: DOCUMENTED_COMMAND_TIMEOUT_MS,
      maxOutputBytes: DOCUMENTED_OUTPUT_BYTES,
    });
    return stdout
      .toString("utf8")
      .split(/\r?\n/)
      .filter((line) => !line.startsWith("npm notice"))
      .join("\n")
      .trim();
  }
  const script = command.replace(/^npm run /, "");
  if (!/^[a-z:]+$/.test(script)) {
    throw new Error(`refusing to run undocumented command ${JSON.stringify(command)}`);
  }
  const { stdout } = await runBounded({
    label: command,
    ...npmCli(command, "npm", ["run", script, "--silent"]),
    cwd,
    timeoutMs: DOCUMENTED_COMMAND_TIMEOUT_MS,
    maxOutputBytes: DOCUMENTED_OUTPUT_BYTES,
    returnStatus: true,
  });
  return stdout.toString("utf8").trim().replace(/\r\n/g, "\n");
}
