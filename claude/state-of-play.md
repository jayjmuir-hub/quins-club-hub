# State of play

**Entry point per `CLAUDE.md` step 3.** Where things STAND. `RESTORE.md` is what is
TRUE about the codebase. **If this file and `RESTORE.md` disagree, `RESTORE.md` and
the code win and this file is stale.**

Split by VOLATILITY, not topic: anything that changes week to week lives here, so
`RESTORE.md` never has to be edited because a status changed.

*Last updated: 7 Aug 2026, second session. Rewritten earlier that day against the
CODE, not against the previous edition — the 5 Aug version had gone badly stale and
was still telling sessions that auth email was dead and that a Manager role did not
exist. Both false.*

*Then **audited claim by claim against the code and the live database** in a second
session. 20 claims confirmed, 6 corrected, 4 gaps added — each correction is marked
inline with what it used to say, so the next session can see which way the drift ran.
⚠️ **The pattern worth noticing: every wrong claim was a rotted MEASUREMENT, never a
wrong ruling.** Counts, row totals and "there is exactly one X" all decayed within
days; the reasoning never did. **Re-measure numbers, trust the rulings.***

## Where things stand

**v1 MVP complete and live at `https://adhquins-clubhub.com`** (Let's Encrypt cert,
expires 3 Nov 2026). `app.adhjrt.com` remains a working alias, deliberately not
removed. ⚠️ **adhquins-clubhub.com is the canonical origin** — `CALENDAR_ORIGIN` in
`src/data/calendar.js` is hard-coded to it, and a subscribed calendar URL cannot be
changed remotely once a parent holds one.

Current phase is post-v1 refinement: usability work driven by Jay using the app, not
new infrastructure.

⚠️ **No test count here, and none anywhere else either.** Previous editions carried
944, 978, 1057 and 1157 and every one rotted within days; a bare "55 test files" was <!-- count-ok -->
sitting directly above this warning until 7 Aug, contradicting it. **Run `npm test`.**

⚠️ **`npm install` needs `--include=dev` on both PCs** — the reason, and the rest of
the machine environment, is in `CLAUDE.md` under "Facts worth having". **One home;
do not restate it here.** (On jay-pc PowerShell's execution policy also blocks
`npm.ps1` — run npm from `cmd`.)

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

**146 parents need magic links.** At 100/day that is two days minimum, and
realistically three once retries and mistyped addresses are counted.

⚠️ **This said 143 until 7 Aug, from a Gmail count of 136 that was never re-measured.**
Counted live against `player_contacts` on 7 Aug: **279 distinct roster addresses, 133
of them Gmail** (`279 − 133 = 146`). 62 more are Outlook/Hotmail/Live/MSN — the 22%
that a Microsoft OAuth button would take off email entirely.

### ⚠️ Hitting the cap does not look like a limit

Resend returns `429 daily_quota_exceeded` -> the Send Email Auth Hook returns 500 ->
GoTrue returns `500 unexpected_failure`, message
`"Unexpected status code returned from hook: 500"`.

The rate-limit pattern `/rate limit|too many requests|429/i` does **not** match that
string — it contains none of those words. So the message a parent sees depends
entirely on a second, separate pattern.

✅ **`friendlyAuthError` ALREADY handles this.** `src/screens/Login.jsx:67` carries
`EMAIL_SEND_FAILED = /status code returned from hook|unexpected_failure/i` alongside
the rate-limit pattern, so a parent past the cap gets a readable message, not raw
internal text. ⚠️ **The 6 Aug edition of this file said the fix was still outstanding
and that claim was carried forward unverified on 7 Aug. It was wrong both times.**
The raw text was seen by Jay at 04:44 on 6 Aug and is in the auth logs; the fix
landed after that.

**Two ways out of the cap itself, not yet decided:**

1. **Pay-as-you-go**, $0.90 per 1,000 emails — the whole rollout is roughly **$0.15**.
   Removes the cliff entirely. Needs a card on the account: **a purchase, so Jay does
   it, not the assistant.**
2. **Stagger by age group** and stay under the cap — free, but stretches the rollout
   across several days and leaves the cliff in place for anyone who retries.

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
- ⚠️ **`jayjmuir@yahoo.com` holds a full admin membership it was probably never meant
  to have.** Jay can fix this himself from the Accounts screen. **Until then, any
  "a coach cannot see X" test using that account is invalid** — it is an admin.
  (Carried over from `RESTORE.md`'s "Outstanding" section when that was removed on
  7 Aug; it is status, so it belongs here.)
- **No rate limit on account creation** — only on what an account can do, which
  without a membership is nothing. Verified 7 Aug: no rate-limiting code in `src/`.
- A parent has never signed out in a real browser, and the phone-width note has never
  been rendered. The RLS-refusal path is still mock-only for both events features.
- `saveParents` is delete-then-write, not atomic.
- ✅ **Stale runbooks FIXED 7 Aug.** `deploy.md`, `e2e-roles.md` and `first-admin.md`
  described a world with no roster data and a club site the app had to work around.
  All three now carry a status banner and corrected sections. The integration target
  is the club's new AWS site — `claude/plans/2026-08-03-future-aws-migration.md`.
  ⚠️ **`npm run docs:check` now fails the build if that terminology comes back.**
