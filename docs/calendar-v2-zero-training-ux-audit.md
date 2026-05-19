# Calendar V2 zero-training UX audit

Date: 2026-05-19
Scope: product/UX audit and simplification roadmap for Calendar V2 as the primary `/admin` calendar.

This document is documentation-only. It does not change Calendar V2 behavior, frontend runtime code, backend behavior, API calls, database schema, migrations, packages, notifications, realtime behavior, drag/drop persistence, resize, tenant resolution, deployment configuration, secrets, environment files, or `/admin/calendar-legacy`.

Evidence reviewed:

- `docs/calendar-v2-pilot-release-gate.md`
- `docs/calendar-v2-stabilization-audit.md`
- `docs/calendar-v2-production-gap-audit.md`
- `docs/calendar-v2-authoritative-scheduling-architecture.md`
- `frontend/src/components/admin/calendar-v2/README.md`
- `frontend/src/components/admin/calendar-v2/native-scheduler-spike/NATIVE_SCHEDULER_SPIKE_NOTES.md`
- `/admin`, `/admin/calendar-v2`, Calendar V2 real-data adapter, native scheduler, Action Inbox, appointment card, placement preview, reschedule preview, legacy modal/drawer/request components, and stored visual QA screenshots.

## 1. Executive UX verdict

**Classification: usable but still admin-like.**

Calendar V2 is understandable as scheduling software after a short explanation. It is not yet understandable as a zero-training salon operating surface.

The core desktop flows exist and are much safer than earlier versions: real board view, Action Inbox, request placement, manual booking, confirm, cancel, explicit click-to-reschedule, no-past guard, cancelled bookings removed from the active grid, refresh warning after committed writes, Bulgarian action errors, sample-mode safety, and `/admin/calendar-legacy` fallback.

The UX problem is no longer "can the operator do the work?" The problem is "does the screen explain itself instantly?" Today the answer is no. The interface still asks the salon owner to read labels, understand modes, parse the right rail, and trust a traditional calendar grid. It works more like improved admin software than like a game board where pieces clearly fit or do not fit.

For a first real salon impression, the current UX should be treated as **not ready**. The next work should not be broader features. It should make the existing day feel obvious, physical, calm, and consequence-driven.

## 2. The target mental model

Target metaphor: **Tetris / Candy Crush, not Excel.**

Calendar V2 should feel like a board of physical pieces:

- Appointment cards are blocks.
- Empty slots are places where blocks can fit.
- Requests are loose blocks waiting beside the board.
- Rescheduling is picking up one block and choosing a new valid place.
- Conflicts mean "this block does not fit here," not "the backend returned an error."
- Actions appear because an object is selected, not because the operator opened an admin control panel.

The desired mental model:

1. The day is a board.
2. Staff columns are lanes.
3. Time slots are visible spaces.
4. Existing appointments occupy space.
5. Requests wait outside the board until placed.
6. A selected object shows only the actions that make sense for that object.
7. Invalid targets reject the action visually before technical copy appears.
8. After a save, the board settles back into a clear state.

The operator should not need to know `pending`, `proposal_pending`, allocation lifecycle, query refresh, feature flags, or why a command is local-only. They should see: this client has a block, this block is here, this request needs a place, this slot is free, this slot is blocked, this move will fit, this move will not fit.

## 3. Current friction audit

Calendar V2 still feels admin-like in these specific places:

- The layout is still a desktop scheduler table: time gutter, staff columns, grid lines, right rail, panels, badges, and buttons.
- The right rail combines Action Inbox, Booking Detail, placement context, reschedule context, status copy, confirmation copy, and notes. It is useful, but it is cognitively dense.
- The UI uses too many mode explanations: sample mode, manual booking, placement save on/off, local preview, read-only, selected slot, refresh warning, and reschedule mode.
- Several flows require reading before acting. "Постави в графика" is good, but the follow-up state still depends on banners and preview panels.
- Some visible language is still status/software language rather than object language: "Само преглед", "Детайли и действия", "Състояние", "Поставянето не е активно", "Промяната е запазена, но календарът не се обнови автоматично."
- Manual booking opens `AdminBookingModal`, which is a legacy form workflow. It does not yet feel native to a block board.
- Appointment actions are presented as stacked buttons in the detail panel. The operator sees a control panel, not a direct manipulation surface.
- The grid has slot lines, but the affordance "click here to create/place/move" is subtle until a mode is active.
- Request cards in the inbox are list cards. They are not yet visually shaped as blocks waiting to be placed.
- Existing screenshots and source show many small pills, count badges, captions, and panels. Each one is reasonable alone, but together they create admin density.

