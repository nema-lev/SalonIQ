# Calendar V2 stabilization audit

Date: 2026-05-18
Scope: documentation-only stabilization audit after the major desktop P0 operating actions were added to Calendar V2.
Primary question: **Is Calendar V2 stable enough for internal dogfooding or a first controlled salon pilot on desktop? If not, what must be fixed first?**

## 1. Executive verdict

### Current readiness classification: **owner/admin dogfooding**

Calendar V2 is now strong enough for **internal owner/admin dogfooding on desktop**. It is the primary `/admin` calendar, it renders real data, and the core desktop scheduling actions now exist: manual booking, waitlist/request placement, confirm, cancel, click-to-reschedule, no-past guards, sample-mode safety, and an emergency legacy route.

It is **not yet ready for a first controlled salon pilot** without a short stabilization pass first.

The remaining blockers are not missing “big features.” They are trust and recovery gaps:

1. **The allocation model is still transitional.** New standard writes maintain `calendar_allocations`, but the production dry-run/backfill result has not been executed and reviewed in the inspected repo state, old appointments can still lack allocations, and allocation-only authority remains intentionally disabled.
2. **Calendar V2 action error copy now has a shared frontend normalization layer.** This closes the previous uneven-copy gap for the existing desktop write flows, but it is not a backend structured error-code contract.
3. **The main real-mode operator copy cleanup is now complete.** The primary `/admin` surface no longer exposes preview/sample/read-only framing in ordinary real use, and the visible loading/error/empty states are now calm Bulgarian copy.

Completed on 2026-05-18: the post-write refresh trust gap was hardened. Calendar V2 now keeps mutation success separate from follow-up sync failure across manual booking, request placement, cancel, confirm, and reschedule. A committed write that cannot be re-synchronized automatically is no longer reported as a failed write; the operator instead sees `Промяната е запазена, но календарът не се обнови автоматично. Обновете страницата.` and the scheduler exits unsafe write state without inventing canonical appointment data.

Completed on 2026-05-19: the existing Calendar V2 desktop action errors were standardized through `native-scheduler-action-errors.ts`. Manual booking, request placement, cancel, confirm, reschedule, board-load failure, and refresh-warning states now normalize known HTTP/status/code/message shapes into stable frontend categories and calm Bulgarian copy. Backend structured error codes remain a future improvement.

### Answer to the primary question

- **Internal dogfooding on desktop:** yes.
- **First controlled desktop salon pilot:** not yet.
- **What must be fixed first now:** run and review the allocation dry-run report for the pilot tenant, then complete the deployed desktop smoke matrix with test-safe records.

## 2. Completed capability checklist

