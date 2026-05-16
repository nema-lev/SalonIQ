# Calendar V2 Production Gap Audit

Date: 2026-05-16  
Scope: documentation audit of Calendar V2 now that it is the primary `/admin` calendar. This document does not propose changing the legacy calendar except where fallback/data-safety conditions require it.

## 1. Executive Summary

Calendar V2 is now the correct primary **development direction** for the admin calendar, but it is **not yet production-ready for real salons**.

| Readiness level | Verdict | Why |
| --- | --- | --- |
| Primary internal development calendar | **Ready** | `/admin` already renders Calendar V2 in real-data mode; the native day grid, staff columns, Action Inbox, Booking Detail panel, selected-slot locking, current-time indicator, no-past guard, and guarded waitlist placement flow are all present. |
| Beta/admin testing calendar | **Not yet ready for broad beta** | It is suitable for controlled internal testing of viewing and request placement, but it still lacks several owner-critical workflows that remain available only in the hidden legacy calendar: manual booking creation, confirm/cancel actions, and move/reschedule actions. Error recovery is also still too shallow for confident multi-admin testing. |
| Production calendar for real salons | **Not ready** | Calendar V2 is missing core operating actions, phone use is intentionally incomplete, notification behavior is not wired, and backend scheduling authority is still transitional because real allocation backfill has not happened, allocation-only read authority is not enabled, durable command idempotency is absent, and conflict responses are still mostly string-based rather than structured. |

The honest current positioning is:

- **Use Calendar V2 as the main internal calendar surface.**
- **Use it for limited admin testing only where the missing workflows are understood.**
- **Do not treat it as the sole production calendar for a real salon yet.**

## 2. Current Capability Map

| Capability | Legacy `/admin/calendar-legacy` | Calendar V2 (`/admin`, `/admin/calendar-v2`) |
| --- | --- | --- |
| Viewing day calendar | Yes | Yes |
| Staff/resource columns | Yes | Yes |
| Pending/request handling | Yes: waitlist + pending timed requests, with confirm action | Partial: Action Inbox shows waitlist and pending items, but pending timed-request actions are read-only in Calendar V2 |
| Waitlist placement | Yes: dedicated transactional placement endpoint | Partial: click-to-place preview; real save only behind `NEXT_PUBLIC_ENABLE_CALENDAR_V2_PLACEMENT_SAVE=true` |
| Manual new booking | Yes | **No** |
| Booking detail view | Yes: drawer with contact/history/actions | Partial: read-only Booking Detail panel with selected-booking facts |
| Cancel booking | Yes | **No** |
| Confirm booking | Yes | **No** |
| Reschedule/move booking | Yes: modal and drag flow | **No persisted move** |
| Completed / `no_show` / status workflows | Partial: calendar exposes confirm/cancel only; no completed/`no_show` calendar action in the inspected legacy surfaces | **No** |
| Mobile usage | Yes: dedicated mobile calendar, booking creation, details, request sheet | **No usable phone calendar yet**; phone width shows only a separate-agenda notice |
| Tablet usage | Yes: legacy responsive calendar | Partial: desktop-style Calendar V2 works best in landscape; portrait remains cramped/out of scope |
| Empty states | Yes | Yes: no staff, no bookings, empty Action Inbox, no selected booking |
| Error states | Partial toast-driven handling | Partial: read error panel and placement error mapping exist; recovery remains limited |
| Notification behavior | Manual booking/status paths can trigger existing backend notifications; request placement uses `notifyClient: false` | Placement save intentionally sends `notifyClient: false`; no Calendar V2 notification workflow |
| Conflict handling | Client-side preview plus backend rejection | Partial: local conflict hint plus backend rejection; no mature structured-conflict contract yet |
| Backend safety | Existing admin writes now route through allocation-aware backend paths where implemented | Waitlist placement is transaction-safe; broader Calendar V2 writes still wait on fuller scheduling foundations |

## 3. Critical Missing Workflows

These are not hypothetical feature ideas. They are workflows the existing legacy calendar already supports or that the inspected Calendar V2 docs explicitly identify as still missing.

