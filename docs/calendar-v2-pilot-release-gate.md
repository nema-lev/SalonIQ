# Calendar V2 pilot release gate

Date: 2026-05-19
Scope: operator-focused release gate and manual QA checklist for the primary `/admin` Calendar V2 route.

This document is a gate checklist only. It does not change Calendar V2 behavior, API calls, database schema, tenant resolution, deployment configuration, notifications, realtime behavior, drag/drop persistence, resize, or the `/admin/calendar-legacy` fallback.

## 1. Executive gate verdict format

Use one of these exact verdicts before pilot use:

| Verdict | Meaning | Required evidence |
| --- | --- | --- |
| `GO for internal desktop dogfooding` | Internal owner/admin users may test Calendar V2 on desktop/laptop with test-safe data and known fallback. | Route checks pass for `/admin`, `/admin/calendar-v2`, sample mode, and legacy fallback; core write-flow smoke tests pass on desktop with test records; no blank/black page; no real-mode prototype/sample copy; sample mode is visibly read-only; no production data was manually corrected during QA. |
| `GO for controlled desktop salon pilot` | One controlled salon may use Calendar V2 on desktop/laptop under operator supervision. | All internal dogfooding evidence plus live deployed frontend/backend URLs recorded; correct tenant slug/domain and schema identified; OWNER/ADMIN login verified; allocation report completed or explicitly deferred because no meaningful real data exists yet; notification expectations confirmed with the pilot operator; rollback plan understood; sign-off table completed. |
| `NO-GO until fixed` | Calendar V2 must not be used for the pilot until a blocker is fixed. | Any blocker is observed: route does not render, blank/black deployed page, wrong tenant, missing owner/admin access, failed core write flow, past scheduling accepted, sample mode writes, cancelled bookings remain active in the grid after refresh, legacy fallback unreachable, allocation report returns `BLOCKED_BY_OVERLAPS`, `BLOCKED_BY_SCHEMA`, or unresolved `NEEDS_MANUAL_REVIEW`, or operator cannot avoid surprising real clients with notifications. |
| `Cannot determine` | Required evidence is missing, so no pilot decision can be made. | Use when deployed access, tenant identity, OWNER/ADMIN login, backend URL, diagnostics state, allocation report output, or required QA evidence is unavailable. Do not convert missing evidence into a pass. |

## 2. Required environment checklist

Record these values before running QA:

| Item | Required evidence | Status | Notes |
| --- | --- | --- | --- |
| Deployed frontend URL | Exact URL used by the pilot operator. |  |  |
| Deployed backend URL | Exact API origin used by the frontend. |  |  |
| Tenant slug/domain | Operator-confirmed tenant slug and host/domain. |  |  |
| OWNER/ADMIN login | Login tested for the same tenant. Do not use a cross-tenant account. |  |  |
| Primary Calendar V2 route | `/admin` URL for the tenant. |  |  |
| Calendar V2 alias route | `/admin/calendar-v2` URL for the tenant. |  |  |
| Sample mode route | `/admin/calendar-v2?sample=1`. |  |  |
| Legacy fallback route | `/admin/calendar-legacy`. |  |  |
| Placement save flag | Actual value of `NEXT_PUBLIC_ENABLE_CALENDAR_V2_PLACEMENT_SAVE` in the deployed frontend. |  |  |
| Diagnostics setting | Whether `ENABLE_INTERNAL_DIAGNOSTICS=true` is enabled, and only for the report window if used. |  |  |
| Production/staging DB access policy | Confirm who may run read-only reports and who may approve any mutating data action. |  |  |
| Pilot tenant/schema | Exact tenant slug and exact schema name, for example `tenant_demo_business`. Do not infer it. |  |  |

## 3. Calendar V2 route checks

| Check | Manual steps | Expected result | Pass/Fail |
| --- | --- | --- | --- |
| `/admin` renders Calendar V2 | Log in as tenant OWNER/ADMIN and open `/admin`. | Calendar V2 board renders with staff/resource columns or a valid empty/loading/error state. It is not the legacy calendar. |  |
| `/admin/calendar-v2` renders equivalent Calendar V2 | Open `/admin/calendar-v2` for the same tenant and date. | Equivalent Calendar V2 surface renders. If the alias is intentionally disabled by environment config, record that and do not treat the alias as the pilot route. |  |
| `/admin/calendar-v2?sample=1` renders sample/read-only mode | Open the sample route. | Sample Bulgarian salon day renders without backend reads/writes and shows it is sample/read-only. |  |
| `/admin/calendar-legacy` remains reachable | Open `/admin/calendar-legacy`. | Legacy admin calendar renders as the fallback route. |  |
| No blank/black page | Refresh each route once. Test the deployed target, not only local dev. | No route leaves the operator on a blank/black page with no usable calendar DOM. |  |
| No prototype copy in real mode | Inspect `/admin` and `/admin/calendar-v2` without `sample=1`. | Real mode does not present itself as preview, demo, sample, or read-only while write-capable actions are present. |  |
| Sample mode clearly says sample/read-only | Inspect `/admin/calendar-v2?sample=1`. | Visible copy identifies sample/read-only mode, including `Примерен ден · само преглед` or equivalent current copy. |  |

