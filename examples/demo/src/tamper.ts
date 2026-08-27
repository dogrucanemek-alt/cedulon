import { generateManifestKeys, signManifest, verifyManifest } from "@cedulon/manifest";
import { generateReceiptKeys, signReceipt, verifyReceipt } from "@cedulon/receipts";

const nowMs = 1_700_000_000_000;
const mk = generateManifestKeys();
const manifest = signManifest(
  {
    description: "x",
    amount: "1",
    currency: "USD",
    acceptanceCriteriaHash: "aa",
    cancelCondition: "none",
    expiresAtMs: nowMs + 1,
  },
  mk.privateKeyPem,
  mk.publicKeyPem,
);
const tamperedManifest = {
  ...manifest,
  body: { ...manifest.body, amount: "999" },
};

const rk = generateReceiptKeys();
const receipt = signReceipt(
  {
    payer: "p",
    payee: "q",
    amount: "1",
    currency: "USD",
    policyHash: "ph",
    manifestHash: null,
    noManifest: true,
    x402PaymentRef: "r",
    timestampMs: nowMs,
    nonce: "n1".padEnd(16, "-"),
    prevReceiptHash: null,
    outcome: "settled",
  },
  rk.privateKeyPem,
  rk.publicKeyPem,
);
const tamperedReceipt = {
  ...receipt,
  claims: { ...receipt.claims, amount: "999" },
};

const manifestOk = verifyManifest(tamperedManifest);
const receiptOk = verifyReceipt(tamperedReceipt);
if (manifestOk || receiptOk) {
  console.error("tamper not detected");
  process.exit(0);
}
console.error("tamper detected");
process.exit(1);
