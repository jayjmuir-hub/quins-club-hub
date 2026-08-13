# Plan — an age group sees its coaches, managers and medics

**Status: NOT SHIPPED. Nothing built, nothing committed.** Written 13 Aug 2026
at Jay's request as a write-up only, while another session held the repo.

⚠️ **`npm run docs:check` does NOT validate the paths in this file** —
`scripts/docs-check.mjs` excludes `claude/plans/`. Every path below was read
during this session; re-check before relying on one.

---

## The ask

Jay, 13 Aug 2026: *"i want age groups to see their coaches, managers, and medics
on their home screen somehow, maybe title (head coach, assistant coach)
something like that, contact info, and a pic"* — and, a moment later, *"i want
this to also be visible for each age group in the admins section somewhere so
club level people can easily see it in one place"*.

So **two surfaces over one set of data**:

| Surface | Audience | Scope |
|---|---|---|
| Home card | a parent, player or coach | the staff of **their own** squads |
| Admin directory | club-level people | **every squad**, in one place |

Four things per person, not equally expensive: **who**, **their title**, **their
contact details**, and **their photo**.

## ⚠️ The measurement that changes the shape of this

Read off the live database, 13 Aug 2026:

| | |
|---|---|
| Squads | **15** |
| Squads with **NO** coach, manager or medic at all | **12** |
| Coaches / managers / medics (people) | 3 / 3 / 1 |
| …of those 7 people, how many have a phone number | **3** |

**So on the day this ships, 12 of 15 age groups show an empty card**, and of the
three that do show something, most entries have no phone number.

⚠️ **THE REAL PREREQUISITE IS NOT CODE.** Before this feature is worth building,
somebody has to attach staff to squads on the Accounts screen and those people
have to fill in a phone number. That is an admin data task. **Building this
first produces a feature that is empty for 80% of the club and looks broken.**

Two consequences for the design:

1. **The empty state is the MAJORITY case, not an edge case.** It has to say
   something useful — "no coaches listed for this squad yet" — rather than
   render an empty box or vanish silently.
2. There is a strong argument for shipping the data-entry side first, or at
   least in the same change.

## What already exists

- **Roles**: `coach`, `manager`, `medic` — `SQUAD_STAFF_ROLES` in
  `src/lib/scope.js`, mirroring `private.can_edit_team()`.
- **Labels**: "Coach", "Team Manager", "Medic" (`ROLE_LABELS`, same file).
- **The attachment**: a `memberships` row with that role and a `team_id`. One
  row per squad, so a coach of two squads has two rows — already modelled.
- **A phone**: `profiles.phone`, added 8 Aug 2026, E.164, nullable.
- **An email**: `profiles.email`, a read-only mirror of the login address.

## What does NOT exist — the four gaps

### 1. Title ("Head Coach", "Assistant Coach") — no such column

`memberships` is `id, profile_id, club_id, team_id, role, player_id, created_at,
status, is_super, admin_rights`. There is no title, and `role` is a CHECK
constraint over exactly six values — so "head coach" cannot go in `role` without
a migration per job title.

⚠️ **There is an EXACT precedent for this, and it is `admin_rights`.**
`src/lib/scope.js` records the reasoning: the database *deliberately* has no
check constraint on those values, because *"that would mean a migration per job
title, for a value that gates a screen and cannot do harm"*, and the JS list is
"the only vocabulary there is". A title is the same kind of value — it labels a
person, it grants nothing, and an unrecognised one should be inert.

**Recommendation:** a nullable free-text `memberships.title`, with the vocabulary
in `src/lib/scope.js` next to `ADMIN_RIGHTS`, and no check constraint. One
migration, ever.

⚠️ **The title must NEVER be read as permission.** `can_edit_team` keys off
`role`, and it must stay that way — the same rule
`20260806_claim_roster_access.sql` set when it ruled that a squad *rename* must
not hand anyone a role. A "Head Coach" title must grant precisely what `coach`
grants and not a thing more.

### 2. ⚠️ A parent CANNOT read a coach's profile row today — this is the blocker

The SELECT policies on `profiles`, read live:

