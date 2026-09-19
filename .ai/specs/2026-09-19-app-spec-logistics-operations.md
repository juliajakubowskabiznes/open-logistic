# App Spec: Logistics — first operational release

Date: 2026-09-19. Status: DRAFT — Phase 0 domain review pending; not approved for implementation.

This operational extension of the [Logistics foundation App Spec](2026-09-19-app-spec-logistics-dashboard.md) is the source of truth for the next release. The foundation retains ownership of its seven navigation URLs and historical acceptance record. This document owns all new transport business rules; later feature specifications must conform to it. It is an App Spec, not a feature specification or evidence of working operational software.

## TLDR / Overview / Problem Statement / Proposed Solution

The navigation foundation exists, but a dispatcher cannot yet enter transport jobs, book a vehicle and driver, record execution or measure empty running. Build one complete manual operating loop: accept jobs → plan ordered stops and resources → dispatch → record pickup/delivery/return and mileage → reconcile fleet mileage → use the next day's board to combine work and avoid unnecessary empty movement.

Confirmed by the user: an internal tool for an own-fleet transport company; primary goal fewer empty kilometres; manual dispatch first. GPS, route optimization, AI, billing and driver/customer portals are excluded from this release. Customers pay the company for transport. No claim of legal route feasibility, driving-hours compliance or automated optimization is made.

## 1. Business Context `PM`

### 1.1 Business Model

Paying customer: the shipper purchasing transport, not a software subscriber. Users: the company's dispatchers and fleet/operations manager. Drivers communicate execution and odometer readings through existing phone/message channels; dispatchers record them. Driver personnel records do not require login accounts.

**Flywheel:** a reliable shared job queue and vehicle end locations → manually combine compatible jobs and return loads → less empty movement per completed workload → capacity and margin for additional customer work → more opportunities to combine loads. This is a business hypothesis to measure, not a proven result.

- [x] Paying customer and value specified.
- [x] Reinforcing loop and its unproven nature specified.

### 1.2 Business Goals

**Primary metric:** empty-kilometre share, `100 × E / T`, where `E` is verified distance travelled with no customer cargo aboard and `T` is all verified vehicle distance for the same fixed fleet and period. Return-to-base, positioning, workshop journeys and movement outside dispatched trips remain in the denominator. Returned customer cargo remains loaded until custody ends.

**Proposed target:** retain the foundation's hypothesis of a 10% relative reduction from four baseline weeks over eight pilot weeks. Example: 25% → 22.5%, not 15%. The user selected the metric, not this numerical target; target and pilot dates are subject to final App Spec confirmation. Baseline collection is part of this release's pilot; no historical GPS or complete historical ledger is assumed.

**Measurement integrity:** freeze an explicit cohort before baseline; report the same cohort for comparison, plus a separate whole-fleet operational view. Report total distance, empty distance, loaded distance, unknown-load distance, mileage coverage and missing vehicle-days next to any ratio. Do not calculate improvement until both periods have complete distance reconciliation and load classification. No movement produces N/A, not a zero-percent success. No causal claim is justified merely by a before/after ratio; show completed-job counts and fleet changes alongside it.

**Secondary delivery criteria:** a dispatcher completes a job-to-delivery workflow; no overlapping confirmed resource reservations; records and history survive refresh; missing mileage is visible and repairable. No reference-app or SaaS billing goal.

**Scope:** standard own-fleet road freight measured in kilograms and optionally pallet spaces; full pickup and full delivery per job, one active trip per job, multiple jobs per trip, one vehicle and one driver at a time. Manual travel-time/distance estimates are explicitly estimates. The release supports delay, failed pickup, failed delivery with retry/return, pre-departure reassignment and correction of recorded facts.

**Excluded:** subcontractor procurement, sales invoicing, automatic customer communication, driver/client logins, bulk import, telematics, navigation, optimization, AI proposals, dangerous-goods/temperature certification, trailer swapping, multi-driver crews and splitting one job across vehicles. In-transit vehicle/cargo transfer requires explicit recovery rules before it can be presented as supported; it is a domain-review item, not silently treated as cancellation.

