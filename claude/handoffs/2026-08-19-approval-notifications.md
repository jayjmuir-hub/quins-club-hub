# Handoff — 19 Aug 2026, approval notifications (and closing the fixture proof)

**History, not instruction.** This describes a moment. Check anything here
against the code and the database before acting on it.

**The second session of 19 Aug.** The first is
`claude/handoffs/2026-08-19-notifications-v2.md`, and this one exists mostly to
close the item that one left open.

## Where things are

**Everything is live.** Shipped as pull request #250, in two stages on Jay's
instruction — first "deploy and apply, no PR yet", then "make everything live".

| What | How it went live |
|---|---|
| `push-send` **v6**, with the approval branch | CLI deploy, `--no-verify-jwt` |
| migration `approval_push` — constraint, two functions, trigger | applied directly |
| the `approval` row in the notification settings list | pull request #250 |

⚠️ **THERE WAS A WINDOW WHERE THE FIRST TWO WERE LIVE AND THE THIRD WAS NOT, AND
IT IS WORTH KNOWING THE SHAPE OF IT.** For about an hour, approval notifications
were sending while the app had no switch to decline them — because absence of an
opt-out row means ON, so the feature works the moment the trigger exists.
**Deploying the database half of an opt-outable feature ships it switched on for
everybody.** That was fine here (the audience is admins, and they wanted it) but
it is not the general case: the same order on a parent-facing category would
buzz the whole club with no way to stop it. **Ship the switch first, or ship
them together.**

⚠️ **AND A TRAP THAT TURNED `docs:check` RED IN CI WHILE IT PASSED LOCALLY —
NOT the changelog-SHA asymmetry everybody expects.** Claude Code names its
agent branches with a `claude/` prefix, and `scripts/docs-check.mjs` resolves
anything starting `claude/` as a FILE PATH. Writing the branch name into a
handoff is therefore a broken path reference. **Name the branch without its
prefix in prose.** It passed locally for a second, unrelated reason worth more
than the first: `docs:check` only scans TRACKED files, and it was run before
`git add`, so the new handoff was invisible to it. `CLAUDE.md` already says to
run it after the COMMIT and not merely after staging; this is what that costs.

## ✅ The item the last handoff left open is CLOSED

**A `squad_push` payload has now reached the deployed `push-send`.** Driven by a
real fixture change on production — a U16B training session four weeks out, its
`pitch` set to `Pitch TBD` and put straight back. Two `200 ok` responses
(`net._http_response` 165 and 166), no per-subscription failure logged, both
subscriptions still alive afterwards, and the fixture identical to how it
started, field by field.

⚠️ **THE TEST THE LAST HANDOFF PROPOSED COULD NOT HAVE PROVED IT, AND WOULD
HAVE LOOKED EXACTLY LIKE A BROKEN FEATURE.** It said: make one real fixture
change, then read the logs. But `public.squad_push_subscriptions` excludes the
actor — `where (_actor is null or aud.profile_id <> _actor)` — and
`private.notify_fixture_changed` passes `auth.uid()`. **The only subscriber is
Jay.** So a change he makes in the app resolves an audience of ZERO, returns a
clean 200, and sends nothing. It had to be driven over the SQL connection,
where `auth.uid()` is null and nobody is excluded.

⚠️ **AND ITS SAFETY CLAIM HAD ALREADY DECAYED.** It said the only subscriber was
"attached to no squad". By this session both devices sat on U13 Mixed and U16B.
That made the test better rather than worse — but it is the second time in two
days a measured fact in a handoff was read as still true. **Re-measure; the
sentence is a record of a moment.**

## ⚠️ `content` IS THE ONLY THING THAT DISCRIMINATES, AND A 200 PROVES NOTHING

`push-send` returns **three different bodies with the same status code**:

| Body | Means |
|---|---|
| `ok (no subscriptions)` | audience resolved EMPTY — nothing sent |
| `ok (no longer pending)` | approval only: already actioned |
| `ok` | the send loop actually ran over a non-empty list |

