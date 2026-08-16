# Plan — account creation, rebuilt around who a person actually is

**STATUS: IN PROGRESS, opened 16 Aug 2026.** Eight items, built in the order
below. Each ships on its own and none blocks the next, so this can stop after any
of them. **Update this line as items land** — a plan that says IN PROGRESS after
it shipped is the failure mode `docs:check` rule 5 exists to catch.

## What Jay reported

> *"we need to rethink the account creation process, i can't have people signing
> up without complete information, i have coaches signing up without adding their
> kids, its chaotic right now, we need to idiot proof the account creation
> process"*

Then, narrowing it to a real record: a coach who **does** have an account, who
came through the parent route, holds a `parent` membership on one squad, and has
never been asked whether he coaches. And, separately: *"if the father adds the
mother for example"* — an adult the club holds a name, email and phone for, with
no way to be offered an account.

## The diagnosis — one fork, leaking both ways

`AppShell` renders `AddYourPlayer` by default with a secondary button —
*"I'm not adding a player"* — that swaps in `RequestAccess`. They are mutually
exclusive, and the branch a person picks in their first ten seconds decides what
the club knows about them from then on.

| Door | Outcome | What is never asked |
|---|---|---|
| **Add your player** | a `parent` membership | *do you also coach?* — **nothing anywhere asks this** |
| **I'm not adding a player** | a staff role | *do you have children here?* — asked since 16 Aug via `no_player_confirmed_at` |

⚠️ **SO THE ASYMMETRY IS PRECISE, AND HALF THE FIX ALREADY EXISTS.** The gate
shipped on 16 Aug asks a person with no children whether they have any, and
records the answer so it stops asking. There is no mirror. Item 1 is that mirror
and nothing more.

⚠️ **AND IT CANNOT BE CORRECTED FROM THE INSIDE.** `AddYourPlayer` only renders
while `memberships.length === 0`, so the moment the first child is registered the
registration form disappears from sign-up for good. It survives only behind
`/more`, which is why a coach who joined as a parent stays one until an admin
notices.

## The second diagnosis — approval is a moment, not a state

Once a person is through, their record freezes in whatever shape it arrived in.
Nothing ever asks again. **Measure it rather than believing this sentence** — the
counts that prompted the work are deliberately not written here, because every
count this repo has recorded has rotted:

```sql
select count(*) filter (where position is null or position = '') as no_position,
       count(*) filter (where gender is null)                    as no_gender,
       count(*)                                                  as players
  from public.players;

select count(*) from public.players pl
 where not exists (select 1 from public.player_parents pp where pp.player_id = pl.id);
```

## Build order

| # | Item | Size |
|---|---|---|
| 1 | The mirror question — *do you do anything else at the club?* | small |
| 2 | Split every name into first and family | small |
| 3 | Date of birth, in its own table | medium |
| 4 | Invite from a parent row | medium |
| 5 | The roll-call replaces the fork | medium |
| 6 | Completeness debt | medium |
| 7 | Link adults to accounts | medium |
| 8 | Vouching, from the club's side | large |

Items 1–4 close holes that are open on a live club today. 5 stops the hole being
re-created. 6–8 are the durable shape.

---

## 1 · The mirror question — ✅ BUILT AND VERIFIED LIVE, 16 Aug 2026

A person holding no staff membership and no recorded answer is asked once, in the
existing sign-in gate: **do you do anything else at the club?** Answers are *no,
just a parent* / *I coach, manage or medic a squad* / *I help another way*.

- `profiles.no_role_confirmed_at timestamptz`, plus **both column grants**. See
  the header of `db/migrations/20260816_profile_no_player_confirmed.sql`: RLS
  grants rows, column privileges grant columns, and without the grant the gate
  closes, the write is refused, and the person is asked again forever.
- Nothing is backfilled. Null means *never asked*, which is true of everybody.
- The branch goes in `NamePrompt.jsx` — which is already three gates wearing a
  name that describes one of them.

