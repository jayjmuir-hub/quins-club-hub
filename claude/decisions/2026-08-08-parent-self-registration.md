# Decision — parents self-register, and a `pending` membership state

*8 Aug 2026. Spec, not yet built. Jay's rulings, recorded before any code.*

## What Jay decided

1. **No seeded roster.** The current 316 players / 315 contacts are a bad, stale import
   and get deleted. Nothing is pre-placed.
2. **Parents self-register**: follow a link, create an account with **email and
   password**, sign in, add their own player, use the app.
3. **Pilot cohort: U13, U16, U18 Colts.** ~121 distinct parent emails.
4. **A self-registered parent is `pending` until a coach or admin approves.** While
   pending they see their own child and the squad's fixtures — enough to mark
   availability — but NOT the squad roster or other families' contact details.
5. **Full flow, ~a week.** Accepted as throwaway work; see "Why this is temporary".

## ⛔ The danger this design exists to prevent

`private.can_see_team(_team)` returns true for **any** membership row with
`m.team_id = _team`, whatever the role. `players` read is `can_see_team(team_id)`,
which is **squad-wide**.

So if a self-registered parent picks their own age group and is granted access
immediately, **anyone who registers and types "U13" sees every U13 child's name, date
of birth, photo and parent phone numbers.** A public signup form becomes a directory of
the club's children.

**That is the whole reason for the `pending` state.** Anyone tempted to "simplify" this
by granting access at registration is reintroducing exactly that. Do not.

## The design

### 1. Schema

```sql
alter table public.memberships
  add column status text not null default 'active'
  check (status in ('pending','active'));
```

⚠️ **`default 'active'` is load-bearing for the migration itself.** `can_see_team`
changes to require `status = 'active'` in the same migration; if existing rows came out
null or 'pending', every current user loses access at once. **Read the rows back after
the ALTER and before the function change** — a Postgres self-assignment reporting
success while changing nothing has already happened on this project (6 Aug).

⚠️ Check `memberships_unique_grant` still behaves. A person must not be able to hold a
`pending` and an `active` row for the same (profile, team, player).

### 2. Two visibility helpers, split by sensitivity

The current single `can_see_team` conflates "may see this squad's people" with "may see
this squad's schedule". Those need to diverge.

```sql
-- ACTIVE only. Gates anything exposing OTHER PEOPLE's data.
create or replace function private.can_see_team(_team uuid) ...
  and m.status = 'active'

-- ANY status. Gates non-sensitive squad context: fixtures and training times.
create or replace function private.is_attached_to_team(_team uuid) ...
```

A fixture list is not sensitive. A child's date of birth is. The split is the point.

### 3. Policy changes

| Table | Policy | From | To |
|---|---|---|---|
| `players` | `player read` | `can_see_team(team_id)` | `can_see_team(team_id) OR is_own_player(id)` |
| `events` | `event read` | `can_see_team(team_id)` | `is_attached_to_team(team_id)` |
| `availability` | `avail read` | `can_see_team(events.team_id)` | `... OR is_own_player(player_id)` |

⚠️ **The `availability` one is a trap found while writing this spec, not in testing.**
`avail own insert` and `avail own update` are both `is_own_player(player_id)`, but
`avail read` is `can_see_team`. Without the change a pending parent **saves their
availability and then cannot see it** — the write succeeds, the row vanishes. It would
read as "the app lost my answer", and it would be silent.

Unchanged and correct as-is:
- `player_contacts` — `contact edit own` is already `is_own_player`, so a pending parent
  may edit their own child's contacts. Needed.
- `teams` `team read` — team NAMES are not sensitive; a pending parent needs to see the
  age-group list to pick one.
- everything gated on `can_edit_team` — staff only, untouched.

### 4. `public.register_my_player(...)` — `SECURITY DEFINER`

Creates the player, the contact row and a `pending` membership in one transaction.

Must:
- raise `42501` if `auth.uid()` is null;
- **raise if the caller's email is not confirmed** (`auth.users.email_confirmed_at`).
  Registration is worthless as proof otherwise;
- read the caller's email from `auth.users`, **never from a parameter** — the same
  property that makes `claim_roster_access` safe;
- derive `club_id` from the team. **The caller must not supply it**;
- refuse beyond a small number of pending rows per profile, so one account cannot
  fabricate a squad's worth of children;
- insert the membership with `role='parent'`, `status='pending'`.

⚠️ **`claim_roster_access` must be updated to insert `status='active'` explicitly.** A
roster match is a verified match and should not queue. If it inherits the column default
that is luck, not intent — state it.

### 5. Approval

Coach or admin flips `status` to `'active'`. Extends `Accounts.jsx`. `can_edit_team`
already scopes a coach to their own squad, so a coach approving their own age group
needs no new permission.

⚠️ **Nobody is emailed when someone is waiting.** That gap already exists for access
requests and gets worse here — with no seeded roster, EVERY parent queues. Either build
the notification or accept checking the tab.

## Email volume — it goes UP, not down

Magic links only needed sending to the ~50% of parents who are not on Gmail; the rest
used Google. **Password signup removes that split — everyone needs a confirmation
email.**

- ~121 confirmations on day one
- plus password resets, which do not exist in the app yet and must be built
- plus retries and typos

**Consequences:**
- Supabase → Authentication → Rate Limits → emails → **200**. Free, and still the hard
  blocker. Reload and read the value back.
- Resend's free 100/day is now exceeded on day one. **Pay-as-you-go, ~$0.15 total.**
- **Email confirmation must be ON.** Without it a typo'd address locks the real owner
  out permanently, and password reset has nowhere to send.

## Why this is temporary, and accepted anyway

The club's new site (`abudhabiquinspreview.xyz`) has a 7-step application wizard whose
steps include **Roster** and **Emergency** contacts, and it was agreed on 8 Aug that
**the club site becomes the master** for roster and parent contacts. Production
onboarding will therefore be *fed*, not self-serve, and most of this flow is replaced.

Jay accepted that cost: the club site is months away and a pilot that waits for it tests
nothing. **Recorded so nobody later reads this flow as the intended end state.**

## Explicitly NOT being built

- Parent-editable `name`, `position` or `age group` on a player. `MyPlayerForm` exists
  precisely because those fields must not be self-editable — RLS grants rows, not
  columns, so an owner-update policy on `players` would hand a parent `team_id`.
- Anything that lets a parent grant themselves `status='active'`.
- Bulk invites. Killed 6 Aug — a bulk send that fails, fails silently.

## Build order

1. Password sign-up / sign-in / reset in `Login.jsx`. Touches no RLS — safe to ship first.
2. Migration: `status` column, read rows back, then the two helpers and three policies.
3. `register_my_player` + the "add your player" screen.
4. Approval UI in `Accounts.jsx`.
5. Notification (or a decision to skip it).

## Verification required before this goes near a parent

Per `CLAUDE.md` rule 6 — prove it against an injected fault, not just a green test:

- Sign in as a **pending** parent and confirm: own child visible, squad roster NOT,
  other children's contacts NOT, fixtures visible, availability saves **and reads back**.
- Then flip to `active` and confirm the squad appears.
- Confirm an existing active user did not lose anything at the migration.
- Attempt `register_my_player` with an unconfirmed email and confirm it refuses.
- Attempt to pass a `club_id` and confirm it is ignored.
