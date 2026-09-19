# Logistics operations — review resolutions

This records author responses; it is not an independent approval.

## Context review 05b21f87 (934332c1a)

| Finding | Author decision | Changed rule |
|---|---|---|
| C1 / R1 custody recovery | Accepted; whole-job own-fleet handover is necessary for a usable breakdown path | RecoveryHandover, interrupted source outcome, separate physical releases, atomic receiving-trip start and unchanged job in_transit state |
| C2 / R2 master races | Accepted observed-snapshot consistency; no unsupported global serialization claim | SourceObservation, explicit residual master-edit/start race, authoritative revalidation and disruption after departure |
| C3 released-job deadlock | Accepted | Completion uses active obligations plus no-custody check; release closes membership and skips unperformed stops; historical ready jobs cannot block finish |
| C4 correction semantics | Accepted | Typed replacement/void, unique effective successor, serialized stream revisions, downstream consequence validation, reject contradictions with later history |
| C5 promises/retries | Accepted | PromiseRevision preserves original accepted windows; PlanRevision and linked retry stops preserve each attempt |
| W1 mileage identity | Accepted | Single immutable ledger timezone, distinct distance reconciliation/classification, explicit comparison predicate, evidenced boundaries, meter reset periods remain incomplete |
| W2 precision | Accepted | Nonzero reservation duration, palletized flag, paired location observations, missing-reading state, stop references, provenance for external non-trip cargo |
| W3 feature contract | Accepted | Command-to-feature matrix, protected fields, recorder/source separation and existing master read grants verified against acl.ts |

Additional review-driven clarification: recovery targets remain draft candidates until the atomic handover; same-driver transfer caps the source reservation before reacquiring it. A CommandReceipt records committed action results for safe retry, without treating post-commit event delivery as part of the business transaction.

Substantial domain changes require a fresh context re-review before the gate is marked passed.
