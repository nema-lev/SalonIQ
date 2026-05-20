# Calendar V2 Concept Sprint

## Why this playground exists

`/admin/calendar-concepts` is an isolated visual playground for choosing a new salon calendar direction before changing production Calendar V2. It uses local mock data only and does not write, persist, call booking APIs, or depend on real appointment data.

The product feedback is that the current Calendar V2 is technically useful but not a strong first salon impression. The owner does not want another small polish pass on the same admin/table direction.

## Why current Calendar V2 is not enough

The current UX still reads as dense admin software. It shows too much structure by default, especially when multiple specialists are visible, and the permanent right rail makes the experience feel heavier than a modern consumer app. Requests also read as list items instead of blocks waiting to be placed.

The new direction should make scheduling feel visual and immediate: blocks, gaps, clear fit/no-fit feedback, obvious next moves, and fewer controls competing for attention.

## Concepts

### Concept A: Focus Day Board

Tests a one-specialist default view with a staff switcher for Мария, Никол, Анна, and Всички. Requests appear as loose blocks, appointments are physical blocks on a day lane, free gaps invite placement, and appointment details open in a compact floating sheet instead of a permanent heavy rail.

This concept answers whether SalonIQ should prioritize a specialist-first daily workflow for salons where each person mostly manages their own schedule.

### Concept B: Slot Finder

Tests a scheduling assistant flow where the user starts from a request/service. The selected request becomes a piece, recommended slots are prominent, valid slots show ghost previews, and invalid slots respond immediately with "Не пасва тук".

This concept is closest to the requested Tetris/Candy Crush feeling because it makes fit/no-fit the main interaction instead of a late validation error.

### Concept C: Command Center

Tests a calm premium daily dashboard: top summary, central schedule board, compact action queue, and a contextual bottom bar for the selected appointment. It removes the dense right rail while still giving a business owner a controlled overview of the day.

This concept answers whether the redesign should feel more like an operations cockpit than a placement game.

## Strongest Direction

Concept B currently looks strongest for the stated product goal. It changes the mental model most radically: the request is a piece, the calendar is the board, and fit/no-fit is visible before the user commits. It also directly addresses the owner feedback about visual blocks, obvious moves, and invalid slots not being selectable and failing later.

Concept A is the strongest secondary direction for day-to-day specialist focus. Concept C is useful for owner overview, but it is less radical than B.

## Do Not Implement Yet

- Do not wire these concepts to real data.
- Do not add real writes, persistence, drag/drop persistence, resize, notifications, realtime, or backend changes.
- Do not replace `/admin`, `/admin/calendar-v2`, or `/admin/calendar-legacy`.
- Do not change tenant resolution, API contracts, schema, migrations, deployment config, secrets, or env files.
- Do not treat mock controls as final production behavior.

## Recommended Next Step

Review the route with the product owner and choose one direction to harden. If Concept B wins, the next sprint should define the real scheduling states and fit rules before any production Calendar V2 redesign begins.

## Captured Screenshots

Screenshots are stored in `docs/calendar-v2-concept-sprint-screenshots/`:

- `concept-a-desktop.png`
- `concept-a-selected-appointment.png`
- `concept-b-desktop.png`
- `concept-b-selected-request-ghost.png`
- `concept-c-desktop.png`