| Capability | Implemented | Tested by Codex regression | Manually verified by user if known | Remaining risk |
| --- | --- | --- | --- | --- |
| Manual booking | Yes. Real-data Calendar V2 opens the shared `AdminBookingModal` from `Нов час` or a future empty slot and writes through `POST /appointments/admin`. | Yes. Native scheduler regression checks cover manual booking intent, past-slot rejection, precedence beneath placement/reschedule modes, and the shared post-write sync contract. | Not recorded in inspected files. | If auto-refresh cannot re-establish backend truth after create, the modal still closes and the operator gets the refresh warning instead of a false failed-write message. |
| Request placement | Yes. Real-data placement preview exists; explicit save writes through `POST /appointments/waitlist/:waitlistId/place` only when `NEXT_PUBLIC_ENABLE_CALENDAR_V2_PLACEMENT_SAVE === "true"` and sample mode is off. | Yes. Regression checks cover preview shape, slot locking, flag gating, dedicated endpoint use, no notification writes, placement/manual-click precedence, and warning-path sync handling. | Not recorded in inspected files. | Save remains flag-gated; stale handled requests still need more explicit recovery, but committed placement is no longer misreported as a failed write when refresh is ambiguous. |
| Cancel | Yes. Eligible `pending`, `proposal_pending`, and `confirmed` bookings cancel through `PATCH /appointments/:id/status` with `{ status: "cancelled" }`. | Yes. Regression checks cover eligibility, placement-mode precedence, cancelled filtering, post-write sync handling, and selection clearing after refresh. Backend lifecycle tests cover terminal allocation deactivation. | Not recorded in inspected files. | Already-cancelled copy is still generic rather than explicit, but a committed cancel with failed refresh now shows a refresh warning and clears unsafe stale selection. |
| Confirm | Yes. Eligible `pending` and `proposal_pending` bookings confirm through `PATCH /appointments/:id/status` with `{ status: "confirmed" }`. | Yes. Regression checks cover eligibility, placement-mode precedence, endpoint reuse, backend-truth refresh, and post-write sync handling. Backend lifecycle tests cover held-to-booked promotion. | Not recorded in inspected files. | Stale/terminal handling is still message-parsed, but a committed confirm with failed refresh now shows a refresh warning instead of a false failed-write message. |
| Reschedule | Yes. Eligible `pending`, `proposal_pending`, and `confirmed` bookings use explicit click-to-reschedule through `PATCH /appointments/:id/reschedule`. | Yes. Regression checks cover eligibility, click ownership, valid save request generation, backend endpoint reuse, refreshed selection behavior, and warning-path exit semantics. Backend lifecycle tests cover atomic allocation updates. | Not recorded in inspected files. | Selection is intentionally cleared if the booking leaves the visible day, and committed moves now exit reschedule mode safely even when the board refresh is ambiguous. |
| No-past guard | Yes. UI blocks past slot clicks and backend rejects past create/place/reschedule writes with `Не може да запишете час в миналото.` | Yes. Regression checks cover historical slots, elapsed time shading, save blocking after a selected slot becomes historical, and manual-booking/reschedule past rejection. Backend tests cover create, place, and reschedule rejection. | Not recorded in inspected files. | Good current coverage. The wording differs slightly by flow (`Изберете бъдещ час.` vs `Не може...`) but the rule itself is strong. |
| Sample mode safety | Yes. `?sample=1` disables reads and writes, hides manual booking entry points, and keeps previews local-only. | Yes. Regression/source checks cover real-data-only writes and sample-mode disabled behavior. | Not recorded in inspected files. | Safe from a write perspective. The mode remains visibly labeled as a non-writing example without leaking sample framing into ordinary real-mode use. |
| Legacy fallback | Yes. `/admin/calendar-legacy` still renders `AdminCalendarWorkspace`. | No dedicated regression found in the inspected Calendar V2 runner. | Not recorded in inspected files. | Valuable emergency fallback, but it preserves a second operating surface with different interaction patterns and some richer legacy/mobile behavior. |
| Allocation lifecycle support | Yes for standard exact-time create, admin create, waitlist placement, confirm, cancel/completed/no-show transitions, and reschedule. | No dedicated Calendar V2 regression. Backend unit tests cover lifecycle behavior, waitlist placement, and the read-only backfill report. | Not recorded in inspected files. | Transitional only: existing legacy appointments may still lack allocations, the dry-run result has not been recorded as executed for the target production data, and allocation-only authority is not enabled. |

## 3. Cross-flow interaction risks

### What is already guarded well

| Interaction | Observed behavior | Risk assessment |
| --- | --- | --- |
| Request placement vs manual booking slot clicks | Grid click precedence is `reschedule -> placement -> manual booking`. While placement mode is active, manual booking intent is suppressed. | Good collision prevention. A slot click cannot accidentally open the booking modal during active placement. |
| Reschedule mode vs manual booking slot clicks | Reschedule mode owns grid clicks before manual booking, and `buildManualBookingIntent(...)` receives `placementModeActive: placementModeActive || rescheduleModeActive`. | Good collision prevention. A reschedule click cannot accidentally create a manual booking intent. |
| Placement vs selected booking detail | Starting placement clears the selected booking and the lower right rail follows placement context before and after slot selection. | Good. This avoids a booking detail panel competing with an active request-placement action. |
| Selected slot locking | Once a placement slot is selected, hover no longer moves the committed preview target. | Good. The selected target and eventual save request remain aligned. |
| Cancelled appointment filtering | Real-data projection removes `cancelled` appointments from active grid blocks while Action Inbox can still show cancellation updates/recovery items. | Operationally sensible, but it means the same cancelled record can disappear from the grid while still remaining visible elsewhere. That should stay intentional and well-explained. |

