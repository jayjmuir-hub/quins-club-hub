# Decision: Team Manager and Medic roles

Asked for and built 5 Aug 2026. **SHIPPED** — commit `5009efb`, deploy
`6a7362b42522e80007f3b278`, published 16:20 UTC.

## The ask

> "did you add the Age Group Manager role to the site yet? identical to coach but a
> distinct category"

and, on the follow-up questions:

> "yes truly identical, and we also need to have a Medic role, which would also be
> identical and same answers"

## ⚠️ Correction to an earlier answer in this project

On 4 and 5 Aug this project recorded, three times, that a new club role would mean
*"a migration, RLS policy changes on every table, and `AccessBuilder` changes — days
of work"* and used that to defer the request. **That estimate was wrong.**

Every RLS policy in this schema calls a helper function rather than testing
`m.role` itself. The real database surface for a role identical to coach is:

| What | Change |
|---|---|
| `memberships_role_check` | add the value |
| `invites_role_check` | add the value |
| `private.can_edit_team` | `m.role in ('coach','manager','medic')` |
| `private.can_see_team` | **nothing** — already grants on any membership row for the team |
| `public.accept_invite` | **nothing** — copies `invites.role` through without inspecting it |
| every other helper and policy | **nothing** — they key on `'admin'` |

Three statements. Plus ~8 spots in JavaScript. It was half a day including tests.

**The lesson worth keeping: check the shape of the policies before pricing a role
change.** "Roles are expensive" is true in a schema that inlines role tests into every
policy, and false in this one.

## The decisions

| Question | Decision |
|---|---|
| Label | **"Team Manager"** (stored `'manager'`) and **"Medic"** (stored `'medic'`) |
| Permissions | **Truly identical to coach** — fixtures, events, pitches, and the roster for their age group |
| Precedence | `admin > coach > manager > medic > parent > player`. Jay: nobody will hold two of them, so the order is arbitrary but must be stable |
| View As personas | **Not added.** See below |

⚠️ **Identical permissions means the app cannot stop a Medic editing the roster.**
The role records who does what; it does not restrict. That is what was asked for and
it is the right call for a volunteer club, but it should not be a surprise later. If
a narrower Medic is ever wanted, that is a genuinely different piece of work: its own
branch in `can_edit_team` plus a separate players-specific check.

## The structural point — this is the part that matters

This does **not** add two roles in eight places. It adds **one exported set**:

```js
// src/lib/scope.js
export const SQUAD_STAFF_ROLES = ['coach', 'manager', 'medic']
export function isSquadStaffRole(role) { return SQUAD_STAFF_ROLES.includes(role) }
```

`canEditTeam`, `AccessBuilder`, `Roster` and `Schedule` all route through it. Before
this change, `Roster.jsx` and `Schedule.jsx` each carried their own
`membership.role === 'coach'` test — exactly the kind of thing that makes a "simple"
role addition expensive.

**The next staff role is one line in `SQUAD_STAFF_ROLES` plus one line in a
migration.** `tests/staff-roles.test.jsx` contains a source-scanning test that fails
if any file under `src/` (outside `scope.js` and the two option lists) writes a raw
`=== 'coach'` comparison again. That test is what keeps the above sentence true, and
it caught the fault when `Roster.jsx`'s old line was deliberately restored.

`Dashboard.jsx` needed no change at all: it already asked `canEditTeam()` per visible
team rather than looking for a coach row. That was the right pattern all along.

## Why View As gains no Manager/Medic personas

`ViewAsSwitcher` offers "Coach of X" and "Parent in X" per squad. A "Team Manager of
U12" persona would render **pixel-identical** to "Coach of U12", because the roles
grant identical rights — 30 extra buttons across 15 squads showing nothing new.
`personaRoleLabel()` goes through `roleLabel()`, so if a persona is ever added it
will already be labelled correctly.

## Why the Badge shares the coach colour

`manager` and `medic` reuse the coach tone. Giving each its own colour would imply a
difference in access that does not exist. **The word is what distinguishes them** —
which is precisely "a distinct category, not distinct permissions".

## Rot found in the existing tests

Three tests in `tests/data.test.js` used `role: 'manager'` as their example of an
**invalid** role. The moment `'manager'` became real those tests started passing the
validator and failing downstream for the wrong reason — a rotted anchor.

They are **repointed at `'chairman'`, not deleted**, with a note explaining why. The
test names also changed from "outside the four the database allows" to "outside the
set", since it is six now.

A second, subtler rot risk was introduced deliberately and mitigated: several new
tests are parameterised with `it.each(SQUAD_STAFF_ROLES)`, so shrinking the set would
silently *remove* test cases rather than fail them. The "is exactly coach, manager
and medic" mirror test is the guard against that — it is the one test that must be
updated by hand, on purpose.

## Verified against the live database

Not asserted from the migration — read back and executed. The deployed
`private.can_edit_team` source and both CHECK constraints were queried and match.

Behaviour was proved inside a `DO` block that raises at the end, so the whole
transaction rolls back and **nothing persisted** (memberships before and after:
2 admin, 2 parent, 1 player):

```
parent_grants_edit=f | manager before=f after=t | medic before=f after=t
```

A non-admin profile with a **parent** row on a squad cannot edit it; inserting a
**manager** or **medic** row for the same profile and squad flips `can_edit_team`
from false to true. The parent control matters — without it, "after=t" could have
been any membership row rather than the role specifically.

## Fault injection — 5 faults, all caught

| Injected fault | Caught by |
|---|---|
| `SQUAD_STAFF_ROLES` shrunk to `['coach']` | the mirror test + `isSquadStaffRole` test |
| label changed to "Manager" | the two `roleLabel` tests |
| `Roster.jsx` raw `=== 'coach'` restored | **the source-scanning guard** |
| `AccessBuilder` raw `=== 'coach'` restored | the invite grant + age-group tests |

## ⚠️ Nobody can use these yet

The club currently has **no coach rows at all** — memberships are 2 admin, 2 parent,
1 player. Nobody holds a squad-staff role of any kind, and new people can only be
brought in by invite, which needs outbound email. **Auth email is dead** (see
`claude/handoffs/2026-08-05-m365.md`). So Team Manager and Medic are ready and
correct, and unusable by anyone new until that is fixed.

An admin can still grant either role to someone who **already has an account**, from
`/admin/accounts` → Add access. That path does not touch email.