**Read `content` in `net._http_response`, never the status.** Every claim in
this handoff about something being delivered rests on a bare `ok`; a 200 alone
is compatible with sending nothing at all. `400 bad request` is also worth
knowing — it is what a payload the deployed function does not understand
returns, which is how a stale deploy announces itself.

## What was built

**The fourth notification category: somebody waiting to be approved.**
`db/migrations/20260819_approval_push.sql`.

**The audience is the EMAIL's, not a new one** — super admins, plus that squad's
head coach and team manager(s), all active. Deliberately NOT
`private.can_approve_team`, which is wider: authority is one question and being
TOLD is another. That narrowing was Jay's call on 18 Aug for the email and it
carries over unchanged.

⚠️ **THE RULE IS NOW WRITTEN TWICE** — TypeScript in
`supabase/functions/notify-approval/index.ts` for the email, SQL in the
migration for the push. **Change both in the same commit.** Folding the email
onto the SQL function is the right long-term shape and was NOT done, because it
means editing the live email path in order to ship a notification, and that
email is the backstop that makes the rest safe to get wrong.
`db/tests/approval-push.sql` restates the rule a third time and asserts the SQL
agrees — so a drift in the migration is caught. **A drift in the TypeScript is
not.**

**What it measures:** widening the audience to everybody who may approve
produces **54 (squad, person) violations** — each one a child's name on the
lock screen of somebody the club decided should not receive it. That number is
what the narrowing is worth.

## Traps found today

**⚠️ CREATING A PENDING MEMBERSHIP FIRES THE EMAIL TRIGGER TOO, AND THAT MEANS
REAL VOLUNTEERS GET A SPURIOUS EMAIL.** `notify_pending_membership` and the new
`pending_membership_push` sit on the same event with the same condition. Testing
the push end-to-end therefore mails super admins and squad staff unless the
email trigger is disabled for the insert. **The safe way, and the reason it is
safe:** `alter table … disable trigger` takes an ACCESS EXCLUSIVE lock, so a
real registration arriving mid-test BLOCKS until the transaction commits and
the trigger is back — it cannot slip through un-emailed. Disable, insert,
re-enable, commit, all in one transaction.

**⚠️ A GIT WORKTREE IS A THIRD WAY TO HAVE A BROKEN-LOOKING SUITE, AND BOTH
CAUSES ARE ALREADY DOCUMENTED FOR CLONES.** A fresh worktree has **no `.env`**
(gitignored files do not come along) and an **empty `node_modules`**. The first
makes a block of tests fail to COLLECT with a Supabase env-var error; the
second is subtler, because vitest and vite still resolve UP to the parent
clone's `node_modules` and most things work — but `tests/pwa-build.test.js`
builds an absolute `<worktree>/node_modules/vite/bin/vite.js` and dies with
`MODULE_NOT_FOUND`. **Copy `.env` in and run `npm install --include=dev` in the
worktree**, exactly as `CLAUDE.md` already says for a clone. After that: the
whole suite green, nothing skipped for the wrong reason.

**⚠️ FOUR TEST FILES NEED `dist/` AND SAY SO BADLY.** `button-sweep`,
`nav-sheen`, `press-feedback` and `pwa-build` read the BUILT stylesheet. With no
`dist/` they fail with colour-matching assertions that look like a design
regression. Each does carry a "has a built stylesheet to read at all" guard —
**read that one first and run `npm run build`** before believing the others.

**⚠️ `db/migrations/` IS NOT A REPLAYABLE, ORDERED SET, and a same-day file makes
that visible.** Within 19 Aug alone, `20260819_fixture_push.sql` sorts BEFORE
`20260819_notice_push.sql` while notice_push is the file that CREATED the table
fixture_push then alters — so filename order would fail on the first statement.
`claude/schema-history.md` already says the folder is a partial historical
record applied by hand; this is what that means in practice. **It is why
`tests/notification-categories.test.js` searches every migration for a
constraint list matching the app, rather than reading "the latest file".**

## The new test that closes a silent boundary