### Residual state-collision or confusion risks

| Flow pair / state | Verified behavior | Remaining confusion risk |
| --- | --- | --- |
| Cancel after reschedule | Reschedule success keeps the booking selected only if it is still visible after refreshed backend truth; otherwise selection clears. Cancel then operates only from whatever visible booking is currently selected. | Correct mechanically, but if a booking is moved to another date and disappears, the user gets no strong explicit explanation beyond the booking vanishing from the current day. |
| Confirm after manual booking if pending | Admin manual create uses `createByAdmin(...)`, which forces confirmed status. The inspected manual-booking path therefore does **not** create a pending booking that would later need confirm. | No runtime collision in the current path. The main risk is operator misunderstanding if service-level confirmation rules elsewhere imply pending behavior but admin-create still forces confirmed. |
| Selected booking after refresh | `NativeSchedulerV2Spike` preserves the selected block only if it still exists in refreshed source blocks; otherwise it falls back to the first block or `null`. Cancel/reschedule additionally reconcile selection from refreshed visibility. | Mostly safe, but generic source refresh can silently shift selection to a different first booking when the previous one disappears. That is correct data-wise but can feel abrupt. |
| Selection after moving to another date | The selected calendar date is retained. If a moved booking is no longer visible in the current day, reschedule result clears selection. | Safe, but weakly explained. The operator may need to infer that the booking moved successfully to another date. |
| Sample mode vs real mode | Sample mode disables backend reads/writes; real mode is default; query param controls the switch. | Write safety is strong. Real mode no longer links operators into sample mode from routine empty/error states, while the explicit sample route remains clearly non-writing. |
| Placement flag off vs on | With the flag off, real mode still offers local placement preview but no save; with the flag on, the same preview gets a real save path. | Mechanically clear in code. Operator risk: the same visual workflow changes from no-write to write-capable based on environment configuration, so pilot setup must be explicit. |

## 4. Error-state audit

| Case | Current Bulgarian handling | Audit verdict |
| --- | --- | --- |
| Past time | Manual booking maps to `Не може да запишете час в миналото.` Request placement maps to `Не може да поставите заявка в миналото.` Reschedule maps to `Не може да преместите час в миналото.` Local past-slot clicks remain blocked before writes. | Good. UI and backend both enforce the rule, with action-specific copy. |
| Conflict | Manual create, request placement, and reschedule normalize conflict-like responses to `Този час вече е зает.` Local previews also surface conflict hints. | Good for the controlled desktop pilot. Still frontend-normalized, not a final backend structured conflict contract. |
| Unavailable slot | Manual create, request placement, and reschedule normalize unavailable/working-hours/blocked/staff-or-service missing cases to `Този час не е наличен.` | Acceptable. Several backend causes intentionally collapse into one operator-safe message. |
| Already cancelled / terminal cancel | Cancel maps already-cancelled and terminal status-transition cases to `Този час вече не може да бъде отказан.` | Good for pilot safety. The operator is not encouraged to repeat a destructive action. |
| Already confirmed | Confirm maps already-confirmed status-transition cases to `Този час вече е потвърден.` | Good. |
| Terminal confirm | Confirm maps other terminal status-transition cases to `Този час вече не може да бъде потвърден.` | Good for pilot safety. |
| Stale appointment | Confirm/cancel/reschedule map stale/not-found/conflicting update cases to `Часът е променен. Обновете календара и опитайте отново.` | Good pilot baseline. Richer recovery still belongs in a future backend structured contract. |
| Request already handled | Request placement maps already-handled request responses to `Заявката вече е обработена.` | Good. |
| Network / auth / server | Shared general categories map to `Няма връзка със сървъра...`, `Сесията е изтекла. Влезте отново.`, `Нямате права за това действие.`, and `Възникна проблем със сървъра...`. | Good. Known categories no longer render raw backend text. |
| Refresh failure after successful write | Manual booking, request placement, confirm, cancel, and reschedule keep committed mutation success separate from follow-up refresh failure and show `Промяната е запазена, но календарът не се обнови автоматично. Обновете страницата.`. | Good. This previous P0 trust gap is closed for the existing desktop write flows. |

