# Club Overview Dashboard — design spec (Phase 1)

Date: 2026-08-03
Status: approved by Jay, ready for implementation planning

## Context

The existing `Dashboard` screen (src/screens/Dashboard.jsx) is built mobile-first: one
next-fixture hero, three stat tiles, a short upcoming list, quick actions. It works well on a
phone but doesn't give an organizer sitting at a desk — a club admin, a coach, or an age-group
manager — a real at-a-glance view across everything they're responsible for. Jay asked for a
new screen that fills that gap: something desktop-first, built for organizers doing scheduling
and squad management from a PC, not for a parent checking a fixture on their phone.

This spec covers **Phase 1 only**. A 4th section (a real activity feed — "who changed what,
when") was explicitly deferred to a separate Phase 2, because it requires a new audit-log
database table and wiring every existing write path (players, events, availability, invites) to
log to it — a materially bigger, separate piece of backend work that shouldn't block or slow
down Phase 1, which needs no schema changes at all.

### Prior art note (why this doc exists, and a process fix alongside it)

An earlier attempt at a similar plan (`desktop-spec.md`) was created in a different Cowork
session and never committed to git. That session's cloud sandbox was discarded when it ended,
so the doc no longer exists anywhere — a real, unrecoverable loss, reconstructed only from
detailed commit messages on `build/v1-mvp` and `feat/desktop-schedule` (see RESTORE.md's
"Working across sessions" note, added alongside this spec). The concrete process fix: this
spec is committed to git in the same session it's written, before any implementation work
starts — nothing durable stays in an ephemeral sandbox past the end of a session.

## Goals

- Give admins, coaches, and age-group managers ("managers" from here on — same `coach` role in
  the schema, see Roles below) one screen that surfaces, across every team they're allowed to
  see: what's coming up, who has and hasn't responded, and where the roster has gaps.
- Desktop-only. Nothing about the phone experience changes.
- No database schema changes. Everything here is derivable from data that already exists.

## Non-goals (explicitly out of scope for this spec)

- The activity feed (Phase 2, needs a new audit-log table — separate spec when it's scoped).
- A full calendar grid (Schedule already has one; this screen is a fast agenda-style scan, not
  a calendar replacement).
- Any new role or permission level. "Age-group manager" reuses the existing `coach` role
  exactly as-is — confirmed with Jay, no schema/RLS change.
- A configurable "target squad size" threshold for flagging teams as short-staffed. Real counts
  are shown; no threshold is invented. If Jay later wants one, it's a small follow-up.

## Roles & scoping

Reuses `src/lib/scope.js` exactly as every other screen does:

- **Admin**: `visibleTeams()` returns all 15 age groups — sees everything club-wide.
- **Coach / age-group manager**: `visibleTeams()` returns only the team(s) their membership
  row(s) reference — sees only their own squad(s). No code-level distinction between "coach"
  and "manager"; it's the same role, same query shape, same RLS. Whether someone is called a
  coach or a manager in real life is a people/title question, not a permissions question.
- **Parent / player**: this screen does not appear in navigation at all. It's an organizer tool,
  not a wider-visibility read view — a parent's needs are already served by the existing
  Dashboard.

RLS is unchanged and remains the actual enforcement boundary, exactly as documented in
`claude/runbooks/e2e-roles.md`. This screen requests data scoped by `teamIds` the same way Dashboard,
Schedule, and Roster already do; a bug in this screen's own filtering could only ever narrow
what's shown, never widen it, because the database policies decide the real limits regardless
of what the UI asks for.

## Navigation & access

- New nav entry, label "Overview", added to `Nav.jsx` alongside Home/Schedule/Roster/More.
- Visible only at `desktop` width (≥820px, the existing Tailwind `desktop:` breakpoint) — on
  phone-width viewports the nav item doesn't render at all, matching how the roster table and
  bulk importer are already desktop-only (hidden, not disabled).
- Visible only to admin and coach roles (`isAdmin(memberships) || scopedTeams.some(team =>
  canEditTeam(memberships, team.id))` — the exact same `canEdit` check `Dashboard.jsx` already
  computes for its own quick-actions gating). Parents/players never see the nav item.
- Route: `/overview`, a new screen component `src/screens/Overview.jsx`.

## Layout — three sections, in this order

### 1. Upcoming fixtures, all visible teams

An agenda-style list, not a calendar grid — reuses the existing `FixtureRow` component (same
one Dashboard and Schedule already use), grouped by date, covering the next 14 days across
every team in scope. Admin sees fixtures from all 15 age groups interleaved by date; a coach
sees only their team's. Clicking a row opens the existing `EventDetail` sheet, same as every
other screen's fixture rows — no new detail UI.

### 2. RSVP status per fixture

For each fixture in section 1's list, a compact status summary: counts of In / Maybe / Out / no
response, e.g. "9 In · 2 Maybe · 1 Out · 3 no response". This needs one new small data-access
function:

```
// src/data/availability.js — new function, alongside the existing listAvailability(eventId)
export async function listAvailabilityForEvents(eventIds) { ... }
```

Shaped exactly like the existing `listEvents({teamIds})` / `listPlayers({teamIds})` pattern: an
empty `eventIds` array returns `[]` without querying, a non-empty array does one `.in('event_id',
eventIds)` query rather than one round-trip per fixture. This avoids an N+1 fetch pattern once
there are many upcoming fixtures across 15 teams. No RLS change — `availability` rows are
already scoped to the caller's visible teams exactly like `events` and `players` are.

### 3. Roster gaps, per team

For each team in scope: current player count, and a count of players with no matching
`player_contacts` row (i.e., a player record exists but nobody's contact details were ever
entered). No player-count threshold or "ideal squad size" — see Non-goals. This is a read of
existing `players`/`player_contacts` data the same way `PlayerDetail.jsx` already reads
contacts for a single player, just aggregated per team instead of per player.

## Data flow

The screen fetches, scoped by the same `teamIds` derived from `visibleTeams()`:
- `listEvents({teamIds, from: <today>, to: <today+14 days>})` — reuses the existing function
  as-is, just with a date range Dashboard doesn't currently pass.
- `listAvailabilityForEvents(eventIds)` — new function, IDs taken from the events just fetched.
- `listPlayers({teamIds})` and a per-team `player_contacts` presence check — reuses existing
  data, aggregated client-side (no new query shape needed for contacts beyond what
  `getPlayerContact` already proves is reachable per player; the aggregate here is either a
  loop over players or a single query filtered to the visible player ids, decided at
  implementation time based on whichever avoids N+1 more cleanly).

No new realtime subscriptions are required for Phase 1 — a manual refresh (or the existing
realtime hooks on events/availability, if trivially reusable) is sufficient for an overview
screen; this is a "check on it" screen, not a live-updating operational display.

## Error handling

Same conventions as every existing screen: data functions throw on error (never `{data, error}`
tuples), a failed fetch renders a `Card role="alert"` with a retry button (same pattern
`Dashboard.jsx` already uses), and an empty result (no upcoming fixtures, no players) renders
the shared `Empty` component rather than a blank section.

## Testing

- Unit tests (Vitest + RTL), following the existing per-screen convention: role-based
  visibility (nav item and route both hidden for parent/player), scoping (admin sees all
  teams' data, coach sees only their own), the three sections render correctly against fixture
  data, and the new `listAvailabilityForEvents` function is tested the same way
  `listAvailability`/`listEvents` already are (empty-array short-circuit, correct query shape).
- Build must stay clean, existing test suite must stay green (no changes to any existing
  screen's behavior).
- Independent browser-verification pass before calling it done, matching the standard this
  build has held for every prior task (Playwright or the existing harness, whichever fits — a
  new screen, so likely a new harness scenario rather than reusing `shell-coach`/`shell-admin`
  if those don't already carry fixture/availability fixture data).

## Open items for the implementation plan (not this spec)

- Exact aggregation approach for "players missing contact info" (loop vs. one filtered query)
  — an implementation detail, not a design decision; whichever avoids N+1 more cleanly.
- Whether to add a lightweight realtime refresh or leave it manual-refresh-only for Phase 1 —
  a small call to make at implementation time based on how it feels in practice, not a blocking
  design question.
