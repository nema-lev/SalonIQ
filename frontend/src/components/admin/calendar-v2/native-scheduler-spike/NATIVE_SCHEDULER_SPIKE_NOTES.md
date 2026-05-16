# Native Scheduler V2 Spike Notes

## Scope

- Primary route: `/admin`
- Alias route: `/admin/calendar-v2`
- Legacy fallback route: `/admin/calendar-legacy`
- Alias gate: `/admin/calendar-v2` is enabled by default unless `NEXT_PUBLIC_DISABLE_CALENDAR_V2_PREVIEW === "true"`.
- Visibility: the alias and legacy fallback remain unlinked from admin navigation.
- Default route data: real data through the current admin calendar board, waitlist, and services read endpoints.
- Fixture data is preserved for isolated native scheduler component work only. The deployed `/admin/calendar-v2` real-data preview no longer links to fixture data after a read error.

## Package and Library Verdict

- No paid libraries used.
- No new packages used.
- No calendar rendering, scheduler, date-grid, or drag/drop dependency used.
- Rendering uses React, CSS, Tailwind classes already available in the app, browser pointer events, and Calendar V2 foundation types/projections.

## What Works

- The primary route renders the native scheduler from real appointments, staff, services, waitlist entries, and staff exceptions when current admin auth/tenant context can read the existing calendar data.
- Real-data route keeps appointment drag handles and waitlist drag-to-place controls disabled.
- Desktop real-data route now supports manual new booking with a visible `Нов час` action and future empty-slot click. Slot clicks reuse the existing admin booking modal with staff/date/time prefilled and submit through the existing admin-create path.
- Real-data and sample routes now allow a click-to-place preview for Action Inbox waitlist/demand items. The owner selects `Постави в графика`, clicks a staff/time slot, and sees a lightweight placement preview.
- Real-data route can save only that waitlist/request placement when `NEXT_PUBLIC_ENABLE_CALENDAR_V2_PLACEMENT_SAVE === "true"`. Sample mode and flag-off real mode remain non-writing.
- The local preview emits a typed `placeRequest` command-shaped object with the request id, target staff/start/end, source surface, idempotency key, appointment draft details, and `localOnly: true`.
- The placement preview shows client, service, duration, staff, date/time, local conflict state when detected, and Bulgarian save/no-save copy that reflects the active mode. It does not render command ids, idempotency keys, ISO timestamps, or internal command names.
- Once a placement slot is selected, the dashed calendar preview stays locked on that selected slot. Pointer hover still previews candidates before selection, but hover no longer moves the selected target after selection.
- During placement mode, the lower right rail shows the active request context before slot selection and selected slot context after selection instead of unrelated Booking Detail content.
- Desktop/tablet-landscape resource day grid with staff columns, 15-minute slots, 08:00-20:00 hours, sticky toolbar, sticky staff header, sticky time gutter, date-aware current-time line, fixture appointments, overlap lanes, and a blocked time region.
- The current-time line renders only when the selected local calendar date is today, updates once per minute while eligible, and is hidden for past/future dates or when the current time is outside 08:00-20:00.
- In placement mode, elapsed visible time on today and the full grid on past dates are subtly shaded as unavailable. Click attempts on past slots show `Изберете бъдещ час.`, and a selected slot that becomes historical cannot be saved.
- Action Inbox mock shows demand/request items, pending approval, cancellation recovery, and collapsed updates.
- Demand items can still be dragged from Action Inbox into the isolated non-read-only component fixture with native pointer events.
- Dropping a demand item in that isolated fixture emits the same local `placeRequest` command-shaped object and opens a placement preview.
- Appointment cards can be moved locally by dragging only the visible handle.
- Dropping an appointment emits a local `moveAppointment` command-shaped object and applies a local-only move.
- Selecting the card body opens a lightweight local preview panel.
- Phone width renders only the separate agenda-renderer notice in Bulgarian.

## What Does Not Work