- Single-club assumption in `clubId` derivation, `is_admin_anywhere()` and
  `can_admin_see_pending()` — revisit together if a second club ever appears.
- ⚠️ **`private.sync_profile_name` has a mutable `search_path`** — the one security
  advisor finding that is NOT on the "noise" list below, and it was in neither this
  file nor `RESTORE.md` until 7 Aug. `BEFORE INSERT OR UPDATE` on `profiles`.
  ❌ **This entry said "a `SECURITY DEFINER` trigger function" in commit `1f75dae`
  and that was wrong** — `pg_get_functiondef` shows plain `LANGUAGE plpgsql` with no
  `SECURITY DEFINER`, so it runs as the caller. **I asserted the property instead of
  reading it, in the same commit that corrected six other people's unmeasured claims.**
  That makes it lower risk than stated, not higher.
  **The fix is one line and needs no body change:**
  `alter function private.sync_profile_name() set search_path = '';`
  Safe because the body references no schema-qualified object and no non-catalog
  function — only `nullif`, `btrim`, `concat_ws`, `regexp_replace` and `NEW`/`OLD`,
  and `pg_catalog` stays on the path whatever `search_path` is set to.
  **Not applied — a live schema change needs Jay's yes.**
- ⚠️ **`db/migrations/` holds 17 files against 51 applied migrations.** Supabase's own
  list is authoritative. `events_series_id` (`20260805133133`) is applied with no file
  in the repo, and `src/screens/EventForm.jsx` writes the column it adds. **The 6 Aug
  edition of this file carried this warning; the 7 Aug rewrite dropped it and the
  audit put it back.** Detail in `claude/schema-history.md`.
- ✅ **`claude/changelog.md` backfilled 7 Aug** and now enforced: `npm run docs:check`
  fails if a commit is missing or cites a SHA that is not a commit. ⚠️ **The changelog
  is allowed to be exactly one commit behind** — a commit cannot cite its own SHA — so
  the NEXT commit must always catch it up.

## Checked and genuinely fine — do not "fix" these

- **`player-photos` bucket is PRIVATE.** Every table in `public` has RLS enabled.
  Both re-verified live 7 Aug.
- Anon-executable `SECURITY DEFINER` functions all fail safe. **These advisor warnings
  are noise.** ⚠️ **But not by the mechanism this file claimed** — it said "all on
  explicit `auth.uid() is null` guards", and only `claim_roster_access` uses that.
  Checked live 7 Aug:
  - `claim_roster_access` — explicit `auth.uid() is null` → `42501`.
  - `set_own_player_gender`, `set_own_player_photo` — guard on
    `private.is_own_player()`, which matches `memberships.profile_id = auth.uid()`;
    anon gets no row, so it returns false and the function raises `42501`. Fail-safe,
    different route.
  - ⚠️ `calendar_events_for_token` — **no uid guard at all, deliberately.** It is the
    calendar feed; anon is the point and the token is the gate. **Do not "fix" it to
    match the others.**
- **The 18 unindexed foreign keys.** (This file said 19; the advisor and a catalogue
  query both say 18.) Tables run 0-316 rows — `availability` 0, `players` 316,
  `player_contacts` 315. `auth_rls_initplan` is marginal too.
- ⚠️ **Do not size an optimisation from `EXPLAIN ANALYZE` on this schema** — wall time
  is inflated roughly 4x. A 33.9 ms figure was really ~8.6 ms warm. Benchmark it.
- **Nothing in the app or database sends email of its own accord.** ⚠️ **The conclusion
  holds but two of the three evidence lines had rotted by 7 Aug** — re-measured:
  - **7 `mailto:` links in `src/`**, not one: `PlayerDetail.jsx` ×5, `DeleteAccount.jsx`,
    `Privacy.jsx`. All user-initiated anchors; none sends anything by itself.
  - **One user trigger, not zero:** `profiles_sync_name` on `profiles`, calling
    `private.sync_profile_name` — added by the split-name work on 6 Aug. It syncs
    `name` from first/last and sends nothing.
  - `pg_net`, `http` and `pg_cron` are **still not installed**, so the database cannot
    make an outbound HTTP call at all. That is the line the conclusion actually rests
    on, and it is the one that held.
- **`_transfer.b64` is gone and `.gitignore` covers it.** Resolved; it was flagged in
  this file for days after the fact.

## Machines

Machine rules — clone paths, `hostname`, `NODE_ENV` — live in `CLAUDE.md`. **Only
volatile clone STATE belongs here**, and it is stale the moment either PC is touched.

**Measured 7 Aug, second session:**

| Clone | State |
|---|---|
| **jay-pc** (`jayjm`) | **`1f75dae`, `0 0` with origin, clean.** Found 4 behind at `bf1d884`, fast-forwarded, and both of that session's commits were made and pushed from it |
| **cafnet** (`Jay`) | **`bb6aca6`, and now ~19 behind.** Fast-forwarded there earlier on 7 Aug after being found 16 behind; not touched since, because the bridge was on jay-pc |

⚠️ **Assume nothing about either clone — these two rows rot on the next push.**
Measure with `git rev-list --left-right --count`; see `CLAUDE.md` reading-order
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
