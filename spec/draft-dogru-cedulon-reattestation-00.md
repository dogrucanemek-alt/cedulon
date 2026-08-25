---
title: "Cedulon Re-Attestation: Carrying Spend Evidence Across Algorithm Retirement"
abbrev: Cedulon Re-Attestation
docname: draft-dogru-cedulon-reattestation-00
date: 2026-08-26
category: info
submissiontype: independent
ipr: trust200902
area: sec
workgroup:
keyword:
  - Cedulon
  - re-attestation
  - crypto-agility
  - SCITT
stand_alone: true
smart_quotes: false
pi:
  - toc
  - sortrefs
  - symrefs
author:
  -
    ins: E. C. Dogru
    name: Emek Can Dogru
    org: VERAX TEKNOLOJI LIMITED SIRKETI
    country: Turkey
    email: e.dogru@cedulon.com
normative:
  RFC2119:
  RFC8174:
  RFC6234:
  RFC9052:
  RFC9864:
  RFC9942:
  RFC9943:
informative:
  CEDULON:
    title: "Cedulon: An Audit Layer for Agent-to-Agent Commerce (work in progress)"
    author:
      - ins: E. C. Dogru
        name: Emek Can Dogru
    date: 2026-08
    target: https://github.com/dogrucanemek-alt/cedulon
---

--- abstract

Audit evidence is only useful for as long as it can be verified.
Cedulon produces COSE spend receipts and epoch checkpoints whose
signature algorithms will eventually be deprecated or broken; the
recent transition from polymorphic EdDSA to fully-specified Ed25519
algorithm identifiers shows that even identifiers change within a
decade. This document proposes a re-attestation profile for Cedulon
evidence: a signed statement, produced while the original algorithm is
still trustworthy, that binds the original evidence bytes to a
successor algorithm and is registered in a SCITT transparency
service. Chains of such statements allow a verifier decades later
to trust evidence whose original cipher has been retired. Structures
are meant to outlive ciphers. This is an extension proposal to the
Cedulon core document; its normative language is provisional and the
companion implementation does not implement it yet.

--- middle

# Introduction

A Cedulon Spend Receipt is a COSE_Sign1 object {{RFC9052}} verified
against a signature algorithm. When
that algorithm is deprecated, verification of old evidence degrades
from a cryptographic check into an act of faith. Archives that must
answer questions many years later (regulators, insurers, courts, and
historians of automated commerce) need a defined ceremony for carrying
evidence forward, not an ad-hoc migration.

The proposal is deliberately narrow: re-attestation does not re-issue,
amend, or reinterpret evidence. It states, under a successor algorithm,
that specific original bytes existed and verified at a specific time,
and it anchors that statement in an append-only transparency log.

This document is an extension seed for the Cedulon core specification
{{CEDULON}}. It is not an IETF working-group item, its keyword usage is
provisional, and the reference implementation does not yet implement
it. It is published to define the shape of the mechanism early and to
invite review.

# Terminology

{::boilerplate bcp14-tagged}

Original Evidence:
: A COSE_Sign1 object produced under the Cedulon core profile (a Spend
  Receipt, an epoch checkpoint, a Trade Manifest, or a Decision Token).

Re-Attestation Statement:
: A COSE_Sign1 object, signed with a successor algorithm, whose claims
  bind the hash of the Original Evidence, the original algorithm, the
  verification result observed at re-attestation time, and a reference
  to a transparency-log entry.

Successor Algorithm:
: A fully-specified COSE algorithm {{RFC9864}} selected to outlive the
  algorithm of the Original Evidence.

Attestation Chain:
: The sequence formed when a Re-Attestation Statement itself becomes
  Original Evidence for a later re-attestation.

# Re-Attestation Statement

A Re-Attestation Statement is a COSE_Sign1 object over a deterministic
CBOR claim map. The provisional claim set is:

| Claim | Meaning |
|---|---|
| originalHash | SHA-256 {{RFC6234}} of the Original Evidence COSE bytes, lowercase hex |
| originalAlg | COSE algorithm identifier of the Original Evidence |
| originalKid | Key identifier the Original Evidence verified against |
| verifiedAtMs | POSIX milliseconds at which the re-attester verified the original signature |
| successorAlg | COSE algorithm identifier of this statement's signature |
| anchorRef | Reference to the SCITT registration of the Original Evidence or of a prior chain link, or null |
| prevAttestationHash | SHA-256 of the previous Re-Attestation Statement in the chain, or null |

Label values are to be assigned from the CWT private-use range in a
later revision, alongside the Cedulon core label blocks.

# Processing Rules (provisional)

1. A re-attester MUST verify the Original Evidence signature under its
   original algorithm before issuing a Re-Attestation Statement, and
   MUST record the verification time in `verifiedAtMs`.
2. A Re-Attestation Statement SHOULD be produced while the original
   algorithm is still considered trustworthy by current guidance.
   Re-attesting an already-broken algorithm proves nothing unless the
   Original Evidence was registered in a transparency log before the
   break; in that case the log inclusion proof, not the signature, is
   the basis of trust and the statement MUST reference it in
   `anchorRef`.
3. Each Re-Attestation Statement SHOULD be registered in a SCITT
   Transparency Service {{RFC9943}}, obtaining a COSE receipt
   {{RFC9942}}; the resulting Transparent Statement is the archival
   unit.
4. A verifier evaluating old evidence walks the Attestation Chain from
   the newest statement backwards. The chain is acceptable when every
   link's signature verifies under an algorithm trusted at evaluation
   time and every `originalHash`/`prevAttestationHash` matches the
   presented bytes.

# Security Considerations

Re-attestation moves trust from an aging cipher to the combination of
a newer cipher and an append-only log. The critical window is the
period before the original algorithm's break: evidence that reaches a
transparency log inside that window survives; evidence that does not
cannot be resurrected afterwards, and no statement defined here claims
otherwise. A malicious re-attester can refuse to re-attest (denial of
archival service) but cannot forge history that a log inclusion proof
contradicts. Timestamp claims are assertions by the re-attester;
deployments needing stronger time should anchor promptly so the log's
observed registration time bounds `verifiedAtMs`.

# IANA Considerations

This document has no IANA actions.

--- back

# Acknowledgments
{:numbered="false"}

This seed accompanies the Cedulon core document and its companion
implementation at <https://github.com/dogrucanemek-alt/cedulon>.
