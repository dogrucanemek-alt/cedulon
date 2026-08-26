# Cedulon Threat Model

Requirement texts are defined in the Internet-Draft Security
Considerations. This file is the threat narrative and the
traceability map.

This document is an **informative** companion to
`spec/draft-dogru-cedulon-01.md`. The Internet-Draft Security
Considerations section is authoritative for protocol requirements.
This file MUST NOT be read as overriding the draft.

Requirements use RFC 2119 key words ([RFC2119], [RFC8174]). Every MUST
traces to a numbered threat in Section 2.

Cedulon is an audit layer above payment rails (x402, AP2, and similar). It does
not take custody and does not operate escrow. An optional third-party escrow
role may appear in the protocol as an interface only.

## 1. Assets, actors, and assumptions

### 1.1 Assets

- Principal funds reachable through a mock or real payment rail.
- Trade Manifest: pre-trade signed offer (goods, price, acceptance hash, expiry).
- Spend Receipt: post-trade signed record of a payment attempt or settlement.
- Policy documents and their hashes.
- Dispute Evidence Bundle: manifest + receipt + delivery hash.
- Signing keys for payer agent, payee, receipt issuer, and policy engine.
- Transparency log entries (SCITT-anchorable statements).

### 1.2 Actors

| Actor | Role |
|---|---|
| Principal | Human or organization that funds the agent and sets policy |
| Payer agent | Software that requests spend |
| Payee / counterparty agent | Software that offers goods or a resource |
| Policy Decision Point (PDP) | Evaluates spend requests; default deny |
| Receipt Issuer | Signs Spend Receipts after a gated payment |
| Anchor / Transparency Service | Optional SCITT service; not operated here |
| Adversary | Prompt injector, runaway loop, rail bypass, forger, or curious log reader |
| Optional escrow | Third-party interface only; out of implementation scope |

### 1.3 Assumptions

- Rails (x402 facilitators, card networks) may succeed even if Cedulon is skipped.
  Therefore Cedulon MUST be on the only path the agent is allowed to use (T5).
- Cryptographic primitives come from the host (`node:crypto` in the skeleton).
- This repository uses mock keys and a mock rail. Production key storage is
  out of scope but constrained by T7.
- Delivery verification is a hash compare against the manifest acceptance
  criteria. Cedulon does not judge quality beyond that hash.

## 2. Threats, mitigations, and requirements

### T1 — Prompt injection leads to unauthorized spend

An attacker plants instructions in tool output, a web page, or a retrieved
document. The agent then calls a spend tool outside the principal's intent.

**Mitigation.** Policy is not derived from model text. The PDP evaluates
structured fields only (amount, currency, payee, tool name, manifest hash).
A spend tool call that lacks a valid, unexpired, signature-verified manifest
MAY proceed only as `no-manifest` and MUST still pass limit, velocity, and
scope checks. Injected natural language MUST NOT enlarge those checks.

| ID | Requirement |
|---|---|
| MUST-T1-1 | The PDP MUST decide from structured request fields and stored policy, not from model-generated prose. |
| MUST-T1-2 | A spend that is not bound to a verified Trade Manifest MUST be marked `no-manifest` on the Spend Receipt and MUST still be subject to limit, velocity, and scope policy. |
| SHOULD-T1-3 | Hosts SHOULD require a human confirmation channel for first-use payees. |
| MAY-T1-4 | An implementation MAY refuse all `no-manifest` spend. |

### T2 — Runaway agent (loop spend)

A stuck tool loop or recursive planner issues many payments.

**Mitigation.** Velocity and cumulative-limit counters live in the PDP.
Fail-closed: if the engine is missing or throws, the result is deny.

| ID | Requirement |
|---|---|
| MUST-T2-1 | Policy MUST express a maximum payment count per configured time window (velocity). |
| MUST-T2-2 | Policy MUST express a maximum amount per payment and a maximum cumulative amount per window. |
| MUST-T2-3 | If the PDP is unreachable, uninitialized, or throws during evaluation, the spend MUST be denied (fail-closed, default deny). |
| MUST-T2-4 | A denied attempt MUST NOT increment the allowed-spend counters as if it had succeeded. |
| SHOULD-T2-5 | Implementations SHOULD emit a stable reason code for velocity and limit denials. |

