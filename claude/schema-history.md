# Quins Club Hub — schema and migration history

**Reference, not instruction. Not in the reading order** — `CLAUDE.md` step 4 is
`RESTORE.md`, and this file is what that file used to carry as a second document
glued onto its end.

What follows is the REASONING behind each migration, which the SQL does not carry.
Read the relevant section before changing a policy. **Do not trust its status lines** —
each one describes the moment it was written.

⚠️ **Neither `db/migrations/` nor this file is a complete record.** Supabase has **65**
applied migrations; `db/migrations/` holds **30** files. ⚠️ **This said "51 applied, 17
files" until 9 Aug** — both numbers rotted within two days, which is the same failure
every count in these docs has had. **Run `list_migrations` and `ls db/migrations/`;
do not cite these two.** The authoritative list is
Supabase's own (`list_migrations`), and the authoritative *definition* of the live
schema is the capture in `db/schema/` — see "Changing the schema safely" in
`RESTORE.md`. `events_series_id` (`20260805133133`) is applied with no file in the
repo; `src/screens/EventForm.jsx` writes the column it adds.

---

### `20260821_publish_training_fit_check` — the squad publish never checked

✅ **APPLIED 21 Aug 2026 as `publish_training_fit_check`, on Jay's explicit "apply publish_training_fit_check"; harness 8/8 live the same minute.** This paragraph read "NOT APPLIED" for about an hour. The file is
`db/migrations/20260821_publish_training_fit_check.sql` and Jay decides when it
goes in. `db/schema/functions.sql` carries the NEW text of the function with a
line pointing here, so the capture is ahead of the database until then —
⚠️ **`npm run db:check` will report the difference, and that report is correct.**

**Why.** `publish_training` authorised the CALLER against the club that owns the
TEMPLATE, then trusted `_teams` entirely. It is `SECURITY DEFINER`, so RLS never
sees the caller: an admin of one club passing another club's team id would have
had that squad's training events written. There is one club today, which is
precisely why this is cheap now and expensive on the day there are two.

It also adds the contact check. `squadFitsTemplate` in `src/lib/trainingPlans.js`
already refuses a contact template for a tag squad, but the SCREEN was the only
thing enforcing it — a direct RPC call bypassed it. Defence in depth, not a new
rule.

**The argument against, kept.** Age-band fitness is deliberately NOT enforced
here. The band is parsed from the squad NAME in JavaScript because the club has
no age column and the names are inconsistent; reimplementing that parse in
plpgsql would give two parsers that drift apart silently. Contact is a COLUMN,
so contact is the half that can be enforced in the database — and it is the half
that puts a child in a tackle.

**Proof, when it is applied.** `db/tests/training-plans.sql` steps 7 and 8 —
a contact template to a tag squad, and a team id that is not in the club, both
expected to be refused `42501`. ⚠️ **Both are marked NOT YET MEASURED in that
harness's footer and will read `FAIL — allowed` until the migration is applied.**
That FAIL is the answer to “has it gone in yet”, not a broken test.

---

### `20260819_revoke_truncate_from_authenticated` — the privilege RLS cannot filter

✅ **APPLIED 19 Aug 2026 as `revoke_truncate_from_authenticated`.** Measured
immediately after, not assumed — `authenticated` holds TRUNCATE on **0 of 34**
tables (was 31), and the four verbs the app uses are **unchanged against their
pre-change counts**: SELECT 33, INSERT 31, UPDATE 25, DELETE 31. `service_role`
keeps TRUNCATE on all 34. The `postgres` default privilege grants it on none.

✅ **And smoke-tested as a real signed-in member**, inside a rolled-back
transaction, because a grant query would not report a blank roster as unusual:
30 of 30 players, 63 of 63 events, 56 memberships and 8 of 8 availability rows
visible, a real `UPDATE` of an availability row succeeding — and `truncate`
refused on both `availability` and `players`.
⚠️ **That pairing is what makes the refusal evidence.** The same role, in the
same transaction, could still UPDATE. So the refusal is the privilege that was
removed and not a blanket loss of access — a negative check that fails for the
wrong reason proves nothing.

**The reasoning the SQL cannot carry.**

This is the third in a sequence — `20260813_revoke_anon_execute` (function
EXECUTE), `20260814_revoke_anon_table_privileges` (table privileges for `anon`),
and now TRUNCATE for `authenticated`. All three close a Supabase default that
nobody here chose. **The first two are different in kind from this one, and the
difference is the point.**

The `anon` migrations shut doors that RLS was already holding shut. Every policy
in `public` is `TO PUBLIC` and bottoms out in `auth.uid()`, so an anonymous
caller was refused anyway; the revokes bought defence in depth. ⚠️ **TRUNCATE is
not like that. Postgres never applies row security to it** — not "the policies
permitted it", the mechanism does not exist. So a signed-in member holding
TRUNCATE was filtered by nothing at all, and the sixty-odd policies this repo
depends on had no bearing on it whatsoever.

