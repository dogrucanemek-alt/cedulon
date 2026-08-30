import { audit } from "../packages/audit/src/index.ts";
import { generateReceiptKeys } from "../packages/receipts/src/index.ts";
const k = generateReceiptKeys();
for (const trust of [undefined, { publicKeyPem: k.publicKeyPem }]) {
  try {
    const r = audit({
      receipts: [], checkpoints: [],
      witnessTrust: trust as never,
      inclusionReceipts: [{ statementHash: "aa", index: 0, treeHead: "bb", issuerPublicKeyPem: k.publicKeyPem, coseHex: "00".repeat(70000) } as never],
    });
    console.log("trust:", !!trust, "-> rapor dondu, findings:", r.findings.length, "warnings:", (r.warnings||[]).length);
  } catch (e) { console.log("trust:", !!trust, "-> THROW:", (e as Error).message); }
}
