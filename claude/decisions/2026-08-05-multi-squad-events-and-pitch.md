# Decision: multi-squad events by fan-out, and a free-text pitch

Agreed with Jay 5 Aug 2026. **BUILT, SHIPPED AND VERIFIED LIVE** — commit `73eeb38`,
deploy `6a73551dd609b90008bf2ff6`, published 15:22 UTC. Live verification below.

## The ask

> "When an admin is creating an event they need to be able to pick multiple age
> groups for that event, also admin, coach, manager need to be able to assign a
> pitch for a match or training."

## The four decisions

| Question | Decision | Why |
|---|---|---|
| One event for many squads, or one event each? | **One event each** (fan-out, shared `group_id`) | See below |
| What is a pitch? | **Free text beside Venue** | No pitches table, no clash detection |
| Multi-squad **and** repeating? | **Refused outright** | Row multipliers that multiply each other |
| "Manager"? | **A coach with a label.** No new role | Fourth time it has come up |

## Why fan-out and not a junction table

`team_id` is the security boundary, not just a foreign key. It drives:

- the `event read` / `event edit` RLS policies on `events`
- the `avail read` / `avail coach manage` policies on `availability`, which reach
  **through** to `events.team_id` to decide who may read an RSVP
- `listEvents`' `.in('team_id', teamIds)` filter
- the calendar edge function, `Schedule`, `Dashboard`, `FixtureRow`, `ScheduleTable`

An `event_teams` junction table would be a rewrite of the read path **and** of the
security boundary — days of work touching RLS on two tables. A fan-out is purely
additive: each squad gets an ordinary, independent event row that every existing
query, policy and screen already handles correctly.

**The cost, stated plainly: a score or a venue change is one edit per squad.**
`group_id` is on every row of a fanned-out session precisely so "apply this change
to every squad in the session" can be added later **without another migration**.
If Jay hits that friction, that is the thing to build — not the junction table.

### Why "primary squad + extras", not one flat multi-select

The Age group `<select>` is untouched; the extras are a separate chip group beside
it. Two reasons:

1. Every existing caller and test of the Age group field keeps working. A
   `<select multiple>` would have broken `selectOptions` in
   `tests/event-form.test.jsx` (it *adds* to a multi-select rather than replacing),
   silently turning single-squad tests into fan-out tests.
2. The asymmetry is honest. These really are separate events, and the UI should not
   imply one event has three owners.

## Why the combination is refused, not capped

Extras and repeating are each row multipliers; together they multiply each other. A
term of Tuesday training across 15 squads is **~1,500 rows from one form
submission**, and there is no undo built. Refusing is the same call
`generateSeriesDates` already makes when it throws on a range over a year rather
than truncating: writing less than was asked for looks like success.

Two layers: the Repeats section **warns** as soon as an extra is ticked, and
`handleSubmit` **refuses**. The warning is the courtesy; the refusal is the guard.

## Why the pitch is free text

There is no venues or pitches table and this deliberately did not invent one. A
managed list becomes worth its cost the day someone wants **clash detection**
("Pitch 2 already has U12 at 18:00") — that needs a controlled vocabulary to
compare against, which free text cannot provide. Until then a pitch costs one
nullable column.

**If clash detection is ever asked for, this is the decision to revisit** — and it
needs a rule for what counts as a clash (exact start? overlapping window? how long
is a session?), which nobody has defined.

## "Manager" — fourth mention

Raised 4 Aug, 5 Aug (twice), and again here. Jay's answer this time: *"same as a
coach just designated a team manager."* So it is a **label, not a role** — a coach
membership on that squad already grants exactly the rights described, including
assigning a pitch. **Nothing was built for it.**

Still open, and purely cosmetic: whether the word "Manager" should appear in the UI
for those people. That would mean a display-only label, not a `ROLE_PRECEDENCE`
entry. See also `claude/plans/2026-08-05-admin-dashboard.md` § "Why 'organizer' was dropped".

## Schema

`db/migrations/20260805_event_pitch_and_group_id.sql`, applied to Supabase.

```sql
alter table public.events add column if not exists pitch text;
alter table public.events add column if not exists group_id uuid;
create index if not exists events_group_id_idx
  on public.events (group_id) where group_id is not null;
```

**No RLS change.** Both `events` policies key off `team_id`, which is untouched.

`group_id` and `series_id` are **never both set** on one row — a multi-squad event
cannot repeat and a repeating event is one squad. That is enforced in the form, not
by a database constraint: it is a rule about volume, not correctness, and a
constraint would be a trap for any future backfill.

## Fault injection — 7 faults, all caught by the intended tests