### Summary of the error-state picture

Calendar V2 now has a **shared frontend error-normalization layer** for the existing desktop write flows. It uses HTTP status, known error codes when present, and message matching only as a fallback. It does **not** yet have the durable production-grade backend error contract described in the architecture docs: structured conflict codes, explicit stale-version handling, and action-specific recovery semantics independent of message parsing.

## 5. Data/backend safety audit

| Area | Verified state | Safety assessment |
| --- | --- | --- |
| `calendar_allocations` lifecycle coverage | Standard exact-time create/admin-create inserts allocations; pending creates use `held`; confirmed creates use `booked`; confirm promotes held to booked; cancel/completed/no-show make allocations non-active; reschedule updates appointment + allocation atomically. | Good for **new standard writes**. |
| Waitlist placement endpoint | `POST /appointments/waitlist/:waitlistId/place` locks the waitlist row, validates time/staff/conflicts, inserts appointment + booked allocation, and marks the waitlist row booked in one tenant transaction. | Good. This is the strongest Calendar V2-specific write path. |
| Admin/manual create | `POST /appointments/admin` reuses the standard create path, forces confirmed status, rejects past times, and now writes a booked allocation for standard services. | Safe for the current direct-create workflow, though generic create still relies on the current backend rules rather than Calendar V2-specific UX assumptions. |
| Cancel allocation release | `updateStatus(...)` aligns terminal statuses with inactive allocation state. | Safe for the covered standard lifecycle. |
| Confirm held -> booked | Covered in backend lifecycle tests and used by the existing status endpoint. | Safe for standard appointments. |
| Reschedule allocation update | Standard reschedule updates appointment + allocation in one transaction and can materialize a missing allocation for a safely moved legacy appointment. | Safe within the current transition design. |
| No-past backend validation | Public create, admin create, waitlist placement, and reschedule reject past starts. | Strong. |
| Production backfill report execution | The read-only report script and authenticated diagnostics path exist, but the inspected repo state does not record a completed production/pilot-tenant report result. | **Not yet safe enough to claim migration readiness.** The tooling exists; the evidence is still missing. |
| Remaining legacy appointments without allocations | Explicitly expected until backfill. Retained legacy conflict checks remain in place during transition. | Safe as a bridge, not final-state architecture. |
| Allocation-only authority | Intentionally not enabled. Current reads/writes remain mixed: new allocation-aware writes plus retained legacy appointment conflict checks. | Transitional. Do not treat the system as allocation-authoritative yet. |

### Bottom line on backend safety

The backend is **meaningfully safer than before** for the desktop flows Calendar V2 now exposes. The risky part is no longer “does the placement write split across two calls?”; that has been fixed. The remaining backend risk is **operational maturity**, not a missing transaction:

- prove the tenant data is backfill-ready with the read-only report,
- deal with any anomalies before real backfill,
- keep the retained legacy checks until that work is complete,
- do not switch to allocation-only authority yet.

## 6. UI/UX polish blockers

