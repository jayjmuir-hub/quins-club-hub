# Handoff — 18 Aug 2026, push notifications and three grant/status audits

**History, not instruction.** This describes a moment. Check anything here
against the code and the database before acting on it — several lines below
are explicitly things that will go stale.

**Written because Jay moved to the other PC mid-flow.** The next session is
on cafnet (`C:\Users\Jay\GitHub\quins-club-hub`) and cannot see the chat this
came from.

## Where main is

**`0acb302`** — "feat(push): real browser push notifications, first trigger a
report reply (#238)". Five pull requests merged this day, in order:

| PR | Squash | What |
|---|---|---|
| #234 | `1e820f3` | A pending admin row is no longer an admin — four functions, not one |
| #235 | `f3f108d` | Saving a child's parent list is now all-or-nothing |
| #236 | `631fa32` | The head-coach harness can fail, so `db:check` runs again |
| #237 | `3bc4d10` | `register_my_player` no longer needs `anon` EXECUTE |
| #238 | `0acb302` | Real browser push notifications |

⚠️ **THE NEXT BRANCH MUST CITE `0acb302` IN THE CHANGELOG AS ITS FIRST EDIT.**
#238's own entry carries no SHA — a commit cannot cite itself — so the
one-behind allowance falls to whoever branches next. Skip it and `docs-check`
goes red in CI while passing locally. That trap fired twice today.

## ⚠️ The one thing that is BUILT, DEPLOYED, AND STILL UNPROVEN

**Push notifications have never been received by a real browser.**

Everything server-side is verified against production, and the deploy is
confirmed live by reading the deployed bytes rather than trusting a green
build:

- `/push-sw.js` serves as `application/javascript` and carries both
  `addEventListener('push')` and `addEventListener('notificationclick')`.
- `/sw.js` contains `importScripts("push-sw.js")` — the Workbox wiring
  genuinely took in production, not just in `dist/`.
- `push-sw.js` is in the precache manifest.
- DB: the owner-only RLS policy, the `notify_feedback_reply_push` trigger on
  `public.feedback`, and both Vault secrets all present. `push_subscriptions`
  is empty, which is correct — nobody has switched it on.

**What none of that proves: that a real browser can DECRYPT and DISPLAY one.**
The crypto was verified two ways (a Node-side encrypt/decrypt round trip, and
a live smoke test that built a real VAPID JWT, encrypted a real payload,
POSTed it, and watched a 410 delete its own subscription row) — but a real
push service decrypting in a real browser is the one thing only a device can
show.

**To close it:** More → Notifications → Turn on, accept the prompt; send a
report via the `?` button; reply to it from `/admin/needs-attention`; a
notification should arrive. On iPhone, step one only works from an **installed
PWA** (iOS 16.4+) — the UI says so instead of offering a dead toggle.

**If it does not arrive**, Supabase → Edge Functions → `push-send` → Logs
names the failing subscription and why. That is the one path where the
hand-rolled crypto could still be wrong in a way this session could not reach.

## Waiting on Jay

- **`SUPABASE_DB_URL` repository secret is still unset.** `db/tests/` is
  runnable again as of #236, but the nightly `.github/workflows/db-check.yml`
  stays inert without it and reports "did not run" — it passes green while
  checking nothing. Settings → Secrets and variables → Actions. It is a
  credential; Jay handles it, Claude does not.

## Open items raised today, not fixed

- **`authenticated` holds `TRUNCATE` on every table it holds anything on** —
  `memberships` and `player_parents` measured as controls, so it is systemic
  and pre-existing, not introduced by the push work. **RLS cannot filter
  TRUNCATE at all.** Mitigating: PostgREST does not expose TRUNCATE, so it
  needs a direct Postgres connection with a stolen `authenticated` JWT.
  Recorded under "Cheap" in `claude/open-items.md`.

## Two lessons worth keeping

**A deferral written as a NAME cannot find its siblings.** #234 was filed as
"`private.is_admin` has the same omission". It was four functions, and the two
nobody had named (`shares_admin_club`, `can_admin_see_pending`) were the ones
that mattered — they back `profiles`, so the gap exposed every member's name
and email. Found by asking the database *which functions mention `memberships`
and not `status`*, rather than grepping the name already known. **Write a
deferral as the QUESTION it leaves open.**

**An explicit grant in a migration is evidence someone typed it, not evidence
someone decided it.** #237 found two documents in this repo disagreeing about
the same `anon` grant for five days — `open-items.md` correctly called it an
unexamined accident, while `db/tests/grants.sql` §3b called it "DELIBERATE AND
MUST NOT BE TIDIED", citing the migrations that re-granted it. Both migrations
were restating a DROP/CREATE side-effect to avoid an outage, and said so in
their own comments.

## Process notes from this session

- **Two branch mistakes, both caught before damage.** One branch was cut from
  an already-squashed branch instead of `main` (caught by `docs-check`
  demanding a SHA that no longer existed); another push went to a
  wrongly-named remote branch carrying already-merged history. Both fixed by
  re-checking `git merge-base` against a **freshly fetched** `origin/main`.
  **Fetch before branching, and verify the merge-base before pushing** — the
  reading-order rule exists for exactly this.
- **`gh pr merge` reports `fatal: 'main' is already used by worktree`** on this
  machine every time. That is only its local post-merge checkout step failing
  because the main clone holds `main`; **the merge itself lands on GitHub**.
  Check `gh pr view <n> --json state` rather than believing the error.
- Local branches on jay-pc at the time of writing are all either squash-merged
  or content-verified present in `main`. `git cherry` marks multi-commit
  branches as unmerged after a squash because patch-ids change — that is an
  artefact, not stranded work.
