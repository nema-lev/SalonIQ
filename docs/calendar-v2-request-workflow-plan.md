# Calendar V2 Request Workflow Implementation Plan

This document is a living implementation blueprint. It records the current repo behavior and the staged Calendar V2 request workflow. As of the frontend placement-save step, the server has a dedicated waitlist placement endpoint and Calendar V2 can call it only when `NEXT_PUBLIC_ENABLE_CALENDAR_V2_PLACEMENT_SAVE === "true"` in real-data mode. As of 2026-05-16, `/admin` renders Calendar V2 by default and the legacy calendar is fallback-only at `/admin/calendar-legacy`.

## 1. Executive Decision

The next truly valuable Calendar V2 workflow should be:

1. Show actionable demand in the Calendar V2 Action Inbox.
2. Let the owner review an untimed request, including service, client, preferred date or window, staff preference, and notes.
3. Let the owner choose a slot from suggested slots or a calendar slot.
4. Confirm placement through a lightweight confirmation step.
5. Persist the placement through a dedicated backend path that validates conflicts, staff working hours, blocked time, tenant scope, and request state in one server-side transaction.
6. Refresh the calendar and waitlist only after the server accepts the write.
7. Notify the client only when the notification behavior is explicitly selected and designed.

This workflow matches the high-value salon planning habit: evening or morning review of tomorrow's bookings, waiting demand, requests without exact time, pending confirmations, and cancellation gaps that can be filled.

Calendar V2 should explicitly deprioritize these workflows for the first write feature:

- Day-of visit progress: arrived, in-service, completed, no-show.
- Mobile drag/drop.
- Full appointment editing.
- Recurring appointments.
- Drag-to-move existing appointments as the first persisted write feature.

The correct first write surface is request-to-slot placement, not visit tracking and not generic appointment movement.

May 8 local-only UX note: the current Calendar V2 preview now supports the intended request-to-slot placement review without persistence. The UI keeps the active Action Inbox request selected, shows a local placement block and a human Bulgarian preview, hides internal command ids/timestamps from visible UI, and switches the lower right rail to placement context instead of unrelated booking details. Saving remains disabled in the frontend.

May 8 backend foundation note: `POST /api/v1/appointments/waitlist/:waitlistId/place` now exists for authenticated admin use. It validates and places an open waitlist/request item in one tenant transaction, and client notifications are intentionally not sent by this endpoint.

May 9 frontend flag note: Calendar V2 placement preview remains local-only by default. The preview save button is enabled only when `NEXT_PUBLIC_ENABLE_CALENDAR_V2_PLACEMENT_SAVE === "true"` and the page is using real data. Sample mode remains non-writing and shows `Sample режимът не записва часове.` The save call sends `notifyClient: false`, refreshes backend-backed calendar and waitlist data after success, and does not call appointment create/status/cancel/reschedule or notification endpoints.

May 15 backend allocation-foundation note: standard waitlist placement now writes one booked staff `calendar_allocations` row in the same tenant transaction as appointment creation and waitlist booking. The allocation stores the visible display interval separately from the buffer-expanded occupied interval, uses half-open overlap semantics, and is protected by a tenant-local active-exclusive PostgreSQL exclusion constraint. Existing appointments are not backfilled in this step, so the placement flow also keeps a buffer-aware legacy appointment conflict query during the transition. Group waitlist placement remains on its existing capacity path until the future single `group_session` allocation model is implemented.

May 15 deployment hardening note: changing `001_init.sql` alone is not enough for tenant schemas that already exist in a deployed database. Backend startup now enumerates existing tenant schemas and runs the idempotent allocation ensure path for each one, so existing tenants receive `btree_gist`, `calendar_allocations`, its indexes, and the active-exclusive exclusion constraint on the next backend boot without a destructive appointment backfill.

May 15 standard-lifecycle parity note: standard exact-time `POST /appointments` and `POST /appointments/admin` now create appointment + staff allocation together in one tenant transaction, using `held` for pending appointments and `booked` for confirmed appointments. Standard status transitions now promote held allocations on confirmation and make cancelled/completed/no-show allocations non-active. Standard reschedule now updates appointment + allocation atomically, keeps the legacy fallback check during transition, and creates a missing allocation when a legacy appointment is safely rescheduled. Group-service behavior remains unchanged and no standard exclusive participant allocation is created for group services.

May 15 current-calendar routing note: the production `/admin` request placement flow now calls `POST /appointments/waitlist/:waitlistId/place` with `notifyClient: false` instead of performing a separate appointment create followed by a separate waitlist-booked patch. The dedicated endpoint remains silent, backfill is still pending, and allocation-only authority is still deferred.

May 16 primary-route note: Calendar V2 is now the primary admin calendar direction. `/admin` renders Calendar V2 in real-data mode, `/admin/calendar-v2` remains an alias, and `/admin/calendar-legacy` preserves the old calendar only for emergency comparison/debugging. This promotion does not add new writes, does not change request placement save behavior, and does not alter backend/schema/deployment state.

Current intentional limitations remain: no persisted drag-to-move, no resize, no full mobile placement flow, no notifications, no recurring appointments, and no advanced realtime collaboration.

Recommended next tasks after this promotion:

1. Finish the phone-specific Calendar V2 flow instead of expanding the legacy UI.
2. Add persisted move/resize only after the shared scheduling command path and rollback/reconciliation behavior are ready.
3. Keep disabled/coming-next UI states honest until each write has backend support.

## 2. Current Code Inventory

### Calendar V2 route and read-only contract

- `frontend/src/app/(tenant)/admin/page.tsx` renders `CalendarV2RealDataAdapter` as the primary admin calendar route.
- `frontend/src/app/(tenant)/admin/calendar-v2/page.tsx` renders `CalendarV2RealDataAdapter` as an alias route.
- `frontend/src/app/(tenant)/admin/calendar-v2/page.tsx` disables only the alias route when `NEXT_PUBLIC_DISABLE_CALENDAR_V2_PREVIEW === 'true'`.
- `frontend/src/app/(tenant)/admin/calendar-legacy/page.tsx` preserves `AdminCalendarWorkspace` as the legacy fallback route.
- `frontend/src/components/admin/calendar-v2/real-data/CalendarV2RealDataAdapter.tsx:15` defines `CalendarV2RealDataAdapter`.
- `CalendarV2RealDataAdapter` reads current admin calendar data through `useAdminCalendarBoardData(...)` at `frontend/src/components/admin/calendar-v2/real-data/CalendarV2RealDataAdapter.tsx:26`.
- `CalendarV2RealDataAdapter` passes `readOnly` to `NativeSchedulerV2Spike` at `frontend/src/components/admin/calendar-v2/real-data/CalendarV2RealDataAdapter.tsx:170`.
- `frontend/src/components/admin/calendar-v2/real-data/calendar-v2-readonly-actions.ts:3` defines the read-only notice.
- `frontend/src/components/admin/calendar-v2/real-data/calendar-v2-readonly-actions.ts:6` lists disabled Calendar V2 write actions: `moveAppointment`, `placeRequest`, `confirmRequest`, `declineRequest`, `cancelAppointment`, `createAppointment`, and `waitlistPlacement`.
- `frontend/src/components/admin/calendar-v2/real-data/README.md:48` documents the read-only contract: no appointment creation, no move persistence, no waitlist placement, no status transitions, no optimistic persistence, and no backend writes from Calendar V2.
- `frontend/src/components/admin/calendar-v2/real-data/README.md:59` records that the `Пристигнал` UI action was intentionally removed from Calendar V2 and that the salon planning surface should focus on planning, pending approvals, untimed request placement, confirmations, and rescheduling.

### Calendar V2 domain, commands, projections, and Action Inbox