The main issue is not color or polish. It is object clarity. The screen should make the next move obvious without requiring the operator to read the system.

## 4. Calendar grid audit

**Appointment card shape, density, hierarchy**

The current card design is compact and usable. Cards show client first, service second, time, duration on roomier cards, and small cues for message/action. This is a good base. The problem is that cards still read like dense records. They need to read more like blocks: stronger physical shape, less text noise, clearer "selected" state, and a more obvious occupied-space footprint.

**Time grid readability**

The hourly structure and 15-minute rhythm are readable. The grid still resembles a spreadsheet because every time line and column line has similar visual weight. The next pass should reduce minor-line prominence and make available slots feel tappable/selectable rather than merely empty.

**Staff columns**

Staff columns are understandable. The colored staff dot helps. The repeated `08:00-20:00` subline is functional but contributes to table feeling. Staff headers should be quieter and more avatar/lane-like.

**Slot affordance**

Empty slots are visible but not strongly actionable. A salon owner should see where a new block can go before reading any text. Hover/active mode can help, but the base grid should also imply "these are places."

**Selected slot state**

Selected placement and reschedule targets exist through a dashed preview. This is one of the strongest Tetris-like foundations. It should become more block-like: ghost block with client/service/duration, fit state, and clear green/red response.

**Current-time indicator**

The current-time line is a strong, instantly understandable affordance. It should remain simple and visible only for today. It helps answer "what is happening now" in under two seconds.

**Blocked/unavailable time**

Blocked time exists and uses a striped treatment. This is directionally correct. It should say "cannot fit here" visually, not only as a labeled region. Avoid making blocked time look like another appointment card.

**Cancelled/completed/no_show treatment**

Cancelled bookings are correctly hidden from the active grid. Completed and `no_show` remain in the grid and currently collapse into the same completed tone. That is operationally ambiguous: completed should feel done; no-show should feel like an exception. Neither should compete visually with live future actions.

**Short appointment readability**

The short-card variant keeps initials, time, and a cue. That is necessary, but it also hides client/service recognition. For 15-minute services, the card should prioritize one instantly recognizable identity marker plus exact time. Do not add more text; make the compressed block shape more legible.

**Crowded day readability**

Overlap lane logic exists, but a crowded day will still feel like a grid of small records. Crowded days need stronger rhythm: appointment blocks should cluster cleanly, staff lanes should remain scannable, and action-needed cards should stand out without turning the board into a warning dashboard.

**Visual rhythm**

The current rhythm is calm and restrained. It also risks being too uniform. The day needs a clearer contrast between occupied blocks, open slots, blocked zones, current time, and active move/placement preview.

**2-second day comprehension**

Today: partial pass. The operator can see staff columns and bookings quickly, but not always "what needs action" and "where should the next block go" without reading the right rail.

Target: the owner opens `/admin` and immediately sees now, next, open space, waiting blocks, and any urgent decision.

## 5. Appointment card audit

Each appointment card should communicate instantly:

- Client: text, strongest line.
- Service: text, second line, only when there is room.
- Time: compact chip or anchored corner text.
- Duration: shape/height first, text only when useful.
- Staff: column placement first; staff text is secondary and usually unnecessary inside the card.
- Status: hidden unless it changes the next action.
- Action needed: icon/color/edge treatment, not a long label.
- Movable: only shown when the user starts a move action, not always.
- Confirmed/pending: visual confidence state, not backend status wording.

Recommended treatment:

| Information | Best treatment | Audit note |
| --- | --- | --- |
| Client | Text | Keep as the card's dominant label. |
| Service | Text, smaller | Keep visible on normal cards; hide on very short cards if needed. |
| Time | Small chip or top-right text | Keep exact because operators scan by time. |
| Duration | Card height first, small text only on roomy cards | Avoid redundant duration text when height already explains it. |
| Staff | Column location | Do not repeat unless appointment is shown outside the grid/detail context. |
| Confirmed | Calm solid card | No need to label every confirmed booking. |
| Pending / needs confirmation | Distinct left edge or small alert icon | Should pop as "needs action," not as a status taxonomy. |
| Message/new cue | Icon plus tiny label only if important | Avoid many pill badges. |
| Completed | Muted/done treatment | Should not compete with future work. |
| No-show | Separate exception treatment | Should not look the same as completed. |
| Cancelled | Hidden from active grid | Current behavior is correct. |

The card should look like a piece on a board, not a mini database row.

## 6. Action Inbox / Действия audit

The Action Inbox is useful, but it still feels closer to an admin task list than to a tray of waiting blocks.

Current strengths:

- The title `Действия` is short.
- `Постави в графика` is understandable.
- Active placement state moves focus to the calendar and says to choose a free slot.
- The active request is highlighted.

Current friction:

- Requests are list items, not blocks.
- The inbox uses multiple small labels: group, status, read-only/no-save state, count, section heading.
- Updates, recovery, approval, and placement items share one rail, so the operator must classify work mentally.
- The right rail can steal attention from the calendar because it has dense cards and scroll.
- "Постави в графика" is understandable, but it could be more physically connected to the board.

Recommended direction:

- Treat open requests as a visual queue of loose blocks.
- Make each request card look close to an appointment block: client, service, duration, preferred window, and one action.
- Put urgency into order and edge treatment, not large warning copy.
- Keep the Action Inbox narrow but visually calm. It should not push the calendar down or dominate the first viewport.
- Hide low-value labels like "Само информация" unless the card otherwise looks actionable.
- Prefer one visible primary action per card.
- Move secondary updates behind a quieter collapsed affordance.

Urgency should appear as:

- top position in the queue,
- stronger left edge,
- small icon,
- short Bulgarian phrase like `Чака избор` or `Клиент чака`,
- never a dense status stack.

The inbox should answer: "these blocks need a place."

## 7. Booking detail panel audit

The Booking Detail panel is currently useful but still feels like an object inspector mixed with an admin action panel.

Current strengths:

- Selecting a card shows client, service, time, staff, status, message, notes.
- Confirm/cancel/reschedule are eligibility-gated.
- Confirmation steps reduce destructive risk.
- Placement and reschedule contexts replace unrelated booking detail, which prevents competing states.

Current friction:

- Actions appear in separate sections and can feel equally weighted.
- Confirm, reschedule, and cancel are not grouped by operator intent.
- Status is shown as text even when it is not meaningful.
- Notes and message state can make the panel scroll and feel record-like.
- The panel title/subtitle (`Детайли за час`, `Детайли и действия`) is accurate but not game-like.
- The user must look away from the card to find what can happen next.

Recommended hierarchy:

1. Object summary: client, service, time, staff.
2. Needed action: only if there is one.
3. Primary next action: confirm or choose a new slot, depending on state.
4. Secondary safe action: reschedule.
5. Destructive action: cancel, visually separated but not alarmist.
6. Metadata: notes, phone, message state, history, only after the action area or behind details.

Recommended copy shortening:

- `Детайли за час` -> `Избран час`
- `Детайли и действия` -> `Действия`
- `Премести час` -> keep
- `Потвърди час` -> keep
- `Откажи час` -> keep
- `Часът ще бъде потвърден и ще остане в графика.` -> `Остава в графика.`
- `Часът ще бъде премахнат от графика. Това действие ще освободи слота.` -> `Слотът ще се освободи.`

The panel should feel like selecting an object and seeing natural next moves.

## 8. Manual booking flow audit

Clicking a future empty slot is the right foundation. It is the clearest Calendar V2 entry point for manual booking.

