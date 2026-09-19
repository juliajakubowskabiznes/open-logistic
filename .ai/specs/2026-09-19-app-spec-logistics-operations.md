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

**Scope:** standard own-fleet road freight measured in kilograms and optionally pallet spaces; full pickup and full delivery per job, one active trip per job, multiple jobs per trip, one vehicle and one driver at a time. Manual travel-time/distance estimates are explicitly estimates. The release supports delay, failed pickup, failed delivery with retry/return, pre-departure reassignment, whole-job recovery handover to another own-fleet trip and correction of recorded facts. Recovery handover is included because otherwise a breakdown after pickup has no truthful completion path; it does not permit routine split loads or subcontracting.

**Excluded:** subcontractor procurement, sales invoicing, automatic customer communication, driver/client logins, bulk import, telematics, navigation, optimization, AI proposals, dangerous-goods/temperature certification, trailer swapping, multi-driver crews and splitting one job across vehicles. The software records dispatcher decisions; it does not certify vehicle legality, route feasibility or driver-hours compliance.

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
| Recovery handover | Recorded transfer of entire jobs' custody between two own-fleet trips at one place/time | Logistics immutable fact; occurrence and recording times |
| Promise revision | A customer-agreed change to effective pickup/delivery windows, preserving original accepted windows | Logistics; append-only revision |
| Source observation | Timestamped source identity/version set used for an eligibility decision; not a lock on those sources | Authorized source reads; one evaluated interval |

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

#### Additional fields and records required by context review

These definitions refine the preceding table and are normative. All new records share the common scoped fields; arrays are explicitly marked. System-derived timestamps, states, snapshots and cargo lists cannot be supplied as arbitrary client values.

| Record | Precise addition / required flag | Rule |
|---|---|---|
| TransportJob | `isPalletized: boolean R`; `pallets: integer C` | If palletized, count >0 is required; otherwise pallets is null. Unknown count is not accepted as non-palletized. |
| TripStop | `retryOfStopId: UUID O`; kinds additionally `handover_in`, `handover_out`; `readingState: enum(recorded,missing) S` | Failed attempts retain their timestamps/readings. Append retry stops linked to failed attempts; exactly one effective final end stop. Job reference required for every cargo kind, forbidden for end. A leg's source attempt is identifiable. |
| Trip | `planRevision: integer S`; `factRevision: integer S`; status additionally `interrupted` | Expected revision protects edits to the aggregate's stops, memberships and effective fact stream. Completed/interrupted physical history is not silently rewritten. |
| Assignment | `vehicleReleasedAt/driverReleasedAt: UTC datetime O` | Reserved interval protects both; active occupancy ends separately per resource at recorded release. Status released only after both released; release is not evidence that a broken vehicle is fit. |
| VehicleProfile | `lastKnownSource: enum(stop_report,manual_confirmation) C` | Place, time and source are saved together. A stop updates them only if newer than the existing observation. |
| PromiseRevision / logistics | `jobId: UUID R`; `revision: integer S`; `pickupWindowStart/End: UTC datetime R`; `deliveryWindowStart/End: UTC datetime R`; `reason: text R`; `agreedWith: text R`; `agreedAt: UTC datetime R`; `recordedBy: UUID S` | Dispatcher records a complete replacement set; job version serializes revisions. Immutable accepted windows stay in TransportJob; latest revision defines effective promises. No revision retrospectively turns an actual late delivery into on-time against original promises. |
| PlanRevision / logistics | `tripId: UUID R`; `revision: integer S`; `snapshot: PlanSnapshot S`; `reason: text R`; `recordedBy: UUID S` | Immutable snapshot of each confirmed plan/replan, including previous skipped/failed stops. Snapshot fields are Trip's planning fields, ordered TripStop planning fields, active job IDs, promise-revision IDs and source-observation ID; no opaque arbitrary payload. |
| SourceObservation / logistics | `tripId: UUID R`; `checkedAt: UTC datetime S`; `rangeStart/End: UTC datetime S`; `sources: SourceVersion[] S`; `rules: ObservedRule[] S`; `result: enum(eligible,ineligible,unknown) S` | SourceVersion = source entity type, UUID, updatedAt; source set also records queried subject/rule-set IDs and complete sorted rule IDs so inserts/removals can be detected. ObservedRule records ID, subjectType, subjectId, timezone, rrule, exdates, kind and updatedAt. Store only dispatch-needed fields. |
| RecoveryHandover / logistics | `sourceTripId/targetTripId: UUID R`; `jobIds: UUID[] R`; `place: Place R`; `occurredAt: UTC datetime R`; `sourceOdometerKm/targetOdometerKm: decimal(12,1) O`; `reason: text R`; `evidenceReference: text R`; `reportedBy: text R`; `recordedBy: UUID S`; `requestId: UUID R` | Manager-only, nonempty set of whole onboard jobs. Missing odometers leave mileage incomplete, never invented. One atomic custody operation; handover is not a new customer pickup. |
| ResourceRelease / logistics | `assignmentId: UUID R`; `resourceKind: enum(vehicle,driver) R`; `occurredAt: UTC datetime R`; `reason: text R`; `recordedBy: UUID S` | Append-only fact, one effective release per assignment/resource; expected trip revision. Completed/interrupted source need not keep a released driver blocked while a broken vehicle is awaiting recovery. |
| MileageLedgerSettings / logistics | `reportingTimezone: IANA timezone R` | One immutable reporting timezone per organization after first ledger record; cohorts must match it. Changing it requires a future explicit migration, excluded here. |
| MileageLeg | `fromStopId/toStopId: UUID O`; `evidenceReference: text C`; `revision: integer S` | Reference exact trip attempts when generated; correction requires evidence and expected vehicle-ledger revision. Loaded non-trip movement is allowed only as external cargo with provenance, never fabricated custody of a logistics job. |
| CommandReceipt / logistics | `requestId: UUID R`; `actorUserId: UUID S`; `action: text S`; `inputDigest: text S`; `resultRecordIds: UUID[] S`; `resultVersions: text[] S`; `committedAt: UTC datetime S` | Unique scope+actor+action+requestId. Written atomically with domain state; result IDs/versions are parallel ordered arrays. Same key+digest replays the committed result; changed digest conflicts. Failed precommit attempts leave no successful receipt. Guard replay by current authorization. |

**Correction representation:** an OperationalFact replacement keeps its actual domain kind (including `handed_over` and `resource_released`) and adds `correctionReason: text C`, `evidenceReference: text C`, `effect: enum(assert,void) S`, `expectedFactRevision: integer R`. `kind=correction` is removed from the proposed enum; correction is provenance, not an unspecified business action. `occurredAt` and required domain references are the replacement payload. A void references the effective fact it withdraws and adds no new physical action. Pickup/delivery/return/stop-failure require jobId and stopId; departure/finish require tripId and forbid unrelated job/stop references. Handover and release facts reference their typed record IDs. The referenced trip, job, stop and membership must agree, not merely share organization.

One effective successor per fact/leg; no cycles, cross-scope targets or branches. Serialize corrections on trip fact revisions and vehicle ledger revisions, and on all affected jobs/trips for a handover correction. Compute the complete effective custody/stop/mileage consequence before commit; publish it atomically. Reject a correction that would contradict later physical history or another active booking and identify the conflicting record; do not expose an unrestricted force/compound-repair API in this release. Managers can correct a report but cannot rewrite another trip's physical history indirectly. Mark affected reconciliations incomplete and recompute report totals; retain original fact, reason, recorder and evidence reference. New physical movement always uses a new fact rather than a correction.

#### Job and trip state machines

Job states: `draft → ready → assigned → in_transit → delivered`; `draft/ready/assigned → cancelled`; `in_transit → returned`. `assigned → ready` only through unassignment/cancel-trip before physical pickup. `delivered`, `returned`, `cancelled` are terminal; manager fact correction is an audited exception, not unrestricted reopening. Draft acceptance validates all job inputs and stamps acceptedAt once. Assignment stamps firstAssignedAt only the first time. Departure leaves jobs assigned; pickup changes the relevant job to in_transit; a later stop failure leaves custody and state unchanged.

Trip states: `draft → planned → in_progress → completed|interrupted`; `draft/planned → cancelled`. Plan confirmation creates assignment and changes included ready jobs to assigned atomically. Start requires a plan validated against a freshly observed source snapshot and no other active occupancy. Complete requires every **active** member job delivered/returned/cancelled, no cargo custody anywhere on this trip, a completed end stop, recorded actual end and resolved disruptions. Released historical memberships impose no terminal-state requirement. A started trip whose unpicked jobs were all released can finish empty; initial confirmation still requires ≥1 job. Missing mileage may keep reconciliation incomplete but must not trap physical finish or occupancy release.

No started-trip cancellation. An uncollected job can be cancelled or released during execution only if its stops are uncompleted, cargo was never picked up, and the remainder remains valid. Release closes its TripJob membership and marks unperformed stops skipped with reason in the same transaction. Onboard jobs must be delivered, returned or explicitly handed over. Failed delivery appends a retry attempt or a return stop; agreement and revised promises are preserved separately. Full cargo only; no partial quantities or mixed terminal state per job.

**Recovery handover:** create a receiving own-fleet trip with an assigned vehicle/driver, compatible capacity and an opening handover stop followed by the remaining delivery/return obligations. It may reference source onboard jobs as candidates but obtains no custody or active membership before handover. In one manager-authorized transaction lock both trips, all jobs and involved resources; revalidate versions, source custody, target plan/eligibility/occupancy and complete load sequence; close source memberships, skip transferred unperformed source stops, open target memberships, record reciprocal handover stops/fact and start target occupancy. Jobs remain in_transit. Either the whole selected set transfers or nothing changes. Idempotent replay cannot transfer twice. Transfer time must follow pickup and precede later delivery facts; incoming vehicle's prior positioning remains separate empty/non-trip mileage. Source trip may continue with remaining jobs or end `interrupted` once all its cargo is accounted for and a physical end is recorded; no false delivery/return. Resource releases are explicit; if the source driver becomes the target driver, release and reacquire that driver's occupancy atomically at the handover boundary. Releasing a broken vehicle's old assignment also sets its logistics dispatchEnabled=false; fleet manager must explicitly re-enable after repair and validate availability. This is a logistics restriction, not a duplicate planner calendar.