**Why it sat open for days after being found.** It was filed 18 Aug under
"Cheap" in `claude/open-items.md` with a condition attached: *wants its own
harness proving nothing legitimate needs it before applying project-wide*. That
condition was right and it is why this is a piece of work rather than a
one-liner.

**How the condition was met — three independent ways, none of them an opinion:**

1. **Nothing in the codebase issues a SQL TRUNCATE.** Every `truncate` in
   `src/` is the Tailwind class. ⚠️ Before trusting that negative, the search
   was confirmed able to find something known to be there — the real SQL
   TRUNCATE in `20260817_membership_audit.sql`.
2. **PostgREST exposes no TRUNCATE verb**, so nothing a browser can send
   reaches it.
3. ⚠️ **Three tables had already been running without it** — `photo_backup_runs`
   (13 Aug), `photo_orphan_scans` (16 Aug), `membership_audit` (17 Aug), each
   tightened by hand at creation. **The exceptions are the argument.** One of
   them carries the photo backup the club depends on, and it has never had
   TRUNCATE.

**And the capability was demonstrated, not read off a catalogue row.** A grant
row saying TRUNCATE is a different claim from "a member can empty this table".
So, inside a transaction that rolled back: create a throwaway table down our own
migration path, insert a row, `set local role authenticated`, `truncate`. It
emptied. ⚠️ **A throwaway rather than `players` deliberately** — truncating the
live roster would have proved the identical thing while taking an ACCESS
EXCLUSIVE lock on a club mid-onboarding, and it would have shown nothing about
whether the *default* is still live. The probe showed both.

## ⚠️ The finding worth more than the migration

**A REVOKE ISSUED BY SOMEONE WHO IS NOT THE GRANTOR SUCCEEDS AND DOES NOTHING.**

`authenticated` also holds TRUNCATE on `storage.objects` — the row behind every
player photo — plus `storage.buckets`, `storage.buckets_analytics` and the two
`pg_net` queue tables. The obvious response is to add them to the migration.

Measured instead, as `postgres`, in a rolled-back transaction:

```
revoke truncate on storage.objects from authenticated;   -- ran clean, no error
has_table_privilege('authenticated','storage.objects','TRUNCATE')  -- still true
```

Postgres removes only the grants the revoking role itself made. The grantor
there is `supabase_storage_admin`; on the `net` tables it is a PUBLIC grant from
`supabase_admin`. **So a migration naming those five tables would have applied
cleanly, passed review, and been a lie** — and the only signal of failure was a
privilege that was still there afterwards, which nobody checks unless they
already suspect it.

⚠️ **This generalises well beyond TRUNCATE**, and it is the reason
`db/tests/anon-table-grants.sql` and `db/tests/truncate-grants.sql` both assert
with `has_table_privilege` rather than by reading migration text or a single
catalogue column. **Assert the outcome; the statement succeeding proves nothing.**

The five tables are named in the migration header and asserted nowhere. An
assertion known to be false is worse than a documented gap.

## What was deliberately left

- **`service_role` keeps TRUNCATE.** The edge functions run as it and it holds
  the service key, which can grant anything back to itself; removing a
  privilege from that role is theatre. ⚠️ It is asserted as a **control** in the
  harness, so a later sweep cannot take it by accident.
- **REFERENCES, TRIGGER and MAINTAIN stay.** Same Supabase default, not
  destructive. ⚠️ TRIGGER is the least comfortable — it would let a member
  attach an existing function to a table — but `authenticated` has **no CREATE
  on schema `public`** (measured: false), so it cannot introduce one to attach.
  Looked at and left, not missed.
- **Sequences.** Untouched, as `20260814` left them, for the same reason: this
  migration is about destroying rows.
- **`anon` is not named.** It holds TRUNCATE on nothing in `public` — measured 0
  — because `20260814` already took everything. Naming it would imply this file
  is what closed it.

---

### `20260814_calendar_feed_competition_type` — the feed learns what a tournament is

✅ **APPLIED 14 Aug 2026 as `calendar_feed_competition_type`.** Measured after: the
function returns `competition_type`, still returns `time_tbd`, and its ACL is
unchanged with **no PUBLIC**.

Jay, from the live schedule: a tournament read **"Quins vs Al Ain Tournament"**. The
app fix is in `src/lib/eventFormat.js`; this is the half that stops a parent's
CALENDAR disagreeing with the screen.

⚠️ **The feed could not see `competition_type` at all.** It received `competition` —
the tournament's NAME — but never the type, so it had no way to tell a tournament from
a legacy row carrying arbitrary free text. An edge function **cannot add a column to
its own input**; that is decided by this function's `RETURNS TABLE`, which is the point
`20260812_calendar_feed_league_team` makes at length and the reason the pitch was
missing from the feed for a day in Aug 2026.

⚠️ **REJECTED: inferring it from `competition` being non-null.** That is exactly what
the app does for rows predating the column, and it is *very nearly* right — the app
nulls `competition` for a league fixture and for a friendly, so a non-null value does
imply a tournament today. Refused because "very nearly right, by a convention the
writer happens to follow" is how the two sides drift, and this is the file whose whole
job is stopping that. Sending the column costs one word in a select list.

