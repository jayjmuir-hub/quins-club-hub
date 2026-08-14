# Session — 14 Aug 2026 — the two cheap migrations, applied

**History, not instruction.** This describes a moment. For current state read
`claude/state-of-play.md`; for what is true about the codebase read `RESTORE.md`.

Started from `main` at `46102ad`, cafnet, clean. Ended at the merge of #122.

## What shipped

| PR | What |
|---|---|
| #101 | The restore-drill tabling, rebased and slimmed after going conflicting |
| #120 | `anon` table-privilege revoke — migration + `db/tests/anon-table-grants.sql` |
| #121 | RLS `auth.*` wrap — migration + `db/tests/rls-initplan.sql` |
| #122 | The record of applying both, with the measurements |

**Both migrations were applied to production**, by Jay pasting them into the
Supabase SQL editor as one `begin; … commit;`.

Measured after, not assumed: `anon` holds SELECT/INSERT/UPDATE/DELETE on **0 of
24** tables; `authenticated` and `service_role` still hold all 24; policies 60
→ 60; bare `auth.*` calls **18 → 0**; the `auth_rls_initplan` lint **18 → 0**.
`/calendar.ics` with a bogus token returned 200 with
`content-type: text/calendar; charset=utf-8`.

**No Netlify deploy ran across four merges** — production stayed on deploy
`6a7efb855982f00008027bf9`, commit `46102ad`. Confirmed by the deploy id not
moving, not by the gate's prediction.

## ⚠️ Traps, in the order they will bite the next session

**1. Claude cannot apply a migration here.** Both `execute_sql` and
`apply_migration` were refused by the permission layer. Hand the SQL over as a
single paste and verify with reads afterwards, which are not blocked. **Do not
plan a migration session around Claude applying it.**

**2. `docs:check` and CI disagree by design, and `CLAUDE.md` was wrong about
why.** Corrected in the same commit as this file — see the `docs:check` section
there. Short version: the range is `BASELINE..HEAD~1`, and on a `pull_request`
run `HEAD~1` is the base branch tip, so **every** branch commit is outside it,
not merely the last.

**3. Merging several PRs back-to-back turns `main` red.** Each squash SHA is
uncited when it lands, and the next merge pushes it out of the one-behind
allowance. **Rebase between merges and cite the previous squash SHA**, which is
what was done for #101 → #120 → #121 → #122. It costs a rebase each time and it
is the only way `main` stays green.

**4. `npm run db:check` still cannot run anywhere.** Neither PC holds
`SUPABASE_DB_URL` — measured, both `.env` files carry only `VITE_SUPABASE_URL`
and `VITE_SUPABASE_ANON_KEY`. The fix is a repository secret plus Actions →
*DB harnesses* → Run workflow. ⚠️ **Use Supabase's SESSION POOLER string, not
Direct** — Actions runners are IPv4-only and the direct endpoint is IPv6, which
fails looking like a hang. **The two new harnesses have therefore never been run
by the runner**, only proved via the Supabase MCP.

## Two numbers in `open-items.md` were wrong

Both corrected in place rather than deleted.

- **`anon` "across seven tables"** — it was **23 of 24**. Seven was a sample
  that had been read as a total.
- **"18 RLS policies call `auth.uid()` bare"** — 18 policies, but the 18th
  (`invites / invites read own`) calls **`auth.jwt()`**. A migration written to
  that description fixes 17 and leaves the lint reporting one forever.

## And one error of my own, recorded because the shape repeats

I wrote into `open-items.md` that **no** policy used the wrapped
`(select auth.uid())` form. Six already did — all on `announcements` and
`announcement_reads`. The claim came from a query that listed only policies with
BARE calls, so the wrapped ones were filtered out before they could be counted,
and I read the empty result as evidence of absence.

⚠️ **That is `CLAUDE.md` rule 6 — confirm a search can find something you know
is there before trusting it to find nothing — and it was broken by the session
that was quoting it.** Corrected in its own commit on #120.

## Findings worth keeping

- **`memberships / memb no self promotion` looks like a hole and is not.** Its
  WITH CHECK passes for anybody, which would let `anon` insert a membership — but
  it is **RESTRICTIVE**, so it narrows the permissive `memb manage` rather than
  admitting anything. **The predicate alone cannot tell you which;
  `pg_policies.permissive` can.** Do not "fix" it.
- **The `anon` revoke is a partial fix and the migration says so.** Two default
  privilege entries govern new tables in `public`; the `postgres` one was closed,
  the `supabase_admin` one **refused** — we are not that role. So a table created
  down that path still arrives open, which is why the harness walks every table
  instead of trusting a default.
- **The revoke moved the protection from policy to grant, visibly.** `set local
  role anon; select … from teams` used to return zero rows silently; it now
  raises `42501: permission denied for table teams`. The two look identical from
  the app and are not the same thing.
- **Read the lint NAME, not the count.** The performance advisor still reports
  132 lints, **100 of them `multiple_permissive_policies`** — untouched by either
  migration and a separate question. A still-noisy advisor is not evidence this
  failed.