- `frontend/src/components/admin/calendar-v2/domain.ts:6` defines `SchedulingState`, including `unscheduled`, `proposed`, `scheduled`, `rescheduled`, `cancelled`, `completed`, and `no_show`.
- `frontend/src/components/admin/calendar-v2/domain.ts:15` defines `RequestState`, including waitlist states and request/proposal states such as `waiting`, `notified`, `pending`, `requested`, `proposal_pending`, `proposal_sent`, `approved`, `booked`, `declined`, `rejected`, `cancelled`, and `archived`.
- `frontend/src/components/admin/calendar-v2/domain.ts:35` defines `VisitProgress`, but this should remain outside the first Calendar V2 write workflow.
- `frontend/src/components/admin/calendar-v2/domain.ts:94` defines `CalendarV2ProposedTime`.
- `frontend/src/components/admin/calendar-v2/domain.ts:104` defines `CalendarV2ActivityEvent`.
- `frontend/src/components/admin/calendar-v2/domain.ts:129` defines `CalendarV2Appointment`.
- `frontend/src/components/admin/calendar-v2/domain.ts:150` defines `CalendarV2DemandItem`; this is the existing Calendar V2 object that maps correctly to untimed waitlist/request demand.
- `frontend/src/components/admin/calendar-v2/domain.ts:181` defines `CalendarV2CalendarBlock`; blocks represent scheduled appointments or blocked/availability time, not untimed demand.
- `frontend/src/components/admin/calendar-v2/domain.ts:198` defines `CalendarV2ActionItem`.
- `frontend/src/components/admin/calendar-v2/commands.ts:7` defines command types, including `placeRequest`, `confirmRequest`, and `declineRequest`.
- `frontend/src/components/admin/calendar-v2/commands.ts:71` defines `PlaceRequestCommand` with a `target` time/staff and an optional `createAppointmentDraft`.
- `frontend/src/components/admin/calendar-v2/commands.ts:83` defines `ConfirmRequestCommand`.
- `frontend/src/components/admin/calendar-v2/commands.ts:91` defines `DeclineRequestCommand`.
- `frontend/src/components/admin/calendar-v2/projections.ts:102` maps a `WaitlistEntry` to `CalendarV2DemandItem`.
- `frontend/src/components/admin/calendar-v2/projections.ts:123` maps desired date/time to `preferredWindow`.
- `frontend/src/components/admin/calendar-v2/projections.ts:136` maps `last_notified_slot_start_at` to `proposedTime`.
- `frontend/src/components/admin/calendar-v2/projections.ts:160` builds `CalendarV2Projection`.
- `frontend/src/components/admin/calendar-v2/projections.ts:294` keeps waitlist entries unscheduled unless status is `booked` or `cancelled`.
- `frontend/src/components/admin/calendar-v2/projections.ts:307` maps waitlist `waiting` and `notified` to `requires_action`.
- `frontend/src/components/admin/calendar-v2/action-inbox.ts:72` builds Action Inbox items from waitlist, appointments, and optional notifications.
- `frontend/src/components/admin/calendar-v2/action-inbox.ts:115` maps a waitlist entry to a `needs_scheduling` Action Inbox item.
- `frontend/src/components/admin/calendar-v2/action-inbox.ts:128` gives open waitlist entries a primary `placeRequest` action.
- `frontend/src/components/admin/calendar-v2/action-inbox.ts:155` maps timed appointment request states to `needs_approval`.
- `frontend/src/components/admin/calendar-v2/action-inbox.ts:192` maps conservative client-cancellation recovery to `needs_recovery`.
- `frontend/src/components/admin/calendar-v2/action-inbox.ts:245` can map notification failures into `needs_reply` when notification entries are supplied.

### Calendar V2 native scheduler spike

- `frontend/src/components/admin/calendar-v2/native-scheduler-spike/NativeSchedulerV2Spike.tsx:80` accepts `demandItems`, `actionItems`, and `readOnly`.
- `NativeSchedulerV2Spike` blocks drops when `readOnly` is true at `frontend/src/components/admin/calendar-v2/native-scheduler-spike/NativeSchedulerV2Spike.tsx:200`.
- `NativeSchedulerV2Spike` can create a local `placeRequest` command on demand-item drop at `frontend/src/components/admin/calendar-v2/native-scheduler-spike/NativeSchedulerV2Spike.tsx:212`.
- It opens `NativeSchedulerPlacementPreview` instead of writing data at `frontend/src/components/admin/calendar-v2/native-scheduler-spike/NativeSchedulerV2Spike.tsx:219`.
- `frontend/src/components/admin/calendar-v2/native-scheduler-spike/native-scheduler-drag.ts:33` creates the local `PlaceRequestCommand`.
- The local command contains demand item id, target staff/start/end, timezone, idempotency key, and draft appointment data at `frontend/src/components/admin/calendar-v2/native-scheduler-spike/native-scheduler-drag.ts:42`.
- `frontend/src/components/admin/calendar-v2/native-scheduler-spike/NativeSchedulerPlacementPreview.tsx:33` explicitly states that no appointment API is called by the preview.
- `frontend/src/components/admin/calendar-v2/native-scheduler-spike/NativeSchedulerActionInboxMock.tsx:18` renders the Action Inbox panel.
- `NativeSchedulerActionInboxMock` hides demand drag controls in read-only mode at `frontend/src/components/admin/calendar-v2/native-scheduler-spike/NativeSchedulerActionInboxMock.tsx:78`.
- `frontend/src/components/admin/calendar-v2/native-scheduler-spike/NATIVE_SCHEDULER_SPIKE_NOTES.md:219` records command-shape coverage for `placeRequest`.

### Shared current-calendar read path

- `frontend/src/components/admin/use-admin-calendar-board-data.ts:20` defines `useAdminCalendarBoardData`.
- It reads `GET /appointments/calendar-board` with query key `['appointments-calendar-board', rangeStartIso, rangeEndExclusiveIso]` at `frontend/src/components/admin/use-admin-calendar-board-data.ts:28`.
- It reads `GET /appointments/waitlist` with query key `['appointments-waitlist']` at `frontend/src/components/admin/use-admin-calendar-board-data.ts:41`.
- It reads `GET /services/admin` with query key `['admin-calendar-services']` at `frontend/src/components/admin/use-admin-calendar-board-data.ts:50`.
- Calendar board and waitlist refetch on window focus and interval: 10 seconds for board, 15 seconds for waitlist.

### Current admin calendar request and waitlist flows

