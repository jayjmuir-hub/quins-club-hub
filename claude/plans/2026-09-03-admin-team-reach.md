# The admin split — an admin row reaches no squad by itself (3 Sep 2026)

**Status: NOT SHIPPED — plan only, awaiting Jay's go on the rulings in §3.**
Dated 2026-09-03. Closes `claude/open-items.md` item 13 when built.

## 1. The problem, measured

The 28 Aug redesign (Shape α, `claude/specs/2026-08-28-admin-rights-access-matrix-and-threat-model.md`)
fenced four surfaces — DOB/contacts, photos, child writes, DM review — behind
allowlists. Everything ELSE squad-shaped still reaches "any active admin"
through three helpers whose admin arm is `m.role = 'admin' and m.club_id =
<the team's club>`:

| Helper | Admin arm today | Policies routed through it (schema capture, 3 Sep) |
|---|---|---|
| `private.can_edit_team` | any admin | 28 — attendance, availability, lineups, match sheets, grades, positions, units, staff chat, channel settings, pitch requests, player contacts/parents |
| `private.can_see_team` | any admin | 8 — squad chat, availability read, announcements, channel settings; and `can_see_player`, which is the `players` READ policy |
| `private.is_attached_to_team` | any admin | fixtures (`events` read) |

So a Pitch-only admin — names-read-only on paper — can open every roster,
take any register, edit any lineup and read every squad chat. Live today
(3 Sep, no names): five ordinary admins; three hold Club Hub Admin and are
full-sight by design; **two hold only specialist rights** (one Pitch, one
Training + a chat tick) and are the people this is about.

The client mirror is the same shape: `isAdmin()` short-circuits
`visibleTeams`, `canEditTeam` and `canEditEvent` in `src/lib/scope.js`, and
38 files gate on those.

## 2. The lever

Not 274 sites. **Three helper bodies.** Every squad policy already routes
through `can_edit_team` / `can_see_team` / `is_attached_to_team`; change
their admin arm once and every policy follows. This stays inside Shape α —
`is_admin` keeps meaning "any admin" for the club-level spine (clubs, teams
table, invites, feedback, whole-club notices, pitches, social, memberships
admin) — and writes the new arm **default-deny**: an admin reaches a squad
only through a right on an allowlist, so a wiring miss hides, never leaks.

```sql
-- One new helper; the three above call it instead of testing role = 'admin'.
create or replace function private.admin_team_reach(_team uuid, _mode text)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (
    select 1 from memberships m
     where m.profile_id = auth.uid() and m.status = 'active'
       and m.role = 'admin'
       and m.club_id = (select club_id from teams where id = _team)
       and (m.is_super
            or m.admin_rights && case _mode
                 when 'edit' then array['clubadmin','youth']
                 when 'see'  then array['clubadmin','youth','media','welfare','pitches','training']
                 else array[]::text[] end));
$$;
```

- `can_edit_team`: admin arm → `admin_team_reach(_team, 'edit')`.
- `can_see_team`, `is_attached_to_team`: admin arm → `admin_team_reach(_team, 'see')`.
  (`is_attached_to_team` keeps its `status <> 'left'` for squad rows; the
  admin arm demands `active` as it always has.)
- **A zero-rights admin row reaches no squad.** That is the split.

Two surfaces the matrix (§5.2) grants to rights that are NOT team editors
need their own arm, or they go dark:

| Surface | Today | After | Why |
|---|---|---|---|
| `events` edit | `can_edit_team` | `can_edit_team or admin_team_reach(team,'events')` where `'events'` → `{clubadmin,youth,media,pitches}` | matrix: Social and Pitch edit events |
| `attendance` write | `can_edit_team` | `can_edit_team or admin_team_reach(team,'attendance')` where `'attendance'` → `{clubadmin,youth,training}` | matrix note ⁴: Training edits attendance |

`can_edit_match_sheet` already exists and stays on `can_edit_team` (matrix:
Youth edits match sheets, Media does not — `edit` mode says exactly that).

## 3. Rulings needed from Jay before code

1. **The allowlists above are read straight off the 28 Aug matrix.** Confirm,
   or move a right between `see` and `edit`. In particular: Social Media
   (`media`) becomes *read* on rosters, *edit* on events — is that right?
2. **Senior squads.** The rule is applied to every team, adults included. A
   senior coach who is also a Pitch admin sees seniors via the coach row.
   Confirm no special case for `is_senior`.
3. **The club-level spine stays with any admin**: whole-club chat posting,
   whole-club notices, invites, feedback, the teams table, pitches, social
   ideas. None is children's data. Confirm, or name one to move.
4. **The two narrowed admins today** will lose rosters, registers, lineups and
   squad chats the moment the migration applies. Jay knows who they are; if
   either needs a squad, give them a coach/manager row first — a row is the
   designed way to reach a squad.

## 4. Phases

**Phase 0 — baseline first, same PR.** Before the migration runs, the harness
captures what each persona reaches TODAY as a printed table, so "no
legitimate admin loses access" is measured against a number, not a memory.

**Phase 1 — database, one migration.** `db/migrations/20260904_admin_team_reach.sql`:
the helper, the three rewrites, the two extra arms. Harness
`db/tests/admin-team-reach.sql`, synthetic club, personas: super, clubadmin,
youth, media, welfare, pitches, training, **zero-rights admin**, coach, parent.
Per persona, both directions on: `players` read, `events` read/edit,
`attendance` write, `availability` write, `lineups` write, squad `messages`
read, staff `messages` read, `my_chats` rows. The discriminating asserts:
zero-rights admin reads 0 players (control: the same session reads the
`teams` table); Pitch reads names, cannot write attendance; Training writes
attendance, cannot write a lineup; clubadmin unchanged from today (control
against the phase 0 baseline). Prove the rollback first (a throwaway table,
with a control), then inject a fault (drop `'training'` from the attendance
arm) and watch the Training assert go red.

**Phase 2 — client mirror.** `src/lib/scope.js`: `adminTeamReach(memberships,
teamId, mode)` with the same lists; `visibleTeams`, `canEditTeam`,
`canEditEvent`, `canApproveTeam` route through it; `isAdmin()` stays for the
club-level spine. `tests/scope.test.js` pins the lists (the same rot anchor
that pins `SQUAD_STAFF_ROLES`). Screens change nothing: they already ask
`scope.js`. Grep the 38 files for a bare `isAdmin(` used to mean "may see
this squad" and repoint each — expected in Nav, Dashboard, SquadHub, Roster,
Schedule, ChatList.

**Phase 3 — live verification.** Sign in as the Pitch-only admin persona
(`claude/runbooks/e2e-roles.md`): roster empty, schedule shows club-wide
fixtures only, chat list shows club and role channels only, direct link to a
squad's register refused. Then as a super: unchanged. Verify from the served
bundle (rule 6).

**Phase 4 — docs.** `RESTORE.md` "Scope and RLS" gains the new rule; spec
§5.2 gets a dated amendment; `open-items.md` item 13 closed; `schema-history.md`
section for the migration.

## 5. Deploy order

Same PR, migration applied on merge with Jay's yes. Client-first is harmless
(it only hides); database-first briefly offers controls that RLS refuses.
Neither order leaks.

## 6. Out of scope, on purpose

- Report handling off `is_admin` (open-items item 2's remainder) — separate.
- Sensitive-read audit (S10) — separate.
- Club-blindness of `can_see_child_contacts` — separate, same class as
  `is_admin_anywhere`.
- Channel seats and the Committee channel —
  `claude/plans/2026-09-03-channel-seats-and-committee.md`, independent.
