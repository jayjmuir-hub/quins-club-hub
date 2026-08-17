# Plan — account creation, rebuilt around who a person actually is

**STATUS: IN PROGRESS, opened 16 Aug 2026. Items 1, 2, 4, 4b, 5 and 7 have
SHIPPED; 3 is all but its last piece; 6 and 8 are not started.** Each ships on its
own
and none blocks the next, so this can stop after any of them. **Update this line
as items land** — a plan that says IN PROGRESS after it shipped is the failure
mode `docs:check` rule 5 exists to catch.

⚠️ **THE FORK IS GONE (item 5, 17 Aug), WHICH IS THE ONE CHANGE THE REST OF THIS
PLAN WAS WRITTEN AROUND.** The diagnosis below still describes the app as having
two mutually exclusive doors. It does not any more — it is kept because it is why
everything else here exists.

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

| # | Item | Size | State |
|---|---|---|---|
| 1 | The mirror question — *do you do anything else at the club?* | small | ✅ 16 Aug |
| 2 | Split every name into first and family | small | ✅ 17 Aug |
| 3 | Date of birth, in its own table | medium | 🟡 all but the contact re-point, which needs **one fact from Jay** |
| 4 | Invite from a parent row | medium | ✅ 17 Aug |
| 4b | …and the email that actually posts it | medium | ✅ 17 Aug — one real send outstanding |
| 5 | The roll-call replaces the fork | medium | ✅ 17 Aug |
| 6 | Completeness debt | medium | not started |
| 7 | Link adults to accounts | medium | ✅ 17 Aug |
| 8 | Vouching, from the club's side | large | not started |

Items 1–4 close holes that are open on a live club today. 5 stops the hole being
re-created. 6–8 are the durable shape.

⚠️ **WHAT IS LEFT OF 3 IS THE `allowsOwnContact` RE-POINT, AND IT IS NO LONGER
BLOCKED** — the cut-off turned out to be recorded in the tournament repo (31
August, UAERF). It is ordinary work now, with a safeguarding rule inside it: a
DOB may only ever make that gate **stricter**.

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

## 2 · Split every name into first and family — ✅ COMPLETE, 17 Aug 2026

**Done, 16 Aug 2026:** the columns, `private.sync_person_name` on both tables,
the backfill, and the **registration form** — which is the form that produced the
one-word row.

**Done, 17 Aug 2026:** `PlayerForm`, `MyPlayerForm` and `ParentsEditor`. Every
box in the app that names a person is now two.

⚠️ **THESE THREE WRITE `first_name`/`last_name` DIRECTLY, WHERE THE REGISTRATION
FORM JOINS — AND THAT IS NOT AN INCONSISTENCY TO TIDY UP.** `register_my_player`
takes one `p_full_name` parameter and widening a public signature was the larger
change. These write the table, so they need not — and **must not**, because the
join is lossy in one direction: the trigger takes the **last word** as the family
name, so *"Anna van der Berg"* joined and re-split comes back as *"Anna van der"
/ "Berg"*. Writing both columns takes the trigger's names-win branch instead.
`full_name` is sent as well, computed exactly as the trigger recomputes it, so a
row written while the trigger was somehow absent still carries a correct display
name for its thirty-odd readers.

⚠️ **AND THERE IS NO CLIENT-SIDE SPLIT OF `full_name` ANYWHERE, NOT EVEN AS A
FALLBACK.** The rule — a one-word name is a **first** name — has been got
backwards once already (`20260808_sync_profile_name_single_word`), and a second
copy of it in JavaScript would be invisible until somebody sorted a roster. The
backfill filled every existing row and its migration **aborts** if it did not, so
an empty box means an empty column.

### The family name is required, and grandfathered on players only

| | rule |
|---|---|
| a NEW player | both names |
| an EXISTING player who arrived without one | still saves — nobody may **blank** one that exists |
| a parent row | both names, no grandfathering |

⚠️ **THE GRANDFATHER CLAUSE IS NOT A COMPROMISE, IT IS THE `ParentsEditor`
RULING APPLIED AGAIN.** At least one live player row has a first name and nothing
else. Demanding a family name there blocks a coach fixing a typo in a position
until they invent a surname they may not know — which is exactly why "at least
one parent" warns instead of blocking.

