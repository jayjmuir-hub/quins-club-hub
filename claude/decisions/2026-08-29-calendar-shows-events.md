# The Calendar tab shows events, not dots — 29 Aug 2026

## The complaint

Jay, looking at the Calendar tab on a desktop: *"its not really that useful,
tiny dots on days showing a full calendar isn't a premium design for users."*

## What was there

`CalendarMonth` (`src/screens/Schedule.jsx`) rendered, at every width:

1. A seven-column month grid where each day cell showed **only** up to four
   6×6px type-coloured dots, bottom-left. The dots said *how many* events and
   *what type*, and nothing else — not the name, not the time.
2. **Directly beneath it**, a full `FixtureList` of the same month's events as
   rich rows (date box, type chip, title, time, venue).

So every event was drawn twice: once as a dot that carried almost no
information, once as a row that carried all of it. The dot grid spent the whole
height of the screen — ~150px cells on desktop — to say less than the list
below it already said.

## The options weighed (with Jay)

- **A — Grid shows real events** (chosen). Make the grid pull its weight: each
  cell shows the actual events (type dot + kick-off time + name) on a wide
  screen; on a phone, where a seven-column grid gives ~45px cells, the tab
  becomes a clean agenda instead. Kills the dots and the double-render.
- **B — Agenda-first.** Drop the grid entirely; the tab is a day-grouped
  agenda at every width. Cleanest on mobile, but throws away the at-a-glance
  shape of the month a desktop user actually wants.
- **C — Mini-map + agenda.** Shrink the grid to a navigator pinned above a
  scrolling agenda. Keeps navigation but demotes the grid to a date-picker.

Jay picked **A**: the grid is worth keeping *if it earns its space*, and the
view he was complaining about (desktop) is exactly where a content-bearing grid
is the premium answer.

## What shipped

`CalendarMonth` now branches on `isWide` (`useMediaQuery(DESKTOP_QUERY)`, 820px):

- **Wide** — the month grid, each populated cell showing up to
  `MAX_CELL_EVENTS` (3) event lines: a type dot, the kick-off time (dropped for
  a TBD fixture, never faked), then the name truncated so it cannot break the
  grid. Past three, the tail collapses to `+N more`; the cell's `aria-label`
  still reports the true count and the day sheet still lists every event. **No
  fixture list underneath** — the cells are the list, so the old redundancy is
  gone.
- **Phone** — no grid. The month is the same rich `FixtureRow`s the other tabs
  use, sorted, under the month nav. A row opens the event directly; there is no
  cell to tap, so the day sheet has no phone entry point here (it still exists,
  opened from the Dashboard's fortnight strip).

The design contract is `claude/specs/design-system.md` §4.14. The timezone
rules (bucket on the club's Abu Dhabi day, not the browser's) are unchanged —
this was a presentation change, not a data one.

## Why the day sheet became wide-only on this screen

Tapping a grid cell is what opens the day sheet, and the grid is now wide-only,
so on a phone the Calendar tab reaches an event through its agenda row instead —
one tap to the event, rather than a tap to a day and a second to the event. The
`DaySheet` component is untouched and still used by the Dashboard.
