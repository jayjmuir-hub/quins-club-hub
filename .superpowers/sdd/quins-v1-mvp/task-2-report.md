# Task 2 Report — Supabase client + connection smoke test

## What I implemented

1. **`src/lib/supabase.js`** — single-responsibility Supabase client module.
   - Reads `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` from `import.meta.env`.
   - Throws a clear, actionable `Error` listing exactly which var(s) are
     missing and pointing to `.env.example` if either is absent.
   - Otherwise calls `createClient(url, anonKey, { auth: { persistSession:
     true, autoRefreshToken: true, detectSessionInUrl: true } })` and exports
     the result as `supabase`.
   - No auth helpers, no query helpers, no retry logic — deliberately left
     for later tasks (Task 3/6 own auth flows).

2. **`tests/supabase.test.js`** — unit tests, no network access.
   - Uses `vi.stubEnv` + `vi.resetModules()` + dynamic `import()` per test to
     get a fresh module instance against different env states (the reliable
     pattern noted in the task brief).
   - Covers: missing URL only, missing key only, missing both (error message
     names both vars), and the happy path (real `@supabase/supabase-js`
     client returned, verified via `typeof supabase.from === 'function'` and
     `typeof supabase.auth.getSession === 'function'`).

3. **`tests/supabase.integration.test.js`** — real network test against the
   live project, run only via `npm run test:integration`.
   - Selects `count` (exact, head-only) from `teams`.
   - See **RLS finding** below — the test's expectation was adjusted to match
     observed reality rather than the originally assumed value of 15.

4. **`.env`** — created locally (git-ignored) with the real project URL and
   the publishable anon key given in the task brief, so the integration test
   can actually run. Never committed; verified with `git check-ignore -v .env`
   → matched by `.gitignore:3:.env`. `.env.example` was left untouched (still
   has the real URL, which is public, and a placeholder for the anon key).

## RLS finding (important — read before deciding next steps)

The integration test's first run (expecting `count === 15`) **failed**, but
not with a Supabase error — `error` was `null` and `count` was `0`.

Investigated directly via the Supabase MCP (`execute_sql` against
`lusmshimxdcxpnrktlgz`):

```sql
select tablename, policyname, roles, cmd, qual from pg_policies where tablename = 'teams';
```

Result:

| policyname | roles | cmd | qual |
|---|---|---|---|
| team manage | public | ALL | `is_admin(club_id)` |
| team read | public | SELECT | `EXISTS (SELECT 1 FROM memberships m WHERE m.profile_id = auth.uid() AND m.club_id = teams.club_id)` |

The `team read` policy requires a matching row in `memberships` for
`auth.uid()`. An anonymous (unauthenticated) client has `auth.uid() = NULL`,
so no membership row can ever match — RLS silently filters out all 15 rows.
The query is otherwise valid and successful (no PostgREST/RLS error is
raised; RLS just returns an empty result set), which is exactly why `error`
was `null` while `count` came back `0` instead of an error.

**What the anon client can currently see:** nothing in `teams` (or, by the
same logic, in any other table gated by a similar membership-based policy).
The anon/publishable key is sufficient to *connect* and issue valid queries,
but it cannot read seeded data until a session exists (post-login) — or
unless a policy is deliberately added to allow anonymous/any-authenticated
reads of specific low-sensitivity tables like `teams`.

**I did not change any database policy.** I updated
`tests/supabase.integration.test.js` to assert the real, observed behaviour:
the query succeeds (`error` is `null`) and returns `count === 0`. The test
file's leading comment documents the finding, the date, and why it isn't a
test bug, plus a pointer back to this report.

**Decision needed from the controller:** whether `teams` (15 seeded age
groups, non-sensitive) should get an additional read policy for
`authenticated` (or even `anon`) so the schedule/roster UI can display team
names before/without a full membership row per user — or whether every read
should wait until Task 3/6 auth + membership provisioning is complete. I have
not made this call myself, per instructions.

