# State of play

**Entry point per `CLAUDE.md` step 3.** Where things STAND. `RESTORE.md` is what is
TRUE about the codebase. **If this file and `RESTORE.md` disagree, `RESTORE.md` and
the code win and this file is stale.**

Split by VOLATILITY, not topic: anything that changes week to week lives here, so
`RESTORE.md` never has to be edited because a status changed.

*Last updated: 7 Aug 2026. Rewritten against the CODE, not against the previous
edition of this file — the 5 Aug version had gone badly stale and was still telling
sessions that auth email was dead and that a Manager role did not exist. Both false.*

## Where things stand

**v1 MVP complete and live at `https://adhquins-clubhub.com`** (Let's Encrypt cert,
expires 3 Nov 2026). `app.adhjrt.com` remains a working alias, deliberately not
removed. ⚠️ **adhquins-clubhub.com is the canonical origin** — `CALENDAR_ORIGIN` in
`src/data/calendar.js` is hard-coded to it, and a subscribed calendar URL cannot be
changed remotely once a parent holds one.

Current phase is post-v1 refinement: usability work driven by Jay using the app, not
new infrastructure.

**55 test files.** ⚠️ **Do not quote a test COUNT in this file.** Previous editions
carried 944, 978, 1057 and 1157 at various points and every one of them rotted within
days. Run `npm test` if you need the number.

⚠️ **`NODE_ENV=production` is set machine-wide on BOTH PCs** — a plain `npm install`
silently drops dev dependencies including vitest, and the symptom is
`'vite' is not recognized`. Always `npm install --include=dev`. On jay-pc,
PowerShell's execution policy also blocks `npm.ps1`; run npm from `cmd`.

## ⛔ The rollout blocker: Resend's daily send cap

**Auth email is on Resend.** `supabase/functions/send-email/index.ts` line 9 is the
source of truth — `PROVIDER: Resend`. The Microsoft Graph version exists in git
history only. **The 5.7.708 Exchange block that dominated 5 Aug is no longer on the
critical path. Do not re-open it.**

⚠️ **The remaining wall is Resend's free daily cap.** Last read off the account
(Settings → Usage, row expanded) it was **100/day**; monthly is a non-issue.
**Re-read it before planning a rollout — this number has been wrong in this file
twice.**

⚠️ **Resend's usage figures are rendered by a `number-flow-react` web component whose
shadow DOM contains every digit 0-9 per column.** Text extraction and `aria-label`
both return nonsense. **Read that page from a screenshot, or expand the row.**

**143 parents need magic links.** At 100/day that is two days minimum, and
realistically three once retries and mistyped addresses are counted.

### ⚠️ Hitting the cap does not look like a limit

Resend returns `429 daily_quota_exceeded` -> the Send Email Auth Hook returns 500 ->
GoTrue returns `500 unexpected_failure`, message
`"Unexpected status code returned from hook: 500"`.

`friendlyAuthError` in `src/screens/Login.jsx` matches
`/rate limit|too many requests|429/i` — and that string contains none of them. **So a
parent sees raw internal text and concludes the app is broken.** This happened to Jay
at 04:44 on 6 Aug and is in the auth logs.

**Two ways out, not yet decided:**

1. **Pay-as-you-go**, $0.90 per 1,000 emails — the whole rollout is roughly **$0.15**.
   Removes the cliff entirely. Needs a card on the account: **a purchase, so Jay does
   it, not the assistant.**
2. **Stagger by age group** and stay under the cap — free, but stretches the rollout
   across several days and leaves the cliff in place for anyone who retries.

Either way, **`friendlyAuthError` should learn the hook-500 string first**, or the
first person past the cap generates a support request nobody can diagnose from the
screenshot.

## Shipped 6-7 Aug 2026

Ten migrations landed in `db/migrations/`: `claim_roster_access`,
`delete_my_account`, `drop_redundant_read_policies`,
`grant_anon_execute_on_two_profile_helpers`, `memberships_unique_grant`,
`profiles_backfill_split_names`, `profiles_first_and_last_name`,
`profiles_name_confirmed_at`, `teams_is_senior`, `player_gender`.

| What | Where it lives |
|---|---|
| Team Manager + Medic roles | `src/lib/scope.js` — `SQUAD_STAFF_ROLES`, one exported set |
| Roster-match auto-onboarding | `claim_roster_access`; `src/data/members.js`, `src/lib/memberships.jsx` |
| Account deletion + privacy policy | `20260806_delete_my_account.sql`, `src/App.jsx` |
| Session guard | `src/lib/supabase.js` |
| Calendar feed on our own domain | `src/data/calendar.js` |
| Baseline security headers | `netlify.toml` |
| Gender on a player | `src/lib/gender.js`, `20260807_player_gender.sql` |
| Theme, typography, home screen, More | `src/` — Inter replaced Anton + Barlow |
| Split first/last name on profiles | `profiles_first_and_last_name` + backfill |

