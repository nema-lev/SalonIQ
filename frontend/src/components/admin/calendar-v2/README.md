# Calendar V2 foundation

This folder contains renderer-independent contracts for a future admin Calendar V2.

- This is a foundation only. It does not change the current admin calendar route or UI.
- The Calendar V2 preview is available on `main` at `/admin/calendar-v2` for direct Oracle testing.
- An explicit read-only sample scenario is available at `/admin/calendar-v2?sample=1` for visual review when the current tenant has no bookings.
- The preview route is enabled by default and can be disabled with `NEXT_PUBLIC_DISABLE_CALENDAR_V2_PREVIEW=true`.
- The current `/admin` calendar remains the default production calendar.
- Calendar V2 write actions are disabled by default. With `NEXT_PUBLIC_ENABLE_CALENDAR_V2_PLACEMENT_SAVE === "true"`, real-data mode can save only waitlist/request placement through the dedicated placement endpoint.
- Calendar V2 now supports a local-only Action Inbox request placement preview: choose an untimed demand item, click a staff/time slot, and review the proposed placement without saving.
- Placement preview UI is customer-facing Bulgarian copy only: command ids, local idempotency keys, ISO timestamps, and internal command names are not rendered.
- During placement mode, the lower right rail follows the active request context before and after slot selection instead of showing unrelated selected booking details.
- The previously explored `Пристигнал` action was intentionally removed from Calendar V2 UI after product review.
- Calendar V2 should prioritize planning, pending approvals, untimed request placement, confirmations, and rescheduling.
- Day-of visit progress can remain backend-capable for future clinic/front-desk use cases, but it is not part of the main salon Calendar V2 UX.
- Sample mode remains visual-only and read-only; it does not call read or write APIs.
- Request placement persistence remains disabled unless `NEXT_PUBLIC_ENABLE_CALENDAR_V2_PLACEMENT_SAVE === "true"` and sample mode is off. The preview command remains typed as `placeRequest` with `localOnly: true`; the explicit save action sends the dedicated waitlist placement call with `notifyClient: false`.
- Move, create, cancel, confirmed placement, no-show, completed, and in-service actions remain disabled in Calendar V2.
- The preview UI is desktop-first: the scheduler is the hero, the right rail stays lightweight, and the header keeps only date controls plus one subtle capability indicator.
- The production preview renders available staff/resources even when names look like sample/demo labels, with a quiet toolbar note when that happens.
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
- Calendar V2 can save request placement only in real-data mode when `NEXT_PUBLIC_ENABLE_CALENDAR_V2_PLACEMENT_SAVE === "true"`.