The receiving recovery plan is a **draft** with proposed resources until the handover command confirms and starts it; it cannot pass the ordinary ready-job confirmation path for cargo already in transit. This special command validates the proposed future reservation and all competing bookings. When the same driver is reused, it ends that driver's source reservation and occupancy at the handover boundary before starting the target interval, in the same transaction. Each resource's explicit release caps that resource's effective reservation, independently of the other. Source obligations and custody must permit release; source continuation requires a driver still assigned and occupied. A draft recovery plan never owns cargo or secretly blocks a resource. Disallow same-vehicle recovery in this release; use resume/retry on the original trip instead.

**Interruption predicate:** both completed and interrupted outcomes require no remaining active unperformed obligation and no custody on the source trip. Before interruption, every unpicked assigned job must be released to ready or cancelled with its normal features/versions, closing membership and skipping remaining stops. Reject interruption until that is done, or include explicit selected dispositions atomically; any failure leaves both trip and jobs unchanged. A transferred job's historical membership does not block source interruption. Counterexample fixed: source carries A and has not collected B; transfer A, then interruption must still reject until B is explicitly released/cancelled. This applies equally to a source with only unpicked jobs.

Historical failed/completed/skipped attempts retain the plan/promise revision used at the time. Only pending effective obligations are validated against new effective promises; yesterday's failed attempt neither blocks tomorrow's retry nor moves to tomorrow. Handover-in acquires custody; handover-out releases it; both are mileage boundaries or explicit missing readings. Delivery requires effective custody from pickup **or handover-in**, not a fabricated second pickup. Load simulation and mileage derivation include handover transitions.

#### Assignment and load invariants

1. Every referenced record belongs to the same tenant and organization. Failed authorization or missing scope produces no data or mutation. Read permission never implies dispatch permission.
2. Confirm/replan/start evaluates active flags, logistics dispatchEnabled and full interval availability from a new SourceObservation. Missing/unreadable/unsupported availability fails closed; no invented availability. This is **observed-snapshot consistency** with independently edited masters, not continuous or linearizable eligibility. Respect existing planner semantics rather than claiming generic RFC recurrence support.
3. Reservations use half-open intervals with start < end, including manually planned travel, service and return time. Adjacent reservations may meet at an endpoint; zero-duration reservations are forbidden. Dispatcher confirms location/time feasibility; no routing engine is implied. Two confirmed bookings for the same vehicle or driver may not overlap. Enforce with logistics resource-level serialization inside the transaction, not check-then-write. Atomic replacements retain the old booking on failure. Recovering the same driver uses atomic release/reacquisition, never overlapping active occupancy.
4. Starting a trip marks both resources occupied until actual finish, regardless of planned end. An overrun blocks starting a subsequent trip; show the affected reservation as at risk. It does not silently extend a confirmed reservation through another one or automatically cancel the later trip.
5. Planned stop arrival/departure is monotonic, lies inside the reservation, and satisfies each job's **effective** promise windows. A late actual stop is recorded as late. PromiseRevision records agreement and changed windows without overwriting the original accepted windows; PlanRevision records the corresponding new plan. Failed attempts remain immutable history, and retries are new linked stops. Departure/end have an odometer or explicit missing-reading state.
6. Simulate load after each pickup/delivery/return. Sum onboard weight ≤ vehicle payload; if any job uses pallets, its count and vehicle pallet capacity must be known and respected. Unknown is not zero. Reject a delivery before pickup, repeated pickup/delivery, duplicate active job membership and an empty confirmed trip.
7. Master-data edits do not free reservations or custody. Source observations include the complete applicable rule set and its membership, not only known-row versions. Source-change signals invalidate eligibility; authoritative reads on board load/refresh and each plan/replan/start also detect changed flags, rule sets, newly added and removed rules. A discovered change marks planned trips for review; after physical departure it opens a disruption and requires dispatcher resolution, never automatic rollback. A concurrent master edit can occur between observation and dispatch commit; record checkedAt/source versions and disclose that residual race. Strong consistency covers logistics booking/custody/profile writes, not other modules' master edits. No invented common transaction or core-module patch is proposed.
8. Every write checks expected versions of each affected mutable aggregate; changing a child uses that child's version. Lifecycle writes run through command/mutation guards with audit and post-commit events. Idempotent retry uses a caller-generated requestId scoped to actor/organization/action; same request+body returns the original result, changed body conflicts.
9. Planning cancellation releases reservations and returns unpicked jobs to ready atomically; job cancellation cannot free a whole trip still carrying other jobs. Physical facts cannot be undone through generic CRUD or an undo shortcut that bypasses custody rules.

#### Mileage and KPI invariants

Trip departure, pickup/delivery/return and final stop supply successive odometer boundaries. A pickup changes the load state of the following leg; the incoming leg retains the prior state. Several jobs aboard still count distance once. A return leg is loaded until recorded return. Manual non-trip movements fill positioning/workshop gaps. A missing odometer entry or uncertain cargo state produces incomplete/unknown mileage, not inferred empty mileage.

For each vehicle-day, `T = closing − opening`; effective ledger legs must cover that odometer range exactly once to be complete. `E + L + U = T`, where unclassified gaps are U, and overlapping/out-of-envelope entries block reconciliation. Missing envelope means T is unknown. Capture a boundary reading to split movement across reporting midnight; if unavailable, keep the affected days incomplete until a justified correction, never prorate mileage by elapsed time. This manual burden is an explicit pilot risk.

Coverage reports both distance-reconciled vehicle-days / expected cohort vehicle-days and classified km / known total km. A recorded unknown-load leg can be distance-reconciled; an unrecorded odometer gap cannot. Comparison is eligible only if every expected vehicle-day in both periods is distance-reconciled, U=0, classified distance=T and T>0. Otherwise show known totals and missing counts with no improvement percentage. A boundary correction needs measured/documentary evidence, not merely a reason or time-based estimate. Odometer resets/replacements leave affected periods incomplete in this release; a meter-offset model is deferred and such vehicles remain visibly in the frozen cohort. Corrections preserve original input/author/reason/evidence, invalidate reconciliations and recompute comparisons. Both periods use identical rules, including zero-job days. Disabling a vehicle never removes it from the cohort. All VehicleDays and cohorts use the immutable organization ledger timezone.

#### Domain events

Declare past-tense events through `createModuleEvents`: `logistics.job.accepted`, `.assigned`, `.unassigned`, `.picked_up`, `.delivered`, `.returned`, `.cancelled`; `logistics.trip.planned`, `.replanned`, `.started`, `.completed`, `.cancelled`; `logistics.disruption.opened`, `.resolved`; `logistics.mileage.recorded`, `.corrected`; `logistics.vehicle_day.reconciled`; `logistics.fact.corrected`. Payload includes event identity, record ID, actor ID, tenant/organization, resulting version and occurred/recorded timestamps where applicable; no full personal data. Events follow committed state, never drive the transaction's custody/booking correctness. UI refresh is eventually consistent; commands always revalidate authoritative state. No duplicate domain notifications on an idempotent replay.

Additional facts: `logistics.custody.handed_over`, `logistics.trip.interrupted`, `logistics.assignment.resource_released`, `logistics.job.promise_revised`. Corrected physical facts are not emitted as new pickups/deliveries; emit the correction with affected IDs. Durable command outcome and persisted facts determine retry truth even if post-commit event emission fails; UI offers reload/status reconciliation, not blind creation of a fresh request.

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

| Action | Required features in addition to logistics.view |
|---|---|
| Create/edit/accept/cancel unassigned job; record agreed promise revision | logistics.jobs.manage |
| Confirm/replan/unassign/cancel planned trip; change assigned job/promise | logistics.dispatch.manage AND logistics.jobs.manage for changed jobs/promises |
| Start, pickup, delivery, failed attempt, return, finish; open/resolve ordinary disruption | logistics.execution.manage |
| Release/cancel an unpicked job during execution | logistics.execution.manage AND logistics.dispatch.manage; cancellation also logistics.jobs.manage |
| Create/edit logistics profiles, disable/re-enable vehicle after repair | logistics.fleet.manage |
| Record odometers with execution | logistics.execution.manage; does not permit arbitrary load reclassification |
| Record non-trip mileage, vehicle-day envelopes; reconcile mileage | logistics.mileage.manage; deploy to manager, recorder identity remains distinct from driver/report source |
| Correct/void physical fact or mileage; recovery handover; physical resource release/interruption | logistics.corrections.manage AND logistics.execution.manage; handover additionally logistics.dispatch.manage |
| Configure/freeze cohort and ledger timezone | logistics.measurement.manage |

Commands enforce protected fields and these feature combinations server-side; generic CRUD cannot set lifecycle, timestamps, custody, observation results, corrected load or reconciled state. Draft hard deletion is not offered; cancellation preserves history. Operational selectors use existing customer/resource/personnel read features (`customers.people.view` or `customers.companies.view` as appropriate, `resources.view`, `staff.view`), and `planner.view` for availability. These IDs were verified in module acl.ts files. Missing source capability or required read grant disables dependent actions with a reason; existing historical logistics snapshots remain readable under logistics.view. This does not grant broad personnel editing access.

Portal: NOT USED, as confirmed. Dispatchers/managers need internal tooling; drivers/customers receive no disguised internal accounts. Existing master-data access requires corresponding customers/resources/staff/planner features; linked pages remain permission-aware. Restrict logistics selector responses to the fields necessary for dispatch; no raw staff data exposure. All user input and errors use translations; no secondary identity store.

- [x] One identity per persona, scoped feature-based authorization and portal decision defined.
- [ ] Independent identity/context review passed.

## 3. Workflows `PM`

Five workflows together form one usable operational release. Metrics below are proposed pilot targets, not observed ROI or user-confirmed commitments. Staff time saved is secondary to the primary empty-distance ratio. Every source of a KPI is specified; an unavailable denominator produces N/A.

### WF1 — Make resources and customer work dispatchable

**Journey:** manager links vehicle/driver profiles to existing masters and sets planner availability → dispatcher selects a customer, records a complete job and accepts it → the ready queue exposes work and suitable fleet resources for planning.

**Starts/ends:** two independent subflows below. **Not:** reservation, sales invoicing or a driver account. **Personas:** manager and dispatcher. **Value:** usable cargo/location/window inputs enable manual load matching; accepted-job count and validation completeness are operational inputs to the primary E/T metric, not a separately claimed reduction in staff effort.

