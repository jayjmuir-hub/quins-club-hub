# Marking a player as left — design

**2 Sep 2026.** Jay asked how an age group manager could remove a player from
their squad when the child quits. This is the design he approved after three
approaches were laid out. Status: **specified and BUILT — pull request
pending (branch `claude/graft-build-840faa`), 2 Sep 2026.**

⚠️ **EVERY NAME BELOW IS INVENTED.** This repo is public and its members are
mostly children.

## The problem

An age group manager is the `manager` role attached to a squad, and it has the
same powers as a coach (`SQUAD_STAFF_ROLES` in `src/lib/scope.js`). Any active
staff member of a squad can already open a player and press **Delete** on
`src/screens/PlayerDetail.jsx`, because the `"player edit"` policy on `players`
is `FOR ALL` and admits `private.is_team_staff(team_id)`. So the ability to
remove a player exists. It is the wrong ability, for four reasons found in
`db/schema/tables.sql`:

1. **It erases the child's history.** `attendance`, `availability`,
   `lineup_players`, `player_positions`, `player_units` and `player_grades`
   all cascade on delete. `match_sheet_slots` keeps the slot and nulls the name.
2. **The parent keeps their access.** `memberships.player_id` is
   `ON DELETE SET NULL`, so the parent's membership row survives with a blank
   player link, still `active`, still on the squad. They keep the roster, the
   chat and the pushes for a squad their child has left.
3. **It fails for most real players anyway.** `memberships_family_role_needs_player`
   requires a parent/player membership to carry a `player_id`, so the `SET NULL`
   above violates the CHECK and the delete is refused for any child with a
   linked parent. Separately `invites.player_id` and `invite_targets.player_id`
   have no `ON DELETE` rule, so any child who was ever invited cannot be deleted.
   The manager sees a permissions-shaped error and gives up. Recorded in
   `claude/open-items.md` as its own item; **not fixed by this design.**
4. **The photograph is left behind.** Already ruled in `RESTORE.md`: the row
   goes, the object in `player-photos` stays.

Jay's ruling on the fork that decides the shape of the feature: **keep the
history.** A child who leaves mid-season still played the matches they played.

## The two approaches not taken

- **Fix Delete and stop there** — cascade the invites, end the parent
  membership, remove the photo, reword the confirm. Smallest job, but leaving
  still means erasing the child, a wrong tap is unrecoverable, and "how many
  sessions did they attend before they left" has no answer. Rejected by Jay.
- **Move leavers to a "Left" pseudo-squad.** Access here is scoped by
  `team_id`, so whoever staffs that squad would see every leaver in the club.
  Rejected before it was proposed to Jay.
- **Parent-initiated "we're leaving"** — a real later addition, parked. In
  practice the manager hears first.

## The design

### 1. What "left" means in the data

Two new nullable columns on `public.players`:

| Column | Type | Meaning |
|---|---|---|
| `left_at` | `timestamptz` | When the player was marked as left. `NULL` means current. |
| `left_by` | `uuid` references `profiles(id) ON DELETE SET NULL` | Who marked it. |

A player with a non-null `left_at` is a **leaver**. No other column changes.
Every history row keeps pointing at a real name. **Leaving is never a delete.**

One new membership status: `'left'`. `memberships_status_check` widens from
`{pending, active}` to `{pending, active, left}`. ⚠️ `db/schema/tables.sql`
L1097 says another CHECK mirrors this one on purpose — find it and widen both
in the same migration, or the harness that guards the pair goes red.