⚠️ **PARENT ROWS GET NO SUCH CLAUSE BECAUSE THERE IS NOTHING TO GRANDFATHER, AND
THIS WAS MEASURED RATHER THAN ASSUMED.** Every parent row has both names, and
`PlayerForm` and `MyPlayerForm` are the **only** writers of `player_parents` —
`invite_parent` is the only function in either schema that even mentions the
table, and it does not insert. So the rule closes the door rather than locking
somebody out from behind it. It lives in **one** function, `parentNameProblem`,
called by both screens, and is checked **before any write**: the parent rows are
saved last, so catching it there would refuse a save that had mostly happened.

### Four injected faults, each caught by one test

| Fault | Test that failed |
|---|---|
| drop the family-name requirement | *refuses a new player with a first name and nothing else* |
| drop the grandfather clause | *still saves an existing player who arrived without a family name* |
| require only a first name on a parent row | *refuses a parent with a first name and nothing else* (both screens) |
| send parent rows as `full_name` only | *writes first_name and last_name alongside full_name* |

⚠️ **AND THE FOURTH ONE WAS GREEN WHEN IT WAS FIRST INJECTED.** Every screen test
asserts what is handed to `saveParents`; `toRow` is below that line and nothing
looked at it. The test that catches it had to be written against the built
insert, in `tests/parents-photos.test.js`. **This is the third time on this
project that a suite has gone green over an untested new branch** — check what
the existing tests can actually see before believing one.

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

⚠️ **`playerImport` WAS DELIBERATELY LEFT ALONE, 17 Aug 2026, AND IT IS THE ONE
ITEM ON THAT LIST THAT IS NOT DONE.** A CSV carries one name column; splitting it
would be a client-side copy of the trigger's rule, which is the thing this item
refuses to have (see the note above). The importer keeps writing `full_name` and
the trigger keeps splitting it — correct for "First Last", and wrong in the same
way it has always been for a two-word family name. **The fix is a second CSV
column, not a smarter split**, and it belongs to whoever next changes the import
format.

## 3 · Date of birth — ✅ TABLE AND REGISTRATION FIELD DONE, 16 Aug 2026

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

### ✅ THE CUT-OFF IS 31 AUGUST — answered 17 Aug from the tournament repo

Jay: *"check the adhjrt.com repo for age bands"*. It was there all along, in
`…\GitHub\adhjrt`, `Quins JRT.dc.html`:

> UAERF age-grade cut-off: a player's age group is fixed by their age at midnight
> 31 August — "Under X" means they are exactly X−1 on that date.

Ported to `src/lib/ageGrade.js` with the band table, the ladder and the girls'
allowance. **So the re-point below is no longer blocked — just not done.** It is
ordinary work now, with the safeguarding rule still attached: a DOB may only ever
make the gate STRICTER.

⚠️ **THE EMIRATI U18 EXCEPTION IS NOT ENFORCED IN EITHER APP** — UAERF gives
Emirati U18 players a 31 December cut-off and neither app collects nationality.
Inherited deliberately, with its reasoning, rather than quietly dropped.

### ⛔ THE SECOND REASON, AS FOUND — kept because it is why the model is careful

⚠️ **RUGBY AGE BANDS ARE SEASON-RELATIVE AND A BIRTHDAY IS NOT.** "U13" means
under 13 **as at a cut-off date**, so a U13 squad is mostly **twelve-year-olds**
for most of the season. A gate asking "is this child 13 today?" would therefore
strip the own-contact field from nearly a whole squad **that the club's own rule
permits it for** — and it would do so gradually, as birthdays passed, which is
the hardest kind of bug to attribute.

⚠️ **THE APP DOES NOT KNOW THE CUT-OFF DATE.** Searched the schema, `claude/` and
`src/` on 17 Aug: nothing records it. So the re-point needs **one fact from
Jay** — the date the club's age groups are counted from — and it is not
something to infer from the data, because with `player_private` still at **zero
rows** there is no data to infer it from.

**Until then `allowsOwnContact` stays keyed on the squad name**, and
`ageGroup.js`'s header no longer invites the re-point — it used to say "if a DOB
column ever lands, `allowsOwnContact` is the one place to re-point", which is now
a sentence pointing at a trap.

### ✅ PLAYING UP — model and notification both shipped, 17 Aug 2026

`player_private.plays_up_confirmed_at`, written on the same call as the birthday,
and a **Playing up** chip on the approval queue.

