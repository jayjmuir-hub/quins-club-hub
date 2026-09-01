# The end time is optional — reversing the 8 Aug ruling

**1 Sep 2026. Jay's call, reversing Jay's own earlier call.**

## What changed

`EventForm` refused to save a **Timed** event with a blank end time. It now
accepts one, and writes `ends_at` as an explicit `null`.

## Why the first ruling was right, and why it stopped being right

On 8 Aug 2026 Jay ruled the end time REQUIRED. At that point every event was a
fixture, a training or a social, and all three genuinely finish — a fixture with
no end is a fixture somebody forgot to finish entering.

**Club Diary (#603, 31 Aug) introduced dated items that do not finish.** Jay hit
it immediately, trying to enter a real one: *"the online shop opens at 7pm
tonight"*. A start that matters, and no end anyone could name. The only ways in
were to invent a finish time nobody meant, or to call it all-day and throw away
the 7pm — which is the actual information.

⚠️ **The ruling was not wrong. Its premise expired.** That is worth separating,
because the temptation on finding a rule inconvenient is to decide it was always
a mistake.

## What did NOT have to change, and this is the useful part

**`ends_at` was nullable all along**, and everything below the form already
coped:

- `CHECK (ends_at IS NULL OR ends_at > starts_at)` — always permitted null.
- `endFor()` in `supabase/functions/calendar/index.ts` falls back to a per-type
  duration guess, and has since 8 Aug.
- `db/migrations/20260808_event_end_time_and_notes.sql` made the column nullable
  deliberately, so an external fixture feed could not hard-fail.

**The form was simply stricter than the model.** One boolean moved; no
migration, no backfill, no edge deploy.

⚠️ **Measured before changing it, 1 Sep 2026:** of **529** live events, **27**
carry a NULL end and **every one of them is `time_tbd`** — zero plain-timed rows
have one. So no existing row changed meaning, and the state was genuinely unused
rather than merely rare.

## What is still refused

Blank is fine. A **filled** end that does not land after the start is still
refused, or the database's `events_ends_after_starts` surfaces as a raw `23514`
that means nothing to a coach. Optional is not unchecked, and the tests hold
both halves.

## Where "optional" is said

In the field's **description** (`#event-time-note`, the TimePicker's
`aria-describedby`), not in the label.

⚠️ **The label's accessible name is queried as exactly `"End time"` by about
fifty assertions across eight test files.** Renaming it would have meant a
fifty-line diff through tests with nothing to do with this change, and every one
of those edits a chance to alter behaviour by accident. The description is
announced by a screen reader *and* visible, so nothing is lost.

## What this does NOT do

It does not add a fourth time state. **Timed / Time TBD / All day** still stand;
a blank end is a Timed event that happens not to finish, and the calendar feed
still emits a guessed duration for it because ICS has no point-in-time event.

⚠️ **An explicit fourth state — "Starts at" — was specified and NOT built:**
`claude/plans/2026-09-01-starts-at-time-state.md`. It is the more honest model
and it costs a migration, two edge deploys and four harnesses. This decision is
the twenty-minute version, taken knowingly.

Related: `claude/plans/2026-08-31-club-diary.md`.
