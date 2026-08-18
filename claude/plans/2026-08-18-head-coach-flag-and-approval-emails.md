# Plan — a real head-coach flag, and who gets the approval emails

**STATUS: BUILT, NOT YET APPLIED — 18 Aug 2026.** The migration, harness, screen
control and both edge functions are written and tested. ⚠️ **The migration has
NOT been run against production and the functions have NOT been deployed**, so
the live club still e-mails every admin and every coach on the squad. Applying
it is the step below.

⚠️ **THE DATABASE-BRANCH PLAN AT THE BOTTOM OF THIS FILE FAILED AND WAS
REPLACED.** A branch comes up EMPTY — Supabase replays a `migrations`
directory under `supabase/` that this repo does not have
and this repo keeps them in `db/migrations/`. `CLAUDE.md` now records that.
The migration was proved with `db/tests/head-coach-flag.sql` instead, inside a
rolled-back transaction against production, which is strictly better here: a
branch has no production data and could not have verified the backfill.

## The ask

Jay, 18 Aug 2026: *"we don't need to email every single admin every time or all
the coaches in an age group, we should only email super admins, the head coach
and the team manager or team managers if there is more than one"*.

## What is true today — measured on production, 18 Aug 2026

**Re-run these before trusting them.**

| Function | Emails today |
|---|---|
| `notify-access-request` | every active admin, club-wide |
| `notify-approval` | every active admin in the club **plus** every active `coach` and `manager` on that team |

| | |
|---|---|
| Active admins | 5 |
| Active **super** admins | 3 |
| Admins who would stop receiving | 2 |
| Squads | 15 |
| Squads with any active staff | 5 |
| Squads with a "Head Coach" **title** | 4 |
| Squads with a `manager` **role** | 4 |
| Staffed squads with neither | **1** |

## ⚠️ The thing that made the obvious implementation wrong

**There is no head-coach role.** `memberships.role` is constrained to
`admin, coach, manager, medic, parent, player` — a head coach and an assistant
coach are both `coach`, because their PERMISSIONS are identical.

Head Coach is a **`title`**, and `title` is **free text with zero check
constraints** — measured, not assumed. Production already contains
`Assistant Coach/Medic`. Matching `title ilike '%head coach%'` would therefore
be a string match against whatever somebody typed, and a squad recorded as `HC`
or `Head coach ` would match nothing — **an email silently not sent, which is the
worst failure shape for an approval queue** because nobody learns of it.

✅ **Jay's ruling: add a real flag rather than parse the title.**

## Decisions taken, 18 Aug 2026

1. **`memberships.is_head_coach boolean not null default false`** — a flag, not a
   role, mirroring the existing `is_super` precedent
   (`db/migrations/20260810_super_admin_and_rights.sql`). A head coach's
   permissions are a coach's; only the job differs.
2. **At most ONE head coach per squad, enforced by the database.** Jay's call.
   Fits the data: 4 squads, 4 head coaches, none with two. A partial unique index
   means the email code can rely on it instead of hoping.
3. **Team managers are matched by ROLE, not title.** `role = 'manager'` and the
   title "Team Manager" cover the same 4 squads today, and the role cannot break
   on a typo. This is the one place the free-text problem has a clean escape.
4. **Both notification functions change.**

## ⛔ What is deliberately NOT being built

**"Only email after the person confirms their email address"** — asked for, then
measured and dropped. Of 34 users, **0 are unconfirmed**, and both write paths
that raise these emails (`register_my_player`, `request_staff_role`) require
`auth.uid()`, so a session — which only exists after the emailed link is
clicked. The filter would remove zero emails today and would be a guard that
cannot fire, which this repo deletes on principle (see the unreachable
`ageGradeCheck` guard removed 17 Aug after a 281-case sweep found 0 hits).
⚠️ **This reasoning depends on Supabase's e-mail confirmation staying required.**
If that is ever switched off, re-open this.

## The change

### 1. Migration

- `alter table public.memberships add column is_head_coach boolean not null default false`
- **Partial unique index**: `create unique index ... on memberships (team_id) where is_head_coach` — one per squad, and nulls in `team_id` (club-level admins) are excluded by the predicate anyway.
- **Backfill**: set `is_head_coach = true` where the title already says so, so the 4 squads that are set up carry over with no data entry.
- ⚠️ **AN EXPLICIT COLUMN GRANT, AND ONLY THIS COLUMN.**
  `src/data/staff.js` records the trap: `authenticated` holds COLUMN-LEVEL
  UPDATE on `memberships`, and `title` is writable only because
  `db/migrations/20260813_membership_title.sql` granted that one column. **A
  table-level grant would hand every admin write access to `is_super`.** Grant
  `is_head_coach` the same narrow way.