⚠️ **THE CHIP IS THE NOTIFICATION, AND THAT IS THE DESIGN RATHER THAN THE CHEAP
OPTION.** The person who has to ACT is the coach reading that queue; an email is
only a prompt to come and look at exactly that card. It also costs no Vault
secret, no edge-function deploy, and — see below — no third copy of the age
model. **If an email is wanted later it reads the column**; the work is item 4b's
shape, not a new derivation.

⚠️ **THE COLUMN IS A DECISION, NOT A DERIVED FACT.** The birthday and the squad
say a play-up is POSSIBLE; the column says a parent **ticked the box**. Deriving
it at read time would show "playing up" for a family who never agreed to
anything.

⚠️ **AND THE TICK ALONE IS NOT THE ANSWER EITHER.** A parent can tick, then
change the squad or the date to one that is no longer a play-up — the tick
survives in React state. The check is re-run at submit, so a consent is only
recorded while it is still true.

⚠️ **THE QUEUE ASKS ONLY ABOUT ITS OWN ROWS.** `player_private` holds children's
birthdays; reading it for the whole roster to label a handful of pending cards
would pull the club's birthday list into an admin's browser. RLS would permit
that, which is why the narrowing is deliberate — and asserted by a test.

| Fault | Test that failed |
|---|---|
| trust the tick without re-checking the dates | *does not record a consent the dates no longer justify* |
| show the chip for any private row | *says nothing for a child with a birthday but no confirmation* |
| widen the read to the whole roster | *asks only about the players in the queue* |

⚠️ **AND THE LIVE RLS PROBE REPORTED A HOLE THAT WAS NOT ONE, FIRST TIME.** Its
"a different parent in the same squad" fixture also held a **coach** role there,
which legitimately grants `can_edit_team`. In this club a lot of parents are
coaches. Re-run excluding anyone with a staff role anywhere: own parent **1**,
team-mate's parent **0**, stranger **0**, control **1**. **A fixture picked by
role name is not a fixture picked by rights.**

### 🟡 WHY IT IS NOT AN EMAIL — the trap in the obvious route

Jay, 17 Aug: *"we need the ability for players to play up one age group with a
notification"*. The **rules half is built and tested** — `src/lib/ageGrade.js`,
the consent tick on `PlayerRegistrationForm`, and a refusal to save a play-up
nobody consented to. What is **not** built is the notification.

⚠️ **AND THE OBVIOUS ROUTE FOR IT IS A TRAP.** The registration already emails
the squad's coaches, managers and admins through `notify_pending_membership` →
`notify-approval`, which is exactly the right audience. But that function is Deno
and cannot import `src/lib/ageGrade.js`, so teaching it to work out a play-up
means **a third copy of the UAERF model** — one in the tournament repo, one here,
one in an edge function. Two copies already have to be kept in step by hand.

**Do it by storing the answer instead.** The client knows it is a play-up at the
moment of consent, so record it (`player_private` already takes a second write
for the date of birth right after registration) and let the email read a column
rather than re-derive a rule. That also fixes the ordering problem: the
membership insert — and so the email — fires **before** the DOB write lands, so
anything derived at trigger time would be reading a row that does not exist yet.

⚠️ **AND THE APPROVAL QUEUE IS THE NOTIFICATION THAT ALREADY WORKS.** The coach
who has to act sees the pending row on screen; a chip there needs no secret, no
edge-function deploy and no third copy.

### ✅ THE OTHER HALF SHIPPED — the age-group check, 17 Aug 2026

`dobBandMismatch` in `src/lib/ageGroup.js`, shown under the age-group picker in
`PlayerRegistrationForm`. ⚠️ **IT ASKS, IT DOES NOT REFUSE** — `role="status"`,
Save stays live.

It does **not** convert a birthday into a band and compare for equality, for the
reason above. It computes the two bands a child could plausibly be in
(`age + 1`, `age + 2` — which of them applies depends on the unknown cut-off),
allows a year of grace on each end, and speaks only outside that. The window
comes out **wider upwards than downwards**, which fell out of the model rather
than being designed and is the right way round: a younger child playing up is
ordinary; an older child in a much younger squad is worth a second look.

| Fault | Test that failed |
|---|---|
| collapse the plausible window to the exact age | *says nothing about the same child in U12 or U14*, and the grace test |
| never render the warning | *questions a birthday a long way from the age group, and still saves it* |

