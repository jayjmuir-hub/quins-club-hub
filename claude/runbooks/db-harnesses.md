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

⚠️ **THE FILTERED FORM ANSWERS A DIFFERENT QUESTION FROM THE BARE ONE, AND
CONFUSING THEM HAS COST A RED PRODUCTION HARNESS TWICE IN ONE DAY.**
`npm run db:check -- <your file>` tells you **your** harness is right. Only
`npm run db:check` — no argument — tells you **what you broke**. Those are not
the same question, and passing the first one feels exactly like passing the
second.

**Before applying any migration, run the bare form.** On 1 Sep 2026 a session
added one small function, asserted its new behaviour exhaustively — six input
combinations, a control, and a check that the callers actually used it — ran
`npm run db:check -- club-diary`, saw green, and applied. The new function was
the only one in `private` with a mutable `search_path`, so
`db/tests/search-path.sql` went **red against production** the moment it landed.
The bare form would have said so immediately and cost seconds.

**This is the sibling of the rule at the top of this file.** A check nobody runs
is not a check; a check you *filtered out of the run* is the same thing with
better intentions. It is also the same root cause `#587` named that morning for
its sixteen red harnesses — **migrations shipped without updating the harnesses
they invalidate** — repeated the same day by a session that had read it. Being
able to state the rule is not the same as applying it.

⚠️ **A NEW FUNCTION, TABLE OR COLUMN IS A NEW OBLIGATION TO AN EXISTING
HARNESS.** Ask what your change makes false, not only whether it works.

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

## ⚠️ Which of these have ever actually RUN, and what running them found

⚠️ **THE `SUPABASE_DB_URL` SECRET IS SET, AND HAS BEEN SINCE 19 Aug 2026,
12:50 UTC.** Two handoffs said it was "STILL unset" after that was already
false, and on 20 Aug a session repeated the claim into this runbook and the
changelog before checking. **Measure it —** `gh secret list` names it, and
`gh run list --workflow=db-check.yml` shows what the nightly actually did:

| Nightly | What it did |
|---|---|
| 19 Aug 04:01, before the secret | `SUPABASE_DB_URL is not set - the db harnesses did not run`, exit 0 |
| 20 Aug 04:01, after it | **34 harnesses, "All harnesses passed."** |

So the nightly is REAL and has been for a day. Only two harnesses had never
run — `signup-nudges.sql` and `email-confirmed-sync.sql`, both added later on
20 August, after that morning's run.

## ⚠️ Two harnesses were passing nightly and were about to go red

On 20 Aug 2026 all nine harnesses added on 19–20 August were run by hand,
through the Supabase MCP, each inside its own rolled-back transaction.
**Three were broken** — and the interesting part is that two of them had been
**passing** every night:

| Harness | What running it found |
|---|---|
| `db/tests/signup-nudges.sql` | never ran — added after that morning's nightly. **Could not execute at all** — inserted `public.profiles` before `auth.users`, violating `profiles_id_fkey` on the first statement of its own fixture, and the row was a duplicate anyway because `on_auth_user_created` creates it. Its part 5 also **asserted the bug** that `20260820_signup_nudge_spacing.sql` fixes |
| `db/tests/notice-push.sql` | **passed the 04:01 nightly**, then compared the **whole audience's** notified devices against **one person's** device count. Correct only by coincidence |
| `db/tests/approval-push.sql` | **passed the same nightly**, same mistake — by evening reported *"the REQUESTER would be buzzed about their own request"*, which was **false**: a second super admin had subscribed and was correctly told |

The other six passed as written, self-tests included:
`email-confirmed-sync.sql`, `fixture-push.sql`, `feedback-delete.sql`,
`truncate-grants.sql`, `push-notifications.sql`, `availability-nudge.sql`.

### ⚠️ The rule the two push harnesses cost

**A harness that grows red as the club grows is testing the fixture, not the
feature.** ⚠️ **AND THE NIGHTLY CANNOT TELL YOU THIS.** Both passed at 04:01
and were broken by tea time, because what changed was the CLUB, not the code —
subscribers went from 1 to 8 during the day. A green nightly is evidence about
the moment it ran and nothing else. Both were written when exactly one person
had ever subscribed, so
*"this person's devices"* and *"everybody notified"* were the same number and
the distinction was invisible. `notice_push_subscriptions` and
`approval_push_subscriptions` both return `(id, endpoint, p256dh, auth)` and
carry **no `profile_id`**, which is what makes the loose count look reasonable.

**Join the returned `id` back to `push_subscriptions` and filter to the person
the assertion is about** — and keep an unfiltered control alongside it, so a
function that returned nothing cannot satisfy the filtered check for free.
⚠️ **Not every count should be filtered:** `approval-push.sql`'s
"an already-actioned request notifies nobody" is deliberately about the whole
audience, and is marked as such in the file.

### ⚠️ Prove the runner's rollback before trusting it with a harness

The MCP was proved on 20 Aug by creating a throwaway table inside
`begin`/`rollback` and confirming it was gone **with a control that the same
query can see a table which does exist**. Measured the same day: **an
unterminated transaction is discarded, not committed** — but do not lean on
that, write the `rollback;`.

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
