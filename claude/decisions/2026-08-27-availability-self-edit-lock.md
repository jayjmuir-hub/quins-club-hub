# Parents may clear availability — but self-edits lock before the event

**27 Aug 2026.** Reverses the 9 Aug 2026 decision that DELETE on `availability`
is staff-only, and replaces it with a time-lock that bounds every self-edit.

## What changed
A parent/player may now set, change, AND clear (delete) their own child's
availability — until a cutoff, after which staff alone can adjust it. The cutoff
is a calendar-day boundary in Abu Dhabi time: 5 days before a match, 1 day
before training, never for a social.

## The argument AGAINST (from 9 Aug, preserved so it is not re-made blind)
The 9-Aug migration made DELETE staff-only on the reasoning that "a parent
changes their answer, they do not remove the row" — a set/change is a real
signal, a delete is ambiguous (did they mean "no" or "I haven't decided"?), and
"No response" already exists for the undecided. That reasoning still holds for
an OPEN event; what changed is that a hard lock now exists, so the risk it
guarded against (a parent silently emptying a row a coach was relying on) is
bounded by the window instead of by forbidding delete outright.

## Why the lock
Coaches plan off the squad list; late changes wreck it. A fixed, visible
deadline is what the club actually wanted — not a permanent ban on one verb.

## Where it lives
RLS is the gate (`private.availability_self_editable`, shared by the three
`avail write` policies — `db/migrations/20260827_availability_self_lock.sql`);
the sheet mirrors it for the affordance only. Anchor:
`db/tests/rls-availability-equivalence.sql`.

## Rejected
UI-only lock (bypassable); rolling-hours cutoff (Jay chose calendar days);
a stored per-event `locks_at` column (YAGNI until per-event overrides are asked
for).
