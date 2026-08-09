# State of play

**Entry point per `CLAUDE.md` step 3.** Where things STAND. `RESTORE.md` is what is
TRUE about the codebase. **If this file and `RESTORE.md` disagree, `RESTORE.md` and
the code win and this file is stale.**

Split by VOLATILITY, not topic: anything that changes week to week lives here, so
`RESTORE.md` never has to be edited because a status changed.

*Last updated: 9 Aug 2026 — a "Shipped 9 Aug" section added and the rows it
contradicted corrected in place. Everything below that section is from 7 Aug and was
NOT re-audited on 9 Aug; treat its measurements as two days older than they read.*

*Previously updated: 7 Aug 2026, second session. Rewritten earlier that day against the
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

✅ **`main` is the production branch as of 8 Aug 2026** — GitHub default branch and
Netlify production branch both re-pointed and verified. Deploy `6a76ee63` built from
`main@HEAD` and published; all five security headers confirmed **in a real browser with
the service worker controlling the page**, not from `curl`. Reasoning:
`claude/decisions/2026-08-08-production-branch-main.md`; the rule is `CLAUDE.md` rule 3.

⚠️ **`build/v1-mvp` STILL EXISTS and is at the same SHA. That is a trap, not a safety
net.** Netlify's branch-deploy setting is "Deploy only the production branch", so
`build/v1-mvp` no longer builds anything — the real rollback is republishing an earlier
deploy from Netlify's deploy list, not the branch. Two branches at one SHA is the same
shape as every other drift this file records: **the next person to push to the wrong one
gets a silent no-op.** Delete it once Jay is happy.

⚠️ **No test count here, and none anywhere else either.** Previous editions carried
944, 978, 1057 and 1157 and every one rotted within days; a bare "55 test files" was <!-- count-ok -->
sitting directly above this warning until 7 Aug, contradicting it. **Run `npm test`.**

⚠️ **`npm install` needs `--include=dev` on both PCs** — the reason, and the rest of
the machine environment, is in `CLAUDE.md` under "Facts worth having". **One home;
do not restate it here.** (On jay-pc PowerShell's execution policy also blocks
`npm.ps1` — run npm from `cmd`.)

## ✅ Sign-in is EMAIL + PASSWORD as of 8 Aug 2026, live

`e3fbc60`. Parents create an account with email and password; **magic link and Google are
HIDDEN, not removed** — `SHOW_PASSWORDLESS` in `src/screens/Login.jsx` is the whole
revival. `/reset-password` is a new public route. Decision and full reasoning:
`claude/decisions/2026-08-08-parent-self-registration.md`.

⚠️ **Magic link cannot actually be disabled.** Supabase has no setting for email
*sign-in*, only sign-up. Do not tell anyone passwords are the only way in.

⚠️ **Nothing in the app can delete a LOGIN.** Revoking access removes a membership;
dismissing clears a list. The auth user survives both, can still sign in, and — because
GoTrue answers a repeat signup with 200 and sends nothing — **cannot register again and
gets no error either.** Only the Supabase dashboard or SQL can delete a login. This cost
an hour on 8 Aug. **The pre-pilot wipe must include `auth.users`.**

## 🧹 THE TEST DATA IS GONE — wiped 8 Aug 2026

The stale import (316 players, 315 contacts) and 17 test events were deleted. <!-- count-ok: a historical record of what the wipe removed, fixed in time by definition -->

⚠️ **The table below is a SNAPSHOT taken at the moment of the wipe, and `npm run
docs:check` flagged it on the way in — correctly.** Every count in this file's history
has rotted. **Do not cite these; run the query.** They are here to say what the wipe DID,
not what the database currently holds:

```sql
select 'players' t, count(*) from public.players
union all select 'teams', count(*) from public.teams;   -- etc.
```

| | |
|---|---|
| players | **6**, all named `Test Player One…Six`, all on U16 | <!-- count-ok -->
| player_contacts | 6, all `@example.invalid` — a reserved TLD that can never receive mail | <!-- count-ok -->
| events / availability / invites | 0 | <!-- count-ok -->
| teams | **14** at the time. ⚠️ **Now 18** — renamed and extended 9 Aug, see below |
| auth.users / profiles / memberships | 2 / 2 / 2 — Jay's two admins |
| calendar_tokens | 1, **KEPT** |