- [x] Measurable goal, data sources, coverage and anti-gaming rules specified.
- [x] Scope exclusions explicit; the numerical target is a proposal.

### 1.3 Ubiquitous Language

| Term | One meaning | Source / period |
|---|---|---|
| Transport job | A customer's requirement to move one complete cargo from pickup to delivery | Logistics; lifetime |
| Sales order | A commercial document, not the transport job | Existing sales; lifetime; no new integration |
| Trip | An ordered execution plan undertaken with one vehicle and driver | Logistics; departure through physical finish |
| Stop | A visit where pickup, delivery, return or trip-end activity occurs | Logistics; planned and actual timestamps |
| Leg | Vehicle movement between consecutive recorded boundaries, with distance and load state | Logistics mileage ledger; actual timestamps |
| Assignment | A confirmed reservation of a trip's vehicle and driver over an interval | Logistics; half-open `[start,end)` |
| Availability | Declared time windows in which the resource/person can work; not a reservation | Existing planner, resolved for an interval |
| Custody | Which trip currently carries an entire job's cargo | Confirmed pickup/delivery/return facts |
| Disruption | An unresolved execution problem; orthogonal to job/trip lifecycle | Logistics; opened/resolved timestamps |
| Empty kilometre | Distance with no customer cargo aboard | Verified ledger; reporting date range |
| Unknown kilometre | Distance whose load state is unverified | Reconciliation; reporting date range |
| Vehicle-day | A vehicle's local-calendar-day odometer envelope, including no-movement days | Manual readings; fixed reporting timezone |
| Confirmed plan | A plan with bookings, validated load sequence and stop times | Logistics; latest accepted version |

- [x] Terms, sources and periods defined; availability is distinct from assignment.

### 1.4 Domain Model / Data Models

**Ownership:** `customers` owns customer identity; `resources` owns vehicle/resource identity; `staff` owns personnel; `planner` owns declared availability. The app `logistics` module owns profiles, jobs, trips, bookings, operational facts and mileage. Use same-organization UUID references and immutable descriptive snapshots; no cross-module ORM relationships or imports of staff entity internals. Customer/resource/personnel pages remain the master-data editors.

**Field convention for the tables below:** every key is scalar unless marked `[]`; `R` required in create input, `O` optional/nullable, `S` required and system-set, `C` conditionally required as stated. All stored records have `id: UUID (S)`, `tenantId: UUID (S)`, `organizationId: UUID (S)`, `createdAt: UTC datetime (S)`, `updatedAt: UTC datetime (S)`. All mutable API records return `updatedAt`; mutations require optimistic concurrency. Immutable fact records retain timestamps but are corrected by linked superseding facts, never overwritten. Database names use snake_case. Text is bounded (references 120, names 200, notes/reasons 2000 characters); numbers use exact decimals, never floating-point accumulation for distance/weight. Fields are logical requirements, not prescribed SQL.