| Missing workflow in Calendar V2 | Why it matters before real use | Priority |
| --- | --- | --- |
| Manual new booking from the calendar | The owner cannot create a direct booking from the primary calendar surface even though the legacy calendar can. That is a basic daily operation. | **P0** |
| Cancel booking from Booking Detail | The owner cannot cancel a booking from the primary calendar surface. The legacy drawer can. | **P0** |
| Confirm pending timed request | Action Inbox can surface the item, but Calendar V2 cannot complete the action. The legacy calendar can confirm it. | **P0** |
| Move/reschedule existing booking | The owner cannot repair schedule changes from the primary calendar surface. The legacy calendar can. | **P0** |
| Readable recovery after placement conflicts/stale state | The write flow exists, but recovery behavior is not yet strong enough for confident repeated use when state changes underneath the user. | **P1** |
| Phone request-placement flow | Phone users currently do not get a usable Calendar V2 workflow; the UI intentionally shows only a placeholder notice. | **P1** |
| Better Booking Detail actions and history integration | The read-only panel is informative but not sufficient as an operating panel because it does not expose the actions already available in legacy. | **P1** |
| Notification choice/status for Calendar V2 placement | Placement is intentionally silent today. That is acceptable for early controlled testing, not for a complete production workflow. | **P2** |
| Advanced week-view production behavior | Calendar V2 is currently day-first and its own docs defer richer week behavior. | **P2** |
| Persisted drag-to-move | Useful, but unsafe to prioritize before ordinary move/reschedule plus backend command/reconciliation maturity. | **P2** |
| Resize | Explicitly deferred and dependent on stronger scheduling foundations. | **P2** |
| Realtime collaboration | Helpful only after backend correctness and event/outbox architecture are ready. | **P2** |
| Recurring bookings | Intentionally outside the current release shape. | **P3** |
| Smart scheduling | Intentionally later-stage optimization. | **P3** |

### Practical owner/admin consequence

Today an owner can **see** the day, inspect bookings, and optionally place an untimed request if the feature flag is enabled. The same owner still needs the hidden legacy fallback to:

1. create a new booking,
2. confirm a pending timed request,
3. cancel a booking, and
4. move an existing booking.

That means Calendar V2 is the primary route, but it is not yet the only calendar surface an operator can rely on.

## 4. Backend Readiness Dependencies

### Real backfill not done

The backend now has `calendar_allocations`, buffer-aware occupied intervals, allocation lifecycle parity for standard create/status/reschedule flows, and the dedicated waitlist placement endpoint. However, existing appointments are **not backfilled** into allocations yet. Until that happens, old rows still require retained legacy appointment conflict checks during transition. This is safe as a bridge, but it means the system has not reached the intended single source of scheduling occupancy.

### Allocation-only authority not enabled

The architecture docs explicitly state that allocation-only authority remains deferred. Calendar V2 should not expand into broader editing behaviors that depend on a fully canonical allocation model until the data migration is complete and verified.

### Read-side availability is still transitional

`getAvailableSlots(...)` and the current calendar-board read path still operate during a mixed state: new writes maintain allocations, while older appointments can still exist without them. The transitional conflict fallback is intentional, but it means the read side has not yet become allocation-only authority either.

### Dry-run report is now operationalized but has not yet been run on the production Oracle DB

`backend/scripts/calendar-allocation-backfill-report.js` is already a read-only integrity report and now has a tenant-scoped internal diagnostics endpoint for deployed runs: `GET /api/v1/internal/diagnostics/calendar-allocation-backfill-report`. The endpoint is disabled by default behind `ENABLE_INTERNAL_DIAGNOSTICS=true`, requires existing tenant `OWNER`/`ADMIN` authentication, inspects only the authenticated tenant schema, and returns non-sensitive JSON. That is a strong operational improvement, but the project still lacks the fact that matters most: a verified report result against the production Oracle DB before any real backfill or authority switch.

### Durable command ledger / idempotency is not implemented

The waitlist placement payload includes an `idempotencyKey`, and the backend stores it in appointment metadata, but there is no durable command ledger, uniqueness guarantee, or stored replay result. After a lost response or double-submit, the system can still only recover by returning a later conflict such as “already handled,” not by replaying a prior successful command safely.

### Structured conflicts are not fully mature

Calendar V2 currently maps Bulgarian response messages plus status codes into UI copy. That is workable for the current narrow path, but it is not a mature conflict contract for drag/move, resize, stale-version handling, or deterministic retries. The architecture docs already call for stable structured conflict codes and explicit frontend recovery behavior before broad production editing.