⚠️ **AND THE HEADLINE CASE SURVIVES THE FIRST FAULT ON ITS OWN.** "A
twelve-year-old in U13 is silent" still passes with the season model removed,
because the ±1 grace covers it by itself. The model is pinned by the other two
cases, not by that one — do not read a green run of it as proof the model is
intact.

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

## 4 · Invite from a parent row — ✅ BUILT, 17 Aug 2026

An adult on `player_parents` is the club's knowledge of a person written in the
wrong table. Put an **Invite** button on the row.

**Done, 17 Aug 2026:** `src/components/InviteParentButton.jsx`, rendered by
`ParentsEditor` — so it appears on **both** surfaces at once, `PlayerForm` (a
coach, manager, medic or admin) and `MyPlayerForm` (a parent editing their own
child). That pair IS `can_edit_team OR is_own_player`, so there is **no role
check in the component**: a second rule up there would be free to disagree with
the one in the database, and the wrong one would be the one nobody tested.

⚠️ **THE TRAP THE COMPONENT EXISTS TO CLOSE, AND IT IS NOT THE ONE THE SCHEMA
CLOSED.** `invite_parent` reads the address off the ROW. Inside a form, that
makes a half-edited row dangerous: correct the address, press Invite before
Save, and the **old** address gets the account while the screen shows the new
one. So the editor row carries `savedEmail` beside `email` and the button
withdraws while they differ, saying why. Case and whitespace are ignored, since
the server lowercases and trims.

⚠️ **IT SHOWS A LINK, NOT A SENT EMAIL — AND THAT IS THE HONEST STATE OF THIS
APP.** No edge function posts invite mail; `InviteForm` has always shown the
accept link for a human to send. A button claiming "invitation sent" would be
the only screen in the app promising a mail nobody posted. **Jay asked for an
email** ("*click to send that person an email invitation*"), so the send is a
real remaining piece and is written up as item 4b below.

**States built: Invite → Invited \<when\> → (Joined awaits item 7).** `Joined`
cannot be computed today: it needs `player_parents.profile_id`, because a client
may not read `profiles` for anybody but itself. The refusal covers the gap in the
meantime — inviting somebody who already has an account is refused with 42710 and
the sentence says to ask an admin to connect them.

### Four injected faults, each caught by exactly one test

`tests/invite-parent.test.jsx`. ⚠️ **Only the Supabase CLIENT is mocked**, not
`src/data/parents.js` — mocking one layer lower is what lets a test read the
actual RPC arguments and assert that **no email address is ever sent to the
server**. Mocking the data module would have proved only that the component
called a function.

| Fault | Test that failed |
|---|---|
| treat an edited address as saved | *withdraws the button while the typed address differs* |
| pass the email as a second RPC argument | *asks the server for the ROW, and never sends the address* |
| hard-code the "goes to the approval queue" sentence | *says an invite it can grant needs nothing further* |
| pass any `error.message` through to the screen | *does not read out an error the function did not write* |

### Verified against production, read-only, 17 Aug 2026

`player_parents.invited_at` exists and `authenticated` holds SELECT on **all 12**
of the table's columns — which is what makes `listParents`' `select('*')` safe
after the migration, and is the same table-level-versus-column-level question
that item 2 had to answer. `invite_parent` exists with EXECUTE for
`authenticated` and **not** `anon`, so the 16 Aug ACL trap did not recur.

## 4b · The invite email — ✅ LIVE, 17 Aug 2026, awaiting one real send

`supabase/functions/notify-invite/index.ts` + `db/migrations/20260817_notify_invite.sql`,
both deployed and applied. Jay settled the three open questions: **yes**, the
sender is **named**, and it fires for **every** invite.

❌ **AND THE HAND STEP THIS SECTION WARNED ABOUT DID NOT EXIST.** It said two
Vault secrets and one dashboard env var were needed, which made it look blocked
on Jay for a day. In fact all three existing notifiers **share**
`approval_notify_secret`, and Edge Function env vars are **project-wide** on
Supabase — so a brand-new function already has it. The only new vault entry was
the function's URL, which is not a secret. **Measured, not assumed:** the first
curl answered **401, not 503**, and 503 is the fail-closed answer when the env
var is missing.