| Policy | `using` |
|---|---|
| `profile read own` | `id = auth.uid()` |
| `profile read club admin` | `private.shares_admin_club(id)` |
| `profile read pending` | `private.can_admin_see_pending(id)` |
| `profile read squad staff pending` | `private.can_squad_staff_see_pending(id)` |

**None of them lets an ordinary member read another member's row.** A parent
today cannot see a coach's name, let alone their phone. So this feature is not a
screen — **it needs a new RLS policy** along the lines of "you may read the
profile of someone who holds a staff role on a squad you are attached to".

⚠️ **Write it as a `private.` predicate and test it with an injected fault**, the
way `can_approve_team` was done in `db/tests/rls-squad-staff-approval.sql`. A
policy that is wider than intended here exposes adults' contact details to every
parent in the club, which is the most sensitive write in this plan.

### 3. Photos — the expensive gap, and there is nothing to reuse

- `players.photo_path` holds head shots of **children**. Staff are `profiles`,
  and `profiles` has **no photo column**.
- Buckets are `player-photos` and `social-ideas`. **There is no staff bucket.**
- `src/components/AppShell.jsx` renders an *initial* for the signed-in person
  precisely because *"the signed-in person is usually a parent or a coach who has
  no photo anywhere in the system"*.

So a photo needs: a column, a bucket, storage RLS (upload own / read squad),
an upload control, and signed-URL plumbing. `src/data/photos.js` and the
`player-photos` storage policies are the pattern to copy — including the trap
recorded in `db/migrations/20260804_self_service_profile.sql`, where a
`with_check` was needed as well as a `using` so an owner could not upload **into
another person's folder**.

⚠️ **This is roughly half the work of the whole feature** and it is the least of
the four things by value. Strong candidate for phase 2.

### 3b. ⚠️ The ADMIN directory needs NO new policy — which changes the build order

`profiles` already carries **`profile read club admin`**, `using
private.shares_admin_club(id)`. **An admin can already read every profile in the
club**, which is what the Accounts screen has been doing since 3 Aug.

So the club-level view Jay asked for:

- needs **no RLS change** (unlike the member-facing card, gap 2),
- needs **no photos** to be useful,
- needs **no title column** to be useful — role alone already answers "does U12
  have a coach?",
- and is the **only thing that surfaces the 12 empty squads**, which is the
  actual blocker on the whole feature.

⚠️ **THEREFORE THE ADMIN VIEW SHOULD BE BUILT FIRST.** It is the cheapest of the
two, it is useful on day one *because* the data is missing rather than in spite
of it, and it is the tool the club needs in order to fix the data that the home
card depends on. Building the home card first means shipping an empty box to 12
of 15 age groups with no way to see why.

**Where it goes — open, two candidates:**

- **A section on `/admin/club`.** That tab already enumerates every squad, so
  staff sit next to the squad they belong to and a gap is visible in place. No
  new route. ⚠️ But `src/screens/AdminClub.jsx` is already large and is about
  squad *configuration* — names, scoring, league teams — which is a different
  job from people.
- **A new `/admin/staff` tab** (child route beside `accounts`, `club`,
  `pitches`, `youth`, `social`). Cleaner separation: `/admin/accounts` is
  people-by-person, this is people-by-squad. ⚠️ A whole tab is thin for today's
  7 people, and fair at a fully-staffed 15 squads × 2–3.

**Recommendation: `/admin/club`, as a section.** It is where a club-level person
already goes to think about squads, it needs no new route or nav entry, and
"U12 has nobody" reads best directly under U12. Revisit if that file has to be
split anyway.

⚠️ **The gaps are the point of this view.** It should list **every** squad,
including the ones with nobody — a directory that only lists squads that *have*
staff hides exactly the 12 rows a club-level person needs to act on.

### 4. The card itself

Nothing exists. Home is `src/screens/Dashboard.jsx`. The card follows the
existing `Card` primitive and the design system in
`claude/specs/design-system.md`.

⚠️ **"Home" is one screen but a person can be attached to several squads** — a
parent of two children, a coach of two age groups. So this is not "the squad's
staff", it is "staff for each squad you are in", and the multi-squad case must
be in the design from the start rather than retrofitted.

