# `db/schema/` — a capture of the live database

These five `.sql` files are a **snapshot of what is actually in the Supabase database
right now**. They are *not* a migration runner, *not* an ORM schema, and *not* the thing
that creates the database.

**Do not run these files against anything.** They are written to be read and diffed.
Several of them would not even apply cleanly (they contain `CREATE TABLE` for tables
that already exist, and grants recorded as-found).

Captured from Supabase project `lusmshimxdcxpnrktlgz` (`quins-club-hub`), Postgres 17,
on **2026-08-03**, **re-captured 2026-08-07**, **re-captured 2026-08-09** (see below),
and before that
**2026-08-04** after
`db/migrations/20260803_player_parents_and_photos.sql`, and again the same day after
`db/migrations/20260804_access_requests.sql` and
`db/migrations/20260804_self_service_profile.sql`, and
`db/migrations/20260804_calendar_feed.sql`.

> ## ⚠️ It happened again, worse, and was caught on 7 Aug 2026
>
> These files went from **4 Aug to 7 Aug** — three days and roughly **14
> migrations** — with no re-capture. The 7 Aug re-capture had to absorb: four
> new functions, two changed function bodies, eight new columns, two new
> indexes, a widened CHECK constraint, two dropped policies and a new trigger.
>
> **Nothing unintended was found** — every delta traced to a known migration.
> But that is luck, not process: a single unintended change hidden in a delta
> that size would not have been spotted, and finding one is the entire purpose
> of this directory. **The diff is only useful while it is small enough to
> read.** Re-capture with the migration, not three days later.
>
> The one that would have been easiest to miss: `tables.sql` carried a block
> headed **"DELIBERATE ABSENCE OF A UNIQUE CONSTRAINT"** on `memberships` —
> and a unique index had been added on 6 Aug. The file was asserting the
> opposite of the truth about a constraint that governs duplicate access rows.
>
> **The 4 Aug re-capture was late, and that is the lesson.** The migration shipped on
> 3 Aug and these files were not re-captured with it, so for a day the repo's "snapshot of
> the live database" was missing an entire table, a column, four policies and two
> functions — and `git diff` had nothing to say about any of it. It also hid a real drift:
> `private.photo_player` had its `search_path` pinned live but not in the migration file,
> so re-applying the committed migration would have un-pinned it. Step 2 below is not
> optional bookkeeping; it is the only thing that makes step 3 mean anything.