### T3 — Replay of payment authority

An observer replays a signed payment payload, mandate, or Cedulon decision token.

**Mitigation.** Every gated spend carries a unique nonce. The nonce store
rejects a second use. Manifests expire. Decision tokens are single-use and
bound to request bytes.

| ID | Requirement |
|---|---|
| MUST-T3-1 | Every spend attempt that the PDP allows MUST include a nonce that the implementation has not accepted before. |
| MUST-T3-2 | A second attempt that reuses a nonce MUST be denied. |
| MUST-T3-3 | A Trade Manifest MUST carry an expiry; a spend against an expired manifest MUST be denied. |
| MUST-T3-4 | A PDP allow decision MUST be bound to a hash of the request fields it evaluated and MUST be single-use. |
| SHOULD-T3-5 | Nonce stores SHOULD persist across process restart when the deployment is not a test fixture. |

### T4 — Receipt forgery or repudiation

A party alters a receipt, invents a receipt, or denies a real spend.

**Mitigation.** Receipts are signed. Verification covers canonical bytes.
A hash chain links receipts. Tamper of one byte fails verify.

| ID | Requirement |
|---|---|
| MUST-T4-1 | A Spend Receipt MUST be signed by the Receipt Issuer over a canonical encoding of its claims. |
| MUST-T4-2 | Verifiers MUST reject a receipt whose signature does not validate or whose canonical bytes do not match the signed payload. |
| MUST-T4-3 | A Spend Receipt MUST include `payer`, `payee`, `amount`, `currency`, `policyHash`, `timestampMs`, and `nonce`. |
| MUST-T4-4 | A Spend Receipt MUST include `manifestHash` or an explicit `noManifest` flag, never an ambiguous empty hash. Empty optional values are CBOR null; labels are never absent. |
| SHOULD-T4-5 | Receipts SHOULD form a hash chain (`prevReceiptHash`) so omission is detectable within one issuer stream. |
| MAY-T4-6 | Parties MAY register the signed receipt as a SCITT statement to obtain a COSE receipt. |
| MUST-T4-7 | A Spend Receipt MUST include `outcome` (`settled` or `aborted`). A settled receipt MUST have a non-null rail ref. Aborted receipts MUST NOT enter checkpoint totals. |
| MUST-T4-8 | COSE_Sign1 protected headers MUST use alg -19 (Ed25519), a mandatory `kid`, and a payload-specific content type. Verifiers MUST reject a `kid` that does not match the configured issuer key. |

### T5 — Policy bypass via direct rail access

The agent or an attacker calls the rail (x402 facilitator, wallet, card API)
without the PDP.

**Mitigation.** In this skeleton the only payment function is the adapter
that calls the PDP first. Deployments must make ungated rail credentials
unavailable to the model.

| ID | Requirement |
|---|---|
| MUST-T5-1 | The agent-facing spend interface MUST invoke the PDP and MUST NOT expose a parallel ungated rail call to the model. |
| MUST-T5-2 | Rail credentials, wallet handles, and facilitator tokens MUST NOT be placed in tool results or prompts. |
| SHOULD-T5-3 | Hosts SHOULD run the PDP and signing keys in a process the model runtime cannot write. |
| MAY-T5-4 | A deployment MAY use OS or hardware isolation between the model and the PDP. |

### T6 — TOCTOU between policy check and payment

An allow is computed; the request is then swapped (payee, amount) before the
rail sees it; or a second payment uses the same allow.

**Mitigation.** The adapter pays only the exact fields hashed into the
single-use decision. Settlement amount and payee MUST match the decision.

