import { execFileSync } from "node:child_process";

/** Not a secret. Scopes this app's blobs away from other CurrentUser data. */
export const DPAPI_ENTROPY = "cedulon-state-v1";

type ProtectFn = (pem: string) => string;
type UnprotectFn = (blob: string) => string;

let protectOverride: ProtectFn | null = null;
let spawnCount = 0;

export function setProtectForTests(fn: ProtectFn | null): void {
  protectOverride = fn;
}

export function dpapiSpawnCount(): number {
  return spawnCount;
}

export function resetDpapiSpawnCount(): void {
  spawnCount = 0;
}

const PROTECT_COMMAND = [
  "Add-Type -AssemblyName System.Security",
  `$e = [System.Text.Encoding]::UTF8.GetBytes('${DPAPI_ENTROPY}')`,
  "$b = [Convert]::FromBase64String(([Console]::In.ReadToEnd().Trim()))",
  "$p = [System.Security.Cryptography.ProtectedData]::Protect($b, $e, [System.Security.Cryptography.DataProtectionScope]::CurrentUser)",
  "[Convert]::ToBase64String($p)",
].join("; ");

const UNPROTECT_COMMAND = [
  "Add-Type -AssemblyName System.Security",
  `$e = [System.Text.Encoding]::UTF8.GetBytes('${DPAPI_ENTROPY}')`,
  "$b = [Convert]::FromBase64String(([Console]::In.ReadToEnd().Trim()))",
  "$p = [System.Security.Cryptography.ProtectedData]::Unprotect($b, $e, [System.Security.Cryptography.DataProtectionScope]::CurrentUser)",
  "[Convert]::ToBase64String($p)",
].join("; ");

function runPowerShell(command: string, stdinB64: string): string {
  spawnCount += 1;
  const out = execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", command], {
    input: stdinB64,
    encoding: "utf8",
    timeout: 15_000,
    windowsHide: true,
    stdio: ["pipe", "pipe", "pipe"],
  });
  const blob = out.trim();
  if (!/^[A-Za-z0-9+/]+=*$/.test(blob) || blob.length === 0) {
    throw new Error("cedulon-dpapi-output");
  }
  return blob;
}

export function protectPrivatePem(pem: string): string | null {
  if (protectOverride) {
    return protectOverride(pem);
  }
  if (process.platform !== "win32") {
    return null;
  }
  try {
    return runPowerShell(PROTECT_COMMAND, Buffer.from(pem, "utf8").toString("base64"));
  } catch {
    return null;
  }
}

export function unprotectPrivatePem(blob: string): string | null {
  if (process.platform !== "win32") {
    return null;
  }
  try {
    const pemB64 = runPowerShell(UNPROTECT_COMMAND, blob.trim());
    const pem = Buffer.from(pemB64, "base64").toString("utf8");
    if (!pem.includes("PRIVATE KEY")) {
      return null;
    }
    return pem;
  } catch {
    return null;
  }
}