> ## ⚠️ And the 7 Aug capture itself was not clean — found 9 Aug 2026
>
> The 7 Aug entry above ends "**Nothing unintended was found**". Re-capturing on
> 9 Aug found **two objects the 7 Aug pass had missed**, both live since 5 Aug:
>
> - **`events_group_id_idx`** — a partial index created by
>   `20260805150621 events_pitch_and_group_id`. The 7 Aug header mentioned the
>   column and wrote down only the *other* index. It sat live for four days with
>   no line in the file.
> - **`invites_role_check` was asserting the wrong thing.** The file listed four
>   roles; live has had six since `20260805160320 roles_manager_and_medic`, which
>   widened *both* role CHECKs. The 7 Aug capture fixed `memberships_role_check`
>   and left this one wrong.
>
> Plus five `proacl` lines in `functions.sql` that did not match live — two
> traceable to a 6 Aug migration the 7 Aug capture recorded wrongly, and three
> (`my_calendar_token`, `reset_my_calendar_token`, `set_own_player_photo`) not
> attributable to any migration at all. **Postgres keeps no timestamp for a
> GRANT**, so "the file was always wrong" and "someone granted these outside a
> migration" cannot be told apart from the catalogue. They are recorded in
> `functions.sql` as judgement, not fact.
>
> **This is what "the diff is only useful while it is small enough to read"
> costs when it is ignored.** The 7 Aug conclusion was reached from a delta
> already too big to read, and it was wrong. The 9 Aug delta was nine
> migrations across two days — smaller, and it still took three passes to
> reconcile.
>
> ✅ **`db/schema/` DID NOT CAPTURE GRANTS ON TABLES OR COLUMNS — CLOSED
> 10 Aug 2026.** This warning read, correctly, that the larger half of
> `20260808191310 profile_phone_and_column_grants` is a column-level
> `REVOKE`/`GRANT` on `profiles` — the thing standing between a member and
> rewriting someone's login email — and that **nothing in this directory would
> diff it**. `grants.sql` now captures table grants, column grants and the
> DEFAULT privileges, so a re-capture diffs them like anything else.
>
> ⚠️ **Kept rather than deleted, and repointed** (`CLAUDE.md` rule 7). Two of
> the things it warned about are still true and now live in `grants.sql`:
> Postgres keeps **no timestamp for a GRANT**, so an unintended one cannot be
> dated or attributed after the fact and a committed snapshot is the only
> mechanism that answers "did this change"; and reading `policies.sql` alone
> still tells you nothing about the five-column ceiling on `profile update own`.
>
> Two things now check it. `scripts/docs-check.mjs` fails the build when a
> migration grants on a TABLE that `grants.sql` does not name — the exact
> omission that happened here, and the only half of the problem visible from the
> filesystem. `db/tests/grants.sql` asserts the invariant against live and
> injects the fault to prove it can fail. ⚠️ **Neither can see live from CI**
> — this repo is public, so there are no credentials — which is why re-capturing
> with the migration still matters.
>
> `is_attached_to_team_grants` was named here too and is a FUNCTION grant:
> those are captured as `proacl` lines in `functions.sql`, and are deliberately
> not duplicated into `grants.sql`.
>
> ⚠️ **`apply_migration` STRIPS `--` COMMENTS before executing.** Not one
> migration row since 8 Aug contains any comment text from its committed `.sql`.
> So a function's WHY lives in the migration file and never in the database, and
> a re-capture cannot bring it back — which is why several function bodies here
> are bare while their migrations are heavily commented.
>
> ## ⚠️ Re-captured AGAIN the same day — `scale_indexes_and_availability_policy_merge`
>
> Four indexes and a policy merge on `availability`, applied 9 Aug after Jay
> put a number on the club's growth: **600-700 players, possibly double that
> in parent accounts**. Reasoning is in the migration header; the evidence is
> `db/tests/rls-availability-equivalence.sql`.
>
> ⚠️ **The policy COUNT on `availability` did not change — four before, four
> after — while the entire set was replaced.** Anything reconciling this
> directory by counting objects would call the file clean. **Compare
> expressions, not counts.**

> ## ✅ Reconciled against live 2026-08-10 — ZERO DRIFT
>
> **Not a re-capture.** Nothing had changed, so nothing was rewritten. This entry
> exists so the last-known-good date moves forward without the files being
> touched — a reconciliation that finds nothing is still a result, and leaving no
> record of it is how the next reader ends up re-doing it.
>
> Compared live against these files:
>
> | Checked | Result |
> |---|---|
> | 35 policies (33 `public` + 2 on `storage.objects`) | identical — **expressions**, not counts |
> | 29 function bodies | identical (live `md5(pg_get_functiondef())` vs the blocks in this directory) |
> | 29 functions' `prosecdef` and `proconfig` | identical |
> | 4 triggers | identical |
> | 25 constraints + 27 indexes | identical |
> | 13 tables, row security on, none forced | identical |
> | `player-photos` bucket settings | identical |
>
> ⚠️ **`public.accept_invite` STILL CARRIES ITS INCOMPLETE-INVITE GUARD.** Both
> giveaways named at the bottom of this file are live: the comment
> `-- Replaces the dropped invites_team_required_unless_admin CHECK.` and the
> `raise exception 'This invite is incomplete …'` block. That is the regression
> this whole directory exists to catch, and it has not recurred.
>
> Both objects the 7 Aug capture missed are correctly recorded now:
> `events_group_id_idx` is present, and `invites_role_check` lists all six roles.
>
> ⚠️ **STILL NOT COVERED, AND A RE-CAPTURE NEVER WOULD BE:** column- and
> table-level GRANTs. The blind spot recorded above is unchanged — the thing
> standing between a member and rewriting `profiles.email` is a column grant, and
> nothing in this directory diffs it. A clean reconciliation here is **not**
> evidence that grants are unchanged.
>
> Supabase's own security linter was run alongside. Three WARNs, **all three
> already recorded in this repo**, none new: `private.squad_expects_gender`'s
> unpinned `search_path` (recorded in `db/schema/functions.sql`), the
> SECURITY DEFINER functions carrying an `anon` EXECUTE grant (recorded there
> too, with the fails-closed reasoning for each), and leaked-password protection
> being off — which `claude/decisions/2026-08-06-roster-auto-onboarding.md`
> already settled as a paid-plan feature on a free org.
>
> ⚠️ **THAT LAST ONE STOPPED BEING SETTLED ON 13 Aug 2026.** The org is on
> **Pro** (measured: `get_organization` → `plan: "pro"`), so the plan is no
> longer the reason and the WARN is no longer explained by anything. It is
> simply a toggle nobody has turned on — Supabase → Authentication → Policies.
> **A "recorded, not a finding" note survives only as long as its reason does.**