### 2. Who may set it

Whoever may set `title` today, via the same policy — **measured 18 Aug 2026, and
it is `private.is_admin`.** `public.memberships` carries exactly ONE policy for
writes: `memb manage`, `ALL`, both `USING` and `WITH CHECK` being
`private.is_admin(club_id)`.

⚠️ **SO THIS FLAG INHERITS THE KNOWN `is_admin` GAP**, which
`claude/open-items.md` records: it tests role and club and **never `status`**.
That file says to re-measure rather than assume it is still unreachable, so it
was re-measured here: **admin memberships by status — `active` 5, and no other
status exists.** So a pending or revoked admin cannot be created today and the
gap stays theoretical.

⚠️ **THE FLAG DOES NOT WIDEN IT, BUT IT DOES ADD A ROW TO THE BLAST RADIUS.** The
day any path can create a non-active admin membership, that admin could set a
head coach as well as everything else `memb manage` already allows. Recorded so
the `is_admin` item is not closed on the strength of this plan.

### 3. UI

A control on `/admin/staff`, beside the title field, following
`setMembershipTitle` in `src/data/staff.js` — including its
`.select(...).maybeSingle()` pattern, because a refused write returns an empty
result rather than an error and would otherwise look like a save that worked.
Setting a new head coach where one exists must be an explicit swap, since the
index will refuse a second.

### 4. The emails

Both functions send to the union of:

- **super admins** — `is_super = true`, `status = 'active'` (3 today)
- **the squad's head coach** — `is_head_coach`, `status = 'active'`
- **the squad's manager(s)** — `role = 'manager'`, `status = 'active'`

⚠️ **Super admins are the floor, and that is what makes this safe.** One staffed
squad has no head coach and no manager; after backfill it still will not, because
it has no title to backfill from. Requests for that squad reach super admins only
until somebody flags a head coach there — nothing is lost, but the squad is not
told. **Surfacing "squads with no head coach" on `/admin/needs-attention` is the
obvious follow-up and is NOT in this plan.**

## Tests, and what would make them worth having

⚠️ **Every assertion below must be proved against an injected fault.** A test
that passes with the recipient filter removed is worse than none.

- **The DB refuses a second head coach on one squad** — insert, expect the unique
  violation. Control: the same insert on a different squad succeeds.
- **The column grant is narrow** — `is_super` still refused to `authenticated`
  after this migration. This is the one that protects against the escalation the
  grant trap describes; assert the refusal, and check it is refused by the GRANT
  and not by something earlier.
- **Recipient selection**, per function: an assistant coach on the squad is NOT a
  recipient, the head coach IS, every manager IS, a non-super admin is NOT, a
  super admin IS. ⚠️ **The discriminating fixture is a squad with a head coach AND
  an assistant** — one where the old query and the new one differ. A fixture with
  a single coach passes under both and proves nothing.
- **A squad with no head coach still reaches super admins**, i.e. the floor holds.
- ⚠️ **`db/tests/` harnesses run against production data** — read
  `claude/runbooks/db-harnesses.md` first; `npm run db:check`.

## Rollout

⚠️⚠️ **ORDER IS NOT OPTIONAL: MIGRATION FIRST, THEN DEPLOY. THE OTHER WAY ROUND
BREAKS `/admin/staff` COMPLETELY.** `src/data/staff.js` now names
`is_head_coach` in its `select`, and PostgREST rejects a select naming a column
that does not exist — so the squad list would fail to load, not degrade. Measured
18 Aug 2026: the column is **not** on production (`information_schema.columns`
returns 0). This is the whole reason the plan says the migration is a separate,
earlier step rather than something the deploy carries with it.

1. **Apply `db/migrations/20260818_membership_head_coach.sql` to production.**
2. **Then** merge and let the front-end deploy.
3. **Then** deploy the two edge functions.

⚠️ **The migration is safe to apply ahead of the code**: the column defaults to
false, nothing reads it yet, and the backfill only sets rows whose title already
says Head Coach. The reverse order is the one that breaks.

### The original plan, kept for its reasoning

1. Migration on a **database branch** first — Supabase is on Pro, branching is
   available, and it bills by the hour, so create/use/delete.
2. Deploy the two edge functions.
3. ⚠️ **This touches the live approval path mid-onboarding.** The failure mode is
   an approval nobody is told about. Verify by sending one real request through
   after deploying, not by a green suite.