The current modal is the weak part. `AdminBookingModal` is functional, but it is legacy-form shaped:

- large modal overlay,
- rounded form sections,
- service select,
- staff select,
- date input,
- slot picker,
- client lookup,
- phone,
- optional email,
- notes,
- helper copy,
- submit.

That is correct admin software. It is not "drop a block into a slot."

What makes it feel heavy:

- It asks the operator to re-confirm context already known from the clicked slot.
- It uses form controls rather than a block preview.
- It fetches/selects slots inside the modal even though the calendar already showed a selected position.
- The visual language differs from Calendar V2 cards and previews.
- The modal interrupts the board instead of extending the selected slot.

Recommended future direction:

- Keep the existing backend/admin-create path.
- Wrap or restyle the entry flow so the first state is a booking block draft at the chosen slot.
- Prefill date, staff, and start time from the clicked slot.
- Infer duration after service selection and preview the resulting block footprint.
- Hide email and notes until needed.
- Keep client name/phone as the only required human input after service.
- Show conflict/unavailable feedback as "does not fit here" before save.
- Use the same card/preview language as placement and reschedule.

The operator should feel: "I clicked a hole and filled it with a client block."

## 9. Reschedule flow audit

`Премести час` is the correct explicit action. It is safer than premature drag/drop persistence.

Current strengths:

- The flow is explicit: select booking, start move, choose future slot, preview, save.
- Invalid past targets are blocked.
- Local conflicts show before save.
- Backend remains authoritative.
- Drag/drop persistence is still disabled for real data.

Current friction:

- Available slots do not yet clearly light up as valid targets.
- The preview exists, but the experience still reads as "select slot and save a form."
- Invalid slots show a conflict preview, but the board should reject them more physically.
- The source block and ghost target could be visually linked more clearly.

Recommended direction:

- When reschedule mode starts, dim non-target UI.
- Keep the original block visible as the source.
- Show a ghost block following valid slots.
- Make valid slots glow softly only when the move is active.
- Make invalid slots respond with red/no-fit treatment immediately.
- Keep save explicit after preview.

Why drag/drop should still wait:

Drag/drop persistence will only feel trustworthy after the explicit flow is perfect. If a tap/click move does not clearly show valid targets, no-fit states, ghost preview, and backend reconciliation, persisted drag/drop will amplify confusion. First make moving a piece understandable. Then make dragging a shortcut.

## 10. Error and feedback audit

Current strengths:

- Known action failures normalize to calm Bulgarian copy.
- Past slot errors are action-specific.
- Conflict errors map to `Този час вече е зает.`
- Refresh warning correctly separates committed write from sync failure.
- No-past guard exists before and after backend validation.

Current friction:

- Some feedback still sounds system-oriented rather than board-oriented.
- `Промяната е запазена, но календарът не се обнови автоматично. Обновете страницата.` is honest but scary for a zero-training first impression.
- Conflict copy is calm, but the visual state should carry more of the meaning.
- Stale booking copy asks the user to refresh, but does not always show what changed.
- Placement conflict copy in preview can still explain "local check" rather than simply saying the block does not fit.

Recommended feedback language:

| Case | UX direction |
| --- | --- |
| Success | Board settles; short toast only. |
| Refresh warning | "Запазено. Обновете календара преди следващото действие." Keep as rare warning. |
| Conflict | Red ghost block plus `Не се побира тук.` Secondary text can say the time is occupied. |
| Past slot | Past area visually unavailable; click says `Изберете бъдещ час.` |
| Stale booking | `Часът е променен. Обновете календара.` |
| Already handled request | Remove/grey the request block and say `Заявката вече е обработена.` |
| Server/network | Human recovery: retry or refresh; no raw technical detail. |

The UX goal is that the operator knows the next move after every failure. Error text should not be the primary teacher; the board should show why the move failed.

## 11. Mobile/tablet implication

Do not build full mobile now. Do not compress the desktop grid onto phone.

**Tablet landscape**

