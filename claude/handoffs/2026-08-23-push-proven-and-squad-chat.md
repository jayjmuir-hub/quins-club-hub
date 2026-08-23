# 2026-08-23 — push proven, and the squad chat that followed it the same day

History, not instruction. One session, five PRs from this side (#319, #321,
#324, #325, #326) interleaved with four from a parallel session (#320, #322,
#323, #327, #328), four live migrations, one edge-function deploy. Jay drove
from a question — "what would you do to make sure this code base has no
problems?" — and the answer turned into ESLint, a crash fix, a push test on two
real phones, a plan, and a feature that was live by mid-afternoon.

## What shipped, in order

1. **ESLint in CI, and the crash it found first** (#319, `5b46dca`). The
   dry run over `src/` found a conditional hook in `Accounts.jsx`: the
   authorisation gate sat above nine hooks, and because `memberships` is the
   EFFECTIVE set, a super admin switching "View as" to a parent on that
   screen crashed it into the error boundary. Proven by a test before the
   fix; gate moved below the last hook; test kept.
2. **The squad chat plan** (#321, `b9b4974`). DMs were refused in the first
   draft on the reasoning "DMs in a club of children". Jay put them back
   ("we need DMs"), and the reasoning was wrong in one fact: **children do
   not hold accounts.** Redrawn: parent ↔ parent within a squad; a U16+
   player reachable by their squad's coach or manager only once a guardian
   has opted in, off by default, readable by that guardian, welfare can read
   everything and the thread says so.
3. **Push, proven — and the bug it found first** (#324, `a349359`; docs
   #325, `ff1a9c8`). The test plan was the usual; the execution hit a wall
   on the second person to sign in on a shared iPhone: *"new row violates
   row-level security policy for table push_subscriptions"*. The client's
   upsert on `endpoint` became an UPDATE of the previous person's row. The
   18 Aug migration had predicted the case and called it future work. Fixed
   as `register_push_subscription` (a device belongs to whoever is signed in
   NOW; the previous owner's pushes must stop following the phone) plus
   unsubscribe-on-sign-out. Then: a notice and a fixture change arrived on
   the iPhone (wife's account); a fixture change arrived on Jay's Android
   (parent-only account, Chrome). Four `push-send` 200s in the logs.
   `squad_push` came off the tabled list.
4. **Squad chat, phase 1** (#326, `255c2ba`), built in about two and a half
   hours after Jay asked why a week. A channel per squad and one for the
   club, announce-only BY DEFAULT (staff post, families reply in threads;
   staff can flip it, recorded), pinned, one-level replies, soft delete,
   15-minute edits, "Read by N of M" for staff, realtime, push on a staff
   post through `push-send`'s sixth shape `{ message_id }`. `Chat` on the
   tab bar for everyone; under Squad Hub for staff. **Jay posted in U13
   Mixed and it popped up on her phone** — the first real message, read by
   2 of 12 within the minute, push-send 200.

## The lessons, ranked

1. **Harness the FILE, not a retyping of it.** The squad-chat migration's
   rolled-back harness runs were all green — against a compact transcription
   I pasted into the SQL tool. The real file carried `revoke all on function
   … from public` on two `private` helpers, which the transcription did not,
   and a policy calls its helpers AS THE CALLER. First insert after the real
   apply: `42501 permission denied for function can_reply_to`. Caught only
   by running the harness against the live objects, which the runbook says
   to do and which I nearly treated as a formality. Fixed with a second
   apply (`squad_chat_helper_execute`).
2. **Supabase's default privileges hand `authenticated` ALL on every new
   table, and a column-level grant on top of that is decoration.** The
   `messages` column UPDATE grant `(body, pinned, deleted_at)` would have sat
   under a table-level UPDATE, and "message edit"'s WITH CHECK pins only
   `channel` — an author could have moved their post to another squad.
   Found by READING the 14 Aug grants capture before writing mine. The
   migration now revokes from `authenticated` first, and harness 9b proves a
   parent's `UPDATE team_id` is refused.
3. **A policy on a table cannot select from that table.** "infinite
   recursion detected in policy" on the first run. The reply check moved
   into `private.can_reply_to`, SECURITY DEFINER, which re-applies the read
   rule itself. Same shape as `can_see_team`.
4. **The actor never receives their own push.** `squad_push_subscriptions`
   excludes `_actor`, and a super admin is in no squad's audience unless
   they hold a real squad row. Every push test needs two people on two
   accounts — which is how the shared-phone bug got found at all.
5. **A rule-6 trap, walked into.** `git checkout -- <file>` while
   fault-injecting reverted to the last COMMIT and lost an uncommitted edit.
   CLAUDE.md says commit before injecting; I re-applied and then did.
6. **Two sessions, one changelog.** #322's entry was lost once to a
   concurrent edit. The fix was procedural: rebase before editing the
   changelog, whoever merges second rebases, and message the peer before any
   edge-function deploy or migration — git does not serialise those.
   Saved as a memory.
7. **Read the header before giving up.** "No Playwright here" was wrong by
   one paragraph of `harness/playwright.mjs`: it lives in the OTHER jay-pc
   clone and the file documents `PLAYWRIGHT_MODULE=file:///…` for exactly
   this worktree case. Jay asked "why don't we have playwright here?" and
   the answer was that we did.

## Also true today

- `eslint.config.js` turns the React-Compiler-era hook rules OFF on purpose;
  `no-unused-vars` is a warning. 50 warnings remain as a burn-down.
- ESLint is pinned to 9 — the React plugins do not yet peer with 10.
- `push-send` is version 9, `verify_jwt: false`. The other session was told
  to redeploy only from `255c2ba` or later.
- Jay's old iPhone subscription row (endpoint `…QONci`) is dead and still
  present; `push-send` will delete it on the first 410.
- The two U13 Mixed fixture edits and the two notices today were real
  pushes to real families (a handful of devices each). Jay chose U13 over
  U16B for that reason when told U16B reaches seven.

## Not done, not promised

Chat phases 2–4: fixture threads with RSVP chips, @mentions, the staff
channel, the welfare view, DMs with the guardian opt-in. The plan is the
spec. A Playwright smoke suite against deploy previews — the biggest gap
named in the morning's assessment — is still not started; it needs a test
account and a GitHub secret from Jay.
