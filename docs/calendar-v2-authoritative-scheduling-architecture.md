# Calendar V2 Authoritative Scheduling Architecture

This is the authoritative backend/domain scheduling blueprint for Calendar V2. It is not a UI calendar design. It defines the scheduling authority SalonIQ needs before Calendar V2 becomes a production editing calendar.

Verified scope of this document:

- Frontend Calendar V2 files under `frontend/src/components/admin/calendar-v2/`.
- `frontend/src/components/admin/use-admin-calendar-board-data.ts`.
- Backend appointment controller, service, DTOs, enums, tenant Prisma helper, initial migration, and current backend tests.
- Existing Calendar V2 docs in `docs/calendar-v2-request-workflow-plan.md`, `frontend/src/components/admin/calendar-v2/README.md`, and `frontend/src/components/admin/calendar-v2/native-scheduler-spike/NATIVE_SCHEDULER_SPIKE_NOTES.md`.

## 1. Executive Architecture Decision

Calendar V2 must treat visible slots as projections only. The scheduler grid, Action Inbox, selected slot, hover preview, and local placement outline are client projections of backend state. They are not scheduling authority.

The backend scheduling engine must be the only authority for committed scheduling state. Every future write action must go through one unified scheduling command path:

- place request
- create appointment
- move appointment
- resize appointment
- cancel appointment
- confirm appointment
- future drag/drop
- future smart scheduling

The current waitlist placement endpoint, `POST /api/v1/appointments/waitlist/:waitlistId/place`, is a good first step because it moves one high-value Calendar V2 write into one backend transaction. It is not yet a shared scheduling core. Broader Calendar V2 writes must wait until a canonical allocation and occupied-interval foundation exists.

The production rule is:

1. The UI may propose and preview.
2. The backend scheduling engine validates and commits.
3. The database prevents impossible overlaps for authoritative allocations.
4. The UI replaces preview state only with backend-returned committed state.

## 2. Current Verified Implementation Baseline

### Calendar V2 Frontend

- `frontend/src/app/(tenant)/admin/calendar-v2/page.tsx` renders `CalendarV2RealDataAdapter` and can disable the preview route with `NEXT_PUBLIC_DISABLE_CALENDAR_V2_PREVIEW === 'true'`.
- `frontend/src/components/admin/calendar-v2/real-data/CalendarV2RealDataAdapter.tsx` defines `ENABLE_CALENDAR_V2_PLACEMENT_SAVE` from `NEXT_PUBLIC_ENABLE_CALENDAR_V2_PLACEMENT_SAVE === 'true'`.
- `CalendarV2RealDataAdapter` sets `canSavePlacement` only when the placement-save flag is true and `sample=1` is not active.
- Placement save calls one path through `apiClient.post(request.path, request.payload)`, then refetches or invalidates `appointments-calendar-board`, `appointments-waitlist`, and `appointment-context`.
- `frontend/src/components/admin/use-admin-calendar-board-data.ts` reads `GET /appointments/calendar-board`, `GET /appointments/waitlist`, and `GET /services/admin` with existing React Query keys and polling intervals.
- `frontend/src/components/admin/calendar-v2/commands.ts` already models `entity.version`, `idempotencyKey`, `localOnly`, and `optimistic` metadata.
- `frontend/src/components/admin/calendar-v2/native-scheduler-spike/native-scheduler-drag.ts` creates local `placeRequest` and `moveAppointment` command-shaped objects. The placement preview command is marked `localOnly: true`.
- `buildWaitlistPlacementSaveRequest(...)` sends `{ staffId, startAt, durationMinutes, idempotencyKey, notifyClient: false }` to `/appointments/waitlist/${waitlistId}/place`.
- `detectLocalPlacementConflict(...)` uses client-side block overlap detection with `start < blockEnd && end > blockStart`. This is a preview hint only.
- `NativeSchedulerV2Spike` locks selected placement target state separately from hover preview state.
- `NativeSchedulerPlacementPreview` renders Bulgarian copy stating that the preview is not saved unless the save action is enabled.
- `frontend/src/components/admin/calendar-v2/real-data/calendar-v2-real-data-mappers.ts` maps staff exceptions to `CalendarV2CalendarBlock` with `kind: 'blocked_time'`.
- `frontend/src/components/admin/calendar-v2/projections.ts` maps appointments and waitlist rows into Calendar V2 projections. Untimed waitlist entries remain demand items, not calendar blocks.
- `frontend/src/components/admin/calendar-v2/README.md` records that Calendar V2 writes are disabled by default and that only waitlist/request placement can save when `NEXT_PUBLIC_ENABLE_CALENDAR_V2_PLACEMENT_SAVE === "true"`.
- `frontend/src/components/admin/calendar-v2/native-scheduler-spike/NATIVE_SCHEDULER_SPIKE_NOTES.md` records that real-data mode can save only waitlist/request placement behind the flag; sample mode and flag-off real mode remain non-writing.

### Current Admin Calendar Baseline

- `frontend/src/components/admin/admin-calendar-workspace.tsx` keeps the current production admin calendar UI, but request placement now calls the dedicated transactional waitlist placement endpoint.
- `placeRequestMutation` calls `POST /appointments/waitlist/:waitlistId/place` with `{ staffId, startAt, durationMinutes, idempotencyKey, notifyClient: false }`.
- The old placement-only two-call sequence of `POST /appointments/admin` followed by `PATCH /appointments/waitlist/:id/status` has been removed from the current `/admin` request placement flow; the endpoint now creates the appointment and books the waitlist row together.
- `resolvePlacement(...)` still performs frontend checks for staff working hours, staff exceptions, and appointment overlap before the current admin drag placement.
- Existing `/admin` remains default. Calendar V2 is a direct preview route.

### Backend Endpoint And Transaction Behavior

- `backend/src/modules/appointments/appointments.controller.ts` exposes `POST /appointments/waitlist/:waitlistId/place` through `placeWaitlistEntry(...)`.
- `backend/src/modules/appointments/appointments.service.ts` implements `AppointmentsService.placeWaitlistEntry(...)`.
- `placeWaitlistEntry(...)` calls `ensureWaitlistTable(...)` and `ensureServiceGroupColumns(...)`.
- It validates `startAt` and optional `durationMinutes`.
- It uses `this.prisma.withTenantSchema(...)`, which wraps the callback in a Prisma transaction and executes `SET LOCAL search_path TO "<tenant_schema>", public`.
- Inside that transaction it selects the waitlist row `FOR UPDATE OF w`.
- It rejects missing waitlist rows, already handled waitlist rows, missing service, missing/inactive staff, invalid service duration, duration mismatch, outside working hours, staff exception overlap, appointment overlap, and full group capacity.
- It inserts the appointment and then updates the waitlist row to `booked` with `booked_appointment_id`.
- It returns appointment data, waitlist data, notification metadata, and the submitted idempotency key.
- It does not call the notification queue or processor; `notifications.sent` is returned as `false`.
- May 15 foundation step: standard waitlist placement now also calls `ensureCalendarAllocationsTable(...)`, validates active staff allocation overlap by occupied interval, inserts the appointment, inserts one booked staff `calendar_allocations` row, and then marks the waitlist row booked in the same tenant transaction.
- Standard placement now calculates `display_start_at` / `display_end_at` from the chosen appointment time and `occupied_start_at` / `occupied_end_at` from service buffers. Nullable or invalid buffer values normalize to `0`.
- During the transition before backfill, standard placement still checks existing active appointments directly with buffer-aware occupied-interval math so old rows without allocations cannot be missed.

### Existing Conflict Checks