### What should wait for the backend/data foundation

These should remain blocked until backfill readiness, allocation authority, durable idempotency, and structured conflicts are substantially more mature:

- persisted drag-to-move,
- resize,
- allocation-only read-side availability,
- realtime invalidation,
- smart scheduling,
- broad multi-command optimistic editing.

Calendar V2 can still add owner actions that reuse already-existing safe backend behavior, but each addition should be reviewed against these dependencies rather than treating the visual calendar as already authoritative.

## 5. UI/UX Readiness Dependencies

| Area | Current state | Audit |
| --- | --- | --- |
| Preview vs committed state | Good in the inspected placement flow: the panel says `Преглед на поставяне · не е записано`, `Часът още не е записан`, and only a deliberate save can commit when enabled. | This is one of the strongest parts of the current Calendar V2 UX. Keep this contract. |
| No-past placement | Clear in the current flow: past regions are shaded, past clicks show `Изберете бъдещ час.`, and a now-historical selected slot disables save with `Не може да запишете час в миналото.` | Good for the one supported write path. |
| Action Inbox understandability | The grouping is understandable for untimed request placement: `За действие`, `Заявка без точен час`, `Постави в графика`. | Still incomplete as an operating surface because some visible items are informational only and cannot yet be completed from Calendar V2. |
| Placement flow understandability | The flow is understandable on desktop: select request, select slot, inspect preview, save only if enabled. Selected slot locking avoids hover confusion. | Good foundation, but only for desktop and only for waitlist placement. |
| Booking Detail panel | Useful for reading selected booking facts, status, message cue, and notes. | Not enough for production operation because it lacks the actions present in the legacy drawer. |
| Empty states | Acceptable and intentional: no staff, empty day, empty Action Inbox, and no selected booking are all handled. | Production wording should stay honest; do not inject fake data into real mode. |
| Sample/demo labels | Sample mode is explicitly labeled and acceptable as a dev/demo path. In real mode, `Show sample day`, `Sample day · Read-only`, `Calendar V2 · Read-only`, and `Sample staff names` remain visible concepts. | For a production calendar, sample/demo affordances should be hidden or gated away from ordinary salon operators. |
| `Demo Nail Artist` / sample-like real staff labels | The adapter intentionally preserves sample-looking staff labels from the read path and adds `Sample staff names`. | Still a concern for production polish: if sample-like names are coming from real tenant data, they should be cleaned in data/setup, not normalized away in the UI; the Calendar V2 surface should not advertise sample wording to real operators. |

## 6. Mobile / Tablet Readiness

| Form factor | Current answer |
| --- | --- |
| Desktop | **Yes, usable today for viewing and the guarded waitlist-placement workflow.** It is still not a complete production operating calendar because major actions are missing. |
| Tablet landscape | **Partially usable.** The native scheduler is designed for desktop/tablet-landscape and prior QA notes say it can render there. It remains dependent on desktop-style interactions and is not yet a proven full production editing experience. |
| Tablet portrait | **Not ready.** The project docs explicitly call portrait cramped/out of scope and recommend a phone-like tap-to-assign model. |
| Phone | **No.** At widths below 768px Calendar V2 hides the desktop scheduler and shows only: `Телефонният Calendar V2 ще използва отделен дневен изглед.` |

Before mobile admin use is acceptable, Calendar V2 still needs:

1. a phone-specific agenda/day renderer,
2. tap-to-open request detail,
3. tap-to-select suggested slots,
4. an explicit confirm/save step using the same backend placement endpoint,
5. conflict and stale-state recovery on the phone flow,
6. booking detail access that does not depend on the desktop right rail.

Mobile drag/drop is **not** required before first acceptable mobile use; the existing docs correctly prefer tap-based placement first.

## 7. Error Handling and Trust Gaps