- `frontend/src/components/admin/calendar-model.ts:76` defines `WaitlistEntry` with status `'waiting' | 'notified' | 'booked' | 'cancelled'`, desired date/window, notification fields, notes, booked appointment id, client, service, and optional staff.
- `frontend/src/components/admin/calendar-model.ts:153` defines request owner states: `pending`, `requested`, `proposal_pending`, and `proposal_sent`.
- `frontend/src/components/admin/calendar-model.ts:495` defines `getRequestWindowLabel`.
- `frontend/src/components/admin/calendar-model.ts:511` defines waitlist status labels.
- `frontend/src/components/admin/admin-calendar-workspace.tsx:191` filters active waitlist entries to `waiting` and `notified`.
- `frontend/src/components/admin/admin-calendar-workspace.tsx:195` filters pending timed appointments with `isRequestOwnerState`.
- `frontend/src/components/admin/admin-calendar-workspace.tsx:321` defines `invalidateCalendar`, which refetches the board and invalidates `appointments-calendar-board`, `appointments-waitlist`, and `appointment-context`.
- `frontend/src/components/admin/admin-calendar-workspace.tsx:328` patches `/appointments/:id/status`.
- `frontend/src/components/admin/admin-calendar-workspace.tsx:341` patches `/appointments/:id/reschedule`.
- `frontend/src/components/admin/admin-calendar-workspace.tsx` remains available through `/admin/calendar-legacy` and still patches `/appointments/waitlist/:id/status` for archive/cancel handling only.
- `frontend/src/components/admin/admin-calendar-workspace.tsx` places a waitlist request by calling `POST /appointments/waitlist/:waitlistId/place` with `staffId`, `startAt`, `durationMinutes`, `idempotencyKey`, and `notifyClient: false`.
- The old current-calendar placement-only sequence of `POST /appointments/admin` followed by `PATCH /appointments/waitlist/:id/status` has been removed; appointment creation and waitlist booking now happen in one backend transaction.
- `frontend/src/components/admin/admin-calendar-workspace.tsx:401` performs client-side placement checks for staff working hours, blocked time, and appointment overlap.
- `frontend/src/components/admin/admin-calendar-workspace.tsx` writes both request drop placement and the `Първи свободен` action through the same transactional waitlist placement mutation.
- `frontend/src/components/admin/calendar-request-sections.tsx:27` renders current-calendar waitlist and pending appointment sections.
- `frontend/src/components/admin/calendar-request-sections.tsx:52` labels untimed requests as `Без избран час`.
- `frontend/src/components/admin/calendar-request-sections.tsx:129` labels pending timed appointments as `Чакат потвърждение`.
- `frontend/src/components/admin/calendar-detail-drawer.tsx:150` renders request details, including phone, preferred staff/window, and notes.
- `frontend/src/components/admin/calendar-detail-drawer.tsx:223` offers `Първи свободен` and archive actions for requests.
- `frontend/src/components/admin/admin-booking-modal.tsx:103` posts `/appointments/admin` for direct admin appointment creation.
- `frontend/src/components/admin/admin-booking-modal.tsx:121` invalidates clients, calendar board, and waitlist after successful admin creation.
- `frontend/src/components/admin/appointment-move-modal.tsx:88` patches `/appointments/:id/reschedule`.
- `frontend/src/components/admin/appointment-move-modal.tsx:100` invalidates appointment context, calendar board, and waitlist after move.
- `frontend/src/components/admin/admin-calendar-desktop.tsx:189` adds the requests panel as a right column when actionable requests exist.
- `frontend/src/components/admin/admin-calendar-mobile.tsx:451` renders the current mobile requests bottom sheet.

### Current backend appointments, requests, slots, waitlist, and status endpoints

Current controller endpoints in `backend/src/modules/appointments/appointments.controller.ts`:

- `GET /appointments/slots` at line 43 calls `getAvailableSlots`.
- `POST /appointments` at line 62 calls public `create`.
- `POST /appointments/request` at line 74 calls `createBookingRequest` and creates an untimed request.
- `POST /appointments/admin` at line 88 calls `createByAdmin`.
- `POST /appointments/:id/proposal` at line 100 exists, but the public proposal response page says the feature is removed at lines 377-412.
- `GET /appointments/calendar-board` at line 133 calls `getCalendarBoard`.
- `GET /appointments/:id/context` at line 224 calls `getAppointmentContext`.
- `PATCH /appointments/:id/status` at line 238 calls `updateStatus`.
- `PATCH /appointments/:id/visit-progress` at line 256 calls `updateVisitProgress`.
- `POST /appointments/:id/notifications/retry` at line 268 retries one notification type.
- `POST /appointments/:id/notifications/retry-failed` at line 284 retries failed notification types.
- `PATCH /appointments/:id/reschedule` at line 295 calls `rescheduleAppointment`.
- `GET /appointments/waitlist` at line 311 calls `listWaitlist`.
- `POST /appointments/waitlist` at line 323 calls `createWaitlistEntry`.
- `PATCH /appointments/waitlist/:id/status` at line 349 calls `updateWaitlistStatus`.
- `POST /appointments/waitlist/:waitlistId/place` calls `placeWaitlistEntry` for atomic backend waitlist placement. Calendar V2 calls this endpoint only from the placement preview save action when `NEXT_PUBLIC_ENABLE_CALENDAR_V2_PLACEMENT_SAVE === "true"` and sample mode is off.
- `POST /appointments/waitlist/:id/notify` at line 365 calls `notifyWaitlistEntry`.

Current DTO facts:

- `backend/src/modules/appointments/dto/create-appointment.dto.ts:16` defines `CreateAppointmentDto`.
- `CreateAppointmentDto` requires `serviceId`, `staffId`, `startAt`, `clientName`, and `clientPhone`.
- `CreateAppointmentDto` supports optional `clientEmail`, `notes`, `intakeData`, `consentGiven`, `askClient`, `publicBaseUrl`, and `deviceToken`.
- `backend/src/modules/appointments/dto/create-booking-request.dto.ts:15` defines `CreateBookingRequestDto`.
- `CreateBookingRequestDto` requires `serviceId`, `clientName`, and `clientPhone`.
- `CreateBookingRequestDto` supports `preferredStaffId`, `desiredDate`, `desiredTimePeriod`, `clientEmail`, `notes`, `consentGiven`, `publicBaseUrl`, and `deviceToken`.
- `backend/src/modules/appointments/dto/get-slots.dto.ts:4` requires `serviceId`, `staffId`, and `date`.
- `backend/src/modules/appointments/dto/place-waitlist-entry.dto.ts` defines the placement DTO with `staffId`, `startAt`, optional `durationMinutes`, optional `idempotencyKey`, and optional `notifyClient`.
- `backend/src/modules/appointments/dto/update-status.dto.ts:5` accepts `AppointmentStatus`, optional `reason`, and optional `cancelledBy`.
- `backend/src/modules/appointments/dto/update-visit-progress.dto.ts:5` accepts `VisitProgress`.

Current backend service behavior:

- `backend/src/modules/appointments/appointments.service.ts:29` defines waitlist statuses as `waiting`, `notified`, `booked`, and `cancelled`.
- `backend/src/modules/appointments/appointments.service.ts:64` defines the `WaitlistRow` shape used by the service.
- `backend/src/modules/appointments/appointments.service.ts:119` defines `createByAdmin`, which calls generic `create` with `forceConfirmed: true`, `askClient: false`, and `bookedBy: 'owner'`.
- `backend/src/modules/appointments/appointments.service.ts:159` defines `getCalendarBoard`.
- `getCalendarBoard` calls `ensureWaitlistTable` at line 163, reads active staff, appointment rows, staff exceptions, and active waitlist entries.
- `getCalendarBoard` only includes waitlist status `waiting` and `notified` at line 258.
- `backend/src/modules/appointments/appointments.service.ts:638` defines `getAvailableSlots`.
- `getAvailableSlots` validates service existence, staff existence, working hours, existing appointments, staff exceptions, min/max advance booking, and group-service capacity.
- `backend/src/modules/appointments/appointments.service.ts:831` defines generic `create`.
- `create` validates service existence at line 847, calculates `endAt` from service duration at line 868, finds or creates the client at line 872, checks appointment conflicts at lines 875-936, checks minimum advance booking at lines 938-944, inserts into `appointments` at lines 964-989, and schedules notifications at line 994.
- The generic `create` path does not check staff working hours or staff exceptions. Those checks exist in `getAvailableSlots` and `rescheduleAppointment`, not in `create`.
- For standard exact-time services, generic `create` now validates active allocation conflicts plus the retained buffer-aware legacy appointment fallback, then inserts the appointment and matching staff allocation in one tenant transaction. Pending creates produce `held`; confirmed creates produce `booked`.
- `backend/src/modules/appointments/appointments.service.ts:1063` defines `updateStatus`.
- `updateStatus` validates appointment status transitions, keeps standard appointment allocations aligned with confirmed/cancelled/completed/no-show lifecycle state, and sends the existing immediate status/cancellation notification.
- `backend/src/modules/appointments/appointments.service.ts:1262` defines `listWaitlist`.
- `backend/src/modules/appointments/appointments.service.ts:1314` defines `createBookingRequest`.
- `createBookingRequest` maps `desiredTimePeriod` to `desiredFrom` and `desiredTo`, calls `createWaitlistEntry`, and returns `{ id, status: 'pending' }` even though the stored waitlist status is `waiting`.
- `backend/src/modules/appointments/appointments.service.ts:1342` defines `createWaitlistEntry`, which inserts a waitlist row with status `waiting`.
- `backend/src/modules/appointments/appointments.service.ts:1410` defines `updateWaitlistStatus`, which updates waitlist status and `booked_appointment_id`.
- `backend/src/modules/appointments/appointments.service.ts` defines `placeWaitlistEntry`, which locks an open waitlist row, validates service/staff/time/conflicts/blocked intervals, inserts a confirmed owner-booked appointment, and marks the waitlist row `booked` in the same tenant transaction.
- For standard services, `placeWaitlistEntry` now also validates occupied-interval conflicts against `calendar_allocations`, checks legacy appointments with buffer-aware occupied intervals while backfill is pending, inserts a booked staff allocation, and maps DB exclusion conflicts to the same user-safe conflict class.
- `backend/src/modules/appointments/appointments.service.ts:1453` defines `notifyWaitlistEntry`, which sends `WAITLIST_AVAILABLE`, then marks the waitlist row `notified` with `last_notified_slot_start_at`.
- `backend/src/modules/appointments/appointments.service.ts:1534` throws `ConflictException` when waitlist notification sending fails.
- `backend/src/modules/appointments/appointments.service.ts:1623` defines `rescheduleAppointment`, which validates appointment state, blocks group-service drag/drop moves, validates staff, staff working hours, staff exceptions, and conflicts, then updates the appointment.
- For standard services, `rescheduleAppointment` now updates appointment + allocation in one tenant transaction, refreshes staff/display/occupied interval fields, keeps the retained legacy fallback query, and materializes a missing allocation during a safe legacy reschedule.
- `rescheduleAppointment` does not send a notification in the inspected code.
- `backend/src/modules/appointments/appointments.service.ts:1949` defines `scheduleNotifications`, which sends immediate booking confirmation and queues reminders.
- `backend/src/modules/appointments/appointments.service.ts:2060` defines `processNotificationNow`, which returns `false` on processor failure instead of throwing to callers.
- `backend/src/modules/appointments/appointments.service.ts:2252` defines `assertNoConflict`, but the inspected `create` and `rescheduleAppointment` paths use inline conflict queries instead of this helper.
- `backend/src/modules/appointments/appointments.service.ts:2278` defines status transitions: `pending -> confirmed/cancelled`, `proposal_pending -> confirmed/cancelled`, `confirmed -> completed/cancelled/no_show`; terminal statuses cannot transition.

### Database fields in the inspected schema and compatibility helper

- `backend/prisma/migrations/001_init.sql:191` creates tenant `appointments`.
- `appointments.start_at` and `appointments.end_at` are required timestamp columns at lines 198-199.
- `appointments.status` defaults to `pending` at line 202. The migration comment lists `pending | confirmed | completed | cancelled | no_show`.
- `appointments.cancelled_by`, `cancellation_reason`, `client_notes`, `internal_notes`, and `intake_data` exist at lines 221-231.
- `backend/prisma/migrations/001_init.sql:253` creates `staff_exceptions`.
- `backend/prisma/migrations/001_init.sql:266` creates `notifications_log`.
- `notifications_log` includes `appointment_id`, `client_id`, `channel`, `type`, `status`, `external_id`, `error_message`, `sent_at`, and `delivered_at` at lines 267-280.
- `backend/prisma/migrations/001_init.sql:286` creates tenant `waitlist`.
- The migration waitlist fields are `id`, `client_id`, `service_id`, `staff_id`, `desired_date`, `desired_from`, `desired_to`, `status`, `notified_at`, `expires_at`, and `created_at`.
- `backend/src/common/prisma/tenant-prisma.service.ts:155` defines `ensureWaitlistTable`.
- `ensureWaitlistTable` creates waitlist if missing and adds compatibility columns `notes`, `last_notified_slot_start_at`, `booked_appointment_id`, and `updated_at` at lines 175-185.
- `TenantPrismaService.ensureCalendarAllocationsTable(...)` starts at line 189, creates the tenant-local allocation table for existing schemas, adds resource/occupied/source/status indexes, and installs the active-exclusive exclusion constraint after ensuring `btree_gist`.
- `TenantPrismaService.ensureExistingTenantCalendarAllocations(...)` starts at line 114, runs at backend startup, discovers schemas present in both `public.tenants` and `information_schema.schemata`, and applies the idempotent allocation ensure helper to each already-existing tenant schema.
- New tenant schemas also receive `calendar_allocations` from `backend/prisma/migrations/001_init.sql`.
- Existing appointments are still not backfilled; this hardening step upgrades schema only, while standard placement/create/reschedule keep the legacy appointment conflict query until a validated backfill phase exists.
- `TenantPrismaService.queryInSchema` wraps each raw SQL query in its own transaction at `backend/src/common/prisma/tenant-prisma.service.ts:59`.
- A future placement endpoint must use a single multi-step transaction, not separate `queryInSchema` calls for create and waitlist update.

### Appointment statuses and notification enums

- `backend/src/common/types/enums.ts:1` defines `AppointmentStatus`: `pending`, `proposal_pending`, `confirmed`, `completed`, `cancelled`, `no_show`.
- `backend/src/common/types/enums.ts:10` defines `VisitProgress`: `scheduled`, `checked_in`, `in_service`, `completed`, `no_show`.
- `backend/src/common/types/enums.ts:18` defines notification job types, including `BOOKING_CONFIRMED`, `BOOKING_PENDING`, `BOOKING_PROPOSAL`, `BOOKING_APPROVED`, cancellation jobs, reminders, `WAITLIST_AVAILABLE`, and `STATUS_CHANGED`.
- `backend/src/common/types/enums.ts:34` defines notification channels: `telegram`, `sms`, `email`, `viber`.
- The inspected notification processor uses Telegram and SMS paths. I did not find a Viber send path in the inspected notification processor.

### Notification hooks and gaps

- `backend/src/modules/notifications/notification.processor.ts:75` documents the notification processor as the BullMQ worker that sends notifications and logs them to `notifications_log`.
- `backend/src/modules/notifications/notification.processor.ts:137` handles `WAITLIST_AVAILABLE`.
- `WAITLIST_AVAILABLE` loads waitlist, client, service, and optional staff data at lines 144-166.
- It sends Telegram if the client has consent, tenant Telegram is enabled, and the client has `telegram_chat_id` at lines 199-207.
- It sends SMS if consent exists and SMS is configured at lines 208-227.
- It logs `WAITLIST_AVAILABLE` to `notifications_log` at lines 236-251.
- It throws when an attempted waitlist notification fails at lines 253-254.
- Appointment notifications use `BOOKING_CONFIRMED`, reminders, status changed, and cancellation cases from `backend/src/modules/notifications/notification.processor.ts:372`.
- Appointment notification results are logged to `notifications_log` at lines 603-619.
- `frontend/src/components/admin/calendar-detail-drawer.tsx:130` displays appointment notification summary/history, but there is no equivalent waitlist notification history panel in the inspected current-calendar request drawer.
- I did not find a durable notification outbox table in the inspected migration or Prisma helper. Existing behavior is immediate processor calls for some events plus BullMQ reminder jobs.
- Notification failure currently can block `notifyWaitlistEntry`. It does not block generic appointment creation because `scheduleNotifications` does not check the boolean returned by `processNotificationNow`.