WF1 is a release group with independent subflows: **WF1a** starts at resource onboarding and ends at a saved dispatch profile with a truthful eligibility explanation for the selected interval; **WF1b** starts at customer request and ends at ready-job acceptance, regardless of current fleet availability. Intake is never gated on onboarding a new resource or having a free truck. Ordinary amendments cannot prove missing-data follow-up, so no numerical intake-ROI claim is made without classified intake-correction evidence.

**Edges:** (1) customer/master removed or inaccessible → explain selection failure, retain unsaved form, no accepted job; (2) palletized count unknown → retain draft input, block acceptance; (3) duplicate customer reference → warn with permitted matches, allow a distinct job only after explicit acknowledgement since references are not globally unique; (4) no covering availability → resource remains listed as unavailable/unknown, never silently free; (5) stale form → standard conflict bar, no partial overwrite.

| Step | Existing capability | Gap / boundary | Commit IDs |
|---|---|---|---|
| Find/create customer, vehicle master and personnel | customers/resources/staff CRUD, existing access editor | As-is; no new registry; existing feature grants required | None (0) |
| Declare availability | planner editor and service | As-is editor; logistics adapter verifies supported source projection | C09 (shared) |
| Add dispatch profiles | FK-id + snapshot/extension pattern, CrudForm | Logistics-specific payload/pallet capacity and eligibility | C01–C03 |
| Create/accept job into ready queue | customers CRUD reference, commands, DataTable | New transport requirement and validation | C04–C05 |

**Reality check:** not runnable today: only masters exist. With these changes the intake workflow completes; acceptance does not pretend the job is assigned. Full release still requires WF2–WF5.

### WF2 — Plan and reserve a feasible manual trip

**Journey:** dispatcher reviews ready jobs beside vehicle availability and last confirmed locations → groups compatible work/return loads → enters ordered stops, travel/service/return times → assigns vehicle and driver → confirms an exclusive booking and usable trip plan.

**Starts:** ready jobs and eligible resources. **Ends:** confirmed plan, exclusive reservations and assigned jobs visible to every authorized dispatcher. **Not:** calculated route, automatic optimization, a promise of real-time location or legal feasibility. **ROI:** primary contribution is reducing E/T over the fixed cohort; leading measure is share of completed trips carrying ≥2 distinct customer jobs (numerator such trips / completed trips, excluding interrupted trips, displayed separately with their count). No arbitrary increase in trip fragmentation may be presented as improved fleet efficiency.

**Edges:** (1) competing confirmation wins resource/job lock → reject the whole losing plan, preserve draft; (2) combined onboard load exceeds capacity at an intermediate stop → identify stop/load, no reservation; (3) successive jobs have incompatible effective promises → block confirmation until replan or recorded customer agreement; (4) source eligibility changed/unreadable → fail closed with source observation explanation; (5) dispatcher abandons draft → no reservation, no assigned status, draft remains discoverable or can be cancelled.

| Step | Existing capability | Gap / boundary | Commit IDs |
|---|---|---|---|
| Review candidates and known end locations | DataTable, FilterBar, ScheduleView | Scoped logistics projections and observation-age labels | C21–C22 (shared) |
| Build trip and ordered stops | CrudForm/detail scaffolding | Trip/stop planning and load-sequence validation | C06–C07 |
| Read eligibility | Master APIs/query engine, planner DI | Complete authorized source observation, unsupported rule fail-closed | C09 |
| Confirm/replan | Commands, atomic flush, optimistic locking | Exclusive booking and active membership transaction, receipts | C08, C10 |

**Reality check:** platform schedule rendering is reusable, transport reservations are new. A plan is useful only once confirmation, conflicts and executable stop detail all ship together. Empty drafts do not count as delivered functionality.

### WF3 — Execute and finish transport

**Journey:** dispatcher confirms driver departure by phone → records departure and optional/missing reading → records each full pickup/delivery with actual time and odometer → records final positioning/end → closes the physical trip, releases resources and leaves mileage reconciliation explicit.

**Starts:** confirmed plan and physical departure report. **Ends:** all active obligations settled, no cargo aboard, actual end recorded and resource releases recorded; incomplete mileage may remain visibly open under WF5. **Not:** inferred GPS events, customer notification or proof-of-delivery document issuance. **ROI:** target 100% of completed trip obligations have a recorded terminal custody outcome; 95% of reports entered within 30 minutes of their occurredAt timestamp, measured per effective fact. This makes loaded versus empty legs defensible; reporting latency is shown rather than hidden.

**Edges:** (1) prior trip overruns → block new start on occupied vehicle/driver and flag affected plan; (2) actual pickup/delivery late → accept truthful fact and show lateness against both original/effective promises; (3) duplicate click/timeout → retry original requestId or retrieve committed outcome, no duplicate pickup; (4) missing reading → valid pickup/delivery/return still applies its normal custody transition, while affected mileage remains incomplete; the absence of a reading alone implies no cargo change and no invented kilometres; (5) one uncollected job released → skip its future stops and permit finish when remaining active obligations/custody permit.

| Step | Existing capability | Gap / boundary | Commit IDs |
|---|---|---|---|
| Start and reserve active occupancy | Guarded commands + version checks | Dispatch lifecycle and physical occupancy | C11 (uses C08/C09) |
| Record pickup/delivery/end | Standard action dialogs/detail, server errors | Effective fact stream and custody transitions | C11–C12 |
| Record odometer boundaries | Shared form/validation patterns | Leg construction using prior load state; missing boundary handling | C17 (shared) |
| Refresh other dispatchers | Standard events/DOM bridge and authoritative queries | Scoped invalidation, visible refresh/stale state | C23 (shared) |

**Reality check:** no physical transport action exists today. The release completes the whole lifecycle; it may not claim a closed job while custody remains unresolved.

### WF4 — Recover from a disruption and correct a mistaken report

**Journey:** dispatcher records a failed attempt/delay → agrees a retry/return or manager prepares own-fleet recovery → validates changed promises/resources → records a retry, return or atomic handover → completes/interrupts affected trips truthfully. Separately, a manager corrects a mistaken report using the constrained fact-correction action; correction is not recovery movement.

**Starts:** actual failure, breakdown or discovery of an erroneous report. **Ends:** recovery obligation has a confirmed executable next step and then a delivered/returned outcome, or mistaken data is corrected without contradicting later history; source trip is ended/released when physically appropriate. **Not:** subcontracting, split cargo, rewriting historical vehicle identity, customer refunds or arbitrary force repair. **ROI:** 100% of interrupted trips have zero unaccounted cargo and explicit resource release states; unresolved onboard jobs remain in an exception queue until resolved. Report median disruption-open-to-resolution duration and its unresolved count, with no promised duration absent a baseline.

Independent subflow boundaries: **WF4a physical recovery** starts at a disruption report and ends at an executable retry/return plan or completed custody handover with source obligations disposed; subsequent pickup/delivery/return execution belongs to WF3. **WF4b correction** starts at discovery of a mistaken report and ends in an audited consistent replacement/void or explicit rejection with unchanged facts and linked investigation details. Correction does not require an open disruption or fabricate movement. Report accepted/rejected correction counts from command outcomes and correction records separately; neither is claimed as reduced empty kilometres. No generic investigation entity is added: conflict details link the records requiring review.

**Edges:** (1) new receiving vehicle fails capacity/booking check for one transferred job → rollback entire handover set; (2) delivery retry moves to next day → append agreed promise and linked attempt, retain original lateness; (3) source driver reused → atomic boundary release/reacquire, no duplicate occupancy; (4) concurrent handover/correction/delivery → one serialized effective custody history, loser receives conflict; (5) proposed correction contradicts later trip → reject with linked conflict, preserve current truth and request factual investigation; no force option.

| Step | Existing capability | Gap / boundary | Commit IDs |
|---|---|---|---|
| Record/resolve disruption, retry or return | Standard CRUD, detail/actions, commands | Domain exception record, attempt links, revised promise | C13 (uses C10) |
| Prepare and record recovery handover | Standard forms/dialogs, transactional commands | Source/target custody and separate releases | C14–C15 |
| Correct/void report | Version conflict helpers, action audit | Typed correction and downstream consequence validation | C16 |

**Reality check:** operationally complete only with custody handover/retry/return, not a generic notes field. An impossible correction remains a visible unresolved investigation; truthful physical progress can still be recorded through ordinary actions where invariants hold.

### WF5 — Reconcile mileage and evaluate empty running

**Journey:** manager records day boundary readings and all non-trip movement → resolves missing boundaries/classifications against reports/documents → reconciles each vehicle-day → freezes a cohort and collects four baseline weeks → compares eight pilot weeks → dispatcher uses jobs, known locations and the verified result to change tomorrow's manual plan.

**Starts:** initial ledger setup/cohort selection, then each reporting day's readings. **Ends:** a truthful complete comparison or an explicit incomplete result listing exactly what is missing; repair paths remain accessible. **Not:** GPS mileage, estimated readings treated as actual, automatic monetary savings or excluding bad days to meet a target. **ROI:** proposed 10% relative reduction in E/T using §1.2/1.4; completeness target 100% of expected cohort vehicle-days and U=0 before claiming improvement. Primary target is evaluated after data collection, not a release test assertion.

**Edges:** (1) zero distance → N/A ratio; (2) missing day/no jobs → day remains expected and incomplete unless evidenced no-movement envelope; (3) odometer overlap or reset → prevent reconciliation, retain incomplete period, no guessed offset; (4) midnight leg without evidenced boundary → show affected days incomplete, request reading evidence; (5) late correction to baseline → recompute comparison with revision/time, never preserve a misleading achieved badge.

| Step | Existing capability | Gap / boundary | Commit IDs |
|---|---|---|---|
| Configure immutable timezone/cohort | Module config + standard form/ACL | Cohort membership/time range and frozen comparison rules | C19 |
| Record trip and non-trip movement | CrudForm/guarded commands | Vehicle odometer ledger and load provenance | C17 |
| Reconcile envelopes and repair gaps | DataTable, detail/conflict helpers | Distance/coverage computation and manager review | C18 (uses C16) |
| Calculate/show comparison and missing data | KpiCard, standard charts/tables | Complete-only improvement formula and drill-through | C19–C20 |

**Reality check:** software can collect the baseline after deployment. It cannot claim immediate empty-km improvement on an empty database. Daily boundary collection, especially night work, is a pilot workload to validate; incomplete evidence remains explicitly incomplete rather than blocking physical dispatch.

- [x] Five workflows have bounded journeys, per-step mapping, outcomes and five production edge cases.
- [x] Current versus proposed readiness is explicit; all operational workflows ship together.
- [ ] Workflow challenger and architect checkpoint 1 passed.