⚠️ **THE EDGE FUNCTION IS A SEPARATE DEPLOY AND WAS THE THING MOST NEARLY FORGOTTEN.**
It sat on the pre-TBD version for hours after the migration landed. Deployed as
**version 32**, `verify_jwt` still false. Smoke-tested with a non-existent token:
200 and a valid empty `VCALENDAR`, which also proves the new RPC signature and the
function agree — a mismatch surfaces as a 503.

---

### `20260814_competition_tbd_and_time_tbd` — "we don't know yet", as a thing a fixture can say

✅ **APPLIED 14 Aug 2026 as `20260814160402 competition_tbd_and_time_tbd`**, by Claude
through the Supabase MCP — ⚠️ **which contradicts the 14 Aug handoff's claim that
`apply_migration` is refused by the permission layer here. It is not, and that line is
stale.** Check `list_migrations` rather than either sentence; this file's status lines
rot, which is what the header says.

**Measured immediately after, not assumed:**

- `events_competition_type_check` is now
  `CHECK (competition_type = ANY (ARRAY['league','tournament','tbd']))`.
- `events.time_tbd` is `boolean NOT NULL DEFAULT false`; **62 events, 0 flagged**, so
  nothing already in the database changed meaning.
- `events_no_end_when_time_tbd` exists as `CHECK ((time_tbd = false) OR (ends_at IS NULL))`.
- `calendar_events_for_token` returns `time_tbd`, and ⚠️ **its ACL is byte-identical
  before and after** — `postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres`,
  with **no PUBLIC**. That is the exact drift the 12 Aug migration caught the hard way,
  and the `revoke ... from public` is why it did not recur. Compare the whole ACL
  string, not just the role you were worried about.

✅ **BOTH NEW CONSTRAINTS WERE FAULT-INJECTED AGAINST THE LIVE DATABASE**, because a
check that has never failed is not a check. An invalid `competition_type` and a
`time_tbd = true` row carrying an `ends_at` were both attempted; both were refused with
a `check_violation`. ⚠️ **Only refusals were attempted, so nothing could commit** — the
club has real fixtures and a test insert that succeeded would have flashed a phantom
match into parents' schedules. Confirmed after: still 62 events, still 0 `tbd` rows.

Jay asked for a TBD option on the competition dropdown, R0 on the round, and a TBD
start time. Two of the three needed the database.

**Why `'tbd'` does not reopen the `'friendly'` ruling.** `db/schema/tables.sql` carries
a tombstone next to `events_competition_type_check` refusing a third value, because
"a friendly is the ABSENCE of a competition, so it is NULL — adding a third value
would make *not answered* and *answered: friendly* indistinguishable." That refusal
stands and is untouched. It rejected a value that **already had a representation**;
`'tbd'` had none. Before this there was no way to record "a real competitive fixture
whose competition nobody has confirmed", and the only expressible answers were a guess
or NULL — which the app renders as "a friendly". **NULL keeps its exact meaning; the
state that had none now has one.** Four states, and nothing may collapse `'tbd'` into
NULL.

**Why the start time is a FLAG and not a nullable `starts_at`.** ⚠️ `starts_at` is
`timestamptz NOT NULL` and must stay so. Every read path orders, ranges and pages on it
— `listEvents`, the 18-month window, the fortnight strip, the dashboard hero, the feed
function itself. A NULL there would land in the sort key of all of them, and the
failure mode is a fixture **silently missing from a list**, not an error. So the DATE
stays real and `time_tbd` says the clock time is a placeholder.

⚠️ **The app writes midnight CLUB time as that placeholder**, so a TBD fixture sorts to
the top of its own day. **That is a convention of the writer, not a rule the column
enforces** — nothing may read "starts_at is midnight" as "the time is TBD", because a
genuine 00:00 social is a legal fixture. `isTimeTbd()` in `src/lib/eventFormat.js` and
the edge function both test the flag and only the flag.

⚠️ **`events_no_end_when_time_tbd` is not tidiness.** Without it a fixture could carry a
15:30 finish against a placeholder midnight start, which `events_ends_after_starts`
accepts happily (00:00 < 15:30) and every calendar renders as a 15½-hour event.

⚠️ **The migration recreates `calendar_events_for_token`, and that is the half most
likely to be forgotten.** The feed's columns are decided by that function's
`RETURNS TABLE`, never by the edge function — the point
`db/migrations/20260812_calendar_feed_league_team.sql` makes at length, and the reason
the pitch was missing from the feed for a day in Aug 2026 while somebody edited
`index.ts`. Same `drop`/`create` (a return type cannot be changed in place), same
mandatory `grant` **and** `revoke ... from public` afterwards.

**R0 needed no migration.** `round` is a bare `smallint` with no CHECK. ⚠️ **0 is falsy
in JavaScript**, so the risk was never the database — it was a renderer testing
truthiness. `src/lib/fixtureLabel.js` and `supabase/functions/calendar/index.ts` both
already test `round != null`; that was verified before R0 was added, not assumed.

---

### The 9 Aug 2026 migrations (five)