> ## ⚠️ Re-captured 2026-08-11 — and the 10 Aug "ZERO DRIFT" entry above went
> ## out of date the SAME DAY it was written
>
> The reconciliation above was run on 10 Aug and was correct when run. Migration
> `20260810183058 super_admin_and_rights` was applied **later that day**, and
> three more followed on 11 Aug. `claude/state-of-play.md` went on quoting
> "reconciled against live — zero drift" for two days, which is how a
> reconciliation entry becomes a liability rather than a record: **it is a
> measurement, and it rots like every other one.** The date is the important
> half of it, not the verdict.
>
> Found live with no entry in this directory at all:
>
> | Object | Live since | File |
> |---|---|---|
> | `private.is_super_admin()` | 10 Aug | `functions.sql` |
> | `public.set_admin_rights(uuid,bool,text[])` | 10 Aug | `functions.sql` |
> | `"memb no self promotion"` policy | 10 Aug | `policies.sql` |
> | `memberships.is_super`, `memberships.admin_rights` | 10 Aug | `tables.sql` |
> | `private.notify_pitch_request()` | 11 Aug | `functions.sql` |
> | `notify_pitch_request_asked` / `_answered` triggers | 11 Aug | `triggers.sql` |
> | `teams.self_registration_allowed` | 11 Aug | `tables.sql` |
>
> And three things that were worse than absent, because each was a **standing
> claim that had inverted**:
>
> - **`policies.sql` said "Every policy is PERMISSIVE".** `"memb no self
>   promotion"` is RESTRICTIVE — the only one in the schema. A permissive set
>   can only ever be widened by adding to it; a restrictive policy is ANDed with
>   everything and takes rows away. Anyone reasoning from that sentence about
>   what an admin may write to `memberships` would have reached the wrong answer.
> - **`policies.sql` listed thirteen tables as RLS-enabled; live has sixteen.**
>   `attendance`, `pitches` and `pitch_requests` were absent from the list. All
>   three do have RLS on — but this list is the only place in the repo that
>   would show a table created *without* it, and Supabase's default privileges
>   hand `anon` full rights on any new `public` table, so that is not a cosmetic
>   gap.
> - **`functions.sql` described `register_my_player(text, uuid, text)`**, a
>   signature the 11 Aug migration DROPS. The live 4-argument version — carrying
>   the argument that decides whether a registrant becomes a `player` or a
>   `parent` — appeared nowhere, so a diff would have shown the self-registration
>   guard missing with no way to tell "never captured" from "reverted".
>
> ⚠️ **And `pitches` / `pitch_requests` in `tables.sql` were not a capture at
> all — they were the migrations' own DDL pasted in.** `CREATE TABLE IF NOT
> EXISTS`, inline unnamed `UNIQUE` and `CHECK`. Live names both
> (`pitches_club_id_name_key`, `pitch_requests_status_check`) and neither string
> existed in this directory, so dropping or renaming either would have diffed to
> nothing. **Pasting the migration produces a file that looks complete.** The
> "keep the output faithful, do not tidy the SQL" line in *How to regenerate*
> below is about precisely this.
>
> ⚠️ **One live/repo difference is recorded rather than reconciled.** The body of
> `public.register_my_player` in the database carries a *shorter* version of its
> 0A000 comment than `db/migrations/20260811_self_registration.sql` does, and
> lacks two of that file's comments entirely. Every executable statement is
> identical. This is **not** the `apply_migration` comment-stripping described
> further down — comments inside a dollar-quoted body do survive. Something
> shorter was applied and a fuller file was then committed. The consequence
> worth knowing: **re-applying that committed file would rewrite the live body**,
> and the next capture would show a diff nobody intended.
>
> **How the gaps were found, because the method is reusable and cheap:** dump the
> live inventory (`pg_proc`, `pg_policies`, `pg_constraint`, `pg_indexes`,
> `information_schema.columns`) and check every name appears somewhere in the
> corresponding file. It is a name-level check, not a body-level one, so it
> catches *missing* and *extra* objects and will not catch a changed expression
> — but every gap listed above was a missing object, and none of them needed a
> body diff to find. ⚠️ **Include a control name that must NOT be found**: the
> first run of this check reported `register_my_player` absent from a file
> containing twenty occurrences of it, because PowerShell's formatter silently
> drops objects after the first shape in a mixed pipeline. An empty result and a
> suppressed one look identical.

| File | Contents |
|---|---|
| `tables.sql` | Every `public` table: columns, types, nullability, defaults, PKs, FKs, CHECKs, indexes, and RLS-enabled state. Includes explicit notes where an expected unique constraint is **absent**. |
| `policies.sql` | Every RLS policy on every `public` table, **plus the two on `storage.objects` for the `player-photos` bucket**, with command and USING / WITH CHECK expressions. |
| `functions.sql` | Full `pg_get_functiondef()` output for every function in `public` and `private`, plus their EXECUTE grants from `proacl`. ⚠️ This row said "all 22 functions" until 9 Aug, when the count went to 29. **A count in a table of contents is a thing that rots** — the file itself is the inventory. |
| `triggers.sql` | Every trigger: two on `auth.users`, `profiles_sync_name` on `public.profiles` (6 Aug 2026), `notify_pending_membership` on `public.memberships` (9 Aug 2026 — the first trigger in this project that reaches OUTSIDE the database), and `notify_pitch_request_asked` / `notify_pitch_request_answered` on `public.pitch_requests` (11 Aug 2026 — the second and third that do). ⚠️ This row said "there are none on any `public` table" until 7 Aug, "the three triggers" until 9 Aug, and named four until 11 Aug. **A trigger is the easiest object here to leave uncaptured: nothing in the app names it, and the code that fires it is an ordinary INSERT.** |

## Why this directory exists

Until now the schema existed in exactly two places: inside Supabase, and as prose in
`RESTORE.md`. Prose does not diff.

On 2026-08-03 an older migration named `accept_invite_multi_target` was re-applied and
**silently reverted a security guard inside `public.accept_invite`** — the check that
rejects an incomplete invite (a non-admin invite with no `invite_targets` rows and no
`team_id`). It happened repeatedly before anyone noticed, because there was no file in the
repo to compare the live function against. `git diff` had nothing to say about a database.

With these files checked in, that class of regression becomes a visible diff: re-capture,
and if `functions.sql` changes when you didn't intend a schema change, something drifted.

## Supabase migrations are still the mechanism for change

Nothing about this directory changes how the schema is modified. Schema changes are still
made by applying a Supabase migration. The workflow is:

1. Apply the migration (via the Supabase MCP / CLI / dashboard) as normal.
2. Re-capture into `db/schema/` (below).
3. Commit the migration *and* the re-captured files together, so the review shows both the
   intent and the resulting state.

If step 2 produces changes you did not expect, stop — that is drift or an accidental
revert, which is exactly what this directory is here to surface.

## How to regenerate

Everything here came from read-only catalogue queries. Run them against the live project
and rewrite the files from the results — keep the output faithful, do not tidy the SQL,
do not invent objects, and record anything that looks wrong as a comment rather than
fixing it in the file.

```sql
-- tables.sql
SELECT table_name, ordinal_position, column_name, data_type, udt_name,
       is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