- `getAvailableSlots(...)` reads service buffer columns but computes slot duration from `service.duration_minutes`.
- `getAvailableSlots(...)` checks staff working hours, staff exceptions, min/max advance booking, appointment overlaps, and group capacity.
- May 15 lifecycle-parity step: for standard exact-time services, `create(...)` now writes the appointment and matching staff `calendar_allocations` row in one tenant transaction. Pending appointments create active `held` allocations; confirmed appointments create active `booked` allocations.
- Standard `create(...)` now validates both active allocation conflicts and the retained buffer-aware legacy appointment fallback before inserting. Group-service create stays on its existing capacity flow and does not create a standard exclusive allocation.
- `create(...)` calls `scheduleNotifications(...)` after appointment insert.
- For standard services, `updateStatus(...)` now keeps existing appointment allocations aligned with lifecycle state: pending/proposal-pending confirmation promotes `held` to `booked`, while cancelled/completed/no-show states make the allocation non-active by setting the matching terminal status.
- For standard services, `rescheduleAppointment(...)` now updates the appointment and matching staff allocation atomically in one tenant transaction, revalidates active allocations plus the retained legacy fallback, updates resource/display/occupied intervals, and creates a replacement allocation during safe legacy reschedules when none exists yet.
- Private `assertNoConflict(...)` exists and checks appointment overlap with PostgreSQL `OVERLAPS`, but it is not a unified scheduling engine.

### Schema And Migration Facts

- `backend/prisma/migrations/001_init.sql` creates tenant `services` with `buffer_before_min`, `buffer_after_min`, `booking_mode`, `slot_capacity`, `group_days`, and `group_time_slots`.
- `appointments` has `start_at` and `end_at`.
- The migration creates `idx_<schema>_appointments_start` and `idx_<schema>_appointments_staff_time`.
- `staff_exceptions` has `staff_id`, `type`, `start_at`, and `end_at`.
- `waitlist` has desired date/time fields, status, and later compatibility columns added by `TenantPrismaService.ensureWaitlistTable(...)`.
- May 15 foundation step adds tenant-local `calendar_allocations` through both the tenant bootstrap migration and `TenantPrismaService.ensureCalendarAllocationsTable(...)` for existing schemas.
- The table stores source/resource identity, display interval, occupied interval, buffers, status, exclusivity, metadata, and timestamps. It adds indexes for resource lookup, occupied interval lookup, source lookup, and status.
- The migration now installs `btree_gist` and adds `calendar_allocations_no_active_exclusive_overlap`, a GiST exclusion constraint over active exclusive allocations using half-open `tstzrange(..., '[)')`.
- `001_init.sql` remains a bootstrap SQL file. Updating it changes fresh database bootstrap and future tenant-schema creation from the current function definition; it does not by itself mutate tenant schemas that already exist in a deployed database.
- `TenantPrismaService.onModuleInit()` now runs `ensureExistingTenantCalendarAllocations()` after platform compatibility. Startup enumerates schemas present in both `public.tenants` and `information_schema.schemata`, then runs the idempotent allocation ensure helper for each existing tenant schema.
- The existing-schema ensure path executes `CREATE EXTENSION IF NOT EXISTS btree_gist`, `CREATE TABLE IF NOT EXISTS "<schema>".calendar_allocations`, four `CREATE INDEX IF NOT EXISTS ...` statements, and a constraint existence probe before `ALTER TABLE ... ADD CONSTRAINT calendar_allocations_no_active_exclusive_overlap EXCLUDE USING gist (...)`.
- There is still no backfill in this step, no durable idempotency storage, and no allocation-only authority for legacy appointments until existing appointment rows are backfilled.

#### Existing Tenant Verification

Use a staging tenant schema name in place of `tenant_demo_business`:

```sql
SELECT extname
FROM pg_extension
WHERE extname = 'btree_gist';

SELECT to_regclass('tenant_demo_business.calendar_allocations') IS NOT NULL
  AS calendar_allocations_exists;

SELECT indexname
FROM pg_indexes
WHERE schemaname = 'tenant_demo_business'
  AND tablename = 'calendar_allocations'
ORDER BY indexname;

SELECT c.conname, pg_get_constraintdef(c.oid)
FROM pg_constraint c
JOIN pg_class t ON t.oid = c.conrelid
JOIN pg_namespace n ON n.oid = t.relnamespace
WHERE n.nspname = 'tenant_demo_business'
  AND t.relname = 'calendar_allocations'
  AND c.conname = 'calendar_allocations_no_active_exclusive_overlap';
```

To verify overlap rejection in a test or staging tenant without leaving rows behind:

```sql
BEGIN;

INSERT INTO tenant_demo_business.calendar_allocations (
  source_type, source_id, resource_type, resource_id, status,
  display_start_at, display_end_at, occupied_start_at, occupied_end_at
) VALUES (
  'verification', '00000000-0000-0000-0000-000000000001',
  'staff', '11111111-1111-1111-1111-111111111111', 'booked',
  '2099-01-01T09:00:00Z', '2099-01-01T10:00:00Z',
  '2099-01-01T09:00:00Z', '2099-01-01T10:00:00Z'
);

INSERT INTO tenant_demo_business.calendar_allocations (
  source_type, source_id, resource_type, resource_id, status,
  display_start_at, display_end_at, occupied_start_at, occupied_end_at
) VALUES (
  'verification', '00000000-0000-0000-0000-000000000002',
  'staff', '11111111-1111-1111-1111-111111111111', 'booked',
  '2099-01-01T09:30:00Z', '2099-01-01T10:30:00Z',
  '2099-01-01T09:30:00Z', '2099-01-01T10:30:00Z'
);

ROLLBACK;
```

The second insert should fail on `calendar_allocations_no_active_exclusive_overlap`. Existing appointments are intentionally not backfilled by this upgrade. If a future backfill tries to insert already-overlapping legacy appointments as active exclusive allocations, the exclusion constraint will reject the conflicting rows; the backfill phase must validate/report legacy overlaps before it becomes authoritative.

### Current Test Baseline

- `backend/test/appointments.service.waitlist-placement.spec.ts` covers successful waitlist placement, booked allocation insertion, buffer-expanded occupied intervals, allocation conflict rejection, legacy-appointment transition conflict rejection, adjacent half-open intervals, buffer-only overlap rejection, already handled request, missing waitlist, missing service, inactive/missing staff, staff blocked interval, outside working hours, insert failure before waitlist update, conditional waitlist-update double-placement protection, DB exclusion-conflict mapping, notification not called, and DTO validation.
- There are still no verified integration tests for real concurrent same-slot races against a live PostgreSQL exclusion constraint, durable idempotent retry, stale entity versions, outbox emission, full backfill validation, or group capacity race.
- `backend/test/appointments.service.visit-progress.spec.ts` exists for visit-progress behavior, which is explicitly not a production Calendar V2 editing feature.

### Current Limitations

- Visible slots and Calendar V2 blocks are projections, not authority.
- The current placement endpoint is isolated to waitlist placement; it is not a reusable scheduling command service.
- Standard waitlist placement and standard exact-time create/status/reschedule now maintain appointment allocations, but this remains a transition state rather than allocation-only authority.
- Legacy appointments are not backfilled yet. Standard reschedule can materialize a missing allocation when it safely moves one legacy row, while retained legacy appointment conflict checks still protect rows that have not been migrated.
- The submitted `idempotencyKey` in waitlist placement is stored in appointment `intake_data.waitlistPlacement`, but no command ledger or uniqueness guarantee exists.
- Calendar V2 frontend command types include versions and optimistic metadata, but current real-data projections do not populate an authoritative entity version for scheduling writes.
- Local UI preview is correctly not committed state and must remain that way.
- Existing appointments and staff exceptions are not backfilled yet. New standard allocation writes are protected against each other by the DB constraint, while transition safety against older appointments still depends on the retained legacy appointment query.
- Group waitlist placement remains on the existing group-capacity flow in this step; it does not yet create the future single authoritative `group_session` allocation model.
- The old two-call `/admin` request placement path has now been retired for current-calendar request placement. Validated legacy backfill is still pending, so allocation-only authority remains intentionally deferred.

## 3. Target Domain Model

### `scheduling_commands`

Purpose: Durable ledger for every scheduling write command.

Required fields:

