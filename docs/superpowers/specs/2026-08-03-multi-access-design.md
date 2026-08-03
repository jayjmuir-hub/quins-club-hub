# Design spec — multiple age groups / children per person

Date: 2026-08-03
Status: approved by Jay

## The request

> i can only select one age group for her, we need to be able to select multiple
> age groups for a person with multiple players

Plus, on coaches: *"yes, but they might also have kids"* — and invites are to be
fixed in the same pass.

## What this is not

**No change to the `memberships` table.** It has never had a unique constraint on
`(profile_id, club_id, role)` — one person holding several rows is already legal
and already handled (the Accounts screen groups by `profile_id` precisely because
of this). Only the UI and the invite path assumed one row per person.

## The model, stated plainly

One **access row** = one `memberships` row = `(role, team_id, player_id)`.

A person's access is the *set* of their rows. Consequences that fall out of the
existing `scope.js` with no change needed:

- `visibleTeams` unions every row's `team_id` — a coach of two squads sees both.
- `canEditTeam` matches any `coach` row for that team — coach-of-U14 can edit U14
  while their `parent` row over U10 stays read-only. **Mixed roles already work
  correctly; they were just never grantable.**
- `childPlayerIds` collects `player_id` from `parent`/`player` rows — one row per
  child is exactly what makes a two-child parent see both children.
- `roleLabel` shows the highest-precedence role, so a coach-who-is-also-a-parent
  reads "Coach". Correct, and worth knowing before someone reports it as a bug.

Because roles differ per row, the grant UI **cannot** be "pick one role, then many
age groups". It builds a list of access rows.

## Grant UI (Accounts screen)

Adding access is a small builder: pick a role, pick that role's targets, add the
resulting rows to a pending list, repeat if needed, then save once.

- **Parent** → multi-select **children**. Each selected player contributes one row
  with `player_id` set and `team_id` taken from that player's own team. The age
  group is derived, never asked for — the child determines it, and asking twice
  invites contradiction.
- **Parent, child not in the roster yet** → fall back to plain age-group
  multi-select (`player_id` null). Jay explicitly asked for this fallback; without
  it, a parent whose kids haven't been added is ungrantable.
- **Coach** → multi-select **age groups**, one row each.
- **Player** → single player select (a person is one player).
- **Admin** → club-wide, no team, exactly one row. Selecting admin hides the
  target picker entirely.

Finding a child: there is no link from a profile to a player except
`memberships.player_id`, so the admin searches the roster by name. With ~315
players the picker needs a search field, not a bare `<select>`.

**Existing people need this too.** An "Add access" control on each person block,
using the same builder — otherwise adding a second squad means revoking and
re-granting, which is what prompted this request. This also covers the
coach-who-is-also-a-parent case: grant coach rows, then add a parent row.

**Duplicate guard.** Since the database has no unique constraint, the UI must
refuse to create a row identical to one the person already holds, and must
de-duplicate within a single save. Silently creating two identical admin rows has
bitten this project before (RESTORE.md:255-262).

## Invites

Currently one invite = one `(role, team_id, player_id)`, enforced by
`invites_team_required_unless_admin`. A parent of two children cannot be invited
in one link.

### New table `invite_targets`

```
id, invite_id -> invites(id) on delete cascade, team_id -> teams(id) not null,
player_id -> players(id) null, created_at
```

Chosen over `team_ids uuid[]` + `player_ids uuid[]` on `invites` because the data
is genuinely *pairs* — child A in U10, child B in U14. Two parallel arrays that
must stay index-aligned is a correctness trap with no upside.

`invites.role` stays on the parent row: an invite grants one role across its
targets. Mixed roles in a single invite are deliberately not supported — the admin
adds the second role from Accounts after signup. Keeping `accept_invite` boring is
worth more than that convenience.

### `accept_invite` rewrite

Same guards, unchanged and in the same order: signed in, token exists (`for
update`), not already accepted, **caller's email matches the invite**. Then insert
one membership per `invite_targets` row instead of one membership total.

**Legacy fallback retained.** If an invite has no `invite_targets` rows, fall back
to its own `team_id`/`player_id`. This means the old columns and the new table can
coexist during rollout, so a frontend that is briefly out of step with the database
cannot fail an invite. Removing `invites.team_id`/`player_id` and the
`invites_team_required_unless_admin` constraint is a **follow-up cleanup**, not
part of this change — dropping them while a deployed frontend still writes them
would break invites outright.

Return type changes from a single membership row to a set. `AcceptInvite.jsx` only
needs it to have succeeded, but it must not assume a single object.

### RLS on `invite_targets`

Mirrors `invites`: admin of the invite's club manages; an invitee may read the
targets of an invite addressed to their own email. Both go through the invite's
`club_id`/`email` via a `security definer` helper so the policy does not depend on
`invites`' own RLS.

## Verification bar

`accept_invite` is the most security-sensitive function in the app — it is
`SECURITY DEFINER` and it writes access. It must be verified by **simulating real
JWTs in rolled-back transactions**, not through the MCP service role (whose
`auth.uid()` is null, making every `auth.uid()`-based check return false and every
negative test look green while proving nothing). Cases to prove:

1. Multi-target invite creates exactly one membership per target, with correct
   `(role, team_id, player_id)` on each.
2. Legacy invite with no targets still works via the fallback.
3. Wrong-email caller is rejected.
4. Already-accepted invite is rejected.
5. Double-accept under concurrency inserts nothing twice (the `for update` lock).
6. A non-admin cannot create invites or targets.

## Out of scope

- Dropping the legacy `invites.team_id`/`player_id` columns (follow-up).
- Mixed roles within a single invite.
- The opportunistic `clubId` derivation, already logged as a follow-up — it is
  wrong only if a second club is ever seeded.
