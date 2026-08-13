# Runbook — the SQL harnesses in `db/tests/`

**What they are:** assertions about the LIVE database that no JavaScript test
can make — who may read which rows, which column grants stand between an admin
and someone's login email, whether RLS is on. They are not unit tests and they
do not run in `npm test`.

**Why this runbook exists:** on 13 Aug 2026 `db/tests/grants.sql` was found to
have been **failing against live since 10 Aug** — three days — and nobody had
seen it, because nobody had run it. The check itself was wrong, not the
database; but the reason nobody noticed is that running these meant pasting
thirteen files into the Supabase SQL editor by hand.

> ⚠️ **A check nobody RUNS is not a check, in exactly the way a check that has
> never FAILED is not a check.** The second half is `CLAUDE.md` rule 6. The
> first half is this file.

## Running them

```bash
npm run db:check
```

One file, or a group, by substring:

```bash
npm run db:check -- grants
```

The runner is `scripts/db-check.mjs`. It needs a connection string in
`SUPABASE_DB_URL` (or `DATABASE_URL`), taken from the environment or read out of
`.env`, which is gitignored.

⚠️ **That string is a credential and this repo is PUBLIC.** Never commit it,
never paste it into a chat or a tool call, and rotate it if it is ever
disclosed. Get it from Supabase → Project Settings → Database → Connection
string (URI). **Jay handles it; Claude does not.**

## ⚠️ They run against production, and here is why that is safe

There is no staging database. Supabase branching **does not work on this
project** — a branch replays the parent's migration history, and this project's
history has duplicate rows, so it fails with `MIGRATIONS_FAILED`. A transaction
on production that rolls back is the substitute, and it is better than a branch
would have been: real schema, real data.

**Every harness opens a transaction and rolls it back, and several INJECT A REAL
FAULT on the way through** to prove their own assertions are not vacuous. One of
those faults is `grant update (email) on public.profiles to authenticated` —
which, for the moment it exists, means any club admin may rewrite any member's
login email.

⚠️ **So the rollback is not tidiness, it is the whole safety argument**, and
`scripts/db-check.mjs` enforces it rather than trusting it:

- a file containing `commit;` is **refused**
- a file without both `begin;` and `rollback;` is **refused**
- the refusal happens **before anything connects**, so an unsafe file cannot be
  reached part way down a run
- each file gets **its own connection, closed afterwards** — if a harness dies
  mid-file, the server rolls its transaction back when the connection drops

**Both refusals were proved by planting a bad file and watching the runner stop.**

## Reading the output

The harnesses report a pass with `raise notice`, and the runner prints notices.
The lines worth reading are the self-tests:

```
  ok    grants.sql
          GRANTS: all checks passed.
          SELF-TEST PASSED — the check caught it: GRANTS: `authenticated` can UPDATE …
```

⚠️ **`SELF-TEST PASSED` is the important line, not `all checks passed`.** <!-- count-ok: a literal string the harnesses print, not a count; docs-check matches `tests? passed` --> Every
assertion in these files is of the form "this privilege is absent", and a typo'd
role or table name makes all of them vacuously true. The self-test injects the
real fault and confirms the check catches it. **A file that prints only "all
checks passed" is telling you less than it appears to.**

⚠️ **A RED RUN IS A STATEMENT ABOUT PRODUCTION, NOT ABOUT YOUR BRANCH.** These
assert against live, so a failure means the database drifted — possibly days
ago, possibly from a migration somebody else applied. Do not "fix" it by
editing the harness until you have established which of the two is wrong. On
13 Aug the harness was wrong and the database was right.

## The nightly run

`.github/workflows/db-check.yml`, on a schedule and on demand.

⚠️ **INERT UNTIL A SECRET EXISTS.** With no `SUPABASE_DB_URL` repository secret
it reports "did not run" and passes, rather than failing every night with a
credential error everyone learns to ignore. **Jay turns it on:** Settings →
Secrets and variables → Actions → New repository secret, named
`SUPABASE_DB_URL`.

⚠️ **A public repo CAN hold an encrypted secret safely — the risk is fork pull
requests, and this workflow has no `pull_request` trigger for exactly that
reason.** `schedule` and `workflow_dispatch` can only be fired from the repo
itself. **Do not add a `pull_request` trigger**; it would expose the database
credential to code somebody else wrote.

⚠️ **AND IT MUST NOT BECOME A REQUIRED CHECK.** As a merge gate, an unrelated
production drift would block every pull request until somebody fixed the
database. `test` and `docs-check` are the gates. This one reports.

## Writing a new one

Copy the shape of `db/tests/photo-backup.sql`, which is the shortest complete
example:

1. `begin;`
2. the checks, as a `pg_temp.` function so part 3 can call it twice
3. **a control assertion** — something that must be TRUE. Without one, a typo
   makes every "this is absent" check vacuous and the file is green while
   testing nothing.
4. run it unmodified
5. **inject the real fault** and prove the check catches it
6. `rollback;`

⚠️ **Add the harness in the same commit as the migration.** The photo-backup
grants were verified when the migration was applied — as ad-hoc SQL in a chat
session, which is to say once, by one person, somewhere nobody can re-run.