`20260809080107 age_groups_rename`, `20260809083535 register_my_player_gender`,
`20260809083640 register_my_player_gender_errcode`, `20260809092039 squad_staff_approval`,
`20260809093858 notify_pending_membership`.

Full reasoning lives in `claude/decisions/2026-08-09-single-gender-squads.md` and
`claude/decisions/2026-08-09-approvals-emails-and-accounts.md`. What follows is only the
part a person changing the schema needs in front of them.

**`age_groups_rename` — UPDATE and INSERT, no DDL.** The 11 existing squads were renamed
**in place** so their ids survived: 6 players, 26 events and 1 membership stayed attached.
Four new squads inserted. **The guard aborts unless it ends with exactly 15 youth + 3
senior and no stale name.** ⚠️ Nothing about the `teams` table changed, so
`db/schema/tables.sql` has nothing to say about this migration — a schema capture cannot
see a data migration.

**`register_my_player_gender` — the 2-arg version is DROPPED, deliberately.** Postgres
prefers an exact arity match, so leaving `register_my_player(text, uuid)` in place would
have kept every two-argument call resolving to the **unchecked** function. The new
signature is `(text, uuid, text default null)`.

**`register_my_player_gender_errcode` — `22004`, not `22023`.** `src/data/members.js`
maps `22023` to one generic sentence covering three other guards. The gender-required
message **names the squad**, which is the entire reason the field became mandatory, so it
raises `22004` and falls through to the client verbatim. There is a test asserting the
*absence* of a mapping. **Change the errcode and the parent starts seeing the wrong
sentence.**

**`squad_staff_approval` — ⚠️ AN RPC, NOT A WIDENED POLICY, AND IT MUST STAY THAT WAY.**
`memb manage` is `FOR ALL USING private.is_admin(club_id)`. **FOR ALL** means SELECT,
INSERT, UPDATE and DELETE, and **RLS grants ROWS, NOT COLUMNS** — so a coach clause on
that policy would also hand every coach the ability to change anyone's `role` on their
squad (including to `admin`), reassign them to another team, and delete access.
Approving a registration and administering the club would become one permission.

So the policy is untouched. `public.approve_membership` is `SECURITY DEFINER` with
`status` as a **literal** in its SET list — there is no parameter through which any other
column can be written. **The migration's guard ABORTS if `memb manage` is ever found to
be anything other than admin-only**, because the RPC is pointless the moment coaches can
write the table directly. Two SELECT policies scoped to `status = 'pending'`
(`memb read squad staff pending`, `profile read squad staff pending`) let staff see the
rows and the names they are judging, and nothing else.

⚠️ **`private.can_approve_team` is deliberately NOT `private.can_edit_team`.** Medics
hold `can_edit_team` — they may edit that squad's players. Admitting a stranger to a
children's squad is not a medical decision. **Do not simplify one into the other.**

⚠️ **The obvious implementation had a latent bug.** A table UPDATE reading the row back
with `.select()` would return nothing once the coach's pending-only read policy applied —
the row leaves their view the instant it is approved — so a **successful approval would
have been reported to the coach as a refusal**. The RPC returns the row from inside
`SECURITY DEFINER`, where that policy does not apply.

**`notify_pending_membership` — the first trigger in this project that reaches outside
the database.** `AFTER INSERT ... WHEN (new.status = 'pending')` → `pg_net` → the
`notify-approval` edge function → Resend. On the row, not in the client, because a
client-fired notification is one the client can skip.

⚠️ **Three layers of "this cannot fail a registration":** `net.http_post` queues and
returns without waiting, the vault lookup warns rather than raises, and the whole trigger
body is wrapped in `exception when others`. **The consequence is that a broken mail path
fails SILENTLY into the Postgres log.** The screen is the source of truth; the email is a
prompt to go and look at it.

⚠️ **`pg_net` queues inside the transaction.** A rollback un-queues the request, and it
cannot raise into the caller — which is what makes the fail-open design work and also
what makes it untestable from the caller's side.

⚠️ **This trigger reads `vault.decrypted_secrets` and calls `net.http_post`. Neither
schema is captured in `db/schema/`**, so changes on either side are invisible to that
directory's diff.

---

### Migration `scale_indexes_and_availability_policy_merge` (9 Aug 2026)

Four indexes and a policy merge, prompted by Jay putting a number on growth:
**600-700 players, possibly double in parent accounts**. Nothing here is a bug
at 6 players; all of it is a default that stops being right somewhere between
100 and 700.

⚠️ **`availability(player_id)` was the one real defect.** One row per player per
event is ~70,000 rows for a season. **The existing unique index on
`(event_id, player_id)` does not cover a `player_id` lookup** — Postgres cannot
use a composite index when the leading column is absent from the predicate. That
is the trap that makes the advisor's finding look like a false positive when you
glance at the constraint list.

`memberships(team_id)` and `(player_id)` are indexed despite the table being
small, because **nearly every RLS policy in this schema joins against
`memberships`** — the scan happens *inside* per-row policy checks on much larger
tables. High leverage because it is small and hot, not because it is big.

