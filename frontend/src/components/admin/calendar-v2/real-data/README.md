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
- Calls write APIs only for intentional real-data actions: manual booking create, eligible booking cancel, and request placement when `NEXT_PUBLIC_ENABLE_CALENDAR_V2_PLACEMENT_SAVE === "true"` and the placement preview is explicitly saved.
- Sample mode is built in the frontend adapter only; it does not read or write sample records through backend APIs.

## Projection

- Appointments for the selected day are projected with `buildCalendarV2Projection(...)` into `CalendarV2Appointment` and `CalendarV2CalendarBlock`.
- Staff from the calendar board is mapped to scheduler resources.
- Waitlist entries are projected into `CalendarV2DemandItem`.
- Waitlist entries and timed appointment request states are projected into Action Inbox items with `buildActionInboxItems(...)`.
- Staff exceptions from the calendar board are mapped to read-only blocked-time blocks.
- Demo/sample-labeled staff/resource values are still rendered when they come from the current read path. The UI adds a quiet toolbar note instead of blocking the scheduler.
- When `sample=1` is present, the adapter swaps in a clearly labeled read-only Bulgarian salon sample day with staff, appointments, blocked time, and Action Inbox examples.

## UX States

- Header: date navigation, date picker, Today, and one subtle mode indicator. Sample mode stays read-only; real mode reflects manual booking plus cancel support, with request placement added when the placement-save flag is enabled.
- Scheduler: fills the desktop calendar canvas and shows compact, non-blocking notices for loading, no staff resources, and no scheduled appointments.
- Action Inbox: shows request/recovery items when present and a compact empty state when there is nothing to act on.
- Booking Detail: shows selected booking facts or a compact no-selection state.
- Real empty day: keeps staff columns visible and offers a compact `Show sample day` action.
- Sample mode: shows `Sample day · Read-only` plus `Back to real data`.
- Read error: shows retry and `Show sample day` actions while stating that fixture data is not shown on the Calendar V2 route.

## Limited Write Contract

- Manual appointment creation only through the existing admin-create flow in real-data mode.
- No appointment move persistence.
- No waitlist placement unless `NEXT_PUBLIC_ENABLE_CALENDAR_V2_PLACEMENT_SAVE === "true"` and the user explicitly saves a real-data placement preview.
- One explicit status transition exists in real-data mode: eligible booking cancel through `PATCH /appointments/:id/status` with `{ status: "cancelled" }`.
- No optimistic persistence.
- No notifications from Calendar V2 placement save.

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
