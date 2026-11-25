2. Window coverage.
    `window-coverage` SHOULD be used for this condition. The check
    runs against the presented checkpoint windows and it is
    fail-closed: a receipt that falls under none of them is this
    failure.

## Requirements

| Id | Requirement |
| --- | --- |
| MUST-T11-8 | Presented checkpoint epochs MUST be consecutive and adjacent windows MUST meet at `endMs = next.startMs`. |

## Genesis and continuity {#genesis}

Without an anchor, the first checkpoint in a presented chain is the
genesis checkpoint of that chain.
