import { createPublicKey } from "node:crypto";

import { checkpointFromCbor } from "@cedulon/checkpoint";
import { canonical, decisionRecordFromCbor } from "@cedulon/core";
import { coseDecodeRefusalHex, decodeCoseSign1, hexToBytes } from "@cedulon/cose";
import { manifestFromCbor } from "@cedulon/manifest";
import { claimsFromCbor } from "@cedulon/receipts";

export type PresentedFormProblem = { object: string; member: string | null; problem: string };

const PADDED_B64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const LOWER_HEX = /^(?:[0-9a-f]{2})+$/;

type ObjectKind = "spend" | "decision" | "checkpoint" | "manifest" | "extract";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Only what JSON can carry. canonical() writes a BigInt as the string of its
 * digits, so a claim set holding 1n would compare equal to one holding "1".
 */
function isJsonValue(value: unknown, depth = 0): boolean {
  if (depth > 32) return false;
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every((v) => isJsonValue(v, depth + 1));
  if (isPlainObject(value)) return Object.values(value).every((v) => isJsonValue(v, depth + 1));
  return false;
}

function isSpkiPem(value: unknown): boolean {
  if (typeof value !== "string" || !value.startsWith("-----BEGIN PUBLIC KEY-----")) {
    return false;
  }
  try {
    createPublicKey(value);
    return true;
  } catch {
    return false;
  }
}

function isPaddedBase64(value: unknown): boolean {
  return typeof value === "string" && value.length > 0 && PADDED_B64.test(value);
}

function tableFor(kind: ObjectKind, encoding: unknown): { required: string[]; allowed: Set<string> } {
  if (kind === "spend") {
    const required = ["claims", "signature", "publicKeyPem", "encoding"];
    const allowed = new Set([...required, "counterCoseHex", "payeePublicKeyPem"]);
    // Only the JSON encoding rules coseHex out; an encoding outside the two is
    // reported once, as bad-encoding, not again through its octets.
    if (encoding !== "json") allowed.add("coseHex");
    if (encoding === "cose") required.push("coseHex");
    return { required, allowed };
  }
  if (kind === "decision") {
    const required = ["claims", "publicKeyPem", "encoding", "coseHex"];
    return { required, allowed: new Set(required) };
  }
  if (kind === "checkpoint") {
    const required = ["claims", "publicKeyPem", "encoding", "coseHex"];
    return { required, allowed: new Set(required) };
  }
  if (kind === "manifest") {
    const required = ["body", "signature", "publicKeyPem", "encoding", "coseHex"];
    return { required, allowed: new Set(required) };
  }
  const required = ["body", "signature", "publicKeyPem"];
  return { required, allowed: new Set(required) };
}

function encodingOk(kind: ObjectKind, encoding: unknown): boolean {
  if (kind === "spend") return encoding === "cose" || encoding === "json";
  return encoding === "cose";
}

function claimsMember(kind: ObjectKind): "claims" | "body" {
  return kind === "manifest" || kind === "extract" ? "body" : "claims";
}

function decodeClaims(kind: ObjectKind, payload: Uint8Array): unknown {
  if (kind === "spend") return claimsFromCbor(payload);
  if (kind === "decision") return decisionRecordFromCbor(payload);
  if (kind === "checkpoint") return checkpointFromCbor(payload);
  return manifestFromCbor(payload);
}