**Why a status and not a delete of the membership row.** Measured 2 Sep 2026:
every membership predicate in `db/schema/functions.sql` and `policies.sql`
tests `status = 'active'` — 122 sites — and none tests `<> 'pending'` or an
`IN` list. ⚠️ **THAT WAS ALMOST TRUE, NOT TRUE.** The harness (step 12 of
`db/tests/player-leavers.sql`) found two exceptions:
`private.is_own_player` and `private.is_attached_to_team` tested neither
`status` nor `left_at` at all, so a `'left'` membership row — which the
widened CHECK above now permits to exist — passed both unchanged. A second
migration, `db/migrations/20260902_player_leavers_left_grants_nothing.sql`,
added `AND status <> 'left'` to each. ⚠️ **Deliberately `<> 'left'`, not
`= 'active'`** — a `'pending'` row must still pass these two exactly as
before; only a leaver is newly excluded. So a `'left'` row grants exactly
nothing, the same as no row. What it
buys is (a) a record of who the parents were and (b) a **Restore that works
without a sign-in or an approval** — see §3. Client side, `isActiveMembership`
in `src/lib/scope.js` already tests `=== 'active'`; the one place that tests
`=== 'pending'` (`isPendingOnly`) is unaffected because a `'left'` row is not
pending either. Audit the screens that LIST a profile's memberships
(`Accounts.jsx`) so a `'left'` row is labelled, not mistaken for pending.

⚠️ **DEVIATION, found by review the same day.** The `invite_parent` leaver
guard below is checked AFTER its `may_edit` authorisation raises, not before.
The first version of this migration checked it first, which let an
unauthorised caller learn a player's leaver status from the error message
before being told they cannot invite anyone at all. Fixed same-session,
commit `9bd5276`.

### 2. One database function does the whole job

`public.mark_player_left(p_player_id uuid)`, `security definer`, granted to
`authenticated` only. It refuses unless
`private.can_write_child() OR private.is_team_staff(<that player's team_id>)`,
the same predicate as `"player edit"`, so the screen never decides who may do
this. In one transaction it:

1. Sets `players.left_at = now()`, `left_by = auth.uid()`. Refuses with a clear
   message if already left.
2. Updates every `memberships` row with `player_id = p_player_id` and
   `role IN ('parent','player')` from `'active'` to `'left'`.
   A parent with two children in the squad has two membership rows, one per
   `player_id`; only this child's row changes.
   ⚠️ **DEVIATION, and it is the critical one. This said `'active'` OR
   `'pending'` until the whole-branch review on 2 Sep 2026, and that was a way
   past the approvals queue.** `restore_player` flips **every** `'left'` row on
   the child back to `'active'`, so a mark followed by a restore **approved a
   parent nobody had ever approved** — no sign-in, no admin, no trace. A
   `'pending'` row grants nothing already, so leaving has nothing to take from
   it; leaving it alone is exactly what makes the blanket restore safe. The two
   halves are one change and must not be separated.
   `db/migrations/20260902_player_leavers_pending_and_feed.sql`, harness steps
   6a and 11a.
3. Deletes the child's `availability` and `lineup_players` rows for events
   whose `starts_at` is in the FUTURE. Past rows stay.
   ⚠️ **ADDED by the same review.** Leaving took a child off the roster and off
   selection *screens*, but the rows themselves survived — so a Saturday
   selection made on Thursday still named a child who had quit on Friday, and
   a team sheet already built still listed them. **History is kept; a fixture
   that has not happened is not history.** `lineup_players` has no `event_id`
   of its own and links through `lineups(event_id)`; the join was checked
   against the live schema, not assumed. Harness step 6b, whose past-row half
   is the assertion that discriminates.
4. Returns the player row.

⚠️ **NEITHER RPC REVEALS WHETHER A PLAYER EXISTS**, added by the same review.
Both used to raise `22023 'That player no longer exists.'` before checking
authorisation at all, so the error message was an oracle: an unauthorised
caller could tell a uuid that names a real child from one that names nothing.
A null row now raises `42501 'You are not allowed to change this player.'`
unless the caller holds `private.can_write_child()`, who is entitled to the
honest answer. Same failure, and the same fix, as the `invite_parent` guard
ordering below. Harness step 4b.

⚠️ **BOTH RPCs TAKE `for update` ON THE PLAYERS ROW.** Without it two
concurrent calls both read `left_at` as null and both pass the guard.