- `id uuid primary key`
- `tenant_id` or tenant-schema-local equivalent
- `idempotency_key text not null`
- `command_type text not null`
- `actor_type text not null`
- `actor_id uuid null`
- `source_surface text not null`
- `target_entity_kind text not null`
- `target_entity_id uuid null`
- `expected_versions jsonb not null default '{}'`
- `payload jsonb not null`
- `payload_hash text not null`
- `status text not null`
- `result jsonb null`
- `error jsonb null`
- `created_at timestamptz not null default now()`
- `started_at timestamptz null`
- `completed_at timestamptz null`

Must exist now: Yes for production multi-write Calendar V2. A smaller first version can support only waitlist placement.

Migration risk: Medium. It adds storage and uniqueness, but does not need to alter existing appointment behavior if introduced unused first.

Relation to existing tables: Links commands to appointments, waitlist rows, staff blocks, and future holds through `target_entity_*` plus event metadata.

### `calendar_allocations`

Purpose: Authoritative occupied intervals for all resources. This is the table the database protects from impossible overlap.

Required fields:

- `id uuid primary key`
- `source_kind text not null`
- `source_id uuid not null`
- `appointment_id uuid null`
- `waitlist_id uuid null`
- `slot_hold_id uuid null`
- `resource_kind text not null`
- `resource_id uuid not null`
- `allocation_kind text not null`
- `status text not null`
- `display_start_at timestamptz not null`
- `display_end_at timestamptz not null`
- `occupied_start_at timestamptz not null`
- `occupied_end_at timestamptz not null`
- `buffer_before_min integer not null default 0`
- `buffer_after_min integer not null default 0`
- `exclusive boolean not null default true`
- `capacity_group_key text null`
- `capacity_units integer not null default 1`
- `created_by_command_id uuid null`
- `created_at timestamptz not null default now()`
- `released_at timestamptz null`

Must exist now: Yes. This is the smallest production-safe foundation.

Migration risk: High. Existing appointments must be backfilled into allocations before constraints become authoritative.

Relation to existing tables: Mirrors active scheduled appointments, staff exceptions, slot holds, and future room/equipment allocations.

### `appointments`

Purpose: Business record for a booked visit or session.

Required target additions:

- `version integer not null default 1` or equivalent version column
- stable scheduling state fields remain distinct from visit-progress state
- relation to one or more `calendar_allocations`

Must exist now: Existing table already exists. Versioning and allocation relation are needed before Calendar V2 broad writes.

Migration risk: Medium. Adding a version column is low risk; backfilling allocations is higher risk.

Relation to existing tables: Existing source of appointment details; no longer the only source of occupied interval truth after `calendar_allocations` exists.

### `waitlist` / Demand Items

Purpose: Untimed or partially timed demand awaiting scheduling.

Required target additions:

- `version integer not null default 1`
- explicit `handled_by_command_id uuid null`
- optional `placed_appointment_id` equivalent to existing `booked_appointment_id`

Must exist now: Existing table exists. Versioning is needed before stale-state conflict handling.

Migration risk: Low to medium.

Relation to existing tables: Current Calendar V2 demand items map from waitlist rows. Placement creates an appointment and allocation, then marks the waitlist row booked.

### Staff Exceptions / Blocks

Purpose: Authoritative unavailable time for a staff resource.

Required target fields:

- Existing `staff_exceptions` fields are enough for source records.
- Each active block must also write a `calendar_allocations` row with `allocation_kind = 'staff_block'`, `exclusive = true`, and occupied interval equal to blocked interval.

Must exist now: Existing table exists. Allocation projection must exist with the allocation foundation.

Migration risk: Medium because existing staff exceptions must be backfilled.

Relation to existing tables: `staff_exceptions` remains the business source; `calendar_allocations` enforces scheduling occupancy.

### `slot_holds`

Purpose: Temporary holds for future flows that need a short-lived reservation while a user confirms or pays.

Required fields:

- `id uuid primary key`
- `tenant_id` or tenant-schema-local equivalent
- `resource_requirements jsonb not null`
- `display_start_at timestamptz not null`
- `display_end_at timestamptz not null`
- `occupied_start_at timestamptz not null`
- `occupied_end_at timestamptz not null`
- `expires_at timestamptz not null`
- `status text not null`
- `created_by_command_id uuid null`
- `created_at timestamptz not null default now()`

Must exist now: Can wait unless public booking or payment needs holds.

Migration risk: Medium.

Relation to existing tables: Holds create temporary `calendar_allocations` rows with `source_kind = 'slot_hold'`.

### `scheduling_events`

Purpose: Immutable domain event log for committed scheduling changes.

Required fields:

- `id uuid primary key`
- tenant identifier
- `sequence bigint not null`
- `event_type text not null`
- `source_command_id uuid not null`
- `entity_kind text not null`
- `entity_id uuid not null`
- `affected_resources jsonb not null`
- `affected_range_start_at timestamptz not null`
- `affected_range_end_at timestamptz not null`
- `payload jsonb not null`
- `created_at timestamptz not null default now()`

Must exist now: Can wait until after allocation correctness, but should be designed with the command engine.

Migration risk: Medium.

Relation to existing tables: Emits events for appointment placement, movement, cancellation, block creation, and waitlist handling.

### `scheduling_outbox`

Purpose: Transactional outbox for websocket/SSE invalidation and async side effects after commit.

Required fields:

- `id uuid primary key`
- tenant identifier
- `event_id uuid not null`
- `topic text not null`
- `payload jsonb not null`
- `status text not null`
- `attempt_count integer not null default 0`
- `next_attempt_at timestamptz not null default now()`
- `created_at timestamptz not null default now()`
- `processed_at timestamptz null`

Must exist now: Can wait until realtime/invalidation phase.

Migration risk: Medium.

Relation to existing tables: References `scheduling_events`. It must not replace the event log.

### Resource Requirements

Purpose: Normalize what a command needs before allocations are written.

Required fields/concept:

- `staff` requirements
- service duration
- buffer before/after
- exclusive or capacity-based usage
- future `room` and `equipment` requirements
- optional `client` constraints

Must exist now: Must exist in code before unified SchedulingEngine writes. Table storage can wait unless tenant-configurable requirements need persistence.

Migration risk: Low if represented in code first.

Relation to existing tables: Derived from services, staff, appointments, waitlist, and future resources.

### Entity Versions

Purpose: Detect stale frontend state.

Required fields/concept:

- `appointments.version`
- `waitlist.version`
- `staff_exceptions.version`
- optional service/staff policy version in command context

Must exist now: Needed before Calendar V2 broad edits. Waitlist placement can start with command ledger plus waitlist row lock, but stale UI responses are weaker without versions.

Migration risk: Low to medium.

Relation to existing tables: Increment on each committed mutation that changes scheduling meaning.

### Display Interval Vs Occupied Interval

Purpose: Separate what the UI shows from what scheduling blocks.

Required fields:

- `display_start_at`
- `display_end_at`
- `occupied_start_at`
- `occupied_end_at`
- buffer metadata

Must exist now: Yes with `calendar_allocations`.

Migration risk: Medium due to backfill semantics.

Relation to existing tables: Existing `appointments.start_at/end_at` are display interval. Occupied interval is computed from display interval plus service buffers.

### Buffers

Purpose: Include setup/cleanup time in authoritative occupancy.

Required fields:

- `buffer_before_min`
- `buffer_after_min`
- `occupied_start_at = display_start_at - buffer_before_min`
- `occupied_end_at = display_end_at + buffer_after_min`

Must exist now: Yes. Service columns already exist, but they are not authoritative until allocations use them.

Migration risk: Medium because adding buffers to existing appointments may reveal existing overlaps.

Relation to existing tables: `services.buffer_before_min` and `services.buffer_after_min`.

### Group Capacity

Purpose: Allow multiple participants in the same session without treating them as normal exclusive overlaps.

Required fields/concept:

- `capacity_group_key`
- `capacity`
- `capacity_units`
- one exclusive staff/session allocation for the session interval
- participant rows tied to the session capacity, not exclusive staff overlaps

Must exist now: Can be part of allocation design now, even if Calendar V2 group editing waits.