- No backend writes from Calendar V2 in sample mode or phone mode. In desktop real-data mode, the intentional write surfaces are manual booking create plus feature-flagged explicit waitlist/request placement save.
- No manual booking creation in sample mode or phone mode.
- No request placement persistence from Calendar V2 unless `NEXT_PUBLIC_ENABLE_CALENDAR_V2_PLACEMENT_SAVE === "true"` in real-data mode.
- No appointment, waitlist placement, waitlist status, appointment status, notification, or reschedule write API is called by the placement preview.
- Placement confirm/save remains disabled in sample mode and flag-off real mode.
- Backend placement validation remains authoritative and rejects past start times even if the UI is bypassed.
- Backend admin-create validation remains authoritative for manual bookings too; Calendar V2 blocks past slot clicks with `Изберете бъдещ час.` and maps rejected past creates to `Не може да запишете час в миналото.`.
- No persistence after reset/reload.
- No resize interaction.
- No keyboard drag interaction.
- No production accessibility pass.
- No phone agenda renderer.

## Grip Feasibility Verdict

Native implementation supports true handle-only dragging in this spike. Appointment card body click selects/previews the appointment and does not start drag. The visible grip starts drag and remains rendered for normal, selected, hovered, dragging, and short-card states.

The implementation is clean enough for a SalonIQ-specific scheduler because pointer ownership is local and the command layer is renderer-independent. Edge cases still needing production work: keyboard parity, touch scrolling conflict tests, pointer capture behavior across browsers, and precise hit testing while horizontally scrolled on small tablet widths.

## Action Inbox Drag-to-Place Verdict

Feasible. Dragging demand from Action Inbox to a staff/time slot creates a typed local `placeRequest` command with target staff, start, end, and draft appointment details. The confirm action is intentionally disabled and no API is called.

In the real-data route, drag-to-place remains disabled, but click-to-place preview is enabled for waitlist/demand items. With the placement-save flag off this remains non-writing; with the flag on, only explicit request placement save is enabled.

## Appointment Move Verdict

Feasible for the narrow SalonIQ day scheduler. Existing appointment cards emit a typed `moveAppointment` command and move locally. The code comment marks the production requirement: server validation plus rollback/reconciliation on failure.

In the real-data route, appointment move handles are disabled.

## Read-only real-data adapter pass

- Date of pass: 2026-05-05.
- Added `frontend/src/components/admin/use-admin-calendar-board-data.ts` to share the existing current-calendar read path without changing query keys, endpoints, refetch intervals, or current calendar mutations.
- Primary route `/admin` now renders `CalendarV2RealDataAdapter`.
- Alias route `/admin/calendar-v2` also renders `CalendarV2RealDataAdapter` unless `NEXT_PUBLIC_DISABLE_CALENDAR_V2_PREVIEW === "true"`.
- The adapter reads `GET /appointments/calendar-board`, `GET /appointments/waitlist`, and `GET /services/admin` through the existing `apiClient`.
- Appointments for the selected day are projected to `CalendarV2Appointment` and `CalendarV2CalendarBlock` with `buildCalendarV2Projection(...)`.
- Staff is mapped to native scheduler resources.
- Waitlist entries are projected to `CalendarV2DemandItem` and Action Inbox items.
- Timed appointment request states are projected into Action Inbox with `buildActionInboxItems(...)`.
- Staff exceptions from the existing calendar board response are projected as read-only blocked-time blocks.
- All Calendar V2 write actions remain disabled on the real-data route: no appointment move, no waitlist placement, no appointment creation, no status transition, no optimistic persistence, and no write API call.
- The fixture scheduler remains isolated for local component work; the real-data route shows an honest read-error state instead of linking to fixtures.
- Known limitations: scheduler hours are still fixed at 08:00-20:00, phone width still shows the separate agenda notice, and global notification/FYI items are not included because this pass only reuses the current shared calendar board/waitlist/services read path.

## Main read-only preview promotion