## 3. Product Workflow Model

### Desktop

The desktop Calendar V2 planning workflow should be:

1. Owner opens Calendar V2 and keeps the calendar visible.
2. Owner sees Action Inbox on the right.
3. Action Inbox shows an item labelled `Заявка без точен час` or equivalent wording for an untimed request.
4. Owner opens the item and reviews client, phone, service, service duration, preferred date/window, preferred staff, notes, and current status.
5. Owner chooses a suggested slot or uses the calendar grid to choose a staff/time slot.
6. Calendar shows a lightweight placement preview in context. It should not open the full appointment editor.
7. Owner explicitly confirms placement.
8. Frontend sends one placement command to the backend.
9. Backend validates the request and slot in one transaction.
10. Calendar board and waitlist refresh after success.
11. Client receives a message only when the selected notification policy says to notify.

### Phone

Phone should not use drag/drop. The phone flow should be:

1. Tap request in Action Inbox or bottom sheet.
2. Review request details.
3. See suggested slots, grouped by day and staff.
4. Tap one slot.
5. Confirm in a bottom sheet.
6. Send the same placement command as desktop.

### Tablet

- Landscape can follow a desktop-light layout with Action Inbox beside or near the scheduler.
- Portrait should follow the phone-like flow: tap request, choose suggested slot, confirm.
- Tablet should not be the first reason to implement drag/drop persistence.

## 4. Domain Model Recommendation

Recommended domain objects:

- `DemandItem` / `Request` / `WaitlistEntry`: unscheduled demand from a client or owner that expresses intent but does not occupy staff time yet.
- `Appointment`: scheduled time block with `start_at`, `end_at`, `staff_id`, `service_id`, client, and appointment status.
- `ProposedTime`: a future optional object for owner-offered slots that the client can accept or reject. Calendar V2 already has `CalendarV2ProposedTime`.
- `ActionItem`: inbox item derived from demand, appointment request state, cancellation recovery, or notification failure.
- `CalendarBlock`: visual block for scheduled appointments, staff exceptions, and availability/closed time.
- `ActivityEvent`: audit event for request created, placed, confirmed, declined, notification sent, notification failed, or stale conflict.

An untimed request is not an appointment. It has service/client/preference data, but it does not reserve staff time and must not render as a scheduled calendar block.

Required rule:

> Untimed demand must not be forced into appointments.start_time until a slot is chosen.

In this repository the concrete appointment timestamp column is `appointments.start_at`, not `appointments.start_time`; the same rule applies to `appointments.start_at`.

Calendar V2 already has the correct separation:

- `CalendarV2DemandItem` represents unscheduled waitlist/request demand.
- `CalendarV2CalendarBlock` represents appointment and blocked-time blocks.
- `projectWaitlistEntryToDemandItem(...)` keeps waitlist demand unscheduled unless the waitlist status is booked.

## 5. State Model Recommendation

### Request/waitlist states

Recommended request/waitlist states:

- `open` / `waiting`: request is actionable and unscheduled.
- `pending approval`: a distinct state only if the request already has a time and needs owner confirmation.
- `placed` / `booked`: request has produced a scheduled appointment.
- `declined`: owner rejected the request.
- `expired`: request is no longer valid because the preferred window expired.
- `cancelled`: client or owner cancelled/archived the request.

The current database waitlist states are only `waiting`, `notified`, `booked`, and `cancelled`. Do not invent new persisted states until a backend migration is intentionally designed. For the first implementation, map UI language onto existing states or add a dedicated endpoint that still uses existing persisted states.

### Appointment states

Current appointment states are:

- `pending`
- `proposal_pending`
- `confirmed`
- `cancelled`
- `completed`
- `no_show`

For the first Calendar V2 request workflow, only `pending`, `confirmed`, and `cancelled` should be product-facing. `completed` and `no_show` can remain in the system but should not drive the first Calendar V2 workflow.

### Allowed transitions

Recommended transitions:

- request `waiting` -> appointment `confirmed` plus waitlist `booked`.
- request `waiting` -> request `declined` when a declined state exists; until then, current code can only represent archive/cancel as waitlist `cancelled`.
- timed appointment request `pending` -> appointment `confirmed`.
- timed appointment request `pending` -> appointment `cancelled`.
- request `waiting` -> offered/proposed only if a future proposal flow is intentionally reintroduced.

Current backend status transitions already allow:

- appointment `pending` -> `confirmed` or `cancelled`.
- appointment `proposal_pending` -> `confirmed` or `cancelled`.
- appointment `confirmed` -> `completed`, `cancelled`, or `no_show`.

### What must not happen

- No fake scheduled appointment for untimed demand.
- No write from Calendar V2 while the feature flag is off.
- No write from Calendar V2 sample mode.
- No placement without server conflict validation.
- No silent notification unless the owner explicitly chooses a silent placement mode.
- No automatic client notification if product policy has not been designed.
- No split API sequence where appointment creation succeeds but waitlist update fails.
- No mixing FYI updates into `Requires Action`.

## 6. Backend Implementation Strategy

### Are existing endpoints enough?

The dedicated waitlist placement endpoint is now the write contract for both Calendar V2 placement save and the current production `/admin` request placement flow.

The old current-calendar placement flow created an appointment through `POST /appointments/admin` and then marked the waitlist row booked through `PATCH /appointments/waitlist/:id/status`. That two-write sequence has been removed from request placement because it could leave inconsistent state if the appointment was created but the waitlist update failed, if two tabs placed the same request, or if notification behavior was added between the two calls.

The generic appointment create endpoint also does not perform all placement validations visible in other backend paths. In the inspected code, generic `create` checks appointment conflicts and minimum advance time, but staff working hours and staff exceptions are enforced by `getAvailableSlots` and `rescheduleAppointment`, not by generic `create`.

Implemented backend foundation: use the dedicated placement endpoint from Calendar V2 only behind its explicit save flag, and use the same endpoint from the current `/admin` request placement flow without adding notifications.

The old two-call `/admin` request placement route has now been cleaned up. Existing appointments are still not backfilled, so allocation-only authority remains intentionally deferred.

Endpoint:

```http
POST /api/v1/appointments/waitlist/:waitlistId/place
```

The controller-level route is `POST /appointments/waitlist/:waitlistId/place` under URI version `v1` and the global `/api` prefix. It is protected with `JwtAuthGuard` and `TenantGuard`.

### Placement payload

```json
{
  "staffId": "uuid",
  "startAt": "2026-05-11T10:00:00+03:00",
  "durationMinutes": 60,
  "idempotencyKey": "calendar-v2-place:<waitlistId>:<stable-client-key>",
  "notifyClient": false
}
```

Payload notes:

- `staffId` is required and must be a UUID-shaped string.
- `startAt` is required and must be ISO 8601.
- `durationMinutes` is optional. If present, it must be 5-480 minutes and must match the service duration. The endpoint derives `endAt` from the service duration.
- `idempotencyKey` is optional, validated, and stored only as placement metadata. There is no new idempotency schema in this step.
- `notifyClient` is optional and defaults to `false`. It is reserved for future notification policy. The endpoint does not send notifications even when the value is `true`.

Response shape:

```json
{
  "id": "appointment-uuid",
  "status": "confirmed",
  "startAt": "2026-05-11T07:00:00.000Z",
  "endAt": "2026-05-11T08:00:00.000Z",
  "appointment": {
    "id": "appointment-uuid",
    "status": "confirmed",
    "startAt": "2026-05-11T07:00:00.000Z",
    "endAt": "2026-05-11T08:00:00.000Z",
    "staffId": "staff-uuid",
    "serviceId": "service-uuid",
    "clientId": "client-uuid"
  },
  "waitlist": {
    "id": "waitlist-uuid",
    "status": "booked",
    "bookedAppointmentId": "appointment-uuid"
  },
  "notifications": {
    "requested": false,
    "sent": false
  },
  "idempotencyKey": "calendar-v2-place:<waitlistId>:<stable-client-key>"
}
```