| ID | Requirement |
|---|---|
| MUST-T6-1 | Payment settlement MUST use the same six `requestHash` fields the PDP evaluated: amount, currency, payee, tool, nonce, and `manifestHash`. |
| MUST-T6-2 | An allow decision MUST be consumed on the first settlement attempt, success or fail-closed abort, and MUST NOT authorize a later different request. |
| SHOULD-T6-3 | Implementations SHOULD treat a decision older than a short TTL as expired. |
| MUST-T6-4 | An allow Decision Token MUST be COSE_Sign1 with CWT private-use labels -70301..-70305 (`requestHash`, `policyHash`, `expiryMs`, `nonce`, `singleUseId`) and content type `application/cedulon-decision+cbor`. |
| MUST-T6-5 | A party that accepts a Decision Token MUST reject a failed signature, a `kid` or content-type mismatch, a claim-map mismatch, or an expired `expiryMs`. |

### T7 — Signing-key leakage

Keys leak from disk, logs, or a prompt. Forged manifests or receipts follow.

**Mitigation.** This tree ships mock keys only. Requirements still constrain
any later real key.

| ID | Requirement |
|---|---|
| MUST-T7-1 | Secret key material MUST NOT appear in receipts, manifests, logs, or example output. |
| MUST-T7-2 | Example and test keys MUST be generated at runtime or stored as clearly fake fixtures, never as production secrets. |
| SHOULD-T7-3 | Production deployments SHOULD use an HSM or OS key store and SHOULD rotate keys. |
| MAY-T7-4 | Implementations MAY encrypt keys at rest. |

### T8 — Counterparty price gouging or defective delivery

The payee ships a different artifact, or the price exceeds the signed offer.

**Mitigation.** Trade Manifest binds price and an acceptance-criteria hash
before payment. After delivery, a Dispute Evidence Bundle packages
manifest, receipt, and delivery hash. The payee MAY countersign the
issuer receipt bytes so they cannot later deny those bytes. Cedulon
does not adjudicate.

| ID | Requirement |
|---|---|
| MUST-T8-1 | A Trade Manifest MUST bind goods or service description, price, currency, acceptance-criteria hash, cancel condition, and expiry. |
| MUST-T8-2 | A spend bound to a manifest MUST be denied if the requested amount or currency differs from the manifest. |
| MUST-T8-3 | If delivery bytes do not hash to the acceptance-criteria hash, the implementation MUST be able to produce a Dispute Evidence Bundle containing the manifest, the spend receipt, and the delivery hash. |
| MUST-T8-4 | The Dispute Evidence Bundle MUST NOT be described as an arbitral award or escrow release. |
| MUST-T8-7 | `manifestHash` MUST be the SHA-256 of the signed Trade Manifest COSE bytes and MUST NOT include the issuer public key encoding. |
| SHOULD-T8-5 | Manifests SHOULD reference an AP2 mandate hash when one exists. |
| MAY-T8-6 | Parties MAY add an optional escrow actor as a third-party role interface; this project MUST NOT implement custody. |
| MUST-T8-custody | Implementations of this specification MUST NOT take custody of funds or operate escrow. |
| MUST-T8-8 | If a payee countersignature is present, a verifier MUST reject it when the signature fails, when `kid` or content type does not match the configured payee key, or when the payload is not the issuer COSE_Sign1 bytes. |
| MAY-T8-9 | A payee MAY attach a detached COSE_Sign1 countersignature over the issuer receipt bytes. Absence MUST NOT invalidate the issuer receipt. |

### T9 — PII leakage into the transparency log

A SCITT statement or public receipt carries names, addresses, or full
amounts that should stay private.

**Mitigation.** Log-facing encodings offer redaction. Anchors store hashes
when the operator chooses privacy mode.

| ID | Requirement |
|---|---|
| MUST-T9-1 | A transparency encoding MUST support omitting or hashing payer/payee identifiers and MUST support amount redaction or range/bucket encoding. |
| MUST-T9-2 | Implementations MUST NOT write raw government-ID, payment-instrument PAN, or street address fields into a public transparency statement. |
| SHOULD-T9-3 | Default public anchors SHOULD publish `policyHash`, `manifestHash`, `receiptHash`, and timestamp rather than full claim sets. |
| MAY-T9-4 | A private auditor MAY receive an unredacted receipt out of band. |

### T10 — Secret spend via rail bypass