## 4. Core write-flow QA matrix

Use test clients and test-safe phone numbers unless the pilot operator has explicitly approved real-client messaging risk.

| Flow | Setup data needed | Exact steps | Expected UI result | Expected backend/data result | Refresh-after-action check | Failure case to test | Pass/Fail |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Manual booking | Future working slot, active staff, active service, test client. | In `/admin`, click `Нов час` or a future empty slot, complete the booking modal, submit. | Modal closes or reports a clear failure. On success, booking appears after backend refresh. | `POST /appointments/admin` creates a real appointment through existing admin-create behavior. Standard confirmed booking should have scheduling allocation lifecycle handled by backend. | Hard refresh the page and verify the booking remains in the expected staff/time slot. | Try an occupied/conflict slot or invalid required data and verify clear error copy without duplicate booking. |  |
| Request placement | Open waitlist/request item, active service duration, future free staff slot. Placement save flag must be `true` for real save. | From Action Inbox, choose `Постави в графика`, click a future staff/time slot, review preview, save. | Preview is explicit before save. On success, request leaves actionable queue or updates appropriately and booking appears after refresh. | `POST /appointments/waitlist/:waitlistId/place` creates appointment and books the waitlist row in one backend transaction. Payload includes `notifyClient: false`. | Refresh `/admin` and verify the placed request is not still actionable and the appointment is on the board. | Try an already handled request, conflict slot, or past slot and verify it does not create a second booking. |  |
| Cancel booking | Eligible real timed booking with status `pending`, `proposal_pending`, or `confirmed`. | Select booking in Calendar V2, click `Откажи час`, confirm. | Confirmation step appears. On success, booking is removed from active grid after refresh or sync warning is shown if refresh is ambiguous. | `PATCH /appointments/:id/status` with `{ status: "cancelled" }`; backend status lifecycle releases/deactivates allocation for standard appointment. | Refresh and verify cancelled booking does not occupy the active grid. | Try cancelling an already terminal booking; wrong action should be unavailable or clear failure should appear. |  |
| Confirm pending/proposal booking | Eligible real timed booking with status `pending` or `proposal_pending`. | Select booking, click `Потвърди час`, confirm. | Booking remains visible with confirmed state after refresh. | `PATCH /appointments/:id/status` with `{ status: "confirmed" }`; backend promotes held allocation to booked for standard appointment. | Refresh and verify confirmed status persists. | Try confirming already confirmed or terminal booking; action should not be exposed or should fail clearly. |  |
| Reschedule booking | Eligible real timed booking with status `pending`, `proposal_pending`, or `confirmed`, plus future free target slot. | Select booking, click `Премести час`, click future free slot, review `Преглед на преместване`, save. | Reschedule mode exits on success. Booking remains selected only if still visible on the selected date; otherwise stale selection clears. | `PATCH /appointments/:id/reschedule` with `{ startAt, staffId }`; backend updates appointment and matching allocation atomically for standard appointment. | Refresh and verify old slot is free and new slot contains the booking. | Try conflict slot or past slot and verify no move occurs. |  |

## 5. Safety QA matrix

| Safety case | Steps | Expected result | Pass/Fail |
| --- | --- | --- | --- |
| Creating in the past | Try manual booking on a past date or elapsed slot today. | UI blocks the action or backend rejects it with calm Bulgarian no-past copy. No appointment is created. |  |
| Moving to the past | Try rescheduling an eligible booking to a past date or elapsed slot today. | Save is blocked or backend rejects it. Existing booking remains at original valid time. |  |
| Double-click / repeated submit behavior | Double-click a save/confirm/cancel/reschedule button or submit twice quickly. | UI disables pending action or backend prevents duplicate committed result. Record any duplicate or ambiguous state as `NO-GO until fixed`. |  |
| Backend success but refresh warning | If practical in staging, interrupt refresh after a successful write or use a controlled mocked refresh failure. | UI shows `Промяната е запазена, но календарът не се обнови автоматично. Обновете страницата.` instead of false failed-write copy. Operator refreshes before continuing. |  |
| Conflict slot | Attempt manual booking, request placement, or reschedule into an occupied/conflicting slot. | No committed overlap is created. Operator sees occupied/unavailable copy. |  |
| Stale selected booking after refresh | Select a booking, mutate it from another session or complete an action that removes it from current day, then refresh. | Calendar does not keep an unsafe stale selection. It clears or moves selection based on refreshed backend truth. |  |
| Cancelled appointment disappears from active grid | Cancel an eligible booking, then refresh. | Cancelled booking no longer occupies active scheduler grid space. |  |
| Sample mode sends no writes | Open `/admin/calendar-v2?sample=1`, exercise visible preview controls, and observe network calls if tooling is available. | No appointment, waitlist, status, cancel, confirm, or reschedule write API is sent. |  |
| Disabled/terminal bookings do not expose wrong actions | Select confirmed, cancelled, completed, no-show, waitlist/request, and sample bookings as available in test data. | Confirm/cancel/reschedule actions appear only for eligible real timed bookings. Terminal/sample/request items do not expose wrong actions. |  |