ORDER BY table_name, ordinal_position;

SELECT rel.relname AS table_name, con.conname, con.contype,
       pg_get_constraintdef(con.oid) AS def
FROM pg_constraint con
JOIN pg_class rel ON rel.oid = con.conrelid
JOIN pg_namespace n ON n.oid = rel.relnamespace
WHERE n.nspname = 'public'
ORDER BY rel.relname, con.contype, con.conname;

SELECT schemaname, tablename, indexname, indexdef
FROM pg_indexes WHERE schemaname IN ('public', 'private') ORDER BY tablename, indexname;

SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity, obj_description(c.oid)
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind IN ('r','p','v','m');

-- policies.sql
-- NOTE: 'public' alone is NOT enough. The player-photos bucket's policies live on
-- storage.objects, in the `storage` schema — captured since 2026-08-04.
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
   OR (schemaname = 'storage' AND tablename = 'objects')
ORDER BY schemaname, tablename, cmd, policyname;

-- ...and the bucket's own settings, which are a row in storage.buckets, not a policy:
SELECT id, public, file_size_limit, allowed_mime_types FROM storage.buckets;

-- functions.sql
SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid),
       p.prosecdef, p.provolatile, p.proconfig, p.proacl::text,
       pg_get_functiondef(p.oid)
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname IN ('public', 'private') ORDER BY n.nspname, p.proname;