### Required backend validations

The dedicated endpoint validates:

- Tenant scope from `TenantGuard` and `CurrentTenant`.
- Waitlist table exists through `ensureWaitlistTable`.
- Waitlist/request exists in the current tenant schema.
- Waitlist/request status is still `waiting` or `notified`.
- Waitlist/request has no `booked_appointment_id`.
- Service exists.
- Staff exists and is active.
- Target `startAt` parses to a valid date.
- Target `endAt` is derived from service duration.
- Explicit `durationMinutes`, if sent, is bounded and must match the service duration.
- Appointment conflict check excludes `cancelled` and `no_show` appointments, matching current conflict behavior.
- Staff working hours include the full target interval.
- Staff exception/blocked time does not overlap the target interval.
- Group-service placement respects configured group day/time and slot capacity when `booking_mode = 'group'`.
- `idempotencyKey`, when sent, matches the accepted key shape and is recorded in appointment `intake_data.waitlistPlacement`.
- `notifyClient` is accepted only as reserved metadata; no notification work is performed.

### Transaction requirements

The endpoint performs these steps inside one `withTenantSchema(...)` transaction:

1. Lock the waitlist row with `SELECT ... FOR UPDATE`.
2. Validate status and `booked_appointment_id` after lock.
3. Validate service, staff, working hours, blocked time, and appointment conflicts.
4. Insert the appointment with `status = confirmed`, `booked_by = owner`, waitlist notes preserved as client notes, and placement metadata in `intake_data`.
5. Update waitlist to `booked` and set `booked_appointment_id`.
6. Commit.

The endpoint does not call `scheduleNotifications`, `processNotificationNow`, or `notificationQueue.add`. Notification behavior remains a future explicit step.

### Conflict responses

Response classes:

- `404`: waitlist request, service, or staff not found.
- `409`: waitlist already handled, slot already taken, staff unavailable, blocked time overlap, group-service capacity exhausted, or repeated placement after the waitlist row has been booked.
- `400`: invalid payload, invalid date, invalid service duration, or duration mismatch.

Idempotency limitation: this step does not add a DB idempotency table or unique key. Duplicate creation is still prevented for the same waitlist row by locking the row and marking it `booked` in the same transaction; a repeated placement after commit returns `409` and does not create another appointment.

Future frontend integration can add stable machine codes around these responses, for example:

```json
{
  "code": "SLOT_CONFLICT",
  "message": "Selected slot is no longer available.",
  "currentWaitlistStatus": "waiting",
  "refresh": true
}
```

### Audit/event logging

The repo currently stores appointment presentation state in `appointments.intake_data.stateMeta` and notification events in `notifications_log`. I did not find a generic activity-events table in the inspected schema.

The placement endpoint stores source metadata in `appointments.intake_data.waitlistPlacement`. Add a separate audit/event log only when there is a designed storage location. Do not overload `notifications_log` for non-notification events. Until a schema exists, return enough response data and keep the Action Inbox derived from existing entities.

### Notification/outbox behavior

Do not put notification sending inside the database transaction.

Future notification order when notification policy is designed:

1. Commit appointment placement.
2. If the future placement notification policy requests client notification, enqueue or process notification after commit.
3. Record notification success/failure in `notifications_log`.
4. If notification fails, keep appointment and waitlist state intact.
5. Surface notification failure as an Action Inbox item or appointment context update.

The current placement endpoint does not send notifications. Existing notification paths are immediate processor calls for booking/status/waitlist availability plus queued reminders. A durable outbox would be better for race safety, but adding it requires a schema change and is not part of this backend foundation step.

## 7. Frontend Implementation Strategy

### Phase A: read-only Action Inbox refinement

Files to change:

- `frontend/src/components/admin/calendar-v2/action-inbox.ts`
- `frontend/src/components/admin/calendar-v2/projections.ts`
- `frontend/src/components/admin/calendar-v2/native-scheduler-spike/NativeSchedulerActionInboxMock.tsx`
- `frontend/src/components/admin/calendar-v2/native-scheduler-spike/NativeSchedulerPreviewPanel.tsx`
- `frontend/src/components/admin/calendar-v2/real-data/CalendarV2RealDataAdapter.tsx`

Behavior added:

- Rename/render waitlist demand as planning language, for example `Заявка без точен час`.
- Keep waitlist entries in `Requires action`.
- Keep cancellation recovery separate from FYI `Updates`.
- Show request facts without enabling writes.

What remains disabled:

- Drag controls in real-data mode.
- Confirm placement.
- Backend writes.
- Status changes.

Validation required:

- Real-data Calendar V2 still fires only current read endpoints.
- Sample mode still performs no backend writes.
- Action Inbox counts match projected data.

Rollback strategy:

- Revert UI labels/projection display changes only. The read-only contract remains unchanged.

### Phase B: local placement preview only

Files to change:

- `frontend/src/components/admin/calendar-v2/native-scheduler-spike/NativeSchedulerV2Spike.tsx`
- `frontend/src/components/admin/calendar-v2/native-scheduler-spike/native-scheduler-drag.ts`
- `frontend/src/components/admin/calendar-v2/native-scheduler-spike/NativeSchedulerPlacementPreview.tsx`
- `frontend/src/components/admin/calendar-v2/native-scheduler-spike/native-scheduler-regression-checks.ts`
- `frontend/src/components/admin/calendar-v2/real-data/CalendarV2RealDataAdapter.tsx`

Behavior added:

- Enable a Calendar V2 local-only placement preview for real waitlist demand behind an explicit local preview feature flag.
- Generate `PlaceRequestCommand` from Action Inbox plus target slot.
- Show placement preview with client, service, staff, date/time, duration, calm Bulgarian no-save copy, and no internal command ids, idempotency keys, or ISO timestamps in visible UI.
- Keep the right rail on active request/selected-slot context while placement mode or placement preview is active.
- Confirm button remains disabled.
- No write endpoint is called.

What remains disabled:

- Persist placement.
- Confirm/decline pending timed requests.
- Appointment movement persistence.
- Mobile drag/drop.

Validation required:

- Browser/network check that no write endpoint fires after local placement preview.
- Regression check that command shape includes request id, target, source surface, idempotency key, and draft appointment details.
- Feature flag off means no placement controls.
- Sample mode means no writes.

Rollback strategy:

- Disable the feature flag. Since no writes exist, rollback is UI-only.

### Phase C: backend placement endpoint foundation

Backend files changed in this phase:

- `backend/src/modules/appointments/appointments.controller.ts`
- `backend/src/modules/appointments/appointments.service.ts`
- `backend/src/modules/appointments/dto/place-waitlist-entry.dto.ts`
- `backend/test/appointments.service.waitlist-placement.spec.ts`

Behavior added:

- Add `POST /api/v1/appointments/waitlist/:waitlistId/place`.
- Validate and place an open waitlist request in one backend transaction.
- Return `409` instead of creating duplicates when the waitlist row is already booked or handled.
- Do not send client notifications.
- Do not wire any Calendar V2 frontend save path.

What remains disabled:

- Calendar V2 frontend confirm/save.
- Calendar V2 frontend API calls to the placement endpoint.
- Appointment move persistence in Calendar V2.
- Mobile drag/drop.
- Full appointment editor.
- Notification sending from placement.

Validation required:

