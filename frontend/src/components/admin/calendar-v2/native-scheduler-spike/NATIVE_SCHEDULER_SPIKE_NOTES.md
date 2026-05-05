# Native Scheduler V2 Spike Notes

## Scope

- Route: `/admin/calendar-v2`
- Gate: `NEXT_PUBLIC_ENABLE_CALENDAR_V2_SPIKE === "true"`
- Visibility: hidden and unlinked from admin navigation.
- Backend/API usage: none.
- Fixture data only.

## Package and Library Verdict

- No paid libraries used.
- No new packages used.
- No calendar rendering, scheduler, date-grid, or drag/drop dependency used.
- Rendering uses React, CSS, Tailwind classes already available in the app, browser pointer events, and Calendar V2 foundation types/projections.

## What Works

- Desktop/tablet-landscape resource day grid with staff columns, 15-minute slots, 08:00-20:00 hours, sticky toolbar, sticky staff header, sticky time gutter, mocked current-time line, fixture appointments, overlap lanes, and a blocked time region.
- Action Inbox mock shows demand/request items, pending approval, cancellation recovery, and collapsed updates.
- Demand items can be dragged from Action Inbox into the scheduler with native pointer events.
- Dropping a demand item emits a local `placeRequest` command-shaped object and opens a placement preview.
- Appointment cards can be moved locally by dragging only the visible handle.
- Dropping an appointment emits a local `moveAppointment` command-shaped object and applies a local-only move.
- Selecting the card body opens a lightweight local preview panel.
- Phone width renders only: "Phone Calendar V2 will use a separate agenda renderer."

## What Does Not Work

- No backend writes.
- No appointment creation.
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

## Appointment Move Verdict

Feasible for the narrow SalonIQ day scheduler. Existing appointment cards emit a typed `moveAppointment` command and move locally. The code comment marks the production requirement: server validation plus rollback/reconciliation on failure.

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

## Recommended Next Step

Add focused tests for geometry helpers and pointer command emission, then wire the renderer to a read-only Calendar V2 projection adapter fed by the current calendar board data.