## 3.5 UI Architecture `PM + UX`

Keep the seven existing Logistics sidebar destinations and the app's global landing page. Dispatcher access uses logistics.view plus individual action features; manager sees the same workspace with additional actions. Permission-hidden actions never substitute for server guards. Map stays a planned-feature page because this release has no geographic data provider; Proposals/disruptions becomes the real disruption queue with proposals still explicitly planned.

| Page / URL | Users and purpose | Blocks / actions |
|---|---|---|
| Dashboard `/backend/logistics` | All logistics readers; dispatcher daily work | KpiCard + two DataTables: ready jobs and today's trips; ScheduleView day/agenda tab; scoped exception queue and last-refreshed time |
| Jobs `/backend/logistics/transport-jobs` | Dispatcher accepts work | FilterBar, DataTable, Create job; reference/customer/places/windows/cargo/state |
| Job create/detail `/backend/logistics/transport-jobs/create`, `/[id]` | Dispatcher; manager history | CrudForm/detail sections; accept, amend unassigned, agreed promise revision, cancel, linked trip and immutable attempts/facts |
| Fleet `/backend/logistics/fleet` | Manager profiles; dispatcher read-only selection | Vehicle and driver tabs, capacity/eligibility/last-known place and age, links to authorized master/availability editors |
| Profile create/detail `/backend/logistics/fleet/vehicles/create`, `/vehicles/[id]`, `/drivers/create`, `/drivers/[id]` | Manager | Reuse CrudForm; choose existing resource/personnel; no replacement master registry |
| Trips `/backend/logistics/trips` | Dispatcher planning and execution queue | DataTable and ScheduleView; create/open draft/confirmed/active/history |
| Trip create/detail `/backend/logistics/trips/create`, `/[id]` | Dispatcher operations; manager recovery/correction | Ordered stop editor using existing table/form controls, resource selectors, load preview, confirm/replan/start/record/finish, history, recovery handover dialog |
| Disruptions `/backend/logistics/proposals-disruptions` | Dispatcher exception handling | Filterable open/resolved DataTable; open affected trip; retry/return/recovery actions are on trip detail |
| Statistics `/backend/logistics/statistics` | Readers see scoped mileage/coverage; manager reconciles | KpiCard, coverage/error panels, vehicle-day DataTable, baseline/pilot comparison; links to ledger and cohort settings |
| Mileage `/backend/logistics/statistics/mileage` | Manager; dispatcher links from missing-reading prompts | Filters by vehicle/date; leg and day-envelope dialogs; reconcile/correct actions feature-gated |
| Measurement `/backend/logistics/statistics/measurement` | Manager | Cohort/timezone/pilot dates form, freeze action and explicit immutable-period explanation |
| Map `/backend/logistics/map` | Existing logistics readers | Existing honest planned state; no fake markers or live-location label |

**Dashboard definitions:** ready-job count = active `ready` jobs in selected organization (all dates by default, pickup window date filter optional); today's trips = non-cancelled trips whose planned interval intersects the selected day in reporting timezone, plus every in_progress trip regardless of start day; active count = all in_progress trips; overdue pickups/deliveries follow the effective-obligation definition below; open disruptions = unresolved records. Counts are server aggregates across all matching rows, not the visible page of ≤100. Every card clicks through with the identical scope/filter. Available vehicles are shown only for an explicit selected planning interval with observed availability and no conflicting logistics reservation/occupancy; no ambiguous all-day “available now” count.

**Overdue-card precision:** label it “Overdue pickups/deliveries.” Count at most one unsettled obligation per active job and action (pickup or delivery), using its current effective attempt and latest effective promise end. A failed attempt remains current until a replacement is explicitly linked; once retry/return/release supersedes it, exclude it. Settled, released, skipped and superseded history never counts. A return disposition retires the delivery obligation; return/handover/end lateness uses plannedDeparture on the separate trip exception list, not customer delivery promises. After a successful retry, neither attempt remains overdue. Store `supersedesStopId: UUID O` for a replacement return and use retryOfStopId for a retry; one current attempt per obligation is enforced by the trip command.

**Entry actions:** the dashboard always offers Create job to jobs.manage users, even with a populated queue. Ready-job row/detail offers Plan trip to dispatch.manage users, prefills the selected job and rechecks readiness at confirmation. Keep queue filters/date in return navigation. A missing-reading prompt links an execution-only dispatcher back to the authorized trip stop's Append reading action (a first reading, not alteration of an existing reading); an existing reading correction or non-trip/day gap links to a manager repair surface with a clear escalation explanation. No unauthorized Mileage write link is presented as a usable action. DataTable uses its built-in filter bar; do not mount a duplicate. Domain trip states live in schedule item metadata rather than changing the shared ScheduleItem status contract.

**Manual empty-running decisions:** ready jobs show pickup/delivery places and windows; trip rows show final planned place/time and last confirmed location/observation age. Dispatcher can filter places and dates to identify candidate return loads and combine jobs. There is no distance-ranked recommendation or claimed optimization. Planning includes a leg table with optional `estimatedDistanceKm: decimal ≥0` per consecutive planned stop boundary, `estimateSource: text` and estimated empty/loaded classification derived from the planned load sequence. Estimates live in PlanSnapshot and never enter the actual mileage KPI. Missing estimates remain blank; manually comparing alternatives is optional and cannot block dispatch.

**Primary task paths after authentication:** dispatcher Logistics → New job (2 navigational clicks); Logistics → select trip → Record stop (3); Logistics → select ready job → Plan trip (3); manager Logistics → Statistics → Mileage (3). Longer data entry/confirmation is not misrepresented as three-click completion. Keyboard-accessible forms and schedule agenda/table alternative; mobile tables retain essential status/action links and detail dialogs. Dialogs support Escape and Ctrl/Cmd+Enter through shared components.

**Freshness:** refresh after committed actions, on focus and every 30 seconds while visible; optionally accelerate with standard scoped DOM event invalidation, never depend on SSE for correctness. Display server snapshot time; beyond 60 seconds since a successful read show stale status. Failure retains clearly marked previous data, exposes Retry and never turns errors into zero counts. Cancel/ignore in-flight previous-organization responses and reset prior-scope state immediately on organization change. All writes recheck server state and versions, even if the board looks current. No global custom cache or state machine.

**Empty/error states:** first-time ready queue → Create job if authorized, otherwise explanatory read-only state; no fleet profiles → authorized Create profile/master links; filters with no matches → Clear filters; unavailable source → explain module/read permission/unsupported schedule and disable dependent writes; mileage without readings → Missing data with actionable vehicle-days; zero-distance cohort → N/A; feature-planned pages remain distinct from empty implemented pages. All copy lives in five existing module locales, DS semantic tokens, shared loading/error/conflict components. No cross-module widget injection is needed in this release.

- [x] Personas, navigation, task entry, useful widgets, routes and empty/failure states specified.
- [x] Existing component families selected; no custom map or drag-and-drop engine.
- [ ] Independent workflow/UX review passed.

## 4. Workflow Gap Analysis `Architect`

Atomic estimates are testable commits, not days or a guarantee of cost. Score convention: 0 existing, 1 configuration, 2 small (1–2 commits), 3 medium (2–3), 4 large (3–5), 5 >5/external dependency. Each C-item is a work package whose explicit atomic split is in the linked ledger, including targeted tests in each increment; linked tests are not postponed to a final testing-only phase. Exact grouping may change after feature design without changing this release's acceptance scope.

| Workflow | Business priority | New gap score | Raw contributing commits | Reuse / effective accounting | Blocks complete release? |
|---|---|---|---|---|---|
| WF1 intake/resources | High, prerequisite | 5 | C01–C05, C09 = 7 | Existing customer/personnel/resource CRUD and planner editor are 0; C09 shared with WF2 | Yes |
| WF2 plan/assign | Highest direct planning value | 5 | C06–C10, C21–C22 = 9 | Reuses profile/job work; board shared across workflows | Yes |
| WF3 execute/finish | High, custody and metric source | 4 | C11–C12, C17, C23 = 5 | Receipts/booking from C08; mileage shared with WF5 | Yes |
| WF4 recover/correct | High, operational completeness | 5 | C13–C16 = 7 | Reuses plan revisions, command/ACL/UI framework | Yes |
| WF5 measure/reconcile | Highest measurement value | 5 | C17–C20 = 6 | C17 counted once in release total | Yes |
| Cross-workflow hardening/runbook | Required release gate | 2 | C24–C25 = 2 | Cross-scope/race/access tests complement per-commit tests | Yes |

**Unique total: 25 work packages, provisionally 33 atomic commits**, all app/documentation scope. Raw workflow contributions total 36 atomic commits; shared C09 (2) and C17 (1) are counted once, yielding 33. Allow estimate revision after feature-spec readiness audits; this is not permission to drop recovery or coverage rules. Detailed [commit ledger](app-spec-notes/logistics-operations-commits.md) defines each unit and proof of completion.

**Capability recheck for all >3-commit stories/workflows:** profiles reuse masters and extensions; jobs/trips are new transport entities, not sales orders or generic planner events; assignment exclusivity is absent from the inspected planner service; recovery/custody is domain state, not a generic workflow instance; mileage is actual odometer reconciliation, not a chart problem. DataTable/CrudForm/ScheduleView and command guards eliminate scaffolding work but do not supply these invariants. No proposed shared platform module or new dependency is needed. If checkpoint finds an actual platform gap, investigate its existing specs/upstream PRs read-only before changing scope; no upstream dependency is currently claimed.

**Workarounds:** human-entered route/time/distance estimates and existing driver reporting channels replace GPS/routing/portal integrations. They preserve a complete manual workflow, with explicitly incomplete mileage where reports lack evidence. No workaround replaces booking exclusivity or custody integrity.

- [x] Every workflow step mapped/scored with shared commits deduplicated.
- [ ] Architect checkpoint 1 passed; update estimates if it finds missed reuse.

## 4.5 Module Architecture `Architect`

One existing app module, `apps/mercato/src/modules/logistics`, owns the domain. Strong invariants remain inside it; neither a new fleet master module nor a reusable booking framework is proposed. Generalized booking may benefit future apps, but this release requires transport custody/load semantics and does not justify extracting an unproven generic API. A reusable deficiency discovered during implementation is a separate proposed platform change, not permission to patch core silently.