| Area | What was verified | Why it still matters |
| --- | --- | --- |
| `native-scheduler-spike` naming | The naming remains in internal folder/file names and internal console labels. The real adapter overrides the visible toolbar eyebrow to `Calendar V2`, so the normal UI does not expose the spike name directly. | This remains technical debt only, not user-facing copy. |
| Preview/read-only wording | Sample mode is explicitly labeled `Примерен ден · само преглед`. Real mode no longer claims the calendar itself is read-only; only uncommitted placement/reschedule previews explain that they are not yet saved. | Good current split between production operation and deliberate pre-commit review. |
| Sample/demo labels in real mode | Real empty/error states no longer expose sample-mode actions or sample-name notes. If real tenant data itself contains demo-looking names, Calendar V2 leaves the data untouched without advertising it in the operator chrome. | Cleaned up for ordinary production use. |
| English copy in real operational states | The real-mode loading, error, empty, navigation, and inbox shell copy is now Bulgarian, including `Не успяхме да заредим календара.`, `Опитайте отново`, `Няма записани часове за тази дата.`, and `Няма чакащи действия`. | Cleaned up for ordinary production use. |
| Right rail density | The right rail multiplexes Action Inbox plus booking/placement/reschedule context; docs note that it was hardened against clipping, but long booking notes can still scroll inside detail. | Acceptable on desktop, but still dense at laptop/tablet widths and not yet elegant. |
| Modal consistency | Manual create uses the shared legacy `AdminBookingModal`; reschedule uses the V2 inline preview flow; legacy still has its own drawer/modal set. | Functionally okay, but interaction language is not fully unified. |
| Empty states | Empty staff/appointment states exist and are non-blocking. | Good baseline, but the real-mode empty path still promotes sample-mode affordances too prominently. |
| Loading states | Loading states exist. | Functionally present, but still English and therefore unfinished for pilot polish. |
| Success feedback | Toasts exist for save/confirm/cancel/reschedule; placement and reschedule previews also show success notes. | Good baseline, but refresh-failure ambiguity undermines trust after success. |
| Disabled states | Placement save, sample mode, historical slots, and invalid reschedule targets have explicit disabled behavior. | Good. |
| Mobile/phone placeholder | Phone width renders only `Телефонният Calendar V2 ще използва отделен дневен изглед.` | Honest, but not a usable workflow. |
| Tablet behavior | Tablet landscape QA exists and renders the scheduler; tablet portrait still uses the desktop renderer and prior notes call it cramped/out of scope. | Landscape is plausible for review, not yet proven as a primary pilot surface. Portrait is not pilot-ready. |
| Current-time line | Date-aware, minute-refreshed, hidden outside today/visible hours. | Good. No blocker found. |
| Cancelled/completed/no-show treatment | `cancelled` is removed from active grid blocks; `completed` and `no_show` remain in the grid and both map to the same `completed` card tone. | The cancelled behavior is deliberate. The `completed`/`no_show` visual merge can be too subtle for operational scanning and should be revisited after the first stabilization pass. |

## 7. Mobile/tablet readiness

| Form factor | Usable now? | Acceptable for pilot? | What blocks it |
| --- | --- | --- | --- |
| Desktop | Yes. | Yes, **after** the P0 stabilization items below. | Post-write refresh trust gap, unresolved pilot-tenant allocation readiness evidence, and remaining real-mode polish. |
| Laptop | Yes. | Yes, **after** the same P0 items. | Same as desktop, plus tighter right-rail density at shorter heights. |
| Tablet landscape | Partially. Prior QA shows the scheduler renders and remains visible. | Not as the primary pilot surface yet. | Desktop-style interactions are still assumed; touch/device interaction coverage is not proven in the inspected artifacts. |
| Tablet portrait | Technically renders, but the inspected notes call it cramped and out of scope. | No. | Desktop renderer in a narrow portrait layout, dense rail, no tailored operating flow. |
| Phone | No full flow. It intentionally shows only the separate-agenda notice. | No. | No usable phone calendar workflow, no booking/request placement flow, no operational detail flow. |

## 8. Legacy fallback assessment

### Keep `/admin/calendar-legacy` for now?

**Yes. Keep it.**

The fallback is still justified because:

- Calendar V2 is not yet through the stabilization items required for the first pilot.
- Phone/mobile operating coverage is not ready.
- The backend remains in a mixed allocation transition state.
- The legacy surface remains a useful emergency comparison path if Calendar V2 data refresh or write recovery behaves unexpectedly during dogfooding.

### When can it be removed?

Remove the legacy fallback only after all of the following are true:

1. Desktop Calendar V2 survives a focused pilot period without operational need to fall back.
2. Post-write refresh/recovery behavior is hardened and trusted.
3. The allocation dry-run report has been run and reviewed for the target live data, required backfill work is complete, and the scheduling authority model is no longer transitional.
4. The expected mobile/tablet operator workflow is covered well enough that a salon is not forced back to legacy on smaller devices.
5. The remaining production copy and operator-state gaps are cleaned up.

### Shared legacy components still reused by V2