`tests/notification-categories.test.js`. The app's category keys must match the
CHECK constraint on `notification_opt_outs`. A mismatch fails in the worst
possible way: **the INSERT is refused, the switch still moves, and the
notifications keep arriving** — nothing on screen says otherwise. Both halves
were already commented with a warning to change the other; warnings are what we
had. Proved against an injected fault in BOTH directions — a category in the app
but not the migration, and the reverse.

## ⏰ ADDENDUM — the availability nudge shipped the same day

**All five notification categories now exist.** The last one is the only
scheduled job among them: `pg_cron` at 05:23 UTC daily, asking families who have
not answered, up to 48 hours before a **match**.

⚠️ **MATCHES ONLY, AND THE NUMBER IS THE ARGUMENT.** Measured before designing
anything: every upcoming event would be **338** notifications; matches only is
**6**. 62 upcoming events, 2 of them matches.

⚠️ **THE LEDGER IS THE FEATURE.** `public.availability_nudges`, keyed
(event_id, profile_id), claimed BEFORE the push is queued and carrying a batch
id the send is keyed on. **A failed send loses a nudge rather than repeating
it** — chosen deliberately, because there is no email behind this category and
the family buzzed twice is the family that mutes the app.

### ⚠️ Two verification findings, both worth more than the feature

**1. THE FIRST HARNESS PASSED WHILE TESTING NOTHING.** Both real upcoming
matches were further out than 48 hours, so the window was empty, the run claimed
nobody, and every "expect 0" passed for free. **It would have passed against a
completely broken feature.** It now creates its own match inside the window,
paired with a training session **at the same moment on the same squad** — a
control that differs by exactly one column, so a run that claims the training
cannot be excused by timing, membership or luck.

**2. THE SELF-TEST WAS AIMED AT THE WRONG MECHANISM, AND SAID SO BY FAILING.**
It removed the not-already-nudged clause from the candidate function and nothing
noticed. The reason is worth keeping: `on conflict (event_id, profile_id) do
nothing` means a repeat claim inserts zero rows, `row_count` is 0, and the loop
skips. **The PRIMARY KEY is the guarantee; that clause only saves a query.** The
injected fault is now the plausible dangerous edit — "fixing" batch tracking
with `do update` — which buzzes every unanswered family every morning, and which
the check does catch.

⚠️ **A SCHEDULE THAT HAS NEVER FIRED IS NOT A SCHEDULE.** Proved with a
temporary every-minute probe running the real function: three runs, all
`succeeded` in `cron.job_run_details`, then unscheduled. `cron.job` is back to
three jobs.

### ⚠️ And a self-inflicted one: a script truncated the changelog to zero bytes

A Python one-liner opened `claude/changelog.md` in `'w'` mode and then threw on
an emoji escape while encoding. **`open(…, 'w')` truncates before the write,** so
6,632 lines went to nothing and `docs:check` started reporting commits missing
from 4 Aug. No work was lost — the file was unmodified on the branch, so
`git checkout -- claude/changelog.md` restored it exactly — but only because the
damage happened to a file with nothing uncommitted in it.
**Edit files with the editing tools, not with a script that truncates on open;
if a script must write, write a temp file and move it into place.**

## Still open

- **The changelog cannot cite this session's squash SHA** — a branch SHA stops
  existing at merge, and `main` squash-merges. The NEXT pull request cites it.
  That is the one-behind rule working, not an omission.
- **`SUPABASE_DB_URL` is STILL unset**, and `db/tests/approval-push.sql` is one
  more harness that has never met its own runner. See `claude/open-items.md`;
  the distinction that matters is that "the harness is green" and "the harness
  runs" are different claims and only the first is true.
- **The availability nudge** is the last unbuilt category and is still the
  expensive one — it needs a schedule, not a row change.
✅ **The CLI's `.temp` scratch directory is now gitignored** — it reappeared on
this session's deploy, as predicted. Folded into this change rather than shipped
alone, which is exactly what the earlier session asked for: `.gitignore` is not
matched by `scripts/netlify-ignore.mjs`'s root-markdown pattern, so a commit
carrying only that line would have bought a full production build for nothing.
**The gate was run to confirm this branch builds anyway** — it reports
"Building: 3 of 6 changed file(s)" and exits 1 — rather than assumed.