Migration risk: High if existing group appointments are represented only as overlapping appointment rows.

Relation to existing tables: Existing services have `booking_mode`, `slot_capacity`, `group_days`, and `group_time_slots`.

### Future Rooms And Equipment

Purpose: Add multi-resource scheduling without redesign.

Required fields/concept:

- `resource_kind = 'room' | 'equipment' | 'staff' | 'group_session'`
- `resource_id`
- one allocation per required resource

Must exist now: The generic `resource_kind/resource_id` shape must exist now. Actual room/equipment source tables can wait.

Migration risk: Low now if generic allocations are introduced; high later if staff-only assumptions leak into constraints.

Relation to existing tables: No current room/equipment tables were found in inspected paths.

## 4. Authoritative Interval And Allocation Model

All scheduling intervals must use half-open semantics: `[start, end)`.

An interval overlaps another interval when:

```text
left.start < right.end AND left.end > right.start
```

With PostgreSQL ranges, the equivalent is:

```sql
tstzrange(left_start, left_end, '[)') && tstzrange(right_start, right_end, '[)')
```

Rules:

- Adjacent intervals do not conflict: `[10:00, 11:00)` and `[11:00, 12:00)` are valid.
- Zero-length or inverted intervals are invalid.
- Display interval is the client-visible appointment time.
- Occupied interval is what blocks scheduling.
- For a standard service, occupied interval equals display interval plus buffers:
  - `occupied_start = display_start - buffer_before`
  - `occupied_end = display_end + buffer_after`
- Staff blocked time is represented as an allocation with `source_kind = 'staff_exception'`, `allocation_kind = 'staff_block'`, and occupied interval equal to the blocked interval.
- A standard exclusive staff booking creates an exclusive staff allocation. Any overlap on the same active staff resource is rejected by the database.
- A group service must not be modeled as normal overlapping staff bookings. It should create one exclusive staff/session allocation for the session, then participant capacity records under the same `capacity_group_key`.
- Future room/equipment services add more allocations to the same command. A haircut can require one staff resource. A future spa package can require staff plus room plus equipment without changing the command architecture.

## 5. Database Concurrency Strategy

### Exclusion Constraint

Recommended for authoritative exclusive resource conflicts.

Minimum production constraint for active exclusive allocations:

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE tenant_schema.calendar_allocations
  ADD CONSTRAINT calendar_allocations_no_exclusive_overlap
  EXCLUDE USING gist (
    resource_kind WITH =,
    resource_id WITH =,
    tstzrange(occupied_start_at, occupied_end_at, '[)') WITH &&
  )
  WHERE (status = 'active' AND exclusive = true);
