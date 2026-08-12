# League teams and fixtures — Project 1 of 2

**STATUS: SHIPPED 11–12 Aug 2026.** Design agreed with Jay on 11 Aug 2026.
Delivered across PRs #51–#56; `src/data/leagueTeams.js` and
`src/lib/fixtureLabel.js` are the code. Project 2
(`2026-08-11-match-sheets.md`) depended on this one, was not allowed to start
first, and shipped after it in #57.

⚠️ **THIS LINE SAID "NOT SHIPPED" UNTIL 12 Aug 2026, DAYS AFTER IT SHIPPED, AND
`npm run docs:check` COULD NOT SEE IT.** The plan-status check asserts that a
STATUS line EXISTS, never that it is TRUE — so a stale one is invisible to it
and reads as authoritative. It went stale because the work was split into a
design file (this one) and `2026-08-11-league-teams-implementation.md`, and only
the implementation file was marked when the code landed. **A plan split in two
has two status lines, and the one nobody is looking at is the one that rots.**

⚠️ **Write the status as SHIPPED in the same commit that ships it.** The
self-registration plan said "implementation follows in the same branch" while
sitting in the commit that implemented it — `npm run docs:check` enforces that a
plan STATES whether it shipped, and cannot tell whether the statement is true.

## The problem

**Two different things in this club are both called "team", and the app only
models one of them.**

| | What it is | Where it lives today |
|---|---|---|
| **Squad** | A training group — `U14B Contact` | `teams`, and every `players.team_id` / `events.team_id` |
| **League team** | A competing entity in one division — `ADHQ2` | **nowhere** |

Jay, 11 Aug 2026: *"each age group has 3 divisions in the league, a, b, and c,
clubs can have multiple teams at an age group"*.

So one squad can enter several league teams. The app cannot say which of them
played a given fixture, and the RCM match result sheet's `TEAM:` field — the one
that tells the governing body whose result this is — has nothing to read.

⚠️ **THE LETTER IN A SQUAD NAME IS GENDER, NOT DIVISION.** `U14B Contact` is U14
**Boys**; `U14G QR` is Girls. `private.squad_expects_gender` parses exactly that
suffix and `src/lib/gender.js` depends on it. Nothing in the database expresses
A/B/C at all, and anything that tries to read a division out of `teams.name`
will read the gender instead.

## What this is worth on its own

Two fixtures for the A and B teams on the same Saturday are **indistinguishable**
on the Schedule today — both render as `U14B Contact`. This project fixes that
whether or not match sheets are ever built.

## Schema

### `public.league_teams`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `club_id` | uuid not null | FK `clubs` on delete cascade |
| `team_id` | uuid not null | FK `teams` on delete cascade — the squad it draws from |
| `rcm_name` | text not null | What RCM calls it: `ADHQ2` |
| `division` | text | CHECK in `('A','B','C')`, nullable |
| `is_active` | boolean not null default true | retire without deleting, as `pitches` does |
| `sort_order` | integer not null default 0 | |
| `created_at` | timestamptz not null default now() | |

`UNIQUE (club_id, rcm_name)`.

⚠️ **`is_active` rather than delete, for the reason `pitches` documents**:
deleting a league team would leave last season's fixtures pointing at nothing.

⚠️ **`division` is NULLABLE on purpose.** A club can enter a team that is not in
a lettered division; forcing a letter would invent data. It is a display field,
never a gate.

### `public.events` — two new columns

| Column | Type | Notes |
|---|---|---|
| `league_team_id` | uuid | FK `league_teams` **on delete SET NULL** |
| `round` | smallint | league round number, nullable |

⚠️ **ON DELETE SET NULL, NOT CASCADE.** Deleting a league team must never delete
fixtures. It loses the label, which is recoverable; it must not lose the match.

## ⚠️ The rule that must be written into the code, not inferred

**A fixture is a league match when `league_team_id` IS NOT NULL. Null means it is
not one, and division and round render as nothing at all.**

Stated explicitly because this club has already been bitten by exactly this
shape: `src/lib/ageGroup.js` returned `null` for an unparseable squad name,
`allowsOwnContact` read `null` as "a senior side: adults", and the app offered a
twelve-year-old girls' squad the child's own email and phone fields. **The lesson
recorded then was the null default, not the regex.** Here the safe direction is
to show nothing; anything that reads null as "assume league" repeats the bug.

## Screens

**Club screen (`/admin/club`)** — manage league teams per squad: add, rename,
set division, retire, bring back. Same shape as the pitch setup screen, which is
the closest existing precedent (`/admin/pitches`).

**`EventForm`** — when the event type is a match, offer the league team for that
squad and a round number. ⚠️ **Only league teams whose `team_id` is the event's
squad** may be offered; the list must not be club-wide.

**`EventDetail`, `Schedule`, `FixtureRow`** — render `ADHQ2 · Div B · Round 4`
where the squad name alone appears now, falling back to the squad name when
`league_team_id` is null.

**Calendar feed** — the league team name belongs in the event title parents
subscribe to. ⚠️ **The feed is served by an edge function, not the bundle**, so
this is a separate deploy from the app and can drift; change both together.
⚠️ A subscribed URL cannot be changed remotely once a parent holds one — the
title content is safe to change, the URL is not.

**Allocation grid** — rows currently label by squad; label by league team when
there is one, so Tracy can tell the A and B fixtures apart.

## RLS

`league_teams` follows `pitches` exactly: read by any signed-in member, write by
`private.is_admin`. ⚠️ **The `youth` admin right gates the SCREEN, not the data**
— the same ruling recorded for `pitches`. A right is a "not your job" message and
must never be described as a security boundary.

`events` policies are unchanged: the two new columns ride on `event edit`.

## Testing

- `league_teams` RLS harness in `db/tests/`, with an injected fault, following
  `db/tests/rls-pitch-requests.sql`.
- A unit test pinning the null rule: an event with no `league_team_id` renders
  **no** division and **no** round, and one with a league team renders both.
  ⚠️ The fixture must fail if the null branch ever starts rendering a default —
  a test that passes against the bug it exists to catch is worse than none.
- A test that `EventForm` offers only the squad's own league teams.

## Deliberately NOT in this project

- **Tournaments.** Jay, 11 Aug 2026: *"tournaments are a different story we can
  deal with later on"*. ⚠️ Recorded here so nobody later reads a null
  `league_team_id` as a modelling oversight rather than a fixture that is
  genuinely not a league game.
- Fixtures for more than one league team at once. A `group_id` fan-out already
  exists for multi-squad events and is a separate, deferred problem.
- Standings, points or results tables. Nobody has asked for them.