- Date of promotion: 2026-05-05.
- Merged source branch: `calendar-v2-native-scheduler-spike`.
- Target branch: `main`.
- Route: `/admin/calendar-v2`.
- Calendar V2 read-only preview is enabled by default for Oracle testing.
- Disable flag: set `NEXT_PUBLIC_DISABLE_CALENDAR_V2_PREVIEW=true` to show the disabled state.
- The current `/admin` calendar remains the default production calendar.
- Calendar V2 is not linked from admin navigation.
- Calendar V2 write actions remain intentionally disabled: no appointment creation, no persisted appointment move, no waitlist placement, no status transition, no optimistic persistence, and no write API call from the preview route.
- User-facing route language now says `Calendar V2 Preview` and `Read-only` instead of `spike`.

## Primary-route promotion

- Date of promotion: 2026-05-16.
- Primary route: `/admin`.
- Alias route: `/admin/calendar-v2`.
- Legacy fallback route: `/admin/calendar-legacy`.
- Calendar V2 is now the main admin calendar direction; the legacy calendar remains only for emergency comparison/debugging.
- User-facing route language now says `Calendar V2`, `Manual booking enabled`, `Manual booking + request placement`, or `Read-only` when applicable rather than presenting the main route as a preview.
- Existing limitations remain intentional: no cancel, no confirm pending timed request, no move/reschedule flow, no persisted drag-to-move, no resize, no recurring bookings, no notifications, no realtime collaboration, and no complete phone booking/placement flow.
- Recommended next P0 work: add cancel, confirm pending timed request, and non-drag move/reschedule before later phone and drag/resize work.

## Manual New Booking Pass

- Date of pass: 2026-05-16.
- Desktop real-data Calendar V2 now exposes `Нов час` in the toolbar and lets the owner click a future empty scheduler slot to open the existing `AdminBookingModal`.
- Empty-slot intent prefills staff, date, and exact start time; the reused modal preserves the existing service/client selection behavior and still submits through `POST /appointments/admin`.
- Calendar V2 does not create optimistic committed cards. After a successful create, it closes the modal, refetches the current calendar board, invalidates `appointments-calendar-board`, and invalidates `appointment-context`; the selected date stays unchanged.
- Sample mode remains non-writing and hides manual booking entry points. Phone width keeps the existing separate notice rather than exposing a compressed unfinished desktop booking flow.
- Request placement keeps priority over ordinary slot clicks, so an active Action Inbox placement flow behaves exactly as before.
- Frontend slot clicks block past time with `Изберете бъдещ час.`; backend create remains the authority for no-past/conflict validation and the reused modal maps create failures to calm Bulgarian copy.
- This pass does not add notifications, realtime, drag/drop persistence, resize, recurring bookings, backend endpoints, schema changes, or migrations.

## Current Calendar Parity QA

- Date of pass: 2026-05-05.
- Branch checked: `calendar-v2-native-scheduler-spike`.
- Code parity checks: `useAdminCalendarBoardData(...)` keeps the current calendar board endpoint as `GET /appointments/calendar-board`, keeps the query key shape `['appointments-calendar-board', rangeStartIso, rangeEndExclusiveIso]`, and keeps the same `from`/`to` range values passed by `admin-calendar-workspace.tsx`.
- Query behavior checked: calendar board `staleTime` remains 10 seconds, `refetchInterval` remains 10 seconds, and `refetchOnWindowFocus` remains `always`; waitlist and service query timings remain in the shared hook with the same values used by the current calendar path.
- Refetch behavior checked: `admin-calendar-workspace.tsx` still routes post-mutation refreshes through the same `invalidateCalendar` flow, including calendar board refetch plus invalidation of `appointments-calendar-board`, `appointments-waitlist`, and `appointment-context`.
- Shape assumptions checked: the current calendar still reads `calendarBoard.appointments`, `calendarBoard.staff`, and `calendarBoard.exceptions` from the shared hook result.
- Browser checks were done with a transient local mock backend and the frontend dev server running with the preview route enabled.
- Current calendar desktop screenshot captured: `screenshots/parity-current-admin-desktop.png`. It shows the visible admin calendar desktop layout with staff columns, scheduled appointments, and waitlist/request sections.
- Current calendar interaction checks done: a visible appointment detail drawer opened in browser, and current calendar quick-action wiring remained active against the local mock backend.
- Calendar V2 desktop screenshot captured: `screenshots/parity-calendar-v2-desktop-real-data.png`. It shows the read-only Calendar V2 preview with real-data appointments, staff resources, and Action Inbox items from the shared read path.
- Calendar V2 phone screenshot captured: `screenshots/parity-calendar-v2-phone-fallback.png`. It shows the separate agenda renderer notice at 390x844.
- Calendar V2 read-only checks from `/private/tmp/saloniq-calendar-v2-readonly-results.json`: read-only badge visible, real appointments rendered, staff resources rendered, waitlist items rendered, blocked staff exception rendered, appointment drag grip count `0`, demand placement button count `0`, preview panel opened, and `writesAfterV2` was empty.
- Issues found: no application code parity issue was found. One browser automation attempt against the current calendar clicked a mock quick-action control while checking detail behavior; that produced mock-only PATCH requests and was not part of the clean Calendar V2 read-only write check.
- Fixes made: no application source fix was required in this QA pass.
- Remaining risks: the browser data source was a transient mock backend, not the live production database; the blocked staff exception was verified by DOM query and is below the first desktop screenshot viewport; tablet portrait remains caveated as in the spike notes.
- Verdict: pass with caveats.

