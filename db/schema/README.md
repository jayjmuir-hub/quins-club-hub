# `db/schema/` — a capture of the live database

These four `.sql` files are a **snapshot of what is actually in the Supabase database
right now**. They are *not* a migration runner, *not* an ORM schema, and *not* the thing
that creates the database.

**Do not run these files against anything.** They are written to be read and diffed.
Several of them would not even apply cleanly (they contain `CREATE TABLE` for tables
that already exist, and grants recorded as-found).

Captured from Supabase project `lusmshimxdcxpnrktlgz` (`quins-club-hub`), Postgres 17,
on **2026-08-03**, re-captured **2026-08-04** after
`db/migrations/20260803_player_parents_and_photos.sql`, and again the same day after
`db/migrations/20260804_access_requests.sql` and
`db/migrations/20260804_self_service_profile.sql`.

> **The 4 Aug re-capture was late, and that is the lesson.** The migration shipped on
> 3 Aug and these files were not re-captured with it, so for a day the repo's "snapshot of
> the live database" was missing an entire table, a column, four policies and two
> functions — and `git diff` had nothing to say about any of it. It also hid a real drift:
> `private.photo_player` had its `search_path` pinned live but not in the migration file,
> so re-applying the committed migration would have un-pinned it. Step 2 below is not
> optional bookkeeping; it is the only thing that makes step 3 mean anything.

| File | Contents |
|---|---|
| `tables.sql` | Every `public` table: columns, types, nullability, defaults, PKs, FKs, CHECKs, indexes, and RLS-enabled state. Includes explicit notes where an expected unique constraint is **absent**. |
| `policies.sql` | Every RLS policy on every `public` table, **plus the two on `storage.objects` for the `player-photos` bucket**, with command and USING / WITH CHECK expressions. |
| `functions.sql` | Full `pg_get_functiondef()` output for all 15 functions in `public` and `private`, plus their EXECUTE grants from `proacl`. |
| `triggers.sql` | The two triggers on `auth.users`. (There are none on any `public` table.) |

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