T5 requires the model not to see an ungated rail. An operator, leaked
credential, or a second binary can still settle on the rail and omit the
Receipt Issuer. Validity checks on the receipts that *do* exist stay green.

**Mitigation.** Completeness, not validity: reconcile the rail extract to
Spend Receipt payment refs. A settlement without a receipt is a finding
identified by the settlement ref. The audit fails closed.

| ID | Requirement |
|---|---|
| MUST-T10-1 | A verifier MUST match each extract settlement to a settled receipt on `ref` AND `amount` AND `currency`. |
| MUST-T10-2 | A settlement with no matching receipt MUST be reported as a completeness failure identified by that settlement `ref`. |
| MUST-T10-3 | A settled Spend Receipt whose `x402PaymentRef` is not on the extract MUST be reported as a completeness failure. |
| MUST-T10-4 | An audit that has any fail-severity completeness finding MUST fail (non-zero status in the companion tool). |
| SHOULD-T10-5 | Hosts SHOULD still apply T5 (no ungated rail in the model process). Completeness does not replace prevention. |
| MUST-T10-6 | A `ref` that appears more than once among settled receipts or among extract rows MUST be reported as `duplicate-ref`. |
| MUST-T10-7 | A verifier MUST obtain the extract from the rail or from a rail signature. With no pinned rail key, an unverifiable extract MUST be reported as `unauthenticated-extract` and makes the completeness guarantee conditional. With a pinned key, see MUST-T10-8: the extract MUST fail closed rather than warn. |
| MUST-T10-8 | A verifier MUST obtain the rail public key out of band and MUST verify the extract signature against that key, not against a key the extract carries. Without such a key the guarantee is conditional. |
| MUST-T10-9 | Keys MUST be compared by SubjectPublicKeyInfo DER encoding rather than by any text encoding. A pinned key that cannot be decoded MUST be reported as `trust-key-unreadable`, not as a key mismatch. |
| MUST-T10-10 | Every settlement record whose `timestampMs` falls outside the extract's declared window MUST be reported as `extract-scope-mismatch`, identified by that record's `ref`. This check MUST run whether or not a key is pinned. |
| MUST-T10-11 | When the verifier states an expected account, rail, or window, an extract that does not cover it MUST fail closed as `extract-scope-mismatch`. |
| MUST-T10-12 | When an extract is supplied, the records it carries are the subject of reconciliation. A settlement list from another source MUST NOT be substituted; a disagreeing list MUST be reported as `extract-settlement-mismatch`. |
| MUST-T10-13 | A `ref` reported as `duplicate-ref` MUST still be reconciled by aggregate amount per currency, and a shortfall MUST state the unaccounted amount. An unparseable amount MUST be reported as `malformed-amount` without aborting the audit. |
| MUST-T10-14 | An implementation MUST surface the guarantee and any warnings in any human-readable audit report it produces, not only in a returned structure. |
| MUST-T10-15 | A verifier that has not stated the period under audit MUST emit `unstated-audit-window` and MUST treat the guarantee as conditional, because an unstated period leaves the extract free to define its own. |
| MUST-T10-16 | When an extract is supplied, only receipts whose `timestampMs` falls in its declared window are reconciled against it. A receipt outside that window MUST NOT be reported as a completeness failure against that extract. |

### T11 — Checkpoint suppression or rollback

An issuer publishes a later checkpoint that omits receipts, or issues two
different checkpoints for one epoch (equivocation), or breaks the
checkpoint hash chain so a window disappears.

**Mitigation.** Checkpoints are COSE-signed and chained. Totals must match
receipts in the window. Two valid hashes for one epoch are equivocation.
Optional registration in a transparency log makes suppression visible.