```

This makes same-staff active exclusive overlaps impossible even if an application path misses a check. The exact tenant-schema dynamic SQL must follow the existing schema-per-tenant pattern.

Useful for:

- Standard staff bookings.
- Staff blocks.
- Slot holds that should block staff.
- Future rooms/equipment with exclusive use.

Not enough for:

- Group capacity counts.
- Idempotency.
- State transition policy.
- Multi-row resource commands that need consistent lock ordering.

### Advisory Locks

Recommended as a supplement, not as the only safety mechanism.

Use transaction-scoped advisory locks for command serialization where a single exclusion constraint is not enough:

- same waitlist request placement
- group session capacity
- multi-resource commands that touch staff plus future room/equipment
- command ledger idempotency row creation

Lock key format should be deterministic, for example:

```text
tenant_schema:scheduling:<resource_kind>:<resource_id>:<yyyy-mm-dd>
tenant_schema:waitlist:<waitlist_id>
tenant_schema:group_session:<service_id>:<staff_id>:<start_at>
```

Acquire all locks in sorted lexical order before checks and writes. This avoids deadlocks when commands touch multiple resources.

### SERIALIZABLE Isolation

Useful as defense in depth for complex commands. It is not the recommended sole mechanism because:

- it requires robust retry handling for serialization failures;
- it does not express business constraints as clearly as an exclusion constraint;
- it still depends on every write path using the correct transaction.

Use SERIALIZABLE for high-risk multi-row commands after allocation constraints exist, with retry on SQLSTATE `40001`.

### Recommended Minimum Production-Safe Approach

Phase 1 minimum:

1. Create `calendar_allocations`.
2. Backfill active appointments and staff exceptions.
3. Add a GiST exclusion constraint for active exclusive resource intervals.
4. Move waitlist placement to write appointment plus allocation in one transaction.
5. Keep the waitlist `FOR UPDATE` lock.
6. Translate database constraint failures into structured scheduling conflicts.

This must happen before drag-to-move, resize, or Calendar V2 appointment creation is treated as production.

### Transaction Boundaries

One scheduling command transaction must:

1. Resolve or create the command ledger row.
2. Validate expected entity versions.
3. Lock target entities such as waitlist row or appointment row.
4. Acquire advisory locks in stable order when needed.
5. Load service, staff, exception, and policy context.
6. Build proposed allocations.
7. Write appointment/state changes.
8. Write `calendar_allocations`.
9. Write `scheduling_events`.
10. Write `scheduling_outbox`.
11. Mark command success or failure.

No websocket event, notification send, SMS, Telegram, or external call should happen inside the transaction.

### Deadlock Avoidance

- Sort resource locks by `(resource_kind, resource_id, occupied_start_at)`.
- Lock command ledger row before domain rows.
- Lock target appointment or waitlist row before allocations.
- For move operations, lock old and new resources in sorted order, not old-first/new-first.
- Keep transactions short. Do not perform suggestion search inside the commit transaction.

### Retry Behavior

Retry only safe transaction failures:

- serialization failure `40001`
- deadlock detected `40P01`
- transient lock timeout when the command has not committed

Do not blindly retry business conflicts:

- staff interval conflict
- group capacity full
- outside working hours
- request already handled
- stale entity version

### Two Admins Placing Into Same Staff/Time

Expected result:

1. Both commands may pass frontend preview.
2. Backend builds allocations in separate transactions.
3. One transaction inserts active exclusive allocation and commits.
4. The other transaction fails on the exclusion constraint or detects overlap before insert.
5. Backend returns structured conflict `STAFF_INTERVAL_CONFLICT`.
6. Frontend clears committed optimistic state, preserves useful selected slot context, and refetches affected board/waitlist.

### Same Waitlist Request Placed Twice

Expected result:

- Same `idempotency_key` and same payload after success: return stored success from `scheduling_commands`.
- Same `idempotency_key` with different payload hash: return idempotency conflict.
- Different command after waitlist is booked: return `REQUEST_ALREADY_HANDLED` with the booked appointment id if safe to expose.
- Current row lock with `FOR UPDATE` is a good first layer, but durable idempotency requires `scheduling_commands`.

### Stale Frontend State

Every write command must include expected entity versions for the primary entity and any important dependent entity that could change command meaning. Examples:

- waitlist row version for placement
- appointment version for move/resize/cancel
- service version or policy version when duration/buffers changed after preview
- staff version when working hours changed after preview

If a version mismatch is detected, return `STALE_ENTITY_VERSION` and include refreshed entity references or refetch instructions.

## 6. Unified SchedulingEngine Design

Create one canonical backend engine/service, for example:

```text
backend/src/modules/scheduling/scheduling-engine.service.ts
```

Do not wire Calendar V2 broad writes to separate appointment service methods.

### Command Shape

```ts
type SchedulingCommandInput = {
  type:
    | 'place_request'
    | 'create_appointment'
    | 'move_appointment'
    | 'resize_appointment'
    | 'cancel_appointment'
    | 'confirm_appointment';
  idempotencyKey: string;
  sourceSurface: string;
  actor: {
    type: 'owner' | 'staff' | 'client' | 'system';
    id?: string;
  };
  entity: {
    kind: 'appointment' | 'waitlist' | 'slot_hold';
    id?: string;
    expectedVersion?: number | string;
  };
  target?: {
    staffId?: string;
    startAt?: string;
    endAt?: string;
    timezone?: string;
  };
  expectedVersions?: Record<string, number | string>;
  payload: Record<string, unknown>;
};
```

### Expected Entity Versions

Required by command type:

- `place_request`: waitlist version, service version if exposed, staff policy version if exposed.
- `create_appointment`: service version and staff policy version if exposed.
- `move_appointment`: appointment version and target staff policy version.
- `resize_appointment`: appointment version and service/policy version.
- `cancel_appointment`: appointment version.
- `confirm_appointment`: appointment or waitlist version.

### Idempotency Key

Required for every write. The key must be unique per tenant. Payload hash protects against reusing a key for different work.

### Validation Context

The engine loads:

- tenant policy
- service details and buffers
- staff active state and working hours
- client state if relevant
- waitlist or appointment source row
- existing allocations in affected resource/date range
- staff exceptions through allocations
- command ledger state

### Policy Evaluation

Policies return structured decisions:

```ts
type SchedulingPolicyDecision = {
  allowed: boolean;
  code: string;
  severity: 'allow' | 'warning' | 'block';
  messageBg: string;
  facts?: Record<string, unknown>;
};
```

The engine aggregates decisions. Any blocking decision prevents commit and returns structured conflicts.

### Conflict Checking

Conflict checking must happen against `calendar_allocations` and database constraints, not only against `appointments`.

The engine should:

1. Build proposed allocations from display interval, service buffers, staff blocks, and resource requirements.
2. Query existing active allocations for human-readable conflict details.
3. Attempt allocation insert/update inside the transaction.
4. Translate exclusion constraint failure into `STAFF_INTERVAL_CONFLICT` or the matching resource conflict.

### Transaction Lifecycle

```text
receive command
normalize payload
open transaction
upsert/read scheduling_commands row by idempotency_key
if completed with same payload hash, return stored result
if same key different hash, return idempotency conflict
lock primary entity
validate versions
load policy context
evaluate policies
build allocations
write domain rows
write allocations
write scheduling_events
write scheduling_outbox
mark command succeeded
commit
return result
```

Failures:

- Business conflict marks command failed with structured error when useful.
- Serialization/deadlock failures can retry before final response.
- Unknown system failures should not mark a command as successful.

### Output Result Shape

```ts
type SchedulingCommandResult = {
  commandId: string;
  status: 'committed' | 'rejected' | 'idempotent_replay';
  entities: {
    appointment?: { id: string; version: number; startAt: string; endAt: string; staffId: string };
    waitlist?: { id: string; version: number; status: string; bookedAppointmentId?: string | null };
  };
  allocations?: Array<{
    id: string;
    resourceKind: string;
    resourceId: string;
    displayStartAt: string;
    displayEndAt: string;
    occupiedStartAt: string;
    occupiedEndAt: string;
  }>;
  conflicts?: SchedulingConflict[];
  events: Array<{ id: string; sequence: number; type: string }>;
  invalidation: {
    resources: Array<{ kind: string; id: string }>;
    rangeStartAt: string;
    rangeEndAt: string;
  };
};
```

### Events And Outbox Emission

SchedulingEngine writes `scheduling_events` and `scheduling_outbox` inside the transaction. A worker emits realtime messages after commit. It must not emit websocket/SSE directly inside the transaction.

## 7. Scheduling Policy Engine

The policy engine must return structured decisions, not just throw strings.

Policy categories:

- Tenant policy: min advance booking, max advance booking, cancellation rules, tenant active state.
- Service policy: duration, buffers, active/public/admin availability, booking mode, group days/times, slot capacity.
- Staff policy: active state, accepts scheduling mode, working hours, staff exceptions, service eligibility.
- Client policy: blocked client, missing consent where required, no-show rules if product policy later uses them.
- State transition policy: allowed appointment and waitlist state transitions.
- Resource policy: required staff, future room/equipment, resource active state.
- Buffer policy: occupied interval expansion and buffer conflict handling.
- Group capacity policy: same-session matching, participant capacity, capacity row locking.
- Concurrency policy: version checks, idempotency, lock acquisition, retry decisions.

Decision example:

```json
{
  "allowed": false,
  "code": "OUTSIDE_WORKING_HOURS",
  "severity": "block",
  "messageBg": "Избраният час е извън работното време на специалиста.",
  "facts": {
    "staffId": "staff-id",
    "workStart": "2026-05-11T06:00:00.000Z",
    "workEnd": "2026-05-11T15:00:00.000Z"
  }
}
```

## 8. Conflict Response Architecture

All scheduling conflicts should return a structured object.

```ts
type SchedulingConflict = {
  code: string;
  messageBg: string;
  requestedInterval?: {
    displayStartAt: string;
    displayEndAt: string;
    occupiedStartAt?: string;
    occupiedEndAt?: string;
  };
  occupiedInterval?: {
    displayStartAt?: string;
    displayEndAt?: string;
    occupiedStartAt: string;
    occupiedEndAt: string;
  };
  conflictingEntities?: Array<{
    kind: 'appointment' | 'staff_exception' | 'allocation' | 'waitlist' | 'service' | 'staff';
    id: string;
    label?: string;
  }>;
  reason: string;
  suggestions?: Array<{
    staffId?: string;
    startAt: string;
    endAt: string;
    labelBg?: string;
  }>;
  refresh?: {
    calendarBoard: boolean;
    waitlist: boolean;
    appointmentContext?: boolean;
  };
};
```

Examples:

```json
{
  "code": "STAFF_INTERVAL_CONFLICT",
  "messageBg": "Този час вече е зает.",
  "requestedInterval": {
    "displayStartAt": "2026-05-11T07:00:00.000Z",
    "displayEndAt": "2026-05-11T08:00:00.000Z",
    "occupiedStartAt": "2026-05-11T06:50:00.000Z",
    "occupiedEndAt": "2026-05-11T08:10:00.000Z"
  },
  "occupiedInterval": {
    "occupiedStartAt": "2026-05-11T07:30:00.000Z",
    "occupiedEndAt": "2026-05-11T08:15:00.000Z"
  },
  "conflictingEntities": [{ "kind": "appointment", "id": "appointment-id" }],
  "reason": "active exclusive staff allocation overlaps requested occupied interval",
  "refresh": { "calendarBoard": true, "waitlist": true }
}
```

```json
{
  "code": "OUTSIDE_WORKING_HOURS",
  "messageBg": "Избраният час е извън работното време на специалиста.",
  "requestedInterval": {
    "displayStartAt": "2026-05-11T05:30:00.000Z",
    "displayEndAt": "2026-05-11T06:30:00.000Z"
  },
  "conflictingEntities": [{ "kind": "staff", "id": "staff-id" }],
  "reason": "requested display interval is outside staff working hours"
}
```

```json
{
  "code": "STAFF_BLOCKED",
  "messageBg": "Избраният час попада в блокиран интервал.",
  "occupiedInterval": {
    "occupiedStartAt": "2026-05-11T07:00:00.000Z",
    "occupiedEndAt": "2026-05-11T08:00:00.000Z"
  },
  "conflictingEntities": [{ "kind": "staff_exception", "id": "block-id", "label": "Blocked time" }],
  "reason": "staff block allocation overlaps requested interval"
}
```

```json
{
  "code": "REQUEST_ALREADY_HANDLED",
  "messageBg": "Заявката вече е обработена.",
  "conflictingEntities": [{ "kind": "waitlist", "id": "waitlist-id" }],
  "reason": "waitlist status is not waiting or notified",
  "refresh": { "calendarBoard": true, "waitlist": true }
}
```

```json
{
  "code": "STALE_ENTITY_VERSION",
  "messageBg": "Данните са обновени от друг екран. Прегледайте часа отново.",
  "conflictingEntities": [{ "kind": "appointment", "id": "appointment-id" }],
  "reason": "expected appointment version does not match current version",
  "refresh": { "calendarBoard": true, "waitlist": false, "appointmentContext": true }
}
```

```json
{
  "code": "GROUP_CAPACITY_FULL",
  "messageBg": "Няма свободни места за тази групова услуга.",
  "requestedInterval": {
    "displayStartAt": "2026-05-11T16:00:00.000Z",
    "displayEndAt": "2026-05-11T17:00:00.000Z"
  },
  "conflictingEntities": [{ "kind": "service", "id": "service-id" }],
  "reason": "same session participant count reached slot_capacity"
}
```

```json
{
  "code": "BUFFER_CONFLICT",
  "messageBg": "Часът се застъпва с нужното буферно време около друг запис.",
  "requestedInterval": {
    "displayStartAt": "2026-05-11T08:00:00.000Z",
    "displayEndAt": "2026-05-11T09:00:00.000Z",
    "occupiedStartAt": "2026-05-11T07:50:00.000Z",
    "occupiedEndAt": "2026-05-11T09:10:00.000Z"
  },
  "occupiedInterval": {
    "occupiedStartAt": "2026-05-11T09:00:00.000Z",
    "occupiedEndAt": "2026-05-11T09:15:00.000Z"
  },
  "reason": "occupied intervals overlap even though visible appointment times look adjacent"
}
```

## 9. Slot Lifecycle State Machine

Frontend/backend lifecycle:

1. `visible`: Slot is drawn from current projections. Frontend may show it as available-looking. It must not assume availability.
2. `hover_candidate`: Pointer/tap preview over a staff/time cell. Frontend may show a candidate outline. It must not reserve anything.
3. `selected`: User selected a slot. Frontend may lock the outline. It must not mutate canonical appointment/waitlist cache.
4. `previewed`: Frontend shows command preview and local conflict hints. It must still say not committed.
5. `server_revalidating`: Command has been submitted. Frontend may disable the save button and show progress.
6. `valid`: Server validated within transaction but has not necessarily committed. This state should remain backend-internal.
7. `stale`: Backend detected version mismatch or changed entity state. Frontend must refetch.
8. `conflict`: Backend rejected command with structured conflict. Frontend must show conflict and clear or keep selected preview only as an editable proposal.
9. `committing`: Backend is writing domain rows, allocations, events, and outbox in one transaction. Frontend must not display committed state until success response.
10. `committed`: Backend returned committed entities and invalidation metadata. Frontend may update from response and refetch.
11. `failed`: Network/system error. Frontend must not assume commit status unless idempotent retry returns stored result.

The frontend may display intent at every pre-commit state. It must never display pre-commit intent as saved state.

## 10. Optimistic UI And Authoritative State Contract

Frontend may optimistically show:

- hover outline
- selected slot outline
- preview panel
- saving state
- temporary disabled controls
- a pending visual indicator clearly marked as not saved

Frontend must never write into canonical cache as truth before backend success:

- new appointment block
- moved appointment coordinates
- waitlist status `booked`
- removed Action Inbox item
- updated entity version

Backend success replaces optimistic state:

- Use returned appointment/waitlist ids and versions.
- Refetch affected `appointments-calendar-board` range.
- Refetch `appointments-waitlist`.
- Invalidate `appointment-context` when appointment detail may be stale.
- Preserve selected appointment when response returns an appointment id.

Backend conflict clears or reverts optimistic UI:

- Remove pending committed-looking blocks.
- Keep selected slot only if useful for retry or suggestions.
- Show `messageBg` from structured conflict.
- Refetch affected projections.

React Query behavior:

- Calendar board queries should invalidate by range-aware key.
- Waitlist query invalidates after placement success, handled-request conflict, or stale waitlist version.
- Appointment context invalidates when an appointment was created, moved, resized, cancelled, or status-changed.
- Sample mode must not write and should not invalidate real backend queries because no backend data changed.

Selected slot preservation:

- Preserve after `STAFF_INTERVAL_CONFLICT` if suggestions are shown and user can choose another slot.
- Preserve after `OUTSIDE_WORKING_HOURS` only as an editable preview.
- Clear after `REQUEST_ALREADY_HANDLED` because the demand item is no longer actionable.
- Clear after successful commit once the returned appointment is selected.

## 11. Idempotency And Command Ledger

`scheduling_commands` must provide durable idempotency.

Rules:

- Unique key: `(tenant, idempotency_key)`.
- Store `payload_hash`.
- Store `status`: `pending`, `running`, `succeeded`, `failed`, `expired`.
- Store `result` for successful commands.
- Store structured `error` for rejected commands where replay should be stable.
- Repeated command with same key and same payload hash:
  - `succeeded`: return stored success.
  - `running`: return `409 COMMAND_IN_PROGRESS` or wait briefly, then return result if completed.
  - `failed` business conflict: return stored conflict if the conflict is deterministic for that payload.
- Repeated command with same key and different payload hash: return `409 IDEMPOTENCY_KEY_REUSED`.

Double-click handling:

- UI sends the same idempotency key for the same confirm action.
- First click runs.
- Second click returns stored success or command-in-progress.

Mobile retry handling:

- Mobile can retry after network loss with the same key.
- If the backend committed but the response was lost, retry returns stored success.
- If the backend never committed, retry executes normally.

Repeated command returns stored success vs conflict:

- Same payload after commit returns stored success.
- Same key with changed target returns idempotency conflict.
- Different key after the waitlist was booked returns `REQUEST_ALREADY_HANDLED`, not stored success.

Smallest acceptable first version:

- Add `scheduling_commands` with `idempotency_key`, `payload_hash`, `status`, `result`, `error`, timestamps.
- Use it only for `place_request`.
- Store command rows inside the same transaction as waitlist placement.
- Keep waitlist row `FOR UPDATE`.
- Defer generalized command types until SchedulingEngine phase.

This is better than the current metadata-only idempotency key because it can return a prior success after a lost response.

## 12. Transactional Outbox And Realtime Invalidation

### `scheduling_events`

Events are immutable facts:

- `appointment.created`
- `appointment.moved`
- `appointment.resized`
- `appointment.cancelled`
- `appointment.confirmed`
- `waitlist.placed`
- `staff_block.created`
- `allocation.created`
- `allocation.released`

Each event includes:

- tenant identifier
- monotonic tenant sequence
- source command id
- affected entity ids
- affected resources
- affected date/range
- payload needed by projections

### `scheduling_outbox`

Outbox rows are delivery tasks derived from events:

- websocket/SSE invalidation
- background projection rebuild
- notification workflow trigger when policy allows

Do not emit websocket events inside transactions directly because:

- the transaction can roll back after emitting;
- clients could refetch before commit is visible;
- network calls keep locks open longer;
- failed websocket delivery should not roll back scheduling data.

### Websocket/SSE Event Model

Message shape:

```json
{
  "tenant": "tenant_demo_business",
  "sequence": 12345,
  "eventType": "appointment.created",
  "affectedResources": [{ "kind": "staff", "id": "staff-id" }],
  "rangeStartAt": "2026-05-11T06:50:00.000Z",
  "rangeEndAt": "2026-05-11T08:10:00.000Z",
  "entities": {
    "appointmentIds": ["appointment-id"],
    "waitlistIds": ["waitlist-id"]
  }
}
```

Tenant subscription:

- Admin clients subscribe by tenant.
- Server enforces tenant auth before subscription.
- Messages do not leak other tenant resource ids.

Sequence numbers:

- Every tenant event has a monotonically increasing sequence.
- Client stores last seen sequence.
- On reconnect, client asks for events after last sequence or refetches projections if too old.

Projection invalidation:

- Calendar board refetches when affected range intersects visible range or affected resource is visible.
- Waitlist refetches when event includes waitlist ids or demand state changes.
- Appointment context refetches when selected appointment id is affected.

## 13. Frontend Calendar V2 Interaction Contract

Placement save:

- Enabled only in real-data mode behind `NEXT_PUBLIC_ENABLE_CALENDAR_V2_PLACEMENT_SAVE`.
- Sends one scheduling command path.
- Shows preview as not saved until success.
- Uses backend conflict objects, not string matching.

Future drag-to-move:

- Must submit `move_appointment` to SchedulingEngine.
- Must include appointment expected version.
- May show local movement only as pending, never as committed.
- Must revert on conflict.

Future resize:

- Must submit `resize_appointment`.
- Must recalculate occupied interval with buffers server-side.
- Must reject stale version and conflicts.

Future mobile tap-to-place:

- Must use the same `place_request` command.
- No mobile drag/drop is required for first production editing.
- Retried mobile commands must reuse idempotency keys.

Sample mode:

- No backend reads or writes for sample records.
- No invalidation of real data.
- Save remains disabled.

Flag-off mode:

- Real data can render.
- Preview can exist.
- No write endpoint should be called.

Real mode:

- Reads current backend projections.
- Writes only through SchedulingEngine-backed command endpoints.

Hover vs selected slot:

- Hover is ephemeral.
- Selected slot is user intent.
- Neither is committed.

Disabled, preview, committed copy:

- Disabled: "Записването ще добавим в следващата стъпка" or mode-specific copy.
- Preview: "Часът още не е записан."
- Committed: "Часът е записан." only after backend success.

Conflict UX:

- Show `messageBg`.
- Avoid exposing internal command ids.
- Keep actionable next step: choose another slot, refresh, or open updated appointment.

Stale-state UX:

- Use clear Bulgarian copy: "Данните са обновени от друг екран. Прегледайте часа отново."
- Refetch board/waitlist.
- Keep selected request only if it is still actionable after refetch.

## 14. Production Rollout Strategy

### Phase 0: Current State

Goal: Preserve existing Calendar V2 preview and current `/admin` default behavior.

Files likely touched: None for this phase.

Risk: Current write paths still include check-then-insert behavior and no DB overlap constraint.

Tests: Existing backend waitlist placement tests and frontend regression checks where already runnable.

Rollback: Keep Calendar V2 placement-save flag off.

Feature flag: `NEXT_PUBLIC_ENABLE_CALENDAR_V2_PLACEMENT_SAVE`.

### Phase 1: Allocation/Overlap Foundation

Goal: Add `calendar_allocations`, backfill existing appointments and staff exceptions, and add DB-level exclusive overlap protection.

Files likely touched:

- `backend/prisma/migrations/...`
- `backend/src/common/prisma/tenant-prisma.service.ts`
- new backend scheduling/allocation service files
- backend tests for migration/backfill/allocation insert

Risk: Existing data may contain overlaps that prevent constraint validation. Buffers may reveal hidden overlaps.

Tests: Backfill tests, overlap exclusion tests, adjacent interval tests, buffer overlap tests, staff block allocation tests.

Rollback: Deploy table/backfill first without validated constraint; only validate constraint after data report is clean.

Feature flag: Backend write paths continue to use existing behavior until allocation write flag is enabled.

Implemented May 15 foundation slice:

- Added tenant-local `calendar_allocations` plus resource/source/status indexes and active-exclusive GiST overlap protection.
- Added startup compatibility so already-existing tenant schemas receive the allocation infrastructure on backend boot instead of depending only on fresh bootstrap SQL or first use of the waitlist placement endpoint.
- Moved standard waitlist placement onto appointment + allocation writes inside the existing tenant transaction.
- Added buffer-aware occupied intervals and transition-safe legacy appointment checks.
- Deferred destructive backfill, staff-exception allocation projection, generic create/reschedule migration, and `group_session` modeling. Backfill remains required before allocation-only enforcement can become global.

### Phase 2: Move Waitlist Placement Onto SchedulingEngine

Goal: Make current waitlist placement endpoint call the unified SchedulingEngine and write allocations.

Files likely touched:

- `backend/src/modules/appointments/appointments.service.ts`
- `backend/src/modules/appointments/appointments.controller.ts` only if DTO/result changes are required
- new `backend/src/modules/scheduling/...`
- `backend/test/appointments.service.waitlist-placement.spec.ts`
- new scheduling engine tests

Risk: Response shape changes can affect Calendar V2 placement save.

Tests: Existing placement tests plus same-slot race, same-waitlist race, idempotent retry, allocation insert, exclusion constraint conflict mapping.

Rollback: Keep endpoint path stable; disable frontend placement-save flag if needed.

Feature flag: Backend can route endpoint to old implementation until engine path is enabled.

### Phase 3: Structured Conflicts

Goal: Return machine-readable scheduling conflicts with Bulgarian user-safe messages.

Files likely touched:

- scheduling conflict types
- Nest exception filter or response helpers
- `CalendarV2RealDataAdapter` error mapping later
- backend tests

Risk: Existing frontend currently maps strings from Axios errors.

Tests: Conflict response snapshots for staff conflict, blocked interval, outside hours, already handled, stale version, group full, buffer conflict.

Rollback: Include `message` string alongside structured `conflicts` during transition.

Feature flag: None required if backward-compatible `message` remains.

### Phase 4: Frontend Conflict UX

Goal: Calendar V2 consumes structured conflicts and handles preview, selected slot, refetch, and retry UX correctly.

Files likely touched:

- `frontend/src/components/admin/calendar-v2/real-data/CalendarV2RealDataAdapter.tsx`
- `frontend/src/components/admin/calendar-v2/native-scheduler-spike/NativeSchedulerV2Spike.tsx`
- `frontend/src/components/admin/calendar-v2/native-scheduler-spike/NativeSchedulerPlacementPreview.tsx`
- command/conflict types under `frontend/src/components/admin/calendar-v2/`

Risk: Conflicts could look committed if local state is not cleared.

Tests: Frontend conflict message mapping, no-write sample mode, flag-off no-write, conflict refetch behavior.

Rollback: Disable placement-save flag.

Feature flag: Keep using `NEXT_PUBLIC_ENABLE_CALENDAR_V2_PLACEMENT_SAVE`.

### Phase 5: Command Ledger/Idempotency

Goal: Add durable command replay for waitlist placement, then require idempotency for all scheduling commands.

Files likely touched:

- migration for `scheduling_commands`
- SchedulingEngine transaction lifecycle
- waitlist placement DTO/command mapping
- backend tests

Risk: Incorrect payload hash handling can reject legitimate retries or replay unsafe results.

Tests: double-click, mobile retry after lost response, same key different payload, command-in-progress, stored success replay.

Rollback: Keep ledger writes passive first, then enforce after verification.

Feature flag: Backend enforcement flag during rollout.

### Phase 6: Outbox/Realtime

Goal: Add scheduling events, transactional outbox, and realtime invalidation.

Files likely touched:

- migrations for `scheduling_events` and `scheduling_outbox`
- outbox worker
- websocket/SSE gateway
- frontend subscription/invalidation code

Risk: Realtime fanout can create noisy refetch loops.

Tests: outbox emission after commit, no emit on rollback, reconnect recovery by sequence, tenant isolation.

Rollback: Disable realtime subscribers; keep polling.

Feature flag: Realtime invalidation flag per environment.

### Phase 7: Drag/Move

Goal: Enable production Calendar V2 appointment movement through SchedulingEngine.

Files likely touched:

- `frontend/src/components/admin/calendar-v2/native-scheduler-spike/NativeSchedulerV2Spike.tsx`
- `frontend/src/components/admin/calendar-v2/commands.ts`
- SchedulingEngine move handler
- backend tests

Risk: Drag creates high-frequency user intent and exposes stale/conflict paths often.

Tests: move into conflict, move outside hours, move over block, stale version, revert UI on conflict, same-slot race.

Rollback: Disable Calendar V2 move flag.

Feature flag: Separate move flag, not the placement-save flag.

### Phase 8: Resize/Week/Mobile Editing/Smart Scheduling

Goal: Expand editing once allocation correctness, command ledger, and structured conflicts are stable.

Files likely touched:

- frontend scheduler interaction components
- SchedulingEngine resize/create/suggestion handlers
- projection/read models
- performance optimizations

Risk: Week view and mobile editing multiply state, range, and stale-conflict cases.

Tests: resize conflict, week range invalidation, mobile retry, smart suggestions under stale data, DST/timezone coverage.

Rollback: Per-feature flags.

Feature flag: Separate flags for resize, week editing, mobile editing, smart suggestions.

## 15. Testing Matrix

Backend unit tests:

- policy decisions return structured objects
- interval overlap uses `[start, end)` semantics
- buffer interval expansion
- command payload hash
- conflict object mapping

Backend integration tests:

- waitlist placement through SchedulingEngine
- create appointment through SchedulingEngine
- move appointment through SchedulingEngine
- cancel releases allocations
- staff block creates allocation

Transaction/concurrency tests:

- same slot race with two concurrent commands
- same waitlist race
- exclusion constraint violation maps to structured conflict
- deadlock/serialization retry behavior
- command ledger replay after lost response

Specific scheduling cases:

- move into conflict
- buffer overlap where visible intervals are adjacent
- blocked time conflict
- outside working hours
- group capacity race
- stale appointment version
- stale waitlist version
- idempotent retry with same payload
- idempotency key reused with different payload
- outbox emission only after commit
- rollback emits no outbox row
- timezone conversion for Europe/Sofia
- DST boundary days for Europe/Sofia

Frontend tests/checks:

- sample mode performs no writes
- flag-off mode performs no writes
- placement save calls only SchedulingEngine-backed placement path
- backend success replaces preview state
- backend conflict clears/reverts optimistic UI
- selected slot preservation rules
- Bulgarian conflict message mapping
- React Query invalidation for board, waitlist, and context
- no canonical cache mutation before success

## 16. Performance And Scalability

Scheduling query cost:

- Commit-time conflict queries should hit `calendar_allocations` by resource and occupied range.
- Suggestion search can read projections and allocations outside the write transaction.
- Do not query all appointments for a tenant when only a date range and resource set are needed.

Allocation index strategy:

- GiST exclusion constraint on `(resource_kind, resource_id, tstzrange(occupied_start_at, occupied_end_at, '[)'))` for active exclusive allocations.
- Btree index on `(source_kind, source_id)` for lookup by appointment, waitlist, staff exception, or hold.
- Range query support for affected date ranges.
- Partial indexes for `status = 'active'`.

Exclusion constraint performance:

- GiST constraints add insert/update cost. The cost is acceptable because scheduling writes are lower volume than reads.
- Backfill must batch and report conflicts before validating the constraint.
- Keep allocation rows narrow; store large details in events or source tables.

Projection caching:

- Calendar board projections can cache by tenant, visible date range, and event sequence watermark.
- Invalidate by affected resource/date range from scheduling events.
- Keep polling fallback until realtime recovery is proven.

Calendar-board query performance:

- Current board reads appointments by `start_at` range and exceptions by overlap range.
- With allocations, board reads should prefer allocations for occupied ranges, then join source appointment details.
- For week view, fetch only visible resources and dates.

Realtime invalidation fanout:

- Publish one event per committed command, not one event per client.
- Clients decide whether visible range intersects affected range.
- Coalesce bursts by tenant/range where possible.

Large salons:

- Resource count drives calendar grid width and allocation query volume.
- Use resource filtering, staff grouping, and virtualization thresholds.
- Avoid sending all waitlist demand when only active actionable demand is needed.

Week view explosion:

- A 7-day view multiplies staff columns and event density.
- Use range-based pagination or per-day resource windows.
- Do not run suggestion search for every visible empty cell.

Rendering virtualization thresholds:

- Virtualize when staff columns exceed the visible layout capacity or appointment count is high.
- Keep hover and drag state local and minimal.
- Do not re-render all blocks on pointer move.

Hover/drag state performance:

- Hover candidates should not write React Query cache.
- Pointer movement should compute target from geometry and resource list, not refetch.
- Server validation happens on confirm/drop, not during every hover.

iPad/low-end browser risks:

- Pointer events, scroll containers, and sticky headers are sensitive on iPad.
- Keep production mobile editing tap-based before mobile drag/drop.
- Avoid large DOM grids for week view without virtualization.

## 17. Dangerous Traps

- UI-first scheduler trap: making the visible grid the source of truth.
- Check-then-insert race: checking appointments, then inserting without DB protection.
- Fake optimistic committed state: showing a booking as saved before backend commit.
- Hidden buffer debt: storing buffers on services but not blocking occupied intervals with them.
- Drag/drop before backend authority: enabling movement before allocations and conflicts are authoritative.
- Notifications inside scheduling transaction: external side effects before commit or while locks are held.
- Mixing visit progress with scheduling state: checked-in/in-service is not the same as scheduled/moved/cancelled.
- Group services modeled as normal overlaps: group capacity needs session capacity logic, not ordinary exclusive overlap.
- Silent conflict failures: string-only errors prevent deterministic UI recovery.
- Overbuilding realtime before DB correctness: fast invalidation does not fix impossible overlapping data.

## 18. Final Recommendation

Smallest production-safe architecture:

1. Add `calendar_allocations` with display and occupied intervals.
2. Backfill active appointments and staff exceptions.
3. Add PostgreSQL exclusion protection for active exclusive resource overlaps.
4. Route waitlist placement through a SchedulingEngine transaction that writes appointment, waitlist state, allocation, command record, and structured result.
5. Keep Calendar V2 preview and save flag behavior conservative until the engine is proven.

What must be built now:

- Canonical allocation/occupied-interval foundation.
- DB-level overlap protection for active exclusive allocations.
- Buffer-aware occupied intervals.
- Structured conflict mapping from allocation conflicts.
- Tests for same-slot race and buffer overlap.

What can wait:

- Full command ledger for every command type.
- Realtime websocket/SSE invalidation.
- Slot holds.
- Future rooms/equipment source tables.
- Week view editing.
- Mobile editing.
- Smart scheduling.

What should not be built yet:

- Production drag-to-move in Calendar V2.
- Production resize in Calendar V2.
- Recurring bookings.
- Visit-progress workflows in Calendar V2.
- Notification sends inside scheduling commits.
- Realtime before database correctness.

Recommended next implementation prompt:

```text
You are working on the SalonIQ repository.
Read and follow the root AGENTS.md before doing anything else.
Work directly on main.