⚠️ **The six players are a FIXTURE for the pending-state RLS work, not real data.**
Without a squad roster there is nothing for the pending state to hide, so the thing the
whole design exists to prevent cannot be tested. **Delete them before the pilot.**

⚠️ **`calendar_tokens` was deliberately NOT deleted.** It is Jay's own feed. A subscribed
calendar URL cannot be changed remotely — dropping the token would have silently stopped
his calendar updating with no remedy but re-subscribing by hand.

⚠️ **`invites` and `invite_targets` are `ON DELETE NO ACTION` against `teams` and
`players`.** Both rows pointed at the empty U16, so deleting that team failed until they
were removed first. **Anyone scripting the pre-pilot wipe will hit this.** Order:
events → players → invite_targets → invites → teams.

⚠️ **Storage is NOT wiped by SQL.** `delete from storage.objects` raises
`42501 Direct deletion from storage tables is not allowed. Use the Storage API instead.`
One orphaned player photo survived the wipe for exactly this reason and had to be removed
by hand from the dashboard. **A wipe script cannot clear `player-photos`.**

## ⚠️ Rollout email caps — NOT currently blocking anything

**Both figures below only bite at onboarding, and onboarding is deferred until the
identity question settles. Zero parents are onboarded; there were 5 logins on 8 Aug and
3 were deleted, leaving Jay's 2.**

✅ **Supabase's auth-email ceiling is 200/hour**, measured 8 Aug. ❌ **Three documents
said 2/hour and "not yet done", and a session repeated that to Jay as the live blocker
four minutes into a conversation.** See the correction at the top of
`claude/decisions/2026-08-06-roster-auto-onboarding.md`. **Re-read the dashboard.**

⚠️ **Password signup raises email volume, it does not lower it.** Magic links only needed
sending to the ~50% not on Gmail; everyone needs a confirmation email. Budget ~1 per
parent, plus resets.

## Resend's daily send cap

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

## Shipped 9 Aug 2026 — ten commits, `e19e21b`..`ebe3b6f`, all live

Full account, including what each one cost to find:
`claude/handoffs/2026-08-09-session.md`. The index is `claude/changelog.md`.

**The squads are now the real ones: 15 youth + 3 senior.** ⚠️ **Renamed IN PLACE**, so
ids survived and 6 players, 26 events and 1 membership stayed attached. `teams` is 18,
not the 14 the wipe snapshot above records. Migration `20260809080107 age_groups_rename`
aborts unless it ends with exactly 15 youth + 3 senior and no stale name.

⚠️ **A SAFEGUARDING BUG WAS LIVE UNTIL THIS SESSION.** `src/lib/ageGroup.js` matched
`/^u(\d{1,2})\b/i`. `\b` needs a word boundary after the digits and **a letter is a
word character**, so `U12G QR` matched nothing, the band came back `null`, and
`allowsOwnContact` reads `null` as "a senior side: adults" → true. The app offered a
12-year-old girls' squad the child's own email and phone fields. Fixed with a negative
lookahead. **The lesson is the null default, not the regex: an unparseable name fell
through to the least safe answer.**

⚠️ **The single-gender suffix must TOUCH the digits** (`/^u\d{1,2}([bg])(?![a-z])/i`) —
`U6 Tag` ends in a G. Named squads use word boundaries, because `name.includes('men')`
is also true of "Development". Blank gender on a single-gender squad is refused; a
mismatch **warns loudly and never blocks** — Jay's ruling.

**Coaches and Team Managers approve registrations for their own squads only** — not
medics. ⚠️ **Done as an RPC (`approve_membership`), NOT by widening a policy.**
`memb manage` is `FOR ALL`, so a coach clause would also have granted role changes
(including promotion to admin), squad reassignment and deletion. The migration aborts if
`memb manage` is ever found not to be admin-only. **Do not "simplify" this into a
policy.**

**Approval emails are live** — one send per registration, recipients in **bcc**,
immediate. `notify-approval` v3 fails closed if `APPROVAL_NOTIFY_SECRET` is unset.
Verified end to end on production and the test rows deleted afterwards.

✅ **No emailed link points at `supabase.co` any more.** `/auth/confirm` on our own
domain redeems the `token_hash` via `verifyOtp`. Sender domain ≠ link domain is a
textbook phishing signature and was the one concrete spam cause found; the project ref
also read as "lusmshimxdcxpnrktlgz". Supabase's custom-domain add-on would fix it too at
~$35/mo on Pro — **rejected on cost, not merit** (the org is on Free). Reasoning:
`claude/decisions/2026-08-09-auth-links-and-spam.md`. Every email now carries a
plain-text alternative.