| Entity / owner | Precise fields beyond the common fields | Constraints and editing authority |
|---|---|---|
| VehicleProfile / logistics | `resourceId: UUID R`; `registration: text R`; `maxPayloadKg: decimal(12,3) R`; `maxPallets: integer O`; `dispatchEnabled: boolean R`; `lastKnownPlace: Place O`; `lastKnownAt: UTC datetime O` | Unique resource and normalized registration per scope; payload >0, pallet capacity ≥0; location is manually confirmed, never labelled live GPS. Fleet manager edits. |
| DriverProfile / logistics | `staffMemberId: UUID R`; `dispatchEnabled: boolean R`; `dispatcherNotes: text O` | Unique member per scope; personnel and availability remain in staff/planner. Fleet manager edits. |
| TransportJob / logistics | `reference: text S`; `customerId: UUID R`; `customerNameSnapshot: text S`; `customerReference: text O`; `cargoDescription: text R`; `weightKg: decimal(12,3) R`; `pallets: integer O`; `pickupPlace: Place R`; `deliveryPlace: Place R`; `pickupWindowStart/End: UTC datetime R`; `deliveryWindowStart/End: UTC datetime R`; `status: JobStatus S`; `acceptedAt: UTC datetime O`; `firstAssignedAt: UTC datetime O`; `terminalAt: UTC datetime O`; `notes: text O` | Unique internal reference; weight >0, pallet count ≥0. Draft is complete input but unaccepted. Dispatcher edits only before confirmation; job changes after assignment require atomic replan. Snapshots preserve history when masters change. |
| Trip / logistics | `reference: text S`; `status: TripStatus S`; `startPlace: Place R`; `endPlace: Place R`; `plannedStart/End: UTC datetime R`; `actualStart/End: UTC datetime O`; `vehicleProfileId: UUID O`; `driverProfileId: UUID O`; `dispatchNote: text O` | Both resources mandatory for confirmation. Dispatcher edits drafts; confirmed changes use replan command. Empty draft allowed; confirm requires ≥1 job. End place includes return/repositioning after final delivery. |
| TripStop / logistics | `tripId: UUID R`; `jobId: UUID C`; `sequence: integer R`; `kind: enum(pickup,delivery,return,end) R`; `place: Place R`; `plannedArrival/Departure: UTC datetime R`; `status: enum(pending,completed,failed,skipped) S`; `actualArrival/Departure: UTC datetime O`; `odometerKm: decimal(12,1) O`; `reason: text C` | Job required except end; unique sequence; pickup precedes delivery; full cargo only; at least one final end stop. Return is added by recovery decision and replaces an uncompleted delivery, never deletes its history. Failed/skipped requires reason. |
| TripJob / logistics | `tripId: UUID R`; `jobId: UUID R`; `releasedAt: UTC datetime O` | One active membership per job; preserve previous memberships on replan/cancellation. Created only through trip commands. |
| Assignment / logistics | `tripId: UUID R`; `vehicleProfileId: UUID R`; `driverProfileId: UUID R`; `reservedStart/End: UTC datetime R`; `status: enum(reserved,active,released) S`; `releasedAt: UTC datetime O` | One current assignment per trip; exclusive resource intervals and active execution occupancy; assignment created/replaced/released atomically with affected trip/jobs. |
| OperationalFact / logistics | `tripId: UUID R`; `jobId/stopId: UUID O`; `kind: enum(departed,picked_up,delivered,returned,stop_failed,finished,correction) R`; `occurredAt: UTC datetime R`; `recordedAt: UTC datetime S`; `actorUserId: UUID S`; `source: enum(driver_report,dispatcher_observation,document) R`; `note: text O`; `supersedesFactId: UUID C`; `requestId: UUID R` | Append-only; source declared by recorder; timestamps cannot be future; correction requires target and reason, authorized manager, and invariant re-evaluation. An error is not fixed by editing status directly. |
| Disruption / logistics | `tripId: UUID R`; `jobId/stopId: UUID O`; `kind: enum(delay,breakdown,pickup_failed,delivery_failed,other) R`; `description: text R`; `openedAt: UTC datetime S`; `status: enum(open,resolved) S`; `resolution: text O`; `resolvedAt: UTC datetime O` | Resolution required to close; opening does not release a reservation or cargo custody. Dispatchers record and resolve. |
| MileageLeg / logistics | `vehicleProfileId: UUID R`; `tripId: UUID O`; `fromPlace/toPlace: Place R`; `startedAt/endedAt: UTC datetime R`; `odometerStart/EndKm: decimal(12,1) R`; `loadState: enum(empty,loaded,unknown) R`; `cargoJobIds: UUID[] S`; `source: enum(trip_stop,manual_non_trip) R`; `reason: text C`; `supersedesLegId: UUID O`; `recordedBy: UUID S` | Distance is end minus start, nonnegative. Ordered non-overlapping odometer/time ranges per vehicle; trip load derived from custody, never freely overwritten. Non-trip leg requires reason; loaded non-trip movement needs recorded explanation. Corrections append replacements. |
| VehicleDay / logistics | `vehicleProfileId: UUID R`; `date: local date R`; `timezone: IANA timezone S`; `opening/closingOdometerKm: decimal(12,1) R`; `noMovement: boolean R`; `reconciliationState: enum(incomplete,complete) S`; `reviewedBy: UUID O`; `reviewedAt: UTC datetime O`; `revision: integer S`; `correctionReason: text C` | Unique vehicle/date; opening ≤closing; noMovement requires equality; manager confirms or corrects with audit. Adjacent days must join odometers; missing days remain missing, not implied zero. Reconciliation is derived from effective legs. |
| MeasurementCohort / logistics | `name: text R`; `vehicleProfileIds: UUID[] R`; `timezone: IANA timezone R`; `baselineStart/End: local date R`; `pilotStart/End: local date R`; `relativeReductionTarget: decimal R`; `frozenAt: UTC datetime O` | Manager configures; nonempty unique vehicles, ordered disjoint periods. Freeze before baseline; changing vehicles/periods creates a new comparison, never rewrites the original result. |