- Backend tests for placement success, not found, handled request, invalid staff/service, appointment conflict, blocked interval, insert failure before waitlist update, no notification call, and DTO validation.
- Backend build.

Rollback strategy:

- Backend endpoint can remain unused if deployed safely because Calendar V2 frontend does not call it.

### Phase D: frontend placement endpoint integration behind feature flag

Files changed in this phase:

- `frontend/src/components/admin/calendar-v2/real-data/CalendarV2RealDataAdapter.tsx`
- `frontend/src/components/admin/calendar-v2/native-scheduler-spike/NativeSchedulerPlacementPreview.tsx`
- `frontend/src/components/admin/calendar-v2/native-scheduler-spike/NativeSchedulerV2Spike.tsx`
- `frontend/src/components/admin/calendar-v2/native-scheduler-spike/native-scheduler-drag.ts`
- `frontend/src/components/admin/calendar-v2/native-scheduler-spike/native-scheduler-regression-checks.ts`

Behavior added:

- Frontend save sends one placement request only when `NEXT_PUBLIC_ENABLE_CALENDAR_V2_PLACEMENT_SAVE === "true"` and not sample mode.
- Flag off keeps placement preview local-only and the save button disabled.
- Sample mode keeps save disabled and non-writing.
- The save payload is `{ staffId, startAt, durationMinutes, idempotencyKey, notifyClient: false }`.
- The endpoint is `POST /appointments/waitlist/:waitlistId/place` through the existing API client.
- On success, invalidate/refetch `appointments-calendar-board`, `appointments-waitlist`, and `appointment-context`.
- Show server conflict errors without optimistic committed UI.
- Do not call notification endpoints and do not call appointment create/status/cancel/reschedule endpoints.

What remains disabled:

- Appointment move persistence in Calendar V2.
- Mobile drag/drop.
- Full appointment editor.
- Notification modes other than the explicitly supported one.

Validation required:

- Frontend network check that exactly one placement endpoint fires on confirm.
- Feature flag off and sample mode produce no writes.

Rollback strategy:

- Disable frontend feature flag.
- Backend endpoint can remain unused if deployed safely.

### Phase E: confirm/decline pending request

Files to change:

- `frontend/src/components/admin/calendar-v2/action-inbox.ts`
- `frontend/src/components/admin/calendar-v2/native-scheduler-spike/NativeSchedulerActionInboxMock.tsx`
- `frontend/src/components/admin/calendar-v2/native-scheduler-spike/NativeSchedulerPreviewPanel.tsx`
- Existing `PATCH /appointments/:id/status` integration can be used behind a Calendar V2 feature flag.

Behavior added:

- Action Inbox pending timed appointments get explicit confirm and decline actions.
- Confirm maps to `PATCH /appointments/:id/status` with `confirmed`.
- Decline maps to `PATCH /appointments/:id/status` with `cancelled` and owner cancellation reason if UI collects it.

What remains disabled:

- Full appointment editing.
- Visit progress actions.
- Drag-to-move as a Calendar V2 write.

Validation required:

- State transition errors are surfaced.
- Calendar and Action Inbox refresh after success.
- Notification behavior is explicit.

Rollback strategy:

- Disable Calendar V2 request status feature flag.

### Phase F: notifications and audit UI

Files to change:

- `backend/src/modules/appointments/appointments.service.ts`
- `backend/src/modules/notifications/notification.processor.ts`
- `frontend/src/components/admin/calendar-v2/action-inbox.ts`
- `frontend/src/components/admin/calendar-v2/native-scheduler-spike/NativeSchedulerActionInboxMock.tsx`
- `frontend/src/components/admin/calendar-v2/native-scheduler-spike/NativeSchedulerPreviewPanel.tsx`

Behavior added:

- Placement confirmation exposes explicit notification choice.
- Notification failure does not undo placement.
- Notification failure appears as an Action Inbox item or detail-panel warning when notification data is available.

What remains disabled:

- Automatic Viber/SMS behavior without configured and tested channel policy.
- Generic activity timeline unless storage exists.

Validation required:

- Simulated notification failure keeps appointment and booked waitlist state.
- Action Inbox shows notification failure separately from request placement.

Rollback strategy:

- Default to silent placement and hide notification controls.

### Phase G: mobile tap-to-assign flow

Files to change:

- A new phone-specific Calendar V2 request sheet/component under `frontend/src/components/admin/calendar-v2/`.
- `frontend/src/components/admin/calendar-v2/real-data/CalendarV2RealDataAdapter.tsx`.
- Shared slot suggestion helpers if introduced.

Behavior added:

- Phone renders request detail and suggested slots.
- Owner taps slot and confirms.
- Uses same backend placement endpoint as desktop.

What remains disabled:

- Mobile drag/drop.
- Full appointment editor.
- Appointment movement.

Validation required:

- Phone viewport has no drag handles.
- Bottom sheet does not create nested-scroll regressions.
- Network calls match one placement endpoint only after confirm.

Rollback strategy:

- Disable phone assignment flag and return phone to read-only request review.

## 8. Notification Policy

Request placement should not automatically message the client until the product policy is explicit.

Recommended policy:

- Default first implementation: place silently.
- Add an explicit owner choice later:
  - `Place silently`
  - `Place and notify client`
- Telegram/SMS should not be automatic just because appointment creation currently schedules `BOOKING_CONFIRMED`.
- Viber should not be presented as available until a working Viber send path is implemented and tested. The enum includes Viber, but the inspected processor uses Telegram and SMS.
- If notification fails after placement, appointment creation must not be undone.
- Notification failure should create or surface an Action Inbox item/update. Calendar V2 already has notification action item modeling in `action-inbox.ts`, but the real-data adapter currently does not fetch a global notification feed for Calendar V2.
- Failed notification retry should use existing retry patterns only for appointment notification types currently supported by `retryNotification`. Waitlist notification retry needs separate design if it is required.

Important current behavior to avoid carrying blindly into Calendar V2:

- `POST /appointments/admin` calls generic `createByAdmin`, which calls `scheduleNotifications`; this can send booking confirmation behavior immediately.
- `POST /appointments/waitlist/:id/notify` is specifically a waitlist availability notification and throws a conflict when the notification attempt fails.
- A dedicated placement endpoint should decouple placement from client notification policy.

## 9. Conflict And Race Safety

Exact race conditions to handle:

- Two tabs place the same waitlist request.
- Two owners place the same request from different devices.
- Request was already booked, cancelled, or otherwise handled after the Action Inbox loaded.
- Slot was free when displayed but taken before confirm.
- Staff became inactive or unavailable before confirm.
- Staff working hours changed before confirm.
- Staff exception/block was added before confirm.
- Service duration changed after the suggestion was shown.
- Service became inactive or unavailable for the selected staff.
- Notification fails after appointment placement.
- Calendar board is stale after placement or conflict.
- Network retry repeats the same placement request.

Current backend placement rules:

- Lock waitlist row in a transaction.
- Validate and store an optional idempotency key as metadata. A durable idempotency store is not implemented yet.
- Recompute end time server-side from current service duration unless accepting a validated explicit override.
- Re-run conflict, working-hours, and blocked-time checks at confirm.
- Return `409` for stale/handled waitlist rows, slot conflicts, blocked intervals, and unavailable staff. Stable conflict codes and `refresh: true` can be added with frontend integration.

Recommended frontend rules:

- Do not optimistically convert demand into an appointment block before success.
- Preview can be local, but committed UI changes only after server success.
- On `409`, keep request visible, clear local placement preview, refetch board and waitlist, and show a concise conflict message.
- Until durable idempotency exists, treat a repeated placement `409` as a stale-state conflict and refetch board/waitlist.
- On notification failure, keep the appointment in the calendar and show notification failure separately.

