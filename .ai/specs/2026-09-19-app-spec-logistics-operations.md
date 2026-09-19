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
| R1 | Own-fleet whole-job recovery handover with interrupted source outcome | Includes explicit physical release and atomic custody transfer; no split cargo | PM: adopted C1; context re-review pending |
| R2 | Observed-snapshot eligibility, strong logistics exclusivity | Residual concurrent master edit/start race disclosed; no cross-module transaction claim | PM: adopted C2; context re-review pending |

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
