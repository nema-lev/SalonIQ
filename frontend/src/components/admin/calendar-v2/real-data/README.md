# Calendar V2 Real-Data Adapter

This folder connects the primary Calendar V2 admin route to the existing admin calendar read path.

## Main Route

- Calendar V2 is the primary admin calendar direction on `main`.
- Primary route: `/admin`.
- Alias route: `/admin/calendar-v2`.
- Explicit sample route: `/admin/calendar-v2?sample=1`.
- Legacy fallback route: `/admin/calendar-legacy`.
- The legacy fallback is intentionally not added to admin navigation.
- To disable only the `/admin/calendar-v2` alias route in an environment, set `NEXT_PUBLIC_DISABLE_CALENDAR_V2_PREVIEW=true`.
- The Calendar V2 route does not expose the fixture scheduler after read errors.

## Data Source

- Uses `useAdminCalendarBoardData(...)`.
- Reads the same endpoints as the current admin calendar:
  - `GET /appointments/calendar-board`
  - `GET /appointments/waitlist`
  - `GET /services/admin`
- Uses the existing `apiClient`, so current admin auth and tenant headers stay unchanged.
- Does not add backend endpoints.
- Calls write APIs only for intentional real-data actions: manual booking create, explicit eligible booking reschedule, eligible booking confirm/cancel, and request placement when `NEXT_PUBLIC_ENABLE_CALENDAR_V2_PLACEMENT_SAVE === "true"` and the placement preview is explicitly saved.
- Sample mode is built in the frontend adapter only; it does not read or write sample records through backend APIs.

## Projection

- Appointments for the selected day are projected with `buildCalendarV2Projection(...)` into `CalendarV2Appointment` and `CalendarV2CalendarBlock`.
- Staff from the calendar board is mapped to scheduler resources.
- Waitlist entries are projected into `CalendarV2DemandItem`.
- Waitlist entries and timed appointment request states are projected into Action Inbox items with `buildActionInboxItems(...)`.
- Staff exceptions from the calendar board are mapped to read-only blocked-time blocks.
- Demo/sample-labeled staff/resource values are still rendered when they come from the current read path, but the real-mode operator chrome does not add a noisy sample-name note.
- When `sample=1` is present, the adapter swaps in a clearly labeled read-only Bulgarian salon sample day with staff, appointments, blocked time, and Action Inbox examples.

## UX States

- Header: Bulgarian date navigation, date picker, `Днес`, and one subtle mode indicator. Sample mode stays visibly read-only; real mode reflects manual booking plus reschedule/confirm/cancel support, with `Поставяне на заявки` shown when placement save is enabled.
- Scheduler: fills the desktop calendar canvas and shows compact, non-blocking notices for loading, no staff resources, and no scheduled appointments.
- Action Inbox: shows request/recovery items when present and a compact empty state when there is nothing to act on.
- Booking Detail: shows selected booking facts or a compact no-selection state.
- Real empty day: keeps staff columns visible with calm Bulgarian copy and does not promote sample-mode actions in the production route.
- Sample mode: shows `Примерен ден · само преглед` plus `Назад към реалните данни`.
- Read error: shows a Bulgarian retry state without sample/demo fallback wording.

## Limited Write Contract

- Manual appointment creation only through the existing admin-create flow in real-data mode.
- Explicit reschedule only through `PATCH /appointments/:id/reschedule` with `{ startAt, staffId }`; drag/drop persistence remains disabled.
- No waitlist placement unless `NEXT_PUBLIC_ENABLE_CALENDAR_V2_PLACEMENT_SAVE === "true"` and the user explicitly saves a real-data placement preview.
- Explicit status transitions in real-data mode are limited to eligible booking confirm/cancel through `PATCH /appointments/:id/status` with `{ status: "confirmed" }` or `{ status: "cancelled" }`.
- No optimistic persistence.
- No notifications from Calendar V2 placement save.
- The current reschedule endpoint itself does not add notification behavior; Calendar V2 does not introduce one.

The native scheduler receives `readOnly` props in the current real-data route. Appointment drag handles and demand drag-to-place controls are disabled there.

## Visit Progress Direction

- The `Пристигнал` UI action was intentionally removed from Calendar V2 after product review.
- Main salon Calendar V2 UX should focus on planning, pending approvals, untimed request placement, confirmations, and rescheduling.
- Day-of visit progress may remain backend-capable for future clinic/front-desk workflows, but Calendar V2 does not expose it in the salon planning surface.
- Backend validation still accepts only `scheduled`, `checked_in`, `in_service`, `completed`, and `no_show`.
- Backend checked-in handling remains idempotent and updates only `intake_data.visitProgress`, preserving other intake metadata.

## What Not To Do Here

- Do not add backend APIs or change tenant resolution.
- Do not re-promote the legacy calendar as the default route from this layer.
- Do not move renderer-specific behavior into domain projections.
- Do not persist Calendar V2 commands from this layer.
- Do not place untimed waitlist/request demand as scheduled calendar blocks.

## Known Limitations

- The native scheduler still has fixed 08:00-20:00 geometry.
- Phone width still shows the separate-agenda notice.
- Global notification/FYI items are not fetched here because the current calendar has no shared global notification feed for this view.
- Drag/drop is disabled for real data in this pass instead of showing a local read-only preview command.
- The isolated fixture scheduler still exists for local component work, but the deployed real-data route no longer links to it after a read error.