⚠️ **Verify security headers from inside a browser, never `curl` alone.** The service
worker served `index.html` from cache WITHOUT them: `curl` showed all five, a real
browser showed `x-frame-options: null`. Re-checked 6 Aug on the new build —
`X-Frame-Options: DENY` and `frame-ancestors 'none'` are both present in-browser.

⚠️ **`navigateFallbackDenylist: [/^\/calendar\.ics$/]` is load-bearing** — without it
the service worker answers the feed with `index.html`. And on this site **a 200 is
not proof a file exists**: the SPA catch-all answers any unknown path with
`index.html`. Check `content-type`.

⚠️ **A Postgres self-assignment (`set x = x`) does NOT fire a `distinct from` check.**
A migration doing exactly this reported success and changed nothing on 6 Aug. **Read
the rows back.**

## Open, not blocking

- No way to edit or cancel a whole group or series. `group_id` and `series_id` are
  both in place as the hook.
- A managed pitch list is the precondition for clash detection.
- Nothing in the UI distinguishes a Medic from a Coach, because there is no
  difference in access. That is deliberate — the word is what distinguishes them.
- **Nobody is emailed when an access request arrives** — Jay checks the Accounts tab.
  ⚠️ This gets busier under roster-match onboarding, since every non-matching address
  lands there. The "Request sent" screen no longer promises an approval email.
- No rate limit on account creation.
- A parent has never signed out in a real browser, and the phone-width note has never
  been rendered. The RLS-refusal path is still mock-only for both events features.
- `saveParents` is delete-then-write, not atomic.
- Stale docs: `claude/runbooks/e2e-roles.md`, `deploy.md` and `first-admin.md` still
  mention Wild Apricot. The real plan is integration with the club's new AWS site.
- Single-club assumption in `clubId` derivation, `is_admin_anywhere()` and
  `can_admin_see_pending()` — revisit together if a second club ever appears.

## Checked and genuinely fine — do not "fix" these

- **`player-photos` bucket is PRIVATE.** Every table in `public` has RLS enabled.
- Anon-executable `SECURITY DEFINER` functions all fail safe on explicit
  `auth.uid() is null` guards raising `42501`. **These advisor warnings are noise.**
- **The 19 unindexed foreign keys.** Every table is 5-315 rows. `auth_rls_initplan`
  is marginal too.
- ⚠️ **Do not size an optimisation from `EXPLAIN ANALYZE` on this schema** — wall time
  is inflated roughly 4x. A 33.9 ms figure was really ~8.6 ms warm. Benchmark it.
- **Nothing in the app or database sends email of its own accord.** Proved 6 Aug: one
  `mailto:` in `src/`, zero user triggers on the relevant tables, and `pg_net`, `http`
  and `pg_cron` are not installed, so the database cannot make an outbound HTTP call.
- **`_transfer.b64` is gone and `.gitignore` covers it.** Resolved; it was flagged in
  this file for days after the fact.

## Machines

`cafnet` (user `Jay`) · `jay-pc` (user `jayjm`). **Run `hostname` first, every
session** — the bridge flaps and has silently reconnected to the other PC
mid-session, and the clone paths differ.

**7 Aug:** cafnet was found **16 commits behind** origin with a clean working tree,
and was fast-forwarded to `bb6aca6`. jay-pc's last confirmed state was `5025497` on
5 Aug and has not been re-checked since. ⚠️ **Assume nothing about either clone.
Measure with `git rev-list --left-right --count`** — see `CLAUDE.md` reading-order
step 2 for why no other probe answers this.

⚠️ **jay-pc had `core.fileMode` drift** — every tracked file showing as locally
modified, exec bit flipped 100644 -> 100755. Set to `false` on 5 Aug, which stops the
mode noise; CRLF/LF content drift on files that session did not touch may remain.

## ⚠️ Documentation debt — check this before trusting `claude/`

Seventeen decision documents, session handoffs, plans and one runbook were written
into the Claude project's uploaded files during 4-7 Aug and **never committed to the
repo**. They were restored to `claude/decisions/`, `claude/handoffs/`, `claude/plans/`
and `claude/runbooks/` on 7 Aug.

**The lesson, which is the point of recording this:** `CLAUDE.md` points a session at
`claude/decisions/` as "the rulings". For three days that folder held three files
while a dozen rulings lived somewhere a cloned repo could not see. **A document that
is not in the repo does not exist.** Write the file in the same breath as making the
decision, and commit it in the same breath as writing it.

⚠️ **Several of the restored documents carry status lines that were true when written
and are not now** — for example `2026-08-06-roster-auto-onboarding.md` opens with
"BUILT AND VERIFIED. NOT PUSHED." Those commits are long since pushed. They were
committed as-is rather than silently edited, because a decision record is a record of
a moment. **Trust this file and the code for current state; trust the decisions for
reasoning.**