⚠️ **Not `CONCURRENTLY`, deliberately** — a concurrent build cannot run inside a
transaction and these tables are empty today. **Add any future index on
`availability` with `CONCURRENTLY`, outside a migration.**

**The merge.** Four permissive policies covered three commands, and permissive
policies are OR'd with every one evaluated per candidate row — so SELECT, INSERT
and UPDATE each ran two subquery-bearing expressions where one would do. Now one
policy per command.

⚠️ **A POLICY MERGE IS AN AUTHORISATION CHANGE WEARING A PERFORMANCE HAT.** It
was measured, not argued: `db/tests/rls-availability-equivalence.sql` records
what seven caller types can do before, applies the merge, and re-records. All
seven identical, across all four commands. Fault-injected both ways — a
narrowing (`2_coach_pending` 1 → 0) and a widening (`using (true)` → the
unrelated outsider 0 → 1).

⚠️ **The merged `avail read` has THREE arms and the middle one is load-bearing.**
`can_see_team OR can_edit_team OR is_own_player` looks redundant — for an ACTIVE
staff member can_edit_team does imply can_see_team. It is there because
**`can_edit_team` does NOT check `status` and `can_see_team` DOES**. The first
version of this merge dropped that arm and the harness caught it. **Do not tidy
it away.**

⚠️ **The underlying gap is NOT fixed here:** a pending coach/manager/medic still
passes `can_edit_team` on events, players, contacts and parent rows. Latent —
nothing creates a pending staff membership today — and recorded in
`claude/state-of-play.md`. Fixing a function five tables' policies call needs its
own change and its own harness.

---

### The 8 Aug 2026 migrations

Not written up here. `20260808151251 event_end_time_and_notes`,
`20260808154115 calendar_feed_end_time_and_notes`, `20260808160943 membership_pending_status`,
`20260808161025 is_attached_to_team_grants`, `20260808161245 register_my_player`,
`20260808164111 teams_readable_before_registration`, `20260808191310 profile_phone_and_column_grants`,
plus `20260808084615 sync_profile_name_single_word`.

The reasoning is in `claude/decisions/2026-08-08-parent-self-registration.md` and in the
migration files themselves. **The one thing worth pulling forward**, because four RLS
policies are unreadable without it: `membership_pending_status` **split the old
`can_see_team` in two**. `private.can_see_team` now requires `status = 'active'` and
gates *people*; `private.is_attached_to_team` accepts any status and gates *fixtures*.
A pending parent can therefore see the schedule and not the roster.

⚠️ **`is_attached_to_team` shipped without its EXECUTE grant and broke every events
query within minutes**, which is what `is_attached_to_team_grants` exists to fix. **A new
`private` helper needs `grant execute` to `authenticated` (and usually `anon`) or every
policy that calls it fails closed.**

---

### Migration `self_service_profile` (4 Aug 2026)

File: `db/migrations/20260804_self_service_profile.sql`. Owner policies on
`player_contacts` and `player_parents`, an `is_own_player` arm on the photo storage write,
and `public.set_own_player_photo()`.

**READ THIS BEFORE "SIMPLIFYING" IT INTO A POLICY.** The obvious implementation is another
PERMISSIVE policy on `public.players` scoped by `is_own_player`. That is a real hole: **RLS
grants access to ROWS, not COLUMNS**, so it would let a parent write every column on their
child's row — `full_name`, `position`, `jersey_num` and, fatally, **`team_id`**. Moving
their own child into another age group would become an RLS-*approved* write, widening
everything `is_own_player`-adjacent with it. Column GRANTs cannot help (they attach to the
ROLE, and coaches and parents are both `authenticated`), and no policy can express
"unchanged except photo_path" — USING sees the old row, WITH CHECK the new one, nothing sees
both. Hence a SECURITY DEFINER function with a hard-coded column list.

That function has **two** guards, and the second is not decoration: you own the player, AND
the key lives in that player's own folder. Without the second, an owner could point
`photo_path` at another player's object and read it back through the signed-URL route.

`MyPlayerForm` is a separate screen, not a restricted mode on `PlayerForm`. The
club-controlled fields do not exist in the component, so there is no path — not disabled,
not hidden — through which they could be written. That is convenience; the database is the
boundary.

**Verified with simulated JWTs as a real parent:** own contact/parents/photo allowed; rename
own child 0 rows; move own child's squad 0 rows; another player's contact 0 rows; parent row
for another player refused; the RPC refused for a non-owned player and for a foreign folder
key.

### Migration `calendar_feed` (4 Aug 2026)

File: `db/migrations/20260804_calendar_feed.sql`, plus `supabase/functions/calendar`
(deployed with **verify_jwt off**).

**A calendar client cannot sign in.** It fetches a URL on a timer with no cookies, no
Authorization header and no way to refresh. **The URL is the credential.** Everything follows:
the token is a random uuid (not the profile id — a feed keyed on anything enumerable is no
protection), one per person, revocable, and the feed returns only what that person can
already see. Reset DELETEs and re-inserts, so the old token dies the instant the new one
exists — no grace period, because that is how a revoked link keeps working.

