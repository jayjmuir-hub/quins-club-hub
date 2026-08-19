# Handoff — 19 Aug 2026, notifications v2 (and the day push became a feature)

**History, not instruction.** This describes a moment. Check anything here
against the code and the database before acting on it.

## Where main is

**`ce82097`** — "feat(push): notify the squad when a fixture is added, moved or
cancelled (#248)". Nine pull requests merged this day:

| PR | Squash | What |
|---|---|---|
| #240 | `4e6652a` | TRUNCATE revoked from `authenticated` across `public` |
| #241 | `28b0cb2` | Tapping a notification goes to the thing it is about |
| #242 | `60c2cdc` | That fix, proved on a real phone |
| #243 | `93374cc` | Help tickets: hide resolved, and an admin may delete |
| #244 | `24eb548` | Notice notifications + per-category opt-outs |
| #245 | `ea9fa29` | The notifications card on Home |
| #246 | `7445d44` | PowerShell is `RemoteSigned`, not `Bypass` |
| #247 | `41eb0bc` | The sign-in gate offers notifications as its last step |
| #248 | `ce82097` | Fixture added / moved / cancelled |

⚠️ **THE NEXT BRANCH MUST CITE `ce82097` IN THE CHANGELOG AS ITS FIRST EDIT** —
this handoff does it, so a branch cut from `main` after this one is clean.

## ⚠️ THE ONE THING BUILT, DEPLOYED AND STILL UNPROVEN

**A `squad_push` payload has never reached the deployed `push-send`.**

Fixture notifications are verified up to the pg_net queue inside a rolled-back
transaction — which means `push-send` never actually ran, because the rollback
removes the queued request. The function is at **version 5** and its
`squad_push` branch is deployed, but no real fixture change has exercised it.

⚠️ **A LIVE TEST IS UNUSUALLY SAFE RIGHT NOW AND WILL NOT STAY THAT WAY.** The
only subscriber is Jay, and he is attached to no squad — so a real fixture
change sends **zero** notifications while still exercising the whole path in the
logs. The moment anybody attached to a squad subscribes, that stops being true.

**To close it:** make one real fixture change (a kick-off time, a venue), then
read the Supabase logs for `rpc/squad_push_subscriptions` followed by a 200 from
the function.

## Waiting on Jay

- **`SUPABASE_DB_URL` repository secret is STILL unset**, and it now costs more
  than it did: **seven** harnesses in `db/tests/` have never been run by the
  runner — only proved through the Supabase MCP. The nightly
  `.github/workflows/db-check.yml` passes green while checking nothing.
  Settings → Secrets and variables → Actions.

## ✅ A process change worth more than any single feature

**The Supabase CLI is now authenticated on cafnet, and Claude's shell can use
it.** `npx supabase functions deploy push-send --project-ref … --no-verify-jwt`
runs from Claude's Bash tool. Edge-function deploys are no longer a thing Jay
has to do.

⚠️ **`--no-verify-jwt` IS NOT OPTIONAL.** Postgres calls `push-send` with no JWT.
Deploying with verification on breaks the trigger **silently** — and that
failure looks exactly like "nobody is subscribed", which cost an hour on the
morning of 19 Aug.

⚠️ **The login itself could not be automated and probably never can be.** The
CLI refuses its device flow in a non-TTY environment and demands a token via
flag or env var — which is the one thing Claude must not handle. Jay ran
`npx.cmd supabase login` in his own terminal, once.

## Traps found today, in rough order of how much time they cost

**⚠️ A MACHINE FACT MEASURED IN THE WRONG SHELL.** `CLAUDE.md` recorded cafnet's
PowerShell as `ExecutionPolicy: Bypass`. It is `RemoteSigned`; `Bypass` is set at
**Process** scope by Claude's own tooling, for itself. **The 11 Aug "correction"
had overwritten a TRUE statement with a false one.** And Claude cannot detect
this from its own side — the Bash tool is Git Bash, so it calls `npx.cmd` and
never touches the blocked `.ps1` wrapper: every command Claude runs succeeds
while the identical command fails for Jay. Fixed in #246. **Rule 8 now has a
clause: measure it in the SHELL, and as the USER, the instruction will run in.**

**⚠️ CHROME DOES NOT RENDER BACKGROUND TABS, AND IT LOOKS LIKE AN OUTAGE.** The
Supabase dashboard was declared broken after four failed attempts to drive it;
`document.visibilityState` was `"hidden"` every time. The one attempt that
worked was the one fronted tab. **Diagnose with `document.hidden` before
concluding a site is down.**

**⚠️ `private.touch_announcement` PINS `author_id` ON EVERY UPDATE** — along with
`club_id`, `team_id` and `created_at`. A test that created a notice and then
UPDATED the author to check "the author is not notified of their own notice"
changed nothing at all, and **reported the feature broken when the test was
broken.** The author case has to be a second INSERT, made as that person.

**⚠️ A REVOKE ISSUED BY SOMEONE WHO IS NOT THE GRANTOR SUCCEEDS AND DOES
NOTHING.** No error. `revoke truncate on storage.objects from authenticated` ran
clean as `postgres` and the privilege was still there. A migration naming those
tables would have applied cleanly, reviewed as correct, and been a lie. **Assert
the outcome; a statement succeeding proves nothing.**

**⚠️ THE 51 EXISTING `NamePrompt` TESTS DID NOT CATCH AN EXTRA GATE STEP.**
Injecting "always offer" — a fault that puts an unexpected modal in front of
every user on the sign-in path — left every one of them green. They assert that
a PARTICULAR step went away, not that the gate CLOSED. The new lock-out test is
the only thing in a 2,950-test suite that would notice a gate which never
closes. **Do not delete it.**

**⚠️ A NEGATIVE CHECK THAT FAILS FOR THE WRONG REASON.** The first fault
injection on the ticket-delete UI failed the *delete* tests when the *hiding*
filter was disabled — two rows meant two "Delete" buttons and the query was
ambiguous. Tests that fail for the wrong reason prove nothing; those tests now
render a single row.

## Design rulings made today, each with the argument against recorded

- **Notification audiences are narrower than read policies, deliberately.** A
  squad notice does not go to admins of other squads (126 → 51 pairs, 5 people
  spared per notice). ⚠️ That is two rules where there was one, so
  `db/tests/notice-push.sql` asserts the **subset**, not an equality — an
  equality would go red the moment somebody legitimately widened `can_see_team`.
- **Opt-OUTS, not preferences.** A row means off; no row means on. No backfill,
  ever. ⚠️ The cost is that "who wants fixture alerts" is now an absence to
  query — revisit only if an admin screen must SHOW everyone's preferences.
- **Only a statement touching exactly ONE fixture notifies.** Enforced by
  STATEMENT-level triggers with transition tables. Measured first: 50 of 63
  events were created as a series, biggest 18, and 18 landed in one minute.
- ⚠️ **Entering a score must never notify**, and `events` is full of score
  columns. The change trigger names only parent-facing fields, so adding a
  column cannot silently add it to the notification.
- ⛔ **"Notifications on by default" is not implementable** and will be asked
  again. Permission belongs to the browser, is per DEVICE and per BROWSER, and
  prompting on load makes Chrome demote the site permanently.

## Still open

- **Two notification categories not built**: admin-approval (cheap now — a
  trigger plus a branch) and the availability nudge (**expensive** — it needs a
  schedule, not a row change).
- **The CLI's `.temp` scratch directory under `supabase/` is not gitignored**
  and reappears on every deploy. ⚠️ Do not write its path in a doc as a literal
  `supabase/`-prefixed string: `docs:check` resolves those, the directory is
  transient, and this handoff went red in CI for exactly that — green locally
  only because the directory happened to exist at the time.
  Left out deliberately: `.gitignore` is not matched by
  `scripts/netlify-ignore.mjs`'s root-markdown pattern, so one line would cost a
  full production build. **Fold it into the next change that builds anyway.**
- **10 of 15 squads still have nobody attached.** Jay's position is unchanged
  and it is not blocking — but note the new symptom: a squad notice or fixture
  change for those squads now notifies **nobody**, silently.