| Capability / existing module | Use / extend | Mechanism and boundary |
|---|---|---|
| customers | As-is | Scoped public CRUD/query-engine projections for customer identity; authorized minimal selectors plus job snapshots |
| resources / staff | Extend from logistics | FK-id + owned profile; declared data/extensions.ts link where relevant; existing read APIs/projections, never staff ORM imports |
| planner | As-is with logistics adapter | DI `plannerAvailabilityService`, authorized complete subject + rule-set projections; explicit supported-rule/UTC semantics and observed source versions |
| shared command/CRUD stack | As-is | makeCrudRoute/indexer, commandBus, withAtomicFlush/runCrudCommandWrite where appropriate, mutation guards, scoped headers and conflict handling |
| app domain commands | New logistics code | Resource/job locking, state transitions, receipts, history, snapshots, correction and custody rules; no competing generic workflow engine |
| events / queue | As-is if persistent delivery needed | createModuleEvents and standard delivery/refresh; no private event bus/outbox framework; operational correctness reads persisted facts, never waits on a subscriber |
| UI package | As-is | Table/forms/schedule/KPI/detail/filters/dialogs and DS tokens; compose app pages, not shared framework changes |
| auth / setup / i18n | As-is plus additive module declarations | Feature guards and setup defaults, translations and structural cache/generation conventions |
| workflows / notifications | Deliberately unused for v1 automation | Existing primitives would be used for future approvals/alerts; manual synchronous domain actions do not need async workflow instances or a new notification path |

Dependency absence is explicit: historical logistics snapshots remain readable; source-dependent creation/confirm/replan/start/handover is disabled if the required source module/service or read grant is unavailable. Already-started trips can record truthful execution/return/finish against persisted snapshots; a transient master failure must not erase custody or prevent finishing physical work. No database joins across module-owned ORM entities; extensions cannot own someone else's source identity.

For source reads, implementation must select an existing sanctioned API or query-engine projection and prove staff absence behavior. An app-local adapter translates source contracts to the observation shape; it is not permission to copy source business logic. Source pages own their own write guards and feature requirements. No provider, external service, enterprise module, production dependency or upstream pointer change is required.

### Source adapter contract (architect checkpoint 1 resolution)

**Authorized reads:** use the existing general resources API (`resources/api/resources.ts`), staff team-members API (`staff/api/team-members.ts`), planner availability API (`planner/api/availability.ts`) and rule-set API (`planner/api/availability-rule-sets.ts`), or their sanctioned query-engine projections with the same source-read feature checks. They expose source identity, active flag, availability-rule-set ID, updatedAt and rule subject/timezone/rrule/exdates/kind/version. Scope is resolved from trusted request context; validate returned tenant/organization and every referenced ID. Read all pages (≤100 per page), record membership and versions, and distinguish a missing/deleted record, an empty rule list and an unavailable/forbidden source. A partial read yields unknown eligibility, never partial availability. Do not use the staff assignable endpoint: it excludes personnel without user accounts and uses customer-specific permissions.

**Schedule precedence:** follow persisted selection behavior of `AvailabilityRulesEditor`: if a subject has any saved custom rules, those rules are authoritative; otherwise use its selected rule-set rules if one is linked. Never union custom and rule-set rules. If neither supplies an available window, there is no eligible coverage. The editor's unsaved `customOverridesEnabled` state is browser-local, not a second server source; unsaved edits do not influence dispatch. An explicitly empty custom schedule must be saved with no linked rule set to remain empty; explain this in the onboarding runbook rather than storing an invented override flag. Observation includes source rule-set linkage and complete selected membership; subsequent selection changes invalidate prior observations. Test custom+linked rules, empty custom fallback, no source, unreadable source and a removed/added rule.

**Supported grammar before merger:** accept only finite valid UTC DTSTART with trailing Z, positive DURATION in integral hours/minutes, DAILY without COUNT or DAILY COUNT=1, and WEEKLY without COUNT. WEEKLY may contain a single BYDAY equal to the DTSTART **UTC** weekday (a redundant producer clause); reject mismatched/multiple/ordinal BYDAY. Reject every other recurrence clause, unsupported date syntax, malformed exclusion or unrecognized kind before invoking the merger, including malformed unavailability. EXDATE accepts only valid ISO UTC instants or exact UTC dates. No silent omission of blockers. All selected rules must pass validation; source labels/timezones do not override their encoded UTC instants.

The reused merger interprets DAILY COUNT=1 as a full UTC calendar day. Accept such a one-off rule only when its encoded start is UTC midnight and its duration is exactly 24 hours, so dispatch does not broaden a partial availability window. Reject unsupported partial/local-day one-off inputs with an actionable explanation and link to the existing schedule editor; do not patch planner or silently expand them. Recurring durations are >0 and ≤24 hours and intervals follow the merger's encoded UTC recurrence. Confirm/replan UI shows the evaluated UTC and local display windows so operators can verify the supported schedule. Production pilot setup must verify actual entered schedules satisfy these semantics; a broader timezone-aware scheduler is outside this app change.

**Examples/tests:** weekly `2026-09-21T08:00Z` with 8h duration and BYDAY=MO covers Monday 08:00–16:00 UTC; a 10:00–11:00 UTC unavailable interval splits it and blocks a booking spanning that gap. An all-day one-off at 00:00Z, duration24h, DAILY COUNT=1 overrides that UTC day; a 10:00Z one-off is rejected rather than becoming a 24h window. Europe/Warsaw display of a weekly 08:00Z rule changes from 10:00 to 09:00 across autumn DST; it does **not** keep an implied 10:00 local recurrence. The source timezone label is preserved for provenance, not promised as recurrence conversion. No rules/error/unsupported rules must never display available. Coverage checking unions valid returned windows within the requested interval; it does not expand new recurrence itself.

**Transaction and delivery boundary:** logistics locks/receipts/state use one outer transaction with explicit atomic flushing; emit/index all affected entities only after that outer transaction commits. A nested CRUD helper returning is not proof of outer commit. Existing event delivery plus authoritative refresh is sufficient for the board; do not add a custom persistent queue/outbox just for invalidation. If a post-commit event fails, the persisted receipt and domain state remain authoritative and retry must not repeat the business action.

- [x] Module ownership, existing capabilities and extension seams identified.
- [x] No new generic framework or unauthorized core modifications proposed.
- [ ] Architect checkpoint 1 passed.

## 5. User Stories `PM`

All actors below are internal accounts from §2. Driver-reported facts retain both the authenticated recorder and the reporting source. All failures leave committed state unchanged unless explicitly described as a post-commit unknown outcome; no optimistic success is shown while the server outcome is unknown.

### WF1 — Intake

**US01 — Prepare dispatch resources.** As a fleet manager, I link a resource and staff member to dispatch profiles so a plan can select known capacity and availability. Surface: Fleet profile forms. Success: one scoped profile per master, positive payload, explicit pallet policy, and eligibility explanation. **Happy:** select existing records, fill profile, save, open source availability editor. **Alternate:** disable a profile after current obligations are reviewed; retain all history and frozen-cohort membership. **Failure:** cross-org/stale/missing source or duplicate profile → validation/conflict, no orphan profile; unavailable planner → save permitted profile but eligibility remains unknown and confirmation disabled.

**US02 — Accept a complete transport job.** As a dispatcher, I record a customer request so it appears once in the ready queue with usable constraints. Surface: Job create/detail. Success: acceptedAt stamped once, immutable accepted windows, ready state and complete required data. **Happy:** select customer, enter cargo/places/windows, accept. **Alternate:** save complete draft for later acceptance; duplicate customer reference prompts confirmation but does not require a globally unique reference. **Failure:** invalid pallet/weight/window, lost authorization or stale draft → no acceptance; network timeout → original request reconciliation, no duplicate job. Abandoned unsaved form creates nothing; saved draft remains visible.

### WF2 — Planning

**US03 — Build a combined trip draft.** As a dispatcher, I order jobs and end positioning so I can compare compatible jobs/return loads. Surface: Trip create/detail. Success: persisted ordered draft and load preview, with zero reservations or job-state changes. **Happy:** add ready jobs and pickup/delivery stops, select proposed resources, add final end. **Alternate:** omit optional estimated distances; estimates remain explicitly distinct from actual mileage. **Failure:** no longer ready candidate or invalid ordering → show conflict/validation and preserve draft; abandonment never books resources.

**US04 — Confirm one exclusive assignment.** As a dispatcher, I confirm a feasible draft so other dispatchers see its job and resource commitments. Surface: Trip detail confirmation. Success: assignment, job memberships/statuses, plan/source snapshot and receipt commit together. **Happy:** current source observation + promises + load sequence + booking checks pass. **Alternate:** adjust an adjacent reservation's boundary after explicit feasibility confirmation. **Failure:** two dispatchers choose the same job/vehicle/driver → one succeeds, one receives actionable conflict; no partial booking or lost original draft. Idempotent replay returns the same assignment.

**US05 — Change a confirmed plan without losing its booking.** As a dispatcher, I replan, record customer-agreed windows or release unpicked work so changed requirements remain executable. Surface: Job/Trip detail. Success: a new immutable plan/promise revision with the old plan retained; failed change keeps the old reservation intact. **Happy:** revalidate and atomically replace affected memberships/stops/bookings. **Alternate:** cancel a not-started trip, returning its unpicked jobs to ready; during execution release only unpicked jobs and skip their remaining stops. **Failure:** new resource conflict, changed job version or onboard cargo release request → whole operation rejected. Assigned promise edits require the combined replan action and both features, not a separate blind job PUT.

### WF3 — Execution

**US06 — Record departure.** As a dispatcher, I record a driver-reported departure so the board shows the vehicle/driver occupied. Surface: Trip detail. Success: observed eligibility, version checks and exclusive occupancy precede the committed departure fact. **Happy:** start planned trip with actual time and recorded/missing odometer. **Alternate:** actual late departure is truthful, resulting downstream promises may require WF4 review. **Failure:** prior trip still active, unsupported source or revoked grant → no start; source changed after observation follows the explicit residual-race contract and becomes review/disruption on discovery.

**US07 — Record a stop outcome.** As a dispatcher, I record each full pickup, delivery or failed attempt so custody and mileage load state match reports. Surface: Trip detail Record stop dialog. Success: incoming leg uses previous cargo state; pickup changes following legs; terminal delivery ends custody once. **Happy:** record valid ordered fact and reading. **Alternate:** late fact is accepted with lateness; missing reading retains physical truth and creates a reconciliation task. **Failure:** delivery before pickup, future timestamp, unrelated stop/job or duplicate conflicting fact → reject without altering cargo; same request retry returns original outcome.

