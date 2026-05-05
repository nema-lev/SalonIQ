# Native Scheduler V2 Spike Notes

## Scope

- Route: `/admin/calendar-v2`
- Gate: `NEXT_PUBLIC_ENABLE_CALENDAR_V2_SPIKE === "true"`
- Visibility: hidden and unlinked from admin navigation.
- Default route data: read-only real data through the current admin calendar board, waitlist, and services read endpoints.
- Fixture data is preserved for the isolated native scheduler demo and for the route's safe debug fallback after a real-data read error.

## Package and Library Verdict

- No paid libraries used.
- No new packages used.
- No calendar rendering, scheduler, date-grid, or drag/drop dependency used.
- Rendering uses React, CSS, Tailwind classes already available in the app, browser pointer events, and Calendar V2 foundation types/projections.

## What Works

- Hidden route renders the native scheduler from real appointments, staff, services, waitlist entries, and staff exceptions when the feature flag is enabled and current admin auth/tenant context can read the existing calendar data.
- Real-data route is read-only: appointment drag handles and waitlist drag-to-place controls are disabled.
- Desktop/tablet-landscape resource day grid with staff columns, 15-minute slots, 08:00-20:00 hours, sticky toolbar, sticky staff header, sticky time gutter, mocked current-time line, fixture appointments, overlap lanes, and a blocked time region.
- Action Inbox mock shows demand/request items, pending approval, cancellation recovery, and collapsed updates.
- Demand items can be dragged from Action Inbox into the scheduler with native pointer events.
- Dropping a demand item emits a local `placeRequest` command-shaped object and opens a placement preview.
- Appointment cards can be moved locally by dragging only the visible handle.
- Dropping an appointment emits a local `moveAppointment` command-shaped object and applies a local-only move.
- Selecting the card body opens a lightweight local preview panel.
- Phone width renders only: "Phone Calendar V2 will use a separate agenda renderer."

## What Does Not Work

- No backend writes from Calendar V2.
- No appointment creation from Calendar V2.
- No server validation.
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

In the read-only real-data route, drag-to-place is disabled instead of emitting command previews.

## Appointment Move Verdict

Feasible for the narrow SalonIQ day scheduler. Existing appointment cards emit a typed `moveAppointment` command and move locally. The code comment marks the production requirement: server validation plus rollback/reconciliation on failure.

In the read-only real-data route, appointment move handles are disabled.

## Read-only real-data adapter pass

- Date of pass: 2026-05-05.
- Added `frontend/src/components/admin/use-admin-calendar-board-data.ts` to share the existing current-calendar read path without changing query keys, endpoints, refetch intervals, or current calendar mutations.
- Hidden route `/admin/calendar-v2` now renders `CalendarV2RealDataAdapter` when `NEXT_PUBLIC_ENABLE_CALENDAR_V2_SPIKE === "true"`.
- The adapter reads `GET /appointments/calendar-board`, `GET /appointments/waitlist`, and `GET /services/admin` through the existing `apiClient`.
- Appointments for the selected day are projected to `CalendarV2Appointment` and `CalendarV2CalendarBlock` with `buildCalendarV2Projection(...)`.
- Staff is mapped to native scheduler resources.
- Waitlist entries are projected to `CalendarV2DemandItem` and Action Inbox items.
- Timed appointment request states are projected into Action Inbox with `buildActionInboxItems(...)`.
- Staff exceptions from the existing calendar board response are projected as read-only blocked-time blocks.
- All Calendar V2 write actions remain disabled on the real-data route: no appointment move, no waitlist placement, no appointment creation, no status transition, no optimistic persistence, and no write API call.
- The fixture scheduler path remains available as local-only debug fallback after a real-data read error.
- Known limitations: scheduler hours are still fixed at 08:00-20:00, phone width still shows the separate agenda notice, and global notification/FYI items are not included because this pass only reuses the current shared calendar board/waitlist/services read path.

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
- Local run: frontend dev server with `NEXT_PUBLIC_ENABLE_CALENDAR_V2_SPIKE=true`.
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