Tablet landscape can keep the board mental model: staff lanes, block cards, request queue, tap-to-place, tap-to-move. Touch targets and horizontal scroll must be proven before real salon use. The right rail should become less dense, possibly a bottom/side inspector depending on available width.

**Tablet portrait**

Tablet portrait should not be a narrow Excel grid. It should become a focused day lane:

- staff filter or segmented staff selector,
- vertical day agenda for one/few staff at a time,
- request tray,
- tap request -> tap suggested slot -> preview -> save.

**Phone**

Phone should use a different mental model:

- not a compressed multi-staff grid,
- a "today stack" or "next blocks" view,
- staff selector,
- request cards as loose blocks,
- suggested available slots as large tappable places,
- booking detail as a bottom sheet,
- explicit confirm/save for placement and reschedule.

Phone should feel more like Uber choosing a ride/time or Instagram managing a simple object, not like a tiny admin calendar.

## 12. What to remove or simplify

Concrete candidates:

| Candidate | Recommendation |
| --- | --- |
| Repeated mode labels | Hide or compress once the operator is in normal real mode. |
| `Само преглед` labels in non-sample real flows | Keep only where it prevents a real mistake. |
| Multiple tiny pills on cards/inbox items | Merge into one meaningful cue or icon. |
| Staff working-hours subline on every header | Hide unless staff hours differ from the default visible day. |
| Status text for confirmed bookings | Hide; confirmed should be the default visual state. |
| `Състояние` metadata row | Move lower unless action is needed. |
| Long confirmation explanatory copy | Shorten to consequence copy. |
| Legacy modal visual language | Wrap/restyle later so it matches Calendar V2. |
| Secondary Action Inbox updates | Collapse by default. |
| "Local preview" explanations | Remove from real operator paths except sample/disabled states. |
| `Нулирай локално` in any production-capable route | Keep only in isolated fixture/dev surfaces. |
| Dense notification/history details | Move to secondary details, not first panel view. |
| Completed and no-show same tone | Separate visually or move no-show to exception treatment. |
| Action labels that describe implementation state | Replace with object/consequence language. |

Simplification principle: every visible word must either identify an object, state the next action, or prevent a real mistake.

## 13. The 2-second test

Within two seconds of opening `/admin`, a salon owner must understand:

- what is happening now,
- what is next,
- what needs action,
- where there is free time,
- whether the day is under control.

Pass/fail checklist:

| Test | Pass condition |
| --- | --- |
| Current moment | The current-time line is visible for today and not visually buried. |
| Next appointment | The next active appointment block is obvious without reading the right rail. |
| Open time | Free slots look like usable spaces, not just blank table cells. |
| Waiting requests | Open requests look like blocks waiting to be placed. |
| Action needed | Pending/needs-action items visually stand out without warning clutter. |
| Selected object | Selecting a booking makes the next valid action obvious. |
| Invalid move | A bad slot visually says "does not fit" before technical text. |
| Day control | Empty, calm, or busy day states feel intentional rather than broken. |
| No training | The owner can create, place, confirm, cancel, or start a move without being told where the control is. |

Current result: **partial fail**. Viewing the day is close. Acting on the day still depends too much on reading panels and understanding modes.

## 14. Prioritized UX roadmap

### P0 before showing to first salon

Only first-impression and basic-understanding work belongs here:

1. Simplify appointment card hierarchy so blocks are instantly readable.
2. Strengthen slot affordance so free time looks placeable.
3. Make Action Inbox requests look like blocks waiting for a place.
4. Polish selected booking action hierarchy: primary next action, secondary move, destructive cancel.
5. Improve reschedule/placement ghost block and invalid-slot feedback.
6. Shorten explanatory copy in detail, placement, reschedule, and confirmation states.
7. Ensure empty/loading/day-ready states answer "the day is under control."
8. Keep phone explicitly non-operational until it has its own mental model.

### P1 soon after

1. Create a Calendar V2-native manual booking wrapper around the existing modal behavior.
2. Separate completed vs no-show visual treatment.
3. Improve stale/refresh recovery copy and board state.
4. Reduce right-rail density at laptop/tablet landscape sizes.
5. Add a tablet landscape touch QA pass for current explicit flows.
6. Mature backend structured error codes after the UX language is stable.