**Place value:** `label: text R`, `addressLine: text R`, `city: text R`, `postalCode: text O`, `countryCode: ISO alpha-2 text R`, `timezone: IANA timezone R`, `contactName/Phone: text O`. Scalar immutable snapshot in accepted jobs and confirmed stop plans; no geocoding dependency. Display timestamps in place timezone and retain UTC; reporting uses cohort timezone. Validate DST ambiguities explicitly at entry, never silently choose an offset.

#### Job and trip state machines

Job states: `draft → ready → assigned → in_transit → delivered`; `draft/ready/assigned → cancelled`; `in_transit → returned`. `assigned → ready` only through unassignment/cancel-trip before physical pickup. `delivered`, `returned`, `cancelled` are terminal; manager fact correction is an audited exception, not unrestricted reopening. Draft acceptance validates all job inputs and stamps acceptedAt once. Assignment stamps firstAssignedAt only the first time. Departure leaves jobs assigned; pickup changes the relevant job to in_transit; a later stop failure leaves custody and state unchanged.

Trip states: `draft → planned → in_progress → completed`; `draft/planned → cancelled`. Plan confirmation creates assignment and changes included ready jobs to assigned atomically. Start requires a valid confirmed plan, current eligibility/availability and no other active occupancy. Complete requires every included job delivered/returned/cancelled, no cargo aboard, a completed end stop, recorded actual end and resolved disruptions. Missing mileage may keep reconciliation incomplete but must not trap a physically finished trip or keep the vehicle booked forever.

No started-trip cancellation. An uncollected job can be cancelled or released during execution only if its stops are still uncompleted, cargo was never picked up, and the remainder of the trip remains valid. Remaining onboard jobs must be delivered or returned. Failed delivery offers retry of the same delivery or a recorded return to the pickup location; customer agreement and reason are recorded in the resolution. Full pickup/full delivery only; no partial quantities or mixed terminal status per job.

#### Assignment and load invariants

1. Every referenced record belongs to the same tenant and organization. Failed authorization or missing scope produces no data or mutation. Read permission never implies dispatch permission.
2. Confirm a plan only if resources are active and dispatch-enabled, and known availability covers the whole interval. Missing/unreadable/unsupported availability fails closed with a reason; no invented availability. Respect existing planner semantics rather than claiming generic RFC recurrence support.
3. Reservations use half-open intervals, including dispatcher-entered travel, service and return time. Equal endpoints are allowed but dispatcher must explicitly confirm location/time feasibility; the app does not compute routing. Two confirmed bookings for the same vehicle or driver may not overlap. Enforce under a transaction with shared resource-level serialization, not a check-then-write race. Atomic replacements retain the old booking on failure.
4. Starting a trip marks both resources occupied until actual finish, regardless of planned end. An overrun blocks starting a subsequent trip; show the affected reservation as at risk. It does not silently extend a confirmed reservation through another one or automatically cancel the later trip.
5. Planned stop arrival/departure is monotonic, lies inside the reservation, and satisfies each job's pickup/delivery window. A late actual stop is recorded as late, never rejected as if physical reality could be undone. Replanning explicitly records revised promises without rewriting original accepted windows.
6. Simulate load after each pickup/delivery/return. Sum onboard weight ≤ vehicle payload; if any job uses pallets, its count and vehicle pallet capacity must be known and respected. Unknown is not zero. Reject a delivery before pickup, repeated pickup/delivery, duplicate active job membership and an empty confirmed trip.
7. Master-data edits do not silently free assignments. Revalidate at plan/replan/start; mark changed eligibility/availability on the board. Domain review must resolve whether sanctioned guards can make changes to shared master data and assignment checks linearizable without altering core modules.
8. Every write checks expected versions of each affected mutable aggregate; changing a child uses that child's version. Lifecycle writes run through command/mutation guards with audit and post-commit events. Idempotent retry uses a caller-generated requestId scoped to actor/organization/action; same request+body returns the original result, changed body conflicts.
9. Planning cancellation releases reservations and returns unpicked jobs to ready atomically; job cancellation cannot free a whole trip still carrying other jobs. Physical facts cannot be undone through generic CRUD or an undo shortcut that bypasses custody rules.