❌ **A WRONG DNS DIAGNOSIS WAS GIVEN TO JAY AND HE NEARLY ACTED ON IT.** A session
queried SPF/MX at `send.adhquins-clubhub.com`, got `NoAnswer`, and reported the records
missing. **Resend puts the bounce/envelope domain one level BELOW the sending domain** —
they live at `send.send.adhquins-clubhub.com` and all three were Verified. His screenshot
disproved it. **Read the provider's own dashboard before diagnosing its DNS.**

⚠️ **`loadMyMemberships` never filtered by profile id**, so RLS decided the answer — and
for an admin RLS returns the whole club. Jay saw two test players under "Your players".
Fixed by an explicit `.eq('profile_id', profileId)`. **Two tests asserted the broken
behaviour and passed**: one checked only `expect(select).toHaveBeenCalled()`, the other
mocked `.select()` resolving directly, so neither could tell a scoped read from an
unscoped one.

Also: an admin **Edit person** sheet (name, phone, role, squads — email deliberately not
editable), the parent's own card now needs an Edit tap before it becomes a form, the
parent phone is no longer dropped on save (`src/lib/parentRows.js` is the single
conversion), the weekday shows in the schedule and a row click opens the detail sheet,
the dashboard's Quick actions heading has its gap back on mobile, and Upcoming has a
Matches/Training/Socials filter with the head renamed to "Schedule".

**Migrations applied live 9 Aug:** `20260809080107 age_groups_rename`,
`20260809083535 register_my_player_gender`, `20260809083640 register_my_player_gender_errcode`,
`20260809092039 squad_staff_approval`, `20260809093858 notify_pending_membership`.
**Edge functions:** `send-email` v30, `notify-approval` v3.

⚠️ **`db/schema/` was NOT re-captured for any of them.** The 7 Aug entry below says
exactly the right thing about why that matters — **re-capture WITH the migration** — and
this session did not.

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
- **Nobody is emailed when an access REQUEST arrives** — Jay checks the Accounts tab.
  ⚠️ **Not to be confused with the 9 Aug approval emails**, which fire for a pending
  REGISTRATION. The access-request path still sends nothing.
  ⚠️ This gets busier under roster-match onboarding, since every non-matching address
  lands there. The "Request sent" screen no longer promises an approval email.
- ✅ **`jayjmuir@yahoo.com` is Jay's DELIBERATE backup admin account.** Confirmed by him
  on 8 Aug. ❌ **This entry said the admin membership was "probably never meant to have"
  and told sessions to get it removed — an inference nobody had checked, carried for
  days.** The only part that survives: **any "a coach cannot see X" test using that
  account is invalid**, because it is an admin. Use a purpose-made account instead.
- **No rate limit on account creation** — only on what an account can do, which
  without a membership is nothing. Verified 7 Aug: no rate-limiting code in `src/`.
- ✅ **`sync_profile_name` single-word-name bug FIXED and APPLIED 8 Aug** —
  `db/migrations/20260808_sync_profile_name_single_word.sql`, applied live as
  `sync_profile_name_single_word`. Verified on a throwaway probe table: `Ahmed` →
  `first_name='Ahmed'`, `last_name=null`; `Ahmed Khan` → `Ahmed`/`Khan`;
  `Jan van der Berg` → `Jan van der`/`Berg`; the explicit first/last branch
  untouched. The `search_path=""` pin survived the `CREATE OR REPLACE`
  (`proconfig` read back), and `prosecdef` is still `false`.
  ⚠️ **The old derivation was re-run inline on the same inputs to prove the check
  could fail** — it returned `Ahmed`/`Ahmed` with the guard evaluating `false`, so
  the pass above means something. `db/schema/functions.sql` re-captured with it.
  **The history below is kept because the way this was mis-described is the lesson.**
  ⚠️ **`sync_profile_name` mangled a SINGLE-WORD name, and its own comment said it
  should not.** The comment reads "a single-word name is a first name with no family
  name, not the reverse", but the guard that implements it never fires: for `Single`,
  `regexp_replace(full_in, '\s+\S+$', '')` finds nothing to strip and returns
  `Single`, so `first_name` is never null and the `if first_name is null` branch is
  dead. Result: **`first_name = 'Single'` AND `last_name = 'Single'`.**
  ⚠️ **Pre-existing, NOT caused by the search_path change** — proved by running an
  unpinned copy of the original function side by side on 7 Aug; identical output.
  **No real row has hit it yet** (all 5 profiles have two-word names, 0 with
  `first_name = last_name`), so this is latent, not live. ⚠️ **The claim that it fires "the first time a parent
  types one word into the name gate" is WRONG, and it mattered** — `NamePrompt.jsx:96`
  calls `updateProfileNames({firstName, lastName})`, which takes the FIRST/LAST branch
  of the trigger, where no split happens. The gate cannot reach the bug. What reaches
  it is `private.handle_new_user()` (`db/schema/functions.sql:414`), which inserts
  `full_name` from `raw_user_meta_data->>'full_name'` — the provider display name — on
  **every new signup**, taking the full_name branch. So this is on the signup path for
  all 146 parents, not a rare gate case. Fix is to test the *split*, not
  `first_name`: `if position(' ' in full_in) = 0 then last_name := null`.