**The Edge Function holds the ANON key only** and could not read a fixture on its own. All
authorisation is in `public.calendar_events_for_token()`, which is a **line-by-line mirror of
`private.can_see_team`** with the profile resolved from the token instead of `auth.uid()`.
**If `can_see_team` changes, that function must change with it.** The duplication is the price
of a caller with no JWT; reimplementing scoping in TypeScript would put it somewhere nothing
tests.

An unknown token returns **zero rows, not an error** — distinguishing "no such token" from
"token with no fixtures" is an oracle for guessing tokens. So a bad token yields an empty
calendar with a 200, deliberately.

**ICS details that bite:** folding is 75 **octets** not characters (counting characters splits
UTF-8 mid-sequence); backslash/semicolon/comma are structural and must be escaped or a venue
like "Zayed Sports City, Abu Dhabi" truncates silently; CRLF is required or strict clients
reject the whole calendar; UIDs must be stable or every refresh duplicates every event.

The token is minted **lazily**, only when someone opens the sheet — minting on Schedule render
would create a live bearer credential for every member who never wanted one.

### Migration `access_requests` — the signup approval gate (4 Aug 2026)

File: `db/migrations/20260804_access_requests.sql`. Adds `public.access_requests` and
`private.is_admin_anywhere()`.

**READ THIS BEFORE PROPOSING "just close signup".** Signup cannot simply be turned off.
Invites are accepted at `/accept-invite/:token`, which sits behind `RequireAuth` — the
invitee must already have a session to accept one. Flipping Supabase's "allow new users to
sign up" would therefore kill the invite flow for **every new member**, not just for
strangers. Closing signup at the auth layer needs admin-side user creation through a
service-role Edge Function, which is a separate build. The gate is approval, not exclusion.

**What actually protects club data is unchanged**, and it is not this feature: an account
with no membership reads ZERO rows from every table, because every SELECT policy bottoms
out in a memberships row for `auth.uid()`. What was missing was the admin's side. The
"Waiting for access" list is derived by SUBTRACTION (every profile an admin can read, minus
everyone who already has a membership), so every stranger who ever signed in sat in it
permanently, indistinguishable from a real member mid-invite, with no way to clear them.

**Shape.** One row per profile (`profile_id` is UNIQUE), `status` in
`('pending','dismissed')`. There is deliberately **no 'granted' status** — granted access
*is* a memberships row, and the screen already subtracts members out; a second record of the
same fact would only give the two a way to disagree.

**The anti-spam mechanism is an ABSENCE.** The owner gets a SELECT policy and an INSERT
policy and nothing else — no UPDATE, no DELETE. Combined with the UNIQUE key, a dismissed
person cannot flip their own row back to `pending`, cannot delete it and try again, and
cannot insert a second one. Re-opening the door is an admin action. If you ever add an
owner-side UPDATE policy "for convenience", you have removed the gate.

The `status = 'pending'` clause in the insert policy's WITH CHECK is load-bearing for the
same reason: any status value a client can send is a value it can choose.

**Verified server-side with simulated JWTs** (not the MCP service role, whose `auth.uid()`
is null and makes every negative test look green): a dismissed owner's UPDATE and DELETE
both affect 0 rows while they can still read their own row; inserting for another profile
and self-inserting `status='dismissed'` are both refused outright; a second request hits the
unique key; a non-admin sees exactly one row and an admin sees all of them.

**`private.is_admin_anywhere()` is club-blind on purpose** — a requester has no club, so
they cannot put a `club_id` on their own row and the admin policies cannot be club-scoped.
Same single-club assumption as `can_admin_see_pending`; if a second club is ever added,
those two need revisiting together.

**Restore DELETES the row** rather than setting it back to `pending`. A reversed dismissal
did not turn into a request the person made; marking it pending would invent one and then be
indistinguishable from the real thing.

**Both admin-side reads fail OPEN.** A failed `listAccessRequests()` costs the notes and the
dismissals, not the screen — everyone reappears in the waiting list. Noisier is the correct
direction to fail; hiding someone genuinely waiting is not.

### Migration `player_parents` + head-shot photos (applied 3 Aug, shipped 4 Aug 2026)

File: `db/migrations/20260803_player_parents_and_photos.sql`. Adds `public.player_parents`,
`public.players.photo_path`, and a **private** storage bucket `player-photos` (5 MB cap,
`image/jpeg|png|webp` only) with two policies on `storage.objects` driven by two new
helpers, `private.photo_player(text)` and `private.photo_team(text)`.

**RLS shape.** `player_parents` mirrors `player_contacts` byte for byte — read =
`can_edit_team(player's team)` OR `is_own_player`, edit = `can_edit_team` only. Parent
details are the same class of safeguarding-sensitive data, so they get the same boundary
rather than a second one to reason about. A parent sees their own child's parent rows and
nobody else's. **Photo read is deliberately looser** — `can_see_team`, i.e. squad-wide,
matching `players`' own read policy, because the photo sits beside a name that audience can
already see. Jay approved that explicitly. Tightening it is a documented one-line swap; the
exact change is written out in the migration and in `db/schema/policies.sql`.