## TDD evidence

### RED
Command: `npm test -- tests/supabase.test.js` (run before `src/lib/supabase.js` existed)

```
FAIL  tests/supabase.test.js > src/lib/supabase.js > throws a clear, actionable error when VITE_SUPABASE_ANON_KEY is missing
AssertionError: expected [Function] to throw error matching /VITE_SUPABASE_ANON_KEY/ but got 'Failed to load url ../src/lib/supabas…'
...
Error: Failed to load url ../src/lib/supabase.js (resolved id: ../src/lib/supabase.js). Does the file exist?
 Test Files  1 failed (1)
      Tests  4 failed (4)
```
Expected: the module didn't exist yet, so every dynamic import failed to
resolve — confirms the tests actually exercise the module (not a vacuous
pass) before implementation.

### GREEN
Command: `npm test -- tests/supabase.test.js` (after implementing `src/lib/supabase.js`)

```
 ✓ tests/supabase.test.js (4 tests) 79ms

 Test Files  1 passed (1)
      Tests  4 passed (4)
```

### Integration (after RLS investigation and expectation fix)
Command: `npm run test:integration`

```
 ✓ tests/supabase.integration.test.js (1 test) 1881ms
   ✓ Supabase connection (integration) > connects successfully but sees zero teams as an unauthenticated client (RLS)

 Test Files  1 passed (1)
      Tests  1 passed (1)
```

### Full suite + build (final verification)
`npm test`:
```
 ✓ tests/supabase.test.js (4 tests) 65ms
 ✓ tests/app.test.jsx (1 test) 31ms

 Test Files  2 passed (2)
      Tests  5 passed (5)
```
(Confirms the default run excludes `supabase.integration.test.js` and needs
no network / `.env` — unit tests never hit the network.)

`npm run build`:
```
✓ 32 modules transformed.
dist/index.html                   0.81 kB │ gzip:  0.40 kB
dist/assets/crest-BPS7q37W.png  148.21 kB
dist/assets/index-DlBU-DYk.css    6.08 kB │ gzip:  1.94 kB
dist/assets/index-CD1sV6Bs.js   143.22 kB │ gzip: 46.12 kB
✓ built in 1.34s
```
Clean build, no warnings.

## Files changed

- `src/lib/supabase.js` (new)
- `tests/supabase.test.js` (new)
- `tests/supabase.integration.test.js` (new)
- `.env` (new, git-ignored, not part of the commit)

## Self-review findings

- Module is exactly one responsibility (client construction), matches the
  brief's explicit "no auth helpers, no query helpers, no retry logic"
  constraint — confirmed no extra exports.
- Verified the unit tests actually exercise real failure/success paths (RED
  observed first) rather than being written to match the implementation.
- Verified `.env` never appears in `git status --short` and is caught by
  `.gitignore` (`git check-ignore -v .env`).
- Verified no `sb_secret_...` string appears anywhere in the diff (`git
  diff` / new files only reference the publishable key, and only inside the
  git-ignored `.env`).
- Considered whether the integration test should instead assert `error` is
  non-null (i.e., treat RLS-filtering as an error) — rejected, because
  Supabase/PostgREST does not surface RLS row-filtering as a query error;
  asserting `count === 0` with `error === null` is the accurate contract.
- Considered leaving the integration test failing (red) as a signal — the
  task brief explicitly says to make the expectation match reality instead,
  so I did that and documented prominently instead of leaving a permanent
  red test in the suite.
- `npm run test:integration` output is pristine (single test, single file,
  no warnings).

## Issues / concerns

- **RLS blocks anonymous reads of `teams`** as detailed above. This is a
  legitimate open question for the controller, not a defect in this task's
  work. No policy was changed.
- The publishable anon key in this report/commit history: only the `.env`
  file (git-ignored) holds it locally; it is not written to any tracked
  file. The key is explicitly documented as public/safe-to-embed per the
  project's own instructions, but flagging its handling here for
  completeness.
