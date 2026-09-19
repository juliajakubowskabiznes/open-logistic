# Logistics operations — proposed atomic commit ledger

Source: [operational App Spec](../2026-09-19-app-spec-logistics-operations.md). Estimate only; these are not completed implementation commits or independently releasable workflow phases. All 25 units form one usable release. Every unit includes its relevant unit/API/UI tests and translations, with integration fixtures self-contained.

| ID | One testable increment | Evidence required | Main workflow |
|---|---|---|---|
| C01 | Vehicle/driver profile entities, owned extensions and migration/snapshot | Only intended schema changes; unique scoped master references and version columns | WF1 |
| C02 | Profile CRUD commands/APIs, validation and ACL | Scope, source ownership, conflicts and capacity validation tests | WF1 |
| C03 | Fleet profile forms/list and master links | Create/edit/disable with read-only and missing-source states | WF1 |
| C04 | Transport job entities, CRUD/accept/cancel commands and APIs | Input, state and scope tests; original promises preserved | WF1 |
| C05 | Job entry/list/detail and ready queue | Job acceptance flow including invalid data, conflict and permissions | WF1 |
| C06 | Trip/stop/membership/plan-revision entities and draft APIs | Ordered stop model and versioned draft validation | WF2 |
| C07 | Trip planning UI and load preview | Multiple jobs; pickup-before-delivery and intermediate-capacity errors | WF2 |
| C08 | Atomic assignment/occupancy, command receipts and booking actions | Concurrent overlapping bookings; rollback; retry outcomes | WF2 |
| C09 | Source observation/eligibility adapter | Complete source/rule-set coverage, changed source membership, unsupported rules and absent-module tests | WF1/WF2 |
| C10 | Confirm/replan/unassign and promise revisions | Failed replan retains booking; retries/windows preserve history | WF2 |
| C11 | Execution facts, custody and lifecycle command/API actions | Start/pickup/delivery/finish ordering, scope, replay and active occupancy | WF3 |
| C12 | Trip execution detail/actions/history | Complete happy path and missing-reading/late-report paths | WF3 |
| C13 | Disruption queue, retry/return and failed-attempt handling | Preserve failed stops, revised promise, cargo on return and truthful closure | WF4 |
| C14 | Recovery handover/interruption and resource releases | Multi-job all-or-none transfer, competing transfer, same-driver handover | WF4 |
| C15 | Recovery UI and linked source/target history | Manager-only full recovery with actionable conflict/validation states | WF4 |
| C16 | Typed correction/void action and guarded UI | No fact/leg branching, no contradictions with later history, recalculation invalidation | WF4 |
| C17 | Trip odometer boundaries and non-trip mileage ledger | Incoming/outgoing load distinction, non-trip distance, missing/duplicate readings | WF3/WF5 |
| C18 | Vehicle-day envelopes and reconciliation UI/API | Gaps/overlaps/midnight evidence, no-movement days, unknown classification | WF5 |
| C19 | Frozen cohorts, ledger timezone and metric calculation APIs | Complete-only ratio/relative change, fixed denominator and late correction | WF5 |
| C20 | Statistics and measurement setup UI | Coverage/missing-data drill-down; no fake improvement on empty/incomplete data | WF5 |
| C21 | Board/selector query projections and scoped aggregates | Aggregate counts across pages, source observation age, identical filter drill-through | WF2 |
| C22 | Operational dashboard composition | Ready jobs + trips + exceptions, mobile/keyboard and no-access states | WF2 |
| C23 | Standard event invalidation/refresh and retry visibility | Lost/delayed event fallback, post-commit unknown outcome, no cross-org stale response | WF3 |
| C24 | Full cross-workflow adversarial integration coverage | Simultaneous booking, recovery/correction races, org isolation and optional-source absence | All |
| C25 | Deployment/pilot runbook and complete release verification evidence | Ordered configured validation gate, actual UI QA, baseline collection instructions | All |

All work is app scope except documentation and normal generated/template parity artifacts required by repository conventions. No core/platform edits are estimated. C24 is additional cross-flow validation; it does not defer tests required by C01–C23. API actions and field names remain governed by the App Spec; feature-spec decomposition may regroup commits after final confirmation.