## Preview UI Cleanup Pass

- Date of pass: 2026-05-05.
- Visual cleanup: simplified the toolbar to date navigation, date picker, Today, and one subtle `Calendar V2 Preview · Read-only` indicator; removed the noisy `Real data`/status pill set from the production preview.
- Calendar hierarchy: the scheduler remains left and Action Inbox remains right, but read-only staff columns now expand to fill the desktop calendar canvas instead of leaving unused horizontal space.
- Right rail: Action Inbox and Booking Detail use lighter headers, compact counts, and designed empty states.
- Honest data states: the real-data route no longer offers fixture data after read errors. Demo-labeled staff/resource values now render with a quiet toolbar note instead of being treated as blocking.
- Empty states covered: loading, no staff resources, no scheduled appointments, empty Action Inbox, no selected booking, and real-data read error.
- Read-only contract preserved: drag grips and waitlist placement controls stay hidden on the real-data route, and no Calendar V2 write API calls are made.
- Screenshots captured under `screenshots/`: `calendar-v2-ui-cleanup-1440x900.png`, `calendar-v2-ui-cleanup-1366x768.png`, `calendar-v2-ui-cleanup-390x844.png`, and `calendar-v2-ui-cleanup-empty-1440x900.png`.
- Visual QA result from `/private/tmp/saloniq-calendar-v2-ui-qa-results.json`: requested viewports rendered, phone fallback remained visible, demo labels were absent, the old fixture fallback button was absent, appointment drag grip count was `0`, waitlist placement button count was `0`, and `writesAfterV2` was empty.

## Sample Staff Label Pass

- Date of pass: 2026-05-06.
- Demo/sample staff names from the current read path are rendered in the scheduler because they are still useful calendar data for preview evaluation.
- When staff/resource names look sample-like, the route adds a quiet `Sample staff names` toolbar note and keeps the grid, appointments, Action Inbox, and Booking Detail visible.
- Empty appointment days remain non-blocking: staff columns stay visible and the grid shows `No bookings scheduled for this date`.
- Right rail empty states remain compact so an empty Action Inbox or no selected booking does not consume the full side panel.
- Calendar V2 remains read-only: no appointment creation, move persistence, waitlist placement persistence, status changes, or write API calls from the real-data route.
- Screenshots captured under `screenshots/`: `calendar-v2-sample-labels-1440x900.png`, `calendar-v2-sample-labels-1366x768.png`, `calendar-v2-sample-labels-390x844.png`, and `calendar-v2-sample-labels-empty-1440x900.png`.

## Sample Day Preview Pass