## 6. Allocation/data readiness gate

Calendar V2 uses a transitional scheduling model. New standard writes maintain `calendar_allocations`, but old appointments may still lack allocations until a separately approved backfill exists.

Before a real pilot with existing tenant data:

- Run the read-only allocation report for the actual pilot tenant/schema.
- Capture the report output and readiness classification.
- Do not run a real backfill, manual data fix, direct SQL correction, or allocation-authority switch without separate approval.

If no meaningful real tenant appointments exist yet, the report can be deferred for initial setup. It must be run once meaningful appointments exist and before claiming data readiness for broader pilot use.

Direct CLI report path:

```bash
cd backend
DATABASE_URL="..." npm run report:calendar-allocation-backfill -- --schema=tenant_demo_business
```

Machine-readable form:

```bash
cd backend
DATABASE_URL="..." npm run report:calendar-allocation-backfill -- --schema=tenant_demo_business --json
```

Replace `tenant_demo_business` with the operator-confirmed actual pilot tenant schema.

Diagnostics endpoint path:

```text
GET /api/v1/internal/diagnostics/calendar-allocation-backfill-report
```

Optional focused diagnostics path:

```text
GET /api/v1/internal/diagnostics/calendar-allocation-backfill-report?schema=tenant_demo_business
```

Diagnostics requirements: `ENABLE_INTERNAL_DIAGNOSTICS=true` only for the review window, authenticated tenant `OWNER`/`ADMIN`, correct tenant context, and no cross-tenant schema filter.

Readiness interpretation:

| Report status | Interpretation | Pilot gate action |
| --- | --- | --- |
| `READY_FOR_BACKFILL` | Allocation infrastructure is present and no blocking overlaps or manual-review anomalies were found. Active standard appointments missing allocations may still be listed as future backfill workload. | Acceptable allocation evidence for a controlled desktop pilot. This is not a real backfill. |
| `BLOCKED_BY_OVERLAPS` | Legacy display overlaps, buffer-only conflicts, or active exclusive allocation overlaps exist. | `NO-GO until fixed`; create a review plan only. |
| `BLOCKED_BY_SCHEMA` | Allocation table, indexes, exclusion constraint, or `btree_gist` prerequisite is missing. | `NO-GO until fixed`; restore prerequisites only through separately approved work. |
| `NEEDS_MANUAL_REVIEW` | Source-integrity anomalies exist, such as orphan allocations, terminal appointments with active allocations, or duplicate active allocations. | `Cannot determine` or `NO-GO until fixed` until the manual review is complete. |
| No report output | Required runtime/report access is missing. | `Cannot determine`. |

## 7. Notification expectations gate

Calendar V2 does not add a new notification policy.

- Cancel and confirm reuse the existing backend status endpoint behavior, so they may trigger whatever existing status/cancellation notification behavior that endpoint currently performs.
- Request placement sends `notifyClient: false`.
- Reschedule currently does not add notification behavior.
- Manual booking uses the existing admin-create path and may reuse existing backend create notification behavior.
- The pilot operator must know whether clients will receive messages before QA starts.
- If notification behavior is uncertain, use only test clients and test phone numbers/emails.
- Do not surprise real clients during QA.

## 8. Device readiness gate

| Device | Current readiness | Allowed for pilot? | What to tell the pilot user |
| --- | --- | --- | --- |
| Desktop/laptop | Primary supported surface for Calendar V2 dogfooding and controlled pilot after this gate passes. | Yes, if route, write-flow, allocation/data, notification, and rollback gates pass. | Use Calendar V2 only from a desktop/laptop browser for real operations. Refresh after uncertain writes. |
| Tablet landscape | Partially usable; desktop-style scheduler can render, but touch coverage is not fully proven. | Observation/testing only unless explicitly approved. Not the primary pilot device. | Use desktop/laptop for operational changes. Tablet landscape may be reviewed but should not be the only operating device. |
| Tablet portrait | Cramped/out of scope for the current desktop renderer. | No. | Do not run the pilot from tablet portrait. Rotate or switch to desktop/laptop. |
| Phone | Intentionally incomplete; phone width shows the separate agenda/day notice rather than full Calendar V2 operations. | No. | Phone is not supported for Calendar V2 pilot operations yet. Use legacy only if the team has separately approved that fallback workflow. |