**US08 — Finish physical work and release resources.** As a dispatcher, I record final arrival/end so a physically finished trip no longer occupies resources. Surface: Trip detail. Success: no onboard cargo/current unsettled obligation, effective final end, actualEnd and physical releases. **Happy:** all current jobs terminal and disruptions resolved, complete trip. **Alternate:** every unpicked job was released, so finish empty; missing readings remain visible under WF5. **Failure:** outstanding cargo or unexplained resource release → refusal with remaining obligations; historical released jobs do not create a deadlock.

### WF4 — Recovery and correction

**US09 — Recover a failed attempt.** As a dispatcher, I record a delay/failed pickup/delivery and agree retry or return so every cargo item still has a next step. Surface: Disruptions queue → trip detail. Success: original attempt/window persists, new effective promise/attempt is explicit, return remains loaded until actual handback. **Happy:** append linked retry stop with agreed windows. **Alternate:** cancel/release never-collected cargo, or return collected cargo to its pickup place. **Failure:** window revision without agreement, reservation conflict or attempt to cancel onboard job → reject change and keep disruption open. Closing a dialog leaves existing custody untouched.

**US10 — Hand cargo to a recovery vehicle.** As an operations manager, I transfer whole onboard jobs to another own-fleet trip so breakdown recovery does not invent delivery. Surface: Source trip Recovery dialog and target trip detail. Success: exactly one custodian per transferred job, both trip histories linked, receiver active, source can interrupt/release when physically ended. **Happy:** prepare draft receiver; atomically validate/confirm/start it and transfer selected complete jobs. **Alternate:** reuse source driver with atomic release/reacquire; transfer subset of whole jobs only if source still has a driver and valid plan for remaining cargo. **Failure:** one selected job invalid, concurrent delivery/transfer, stale version or insufficient capacity → rollback all selected jobs/receiver activation; retry same receipt, never partial transfer. Same-vehicle recovery uses resume, not handover.

**US11 — Correct a mistaken report.** As an operations manager, I submit an evidenced replacement/void so reporting errors can be repaired without rewriting reality. Surface: Trip history or Mileage correction dialog. Success: one effective successor, consistent custody/load, invalidated affected reconciliations and preserved original evidence. **Happy:** fix a misentered time/reading with correct references and reason. **Alternate:** void a duplicate erroneous assertion when no later dependency makes it impossible. **Failure:** competing successor, changing another organization's fact or contradiction with later physical trip/booking → conflict and no change; no force override. New physical return/handover is never submitted as correction.

### WF5 — Measurement

**US12 — Record all vehicle movement.** As a mileage manager, I add non-trip legs and missing evidenced odometer boundaries so positioning/workshop kilometres remain counted. Surface: Mileage page; execution reports also add trip boundaries under execution permission. Success: no duplicate/overlapping effective movement; load is derived for trip legs and provenance recorded outside trips. **Happy:** complete between-stop readings and non-trip positioning. **Alternate:** record unknown-load leg while investigation continues. **Failure:** reversed odometer/time, unjustified estimated boundary or competing ledger update → no fabricated verified distance; retain explicit gap. Ordinary mileage entry cannot freely change trip load classification.

**US13 — Reconcile a vehicle-day.** As a mileage manager, I compare day envelope with effective legs so unknown/missing kilometres are visible. Surface: Mileage page vehicle-day detail. Success: distance coverage is exact once; classified/unknown totals shown separately. **Happy:** complete evidence, review and reconcile. **Alternate:** evidenced zero-motion day produces T=0, not a zero-percent improvement; complete distance with unknown load remains ineligible for comparison. **Failure:** missing midnight evidence, overlapping legs, meter reset or stale review → refuse complete reconciliation and list gaps; corrections invalidate a prior reconciliation.

**US14 — Measure a fixed fleet comparison.** As an operations manager, I freeze the measurement cohort and compare baseline with pilot so improvement is defensible. Surface: Measurement settings and Statistics. Success: fixed vehicles/timezone/periods, original/effective results traceable to ledger revisions; ratio shown only under §1.4 completeness predicate. **Happy:** freeze before baseline, collect four weeks then eight pilot weeks and evaluate relative reduction. **Alternate:** view whole-fleet live totals separately from the fixed-cohort comparison. **Failure:** incomplete days/unknown load/zero denominator → no improvement badge or percentage; late corrections recompute with revision and timestamp; changed cohort requires a new comparison.

### Shared daily/access stories

**US15 — Choose the next dispatch action.** As a dispatcher or authorized reader, I open the dashboard and see ready jobs, current trips, overdue obligations and resource observation age so I can select the next manual planning/recovery task. Surface: Dashboard. Success: counts and drill-through agree across pagination and scope; primary task entry ≤3 navigational clicks. **Happy:** filter day/place/resource and open plan/detail. **Alternate:** use agenda/table on mobile or keyboard. **Failure:** failed refresh shows stale prior snapshot and Retry, never zero; organization switch clears/ignores old-scope responses; read-only user sees no enabled write action and API denies direct writes.

**US16 — Grant and revoke operating access.** As an administrator using existing access-management permissions, I grant the defined operational features so the correct colleagues can act without sharing accounts. Surface: Existing role/access editor; logistics pages inherit the result. Success: read-only remains read-only; exact and wildcard grants behave consistently; revoked effective grants block the next request. **Happy:** apply dispatcher/manager feature sets with needed minimal master read grants. **Alternate:** use an existing custom role name. **Failure:** stale ACL edit or missing admin feature → existing error/conflict handling; no logistics-specific authentication bypass. Already rendered content is not described as remotely erased from an open browser.

**Demo stories:** N/A for production seeding. No demo users/passwords or invented operational records are created in live tenants. Self-contained integration fixtures cover roles/entities across states and are cleaned up. Optional future sample data requires a separate explicit demo setup and cannot enter real measurement cohorts.

### Cross-story impact matrix

| Story | State changed | Affected stories / conflict | Resolution and event responsibility |
|---|---|---|---|
| US01 | Profile eligibility/capacity | US03–US06, US10; stale constraints/orphan source | Logistics profiles share locks/version checks with assignment; master sources observed separately; reservations/custody retained and revalidated |
| US02 | Accepted job/constraints | US03–US05; duplicate/stale candidate | Job versions and active-membership uniqueness; job.accepted |
| US03 | Draft stop plan | US04, US10 | Draft version only; no booking/custody side effect or event cascade |
| US04 | Booking, membership, job status | US04–US08, US10 | Serialize resource/job keys, atomic all-or-none confirmation; job.assigned/trip.planned after commit |
| US05 | Promises/stops/memberships/reservations | US04, US06–US10 | Atomic replace retaining old plan on failure; released jobs excluded from current obligations; promise_revised/unassigned/replanned |
| US06 | Active occupancy and departure | US04–US08, US10 | Active occupancy persists beyond plan end; delayed source invalidation opens disruption; trip.started |
| US07 | Custody/facts/readings | US05, US08–US14 | Trip/job/ledger revisions; incoming load before transition; job picked_up/delivered/returned or stop failure fact |
| US08 | Terminal trip/resource release | US04, US06, US10, US12 | No current cargo invariant, separate resource release facts; no historical-ready-job deadlock; completed/resource_released |
| US09 | Disruptions/attempts/promises | US05, US07–US10 | Preserve failed attempts and original promises; no status change merely on resolving disruption; disruption and promise events |
| US10 | Custody across trips/resources | US04–US08, US10–US14 | Both trip and all job/resource locks in stable order; one receipt; handed_over/interrupted/released events |
| US11 | Effective fact/ledger stream | US06–US14; branch or historical contradiction | Validate downstream consequences atomically; reject impossible correction; invalidate reconciliation; fact.corrected/mileage.corrected |
| US12 | Effective legs/readings | US11, US13–US14 | Vehicle ledger revision + non-overlap; preserve unknown provenance; mileage.recorded |
| US13 | Reviewed day envelope/completeness | US11–US14 | Expected ledger revision; recompute rather than trusting stale reviewed flag; vehicle_day.reconciled |
| US14 | Cohort configuration, frozen comparison | US01, US11–US15 | Immutable cohort membership; no profile disable/deletion shortcut; derived results revise after ledger changes |
| US15 | Browser filters/current scope only | All writes from board | No server domain mutation on navigation; cancel/ignore old scope reads; authoritative server checks on writes |
| US16 | Effective ACL grants | All other stories | Request-time feature checks including replay/status lookup; UI guards are not authorization |

No subscriber performs custody transfer, state transition or booking release. Events invalidate views/indexes only; there is no unbounded event-to-command loop. Operational commands remain authoritative even when refresh events are lost. Declared event catalogue also includes `logistics.stop.failed`, `logistics.vehicle_profile.updated`, `logistics.driver_profile.updated`, `logistics.cohort.frozen` for the corresponding new facts; ordinary CRUD uses standard module CRUD events where applicable.

- [x] Sixteen stories have persona/surface, measurable success and happy/alternate/failure paths.
- [x] Every story is represented in the cross-story impact matrix; missing recovery/release/correction paths included.
- [ ] Independent story challenger passed.

## 6. User Story Gap Analysis `Architect`

Capability ladder applied in order: existing feature → config/setup → sanctioned extension → workflow/notification primitive → new domain code. Stop at the first fit for each sub-capability; using new transport code does not justify rebuilding available authentication, tables or scheduling. References/commit definitions are in §4.5 and the commit ledger.

| Story | First existing match; residual domain gap | Contributing atomic commits |
|---|---|---|
| US01 | Existing masters/editor; profile extension and UI | C01–C03, C09 (5; shared source adapter) |
| US02 | CRUD reference/commands; transport input/state and job UI | C04–C05 (2) |
| US03 | CrudForm/DataTable; ordered transport draft/load preview | C06–C07 (2) |
| US04 | Command/transaction/lock helpers; atomic transport exclusivity and observed eligibility | C08–C10 (5) |
| US05 | Versioned commands/forms; plan/promise history and atomic replacement | C10 (1, reuses C06/C08) |
| US06 | Guards/command bus; physical departure/occupancy UI | C11–C12 (3) |
| US07 | Standard action dialog; custody facts and leg boundary | C11–C12, C17 (4) |
| US08 | Same execution capability; no new release engine | C11–C12 (shared, 0 extra) |
| US09 | Existing detail/CRUD components; domain disruption and attempts | C13 (1, reuses C10) |
| US10 | Forms/command guards; whole-job transfer and recovery UI | C14–C15 (3) |
| US11 | Conflict helpers/audit; typed correction and effective-history validation | C16a–C16c (3: model/validation, transactional consequences, UI) |
| US12 | Existing forms; actual ledger and non-trip provenance | C17 (1) |
| US13 | Existing table/detail; reconciliation rules and UI | C18a–C18c (3: envelope model, reconciliation API, UI) |
| US14 | Existing configuration/forms/KPI; frozen cohort and ratio rules | C19–C20 (2) |
| US15 | Existing schedule/table/KPI/filter blocks; board projections/composition/refresh | C21–C23 (3) |
| US16 | Existing auth/role configuration; additive logistics declarations | 0 standalone; declarations/tests included in owning C-items and C24 |