- Date of pass: 2026-05-06.
- Explicit sample mode is available at `/admin/calendar-v2?sample=1`; real data remains the default at `/admin/calendar-v2`.
- Empty real-data states stay non-blocking and can show a compact `Show sample day` action. Sample data is never implied to be production data.
- Sample mode is labeled `Sample day · Read-only` with `Back to real data` in the toolbar note.
- Sample staff/resources are Bulgarian salon names: `Елена`, `Мария`, `Никол`, and `Ани`, with the existing 08:00-20:00 scheduler hours.
- Sample appointments cover 15-minute, 30-minute, 60-minute, 90-minute, and 120-minute cards, adjacent spacing, a message cue, and a blocked break.
- Sample Action Inbox includes read-only examples for an untimed request, pending approval, cancellation recovery, and a client message needing response.
- Booking Detail shows selected sample appointment time, service, staff, status/progress, message cue, and notes without enabling edits.
- Calendar V2 remains read-only: no appointment creation, move persistence, waitlist placement persistence, status changes, or write API calls from sample mode.
- `/admin` now renders Calendar V2; `/admin/calendar-legacy` preserves the old calendar only as fallback.
- Screenshots captured under `screenshots/`: `calendar-v2-sample-day-real-1440x900.png`, `calendar-v2-sample-day-1440x900.png`, `calendar-v2-sample-day-1366x768.png`, and `calendar-v2-sample-day-390x844.png`.
- Visual QA result from `/private/tmp/saloniq-calendar-v2-sample-day-qa-results.json`: real empty state kept the grid and `Show sample day` action visible, sample mode rendered staff/appointments/Action Inbox/Booking Detail, phone fallback remained visible, appointment drag grip count was `0`, waitlist placement button count was `0`, and `writesAfterV2` was empty.

## Sample Day Visual Refinement Pass

- Date of pass: 2026-05-06.
- Appointment cards now use calmer tinted surfaces, clearer left status stripes, compact time/duration/cue metadata, and a softer selected treatment instead of the previous heavy outline.
- The 15-minute short-card variant is intentional: it keeps an initials cue, the time range, and one compact status/message cue where available.
- Normal and long sample appointments keep client name first, service secondary, and operational cues readable without turning the grid into a colorful debug view.
- The grid uses clearer hour lines, quieter minor slot lines, and a taller desktop shell so the calendar remains the hero on 1440x900 and 1366x768.
- Action Inbox cards now have stronger hierarchy, quieter read-only tags, and compact scrolling that avoids cutting visible cards at the checked desktop sizes.
- Booking Detail now starts with a selected-booking summary card for client, service, time, and staff, followed by status/message/note cues in a less table-like layout.
- Calendar V2 remains read-only: no appointment creation, persisted moves, waitlist placement, status changes, drag grips, placement controls, or write API calls are enabled in real or sample mode.
- `/admin` now renders Calendar V2; `/admin/calendar-legacy` preserves the old calendar only as fallback.
- Screenshots captured under `screenshots/`: `calendar-v2-visual-refine-sample-1440x900.png`, `calendar-v2-visual-refine-sample-1366x768.png`, `calendar-v2-visual-refine-real-1440x900.png`, and `calendar-v2-visual-refine-sample-390x844.png`.
- Visual QA result from `/private/tmp/saloniq-calendar-v2-visual-refine-qa-results.json`: sample badge, selected Booking Detail, non-blocking real empty state, and phone fallback were visible; appointment drag grip count was `0`, waitlist placement button count was `0`, and `writesAfterV2` was empty.
- Remaining UX limitations: phone still intentionally shows the separate agenda-renderer notice, tablet portrait remains out of scope, and Booking Detail can still scroll when selected notes are longer than the available rail height.

## Viewport and Scroll Hardening Pass