## 9. Rollback plan

If a blocker appears during dogfooding or pilot:

1. Stop using the affected Calendar V2 action immediately.
2. Capture evidence before rollback:
   - route URL,
   - tenant slug/domain,
   - logged-in role,
   - appointment/request IDs if visible,
   - local time and timezone,
   - exact operator action,
   - screenshots or screen recording,
   - browser console/network evidence if available,
   - whether refresh changed the visible state.
3. Switch operational work to `/admin/calendar-legacy`.
4. Verify backend truth from normal application reads before scheduling another action for the same client/time.
5. Do not delete data manually.
6. Do not run direct database fixes, real backfill, or mutating scripts without separate review and approval.

The fallback route is `/admin/calendar-legacy`. It must remain reachable for the pilot window.

## 10. Pilot sign-off checklist

| Item | Required evidence | Owner | Status | Notes |
| --- | --- | --- | --- | --- |
| Gate verdict selected | One exact verdict from section 1. |  |  |  |
| Frontend/backend URLs recorded | Exact deployed URLs. |  |  |  |
| Tenant slug/domain/schema confirmed | Operator-confirmed tenant identity and schema. |  |  |  |
| OWNER/ADMIN login verified | Login tested against the target tenant. |  |  |  |
| `/admin` route passed | Calendar V2 renders with no blank/black page. |  |  |  |
| `/admin/calendar-v2` route passed or alias status recorded | Equivalent V2 route or intentional alias-disabled evidence. |  |  |  |
| Sample route passed | `/admin/calendar-v2?sample=1` is visibly sample/read-only and non-writing. |  |  |  |
| Legacy fallback passed | `/admin/calendar-legacy` reachable. |  |  |  |
| Real-mode copy passed | No preview/demo/sample/read-only framing in real mode. |  |  |  |
| Manual booking QA passed | Core-flow row completed. |  |  |  |
| Request placement QA passed or explicitly out of pilot scope | Core-flow row completed, or placement-save flag/scope recorded. |  |  |  |
| Cancel QA passed | Core-flow row completed. |  |  |  |
| Confirm QA passed | Core-flow row completed. |  |  |  |
| Reschedule QA passed | Core-flow row completed. |  |  |  |
| Safety matrix passed | Section 5 completed. |  |  |  |
| Allocation report reviewed or deferred with reason | Report status and counts captured, or no meaningful data yet. |  |  |  |
| Notification expectations confirmed | Operator understands which actions may message clients. |  |  |  |
| Device limits accepted | Desktop/laptop-only pilot expectation recorded. |  |  |  |
| Rollback plan accepted | Operator knows `/admin/calendar-legacy` and evidence capture steps. |  |  |  |
| Production data mutation policy accepted | No manual deletes/direct DB fixes/backfill without separate approval. |  |  |  |

## 11. Current implementation status and recommended next task

Completed on 2026-05-19: **structured error-state polish**.

Calendar V2 action failures now go through a shared frontend normalization layer for manual booking, request placement, cancel, confirm, reschedule, board load failure, and the committed-write refresh warning. Known categories such as past-time, conflict, unavailable, stale, terminal, already-confirmed, already-handled request, unauthorized, forbidden, network, server, and refresh-warning states map to calm Bulgarian copy before they reach the operator UI. Raw backend messages remain available only as implementation inputs to the normalizer; known categories are not rendered directly.

This is still a frontend-side stabilization layer, not the final backend structured error-code contract. A backend contract with durable error codes and richer stale/conflict recovery remains a future improvement.

Remaining pilot blockers after this task:

- Run and review the read-only allocation backfill report for the actual pilot tenant/schema.
- Complete the deployed desktop write-flow smoke matrix with an authenticated OWNER/ADMIN user and test-safe records.
- Record notification expectations for the pilot operator before using real client data.
- Keep `/admin/calendar-legacy` available as the fallback route during the pilot window.

Recommended next task: **run and review the read-only allocation backfill report for the actual pilot tenant data**, then record the returned readiness status and anomaly counts in the pilot evidence.

Avoid next: drag/drop persistence, resize, realtime, broad mobile rewrite, or new major workflow before the pilot safety gates above are consistently passing.