⚠️ **AND A LEAVER'S STALE PENDING REQUEST CANNOT BE APPROVED.** Leaving a
`'pending'` row alone closes the promotion route above but leaves the request
itself sitting in the squad's approvals queue for a child who has quit;
approving it would hand the family full access by a completely different door.
`public.approve_membership` gained a guard — refuses with
`22023 'That player has left the squad. Restore them first if they are back.'`
while the membership's player is a leaver, placed after `can_approve_team` so
the message tells an unauthorised caller nothing. **Restore is the only way
back in, by both doors.** Harness step 6c, with a control that the same coach
approving the same parent's other row — for the sibling who is still there —
succeeds.

The **photo** is removed by the app after the RPC succeeds, exactly as
`deletePlayer` in `src/data/players.js` does today: `deletePlayerPhoto(path)`
then clear `photo_path`. `RESTORE.md` records why a storage object needs the
Storage API and cannot be removed in SQL. ⚠️ The R2 mirror is append-only, so
the copy there survives; do not tell anyone the photograph is erased on the
strength of the Supabase delete.

`public.restore_player(p_player_id uuid)`, same grant, same predicate. Clears
`left_at` and `left_by`, and flips that child's `'left'` memberships back to
`'active'`. The family has its access back the moment the button is pressed.

### 3. The back doors, and why Restore needs the status

Since 14 Aug 2026 (`claim_roster_access_pending`) the sign-in re-match in
`public.claim_roster_access()` inserts memberships as **`'pending'`**, not
`'active'` — Jay ruled nothing gets squad access without approval. So a leaver's
parent signing in again would NOT regain access; they would raise an approval
request for a child who has left, which the squad's staff would have to notice
and decline. Noise, not a hole, but wrong.

Two functions gain `AND p.left_at IS NULL` on their `players` join, so a
leaver is skipped entirely:

| Function | Why |
|---|---|
| `public.claim_roster_access` | no pending request for a departed child |
| `public.invite_parent` | staff cannot invite a parent to a leaver |

⚠️ **DEVIATION, decided in plan Task 1.** `public.register_my_player` /
`private.apply_signup_intent` are **UNCHANGED on purpose.** Their duplicate
check still sees leavers, so a returning child is refused with "ask the club
to connect you", which is the cue for Restore. Skipping leavers would create
a second row.

`private.can_dm`, `private.guard_staff_dm_opt_in` and `private.photo_team` also
read `players`; they are gated by an active membership upstream, so a `'left'`
row already closes them. Verify in the harness rather than assume (§6).

⚠️ **THE THIRD BACK DOOR, AND IT IS NOT A `players` READ AT ALL: THE CALENDAR
FEED.** `public.calendar_events_for_token(uuid)` joined `memberships` with **no
status test of any kind**, so a family whose memberships were all `'left'` kept
receiving every fixture of the squad in their phone calendar — measured at 54
events in the injected-fault run of harness step 12b-2 — for as long as the ICS
token existed. Nothing about ending somebody's access anywhere revokes a token.
`and m.status <> 'left'` added by
`db/migrations/20260902_player_leavers_pending_and_feed.sql`.

⚠️ **WHY THE EARLIER AUDIT MISSED IT, WHICH IS THE PART WORTH KEEPING.** §1's
count and the second migration both went looking through the bodies of
`private.*` helper functions. This one is an **inline join inside a
`security definer` function** — a membership predicate that is not a predicate
function — and it was invisible to a search shaped like that. Recorded in
`claude/open-items.md` so the next status-blind sweep covers inline joins as
well as helpers.

⚠️ **Do not confuse "skipped by the re-match" with "Restore".** The first
version of this design said a restored parent "gets access back at next
sign-in through the re-match". That was wrong — the re-match would only have
made them pending. Restore flips the `'left'` rows itself, which is the whole
reason they are kept.

### 4. Where leavers stop appearing, and where they must not

`listPlayers({ teamIds })` in `src/data/players.js` is the one shared loader,
with **twelve** non-test call sites (Roster, Availability, Lineup, Dashboard,
GameTime, MatchSheet, Accounts, AdminClub, AdminNeedsAttention, Register,
YourPlayers, NamePrompt). It gains `.is('left_at', null)` by default and a new
option `{ includeLeft: true }` that skips the filter. Every current screen
therefore drops leavers with no per-screen edit, including squad counts on the
dashboard and the availability roll call.