- Date of pass: 2026-05-06.
- The desktop preview now reclaims the route-local admin bottom buffer and fits inside the checked 1440x900 and 1366x768 admin viewport without creating a second outer page scroll.
- The scheduler grid remains the primary scroll region, with sticky staff headers and readable time gutter preserved.
- Read-only resource columns now shrink within a safe minimum so common four-staff sample layouts avoid a horizontal scheduler scrollbar at 1366x768.
- The right rail now uses explicit stacked grid rows: Action Inbox gets more room for visible queue cards, Booking Detail stays usable below it, and each panel scrolls internally only when its own content exceeds the available height.
- Calendar V2 remains read-only: no appointment creation, persisted moves, waitlist placement, status changes, drag grips, placement controls, or write API calls are enabled in real or sample mode.
- `/admin` now renders Calendar V2; `/admin/calendar-legacy` preserves the old calendar only as fallback.
- Screenshots captured under `screenshots/`: `calendar-v2-layout-hardening-sample-1440x900.png`, `calendar-v2-layout-hardening-sample-1366x768.png`, `calendar-v2-layout-hardening-real-1440x900.png`, and `calendar-v2-layout-hardening-sample-390x844.png`.
- Visual QA result from `/private/tmp/saloniq-calendar-v2-layout-hardening-qa-results.json`: outer admin/page scroll overflow was `0` at the checked desktop sizes, the scheduler grid retained vertical scroll, the phone fallback remained visible, appointment drag grip count was `0`, waitlist placement button count was `0`, and `writesAfterV2` was empty.
- Remaining UX limitations: phone still intentionally shows the separate agenda-renderer notice, tablet portrait remains out of scope, and long selected-booking notes can still scroll inside Booking Detail.

## Local Request Placement Preview Pass

- Date of pass: 2026-05-08.
- Action Inbox waitlist/demand cards now expose `Постави в графика` in real-data and sample Calendar V2 preview mode.
- Clicking the action enters local placement mode, highlights the active request, and shows `Изберете свободен час в календара`.
- Clicking a scheduler staff/time slot creates a local typed `placeRequest` preview command with request id, target staff/start/end, source surface, idempotency key, appointment draft details, and `localOnly: true`.
- `NativeSchedulerPlacementPreview` shows client, service, duration, staff, date/time, no-save copy, local conflict copy when applicable, disabled save copy, and `Отказ`.
- The visible preview copy no longer exposes `calendar-v2-spike:*`, `placeRequest -> ...`, idempotency keys, or raw target timestamps.
- The lower right rail now follows placement context before and after slot selection, so an unrelated selected booking cannot compete with placement.
- Missing service/request duration uses a visible 60-minute fallback.
- Existing appointment movement remains disabled on the read-only real-data/sample route because appointment drag handles are still hidden.
- Confirm/save, appointment creation, waitlist placement persistence, waitlist status changes, appointment status changes, cancellation, notifications, and reschedule APIs remain disabled.
- Sample mode supports placement preview and remains non-writing.
- Real-data mode supports placement preview when waitlist/demand items are returned by the read endpoints.
- `/admin` now renders Calendar V2; `/admin/calendar-legacy` preserves the old calendar only as fallback.
- Screenshots captured under `screenshots/`: `calendar-v2-local-placement-sample-active-1440x900.png`, `calendar-v2-local-placement-sample-preview-1440x900.png`, `calendar-v2-local-placement-sample-1366x768.png`, `calendar-v2-local-placement-real-1440x900.png`, and `calendar-v2-local-placement-sample-390x844.png`.
- Visual/network QA result from `/private/tmp/saloniq-calendar-v2-local-placement-qa-results.json`: sample placement preview visible, real placement preview visible with mock demand, phone fallback visible, and `writesAfterPlacementPreview` was empty.
- Remaining UX limitations: phone still intentionally shows the separate agenda-renderer notice, the future backend placement endpoint is not implemented, and backend conflict/working-hours validation is still required before persistence.

## Placement Preview UX Polish Pass

