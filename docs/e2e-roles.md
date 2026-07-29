# Quins Club Hub — End-to-end role & scoping checklist

> **Availability/RSVP is currently OFF** (`src/lib/features.js`, `FEATURES.availability = false`,
> set 2026-07-29 — the club isn't ready to rely on digital RSVP yet). Every item in this doc that
> mentions Availability/RSVP describes what happens when that flag is **on**; today, EventDetail
> shows neither the summary bar nor a "set availability" button, and `listAvailability` is never
> called. The `availability` table, its RLS policies, `src/screens/Availability.jsx` and this
> checklist are all still fully valid — re-run this doc as-is once the flag is flipped back.

This is the checklist to run once real `admin` / `coach` / `parent` (and, where the club treats
them separately, `player`) accounts actually exist — after the Task 19 first-admin bootstrap step
and the Task 18 invite flow have been used to create them. There is no seeded real membership
data in this build (the Wild Apricot import is a separate, later, out-of-scope step per
`RESTORE.md`), so this checklist was written and grounded against three things instead of a live
run of it end-to-end: the actual RLS policies (verified live against the Supabase project by
Tasks 16/21, cited below), the actual client-side scoping helpers (`src/lib/scope.js`), and the
actual UI behaviour exercised by the existing test suite (535 unit tests) plus this task's own
browser verification (`docs/accessibility.md` §2 for the keyboard/focus side of things).

Every item below is written as a concrete, falsifiable step — do this, then you should see
exactly that, not a vague goal — so it's obvious the moment something doesn't match.

---

## Prerequisite accounts

Before running this checklist, set up (via Task 19's `docs/first-admin.md` and Task 18's invite
flow, both already built):

1. One **admin** account (Jay's own, via the first-admin SQL step).
2. One **coach** account, invited for a specific team — pick one age group to test against, e.g.
   U12s.
3. One **parent** (or **player**) account, invited and linked to a specific player on a specific
   team — ideally the same U12s team used for the coach, so cross-role comparisons below are
   checking the *same* team from different angles.
4. Ideally a second team's coach/parent pair too, so the "cannot see/reach another team" checks
   below have a real other team to try reaching.

---

## Admin

- [ ] Log in as the admin account. Open **Schedule**. Confirm the team filter shows **all 15 age
      groups** (or however many the club has seeded), not a subset.
- [ ] Open **Roster**. Confirm the same — all 15 age groups selectable, and switching between them
      shows each team's real squad.
- [ ] Open **More → Admin overview** (Task 17). Confirm it lists **every club member across every
      team**, not just one team's.
- [ ] From Schedule, create a new event for any team (not just the admin's "own" — admins have no
      team_id, they're club-wide by role). Confirm it saves and appears in that team's fixture
      list.
- [ ] Edit and then delete that same event. Confirm both succeed.
- [ ] From Roster, add a new player to any team. Confirm it saves and appears in that team's
      roster.
- [ ] Edit that player's details (including contact phone/email) and confirm the save succeeds
      and the contact details are visible immediately after — admin can both write and read
      contact info for every player, not just their "own" team (admin has no "own" team; RLS's
      `is_admin()` check grants this unconditionally).
- [ ] Delete that player. Confirm it succeeds.
- [ ] Open **More → Invite**. Send an invite for **coach** role, for a team you don't otherwise
      have a personal connection to. Confirm the invite is created (Task 18's flow) without error.
      Repeat for **parent**/**player** role. Admin can invite for any role, any team.
- [ ] Open any player's detail view across at least two different teams. Confirm contact details
      (phone/email) are visible for both — admin sees contact info for every player, unlike every
      other role below.

## Coach

Use the coach account invited for one specific team (call it Team A) in the prerequisite step.

- [ ] Log in as the coach. Open **Schedule**. Confirm the team filter/dropdown shows **only Team
      A** (plus "All", if the coach also happens to be a parent/player elsewhere — if this coach
      account has no other memberships, "All" and "Team A" should show identical results).
- [ ] Open **Roster**. Confirm only Team A's squad is listed — no other age group's players
      appear, even via the filter dropdown.
- [ ] Create a new event for Team A. Confirm it saves.
- [ ] Edit and delete that event. Confirm both succeed — coaches can fully manage their own
      team's fixtures (RLS: `events` "team manage" policy is `can_edit_team(team_id)`, `FOR ALL`).
- [ ] Add a new player to Team A's roster. Confirm it saves.
- [ ] Edit that player's contact details. Confirm the save succeeds and the contact details show
      afterward — a coach can both write and read contact info for players on their own team
      (RLS: `player_contacts` "contact edit" is `can_edit_team(...)`, `FOR ALL`; "contact read" is
      `can_edit_team(...) OR is_own_player(player_id)` — the coach's access here is via the first
      clause of that OR).
- [ ] **Attempt to reach Team B (a team this coach is NOT assigned to) via direct URL
      manipulation** — e.g. if the app exposes a player-detail or event-detail URL with an id, try
      substituting a known Team B player/event id while logged in as this coach. Confirm the
      request returns nothing / is refused, not Team B's real data. This is the check that proves
      **RLS enforces this server-side**, not just the UI hiding a filter option — even if a future
      UI bug exposed a "wrong" id somewhere, the database itself refuses the row.
- [ ] Confirm this coach **cannot** edit Team B: attempting to create/edit/delete an event or
      player for Team B (if reachable at all via the UI) should fail with an RLS-refusal error,
      not silently succeed.
- [ ] Confirm this coach sees contact details **only** for Team A's players — open a Team B
      player's detail (if visible at all, e.g. via a shared multi-team view) and confirm contact
      fields are blank/hidden, not just for players on teams this coach has no relationship to at
      all.
- [ ] Send an invite for another coach or parent/player role, scoped to Team A. Confirm it
      succeeds (Task 18's invite flow does not itself restrict a coach from inviting for their own
      team — confirm this matches your club's actual policy expectations, since this checklist
      only verifies current behaviour, not a should-be-changed policy).

## Parent

Use the parent account linked to a specific player (call them Child A) on Team A.

- [ ] Log in as the parent. Open **Schedule**. Confirm only **Team A's** fixtures are visible —
      no other age group appears in the filter/dropdown (RLS: `events` "read" is
      `can_see_team(team_id)`, which for a non-admin/non-coach resolves via the parent's own
      membership row's `team_id`).
- [ ] Open **Roster**. Confirm only Team A's squad is listed.
- [ ] Confirm **no edit controls** are visible anywhere — no "Add player", no "Edit"/"Delete" on
      any event or player row, for Team A or anywhere else. Parents are read-only everywhere
      except their own child's availability RSVP (next section).
- [ ] Open Child A's own player-detail view. Confirm contact details (phone/email) **are**
      visible — `player_contacts` "contact read" grants this via `is_own_player(player_id)`.
- [ ] Open a **different** Team A player's detail (a teammate of Child A, not their own child).
      Confirm that player's contact details are **hidden** — the parent's `is_own_player` clause
      only covers their own child, not the rest of the squad, even though the roster listing
      itself (name, position) is visible for the whole team.
- [ ] Open an event's availability list for Team A. Confirm you can set Child A's own RSVP
      (In/Maybe/Out) and it saves.
- [ ] On that same availability list, confirm every **other** child's row on the squad is
      read-only (no toggle controls) — a parent can only write their own child's row
      (`availability` "own insert"/"own update" policies use `is_own_player(player_id)`), even
      though they can see the whole team's aggregate RSVP status.
- [ ] Attempt the same direct-URL-manipulation check as the coach section: try substituting a
      Team B event/player id. Confirm it's refused server-side, not just hidden by the UI.

## Player

Same RLS role as parent (`role IN ('parent', 'player')` throughout every policy) — there is no
behavioural difference in the database between the two. Run through the **Parent** section above
verbatim, substituting "the player's own row" for "Child A" (a player's `is_own_player` check
matches their own `player_id` directly, rather than via a linked child). Note this explicitly if
the club's real usage ever needs the two to diverge in the future — today, they are identical.

## RSVP realtime (Task 16)

- [ ] Open the same event's availability list in two different browser sessions/tabs, logged in
      as two different people who can both see that team (e.g. the Team A coach in one tab, the
      parent in another).
- [ ] In one tab, change a player's RSVP status (In → Maybe, or similar).
- [ ] In the **other** tab, without refreshing the page, confirm the change appears — the
      realtime subscription (Task 16) should reflect it within a few seconds, no manual reload
      needed.
- [ ] Confirm this also works the other direction (the second tab's change reflects in the
      first), and that a refused/failed write (e.g. attempting to edit someone else's row where
      not permitted) does **not** trigger a phantom realtime update on either side.

---

## What this checklist does NOT cover

- It assumes the accounts above already exist — creating them (magic-link/OAuth sign-in, the
  first-admin SQL step, sending/accepting invites) is covered by `docs/first-admin.md` and the
  Task 18 invite flow's own in-app UI, not repeated here.
- It does not include a Wild Apricot data-import verification pass — that's a separate, later,
  out-of-scope step per `RESTORE.md`.
- Contact-detail visibility for **admin** specifically (sees everyone's) vs **coach** (sees only
  their own team's, via the `can_edit_team` clause) vs **parent/player** (sees only their own
  child's/themselves, via `is_own_player`) is the full picture of `player_contacts`' RLS as
  verified live by Task 15/21 — this checklist exercises all three, but if a future task changes
  who can edit which team, re-verify this section specifically, since contact-detail exposure is
  the app's one real safeguarding-sensitive surface (it includes minors' guardian contact info).