⚠️ **IT GATES ON `realMemberships`, NEVER THE EFFECTIVE SET.** The 16 Aug bug
(`e7e7c38`) was exactly this: a "view as" preview replaces the effective
memberships with one synthetic row, so an admin previewing any role looked like
somebody with no staff role and would be asked every time they switched.

⚠️ **TICKING "I COACH U12" MUST NOT GRANT ANYTHING.** A direct insert is already
refused — `memb no self promotion` is RESTRICTIVE on INSERT — but the reason
matters more than the mechanism: a stranger who types the name of a squad must
never read that squad's children. It creates a **pending** membership through a
`SECURITY DEFINER` RPC, which is what the approval queue and the
`notify_pending_membership` trigger already understand.

⚠️ **A PLAYER-ONLY ACCOUNT IS NOT ASKED**, for the same reason it is not asked
for a phone number.

### What the live probe actually proved — and the run that proved nothing

Both migrations applied, then exercised against production inside a transaction
that raises at the end. **The first run was worthless and is recorded because of
it.** It picked the squad with the lowest `sort_order`, which is `U6 Tag` —
**0 players and 0 events** — so "a pending coach sees 0 players" was a statement
about an empty table, not about RLS. That is the trap `CLAUDE.md` rule 6 names,
met for the third time on this project.

Re-run against `U16B`, which has real rows, **with a control**:

| | players | events | parent contacts |
|---|---|---|---|
| control, no RLS | 4 | 35 | — |
| stranger, no memberships | 0 | 0 | — |
| **pending coach** | **0** | **35** | **0** |
| flipped to `active` | 4 | — | — |

The flip is what makes the zero evidence: the same query returns 4 the moment
the status changes, so the 0 is `status` doing its job rather than the query
finding nothing. Also proved in the same run: `role = 'admin'` refused (22023),
an unknown squad refused (22023), the created row is
`pending / coach / player_id NULL / is_super false / rights 0`, `club_id` derived
from the squad, and a second call returns the **same row** rather than tripping
`memberships_unique_grant`.

⚠️ **AND THE ACL WAS WRONG ON FIRST APPLY.** The migration claimed anon was
excluded; `pg_proc.proacl` said otherwise, because Supabase's default privileges
grant EXECUTE to anon on creation and `revoke … from public` does not remove an
explicit grant. Revoked, re-read, and the migration file now carries the extra
line. `register_my_player` has the same grant and was deliberately left alone —
`claude/open-items.md`.

### Three injected faults, each caught by one test

| Fault | Test that failed |
|---|---|
| gate on `memberships` instead of `realMemberships` | *does not open while previewing as a parent* |
| drop `'admin'` from the staff-role list | *never asks an admin* |
| record "no role" as well as sending the request | *sends the squad and the role, and does NOT record "no role"* |

⚠️ **AND THE SUITE WAS GREEN BEFORE ANY OF THOSE TESTS EXISTED.** Adding the
fourth step broke nothing, which read as "it works" and meant "the new branch is
unreachable": the file's default fixture is an **admin**, who is correctly never
asked. A gate step can be added to this component and be tested by nothing at
all — check the fixture's role before believing a green run here.

## 2 · Split every name into first and family — 🟡 SCHEMA + SIGN-UP DONE

**Done, 16 Aug 2026:** the columns, `private.sync_person_name` on both tables,
the backfill, and the **registration form** — which is the form that produced the
one-word row.

**Still to do, and deliberately not started:** the two-box treatment on
`PlayerForm` (admin), `MyPlayerForm` (a parent editing their own child) and
`ParentsEditor`. Those screens still write `full_name` in one box, which the
trigger splits correctly — so they are **correct but not yet improved**. Nothing
is broken by leaving them; they simply do not enforce a family name.

### Verified on production

| | rows | have first | have last | one-word split right way round | recomposes to `full_name` |
|---|---|---|---|---|---|
| `players` | 26 | 26 | 25 | 1 of 1 | all |
| `player_parents` | 29 | 29 | 29 | — | all |