- Date of pass: 2026-05-08.
- Placement preview was changed from a row/table-like debug layout to a lightweight confirmation preview with client/service hierarchy, staff/time/date, duration, conflict copy when needed, no-save warning, disabled future save action, and `Отказ`.
- Visible debug/internal strings were removed from customer-facing UI: no `calendar-v2-spike:*`, no `placeRequest -> ...`, no local idempotency keys, no command names, and no ISO timestamps are rendered.
- The right rail now switches to placement context as soon as placement mode starts, keeps that context after slot selection, and no longer shows unrelated selected booking details during the active placement flow.
- Sample/status copy no longer surfaces checked-in wording in the main Calendar V2 card/detail UI; salon-facing labels use calmer Bulgarian status copy such as `потвърден`, `насрочен`, and `очакван` where applicable.
- Save/confirm placement remains disabled. Calendar V2 still calls no appointment creation, waitlist placement, waitlist status, appointment status, notification, cancel, or reschedule write API from this flow.
- Sample mode and real-data mode remain non-writing; `/admin` now renders Calendar V2 and `/admin/calendar-legacy` preserves the old calendar only as fallback.
- A future dedicated backend placement endpoint is still required before Calendar V2 can persist request placement.
- Screenshots captured under `screenshots/`: `calendar-v2-placement-polish-sample-active-1440x900.png`, `calendar-v2-placement-polish-sample-preview-1440x900.png`, `calendar-v2-placement-polish-sample-preview-1366x768.png`, `calendar-v2-placement-polish-real-1440x900.png`, and `calendar-v2-placement-polish-sample-390x844.png`.

## Placement Slot Lock Pass

- Date of pass: 2026-05-10.
- The placement hover candidate and selected target are now visually separated.
- Before slot selection, the dashed preview can follow pointer hover.
- After slot selection, the dashed preview is locked to the selected target and does not move when the pointer travels toward `Запази час`.
- The save request still uses the selected placement preview command and duration; no backend endpoint, payload, notification, or API behavior changed.

## Current-Time Indicator Pass

- Date of pass: 2026-05-10.
- Replaced the fixed mocked current-time line with a date-aware indicator based on the user's local current time.
- The line renders only when the selected scheduler date is today.
- Past and future selected dates render no current-time line or marker.
- The indicator updates once per minute while the page is open and clears its timer on unmount.
- The indicator is hidden outside visible scheduler hours instead of being clamped to the top or bottom of the grid.
- No backend, endpoint, payload, placement save, notification, or current `/admin` calendar behavior changed.

## No-Past Placement Pass

- Date of pass: 2026-05-16.
- New waitlist/request placement treats past dates as unavailable and elapsed slots before the current-time line on today as invalid placement targets.
- Past slot clicks stay non-writing and show `Изберете бъдещ час.`; if a previously selected target becomes historical while the preview is open, the selected slot stays visible but save is disabled with `Не може да запишете час в миналото.`.
- The real-data adapter maps the backend past-time validation response to the same Bulgarian copy.
- This pass does not add notifications, realtime, appointment move persistence, resize, recurring booking behavior, or any new write surface.

## Visit Progress Product Review

- Date of pass: 2026-05-08.
- The `Пристигнал` Calendar V2 UI action was removed after product review.
- Small salon owners and specialists are unlikely to mark every client as arrived during the working day, so this action is not part of the core salon workflow.
- Calendar V2 should focus on planning, pending approvals, untimed request placement, confirmations, and rescheduling.
- Day-of visit progress remains backend-capable for future clinic/front-desk workflows, but Calendar V2 does not expose a visit-progress write action.
- Scheduler drag, appointment move persistence, waitlist/request placement, appointment creation, cancel, confirm, no-show, completed, and in-service actions remain disabled.
- Backend DTO validation and idempotent checked-in hardening remain in place.

## Short-Card Readability Verdict

Feasible. The 15-minute fixture uses a short-card variant that keeps initials, a useful time cue, and the drag grip visible. Text is intentionally compact instead of disappearing.

## Scroll Verdict

The spike keeps the calendar as the hero. The admin shell has its existing page scroll root, but the spike content is height-bounded and overflow-hidden so the scheduled day grid is the primary scroll area. There are no dashboard blocks above the calendar.

## Known Risks