#### Mileage and KPI invariants

Trip departure, pickup/delivery/return and final stop supply successive odometer boundaries. A pickup changes the load state of the following leg; the incoming leg retains the prior state. Several jobs aboard still count distance once. A return leg is loaded until recorded return. Manual non-trip movements fill positioning/workshop gaps. A missing odometer entry or uncertain cargo state produces incomplete/unknown mileage, not inferred empty mileage.

For each vehicle-day, `T = closing − opening`; effective ledger legs must cover that odometer range exactly once to be complete. `E + L + U = T`, where unclassified gaps are U, and overlapping/out-of-envelope entries block reconciliation. Missing envelope means T is unknown. Capture a boundary reading to split movement across reporting midnight; if unavailable, keep the affected days incomplete until a justified correction, never prorate mileage by elapsed time. This manual burden is an explicit pilot risk.

Coverage reports both complete vehicle-days / expected cohort vehicle-days and classified km / known total km; neither substitutes for the other. An incomplete period shows known totals and missing counts, no improvement percentage. Corrections preserve original input, author, reason and timestamp, invalidate affected reconciliations and recompute comparisons. Baseline and pilot use the same rules, including vehicles with zero jobs. Turning off a vehicle/profile does not remove it from a frozen cohort.

#### Domain events

Declare past-tense events through `createModuleEvents`: `logistics.job.accepted`, `.assigned`, `.unassigned`, `.picked_up`, `.delivered`, `.returned`, `.cancelled`; `logistics.trip.planned`, `.replanned`, `.started`, `.completed`, `.cancelled`; `logistics.disruption.opened`, `.resolved`; `logistics.mileage.recorded`, `.corrected`; `logistics.vehicle_day.reconciled`; `logistics.fact.corrected`. Payload includes event identity, record ID, actor ID, tenant/organization, resulting version and occurred/recorded timestamps where applicable; no full personal data. Events follow committed state, never drive the transaction's custody/booking correctness. UI refresh is eventually consistent; commands always revalidate authoritative state. No duplicate domain notifications on an idempotent replay.

- [x] Entities, field types, multiplicity, required flags and ownership specified.
- [x] State transitions, booking, custody, concurrency and KPI rules specified.
- [ ] Independent context challenger passed; recovery and master-data race findings resolved.

## 2. Identity Model `PM`

| Persona | Identity / role key | Scope | Reads / writes |
|---|---|---|---|
| Dispatcher | Existing internal account; deployment role `logistics_dispatcher` | Current authorized tenant + organization | Operational board/jobs/trips; accepts, plans, dispatches, records reports and disruptions |
| Fleet/operations manager | Existing internal account; deployment role `logistics_manager` | Current authorized tenant + organization | Dispatcher abilities plus profiles, reconciliation, cohort configuration and fact correction |
| Read-only operator | Existing internal account with logistics.view | Current authorized scope | Board and operational details, no writes |
| Driver | Existing staff member, no required user account | Referenced by scoped profile | Reports facts through existing offline channels; no app surface |
| Customer | Existing customer record, no new account | Referenced by job | No app surface |

