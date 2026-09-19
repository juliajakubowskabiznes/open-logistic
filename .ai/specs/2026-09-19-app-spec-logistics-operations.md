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

Five workflows together form one usable operational release. Metrics below are proposed pilot targets, not observed ROI or user-confirmed commitments. Staff time saved is secondary to the primary empty-distance ratio. Every source of a KPI is specified; an unavailable denominator produces N/A.

### WF1 — Make resources and customer work dispatchable

**Journey:** manager links vehicle/driver profiles to existing masters and sets planner availability → dispatcher selects a customer, records a complete job and accepts it → the ready queue exposes work and suitable fleet resources for planning.

**Starts:** new resource onboarding or customer transport request. **Ends:** required resources are eligible and accepted job is visible in the scoped ready queue. **Not:** reservation, sales invoicing or a driver account. **Personas:** manager and dispatcher. **ROI:** target ≥95% of accepted jobs contain weight, places and windows without a follow-up data request; numerator jobs accepted without a subsequent required-data correction / all accepted jobs during the pilot, measured from revisions. This enables load matching; no claim of empty-km savings from intake alone.

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

**Edges:** (1) prior trip overruns → block new start on occupied vehicle/driver and flag affected plan; (2) actual pickup/delivery late → accept truthful fact and show lateness against both original/effective promises; (3) duplicate click/timeout → retry original requestId or retrieve committed outcome, no duplicate pickup; (4) missing reading → record physical event with missing state, do not free cargo or fabricate kilometres; (5) one uncollected job released → skip its future stops and permit finish when remaining active obligations/custody permit.

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

**Dashboard definitions:** ready-job count = active `ready` jobs in selected organization (all dates by default, pickup window date filter optional); today's trips = non-cancelled trips whose planned interval intersects the selected day in reporting timezone, plus every in_progress trip regardless of start day; active count = all in_progress trips; overdue stops = pending/failed effective obligations whose effective latest promised time is before server now, excluding released/skipped obligations; open disruptions = unresolved records. Counts are server aggregates across all matching rows, not the visible page of ≤100. Every card clicks through with the identical scope/filter. Available vehicles are shown only for an explicit selected planning interval with observed availability and no conflicting logistics reservation/occupancy; no ambiguous all-day “available now” count.

**Manual empty-running decisions:** ready jobs show pickup/delivery places and windows; trip rows show final planned place/time and last confirmed location/observation age. Dispatcher can filter places and dates to identify candidate return loads and combine jobs. There is no distance-ranked recommendation or claimed optimization. Planning includes a leg table with optional `estimatedDistanceKm: decimal ≥0` per consecutive planned stop boundary, `estimateSource: text` and estimated empty/loaded classification derived from the planned load sequence. Estimates live in PlanSnapshot and never enter the actual mileage KPI. Missing estimates remain blank; manually comparing alternatives is optional and cannot block dispatch.

**Primary task paths after authentication:** dispatcher Logistics → New job (2 navigational clicks); Logistics → select trip → Record stop (3); Logistics → select ready job → Plan trip (3); manager Logistics → Statistics → Mileage (3). Longer data entry/confirmation is not misrepresented as three-click completion. Keyboard-accessible forms and schedule agenda/table alternative; mobile tables retain essential status/action links and detail dialogs. Dialogs support Escape and Ctrl/Cmd+Enter through shared components.

**Freshness:** refresh after committed actions, on focus and every 30 seconds while visible; optionally accelerate with standard scoped DOM event invalidation, never depend on SSE for correctness. Display server snapshot time; beyond 60 seconds since a successful read show stale status. Failure retains clearly marked previous data, exposes Retry and never turns errors into zero counts. Cancel/ignore in-flight previous-organization responses and reset prior-scope state immediately on organization change. All writes recheck server state and versions, even if the board looks current. No global custom cache or state machine.

**Empty/error states:** first-time ready queue → Create job if authorized, otherwise explanatory read-only state; no fleet profiles → authorized Create profile/master links; filters with no matches → Clear filters; unavailable source → explain module/read permission/unsupported schedule and disable dependent writes; mileage without readings → Missing data with actionable vehicle-days; zero-distance cohort → N/A; feature-planned pages remain distinct from empty implemented pages. All copy lives in five existing module locales, DS semantic tokens, shared loading/error/conflict components. No cross-module widget injection is needed in this release.

- [x] Personas, navigation, task entry, useful widgets, routes and empty/failure states specified.
- [x] Existing component families selected; no custom map or drag-and-drop engine.
- [ ] Independent workflow/UX review passed.

## 4. Workflow Gap Analysis `Architect`

Atomic estimates are testable commits, not days or a guarantee of cost. Score convention: 0 existing, 1 configuration, 2 small (1–2 commits), 3 medium (2–3), 4 large (3–5), 5 >5/external dependency. Every C-item is one proposed commit including its targeted tests; linked tests are not postponed to a final testing-only phase. Exact grouping may change after feature design without changing this release's acceptance scope.

| Workflow | Business priority | New gap score | Raw contributing commits | Reuse / effective accounting | Blocks complete release? |
|---|---|---|---|---|---|
| WF1 intake/resources | High, prerequisite | 5 | C01–C05, C09 = 6 | Existing customer/personnel/resource CRUD and planner editor are 0; C09 shared with WF2 | Yes |
| WF2 plan/assign | Highest direct planning value | 5 | C06–C10, C21–C22 = 7 | Reuses profile/job work; board shared across workflows | Yes |
| WF3 execute/finish | High, custody and metric source | 4 | C11–C12, C17, C23 = 4 | Receipts/booking from C08; mileage shared with WF5 | Yes |
| WF4 recover/correct | High, operational completeness | 4 | C13–C16 = 4 | Reuses plan revisions, command/ACL/UI framework | Yes |
| WF5 measure/reconcile | Highest measurement value | 4 | C17–C20 = 4 | C17 counted once in release total | Yes |
| Cross-workflow hardening/runbook | Required release gate | 2 | C24–C25 = 2 | Cross-scope/race/access tests complement per-commit tests | Yes |

**Unique total: 25 proposed atomic commits**, all app/documentation scope. Raw workflow contributions total 27 because C09 and C17 are shared. Allow estimate revision after feature-spec readiness audits; this is not permission to drop recovery or coverage rules. Detailed [commit ledger](app-spec-notes/logistics-operations-commits.md) defines each unit and proof of completion.

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

- [x] Module ownership, existing capabilities and extension seams identified.
- [x] No new generic framework or unauthorized core modifications proposed.
- [ ] Architect checkpoint 1 passed.

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