⚠️ **THIS NOTIFIER IS NOT LIKE THE OTHER THREE, AND THE DIFFERENCE IS THE
DANGEROUS PART.** They mail a GROUP of volunteers, in bcc, about work waiting.
This mails ONE PERSON and puts a **credential** in the message — `invites.token`
is the whole of the authentication. So: no bcc, no cc, exactly one recipient read
off the row, and a request body carrying an id and nothing else. Copying the
squad's coaches "for visibility", as the others deliberately do, would hand every
one of them a working link into somebody else's account.

⚠️ **IT MUST NOT READ `invite_targets`.** A multi-target invite is TWO writes —
the invite row, then the targets — so the trigger fires before they exist and a
query returns zero, every time. An email listing "the children you'll be linked
to" would list none: silently, and only in the multi-child case.

### What is left: one real send, and it is Jay's

Everything is proved except that a mail actually arrives, and that needs a real
inbox. Put Jay's own address on a real `player_parents` row, press **Invite**,
and confirm the mail lands **and the accept link works**. ⚠️ **Do not test this
against a club member's address.**

### ⛔ THE BLOCKER AS ORIGINALLY WRITTEN — kept, because it was wrong

Pressing Invite creates the invite; a human still sends the link. To make it a
real email, the proven shape is already in this repo twice over: an AFTER INSERT
trigger on `invites` calling a `notify-invite` edge function through `pg_net`,
exactly as `db/migrations/20260809_notify_pending_membership.sql` calls
`notify-approval`. Read that migration's header before writing it — the three
prerequisites, the fail-closed shared secret and the "it must never fail the
write" ordering all apply unchanged.

⚠️ **IT NEEDS TWO VAULT SECRETS AND ONE DASHBOARD ENV VAR, WHICH IS JAY'S HAND
STEP** — there is no MCP tool for Edge Function secrets. Until it is done the
function answers 503 and no mail is sent, which is the intended failure.

⚠️ **AND THE RECIPIENT IS AN ADULT WHO HAS NOT ASKED FOR ANYTHING**, unlike every
existing notification, which goes to volunteers who signed up. That is a
different consent question and it is Jay's, not a detail to settle while
building.

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

### ✅ RESOLVED 16 Aug 2026 — Jay chose the column. Verified live, rolled back.

| caller | grant_status |
|---|---|
| the child's own parent | pending |
| coach or manager of the squad | active |
| **medic of the squad** | **pending** |
| a stranger | refused, 42501 |

⚠️ **THE MEDIC ROW IS THE ONE THAT MATTERS AND IT IS NOT AN EDGE CASE.**  includes medic;  does NOT. So a medic may press the button (they may edit the row) and their invite lands PENDING — a medic must not grant by the back door what they cannot grant by the front one.

⚠️ **THE INVARIANT, AND THE TEST FOR ANY FUTURE ROLE: nobody can mint an invite worth more than they could approve.** That is why the rule keys on  and NOT on "is the caller staff".

Also proved: pressing twice returns the SAME invite rather than a second live token; an address that already has an account is refused (42710) because accept_invite would build a duplicate membership;  is stamped. And on accept_invite itself — an invite with  omitted still lands  (the existing admin form, unchanged), a pending one lands pending and sees **1** player rather than the squad's 4, and the separate  sibling branch carries the status too (2 rows, 0 not-pending).

### ⛔ THE BLOCKER, AS FOUND — kept because it is why the column exists

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

## 5 · The roll-call replaces the fork — ✅ BUILT, 17 Aug 2026

**What was established before writing any of it, and it changes the shape:**

⚠️ **THE GATE IS THE PROVIDER'S SNAPSHOT, NOT THE DATABASE — WHICH IS WHAT MAKES
A MULTI-ANSWER SCREEN POSSIBLE AT ALL.** `AppShell` renders the zero-membership
route while `memberships.length === 0`, and that array only changes when
something calls `reload()`. `register_my_player` and `request_staff_role` both
create rows without telling the provider. So a roll-call can write **several**
answers and stay on screen throughout, provided it holds `reload()` back until
the last one. Wire `onDone` straight to `reload` — as `AddYourPlayer` does today
— and the screen vanishes the instant the first answer lands, taking every
remaining question with it. **That is the trap, and it is silent.**