**The object key format is load-bearing security, not a naming convention.**
`<player_id>/<timestamp>.<ext>` — the storage policies parse the first path segment as the
player id to find the squad. Change the key format and you silently change who can read
photos. The uuid regex guard in `photo_player` matters too: `'not-a-uuid'::uuid` *raises*
rather than returning null, and inside a policy that surfaces an error on every unrelated
storage operation.

**Product rulings Jay locked in — fixed decisions, not defaults:**

- Relationship dropdown is a **fixed** list: Mother, Father, Step-mother, Step-father,
  Aunt, Uncle, Grandmother, Grandfather, Guardian. No free text, no additions. The
  database column is plain `text` on purpose so widening the list stays a UI change.
- "At least one parent" **warns, never blocks**. ~159 existing players have no parent rows;
  a hard rule would make every one of them unsaveable and break the bulk importer.
- Own contact fields (email/phone on the player) only for **U13+** —
  `src/lib/ageGroup.js`, `OWN_CONTACT_MIN_AGE = 13`. Senior sides count as adult. It
  **fails closed** on a missing/unparseable squad name.
- Phones stored **E.164**, default country AE, formatted nationally on display.
  Deliberately *not* formatted as-you-type — that reintroduced a caret-jump bug.
- Photos are client-resized to a 600px square JPEG at q0.82 before upload (~4 MB → ~40 KB).
  Signed URLs are cached for the session and **cleared on `signOut`**.

New runtime deps: `flag-icons@7`, `libphonenumber-js@1`.

**`saveParents` is delete-then-write, not atomic.** A failure between the two leaves the
player with no parent rows. Acceptable today (single-editor, low frequency); if it ever
matters, move it into a Postgres function.

### Migration `admin_can_see_pending_profiles` (3 Aug 2026)

`private.can_admin_see_pending(_profile uuid)` + policy `profile read pending`, so an
admin can see people who signed up but hold **no membership**. Without it they are
invisible: the Accounts screen lists memberships, and `profile read club admin` only
exposes people who already share a club with you.

**Signing up does not grant access, and nothing used to tell you it happened.** Magic-link
signup writes `auth.users` + `profiles` (via trigger) but no membership; only
`accept_invite` writes one. Public signup is open, so anyone with the URL can create a
login. They read zero rows from every table — every SELECT policy requires a membership —
so it is contained, but **close signup or add approval before pointing
abudhabiquins.com at the app**.

Both lookups in the helper are `security definer` on purpose: under the caller's own RLS
an admin only sees memberships in their own club, so a profile belonging solely to another
club would read as "unattached" and leak.

**Verify RLS by simulating a real JWT, not via the MCP service role** — service role has a
null `auth.uid()`, so every `auth.uid()`-based policy returns false and the result *looks*
like a clean negative test while proving nothing:

```sql
begin;
select set_config('request.jwt.claims','{"sub":"<user-uuid>","role":"authenticated"}',true);
set local role authenticated;
select count(*) from public.profiles;   -- or whatever you're checking
rollback;
```

Verified this way: admin sees 3 profiles, a genuine coach sees 1, an unattached signup
sees 1. (The coach case first read 3 — because that account turned out to be a *second
admin*. Check what a test account actually is before trusting a negative result.)