| ID | Requirement |
|---|---|
| MUST-T11-1 | An epoch checkpoint MUST be COSE-signed and MUST bind epoch number, time window, receipt count, chain-head hash, per-currency totals, and the previous checkpoint hash. |
| MUST-T11-2 | Verifiers MUST reject a checkpoint whose signature fails, whose totals do not match settled receipts in the declared window, whose `receiptCount` is wrong, or whose `chainHeadHash` is not the last in-window receipt hash. |
| MUST-T11-3 | Two verified checkpoints for the same epoch with different hashes MUST be reported as equivocation. |
| MUST-T11-4 | A broken checkpoint hash chain MUST fail verification. |
| SHOULD-T11-5 | Checkpoints SHOULD be registered with a Transparency Service when one is configured. |
| MAY-T11-6 | A test deployment MAY use an in-process append-only log as the witness. |
| MUST-T11-7 | Checkpoint windows MUST be half-open `[startMs, endMs)`. Every chained receipt MUST fall in exactly one window. |
| MUST-T11-8 | Presented checkpoint epochs MUST be consecutive and adjacent windows MUST meet at `endMs = next.startMs`. |
| MUST-T11-9 | Prefix-deletion and suppression claims that go beyond the presented chain are conditional on an external transparency witness. |

## 3. Traceability table

| Threat | Mitigation (short) | MUST IDs |
|---|---|---|
| T1 Prompt injection | Structured PDP; `no-manifest` still gated | MUST-T1-1, MUST-T1-2 |
| T2 Runaway spend | Limits, velocity, fail-closed | MUST-T2-1, MUST-T2-2, MUST-T2-3, MUST-T2-4 |
| T3 Replay | Nonce, expiry, single-use decision | MUST-T3-1, MUST-T3-2, MUST-T3-3, MUST-T3-4 |
| T4 Forgery / denial | Signed canonical receipt, kid, outcome | MUST-T4-1, MUST-T4-2, MUST-T4-3, MUST-T4-4, MUST-T4-7, MUST-T4-8 |
| T5 Rail bypass | Single gated interface; no secrets in tools | MUST-T5-1, MUST-T5-2 |
| T6 TOCTOU | Decision Token COSE binds six request fields | MUST-T6-1, MUST-T6-2, MUST-T6-4, MUST-T6-5 |
| T7 Key leak | No secrets in artifacts; mock keys only | MUST-T7-1, MUST-T7-2 |
| T8 Bad counterparty | Manifest bind + COSE hash + evidence bundle + optional countersign, no escrow | MUST-T8-1, MUST-T8-2, MUST-T8-3, MUST-T8-4, MUST-T8-7, MUST-T8-8, MAY-T8-6 (MUST NOT custody), MAY-T8-9 |
| T9 Log PII | Redaction / hash-only public form | MUST-T9-1, MUST-T9-2 |
| T10 Rail bypass / secret spend | Pinned-key extract as the subject; 1:1 ref+amount+currency; scope agreement | MUST-T10-1, MUST-T10-2, MUST-T10-3, MUST-T10-4, MUST-T10-6, MUST-T10-7, MUST-T10-8, MUST-T10-9, MUST-T10-10, MUST-T10-11, MUST-T10-12, MUST-T10-13, MUST-T10-14, MUST-T10-15, MUST-T10-16 |
| T11 Checkpoint suppress / rollback | Signed chained checkpoints; window; witness-conditional prefix | MUST-T11-1, MUST-T11-2, MUST-T11-3, MUST-T11-4, MUST-T11-7, MUST-T11-8, MUST-T11-9 |

Untraced MUST check: every MUST in Section 2 appears in this table.

MAY-T8-6 contains a MUST NOT (no custody). It traces to T8 and to the
closed product decision that Cedulon does not operate escrow.

## 4. Out of scope

- Operating a real facilitator, wallet, or card network.
- Operating a SCITT Transparency Service.
- Legal adjudication of disputes.
- Formal proof of the PDP.
- Production key ceremony.

## 5. References

- [RFC2119] Bradner, S., "Key words for use in RFCs to Indicate Requirement Levels", BCP 14, RFC 2119, March 1997.
- [RFC8174] Leiba, B., "Ambiguity of Uppercase vs Lowercase in RFC 2119 Key Words", BCP 14, RFC 8174, May 2017.
- [RFC9943] Birkholz, H., et al., "An Architecture for Trustworthy and Transparent Digital Supply Chains", RFC 9943, June 2026, https://datatracker.ietf.org/doc/html/rfc9943