✅ **A SQUAD PICKER WORKS FOR A STRANGER.** `team read` is
`(SELECT auth.uid()) IS NOT NULL`, measured from `pg_policy` on 17 Aug. Three
files said otherwise; see the correction in `AddYourPlayer.jsx`'s header.

✅ **Three of the four answers already have a server-side home.** *Child* and
*I play here myself* are `register_my_player` (one `PlayerRegistrationForm`
covers both — it asks "who are you registering?" per row). *Coach, manager or
medic* is `request_staff_role`, which a zero-membership caller may use: it needs
a confirmed email and nothing else.

### ✅ RESOLVED 17 Aug 2026 — Jay chose the role, and kept the squad

Offered three options: add `volunteer` and keep the squad requirement; add it and
relax the requirement; or drop the fourth box. **He chose the first.**
`db/migrations/20260817_access_request_volunteer_role.sql`, applied and proved in
a transaction that rolled back — `volunteer` accepted, an invented `chairman`
still refused `23514`, which is the control proving the widened CHECK still
checks.

⚠️ **CLAIMABLE, NOT GRANTABLE, AND THE MIGRATION GUARDS BOTH DIRECTIONS.**
`requested_role` is a statement; `memberships.role` is a grant and still refuses
`volunteer`. The migration **aborts** if it ever reaches `memberships_role_check`.
Do not finish that job: `can_see_team` and `can_edit_team` read that table, and a
role granting nothing is a row each of them would have to learn to ignore.

⚠️ **A VOLUNTEER'S SQUAD MEANS "WHO TO ASK ABOUT ME", NOT "WHAT I DO THERE".**
That is the trade Jay took over relaxing a four-day-old policy, and relaxing it
is the thing not to do quietly later. The wording under the picker changes for a
volunteer; the field does not.

**It is already reachable** — `RequestAccess` offers it today, so the fourth
answer has a home before the roll-call that needs it exists.

### ⛔ THE BLOCKER AS FOUND — kept because it is why the role exists

`access_requests` is the only queue for somebody with no squad, and **it cannot
hold this person**:

```
access_requests_requested_role_check
  CHECK (requested_role IS NULL OR requested_role = ANY
         (ARRAY['parent','player','coach','manager','medic']))
```

and the INSERT policy added on 16 Aug **requires both** a role and a squad. A
committee member is none of those five and may belong to no squad at all. So
today the only way to file one is to make them claim a role they do not hold —
which is the "no idea who they are" bug, reintroduced by the screen built to
kill it.

⚠️ **DO NOT SETTLE THIS WHILE BUILDING A SCREEN.** Widening the CHECK is
additive and small. **Relaxing the squad requirement is not**: that requirement
is four days old, was added at Jay's explicit request, and is the reason an admin
can now tell one waiting stranger from another.

⚠️ **AND DO NOT SHIP THE ROLL-CALL WITH THIS ANSWER HALF-WIRED.** A tick that
records nothing is worse than no tick: the whole argument for the screen is that
*"leaving a box empty is a recorded claim, not an absence"*. A fourth box that
quietly drops what it was told breaks the only promise the screen makes.

### What shipped

`src/components/RollCall.jsx`. One screen: your name (only if the club does not
already have it), four boxes, nothing pre-selected, then a section per ticked
answer, then **one** `reload()`. `AddYourPlayer` and `RequestAccess` survive as
sections of it; `askingForAccess` and the *"I'm not adding a player"* button are
gone from `AppShell`.

Two things were added while building that the design did not have:

- ⚠️ **THE STAFF SECTION CAN BE SKIPPED, AND THAT IS NOT POLISH.** Somebody who
  ticked it by mistake, or whose squad is not in the list, would otherwise be
  stranded there with the children they came to register permanently out of
  reach behind it. It writes nothing, so the mirror gate asks again next
  sign-in.
- **"I play here myself" seeds the first registration row** rather than being a
  tick that changes nothing. Safe because the squad decides twice — the select's
  `onChange` clears the flag for a squad that forbids self-registration, and the
  submit forces `canSelfRegister && row.selfRegister` again.

### ⚠️ FOUR INJECTED FAULTS, AND THE FIRST ONE SURVIVED

| Fault | Test that failed |
|---|---|
| pre-select an answer | *offers every answer, with nothing pre-selected* (and 7 more) |
| drop the family-name requirement | *requires a family name, unlike the sign-in gate* |
| ignore an existing access request on mount | *goes straight to the state of their request* |
| **wire `reload` to the registration section** | **nothing — see below** |

