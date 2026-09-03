// Prints the UPGRADING section for one version, whole: every paragraph under
// the heading that starts with `## <version>` (published `## 0.12.0: title` or
// prepared `## 0.12.0 (prepared, not published)`) up to the next `## `. The
// release workflow feeds this to the GitHub release; tests/release-notes.test.ts
// holds the fixtures. A heading that is not there is an error, not empty notes.
import { readFileSync } from "node:fs";

export function releaseNotesSection(markdown: string, version: string): string {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const escaped = version.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const heading = new RegExp(`^## ${escaped}(?![0-9.])`);
  const start = lines.findIndex((l) => heading.test(l));
  if (start < 0) {
    throw new Error(`no section for ${version}`);
  }
  const body: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (/^## /.test(line)) {
      break;
    }
    body.push(line);
  }
  return body.join("\n").trim();
}

if (process.argv[1] && /release-notes\.ts$/.test(process.argv[1])) {
  const [version, file = "docs/UPGRADING.md"] = process.argv.slice(2);
  if (!version) {
    console.error("usage: release-notes.ts <version> [docs/UPGRADING.md]");
    process.exit(2);
  }
  process.stdout.write(`${releaseNotesSection(readFileSync(file, "utf8"), version)}\n`);
}
