# Plan: repeating events

*Agreed with Jay 5 Aug 2026. NOT STARTED — build this at the start of a fresh session.*

## The problem

Adding a training session that runs every Tuesday and Thursday for four months means
entering it ~34 times by hand. Nobody will do that, so the schedule stops being trusted.

## Decisions taken

| Question | Decision |
|---|---|
| Approach | **Bulk-create real rows**, not a recurrence rule |
| Pattern | **Multiple weekdays per week** — Tue AND Thu in one go |
| End condition | **Until a date** |
| Series id | **Yes** — a shared id on every generated event |
| Preview | **Yes** — list the dates with tick boxes before anything is written |

## Why bulk-create, not an RRULE

**Availability is per-event.** Players RSVP to an individual training session. If a series
were one row with a recurrence rule, there would be nothing for 34 separate RSVP lists to
hang off — you would end up inventing per-occurrence records anyway, which is bulk-create
with extra steps.

It also leaves everything downstream untouched: the calendar feed, results, the schedule
list, and RLS all keep working on ordinary event rows. A recurrence rule would touch all
of them.

The cost, accepted knowingly: each occurrence is independent after creation. Editing one
does not edit the rest. The series id exists so that "cancel all remaining in this series"
can be added later without a migration.

## Scope

- One team per series. **Do not** fan out across age groups — a 4-month series across 15
  age groups is ~500 rows from one form submission.
- The preview is the guard against Ramadan, Eid, half-term and summer generating sessions
  nobody attends. Generating blind and deleting the strays afterwards recreates the exact
  problem this feature exists to solve, in reverse.

## Build order

1. **Migration** — add `series_id uuid` (nullable) to `events`. Nullable so every existing
   event stays valid. Index it if "cancel the series" is coming.
2. **`EventForm`** — a "Repeats" section: weekday checkboxes (Mon–Sun) and an end date.
   Hidden when editing an existing event; this is a create-time feature only.
3. **Date generation** — pure function, own unit tests, no React. Given a start date, a
   set of weekdays and an end date, return the list of club-day dates.
   ⚠️ Build it from `{year, month, day}` numbers, never from `Date` arithmetic — same
   reason as the calendar grid. See `CLUB_TIME_ZONE` in `src/lib/eventFormat.js`.
4. **Preview** — render the generated dates, all ticked by default, each untickable.
   Show the count ("16 sessions").
5. **Save** — one `series_id` generated client-side, applied to every row. Insert as a
   single batch, not a loop of inserts, so a partial failure cannot leave half a term
   created.
6. **Tests**, each proved against an injected fault:
   - two weekdays generate the right dates across a month boundary
   - unticking a date excludes exactly that one and nothing else
   - every created row shares one `series_id`
   - a series created from a browser outside UTC+4 lands on the club's weekdays
   - editing an existing event shows no Repeats section

## Open, deliberately deferred

- "Cancel all remaining in this series" — the `series_id` makes it possible; not in scope.
- Editing a whole series at once. Same.
- A visible marker on the schedule showing an event is part of a series.