The single one-word player is the row that prompted the change, and it landed as
a **first** name with a null family name — the 8 Aug bug, not reintroduced.

⚠️ **AND THE COLUMN GRANTS WERE CHECKED RATHER THAN ASSUMED.** `players` went
13 → 15 granted columns and `player_parents` 9 → 11, which is what proves the
UPDATE grant is **table-level** and the new columns inherited it. Had it been
column-level (as it is on `profiles`, 7 of 13), every save through the new form
would have failed with something that reads exactly like an RLS refusal.

Trigger proved live in a rolled-back transaction, all seven cases: full→split,
split→full, one word (last stays NULL), update full, update split,
both-at-once (first/last win), and the same reconciler on `player_parents`.


`players.full_name` and `player_parents.full_name` are single columns behind
single inputs, and **a single box gets a single word** — which is how a child
reaches the roster with a first name and nothing else.

The pattern is already proven on `profiles`: `first_name` / `last_name` columns
with `private.sync_profile_name()` keeping `full_name` in step **both ways**, so
every reader of `full_name` carries on untouched. Copy it.

⚠️ **`full_name` MUST NOT BECOME A GENERATED COLUMN.** The `profiles` note says
why: things write to it directly, and a generated column would break them on
first save. The trigger is the mechanism, not a constraint.

⚠️ **BOTH NAMES REQUIRED, AND THE PRECEDENT IS ALREADY IN THE FILE.**
`PlayerRegistrationForm`'s `firstProblem()` requires both for the registrant and
records the reasoning: this field exists so a coach can identify a **stranger**
asking to join a children's squad, and *"Sarah"* does not do that. The same
argument applies to the child.

Callers to change: `PlayerRegistrationForm`, `PlayerForm`, `MyPlayerForm`,
`ParentsEditor`, and `playerImport`.

## 3 · Date of birth, in its own table — 🟡 TABLE DONE, NOTHING WRITES TO IT YET

**Done, 16 Aug 2026:** `public.player_private`, three policies, applied and
proved on production. ⚠️ **Nothing in the app reads or writes it yet** — the
registration field and the `allowsOwnContact` re-point are the remaining half,
and until one of them lands this table is correct and empty.

### Proved on production, rolled back, with a control

| | rows visible |
|---|---|
| control, no RLS | 2 |
| **parent of child A** | **1** — their own only |
| parent of A reading B | 0 |
| parent updating own child | 1 row |
| **parent updating a team-mate** | **0 rows** |
| coach of the squad | 2 |

Grants read back rather than assumed: `authenticated` holds
SELECT/INSERT/UPDATE/DELETE from Supabase's defaults, `anon` holds nothing.

⚠️ **THE `allowsOwnContact` RE-POINT IS NOT A TIDY-UP AND MUST NOT BE DONE
CASUALLY.** A parent may write their own child's birthday — deliberately, since
the family is the source of truth. That means a DOB may only ever make the
under-13 contact gate **stricter**, never relax it, or a parent editing a
birthday could unlock a field the club's own rule forbids. The call sites also
take a squad NAME today, not a player, so re-pointing is a real refactor rather
than a one-line change. Deferred on purpose.

## 3 · Date of birth — the original reasoning

Jay's call, 16 Aug: *"i think we need to have date of birth"*. It was argued
against first — `src/lib/ageGroup.js` records the standing ruling that the club
does not hold DOBs and age comes from the squad name — and overruled. Recorded
here so nobody re-argues a settled question.

⚠️ **DO NOT ADD A `date_of_birth` COLUMN TO `players`.** `player read` is
squad-wide, so a column there is readable by **every parent in the squad**: a
directory of every child's birthday, published as a side effect of a form field.