Screens that show the **past** pass `includeLeft: true` and tag the name
**"Left"**: `MatchSheet.jsx` (a historic team sheet must still read
correctly) and `GameTime.jsx` (appearances by a leaver need a name). Selection
screens — `Lineup.jsx`, `Availability.jsx` — never see them.

The `"player read"` policy is unchanged: a leaver is still readable by the same
people who could read them before. Hiding is a query default, not an RLS rule,
because history screens legitimately need the row.

### 5. Screens

**Player detail, staff of the squad** (`FooterActions` in `PlayerDetail.jsx`):
**Delete** becomes **Mark as left**, same two-step in-place confirm. Copy:

> Mark Hamza as left? He comes off the squad list and selection, his parents'
> access to this squad ends, and his photo is removed. Attendance and match
> history are kept. You or an admin can undo this from the roster.

**Player detail, admin** (`canWriteChild`): both **Mark as left** and the
existing **Delete**. Delete remains the right tool for a duplicate registration
— and it is broken today for most players (open-items).

**Player detail, a leaver:** read-only. A line "Left 2 Sep 2026 · marked by
J. Smith" under the name. Edit is gone. Footer offers **Restore** to squad staff
and admins.

**Roster** (`Roster.jsx`, grouping in `src/lib/rosterGrouping.js`): a
collapsed group **"Left the squad (3)"** at the bottom, below tiers and units,
**staff only**. Parents never see it. It is excluded from every count, filter,
search-default and selection list. It is where the manager who marked a child
finds them again, and undoes a wrong tap.

**Admin club screen** (`AdminClub.jsx`): a **"Left this season"** list — name,
squad, date, who marked it, **Restore**. An admin needs to see across squads;
the roster group is per squad.

### 6. Testing

Per `CLAUDE.md` rule 6: every assertion proven against an injected fault, and a
negative must fail at the gate under test.

`db/tests/player-leavers.sql` (rolled back; `claude/runbooks/db-harnesses.md`):

- Staff of the squad CAN mark; staff of another squad CANNOT; a parent CANNOT;
  a narrowed admin without child-write rights CANNOT.
- After marking: `left_at` set; this child's parent and player memberships are
  `'left'`; a sibling's membership on the same squad is still `'active'`
  (⚠️ two children, one parent — the discriminating fixture).
- `claim_roster_access` for the leaver's parent inserts **nothing** — with a
  CONTROL showing it still inserts a pending row for a current child at the
  same address.
- `register_my_player` and `invite_parent` refuse the leaver.
- `can_dm` between the leaver's parent and squad staff is false.
- Restore: `left_at` null, memberships `'active'` again; marking twice refuses.
- Both CHECKs that mirror `memberships_status_check` accept `'left'`.

Vitest: `listPlayers` filters by default and not with `includeLeft`; the footer
shows Mark-as-left to staff and Delete only to admins; the confirm copy; the
roster group is present for staff and absent for a parent, and not counted;
MatchSheet tags a leaver; Restore is offered on a leaver; `Accounts.jsx` labels
a `'left'` membership. Harness stubs in `harness/stubs/players.js` gain
`markPlayerLeft` / `restorePlayer` mirrors.

## Deliberately not in this design

- **Hard delete stays as it is**, broken. Its own open-items entry.
- **Retention.** A leaver's `player_contacts`, `player_private` (medical, DOB)
  and `player_parents` rows are **kept indefinitely**, because Restore needs
  them. Jay was asked for a purge period and did not set one; the recorded
  position is **"kept until an admin deletes the player."** ⚠️ Revisit when
  Delete is fixed — a purge is then one existing button, not new code.
- **Parent-initiated leaving.** Parked.
- **A "reason" field.** Nobody asked for one; `left_by` and the date are the
  audit.
- **Pushes/emails on leaving.** None. The family is told by the manager, not by
  the app.

## Open questions for the plan

- Whether `Accounts.jsx` (the admin membership list) needs a filter for
  `'left'` rows or just a label — decide when the screen is open.
- Whether the roster group should show leavers from the current season only.
  This design shows all; a season boundary is not a concept the schema has.