| Scenario | Current observed behavior | Remaining trust gap |
| --- | --- | --- |
| Conflict error | Calendar V2 maps conflict-like `409` messages to `Този час вече е зает.` and local preview can show overlap hints. | The frontend still depends on message parsing; there is no mature structured conflict code/recovery contract. |
| Past-time error | Frontend blocks obvious past slots and backend rejects past scheduling starts; UI maps backend past-time responses to Bulgarian copy. | Good for current placement flow. |
| Already-handled request | Backend row-lock path rejects it with conflict; Calendar V2 maps to `Заявката вече е обработена.` | The UI does not yet have a richer “placed elsewhere / open the booked appointment / refresh now” experience. |
| Backend `400` / `409` / `500` mapping | Placement save maps `400/404/409` into a generic unavailable message unless recognized as handled/past/conflict; all other failures become generic retry copy. | Too coarse for production trust, especially once more write actions exist. |
| Retry behavior | User may retry manually after an error. | No durable idempotent replay yet; repeated network retries cannot safely return stored success after a lost response. |
| Save pending states | The placement panel shows `Записване…`; saving state disables the button. | This is good, but only one write path has this polish. |
| Stale selected slot | The selected placement target is locked; if time passes and it becomes historical, save is disabled instead of silently moving the target. | Good local UX; stale server-side slot changes still need stronger structured recovery. |
| Request placed by someone else | Backend returns already-handled conflict after row lock. | The frontend shows a message, but the user is not shown exactly what changed or where the request went. |
| Backend save succeeds but refresh fails | `handleSavePlacement()` awaits both the write and refresh/invalidation work inside one `try`; if refresh rejects after the backend commit, the catch path reports failure. | This can mislead the owner into thinking the save failed even though the backend may have committed it. That is a concrete trust gap before production use. |

The largest immediate trust issue is not the conflict wording itself; it is the lack of a reliable post-commit reconciliation story when write success and refresh success diverge.

## 8. Legacy Fallback Strategy

### Recommendation

**Keep `/admin/calendar-legacy` as a hidden fallback for now.**

Deleting it soon would remove the only inspected admin-calendar path that currently exposes several required owner operations:

- manual booking creation,
- confirm booking,
- cancel booking,
- move/reschedule booking,
- a real mobile calendar surface.

### Exact conditions for removing the legacy calendar code

Remove the hidden legacy calendar only after all of the following are true:

1. Calendar V2 supports the P0 owner workflows above on desktop.
2. The phone flow is usable for at least the request-placement and booking-detail tasks expected from mobile admin use.
3. The allocation dry-run report has been run on the production Oracle DB and reviewed.
4. Any required real allocation backfill has been completed safely.
5. Allocation-only authority or an explicitly accepted transitional authority plan is in place for the workflows that Calendar V2 exposes.
6. Structured conflict handling and post-commit reconciliation have been verified for the enabled Calendar V2 write paths.
7. A focused pilot period shows no operational need to fall back to legacy for daily calendar work.

Until those conditions are met, the fallback should remain hidden from normal navigation but available for emergency comparison and continuity.

## 9. Next Implementation Roadmap

### Must do before a real salon pilot

1. Enable the internal diagnostics endpoint only for the review window, then run and review the allocation backfill dry-run report against the production Oracle DB.
2. Add Calendar V2 manual new booking flow.
3. Add Calendar V2 confirm and cancel actions from Booking Detail / Action Inbox.
4. Add a non-drag Calendar V2 move/reschedule path.
5. Fix structured error-state and post-commit refresh/reconciliation behavior for the currently enabled save paths.
6. Hide or gate sample/demo production wording from ordinary real-mode operator experience.

### Must do before removing the legacy fallback

1. Complete the P0 workflow parity items above.
2. Build an acceptable phone flow.
3. Complete safe allocation backfill work and validate the resulting authority model.
4. Verify that Calendar V2 can absorb the daily operational cases now handled only by legacy.

### Must do before persisted drag/drop

1. Mature structured conflicts.
2. Add durable command ledger / idempotent replay.
3. Establish authoritative allocation/read-side behavior.
4. Define rollback and reconciliation rules for stale or rejected moves.

### Must do before notifications from Calendar V2 placement

1. Decide the explicit placement-notification policy.
2. Add failure-safe post-commit notification behavior.
3. Surface notification failures separately from placement success.
4. Avoid undoing committed placement when notification delivery fails.

### Must do before realtime

1. Finish allocation correctness and command semantics.
2. Add transactional scheduling events/outbox.
3. Prove tenant-safe invalidation and reconnect recovery.
4. Keep polling as fallback until recovery is proven.