The codebase has already solved this once, and the table comment on
`player_grades` states the rule outright — *RLS grants ROWS not COLUMNS, and a
parent and a coach are the same `authenticated` role*. Date of birth takes the
same shape: its own table, policies `can_edit_team(...) OR is_own_player(...)`,
which is the pair `player_parents` already runs. Staff and the child's own
family, nobody else.

Two things follow in the same change:

- **`allowsOwnContact` in `ageGroup.js` gets re-pointed.** Its header names
  itself as the one place to change when a DOB lands. Leaving it inferring from
  the squad name while a real age exists is two sources that can disagree about
  whether a child may hold their own email.
- **The age-group picker checks itself.** Born March 2014 and picked U12 → the
  form agrees out loud. Born 2010 and picked U12 → it asks whether that is right.
  ⚠️ **It ASKS, it does not refuse** — same asymmetry as the gender rule, which
  refuses a blank and permits a contradiction. A wrong-looking date is usually a
  typo and occasionally a genuine dispensation.

## 4 · Invite from a parent row

An adult on `player_parents` is the club's knowledge of a person written in the
wrong table. Put an **Invite** button on the row.

**Who sees it: exactly who can already edit the row.** `parent edit own`
(`is_own_player`) and `parent edit` (`can_edit_team` — coach, manager, medic on
that squad, plus club admins). ⚠️ **No new permission is needed**, and
`src/data/parents.js`'s header claiming `edit : can_edit_team` only is **stale**
— fix it in this change.

⚠️ **DO NOT WIDEN `invites manage` TO LET COACHES IN.** It is `FOR ALL` and
scoped only by club, so a coach reaching invites through it could mint one
granting **any** role on any squad, admin included. It is admin-only for a
reason.

Instead: a `SECURITY DEFINER` RPC taking **one argument, the parent row id**. It
reads the email **off the row rather than from a parameter** — the property that
makes `claim_roster_access` safe — derives the child, the squad and the role from
the row, and refuses unless the caller passes `can_edit_team` or
`is_own_player`. There is then no way to ask it for anything except *parent of
this child*.

### ⛔ BLOCKER FOUND 16 Aug 2026, BEFORE ANY CODE WAS WRITTEN

**`public.accept_invite` does not mention `status` anywhere.** Measured on the
live database, not read off this repo:

```sql
select position('status' in pg_get_functiondef(p.oid)) > 0 …  -- false
```

Both of its `insert into public.memberships (…)` statements name five columns
and omit `status`, so **every accepted invite inherits the column default,
which is `'active'`.**

Consequences for the design below, and they point in opposite directions:

- **Coach- or admin-invited → `active` costs nothing.** It is already the
  behaviour. Nothing needs changing for that half.
- **Parent-invited → `pending` REQUIRES CHANGING `accept_invite`**, which is
  wrapped in `## SECURITY-CRITICAL ##` banners in `db/schema/functions.sql` and
  is the function that turns a token into access. It would have to learn who
  created the invite and choose a status from it.

⚠️ **DO NOT DO THAT AS A SIDE EFFECT OF BUILDING A BUTTON.** Either give
`invites` its own column recording the status to grant (so `accept_invite` reads
a value rather than deriving a rule), or accept that a parent-initiated invite
lands active and drop that half of the design. **Both are Jay's call**, and the
second is a real safeguarding decision rather than a simplification: it would let
a parent hand a squad-wide roster to somebody no member of staff has ever seen.

**Where the two invites differ, and why:**

- **Staff invites → the parent lands `active`.** A coach deliberately named
  them; that *is* the vouching, so there is nothing left to queue.
- **A parent invites → `pending`.** A parent may only invite to their own child,
  but `active` would hand a squad-wide roster to somebody no member of staff has
  ever seen.

⚠️ **THIS DOES NOT RE-OPEN THE BULK-INVITE RULING.**
`claude/decisions/2026-08-06-roster-auto-onboarding.md` killed bulk sending
because *a send that fails, fails silently* — nobody learns the mail never
existed. One row, one press, one person watching: the failure returns to the
human who caused it. That decision explicitly retained single invites.