### P2 later

1. Phone-specific day stack and request placement flow.
2. Tablet portrait flow.
3. Drag/drop persistence after explicit move/place is perfect.
4. Resize after authoritative scheduling and visual fit feedback are mature.
5. Realtime after command/recovery behavior is proven.
6. Richer notification policy and controls after core scheduling is trusted.

### Avoid for now

- Drag/drop persistence before visual affordances are perfect.
- Realtime.
- Complex animations.
- Broad mobile rewrite.
- Analytics dashboards.
- Dense CRM history in the primary calendar view.
- More status badges.
- More admin filters before the basic day is obvious.
- Backend/schema/deployment work as a response to this UX problem.

## 15. Recommended next implementation task

**Chosen task: appointment card visual simplification.**

This is the narrowest high-impact next step for "Tetris / Candy Crush, not Excel."

Why this task:

- Appointment cards are the primary objects on the board.
- Every flow depends on reading the card correctly.
- It is frontend-only and can be done without backend/API/schema/config changes.
- It does not require drag/drop, realtime, notifications, resize, mobile rewrite, or new packages.
- It improves the 2-second test immediately.

Scope:

- Simplify `NativeSchedulerEventCard` and its CSS only.
- Keep data, behavior, click handlers, eligibility, API calls, and write flows unchanged.
- Make confirmed/default cards calmer.
- Make needs-action cards visually clearer.
- Keep client/time readable.
- Reduce pill clutter.
- Preserve short-card readability.
- Preserve selected state.
- Do not change `/admin/calendar-legacy`.

Exact Codex prompt for the recommended next implementation task:

```text
You are working on the SalonIQ repository.
Read and follow the root AGENTS.md before doing anything else.

Reasoning level: high.

Work directly on main.

This is a narrow Calendar V2 frontend UX polish task.
Goal: make appointment cards feel more like physical blocks on a board and less like mini admin records.

Product principle:
Calendar V2 should feel like Tetris / Candy Crush, not Excel.

Scope:
- Work only in Calendar V2 appointment card rendering/styling.
- Primary files expected:
  - frontend/src/components/admin/calendar-v2/native-scheduler-spike/NativeSchedulerEventCard.tsx
  - frontend/src/components/admin/calendar-v2/native-scheduler-spike/native-scheduler.module.css
- You may inspect nearby Calendar V2 files for context.

Do NOT change frontend behavior.
Do NOT change backend behavior.
Do NOT change API calls.
Do NOT change database schema or migrations.
Do NOT add packages.
Do NOT add notifications.
Do NOT add realtime.
Do NOT add drag/drop persistence.
Do NOT add resize.
Do NOT change tenant resolution, deployment config, secrets, or env files.
Do NOT remove /admin/calendar-legacy.
Do NOT change AdminBookingModal behavior.
Do NOT change action eligibility for confirm/cancel/reschedule.

UX requirements:
- Appointment cards should read as physical blocks occupying space.
- Client name must remain the strongest text.
- Time must remain instantly visible.
- Service should remain visible on normal cards but can be reduced/hidden on very short cards.
- Duration should be communicated mostly by block height; show duration text only where it helps.
- Confirmed/default bookings should not need a visible status label.
- Needs-action/pending cards should stand out with a clear visual cue, not extra admin text.
- Message/action cues should be reduced to the minimum useful icon/label.
- Short 15-minute cards must remain readable and stable.
- Selected cards must remain clearly selected.
- Crowded/overlapping cards must remain scannable.
- Blocked time styling must not be changed unless needed to keep appointment cards distinct.

Validation:
- Run git status.
- Run git diff --check.
- If a dev server is already practical, visually inspect /admin or the Calendar V2 sample route in desktop width.
- Do not run next lint unless source changes require it and it is already part of this repo workflow.

Commit and push to main.

Expected final response:
- Commit SHA
- Files changed
- What changed visually
- Confirmation no backend/API/schema/deploy changes were made
- Any validation performed
```
