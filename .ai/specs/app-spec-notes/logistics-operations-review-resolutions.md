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

## Context re-review fae43cec and workflow review a284bb51

- R2-C1 accepted: interruption now shares the no-active-unperformed-obligations/no-custody terminal predicate; unpicked jobs require explicit release/cancellation before or atomically with interruption. Added A-onboard/B-unpicked acceptance trace.
- Historical-stop warning accepted: new promises validate pending effective attempts only; handover-in/out explicitly change custody and create mileage boundaries.
- F1 accepted: a valid delivered/returned fact ends custody even without an odometer; only mileage stays incomplete.
- F2 accepted: named WF1a/WF1b and WF4a/WF4b independent trigger/end contracts inside the five release groups; job acceptance does not depend on fleet availability, correction does not invent recovery.
- F3 accepted: removed unmeasurable numerical intake/follow-up target; ordinary validation completeness is an operational input, not a claim of saved staff effort. Primary fixed-cohort empty-distance outcome remains measurable.
- F4 accepted: overdue card limited to effective pickup/delivery obligations, single current attempt, superseded history excluded; separate plan lateness for return/handover/end.
- F5 accepted: explicit populated-dashboard Create job and ready-job Plan trip actions, retained queue filters and execution-only first-reading repair on trip detail. Correction remains manager-only.

These are author resolutions of specific counterexamples; independent final review still verifies them before all gates are marked passed.

## Architect checkpoint 1 (09dd0bd3 / 04100da36)

- A1 accepted: named authorized general master/rule APIs, complete pagination and absence handling; custom-subject rules take precedence over linked rule-set rules (never union); editor-only unsaved state is not a server contract. Explicit supported UTC recurrence grammar, full-day one-off restriction, malformed-blocker fail-closed policy and DST examples precede the existing merger.
- A2 accepted: 25 work packages now expand into 33 provisional atomic commits, with C08/C09/C11/C14 split in two and C16/C18 in three; source adapter precedes dependent profile/confirmation integration. Workflow totals deduplicate shared C09/C17.
- Parent independently reran four assertions against the actual planner merger: unavailability splitting, full-UTC-day expansion, malformed blocker omission and ignored BYDAY. All passed and substantiate the need for boundary validation, not an operational application test pass.
- No unavoidable core/platform dependency found; preserve one app module and existing command/UI/event seams. Outer-transaction side effects are explicitly post-commit; no new queue framework for board refresh.