- Collision/conflict handling is visual only.
- The lane algorithm is intentionally small and handles local fixture overlap, not every production edge case.
- Drag preview is pointer-based and needs browser/touch regression tests.
- Current-time line is mocked.
- Fixture commands are emitted locally and logged; production command transport is not implemented.
- The existing admin header title falls back to `Admin` for the hidden route because the route is intentionally not added to visible navigation/header mappings.

## Visual QA Pass

- Date of pass: 2026-05-05.
- Local run: frontend dev server with the preview route enabled.
- Tenant/auth shell: rendered through the normal admin shell using a transient local mock backend for `/tenants/config`, `/auth/login`, and `/auth/me`; the spike itself still uses fixture data only and makes no appointment API calls.
- Viewports checked: 1440x900 desktop, 1366x768 laptop, 1024x768 tablet landscape, 768x1024 tablet portrait, 390x844 phone.
- Screenshots saved under `frontend/src/components/admin/calendar-v2/native-scheduler-spike/screenshots/`.
- Saved screenshots: `desktop-1440x900.png`, `laptop-1366x768.png`, `tablet-landscape-1024x768.png`, `tablet-portrait-768x1024.png`, `phone-390x844.png`, `desktop-1440x900-placement-preview.png`, `desktop-1440x900-after-interactions.png`.
- Interaction checks passed: body click opens preview, body drag does not move appointments, appointment grip move emits local command, short-card grip move emits local command, Action Inbox demand drag opens placement preview with target staff/time, invalid outside drop does not create broken state.
- Issues found: staff header name and hours were visually glued together; first time label was clipped under the sticky header; Action Inbox content could clip at shorter laptop height.
- Fixes made: staff subline now renders as its own line, the first time-gutter label is offset into view, and Action Inbox content can scroll inside its docked panel instead of clipping.
- Remaining risks: tablet portrait still uses the desktop/tablet scheduler renderer and is cramped; production still needs touch-device regression tests, keyboard parity, and server validation/rollback tests.
- Verdict: pass with caveats.

## Regression Guard Pass

- Date of pass: 2026-05-05.
- Existing frontend test framework: none found. `frontend/package.json` has no test script, and no Jest/Vitest/Playwright/Cypress setup was present. No new test framework or package was added.
- Checks added: lightweight pure TypeScript regression checks in `native-scheduler-regression-checks.ts` with a local Node runner in `run-native-scheduler-regression-checks.mjs`.
- Geometry coverage added: pixel conversion, business start/end mapping, 15-minute snapping, business-hour clamping, pointer y clamping above/below the grid, staff-column x resolution, invalid x returning `null`, short appointment minimum rect height, adjacent bookings not overlapping, and real overlaps receiving lanes.
- Command-shape coverage added: `placeRequest` preview includes request id, target staff/start/end, source surface, idempotency key, and appointment draft details; `moveAppointment` preview includes appointment id, target staff/time, source surface, idempotency key, and optimistic previous target.
- Invalid drop coverage added: pointer x outside staff columns returns `null`, so the helper path does not produce a scheduler target or command.
- Grip guard added: event cards now expose `data-native-scheduler-role="drag-grip"` and `data-native-scheduler-role="event-body"` markers, plus an inline contract comment that only the grip owns pointer drag while the body remains select-only.
- How to run: from `frontend/`, run `node src/components/admin/calendar-v2/native-scheduler-spike/run-native-scheduler-regression-checks.mjs`.
- What remains manual: browser proof that body click opens preview without drag, hover/selection/drag states keep the grip visible, the short-card grip remains visible and usable, Action Inbox drag target labels match the visual slot, touch scrolling does not fight pointer drag, and phone width keeps the separate agenda note.
- Remaining risks: the checks are runner-based self-checks, not integrated into a package test script; React DOM behavior still needs a real component/browser test harness before production integration.
- Recommended next step: add a normal frontend test runner or browser-level interaction tests when the project adopts one, then wire this runner into CI or migrate these cases into that framework.

## Recommended Next Step

Wire these regression checks into the project's future frontend test workflow, then connect the renderer to a read-only Calendar V2 projection adapter fed by the current calendar board data.