function checkSignedObject(
  obj: Record<string, unknown>,
  objectName: string,
  kind: ObjectKind,
  problems: PresentedFormProblem[],
): void {
  const { required, allowed } = tableFor(kind, obj.encoding);
  for (const key of Object.keys(obj)) {
    if (!allowed.has(key)) {
      problems.push({ object: objectName, member: key, problem: "unlisted-member" });
    }
  }
  for (const key of required) {
    if (!(key in obj)) {
      problems.push({ object: objectName, member: key, problem: "missing-member" });
    }
  }

  const payloadName = claimsMember(kind);
  const payloadOk = isPlainObject(obj[payloadName]) && isJsonValue(obj[payloadName]);
  if (payloadName in obj && !payloadOk) {
    problems.push({ object: objectName, member: payloadName, problem: "wrong-type" });
  }
  if ("signature" in obj && allowed.has("signature") && !isPaddedBase64(obj.signature)) {
    problems.push({ object: objectName, member: "signature", problem: "not-padded-base64" });
  }
  if ("publicKeyPem" in obj && allowed.has("publicKeyPem") && !isSpkiPem(obj.publicKeyPem)) {
    problems.push({ object: objectName, member: "publicKeyPem", problem: "not-spki-pem" });
  }
  if ("payeePublicKeyPem" in obj && allowed.has("payeePublicKeyPem") && !isSpkiPem(obj.payeePublicKeyPem)) {
    problems.push({ object: objectName, member: "payeePublicKeyPem", problem: "not-spki-pem" });
  }
  if ("encoding" in obj && allowed.has("encoding") && !encodingOk(kind, obj.encoding)) {
    problems.push({ object: objectName, member: "encoding", problem: "bad-encoding" });
  }

  let coseReady = false;
  for (const hexName of ["coseHex", "counterCoseHex"] as const) {
    if (!(hexName in obj) || !allowed.has(hexName)) continue;
    const hex = obj[hexName];
    if (typeof hex !== "string" || !LOWER_HEX.test(hex)) {
      problems.push({ object: objectName, member: hexName, problem: "not-lowercase-hex" });
      continue;
    }
    const refusal = coseDecodeRefusalHex(hex);
    if (refusal !== null) {
      problems.push({ object: objectName, member: hexName, problem: refusal });
      continue;
    }
    if (hexName === "coseHex") coseReady = true;
  }

  if (coseReady && typeof obj.coseHex === "string") {
    try {
      const msg = decodeCoseSign1(hexToBytes(obj.coseHex));
      if (payloadOk) {
        let decoded: unknown;
        try {
          decoded = decodeClaims(kind, msg.payload);
        } catch {
          problems.push({ object: objectName, member: payloadName, problem: "claims-mismatch" });
          decoded = undefined;
        }
        if (decoded !== undefined && canonical(decoded) !== canonical(obj[payloadName])) {
          problems.push({ object: objectName, member: payloadName, problem: "claims-mismatch" });
        }
      }
      const carriesSignatureAndCose = kind === "spend" || kind === "manifest";
      if (carriesSignatureAndCose && isPaddedBase64(obj.signature)) {
        const expected = Buffer.from(msg.signature).toString("base64");
        if (obj.signature !== expected) {
          problems.push({ object: objectName, member: "signature", problem: "signature-mismatch" });
        }
      }
    } catch {
      problems.push({ object: objectName, member: payloadName, problem: "claims-mismatch" });
    }
  }
}

function checkArray(
  value: unknown,
  collection: "receipts" | "checkpoints",
  itemKind: ObjectKind,
  problems: PresentedFormProblem[],
): void {
  if (value === undefined) {
    problems.push({ object: "input", member: collection, problem: "missing-member" });
    return;
  }
  if (!Array.isArray(value)) {
    problems.push({ object: collection, member: null, problem: "wrong-type" });
    return;
  }
  for (let i = 0; i < value.length; i += 1) {
    const name = `${collection}[${i}]`;
    if (!isPlainObject(value[i])) {
      problems.push({ object: name, member: null, problem: "wrong-type" });
      continue;
    }
    checkSignedObject(value[i], name, itemKind, problems);
  }
}

function checkOptional(
  value: unknown,
  objectName: string,
  kind: ObjectKind,
  problems: PresentedFormProblem[],
): void {
  if (value === undefined) return;
  if (!isPlainObject(value)) {
    problems.push({ object: objectName, member: null, problem: "wrong-type" });
    return;
  }
  checkSignedObject(value, objectName, kind, problems);
}

/**
 * The presented form of core-05 {#presented-form}: members beside the signed
 * octets, and the decoder floor of MUST-T4-19. Form only; no key attribution.
 */
export function checkPresentedForm(input: unknown): PresentedFormProblem[] {
  const problems: PresentedFormProblem[] = [];
  try {
    if (!isPlainObject(input)) {
      return [{ object: "input", member: null, problem: "wrong-type" }];
    }
    const decision = isPlainObject(input.profile) && input.profile.id === "decision";
    checkArray(input.receipts, "receipts", decision ? "decision" : "spend", problems);
    checkArray(input.checkpoints, "checkpoints", "checkpoint", problems);
    checkOptional(input.anchorCheckpoint, "anchorCheckpoint", "checkpoint", problems);
    checkOptional(input.manifest, "manifest", "manifest", problems);
    checkOptional(input.extract, "extract", "extract", problems);
    checkOptional(input.previousExtract, "previousExtract", "extract", problems);
    checkOptional(input.nextExtract, "nextExtract", "extract", problems);
  } catch {
    problems.push({ object: "input", member: null, problem: "wrong-type" });
  }
  return problems;
}