C24–C25 add cross-flow verification/deployment documentation; union remains 33 estimated atomic commits, not the sum of story rows. All ≥3-commit stories (US01/US04/US06/US07/US10/US11/US13/US15) were rechecked: existing masters, scheduling, events and UI cover scaffolding, but not owned transport profiles, custody or authoritative booking/mileage projections. Workflow automation adds no benefit to these synchronous operator actions; defer that dependency until a real async approval/notification requirement exists. C16/C18 are explicitly split into three increments each; feature readiness may refine grouping further without dropping invariants.

No platform-scoped commit is proposed, so no external tracker claim is needed for this mapping. A later architect finding requiring a platform change must be investigated read-only and recorded as a dependency; it cannot be disguised as app work.

- [x] Every story mapped through capability ladder with shared work deduplicated.
- [ ] Architect checkpoint 2 passed; any new dependencies resolved.

## 7. Phasing & Rollout `PM`

### Release 1 — Manual dispatch with truthful empty-distance measurement

**Goal:** a dispatcher runs customer request → confirmed multi-job plan → execution → delivery/return/recovery, while a manager can reconcile all fleet movement and evaluate a fixed-cohort empty-km comparison. All sixteen stories and five workflow groups ship together. The 25 C-items group 33 proposed atomic commits into an internal implementation order, not permission to release isolated CRUD pages as a working dispatch system.

**Why this order:** the existing seven-page foundation is already available. The next smallest useful increment must include real work, exclusive assignments, physical execution, recovery and measurable mileage. Deferring recovery would strand cargo; deferring mileage would leave the user-selected outcome unmeasurable. Optional maps, AI and optimization bring external dependencies without completing those essentials.

**Implementation sequence (one release):** C01–C02 establish profiles and C04–C05 jobs → C09 establishes source read/eligibility contracts → C03 integrates fleet eligibility UI → C06–C08/C10 planning/reservations → C11–C16 execution/recovery/corrections → C17–C20 measurement → C21–C23 board/refresh → C24–C25 cross-flow verification/runbook. Each unit ships its own tests. UI/API delivery may be interleaved within that dependency order so actions are reviewable as implemented. Features remain unavailable to pilot operators until the complete release gate passes; do not expose half-working lifecycle actions.

**Business acceptance criteria:**

- [ ] An authorized dispatcher creates a real job, combines it with compatible work, confirms an exclusive vehicle/driver assignment, records departure/pickup/delivery/end and sees the same state after refresh.
- [ ] Competing dispatchers cannot confirm overlapping resources or duplicate job custody; a losing write has a clear recovery path and no partial state.
- [ ] A failed delivery has a usable retry/return path; a broken vehicle can hand whole jobs to another own-fleet trip while preserving mileage/custody/history and disposing of all source obligations.
- [ ] Missing mileage never forces a fake reading or false physical status. Positioning/workshop/no-job days and unknown distance remain visible in the denominator/coverage.
- [ ] A complete fixture cohort yields the exact E/T and relative change; incomplete/zero-distance cohorts display N/A/incomplete and actionable missing data. An actual 10% business improvement is a pilot outcome, not a test-suite success criterion.
- [ ] Read-only, dispatcher and manager permissions work through UI and direct APIs; tenant/organization scope and concurrent versions are enforced.
- [ ] Operators reach their primary action within three navigational clicks; keyboard/mobile, five locales, unchanged existing navigation and honest planned map/proposals states are verified.

**Domain criteria:** pending independently authored criteria and PM challenge; no self-authored criteria are labelled as reviewer output.

### Rollout and pilot (no additional software phase)

1. Complete App Spec review and obtain user confirmation; then decompose into independently deployable capabilities with om-spec-writing. Domain rules stay here; capability grouping must not expose an unusable production workflow.
2. Implement on the task branch with generated migration files/snapshots, discovered registries and required template parity. Verify the complete test/build gate and actual UI. Do not apply local/production migrations as a side effect of spec approval.
3. In an authorized staging deployment, apply the reviewed migrations; run standard generation/role ACL sync/structural cache refresh; grant only the agreed operational/source-read features. Use isolated fixtures for smoke testing. No seeded demo data in live measurement.
4. Manager prepares real profiles/availability, selects immutable reporting timezone and freezes an explicit cohort before baseline collection. Choose a small pilot fleet with feasible daily odometer evidence collection; include night work if it is normal operations. If the team cannot collect complete boundaries, acknowledge that the manual pilot cannot yet measure the goal and adjust the next product proposal rather than faking coverage.
5. Collect four complete baseline weeks using the same app and measurement rules; operators use their usual planning method. Begin the eight-week planning pilot using the shared ready queue/known end locations to combine work. The start dates and proposed 10% target are explicit final-confirmation choices, not assumed historical results.
6. Review coverage and unresolved disruptions daily; evaluate the complete fixed-cohort E/T comparison after the pilot. Show actual dates, job counts, fleet membership, record revisions and late corrections; distinguish correlation from demonstrated causation.

**Rollback:** stop new dispatch writes and revert to the company's previous manual coordination process if necessary. Preserve operational data and provide authorized read access; explicitly finish/recover already-started trips or record their external manual outcomes before removing write capability. Never cancel trips, release cargo or drop new tables merely to roll back software. A deployment rollback involving migrations/production remains a separately authorized operation.

**Total:** 25 work packages / 33 proposed atomic commits for one complete release; zero additional implementation commits assumed for the subsequent baseline/pilot observation period. Future GPS/route optimization/driver portal/AI work requires a separate scoped extension based on observed manual bottlenecks.

- [x] One complete operational release, dependencies, manual workarounds and measurable value identified.
- [ ] Independent DDD domain criteria received and challenged by PM.
- [ ] Final rollout challenger passed.

## 8. Cross-Spec Conflicts `PM`

| Related source | Potential conflict | Resolution |
|---|---|---|
| [Foundation App Spec](2026-09-19-app-spec-logistics-dashboard.md) | Historical scope excludes every operation and describes static pages | Its exclusions apply to foundation only; this user-requested extension owns operational rules and retains all seven URLs/read semantics |
| Foundation goal A3 | 10% relative reduction proposed before real data | Retained only as proposal; user confirmed empty kilometres as goal, not target magnitude or evidence |
| [Stock availability contract](2026-08-14-availability-contract.md) | Similar name could suggest vehicle booking reuse | Stock/catalog contract is unrelated; planner supplies declared schedule, logistics owns transport reservation |
| [OSS optimistic locking](implemented/2026-05-25-oss-optimistic-locking.md), [coverage completion](2026-05-28-optimistic-locking-coverage-completion.md) | New action endpoints might omit versions | All editable records expose updatedAt, custom actions/children enforce own versions and surface shared conflicts |
| [Staff decoupling](implemented/2026-05-08-staff-decouple-from-core.md) | Direct staff entity import or hard optional dependency | Source adapter/public projections and scoped IDs/snapshots; absent-source behavior explicit, no duplicate identity registry |
| Existing workflows module | “Workflow” could mean a new runtime/instance type | WF1–WF5 are business journeys; v1 synchronous domain commands use no custom workflow engine or automation instance |
| [Backward compatibility contract](../../BACKWARD_COMPATIBILITY.md) | New behavior might broaden existing view access or mutate core contracts | Additive app entities/actions/features only; no write authority from logistics.view, no source-schema or framework signature changes |

- [x] Related specs, ownership and terminology conflicts reconciled; no shared entity receives two owners.

## 9. Reference App Quality Gate `Architect`

N/A: this is an operating company's internal app, not a reference app. Reuse shared helpers, UI and test runner. Do not remove unrelated example modules as part of this work. Optional demo fixtures are not acceptance evidence and must never mix with real cohort data.

## 10. Open Questions `PM`

| ID | Question / decision | Options / impact | Owner / status |
|---|---|---|---|
| B1 | Own-fleet internal transport company | No subcontractor marketplace or SaaS billing | User: CONFIRMED |
| B2 | Fewer empty kilometres is primary | Manual mileage and custody records required in first release | User: CONFIRMED |
| B3 | Manual dispatch first | GPS, AI, optimization, billing and portals excluded | User: CONFIRMED |
| A1 | 10% relative reduction, 4 baseline + 8 pilot weeks | Proposed measurable pilot; no guarantee of impact | PM: proposed for final confirmation |
| R1 | Own-fleet whole-job recovery with interrupted source outcome | No cargo or unperformed active obligation may remain on terminal source | PM: adopted C1 and re-review fix; final verification pending |
| R2 | Observed-snapshot eligibility, strong logistics exclusivity | Residual master edit/start race disclosed; no common transaction claim | Independent context re-review: resolved at specified consistency level |
| P1 | Real cohort, reporting timezone and pilot start dates | Deployment configuration; no actual fleet roster supplied | Fleet manager: set/freeze before baseline; not a blocker to writing this spec |
| P2 | Ability to obtain evidenced daily/night boundary readings | Determines actual comparison completeness | Fleet manager: operational pilot check; software must expose incompleteness |
| G1 | Complete App Spec confirmation | Proceed to feature decomposition/implementation or revise business scope | User: pending final reviewed artifact |

## Production Readiness `PM`

Navigation foundation: implemented with [recorded verification](../../docs/logistics/verification.md), not rerun for this documentation work. Operational workflows: NOT deployable; no transport entities, APIs, commands or operational pages exist yet. Spec reviews and implementation checks are pending.

## API Contracts / Migration & Backward Compatibility