**Two admins currently exist.** `jayjmuir@yahoo.com` holds `admin`/`team_id` null even
though its invite was for `coach` on a team. `accept_invite` is correct (it inserts the
invite's own role verbatim — read in full to confirm), so that row was altered afterwards,
almost certainly by running `claude/runbooks/first-admin.md`'s bootstrap SQL against it. If that
account was meant to be a coach test account, it is not testing what you think.

### Migration `profiles_email_and_admin_access` (3 Aug 2026)

Applied while building the Accounts screen. It also fixed a **live latent bug**: `profiles`
RLS was own-row-only (`profile read own` = `id = auth.uid()`) with **no admin policy**, so
`listClubMembers()`'s `profiles(full_name)` embed returned `null` for every member except
the caller. `Admin.jsx`'s `?? 'Unnamed member'` fallback disguised it completely — the
member list had been showing "Unnamed member" for everybody.

- `profiles.email text` added and backfilled from `auth.users`. Client code can now
  identify members; `auth.users` itself stays unreachable from the browser by design, and
  no service-role key goes near the frontend.
- `private.handle_new_user()` now populates `email` on signup; new
  `private.handle_user_email_change()` + `on_auth_user_email_updated` trigger keeps it in
  sync if a user later changes their login email.
- `private.shares_admin_club(_profile uuid)` — `security definer` specifically so its
  `memberships` lookup is not itself subject to `memberships` RLS (which would recurse).
  Execute granted to `authenticated` only.
- New permissive policies `profile read club admin` (SELECT) and `profile update club
  admin` (UPDATE). They OR with the existing own-row policies.

**`profiles.email` is read-only from the app.** It mirrors `auth.users`; writing it would
desync the address people actually log in with. Password resets stay self-serve — an admin
cannot reset another user's password from the client (that needs the service role).

**`memberships` still has no unique constraint** on `(profile_id, club_id, role)` — only a
PK on a fresh uuid. Duplicate rows for one person are possible (one was created once by an
`ON CONFLICT DO NOTHING`, see above), which is why the Accounts screen groups by
`profile_id` instead of rendering one row per membership.

### Database schema changes (Task 18 — the first migration this build has applied)

`public.invites`: `id`, `club_id`, `email`, `role` (same check as `memberships`: admin/coach/
parent/player), `team_id` (nullable, but `invites_team_required_unless_admin` requires it
NOT NULL unless `role='admin'`), `player_id` (nullable, links to an existing player — most
commonly a parent naming their child), `token uuid default gen_random_uuid()` (never generate
this client-side — read it back from the insert), `created_by`, `created_at`, `accepted_at`.
RLS: `invites manage` (ALL, `is_admin(club_id)`) + `invites read own` (SELECT,
`lower(email) = lower(auth.jwt()->>'email')` — the invitee's own verified login email, never
a client-supplied value). `accept_invite(token uuid)`: `SECURITY DEFINER`, verifies the token
exists, isn't already accepted, and the caller's authenticated email matches (row-locked
`for update` against a concurrent double-accept), inserts the `memberships` row, stamps
`accepted_at`, returns the new membership row. Call it via
`supabase.rpc('accept_invite', { _token: token })` — the parameter name is `_token`, not
`token`.

**Gotcha worth remembering for any future `SECURITY DEFINER` function (Task 21 will likely
add more):** Supabase's default privileges auto-grant `EXECUTE` on every new public-schema
function to both `anon` and `authenticated`, regardless of an explicit
`REVOKE ALL ... FROM PUBLIC` — that only revokes the `PUBLIC` pseudo-role's implicit grant,
not each real role's own default-privilege grant. `get_advisors` (security) surfaces this
immediately after applying a migration. Since `accept_invite` performs a real write (unlike
this schema's existing read-only `SECURITY DEFINER` helpers — `is_admin`, `can_edit_team`,
`can_see_team`, `is_own_player` — which are harmless booleans left broadly grantable), it
needed an explicit follow-up `REVOKE EXECUTE ON FUNCTION public.accept_invite(uuid) FROM anon`
— verified afterward via `information_schema.role_routine_grants` that only
`authenticated`/`service_role`/`postgres` can call it.

This is also the **first migration Supabase's own migration history has ever tracked** for
this project — `list_migrations` returned empty before this (the original schema was applied
as raw SQL outside that tracking system at some point before this repo's current build began).

### Database schema changes (Task 21 — RLS helpers moved to a `private` schema)

Two migrations, both controller-applied directly:

1. `move_rls_helpers_to_private_schema` — created `schema private` (`revoke all on schema
   private from public, anon, authenticated; grant usage ... to authenticated` — `anon` has no
   `USAGE` on the schema itself, though this doesn't matter for RLS evaluation, only for
   direct `schema.function()` calls, which `anon` never makes). Recreated `is_admin(_club)`,
   `can_see_team(_team)`, `can_edit_team(_team)`, `is_own_player(_player)` (all `STABLE
   SECURITY DEFINER`, `SET search_path = 'public'`) and `handle_new_user()` (`SECURITY
   DEFINER`, same search_path) in `private`, with bodies byte-identical to their old `public`
   versions. Re-pointed the `on_auth_user_created` trigger to `private.handle_new_user()`.
   Dropped and recreated all 14 policies that referenced the old functions (`teams.team
   manage`; `memberships.memb manage`+`memb read`; `invites.invites manage`; `players.player
   edit`+`player read`; `player_contacts.contact edit`+`contact read`; `events.event
   edit`+`event read`; `availability.avail coach manage`+`avail own insert`+`avail own
   update`+`avail read`) to call `private.*` instead of `public.*`, then dropped the 5 old
   `public` functions.
2. `restore_anon_execute_on_rls_helpers` — same-session fix-up: `grant execute on function
   private.is_admin/can_see_team/can_edit_team/is_own_player(uuid) to anon` (restores
   pre-migration behaviour — see the regression writeup above). `handle_new_user` intentionally
   has no `anon`/`authenticated` grant either before or after — it is only ever invoked by the
   trigger, which runs as the function owner regardless of the firing role's own grants.

`accept_invite(uuid)` is unchanged by this task — still in `public`, still `SECURITY DEFINER`,
still `authenticated`+`service_role` only (no `anon`), per the Task 18 gotcha fix.

**Net effect:** `GET /rest/v1/teams|players|player_contacts|events|availability|memberships`
behave identically for every role, before and after. `POST /rest/v1/rpc/is_admin` (and the
other three) now 404 — PostgREST can no longer find them anywhere in its exposed schema
cache — where before this task they were live, callable endpoints (the advisor's original
"anon/authenticated can execute via RPC" warning). `accept_invite` remains the one function
genuinely reachable via RPC, exactly as intended.