State on the button — **Invite** → **Sent \<when\>** → **Joined** — because
without the middle state two coaches invite the same person on the same evening.
An invited parent skips sign-up entirely: every answer the roll-call would ask
for is already on the row that invited them.

## 5 · The roll-call replaces the fork

One screen, tick everything that applies, all of which can be true:

- I have a child playing here
- I play here myself
- **I coach, manage or medic a squad** — ⚠️ medic belongs **here**, with coach
  and manager, not under "another way". `REQUESTABLE_ROLES` in
  `RequestAccess.jsx` already groups it correctly; the first draft of this plan
  did not, and was wrong.
- I help the club another way — committee, volunteer

Nothing is pre-selected. ⚠️ **Defaulting to "Parent" would be right most of the
time, which is exactly the problem** — every coach who does not read the screen
files as a parent, which is the same "no idea who they are" bug wearing a more
confident face. Leaving a box empty is a **recorded claim**, not an absence.

Removes the `askingForAccess` state from `AppShell` and the *"I'm not adding a
player"* button with it.

## 6 · Completeness debt

One "what is missing" function, defined once and read by three surfaces: the
approval queue's chip, a card on the person's own home screen, and an admin
"records needing attention" list.

⚠️ **THE CARD MUST DISAPPEAR WHEN THE LIST IS EMPTY.** That is the whole
contract and the reason it works where a permanent banner does not. A chase with
no visible end is ignored by about the third sign-in.

## 7 · Link adults to accounts

`player_parents.profile_id`, nullable, plus a claim on sign-in for an email that
matches — `claim_roster_access` generalised from children to adults. Safe for the
same reason: it reveals nothing unless the email already matches, so it is not an
enumeration oracle.

It is also what gives item 4's button its **Joined** state, and what stops the
same human existing as three unlinked records.

## 8 · Vouching, from the club's side

⚠️ **A "WHO AT THE CLUB KNOWS YOU?" DROPDOWN WAS DESIGNED AND KILLED. Do not
rebuild it.** A person with no membership reads exactly one row — their own
profile (`profile read own`, and the three other read policies all require a
membership or admin). Filling that list means a new function whose only purpose
is telling anybody who signs up which adults coach which children.

Ask the club instead. `db/migrations/20260809_notify_pending_membership.sql`
already emails every coach, manager and admin on the squad the moment a
registration lands — the people who could vouch **are already being told**. Give
that notification two answers: **I know them** / **I don't**, landing next to the
request in the queue.

⚠️ **"I DON'T KNOW THEM" IS THE VALUABLE ANSWER**, and it is the one nobody can
give today. It rejects nobody — it makes an unrecognised adult asking to reach a
children's squad visible as exactly that, instead of identical to everyone else
in the queue.

## Verification — per `CLAUDE.md` rule 6

A green suite is not a working site, and each of these must be proved against an
**injected fault**, not just asserted:

- The mirror question does **not** fire for someone who already holds a staff
  role, and **does** fire once for a parent — and does not re-fire after "no".
- Switching "view as" does not open the mirror gate. (The 16 Aug bug, injected.)
- A staff request from the gate creates a **pending** row and grants no read.
  Confirm live that the requester still sees zero rows from `players` for that
  squad.
- `full_name` still resolves for a row written through the new two-box form, and
  a row written the old way still splits — the trigger works **both ways** or it
  works neither.
- A date of birth written by a parent is **not** readable by another parent in
  the same squad. This is the one that must be proved on the live database with
  an impersonated user, exactly as the `teams` read policy was on 16 Aug.
- The invite RPC refuses a caller who is neither `can_edit_team` nor
  `is_own_player`, and refuses to accept an email as a parameter at all.
- A parent-initiated invite lands `pending`; a coach-initiated one lands
  `active`.

⚠️ **Commit before injecting a fault.** `git checkout -- <file>` reverts to the
last commit and has already wiped uncommitted work on this project once.