All paths below are **proposed additions**, not existing endpoints. Each exports OpenAPI in implementation. GET lists are scoped/paginated at pageSize≤100, with detail selection by id under the same authorization. Do not expose generic writes to internal facts, memberships, observations, receipts or reservations. Public lifecycle writes take typed action payloads and expected aggregate versions; requestId accompanies state-changing actions and creation where duplicate input would create duplicates. Responses include affected record IDs/updatedAt and a command receipt reference. GET command status must apply current authorization and scope.

| Contract | Proposed path / methods | Business boundary | Integration coverage |
|---|---|---|---|
| A01 profiles | `/api/logistics/vehicle-profiles`, `/driver-profiles`: GET/POST/PUT | Master IDs + dispatch fields; no master edits | LOG-OP-01, 02, 14 |
| A02 jobs | `/api/logistics/jobs`: GET/POST/PUT | Create/edit drafts/ready constraints only; assigned edits use replan | LOG-OP-02, 14 |
| A03 job actions | `/api/logistics/jobs/[id]/accept`, `/cancel`, `/promise`: POST | Valid transitions; assigned promise/cancel routes delegate to equivalent atomic plan operation or reject with required action | LOG-OP-02, 05, 09 |
| A04 trips | `/api/logistics/trips`: GET/POST/PUT | Draft plan editing only; immutable confirmed history | LOG-OP-03, 14 |
| A05 plan actions | `/api/logistics/trips/[id]/confirm`, `/replan`, `/unassign`, `/cancel`, `/release-job`: POST | Complete booking/membership transaction; different pre/post-start rules | LOG-OP-03, 04, 05, 08 |
| A06 execution | `/api/logistics/trips/[id]/start`, `/facts`, `/finish`: POST | Typed physical fact, custody, occupancy and missing readings | LOG-OP-06, 07, 08 |
| A07 recovery | `/api/logistics/trips/[id]/handover`, `/interrupt`, `/release-resource`: POST | Manager feature combinations; explicit custody/physical release | LOG-OP-09, 10 |
| A08 disruptions | `/api/logistics/disruptions`: GET/POST; `/[id]/resolve`: POST | Description and typed resolution references; no automatic custody release | LOG-OP-09, 14 |
| A09 corrections | `/api/logistics/facts/[id]/correct`, `/mileage/legs/[id]/correct`: POST | Typed replacement/void, evidence and stream version | LOG-OP-10, 11 |
| A10 mileage legs | `/api/logistics/mileage/legs`: GET/POST | Non-trip entry/missing boundary completion; load not freely editable | LOG-OP-11, 12 |
| A11 vehicle days | `/api/logistics/mileage/days`: GET/POST/PUT; `/[id]/reconcile`: POST | Versioned envelopes; corrections audited; completeness derived | LOG-OP-12 |
| A12 measurement | `/api/logistics/measurement/cohorts`: GET/POST/PUT; `/[id]/freeze`: POST; `/settings`: GET/PUT | Immutable ledger timezone after first record; frozen cohort cannot be edited | LOG-OP-13, 14 |
| A13 statistics | `/api/logistics/statistics`: GET | Date/cohort inputs; authoritative formula/coverage/ledger revision | LOG-OP-13, 15 |
| A14 board | `/api/logistics/dashboard`: GET | Counts, dated trips, open obligations; complete scoped aggregates | LOG-OP-15 |
| A15 selectors | `/api/logistics/dispatch-options`: GET | Minimal authorized master candidates and observed availability; no broad staff payload | LOG-OP-01, 04, 14 |
| A16 outcome | `/api/logistics/commands/[requestId]`: GET | Current actor/action/scope authorized committed receipt lookup; no token-only access | LOG-OP-07, 14 |

Mutation responses distinguish validation (400/422), scope/access (platform 401/403 or nondisclosing 404), stale versions/domain conflicts (409) and temporary unavailable source (503 with retry guidance). A post-commit side-effect failure cannot be reported as a safely rolled-back action; use committed receipt or unknown-outcome reconciliation. Generic PUT cannot skip lifecycle guards. API error bodies use existing conflict/error contracts and translated user messages.

**Migration & Backward Compatibility:** preserve seven URLs, logistics.view read-only semantics, existing feature IDs, event IDs and import paths. Add new module entities/APIs/features/events; no existing source-table changes, relations or data backfill. Keep historical planned pages' access behavior and convert only implemented sections to real empty states. Ship generated migrations and snapshots after entities; generate discovery registries through `yarn generate`, never by hand. Mirror app/template changes using existing template sync rules where applicable. Existing tenants need explicit logistics write grants and supporting source-read grants; ACL sync does not mean every existing logistics viewer becomes a dispatcher. No migration is applied to a developer/production database without separate authorization. Rollback must preserve new transport records and old read paths, not drop tables or falsify completed trips.

## Validation / Risks & Impact Review

Integration tests ship with their owning changes under `apps/mercato/src/modules/logistics/__integration__`, using the existing runner and `@open-mercato/core/helpers/integration/*`. Create scoped fixtures through APIs where possible and always clean them up; no seeded/demo dependency. Pure rule/unit tests cover exact arithmetic and transition predicates; integration tests prove actual API/transaction/UI behavior, not merely mocks of their implementation.

| Coverage | Required API/UI proof |
|---|---|
| LOG-OP-01 | Profile master selection/creation, source read grants, absent module/service and unsupported/complete paginated rule sets; UI explains unknown availability |
| LOG-OP-02 | Create draft/accept job, field constraints, duplicate retry, immutable accepted windows and ready queue |
| LOG-OP-03 | Multi-job trip, intermediate load overflow, pickup order, final end, no reservations from abandoned draft |
| LOG-OP-04 | Two parallel real requests competing for vehicle, driver and job; only one commits; adjacent intervals allowed, zero-length denied; replan rollback |
| LOG-OP-05 | Changed promise/replan/unassign/cancel and historical snapshots; active unpicked release skips stops without finish deadlock |
| LOG-OP-06 | Full create→accept→confirm→start→pickup→delivery→end workflow; late truthful facts, active overrun blocks later start |
| LOG-OP-07 | Duplicate request, lost response and post-commit event failure; same request returns outcome, changed body conflicts; current access still required |
| LOG-OP-08 | Physical finish with missing mileage and with all unpicked jobs released; onboard cargo prevents finish; separate release timing |
| LOG-OP-09 | Failed pickup/release, failed delivery/retry next day with agreed promise, loaded return and disruption closure; no false delivery |
| LOG-OP-10 | Two onboard jobs handed to recovery trip, failure for one rolls all back, concurrent second transfer, same-driver boundary, source interruption and history |
| LOG-OP-11 | Fact/leg correction/void, two competing successors, wrong references, later-history contradiction rejection, downstream mileage/reconciliation invalidation |
| LOG-OP-12 | Positioning/workshop/no-job day, no movement, unknown load, gaps/overlaps, missing midnight evidence, DST reporting-day boundaries, meter reset remains incomplete |
| LOG-OP-13 | Exact E/T and relative reduction, fixed cohort, late baseline correction, immutable timezone, incomplete/no-distance result never shows improvement |
| LOG-OP-14 | Every new method/path: unauthenticated/read-only/exact/wildcard/revoked roles, cross-tenant/org IDs and payload spoofing, current replay permission; safe absent-source execution |
| LOG-OP-15 | Dashboard aggregates across >100 fixtures, count/list same filters, yesterday's active trip, released/skipped overdue exclusions, stale/error Retry, delayed/out-of-order cross-org responses, 30s refresh |
| LOG-OP-16 | All existing seven nav URLs, new create/detail/settings routes, keyboard/mobile, five locales, empty versus planned state, direct URL guards and unchanged Customers navigation |

**Master race test:** insert an unavailable source rule after eligibility observation but before assignment/start commit; prove observed versions/time are retained, booking exclusivity remains strong and next authoritative refresh detects review/disruption. Do not assert a cross-module serialization guarantee that is expressly excluded.

Additional mandatory traces from review: source with onboard A and unpicked B cannot interrupt after handing over A until B is released/cancelled; valid delivery without odometer ends custody and permits physical finish while mileage remains incomplete; Monday failed delivery → Tuesday revised retry → success has no duplicate overdue item; return/handover lateness is not measured against the original delivery promise. Verify populated-dashboard Create job/Plan trip actions and execution-only missing-reading repair without manager privilege.

**Implementation gate runner:** select Docker/local once per gate sequence per `.ai/docs/agent-instructions.md`; record chosen runner. Run the ordered `.ai/agentic.config.json` gate, focused operational integrations and actual UI QA. Existing recorded Windows full-suite limitations must be reported, not hidden by a small focused pass. Spec-only validation uses local relative-link, required-section and diff checks; no application build/test claim is made for this document.

| Risk | Severity / effect | Mitigation | Residual risk |
|---|---|---|---|
| Booking race or duplicate custody | High / double dispatch or lost cargo | Transactional resource/job locks, receipts, versions and adversarial integration | Implementation must prove DB behavior, not just describe it |
| Source master edit races with start | High / changed eligibility | Observed source snapshots, revalidation, refresh/disruption; no false linearizability claim | Narrow source-edit/start race remains and is visible policy |
| Missing/estimated manual mileage | High / false efficiency claim | All cohort days, evidence, unknown flags, exact reconciliation | Night-work boundary collection may be burdensome; incomplete report remains possible |
| Correction rewrites dependent history | High / corrupted custody/metrics | Typed successor, stream locks, reject contradictory repairs | Some mistaken histories need manual investigation before safe correction |
| Post-commit event/response failure | Medium / duplicate operator action | Atomic receipt, current-authorized outcome lookup, authoritative refresh | UI may temporarily show unknown/stale outcome |
| Scope or source-field leak | High / tenant/privacy exposure | Trusted scope, minimum projections, exact/wildcard tests | Requires end-to-end authorization tests for every proposed route |
| Estimates too optimistic | Medium / incomplete release | 25 work packages expand to 33 provisional atomic commits; feature readiness may refine further | No delivery date promised; preserve complete workflow scope |
| Routing/legal assumptions | High / unusable physical plan | Dispatcher confirmation; clear manual estimates and explicit exclusions | Human remains responsible for real-world feasibility |

## Final Compliance Report / Handoff

Pending mandatory challenger gates, architect checkpoints and user confirmation. No feature specifications or code before confirmation.

## Changelog

### 2026-09-19
- Began operational extension after user confirmed own fleet, fewer empty kilometres and manual dispatch.
- Retained the existing foundation and its navigation contracts; added precise proposed domain/identity rules and a complete-mileage measurement requirement.