## 10. UI/UX Acceptance Criteria

### Desktop

Good desktop behavior means:

- Action Inbox request card is visible on the right when actionable demand exists.
- The primary action is clear: place the request.
- Details are visible but not noisy: client, service, duration, preferred window, staff preference, notes.
- Placement preview is lightweight and keeps the calendar visible.
- Confirm is explicit.
- No heavy appointment editor appears after choosing a slot.
- The calendar stays visible during review and preview.
- There is no nested scroll regression in the scheduler plus right rail.
- FYI updates do not inflate `Requires action`.

### Phone

Good phone behavior means:

- No drag/drop.
- Request opens through tap.
- Suggested slots are easy to scan.
- Slot selection and confirm happen in a bottom sheet.
- Calendar or agenda remains understandable after confirm or conflict.
- The bottom sheet does not trap scrolling or hide the confirm action.

### Tablet

Good tablet behavior means:

- Landscape can use the right-rail planning model.
- Portrait uses the phone-like tap-to-assign model.
- No special tablet-only drag behavior is required for the first release.

## 11. Test Plan

### Backend tests

Backend tests added for the dedicated placement service/DTO:

- Successful placement creates one appointment, marks waitlist `booked`, sets `booked_appointment_id`, and returns appointment data.
- Slot conflict returns `409` and does not update waitlist.
- Already handled request returns `409` and does not create a second appointment.
- Invalid staff returns `404`.
- Invalid service returns `404`.
- Staff blocked time overlap and outside-working-hours placement return `409`.
- Appointment insert failure does not update the waitlist row; the real operation is inside one transaction.
- Notification processor and notification queue are not called.
- DTO validation covers required id/date/duration/idempotency fields and defaults `notifyClient` to `false`.

Use the existing backend Jest pattern in `backend/test/appointments.service.visit-progress.spec.ts` for mocked service-level tests unless the endpoint needs an integration test harness.

### Frontend tests/checks

Add focused checks for:

- Projection of waitlist item to `CalendarV2DemandItem`.
- Action Inbox grouping of waitlist demand into `needs_scheduling`.
- Timed pending appointment grouping into `needs_approval`.
- Cancellation recovery remains separate from FYI updates.
- Placement preview command shape includes demand id, staff id, start/end, source surface, idempotency key, and appointment draft.
- Feature flag off means no placement controls and no writes.
- Sample mode means no writes.
- Browser/network check that only expected read endpoints fire in read-only mode.
- Browser/network check that exactly one placement endpoint fires after confirm once writes are enabled.

### Manual QA

Manual QA matrix:

- Desktop 1440px wide.
- Desktop 1366px wide.
- Phone 390px wide or equivalent.
- Tablet landscape and portrait if the phase touches tablet behavior.
- Real tenant with empty data.
- Sample mode.
- One real waitlist request with no exact time.
- One pending timed appointment request.
- One request with preferred staff.
- One request with preferred date/window.
- One slot conflict created from a second tab before confirm.

## 12. Recommended First Implementation Prompt

Recommended next implementation: Calendar V2 local-only request placement preview from Action Inbox.

Justification:

- It exercises the exact product workflow without risking bookings, notifications, tenant data, or schema.
- Calendar V2 already has local `placeRequest` command types and preview UI in the native scheduler spike.
- It lets us validate owner ergonomics, Action Inbox wording, command shape, and no-write guardrails before wiring a backend endpoint from the frontend.
- It avoids repeating the mistake of implementing a technically safe but low-value day-of action.

Previous Phase B prompt kept for history:

```text
You are working on the SalonIQ repository.
Read and follow the root AGENTS.md before doing anything else.
Work directly on main.

Implement Calendar V2 local-only request placement preview from Action Inbox.

Constraints:
- Do not add backend endpoints.
- Do not change database schema.
- Do not add packages.
- Do not send any write API calls.
- Do not change current /admin calendar behavior.
- Keep sample mode no-write.
- Keep feature flag off by default unless an existing Calendar V2 preview flag pattern already supports safe preview behavior.

Goal:
- In Calendar V2 real-data preview, refine the Action Inbox request card language for untimed waitlist demand.
- Allow a local-only placement preview command for waitlist demand when an explicit Calendar V2 local preview flag is enabled.
- The preview must show client, service, duration, preferred window, target staff/time, and notification mode as disabled/silent.
- Confirm placement must remain disabled.
- No appointment API, waitlist API, status API, notification API, or reschedule API may fire.

Inspect first:
- frontend/src/components/admin/calendar-v2/
- frontend/src/components/admin/calendar-v2/real-data/
- frontend/src/components/admin/calendar-v2/native-scheduler-spike/
- frontend/src/components/admin/use-admin-calendar-board-data.ts

Validation:
- Run the native scheduler regression checks if they are already runnable without installing packages.
- Use a browser/network check or equivalent lightweight verification to confirm read-only mode and sample mode perform no writes.
- Do not run next lint.

Expected final response:
- Commit SHA
- Files changed
- Validation performed
- Confirmation no frontend save, notification send, schema, package, deploy, tenant-resolution, secret, or env behavior changed
```

## 13. Risks And Non-Goals

Implementation note, 2026-05-08:

- Phase B has started with a local-only Calendar V2 Action Inbox placement preview.
- Real-data mode and sample mode can enter placement mode from waitlist/demand items and preview a clicked staff/time slot.
- The preview command is typed as `placeRequest`, carries `localOnly: true`, and is not sent to the backend.
- Confirm/save remains disabled unless `NEXT_PUBLIC_ENABLE_CALENDAR_V2_PLACEMENT_SAVE === "true"` and real-data mode is active.
- With the flag on in real-data mode, explicit save calls `POST /appointments/waitlist/:waitlistId/place` with `notifyClient: false`, then backend refresh wins.
- With the flag off, placement remains local-only and no write API is called.
- In sample mode, save remains disabled and no write API is called.
- As of 2026-05-16, `/admin` renders Calendar V2 and `/admin/calendar-legacy` preserves the old calendar only as fallback.
- A dedicated backend placement endpoint now exists and is wired only behind the frontend feature flag.

Risks:

- Reusing `POST /appointments/admin` plus `PATCH /appointments/waitlist/:id/status` would preserve the current non-atomic split write.
- Generic appointment creation currently lacks the full working-hours and blocked-time validations needed for safe placement.
- Existing appointment creation can trigger notifications, which is not safe for an undecided placement policy.
- Calendar V2 sample mode can accidentally hide real-data edge cases if QA relies only on fixtures.
- Treating cancelled/recovery updates as `Requires action` too broadly can create owner noise.

Non-goals:

- Do not start with drag-to-move existing appointments.
- Do not build mobile drag/drop.
- Do not add visit-progress UI.
- Do not mix FYI updates into `Requires Action`.
- Do not use paid calendar libraries.
- Do not do a full rewrite of the current calendar.
- Do not add recurring appointments.
- Do not build a full appointment editor in Calendar V2 as part of request placement.
- Do not wire notification sends until the policy and failure handling are explicitly designed.

## 14. Final Recommendation

Keep Phase B behavior intact: Calendar V2 local-only request placement preview from Action Inbox.

Keep it behind an explicit preview guard, keep confirm disabled, and verify that no write endpoints fire. This gives the product team the real planning workflow to evaluate: request in Action Inbox, choose a slot, review the placement, and understand notification policy before Calendar V2 writes data.

The backend placement endpoint is now the intended future write path. The next step is frontend integration behind a feature flag. Do not use the existing two-call `POST /appointments/admin` plus waitlist status patch as the Calendar V2 write path. Keep visit progress, mobile drag/drop, full appointment editing, recurring appointments, and drag-to-move existing appointments disabled until request placement is validated end to end.
