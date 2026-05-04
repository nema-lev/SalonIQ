# Calendar V2 foundation

This folder contains renderer-independent contracts for a future admin Calendar V2.

- This is a foundation only. It does not change the current admin calendar route or UI.
- Domain types, command shapes, projections, and Action Inbox helpers must stay independent of calendar rendering libraries.
- FullCalendar, Bryntum, DayPilot, Mobiscroll, Schedule-X, or another scheduler must be hidden behind an adapter when added later.
- Desktop and tablet landscape should use a scheduler-engine adapter.
- Phone should keep a separate custom agenda/day renderer instead of sharing the desktop scheduler renderer.
- Untimed demand belongs in demand/request/waitlist projections, not in scheduled calendar blocks.
- Write interactions should go through typed commands before they are wired to API calls.
