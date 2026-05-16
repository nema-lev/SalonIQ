# Calendar V2 foundation

This folder contains the renderer-independent contracts and current admin Calendar V2 implementation.

- Calendar V2 is now the primary admin calendar direction and renders by default at `/admin`.
- `/admin/calendar-v2` remains available as an alias route for direct access and sample-mode review.
- The legacy admin calendar is preserved only as an emergency fallback at `/admin/calendar-legacy`; it is no longer the main operational route.
- An explicit read-only sample scenario is available at `/admin/calendar-v2?sample=1` for visual review when the current tenant has no bookings.
- The `/admin/calendar-v2` alias route is enabled by default and can be disabled with `NEXT_PUBLIC_DISABLE_CALENDAR_V2_PREVIEW=true`.
- Calendar V2 supports manual new booking in desktop real-data mode: use `Нов час` or click a future empty slot to open the existing admin booking modal with staff/date/time prefilled.
- Calendar V2 supports explicit click-to-reschedule in desktop real-data mode for eligible timed bookings: Booking Detail → `Премести час` → choose a future free slot → `Преглед на преместване` → `Запази промяната`.
- Calendar V2 supports confirming eligible real-data timed bookings from Booking Detail with an explicit confirmation step. Eligible statuses are `pending` and `proposal_pending`; confirmed/terminal bookings, sample mode, placement preview, empty detail state, and waitlist/request items do not expose the action.
- Calendar V2 supports cancelling eligible real-data bookings from Booking Detail with an explicit confirmation step. Eligible statuses are `pending`, `proposal_pending`, and `confirmed`; terminal bookings, sample mode, placement preview, empty detail state, and waitlist/request items do not expose the action.
- Manual new booking is not tied to `NEXT_PUBLIC_ENABLE_CALENDAR_V2_PLACEMENT_SAVE`; it uses the existing admin-create path because Calendar V2 is now the primary `/admin` calendar.
- With `NEXT_PUBLIC_ENABLE_CALENDAR_V2_PLACEMENT_SAVE === "true"`, real-data mode can additionally save waitlist/request placement through the dedicated placement endpoint.
- Calendar V2 now supports a local-only Action Inbox request placement preview: choose an untimed demand item, click a staff/time slot, and review the proposed placement without saving.
- Placement preview UI is customer-facing Bulgarian copy only: command ids, local idempotency keys, ISO timestamps, and internal command names are not rendered.
- After a placement slot is selected, the calendar outline is locked to that selected slot. Hover movement no longer moves the selected placement target.
- The current-time indicator renders only for the selected local date when it is today, refreshes while the page is open, and is hidden for past/future dates or times outside 08:00-20:00.
- New request placement and manual booking treat elapsed slots on today and all slots on past dates as unavailable. Calendar V2 keeps historical appointments visible, blocks past manual slot selection with `Изберете бъдещ час.`, blocks backend-rejected past creates/saves with `Не може да запишете час в миналото.`, and the backend remains the authority for the same rule.
- Reschedule mode is visually distinct from request placement mode, uses future-slot clicks rather than drag/drop persistence, blocks past targets with `Не може да преместите час в миналото.`, shows local conflict hints when possible, and still leaves the backend as final authority for conflict/no-past/allocation lifecycle checks.
- During placement mode, the lower right rail follows the active request context before and after slot selection instead of showing unrelated selected booking details.
- The previously explored `Пристигнал` action was intentionally removed from Calendar V2 UI after product review.
- Calendar V2 should prioritize planning, pending approvals, untimed request placement, confirmations, and rescheduling.
- Day-of visit progress can remain backend-capable for future clinic/front-desk use cases, but it is not part of the main salon Calendar V2 UX.
- Sample mode remains visual-only and read-only; it does not call read or write APIs, and it hides the manual booking entry points.
- Request placement persistence remains disabled unless `NEXT_PUBLIC_ENABLE_CALENDAR_V2_PLACEMENT_SAVE === "true"` and sample mode is off. The preview command remains typed as `placeRequest` with `localOnly: true`; the explicit save action sends the dedicated waitlist placement call with `notifyClient: false`.
- Drag/drop persistence, no-show, completed, and in-service actions remain disabled in Calendar V2.
- The current Calendar V2 UI is desktop-first: the scheduler is the hero, the right rail stays lightweight, and the header keeps only date controls plus one subtle capability indicator.
- The primary Calendar V2 route renders available staff/resources even when names look like sample/demo labels, with a quiet toolbar note when that happens.
- Real data mode remains the default. Empty real-data days keep staff columns visible and offer a compact `Show sample day` action instead of injecting fake production data.
- Sample mode uses clearly labeled Bulgarian salon sample data, shows `Sample day · Read-only`, and provides `Back to real data`.
- Sample mode supports the same local-only request placement preview and remains non-writing.
- Real-data mode supports the same request placement preview when current read endpoints return waitlist/demand items. With the placement-save flag off, refresh/reload does not persist the preview.
- The dedicated backend placement endpoint is wired only behind `NEXT_PUBLIC_ENABLE_CALENDAR_V2_PLACEMENT_SAVE`.
- The sample-day visual pass refines appointment cards, selected state, 15-minute short cards, the Action Inbox queue, and the selected booking detail summary without enabling writes.
- The desktop viewport pass keeps the preview inside the admin viewport, makes the scheduler grid the primary scroll region, and uses deliberate right-rail panel scrolling only when content exceeds the available height.
- Empty states are intentional and non-blocking for missing staff resources, empty appointment days, empty Action Inbox content, no selected booking, and read errors.
- Domain types, command shapes, projections, and Action Inbox helpers must stay independent of calendar rendering libraries.
- FullCalendar, Bryntum, DayPilot, Mobiscroll, Schedule-X, or another scheduler must be hidden behind an adapter when added later.
- Desktop and tablet landscape should use a scheduler-engine adapter.
- Phone should keep a separate custom agenda/day renderer instead of sharing the desktop scheduler renderer.
- Untimed demand belongs in demand/request/waitlist projections, not in scheduled calendar blocks.
- Future write interactions should go through typed commands before they are wired to API calls.
- Calendar V2 can create manual bookings only in real-data mode through `POST /appointments/admin`; after success it refetches `appointments-calendar-board`, invalidates board/context queries, and trusts backend truth instead of creating optimistic committed cards.
- Calendar V2 can reschedule eligible real-data timed bookings only through the existing `PATCH /appointments/:id/reschedule` endpoint with `{ startAt, staffId }`; after success it refetches `appointments-calendar-board`, invalidates board/context queries, keeps the selected date, and keeps the moved booking selected only when it remains visible after the refreshed backend read.
- Calendar V2 can confirm eligible real-data timed bookings only through the existing `PATCH /appointments/:id/status` endpoint with `{ status: "confirmed" }`; after success it refetches `appointments-calendar-board`, invalidates board/context queries, keeps the selected date and booking when it still exists, and trusts refreshed backend truth instead of fabricating optimistic committed state.
- Calendar V2 can cancel eligible real-data bookings only through the existing `PATCH /appointments/:id/status` endpoint with `{ status: "cancelled" }`; after success it refetches `appointments-calendar-board`, invalidates board/context queries, keeps the selected date, and trusts refreshed backend truth instead of fabricating optimistic committed state.
- Real-data Calendar V2 removes `cancelled` appointments from the active scheduler-grid projection even when the calendar-board endpoint still returns them, so a cancelled booking no longer occupies operational layout space. Cancellation-related items may still appear in non-blocking Action Inbox updates/history.
- Calendar V2 can save request placement only in real-data mode when `NEXT_PUBLIC_ENABLE_CALENDAR_V2_PLACEMENT_SAVE === "true"`.
- Backend note: standard saved request placement now creates a booked staff `calendar_allocations` row with separate display and buffer-expanded occupied intervals; this changes scheduling authority only, not Calendar V2 UI behavior.
- Backend note: confirming a standard pending/proposal booking reuses the existing status transition lifecycle, which promotes the matching held `calendar_allocations` row to booked. The existing status endpoint already performs the current status-change notification behavior; Calendar V2 does not add a new notification path here.
- Backend note: cancelling a standard appointment reuses the existing status transition lifecycle, which deactivates/releases the matching `calendar_allocations` row. The existing status endpoint already performs the current cancellation notification behavior; Calendar V2 does not add a new notification path here.
- Backend note: rescheduling a standard appointment reuses the existing reschedule lifecycle, which updates the appointment plus matching allocation atomically and keeps the retained legacy fallback conflict checks during the transition. The current reschedule endpoint does not trigger notifications, and Calendar V2 does not add notification behavior here.
- Backend note: all new scheduling writes reject start times in the past; historical appointments remain readable and terminal status transitions such as completed/no_show/cancelled stay allowed.

## Known limitations and next recommended tasks

- Calendar V2 still does not support persisted drag-to-move, resize, recurring bookings, new notification controls, or realtime collaboration.
- The phone-width experience is still intentionally incomplete and uses the separate agenda notice instead of a full placement flow.
- Manual new booking is desktop/tablet-landscape only for now; phone width intentionally keeps the separate limited experience rather than compressing the desktop modal flow into an unfinished mobile calendar.
- Existing disabled/coming-next states should remain honest until the backend scheduling path supports the corresponding write.
- Remaining production hardening after the owner-usability P0: finish the phone-specific calendar flow, structured conflicts/recovery, allocation backfill/report execution, and realtime later.
