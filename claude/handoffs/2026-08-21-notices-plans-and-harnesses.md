# Handoff — 20–21 Aug 2026: harnesses that lied, and multi-squad notices

**History, not instruction.** This describes a moment. Check anything here
against the code and the database before acting on it.

**Eight pull requests, #265 to #272.** Two migrations applied to production.

## Where main is

**`883afd0`**.

| PR | Squash | What |
|---|---|---|
| #265 | `f27b99a` | a member's name and a child's inbox out of a public repo; `docs:check` #8 |
| #266 | `901a087` | the two signup-chase emails no longer arrive seconds apart |
| #267 | `7390a2c` | all nine `db/tests/` harnesses run; three were broken |
| #268 | `294bdbf` | correcting #267 — the secret was set and the nightly was real |
| #269 | `7b5356e` | the live `squad_push` test tabled |
| #270 | `bf81ce3` | training session plans reopened, and corrected |
| #271 | `0e883e8` | the copyright guard dropped; `drills.body` exists |
| #272 | `883afd0` | one notice to any number of age groups |

⚠️ **THE NEXT BRANCH MUST CITE `883afd0` IN THE CHANGELOG AS ITS FIRST EDIT.**

## ⚠️ The one idea worth carrying: a green check can be green by coincidence

Three separate things this session were **passing while testing nothing**, and
none of them looked broken:

1. **`db/tests/notice-push.sql` and `approval-push.sql` passed the nightly and
   were wrong by evening.** Both compared the WHOLE audience's notified devices
   against ONE PERSON'S device count — equal only while a single person had ever
   subscribed. Subscribers went **1 → 8 during 20 August** and both would have
   gone red the next morning **for a change nobody made**.
   ⚠️ **A harness that grows red as the club grows is testing the fixture, not
   the feature.** `claude/runbooks/db-harnesses.md` carries the rule.
2. **`db/tests/signup-nudges.sql` could not execute at all** — it inserted
   `public.profiles` before `auth.users`, violating the FK on the first
   statement of its own fixture, and the row was a duplicate anyway because
   `on_auth_user_created` creates it. Its part 5 also **asserted the bug**
   `20260820_signup_nudge_spacing.sql` fixes.
3. **Nothing at all covered who a notice reaches.** Replacing the audience
   `<select>` with a checkbox group broke **zero of 2,972 tests**.

## Traps, in rough order of what they cost

⚠️ **`git checkout --` WIPED UNCOMMITTED WORK, EXACTLY AS `CLAUDE.md` WARNS,
AND `git status` READ CLEAN AFTERWARDS.** `collapseGroups` was written AFTER the
checkpoint commit, so the fault-injection restore reverted the file to a version
that never had it. The clean `git status` looked like proof of a good restore
and was the opposite. Surfaced as 13 failures in the full run.
**The rule needs both halves: commit before injecting a fault, AND the file you
restore must be in that commit.**

⚠️ **`min(uuid)` DOES NOT EXIST IN POSTGRES.** The first draft of the
statement-level notice trigger used it. Caught only because the migration was
run inside a `begin`/`rollback` before being applied — the difference between a
fixed draft and a broken trigger on a live table. `(array_agg(id order by id))[1]`.

⚠️ **A STALE "BLOCKED ON JAY" CLAIM SURVIVED TWO HANDOFFS AND WAS COPIED INTO A
THIRD.** `SUPABASE_DB_URL` has been set since **19 Aug 12:50 UTC** and the
nightly has been real since. Both prior handoffs said "STILL unset" and this
session repeated it into the runbook and changelog **before checking**.
`gh secret list` and `gh run list --workflow=db-check.yml` answer it in seconds.

⚠️ **AUTO-REPLIES POST TO ARTIFACT COMMENT THREADS IN CLAUDE'S NAME.** Four
"on it, updating that now" replies went out on the Director pitch while nothing
was changing, and Jay reasonably got annoyed at what looked like Claude
stalling. If a comment thread needs a change, **make it and then reply** — and
know that the acknowledgements are not yours.

## Migrations applied to production

- `db/migrations/20260820_signup_nudge_spacing.sql` — nudge 2 now requires nudge
  1 to be six days old. Before it, **both chase emails went in the same run**:
  `send_signup_nudges` loops `array[1,2]` in one call, so step 2 found the row
  step 1 had just written. Measured: two accounts, 10 and 11 days old, would
  have got both the moment an admin clicked **Restore**.
- `db/migrations/20260821_notice_multi_squad.sql` — `announcements.group_id`, a
  group-aware `notice_push_subscriptions`, and `notice_push` becomes
  STATEMENT-level. `push-send` untouched, no edge-function redeploy.

## Still open

- ⏰ **The signup nudge has still never sent.** The cron is active on `10 7 * * *`
  and had never fired as of 20 Aug — it was scheduled after that day's slot. At
  the time of writing nobody qualified, so its first real fire sends nothing.
- ⚠️ **The training plan still assumes a fixed Tuesday/Thursday pair.** Jay,
  21 Aug: fifteen age groups train **twice a week each, on nights that differ by
  squad** — 30+ sessions a week club-wide. The publish step must work off each
  squad's own training nights, not a fixed pair.
  `claude/plans/2026-08-12-training-session-plans.md` has not been corrected for
  this yet.
- **`squad_push` is unproven and TABLED** — `claude/state-of-play.md`. The safe
  route is recorded there if it is reopened.
- **Duplicate-content detection was raised and not answered.** "So we don't send
  redundant notices" was read as the whole-club overlap, which is handled;
  whether an identical unexpired notice to the same squad should also be blocked
  is undecided.
- **Two Artifacts exist outside this repo**, both live: a screen-by-screen deck
  for Jay, and a proposal written for the Rugby Performance Director. Neither is
  in version control.