| Injected fault | Caught by |
|---|---|
| `group_id` generated **inside** the map | "gives every row the SAME group_id, not one each" |
| combination guard short-circuited | "refuses extras combined with a repeat, and writes nothing at all" |
| `pitch` forced to `null` | "writes the trimmed pitch" + the fan-out details test |
| `venueLine` ignoring the pitch | 2 pure tests in `event-format.test.js` + the fixture-row test |
| detail-sheet Pitch row always rendered | "the row is absent when not" |
| extras list not excluding the primary squad | 3 tests, incl. the double-count on dropdown change |
| fan-out row order reversed | "one row per squad, in one insert" (isolated on a second run) |

---

# Verified live, 5 Aug — against production, on the real request and response

Driven through Jay's Chrome ("claude2 - homepc") against `adhquins-clubhub.com` with
`window.fetch` hooked, so every assertion below is on the actual HTTP traffic, not on
a screenshot. Test data created and then **deleted** (`0` rows left with a
`group_id` or the temp title).

## The fan-out

A U6 training session with U7 and U8 ticked, 15 Sep 2026 18:00, Pitch 3:

- **ONE** `POST /rest/v1/events` → **201**. Not three requests.
- **3 rows in a single array**, all carrying the same
  `group_id = 0013f2c3-2b97-452b-a84d-65928beebecc`
- three distinct `team_id`s, **in the club's sort order** (U6, U7, U8) — primary first
- `starts_at` `2026-09-15T14:00:00.000Z` on all three = 18:00 Abu Dhabi, and the
  schedule renders it back as 6:00 PM
- `pitch: "Pitch 3"` round-tripped through Postgres
- **3 rows returned for 3 sent**, so `insertEvents`' short-response refusal check
  passed rather than being skipped
- no `series_id` on any row

## The row-count guard

Extras ticked **and** a Tue repeat until 15 Dec, then Save:

- the inline alert appeared: *"Repeating is one age group at a time…"*
- the sheet stayed open
- **zero** requests to `/rest/v1/events`. Nothing was written at all.

## The pitch

- schedule table Venue cell: `Zayed Sports City, Abu Dhabi · Pitch 3`
- detail sheet: **Venue** and **Pitch** as two separate labelled rows
- a pre-existing event with no pitch shows **no Pitch row at all** — the backwards
  compatibility case

## The missing-contact count

Live data could not exercise it: every one of the 328 players has a `player_contacts`
row, so every squad correctly read "0 missing" and nothing was displayed. Proved
instead by **injecting a fault into the response** (mutating nothing): one contact row
dropped from the `player_contacts` payload →

- exactly one squad changed, to `U10 | 24 players · 1 missing contact info`
- the dropped player's `team_id` was confirmed by SQL to be **U10**

Player counts also matched the database exactly across all 15 squads.

## Routing (from the admin-dashboard work)

- `/admin` → redirects to `/admin/accounts`; tabs are real links with `aria-current`
- `/accounts` → redirects to `/admin/accounts` (Jay's bookmark)
- `/overview` → falls through to `/`, renders the Dashboard
- `/more` → role "Admin", all 15 squads listed, sign-out present **and visible**,
  Admin link present, **zero** club-member rows
- primary nav: exactly Home / Schedule / Roster / More + one Admin pill. No Overview
  pill, no Accounts pill

## What the live check did NOT cover

- **A parent signing out has still never been done for real.** The session ran as an
  admin; there is no parent account to sign in as. Still jsdom-proved only, and it is
  the one regression that can lock people out.
- **The phone-width note has still never been rendered.** `resize_window` did not take
  effect (window appears maximised; `innerWidth` stayed 1451 across two attempts). What
  *was* confirmed, from the compiled production CSS: the note carries `desktop:hidden`,
  the dashboard wrapper carries `hidden desktop:block`, and the shipped stylesheet
  contains `@media (min-width: 820px) { .desktop\:hidden { display: none } }` and
  `{ .desktop\:block { display: block } }`. The mechanism is right; the rendering at a
  narrow viewport is unseen.
- **The RLS refusal path still has never fired.** Ran as admin, so `can_edit_team`
  never said no.

## Defect found during the live check

**The Save button over-promises when the combination is invalid.** With extras ticked
*and* a repeat configured, the button reads "Add 14 events" (the series count) even
though submitting is refused. The series branch of the label is evaluated before the
multi-squad branch and neither knows about the guard. Cosmetic — the warning sits
directly above it and the refusal is clear — but the button should say something
truthful, or be disabled, when `multiSquad && repeating`.

## Known gaps

- **The pitch does not reach the calendar feed.** That is the `calendar` edge
  function (v18); changing it is a separate live deploy and was not done uninvited.
  One line: `LOCATION` should carry venue + pitch.
- **No way to edit or cancel a whole group.** By design for now — `group_id` is the
  hook for it, and `series_id` wants the same feature.
