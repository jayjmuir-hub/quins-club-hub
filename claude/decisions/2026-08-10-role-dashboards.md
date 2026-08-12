# Decision: the three club jobs are admins with different dashboards

> ⚠️ **NAMES RETIRED 12 Aug 2026.** This document named the three volunteers
> throughout, because on 10 Aug the jobs did not exist yet and the people were
> the only way to describe them. The jobs now exist as rights in the schema, so
> the names have been replaced by **Club Youth Manager**, **Pitch Management**
> and **Social Media Management**. Nothing Jay said has been edited — the
> verbatim quote below never contained a name.
> See `claude/decisions/2026-08-12-jobs-not-people.md`.

*10 Aug 2026. Reasoning, not current state — `RESTORE.md` and the code win on
what is true today.*

## The ask

Jay wanted a dashboard each for three people taking on club jobs:

- **Club Youth Manager** — match sheets after league matches, packaged for
  WhatsApp, generated for coaches and team managers.
- **Social Media Management** — the club's social media.
- **Pitch Management** — pitch allocation: assigning pitches, a pitch request
  form for matches including referee requests.

and, on the follow-up: *"specific admins, then I would be a super admin i
guess"*.

## ⚠️ The answer changed within the hour. Both halves are recorded.

**First answer.** Asked whether the people holding Social Media Management and
Pitch Management should see children's names, photos and parent contact
details, Jay said **yes — trusted volunteers**; asked what the Club Youth
Manager needs, **full admin, like you**. That made all three ordinary admins:
no new role, no migration, no RLS change.

**Second answer, minutes later, and the one that stands:**

> "I think we need a super admin role, super admins would be who selects rights
> for normal admins, there are specific functions i want to create that
> shouldn't be viewable to all admins"

⚠️ **This is not a contradiction and must not be read as one.** The first
answer was about **data** — may they see the children? Yes. The second is about
**authority** — may they hand out access, and may they see every function? No.
Both are true at once, and together they describe a real club: volunteers
trusted with the roster, where granting access stays with one person.

## The decision that stands

**Two tiers of admin.** Every current admin power is unchanged for an ordinary
admin, including full sight of children's data — so the consequence below still
applies in full. What becomes super-admin-only is:

1. **Granting and changing access**, in particular creating or altering an
   `admin` membership. ⚠️ Today **any admin can promote anyone, including
   themselves, to admin.**
2. **Whatever the "specific functions" turn out to be.** Unspecified as of this
   writing, so the mechanism must be general rather than a list.

## ⚠️ The consequence, still true, recorded because it was chosen knowingly

**Whoever holds Club Youth Manager, Pitch Management or Social Media Management
holds every child's name, photo and gender, and every parent's email and phone,
club-wide, with the power to edit or delete.**

The super-admin tier does not change this. It restricts AUTHORITY, not SIGHT.
No new access is created by any of it — that is already what `admin` means —
but three more people hold it. That is a safeguarding-relevant fact about a
youth club, written down so nobody later finds it by accident and assumes an
oversight. Narrowing what an admin can SEE is the separate, expensive piece
priced below.

## ⚠️ A FLAG, NOT A ROLE — and the reason is measured, not stylistic

`super_admin` as a new value in `memberships.role` is the obvious move and the
wrong one. **Twelve places in the schema test `m.role = 'admin'`** — measured
10 Aug 2026, across `is_admin`, `is_admin_anywhere`, `can_edit_team`,
`can_see_team`, `is_attached_to_team`, `can_admin_see_pending`,
`can_approve_team`, `can_manage_invite`, `shares_admin_club` and the storage
policies. Every one would have to become `role in ('admin','super_admin')`, and
**each is a chance to miss one — where a miss silently strips a super admin of
an ordinary admin power.**

A boolean on the membership inverts that risk: a super admin IS an admin, in
the same row, so all twelve keep working untouched and only the NEW restricted
things test the flag. Nothing existing can regress.

It also matches what the thing is. Super admin is not a different job; it is an
admin with extra authority. An attribute, not a role.

## ⚠️ The part that must not be got wrong

`memb manage` is `FOR ALL` and admin-only, so **any admin can already write
membership rows.** A naive boolean column therefore lets any admin set
`is_super = true` on themselves, and the tier is decoration.

The protection has to be a **column privilege plus an RPC**, not a policy —
policies authorise the ROW, not the COLUMN. This schema already has that exact
precedent: `profiles.email` is protected by a column GRANT rather than a
policy, for the same reason, and `db/schema/grants.sql` §4 records how readily
the Supabase dashboard offers to undo it. Promotion should go through a
`SECURITY DEFINER` RPC that checks the caller is super — the same shape as
`approve_membership`, which exists precisely because widening a policy would
have granted role changes as a side effect.

⚠️ **The first super admin must be set by hand in SQL**, because no such
account exists to grant it. Jay does that once; until then the flag is false
for everybody and nothing is gated.

## Why this was cheaper than it first looked

The 5 Aug roles decision (`2026-08-05-team-manager-and-medic-roles.md`) already
established the shape:

> Every RLS policy in this schema calls a helper function rather than testing
> `m.role` itself.

That makes a role with **identical** rights nearly free — one exported set in
`src/lib/scope.js`. It also flags the opposite case, which is the one that
would have applied here:

> If a narrower Medic is ever wanted, that is a genuinely different piece of
> work: its own branch in `can_edit_team` plus a separate players-specific
> check.

A narrower admin was the expensive option and was priced as such before the
question was asked. Jay chose the wide one, so none of that work is needed.

## What a narrower admin would cost, if it is ever wanted

Recorded now while the analysis is fresh, so the next session does not have to
redo it. The natural split, from the three jobs:

| | Club-wide events | Children's data |
|---|---|---|
| Pitch Management — pitches, refs | yes | no |
| Social Media Management | read only | no |
| Club Youth Manager — match sheets | yes | yes |

Pitch Management and Social Media Management share a permission set and differ
only in the word — which is
exactly the `coach`/`manager`/`medic` pattern and therefore cheap. The
expensive part is the set itself: a new helper alongside `can_edit_team`, and
a decision at each of the **thirteen** policies that currently hang off it
about whether the new role belongs there.

## What this does NOT settle

- **The dashboards themselves.** This decision is only about access. How the
  app knows which dashboard to show — a per-membership job label, a per-person
  preference, or simply a menu — is undecided and is a UI question.
- **Whether the features behind those dashboards are wanted in the shape
  described.** Match sheets, pitch requests and referee requests each need
  their own design; none of them exists.