SELECT nspname, nspacl::text FROM pg_namespace WHERE nspname IN ('public', 'private');

-- triggers.sql
SELECT n.nspname, c.relname, t.tgname, t.tgenabled, pg_get_triggerdef(t.oid)
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE NOT t.tgisinternal AND n.nspname IN ('public', 'auth', 'private')
ORDER BY n.nspname, c.relname, t.tgname;
```

All of the above are `SELECT`s. Capturing the schema requires **no writes of any kind**.

## ⚠️ Warning: `supabase_migrations.schema_migrations` is polluted

Do not trust the migration history table as a record of intent. As captured, it contains
30 rows, of which:

- **12 rows are named `accept_invite_multi_target`** (versions `20260803140637` through
  `20260803150330`). **All of them are stale.** They are re-applications of an older
  definition of `public.accept_invite` that is missing the incomplete-invite guard. Every
  one of them, if applied, reverts the function. Never re-run one.
- **8 rows are named `zzz_accept_invite_authoritative_do_not_overwrite`** (versions
  `20260803145729` through `20260803150349`), each one a repair applied after one of the
  above clobbered the function.

The **authoritative** definition is the one with the **highest version number**:

```
20260803150349  zzz_accept_invite_authoritative_do_not_overwrite
```

The `zzz_` prefix is deliberate — it sorts last in a name-ordered listing so that a tool
or a human picking "the last one" by name lands on the correct definition rather than on
one of the stale `accept_invite_multi_target` rows.

What is currently live in the database matches that authoritative version, and
`functions.sql` in this directory is the capture of it. If you ever need to know whether
`accept_invite` is intact, diff the live `pg_get_functiondef()` against `functions.sql` —
the giveaway is the presence of the comment
`-- Replaces the dropped invites_team_required_unless_admin CHECK.` and the
`raise exception 'This invite is incomplete ...'` block. If those are gone, an old
migration has been re-applied.

(An earlier note put the count at 11 stale rows; the live table shows 12. The count is
recorded here as found.)
