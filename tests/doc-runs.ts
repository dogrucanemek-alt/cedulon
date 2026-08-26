import { execFileSync } from "node:child_process";

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
 * Runs a documented command. Only `npm run <script>` and `npx tsc --noEmit`
 * are allowed. Does not run `test:all` (that would recurse).
 */
export function runDocumentedCommand(command: string, cwd: string): string {
  if (command === "npm run test:all") {
    throw new Error("refusing to run test:all from inside the suite");
  }
  if (command === "npx tsc --noEmit") {
    const stdout = execFileSync("npx", ["tsc", "--noEmit"], {
      cwd,
      encoding: "utf8",
      shell: process.platform === "win32",
    });
    return stdout
      .split(/\r?\n/)
      .filter((line) => !line.startsWith("npm notice"))
      .join("\n")
      .trim();
  }
  const script = command.replace(/^npm run /, "");
  if (!/^[a-z:]+$/.test(script)) {
    throw new Error(`refusing to run undocumented command ${JSON.stringify(command)}`);
  }
  let stdout: string;
  try {
    stdout = execFileSync("npm", ["run", script, "--silent"], {
      cwd,
      encoding: "utf8",
      shell: process.platform === "win32",
    });
  } catch (e) {
    stdout = (e as { stdout?: string }).stdout ?? "";
  }
  return stdout.trim().replace(/\r\n/g, "\n");
}