Implement Phase 1 from docs/calendar-v2-authoritative-scheduling-architecture.md: canonical calendar allocation and occupied-interval foundation.

Constraints:
- Do not change frontend UI.
- Do not enable new Calendar V2 write behavior.
- Do not change tenant resolution, secrets, env files, deployment config, or package dependencies.
- Keep the current /admin calendar behavior unchanged.
- Add only the backend/schema foundation needed for authoritative scheduling.

Goal:
- Add a tenant-scoped calendar_allocations table with display_start/display_end and occupied_start/occupied_end.
- Represent active appointments and staff exceptions as active allocations.
- Use half-open [start, end) interval semantics.
- Include service buffer_before_min and buffer_after_min in occupied appointment intervals.
- Add PostgreSQL DB-level overlap protection for active exclusive allocations on the same resource.
- Provide a safe backfill/validation path for existing tenant data before validating the constraint.
- Add targeted backend tests for adjacent intervals, overlapping intervals, buffer overlap, staff block overlap, and same-slot race protection.

Inspect first:
- docs/calendar-v2-authoritative-scheduling-architecture.md
- backend/prisma/migrations/001_init.sql
- backend/src/common/prisma/tenant-prisma.service.ts
- backend/src/modules/appointments/appointments.service.ts
- backend/test/appointments.service.waitlist-placement.spec.ts

Validation:
- Run targeted backend tests for the new allocation foundation.
- Run git diff --check.
- Do not run next lint.
- Do not run heavy frontend builds.

Expected final response:
- Commit SHA
- Files changed
- Tests run
- Confirmation no runtime Calendar V2 UI behavior changed
- Confirmation no frontend UI, tenant resolution, secrets, env, deployment config, or packages changed
```

Justification: SchedulingEngine skeleton work without allocation constraints would preserve the current core risk: application-level check-then-write can still race. The next narrow implementation should establish the canonical occupied-interval table and database overlap protection first, then move waitlist placement onto that foundation.
