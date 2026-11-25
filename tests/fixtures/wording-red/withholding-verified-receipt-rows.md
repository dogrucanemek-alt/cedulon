A verifier that pins a witness key and holds a usable issuer root
(`MUST-T11-16`) can detect a withheld or rolled-back checkpoint from a
body that answers to that root.

4. Equivocation.
    The checkpoints compared here are those of the working set of {{CEDULON-CORE}} **together with**
    those carried by a witness receipt whose body answers to a usable issuer root (`MUST-T11-16`).

6. Compare the surviving witness records against the presented
    chain (`MUST-T11-11`). For each surviving record whose
    statement body answers to a usable issuer root (`MUST-T11-16`) and is absent from the presented chain, report that a
    recorded checkpoint was withheld.

| Id | Requirement |
| --- | --- |
| MUST-T11-3 | Two verified checkpoints for the same epoch with different hashes MUST be reported as equivocation. The checkpoints compared are those of the working set of {{CEDULON-CORE}} together with bodies that answer to a usable issuer root (`MUST-T11-16`). |
| MUST-T11-11 | A verified receipt binding a checkpoint absent from the presented chain MUST be reported as a withheld checkpoint, and MUST NOT be reported as a window coverage failure. |
| checkpoint-withheld | audit fails | A verified witness receipt binds a checkpoint the presented chain does not contain |
| MUST-T11-16 | Without a usable issuer pin, a witness body MUST NOT produce a withholding or equivocation verdict. |