### Can wait until after the first salon pilot

- persisted drag-to-move,
- resize,
- advanced week editing behavior,
- recurring bookings,
- realtime collaboration,
- smart scheduling,
- mobile drag/drop.

## 10. Recommended Next Implementation Task

### Chosen task

**Run the now-operationalized allocation backfill dry-run report against the production Oracle DB and capture the result.**

### Why this is the next task

This remains the narrowest safe next step with the highest decision value:

- it uses a disabled-by-default authenticated read-only path,
- it answers a real unknown that blocks stronger scheduling authority,
- it reduces the risk of adding more write surfaces on top of unverified legacy data,
- and it gives the team concrete evidence before any real backfill, authority switch, drag/drop work, or fallback removal discussion.

The owner-usability P0s remain important, but the data-readiness question is the smallest next move that improves correctness without widening product behavior.

### Exact Codex implementation prompt for the next task

```text
You are working on the SalonIQ repository.
Read and follow the root AGENTS.md before doing anything else.

Reasoning level: high.

Work directly on main.

This is an operational-readiness task, not a feature task.
Do NOT implement Calendar V2 UI features.
Do NOT change frontend UI.
Do NOT change database schema or migrations.
Do NOT add packages.
Do NOT run a real backfill.
Do NOT add notifications.
Do NOT add realtime.
Do NOT add drag/drop persistence.
Do NOT add resize.

Goal:
Run the existing authenticated read-only calendar allocation backfill report against the production Oracle DB and capture a trustworthy readiness result before any real backfill work.

Inspect first:
- backend/scripts/calendar-allocation-backfill-report.js
- backend/test/calendar-allocation-backfill-report.spec.ts
- docs/calendar-v2-authoritative-scheduling-architecture.md
- docs/calendar-v2-production-gap-audit.md
- package scripts under backend/

Tasks:
1. Confirm `ENABLE_INTERNAL_DIAGNOSTICS=true` is enabled only for the report window.
2. Authenticate as the tenant owner/admin and call `GET /api/v1/internal/diagnostics/calendar-allocation-backfill-report`.
3. Capture the JSON readiness result without changing data.
4. Keep the report read-only and do not execute any real production backfill.
5. If the endpoint is unavailable or credentials are not available, state that clearly and stop rather than inventing a result.

Validation:
- Run git status.
- Run git diff --check.
- Do not run frontend/backend builds unless source files are changed.
- Do not run next lint.

Commit and push to main only if documentation changes are made.

Expected final response:
- Commit SHA if a commit was created
- Files changed
- Exact dry-run command
- Whether the report was actually run
- Observed readiness result, if run
- Confirmation no real backfill was executed
- Confirmation no runtime behavior changed
```

## Inspected Sources

Frontend:

- `frontend/src/app/(tenant)/admin/page.tsx`
- `frontend/src/app/(tenant)/admin/calendar-v2/page.tsx`
- `frontend/src/app/(tenant)/admin/calendar-legacy/page.tsx`
- `frontend/src/components/admin/calendar-v2/`
- `frontend/src/components/admin/calendar-v2/real-data/`
- `frontend/src/components/admin/calendar-v2/native-scheduler-spike/`
- `frontend/src/components/admin/admin-calendar-workspace.tsx`
- `frontend/src/components/admin/admin-booking-modal.tsx`
- `frontend/src/components/admin/calendar-detail-drawer.tsx`
- `frontend/src/components/admin/appointment-move-modal.tsx`
- `frontend/src/components/admin/calendar-request-sections.tsx`
- `frontend/src/components/admin/use-admin-calendar-board-data.ts`

Backend:

- `backend/src/modules/appointments/appointments.controller.ts`
- `backend/src/modules/appointments/appointments.service.ts`
- `backend/src/modules/appointments/dto/`
- `backend/scripts/calendar-allocation-backfill-report.js`
- `backend/test/`

Docs:

- `docs/calendar-v2-authoritative-scheduling-architecture.md`
- `docs/calendar-v2-request-workflow-plan.md`
- `frontend/src/components/admin/calendar-v2/README.md`
- `frontend/src/components/admin/calendar-v2/native-scheduler-spike/NATIVE_SCHEDULER_SPIKE_NOTES.md`