## ⚠️ The decision Jay has to make before any of this is built

**Publishing an adult's personal mobile number to every parent in a squad is a
privacy decision, not a technical one.** Some volunteers will be fine with it and
some will not, and the club cannot un-send it once 30 families have it.

Options, and I recommend the second:

1. **Name and title only, no contact details.** Safe, and honestly most of the
   value — a parent mainly wants to know *who* their child's coach is.
2. **Contact details per person, opt-in.** A "show my number to my squads"
   toggle on `/more`, defaulting OFF. Costs one boolean column and one control,
   and it is the only version that cannot embarrass a volunteer.
3. **Club addresses only** — a `coach.u13@…` style address rather than a
   personal one. Cleanest privacy answer, but it needs addresses that do not
   exist yet and `claude/runbooks/email-and-domain.md` is where that cost lives.
4. **Everything visible to the squad.** Simplest to build; the one that cannot
   be walked back.

⚠️ **Whatever is chosen, the RLS policy is the boundary — not the card.** This
repo's own rule: *"a screen that hides a row is not security."* If a number is
meant to be private, the policy must withhold it.

## Suggested shape, if it goes ahead

⚠️ **The order is deliberate and it is not the order the request came in.** The
admin view is cheapest, needs no security work, and is the only one that is
useful while the data is missing — see gap 3b.

**Phase 1 — the admin directory. No migration, no RLS, no storage.**

- A section on `/admin/club` listing **every** squad with its coaches, managers
  and medics — names and role labels, drawn from data an admin can already read.
- Squads with nobody are listed and visibly empty. That is the feature, not a
  fallback.
- Nothing else. This ships in a day and tells the club what to fix.

**Phase 2 — titles, once somebody wants to distinguish two coaches**

- `memberships.title`, nullable, no check constraint.
- A title control on the Accounts edit sheet.
- Titles appear in the admin directory.

**Phase 3 — the member-facing home card**

- ⚠️ **Only worth doing once squads actually have staff** — otherwise 12 of 15
  age groups get an empty box.
- One RLS policy letting a member read the profiles of staff on their squads,
  written as a `private.` predicate and proved against an injected fault.
- A Dashboard card per squad the person is attached to: initials, name, title,
  role. The empty state still matters — a squad can lose its coach.

**Phase 4 — photos**

- `profiles.photo_path`, a `staff-photos` bucket, storage policies with both
  `using` and `with_check`, an upload control on `/more`, signed URLs via the
  `src/data/photos.js` pattern.

**Contact details** land wherever the privacy answer puts them — see the
decision section above. ⚠️ **The admin directory is exempt from that question**:
an admin can already read every phone number in the club, so showing them there
grants nothing new. **The privacy decision is only about the member-facing
card.**

## Open questions

**The one that blocks everything:**

1. **Is the club going to attach staff to the other 12 squads?** If not, the
   member-facing card has nothing to show and only phase 1 is worth building.

**Admin directory (phase 1):**

2. `/admin/club` as a section, or its own `/admin/staff` tab?
3. Admins only, or squad staff too? A coach seeing the other coaches at the club
   would need another policy — today `profile read club admin` means only an
   admin can read those rows — so anything wider belongs with phase 3.

**Titles (phase 2):**

4. Vocabulary — Head Coach, Assistant Coach, Team Manager, Medic, Physio…?
   Free text, or a fixed list in `src/lib/scope.js`?

**Member-facing card (phase 3):**

5. Which privacy option (the four above)? ⚠️ **This question is only about the
   member-facing card** — the admin directory grants nothing new.
6. Does the card show for **every** squad the person is attached to, or one?
7. Does a **pending** parent see it? They already see fixtures and their own
   child; knowing who the coach is seems reasonable, but it is a deliberate
   widening of what pending grants.
8. Ordering — by title, by role precedence, or by name?

## Not in scope

- Changing what `coach`, `manager` or `medic` may DO. Titles are labels.
- The Accounts screen redesign — see
  `claude/plans/2026-08-13-accounts-screen-redesign.md`, which is a separate
  in-progress design and touches the same edit sheet. **These two will collide
  on `src/screens/Accounts.jsx` if built at the same time.**
