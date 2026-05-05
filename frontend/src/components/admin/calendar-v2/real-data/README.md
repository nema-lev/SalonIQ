# Calendar V2 Real-Data Adapter

This folder connects the direct `/admin/calendar-v2` preview route to the existing admin calendar read path.

## Main Preview Route

- Calendar V2 read-only preview is deployed on `main` for hands-on Oracle testing.
- Route: `/admin/calendar-v2`.
- The current `/admin` calendar remains the default and production calendar.
- The preview route is available by default.
- To disable the preview route in an environment, set `NEXT_PUBLIC_DISABLE_CALENDAR_V2_PREVIEW=true`.
- The route is intentionally not added to admin navigation.
- The production preview route does not expose the fixture scheduler after read errors.

## Data Source

- Uses `useAdminCalendarBoardData(...)`.
- Reads the same endpoints as the current admin calendar:
  - `GET /appointments/calendar-board`
  - `GET /appointments/waitlist`
  - `GET /services/admin`
- Uses the existing `apiClient`, so current admin auth and tenant headers stay unchanged.
- Does not add backend endpoints.

## Projection

- Appointments for the selected day are projected with `buildCalendarV2Projection(...)` into `CalendarV2Appointment` and `CalendarV2CalendarBlock`.
- Staff from the calendar board is mapped to scheduler resources.
- Waitlist entries are projected into `CalendarV2DemandItem`.
- Waitlist entries and timed appointment request states are projected into Action Inbox items with `buildActionInboxItems(...)`.
- Staff exceptions from the calendar board are mapped to read-only blocked-time blocks.
- Demo-labeled staff/resource values are not rendered as production preview data. The UI shows a compact fallback state that says the current read returned demo-labeled staff/resources.

## Preview UX States

- Header: date navigation, date picker, Today, and one subtle `Calendar V2 Preview · Read-only` indicator.
- Scheduler: fills the desktop calendar canvas and shows compact notices for loading, no staff resources, demo-labeled resources, and no scheduled appointments.
- Action Inbox: shows request/recovery items when present and a compact empty state when there is nothing to act on.
- Booking Detail: shows selected booking facts or a compact no-selection state.
- Read error: shows a retry action and states that fixture data is not shown on the production preview route.

## Read-Only Contract

- No appointment creation.
- No appointment move persistence.
- No waitlist placement.
- No status transitions.
- No optimistic persistence.
- No backend writes from Calendar V2.

The native scheduler receives `readOnly` props on the hidden real-data route. Appointment drag handles and demand drag-to-place controls are disabled there.

## What Not To Do Here

- Do not add backend APIs or change tenant resolution.
- Do not change the current `/admin` calendar route behavior.
- Do not move renderer-specific behavior into domain projections.
- Do not persist Calendar V2 commands from this layer.
- Do not place untimed waitlist/request demand as scheduled calendar blocks.

## Known Limitations

- The native scheduler still has fixed 08:00-20:00 geometry.
- Phone width still shows the separate-agenda notice.
- Global notification/FYI items are not fetched here because the current calendar has no shared global notification feed for this view.
- Drag/drop is disabled for real data in this pass instead of showing a local read-only preview command.
- The isolated fixture scheduler still exists for local component work, but the deployed real-data preview route no longer links to it after a read error.