- **`AdminBookingModal` is actively reused by Calendar V2** for manual booking.
- **`useAdminCalendarBoardData` is shared** between the old and new admin calendar surfaces.
- The inspected Calendar V2 route does **not** reuse `AdminCalendarWorkspace`, `CalendarDetailDrawer`, `AppointmentMoveModal`, or `CalendarRequestSections`; those remain legacy/current-calendar components.

## 9. First salon pilot checklist

Use this as a concrete gate before allowing one real salon to operate on desktop Calendar V2.

### Environment and mode

- [ ] Record the active value of `NEXT_PUBLIC_ENABLE_CALENDAR_V2_PLACEMENT_SAVE`.
- [ ] If request placement is part of the pilot, verify `NEXT_PUBLIC_ENABLE_CALENDAR_V2_PLACEMENT_SAVE=true` in that environment.
- [ ] Confirm that `/admin` resolves to Calendar V2 and `/admin/calendar-legacy` remains reachable as fallback.
- [ ] Confirm that `NEXT_PUBLIC_DISABLE_CALENDAR_V2_PREVIEW` affects only the `/admin/calendar-v2` alias and not the primary `/admin` route.
- [ ] Keep sample mode out of normal operator use; verify `/admin/calendar-v2?sample=1` remains non-writing.

### Diagnostics and backend readiness

- [ ] Enable internal diagnostics only for the review window if needed.
- [ ] Run the authenticated read-only allocation backfill report for the pilot tenant.
- [ ] Capture and review the returned readiness classification and anomaly counts.
- [ ] Do **not** run a real backfill as part of this pilot-prep step.
- [ ] Confirm the team understands that allocation-only authority is still disabled and legacy rows may still lack allocations.

### Desktop functional smoke pass

- [ ] Create one test manual booking.
- [ ] Cancel one eligible booking.
- [ ] Reschedule one eligible booking on the same visible day.
- [ ] Reschedule one eligible booking to another date and confirm the operator understands the selection-clearing behavior.
- [ ] Place one waitlist/request item through the intended pilot configuration.
- [ ] Attempt a conflict and verify the operator-facing message.
- [ ] Attempt a past-time create/place/reschedule and verify the no-past guard.
- [ ] Refresh after each successful write and verify the board settles on backend truth.
- [ ] Simulate or inspect a refresh failure path before pilot go-live; do not accept a false “failed write” message after a committed write.

### Device/fallback expectations

- [ ] Verify desktop and laptop layouts on the target operator machines.
- [ ] Verify phone still shows the intentional fallback/placeholder state rather than a half-working editor.
- [ ] Confirm the salon knows the pilot is desktop-first and that phone is not a supported operating flow yet.

### Notification expectations

- [ ] Confirm the team and pilot salon understand the current notification behavior:
  - manual booking/create can reuse existing backend notification behavior,
  - confirm/cancel reuse existing status endpoint notification behavior,
  - request placement sends `notifyClient: false`,
  - reschedule does not add a notification path.
- [ ] Do not promise notification behavior that Calendar V2 does not currently provide.

### Backup / rollback plan

- [ ] Record the fallback rule: if Calendar V2 produces uncertain write state or stale-board behavior, stop using the affected V2 action and switch operational work to `/admin/calendar-legacy` while the issue is investigated.
- [ ] Confirm the pilot owner/admin knows how to reach the fallback route.
- [ ] Keep a short written record of pilot actions, observed anomalies, and the exact time of any write/recovery issue so backend truth can be checked later.

## 10. Prioritized stabilization roadmap

### P0 — must fix before a controlled salon pilot

1. **Run and review the read-only allocation backfill report** for the actual pilot tenant data before claiming the backend transition state is acceptable for live use.
2. **Keep the cleaned-up real-mode copy contract intact**: no ordinary-operator sample/demo language in real mode, and Bulgarian loading/error/empty states.
3. **Complete the deployed desktop smoke matrix** for manual booking, request placement, cancel, confirm, reschedule, no-past guards, conflict handling, sample mode, and legacy fallback with test-safe records.

### P1 — should fix soon after pilot

