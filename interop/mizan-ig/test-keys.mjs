// Test keys. They protect nothing. Copied from the spend-golden PEM
// pattern so COSE hashes stay byte-stable across runs. A is the
// decider; B is the effect-extract signer. They are different keys.

export const DECIDER_KEYS = {
  publicKeyPem:
    "-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAOjn4be5GIhS3um354XdC99p+jnUagII+XeD+G7gmMu4=\n-----END PUBLIC KEY-----\n",
  privateKeyPem:
    "-----BEGIN PRIVATE KEY-----\nMC4CAQAwBQYDK2VwBCIEIEyphhXuw1hrR6dfJ6ojkQKWaqlXsXG7kNHdxV2cl1uF\n-----END PRIVATE KEY-----\n",
};

export const EFFECT_KEYS = {
  publicKeyPem:
    "-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAQ1uNbzy3tpq6rjm3tQexNl8dkv+DN41xcpEqPV7tdVA=\n-----END PUBLIC KEY-----\n",
  privateKeyPem:
    "-----BEGIN PRIVATE KEY-----\nMC4CAQAwBQYDK2VwBCIEILpPp6Twy4pCYZSEscqA2TO6FTC/mqVIVuyp/yP1VBe+\n-----END PRIVATE KEY-----\n",
};
