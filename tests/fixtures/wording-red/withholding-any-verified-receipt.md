A verifier that pins a witness key can detect a withheld or rolled-back checkpoint; without that pin the suppression guarantee is conditional.

4. Equivocation.
    The checkpoints compared here are those presented **together with**
    any carried by verified witness receipts (step 5). A presented chain
    that satisfies `MUST-T11-8` (step 2) cannot raise this finding on
    its own.

6. Compare the surviving witness records against the presented
    chain (`MUST-T11-11`). For each surviving record whose
    statement is absent from the presented chain, report that a
    recorded checkpoint was withheld; the identifier
    `checkpoint-withheld` SHOULD be used.

| Id | Requirement |
| --- | --- |
| MUST-T11-3 | Two verified checkpoints for the same epoch with different hashes MUST be reported as equivocation. The checkpoints compared are those of the working set of {{CEDULON-CORE}} together with those carried by verified witness receipts; a working set that satisfies MUST-T11-8 cannot raise it on its own, because its epochs are consecutive. |
| MUST-T11-11 | A receipt whose statement body verifies under a usable issuer root (`MUST-T11-16`) and that binds a checkpoint absent from the presented chain MUST be reported as a withheld checkpoint, and MUST NOT be reported as a window coverage failure. |
| checkpoint-withheld | audit fails | A witness receipt whose body verifies under a usable issuer root (`MUST-T11-16`) binds a checkpoint the presented chain does not contain |
| MUST-T11-16 | Without a usable issuer pin, a witness body MUST NOT produce a withholding or equivocation verdict. |