1. Move toward a **structured error contract** instead of message parsing.
2. Improve the **appointment detail/right-rail experience**, especially around “moved off this day,” long notes, and action-state clarity.
3. Separate or sharpen **completed vs no-show** visual treatment.
4. Add **debug-safe action telemetry/logging** suitable for diagnosing pilot incidents without leaking client data.
5. Improve the **tablet portrait / phone placeholder experience** enough that unsupported surfaces are clearer and less abrupt.

### P2 — can wait

1. Notification policy planning and later explicit implementation.
2. Full mobile operating flow.
3. Richer tablet optimization.
4. Real-time collaboration.
5. Recurring bookings.
6. Allocation-only read authority, but only after validated backfill and migration work.

### P3 — avoid for now / dangerous distractions

1. Persisted drag/drop.
2. Resize.
3. Broad mobile editor work before the desktop trust gaps are fixed.
4. Realtime before the write/recovery model is mature.
5. Any push toward “flashy” scheduling UX before the pilot operator can trust ordinary create/place/confirm/cancel/reschedule behavior.

## 11. Recommended next implementation task

### Completed task: **post-write refresh/selection consistency hardening**

This pass was the right stabilization move because it was:

- narrow,
- safe,
- directly tied to operator trust,
- already visible in the current code,
- more urgent than adding breadth.

It improved several existing actions at once without adding a new feature, changing endpoints, or changing the database model.

### Recommended next task after this hardening

**Run and review the read-only allocation backfill report for the actual pilot tenant data.**

That is now the highest-value next task because the frontend trust gap is closed, while the backend transition state is still unproven for the real pilot dataset. The next decision should be based on the authenticated report output and anomaly counts, not on assumptions about legacy rows.

### Original Codex prompt used for the completed hardening pass

```text
You are working on the SalonIQ repository.
Read and follow the root AGENTS.md before doing anything else.

Reasoning level: high.
Work directly on main.

This is a narrow Calendar V2 stabilization task.
Do NOT add features.
Do NOT change backend endpoints.
Do NOT change database schema or migrations.
Do NOT add packages.
Do NOT add notifications.
Do NOT add realtime.
Do NOT add drag/drop persistence.
Do NOT add resize.
Do NOT change deployment config, tenant resolution, secrets, or env files.

Goal:
Harden Calendar V2 post-write refresh and selection consistency so a successful backend write is never presented to the operator as a failed action merely because the follow-up refresh fails.

Inspect at least:
- frontend/src/components/admin/calendar-v2/real-data/CalendarV2RealDataAdapter.tsx
- frontend/src/components/admin/calendar-v2/native-scheduler-spike/NativeSchedulerV2Spike.tsx
- frontend/src/components/admin/calendar-v2/real-data/calendar-v2-real-data-mappers.ts
- frontend/src/components/admin/calendar-v2/native-scheduler-spike/native-scheduler-regression-checks.ts

Focus on the existing real-data Calendar V2 actions:
- request placement save
- confirm booking
- cancel booking
- reschedule booking
- manual booking refresh behavior where relevant

Required outcome:
1. Separate mutation success from follow-up refresh failure.
2. Preserve truthful Bulgarian operator feedback:
   - if the write committed but refresh failed, say the write succeeded and that the calendar should be refreshed/retried,
   - do not show a generic failed-write message for a committed write.
3. Keep backend truth as the source of truth; do not add optimistic committed cards.
4. Keep current selected-booking semantics correct:
   - cancelled bookings should not remain selected in the active grid,
   - moved bookings should stay selected only when still visible after refreshed truth,
   - if refreshed truth is unavailable, do not invent visibility.
5. Add/update the smallest targeted regression coverage for the new behavior.
6. Do not change unrelated Calendar V2 behavior.

Validation:
- Run the native scheduler regression checks.
- Run the smallest relevant frontend validation only if source files change and it is already available in the repo.
- Run git status.
- Run git diff --check.

Commit and push to main.

Suggested commit message:
Harden Calendar V2 post-write refresh handling

Expected final response:
- Commit SHA
- Files changed
- What changed
- Why it matters
- Exact validation run
- Any remaining risk
```