- ✅ **`db/schema/` RE-CAPTURED 7 Aug** after three days and ~14 migrations. **Nothing
  unintended was found** — all 22 function bodies now match live byte-for-byte, all 31
  policy expressions verified against the catalogue, and every delta traced to a known
  migration. ⚠️ **That is luck, not process**: one unintended change hidden in a delta
  that size would not have been spotted, which is the whole job. **Re-capture WITH the
  migration.** The near-miss worth remembering: `tables.sql` carried a block headed
  "DELIBERATE ABSENCE OF A UNIQUE CONSTRAINT" on `memberships` while a unique index had
  existed since 6 Aug — the file asserted the opposite of the truth about a constraint
  governing duplicate access rows.
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
- ✅ **`private.sync_profile_name` `search_path` PINNED 7 Aug** —
  `db/migrations/20260807_sync_profile_name_search_path.sql`. `proconfig` read back,
  trigger re-tested on a throwaway probe table, and `function_search_path_mutable` is
  gone from `get_advisors`. **Every remaining security warning is now on the
  "noise" list below.** `BEFORE INSERT OR UPDATE` on `profiles`.
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
  ❌ **This bullet ended with "Not applied — a live schema change needs Jay's yes"
  until 8 Aug, four lines under its own ✅ PINNED heading.** It was leftover from the
  pre-fix edition. The pin IS applied — `functions.sql` shows `SET search_path TO ''`.
  **A file whose job is catching stale claims contradicted itself inside one bullet.**
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
  query both say 18.) ⚠️ **The row counts that made this negligible are GONE as of the
  8 Aug wipe** — `players` is now 6, not 316. The conclusion still holds (an index on an
  empty table is pointless), but **re-measure before citing this once real data lands**:
  a 300-row table and a 3,000-row one are different arguments. Counts when written:
  `availability` 0, `players` 316,
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

**Measured 8 Aug** (⚠️ both rows are now about `main`, not `build/v1-mvp`):

| Clone | State |
|---|---|
| **jay-pc** (`jayjm`) | **On `main` at `39d6c06`, `0 0` with origin, clean.** Started the session on `build/v1-mvp` at `066df2c`, `0 0`. All four of this session's commits were made and pushed from it |
| **cafnet** (`Jay`) | **UNMEASURED — the bridge was on jay-pc all session.** Last seen `bb6aca6` on 7 Aug, which is now ~24 behind, **and it is checked out on `build/v1-mvp`, which is no longer the production branch.** It needs `git fetch origin && git checkout main` before anything else happens there. ⚠️ **This row is a memory, not a measurement** — `CLAUDE.md` rule 8 says do not write a machine fact you did not measure on the machine, so treat it as a to-do, not a state |

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

⚠️ **AND IT HAPPENED AGAIN ON 9 AUG.** All three of that day's decision records —
`2026-08-09-single-gender-squads.md`, `2026-08-09-approvals-emails-and-accounts.md`,
`2026-08-09-auth-links-and-spam.md` — were written into the Claude project and left
out of the repo until the end of the session, when `npm run docs:check` caught one of
them as a broken path reference. **The check found it; the process did not.** One of
them also carried a live secret in plain text, which is why the committed copy names
the secret and not its value: **this repo is public.**

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