⛔ **THE RELOAD FAULT — THE ONE THING THIS SCREEN TURNS ON — LEFT ALL SEVENTEEN
TESTS GREEN.** Every case that finished with the players section had it **last**,
where reloading is correct, and the only case that continued afterwards finished
with **staff**. The bug is invisible except in a run where a question follows the
registration form. The case that catches it — tick a child *and* "I help the club
another way", register the child, and the volunteer question must still be
standing — was written afterwards and fails on the fault.

⚠️ **THAT IS THE FOURTH TIME ON THIS PROJECT A SUITE HAS GONE GREEN OVER AN
UNTESTED BRANCH.** Check what the existing cases can actually SEE before
believing one.

### The design, worked out before any of it was written

One screen, ticks, then a section per ticked answer, then **one** `reload()` at
the very end. Removes `askingForAccess` from `AppShell` and the *"I'm not adding
a player"* button with it. Four things were established while designing it, and
each of them is a trap if it is rediscovered the hard way:

1. ⚠️ **`reload()` GOES LAST, ONCE.** See the note above — wiring it to the first
   section's `onDone`, as `AddYourPlayer` does today, unmounts the screen and
   silently discards every remaining answer.
2. ⚠️ **THE NAME IS ASKED FIRST, BEFORE ANY WRITE.** `request_staff_role` creates
   a pending membership that appears in a coach's approval queue rendered from
   `profiles.full_name`, so a coach who never gave a name arrives as *"Unnamed
   member"*. `PlayerRegistrationForm` already solves this for its own path — an
   "About you" fieldset shown only when `name_confirmed_at` is null — and asking
   once at the top of the roll-call makes that fieldset correctly disappear.
   `RequestAccess` writes the name for the same reason. **Three paths, one
   question, asked once.**
3. **`RequestAccess` keeps owning everything about an access request** — the
   form, *"Request sent"*, and *"Access not approved"*. The roll-call must not
   grow its own copies of those three states; a person who asked yesterday and
   signs in today has to meet them, not the ticks again.
4. **One `PlayerRegistrationForm` covers both *I have a child here* and *I play
   here myself*** — it already asks "who are you registering?" per row, gated on
   `teams.self_registration_allowed`.

## 5 · The roll-call — the original reasoning

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

## 7 · Link adults to accounts — ✅ BUILT, 17 Aug 2026

`player_parents.profile_id`, filled by `public.link_my_parent_rows()` when
somebody signs in with no access, and the Invite button's third state:
**Invite → Invited → Joined**.

⚠️ **THE PLAN SAID "`claim_roster_access` GENERALISED FROM CHILDREN TO ADULTS".
THAT WOULD HAVE OPENED A HOLE, AND THE FUNCTION DELIBERATELY IS NOT THAT.**
`claim_roster_access` matches an email and **creates a membership**. Safe where
it is: the address lives on `player_contacts`, the child's own contact details,
which **only staff can write**. `player_parents.email` is an address a **parent**
can type, for their own child, under `parent edit own`. A claim granting access
on that basis would mean: type an address into the contacts box, sign in as it,
hold a membership on that squad — which is exactly what `invite_parent` exists to
prevent, and why that function routes the same journey through an invite whose
`grant_status` is `'active'` only if the sender could already approve.

**So this sets one column and creates nothing.** The migration carries a guard
that ABORTS if the function body ever mentions `memberships`. ⚠️ **If a future
change makes it insert one, it re-opens the hole item 4 closed.**

### Proved on production, rolled back, with the case that matters last

| | |
|---|---|
| linked, case-insensitively, across two children | **2** |
| a second call | **0** — an already-linked row is never re-stamped |
| a row already claimed by another account | untouched |
| **memberships before → after** | **48 → 48 — IT GRANTS NOTHING** |

⚠️ **THAT LAST ROW IS THE ONE TO KEEP.** The other three would all pass for a
function that also handed out access.

⚠️ **AND THE LINKING CALL HAS ITS OWN `try`/`catch`**, separate from the claim
beside it in `memberships.jsx`. A failure here must not cost somebody the claim
that actually gets them into the app; the two are unrelated, and folding them
together would let a tidiness win break a route in.

## 7 · The original reasoning

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