Role names are deployment conveniences, never guards. Keep `logistics.view`; propose additive `logistics.jobs.manage`, `logistics.dispatch.manage`, `logistics.execution.manage`, `logistics.fleet.manage`, `logistics.mileage.manage`, `logistics.corrections.manage`, `logistics.measurement.manage`. APIs/pages use feature and wildcard matching. Administrator setup grants are explicit; existing installations need the standard role ACL sync; do not promote existing read-only grants into write grants.

Portal: NOT USED, as confirmed. Dispatchers/managers need internal tooling; drivers/customers receive no disguised internal accounts. Existing master-data access requires corresponding customers/resources/staff/planner features; linked pages remain permission-aware. Restrict logistics selector responses to the fields necessary for dispatch; no raw staff data exposure. All user input and errors use translations; no secondary identity store.

- [x] One identity per persona, scoped feature-based authorization and portal decision defined.
- [ ] Independent identity/context review passed.

## 3. Workflows `PM`

Pending Phase 1 after context review.

## 3.5 UI Architecture `PM + UX`

Pending Phase 1.

## 4. Workflow Gap Analysis `Architect`

Pending Phase 1; score in atomic commits and verify against platform capabilities.

## 4.5 Module Architecture `Architect`

Pending architect checkpoint 1.

## 5. User Stories `PM`

Pending Phase 2, including cross-story impacts.

## 6. User Story Gap Analysis `Architect`

Pending Phase 3 and architect checkpoint 2.

## 7. Phasing & Rollout `PM`

Pending Phase 4 and independently authored domain criteria.

## 8. Cross-Spec Conflicts `PM`

The navigation foundation's exclusions were stage-specific; this explicit user-requested extension adds operations. Its proposed empty-km target remains a hypothesis. Stock availability is not vehicle/personnel availability. Existing optimistic-locking and optional-staff contracts apply without replacement. Full reconciliation pending platform mapping.

## 9. Reference App Quality Gate `Architect`

N/A: this is an operating company's internal app, not a reference app. Reuse shared helpers, UI and test runner. Do not remove unrelated example modules as part of this work. Optional demo fixtures are not acceptance evidence and must never mix with real cohort data.

## 10. Open Questions `PM`

| ID | Question / decision | Options / impact | Owner / status |
|---|---|---|---|
| B1 | Own-fleet internal transport company | No subcontractor marketplace or SaaS billing | User: CONFIRMED |
| B2 | Fewer empty kilometres is primary | Manual mileage and custody records required in first release | User: CONFIRMED |
| B3 | Manual dispatch first | GPS, AI, optimization, billing and portals excluded | User: CONFIRMED |
| A1 | 10% relative reduction, 4 baseline + 8 pilot weeks | Proposed measurable pilot; no guarantee of impact | PM: proposed for final confirmation |
| R1 | In-transit recovery boundary | Must not erase custody or falsely close stranded cargo | DDD: resolve during context review |
| R2 | Concurrent changes in master eligibility/availability | Must preserve source ownership and truthful booking guarantees | Architect/DDD: resolve before workflow review |

## Production Readiness `PM`

Navigation foundation: implemented with [recorded verification](../../docs/logistics/verification.md), not rerun for this documentation work. Operational workflows: NOT deployable; no transport entities, APIs, commands or operational pages exist yet. Spec reviews and implementation checks are pending.

## API Contracts / Migration & Backward Compatibility

Pending detailed mapping. Proposed additions only; preserve existing seven URLs, logistics.view semantics and platform interfaces. Mutable entities require updatedAt, version-aware update/delete and guarded action endpoints. Existing records need no transport backfill; new tables/migrations and snapshots ship together when implementation is authorized. Applying migrations requires separate authorization.

## Validation / Risks & Impact Review

Pending workflow-level API/UI coverage and risk matrix. Spec-only work uses local link/content/diff checks; it must not claim application tests passed.

## Final Compliance Report / Handoff

Pending mandatory challenger gates, architect checkpoints and user confirmation. No feature specifications or code before confirmation.

## Changelog

### 2026-09-19
- Began operational extension after user confirmed own fleet, fewer empty kilometres and manual dispatch.
- Retained the existing foundation and its navigation contracts; added precise proposed domain/identity rules and a complete-mileage measurement requirement.
