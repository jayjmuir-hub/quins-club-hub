# Open items

**Known, not blocking, not forgotten.** Split out of `state-of-play.md` on
14 Aug 2026 so that file could go back to being about today.

⚠️ **MOST OF THIS IS THE 13 Aug 2026 PRODUCTION-READINESS AUDIT, AND THIS IS THE
ONLY RECORD OF IT.** The report itself was a session artefact and was never
committed, deliberately — it was a dated verdict. **An item deleted from here is
a finding that ceases to exist.** Tick things off by striking them through with
the evidence, never by removing the line.

Everything is **not started** unless it says otherwise. Ordered by cost to fix.

## The 16 red db harnesses — triaged 31 Aug 2026, every one MEASURED

**The nightly db-check had been red since 22 Aug and nobody triaged it for
nine days** — the exact failure mode `claude/runbooks/db-harnesses.md` was
written about ("a check nobody runs is not a check"; here, a check nobody
READS). The 16 failures surfaced during the documents-repo build; each was
measured against live production, none assumed. **No security regressions.**
Two categories:

**Category A — 14 stale harnesses, repointed (all green again):**

| Harness | What actually happened |
|---|---|
| ~~`delete-for-good`, `squad-chat-phase3`, `group-chats` (assert 7)~~ | The welfare gate (`20260828_dm_review_welfare`, `20260830_welfare_review_gate`) deliberately took DM/group review off plain admins; the personas never got the grant. Repointed: the admin persona holds `welfare`; the negative lives in `db/tests/dm-review-welfare.sql` |
| ~~`rls-staff-photos`~~ | Ruling C (26 Aug, in `can_see_staff_photo`'s own body): any active member sees any staff photo. Step 1's expectation FLIPPED; new discriminating arms added (caller demoted → false; non-staff subject → false), each proven against an injected fault |
| ~~`push-subscription-takeover`~~ | `20260830_push_hardening`'s endpoint allowlist refused the `push.example.invalid` fixture endpoints. Repointed to an allowlisted host shape |
| ~~`rls-pending-membership`~~ | Picked the squad's EARLIEST event; `20260827_availability_self_lock` rightly refuses availability writes on past events. Now filters to self-editable events |
| ~~`signup-nudges`, `volunteer-no-squad`~~ | `20260829_hold_bare_signup` pre-dismisses bare signups with an `access_requests` row; the bare fixture users collided on the unique key (volunteer-no-squad's "policy half missing" message was a misread of that 23505). Trigger-minted rows now cleared before the probes |
| ~~`notice-push`~~ | Picked `push_subscriptions limit 1` as a poster; subscriber №1 is now a PARENT (36 subscribers, 2 admins). The runbook's "grows red as the club grows" class. Both picks now require role `admin` |
| ~~`training-plans`~~ | Published against the club's FIRST REAL squad; season trainings entered the 10-day window and the counts drifted (w=5). Now uses a synthetic squad — counts exact by construction |
| ~~`parent-row-on-create`~~ | BORN BROKEN — committed 25 Aug after that morning's nightly, never green: `min(uuid)` does not exist; also collided with `register_my_player` now writing the parent membership itself, and the self-test's replace lost to live parameter names |
| ~~`my-chats-attachment`~~ | BORN BROKEN — committed 28 Aug after that morning's nightly: wrote to a postgres-owned temp table while running as `authenticated` |
| ~~`chat-list`, `group-chats`~~ | Inlined their migrations VERBATIM, so (a) every assertion tested the replay, not production — a live policy could regress unseen — and (b) the replay died once `my_chats` grew columns ("cannot change return type"). Replays deleted with tombstones; both now assert against LIVE, proven by injecting a live-policy fault and watching them go red |
| ~~`grants` (two of its three complaints)~~ | Allowlist rot, its own header's predicted failure: the ten Phase 1b per-column `profiles` SELECTs (28 Aug, all captured in `db/schema/grants.sql`) and `list_signup_squads`' deliberate anon grant (25 Aug). Both allowlists extended |
| ~~`search-path` (its second arm)~~ | `20260830_pin_private_helper_search_path` pinned `squad_expects_gender` but left it on the harness's exemption list — hidden behind the other failure. List now empty; `db/schema/functions.sql` branch-3 note updated |

**Category B — 3 real production drifts. ~~The harnesses are RIGHT and stay red
until `db/migrations/20260831_harness_drift_fixes.sql` is applied~~ APPLIED to
production 31 Aug 2026 on Jay's explicit "drive everything" — evidence: full
`npm run db:check` immediately after prints "All harnesses passed", the first
fully green run since 22 Aug, and the dispatched Actions run 33376108406 is
green end-to-end. ⚠️ TWO sessions applied it within three minutes of each
other (Jay told both to drive); the SQL is idempotent so production is fine,
but the duplicate `schema_migrations` row — the exact disease that broke
database branching here — was deleted the same hour, keeping version
20260831085858 only.** None was exploitable; all were the repo's own hygiene
rules missed by one migration each:

1. **`rls-initplan`** — bare `auth.uid()` in `"officers read member"`
   (`20260826_club_officers`) and BOTH `pitch_share_approvals` policies
   (`20260830_pitch_share_approvals`); the harness reports one at a time, so
   the queue was invisible. Per-row re-evaluation, a performance drift.
2. **`search-path`** — `private.push_endpoint_allowed`
   (`20260830_push_hardening`) has a mutable search_path. Pure SQL over its
   argument, nothing to hijack today; pinned `''` like its siblings.
3. **`grants`** — anon can EXECUTE `public.complete_signup_intent`:
   `20260825_signup_before_confirm` revoked PUBLIC but not Supabase's NAMED
   anon grant — the trap the harness's own message describes. Guarded inside
   the function (raises on null uid), so defence in depth only.

✅ **CATEGORY B IS CLOSED — `20260831_harness_drift_fixes.sql` HAS BEEN APPLIED,
AND `npm run db:check` IS NOW FULLY GREEN. Measured 31 Aug 2026** during the
documents-repo final review, when a full run came back **81 harnesses, 0
failures** — three more than the expected-red list predicted. Verified against
production rather than inferred from the green run, each with a control:

- `officers read member` and BOTH `pitch_share_approvals` policies now read
  `( SELECT auth.uid() AS uid)` — the initplan-safe form — read out of
  `pg_get_expr(polqual/polwithcheck)`, not pattern-matched.
- `private.push_endpoint_allowed` has `proconfig = search_path=""`.
- `anon` EXECUTE on `public.complete_signup_intent` is **false**, with
  `authenticated` EXECUTE **true** as the control proving the probe can see a
  privilege that IS held.
- The migration is recorded in `supabase_migrations.schema_migrations`.

⚠️ **SO ANY DOCUMENT STILL SAYING THESE THREE ARE RED IS STALE**, including the
`b6b43fc` changelog entry's "stay red until Jay applies the migration" and any
session ledger pinning them as expected-red. Struck through here rather than
deleted, per this file's own rule.

### Two latent defect classes in `db/tests/`, surfaced 31 Aug 2026 — NOT fully swept

**1. Green-by-luck under transaction-constant `now()`.** Everything one
transaction inserts shares ONE `now()`, so a fixture asserting "the later row
wins" over `created_at`/`last_at` ordering with no tie-break tests scan order,
not time — and passes against the very bug it guards. Found via
`my-chats-attachment.sql` (went red when the photo-albums backfill perturbed
row order; fixed on that branch) and confirmed in `chat-list.sql` assert 5,
which passed only because a label tie-break met an empty fixture name —
~~fixed same day~~ fixed with an explicit stagger, proven BOTH directions
(dm-newer passes, dm-older-via-`conversations.last_at` fails — and the first
flip attempt via `messages.created_at` did NOT flip it, which is how
`conversations.last_at` was found to be the real driver). ⚠️ **The sweep is
NOT complete:** any "latest/supersedes/wins" assertion over a column that
transaction-time populates is suspect, and the ordering often hides inside the
FUNCTION under test, so grepping harness files for `order by` cannot find it.
Remaining candidates screened shallowly: `adult-dms-private.sql`,
`availability-nudge.sql`, `group-chats.sql` step 12.

**2. Pre-assert migration replays mask production.** `chat-list.sql` and
`group-chats.sql` replayed their migrations verbatim before asserting — so
the asserts tested the replay, and a live regression stayed green (both
tombstoned in the 31 Aug triage). **30 more files in `db/tests/` contain
`create or replace function public./private.`** — many are the legitimate
post-assert fault-injection pattern, but nobody has classified which. Each
pre-assert replay found should be tombstoned the same way. The audit: for
each file, does the replace happen BEFORE the assertions run against it?

**The finding underneath all of it:** eight of the fourteen staleness cases are
migrations that shipped WITHOUT updating the harnesses they invalidated —
`claude/runbooks/db-harnesses.md`'s "add the harness in the same commit as the
migration" has a missing half: **change the harness in the same commit as the
migration that breaks it**. The nightly caught every one of these within a day;
what failed was that nobody read the nightly. ~~Worth deciding: should a red
nightly page somebody?~~ DECIDED AND DONE, 31 Aug 2026: a red run now opens or
bumps a GitHub issue (no secret, cannot sit unarmed — #589 plus the YAML fix),
and the Better Stack heartbeat `db-check nightly` exists with its no-secret
drill running; the `DB_CHECK_HEARTBEAT_URL` secret goes in after the "missing"
alert proves firing — `claude/runbooks/monitoring.md` step 3.

**Source:** Grok's 29 Aug 2026 read-only sweep, every item independently
**verified by Claude** against the code on `main` and — for the two criticals —
against the **live production database**. Remediation plan:
`claude/plans/2026-08-30-grok-sweep-remediation.md` (10 dependency-ordered PRs;
nothing authorised). Severities below are the **corrected** framing both
reviewers agreed, not Grok's original labels. Written here BEFORE the first PR
because a plan is superseded once shipped and this file is the register that
survives; strike items through with evidence as they land, never delete them.

⚠️ **RE-VALIDATED 30 Aug 2026, after ~20 PRs merged (pitch rework #533-#547,
role channels #550/#551, whole-club events, hygiene #552).** Every item still
substantively stands EXCEPT one half of item 14, fixed below — but five things
moved, and the detail lines below have NOT all been re-numbered (scope.js and
messages.js grew; trust the symbol name over the line number). Items 1 & 2
re-confirmed against prod (`pg_get_functiondef` / `pg_policy`): `welfare_overview`
gate still `is_admin`, `report read`/`report resolve` still `is_admin`. What
changed:

0. **Item 14's `chat_media_owner` unpinned half is FIXED by #552** — proven
   live, `proconfig = search_path=""` (so is `squad_expects_gender` and
   `social_idea_owner`). `db/tests/search-path.sql` is no longer at risk of
   going red. The OTHER half of item 14 — the stale `db/schema/policies.sql`
   bodies (player-private read via `can_edit_team`, photo read via
   `can_see_team`, welfare-log read via `is_admin`) — still stands and still
   needs a recapture.

1. **Item 3 is now PARTIAL — Pitch Glance only.** The pitch rework incidentally
   fixed the ALLOCATION path (it reads `listEvents`, which filters
   `tournament_id IS NULL`, `src/data/events.js:73`). **Pitch Glance still
   leaks** — it reads `listPitchOccupancy` → the `pitch_occupancy` RPC
   (`db/migrations/20260829_pitch_portion.sql:44-77`), which STILL has no
   `tournament_id` filter. The new `src/lib/pitchOccupancy.js` is display math
   only and did not touch this. The harness is still broken (return-type
   mismatch, now worse). Fix unchanged (RPC filter), impact narrowed to Pitch
   Glance.
2. **Item 2's fix is no longer a simple predicate swap.** Role channels
   (`db/migrations/20260830_role_channels.sql`) made "report handling is an
   admin duty" explicit, and `message_reports` is ONE table gating every report
   type (minor-DM, squad-chat moderation, AND role-channel). A flat
   `is_admin → can_review_dm` would over-restrict *general chat moderation* to
   welfare holders only. The fix must **distinguish minor/DM reports (welfare)
   from general channel-moderation reports (admin)**, or Jay rules that report
   handling is a welfare function wholesale. Decide before writing PR 1.
3. **New adjacent surface from role channels — bounded.** `welfare_overview` is
   NEUTRAL (not touched; its report joins are filtered to `channel in
   ('squad','staff')`, so a narrowed admin gains no role-channel counts there).
   But because `message_reports` read/resolve are still `is_admin`, a narrowed
   admin can now also **see a role-channel report exists and delete the reported
   message** — content stays protected (`in_role_channel` gates reads; Welfare
   requires the `welfare` right). The items-1/2 fix closes the metadata half too.
4. **Item 7 comment partially self-corrected** (a CHILD-CONTACTS ALLOWLIST note
   was added to `scope.js` ~:364-377), but the flat "a right withholds nothing"
   line still reads as written; and **item 9's unconditional ChatList pass now
   also swallows the five role channels** (`headcoaches`/`managers`/`medics`/
   `welfare`/`clubstaff`), unfiltered under view-as. Both still stand.

⚠️ **Four framing corrections were agreed and are baked into the labels below:**
(1) `canEditTeam` is **UX, not HIGH** — RLS already refuses the write. (2) The
`push-send` `path` "open redirect" is a **non-issue** — `APP_URL + path` keeps
`//host` same-origin; the real bug is attacker-chosen lock-screen title/body.
(3) The push-endpoint SSRF is **blind** — the worker's `fetch` response never
returns to the caller; the threat is outbound internal reachability, not
exfil-to-client, so the fix is an endpoint allowlist, not response-hiding.
(4) `chat_media_owner` unpinned would turn `db/tests/search-path.sql` **red on
next run** — caught-on-run, not silently slipped (`social_idea_owner` IS pinned;
Grok's sibling comparison was the only imprecise word and the substance holds).

### Needs Jay (blocks specific PRs)

- **Grant the `welfare` right to a safeguarding person — HARD PRECONDITION on
  the welfare-close PR.** `private.can_review_dm` has **no super-admin
  short-circuit** (deliberate, 28 Aug) and **nobody holds `welfare` today**, so
  the moment the welfare directory/reports are moved off `is_admin` (below), the
  Welfare dashboard and Reports go empty **for everyone, including a super**,
  until the tick exists. That is the intended Phase-4 posture *after* the grant,
  not a window in which minor-DM review is a total lockout. The SQL must not go
  to `main` before/without the grant.
- **Item 13 — rule on the `is_admin` matrix (S4–S8) before any of it is built.**
  `private.is_admin` is still all-or-nothing; match sheets, lineups, attendance,
  grades/positions/units, squad chat + chat-media, and availability override are
  gated by `can_edit_team`/`can_see_team` (= any active admin), NOT a narrowed
  right — so "names-read-only access to children" is true for DOB/contacts/photos
  but **false** for those team surfaces. Sub-findings to fold in only if this
  wave opens: the allowlist helpers `can_see_child_contacts` /
  `can_edit_child_contacts`
  (`db/migrations/20260828_child_contacts_allowlist.sql:49-68`) are **club-blind**
  (no `club_id`), same class as `is_admin_anywhere`; and there is **no
  sensitive-read (SELECT) audit** on `player_private`/`player_contacts`
  (`welfare_access_log`, `db/schema/tables.sql:2187-2198`, logs DM opens only —
  S10/Phase 0d specified, not built). **Do not start on the strength of the
  matrix existing on paper.**

### Critical — live in production right now

- ✅ **Items 1 & 2 FIXED, 30 Aug 2026** (`20260830_welfare_review_gate.sql`,
  applied to prod, harness proven red-then-green): `welfare_overview()` now
  gates on `private.can_review_dm`, and `message_reports` read/resolve are
  SPLIT BY CONTEXT per Jay's ruling — a report on a conversation message
  (DM/group) is welfare-only, a report on a channel message stays any-admin
  (matching the reported-message arm of "message delete"), and the reporter
  keeps sight of their own report. New classifier
  `private.report_on_conversation`. Jay holds `welfare`, so nothing went dark.

### High — bites today, no narrowed grant required

- ✅ **Item 3 FIXED — but the repo lagged production by a day.** The migration
  `20260830_pitch_occupancy_exclude_tournament_games` (adds `and e.tournament_id
  is null`) was **applied to production 30 Aug** — live `pg_get_functiondef`
  carries the filter, so Pitch Glance already stopped crying wolf — **but the
  PR never merged**, so the migration file, the client defence-in-depth
  (`src/data/pitches.js` ignores `tournament_id` rows), the harness repair, and
  the 9-column `functions.sql` recapture were absent from `main` until the
  31 Aug reconcile PR. Grok's 31 Aug re-review correctly read the stale 8-column
  `functions.sql` capture and flagged the repo as vulnerable; the *database* was
  always ahead. Reconciled 31 Aug 2026 — the repo now records what production
  has run since 30 Aug. **No DB change in the reconcile PR; the migration was
  already live.**
- ✅ **Item 5 FIXED, 30 Aug 2026**: `deleteConversation` and `resolveReport`
  carry the `.select('id')` + zero-rows-throws guard `removeMessage` already
  had; both directions pinned in `tests/messages-data.test.js`, and both
  screens already rendered the thrown copy.
- ✅ **Item 6 FIXED, 30 Aug 2026** (D3: all five, by TABLE — scoped variants
  included, since offline use is a non-goal and caching serves online speed):
  `isCacheableRestGet` excludes `messages`, `player_private`,
  `player_contacts`, `player_parents` and `poll_votes`; pinned in the unit
  test AND against the built `sw.js`. The other REST caching stays — the
  documented tradeoff is unchanged.
- ✅ **Item 8 FIXED, 30 Aug 2026** (`20260830_last_admin_guard.sql`, applied to
  prod, harness red-then-green with a dropped-trigger self-test): a
  `BEFORE UPDATE OR DELETE` trigger on `memberships` raises P0001 when the row
  is the club's last active admin and the operation would remove that status.
  Non-last, team-only and non-admin edits proven untouched.
- ✅ **Item 9 FIXED, 30 Aug 2026**: `useDmThread` keys `admin` (and so both
  `reviewing` and `logWelfareAccess`) on `realMemberships` — an admin
  previewing as a parent who opens a DM gets the banner and the audit row
  exactly as outside the preview. Pinned in `tests/dm-thread-view-as.test.jsx`.
  Unread-badge filtering under preview stays as-is per D5 (documented
  non-boundary, default leave).
- ✅ **Items 10, 11 & 12 FIXED, 30 Aug 2026**
  (`20260830_push_hardening.sql` applied; `push-send` v12 and
  `notify-unfinished-signup` v2 deployed). Item 12: `register_push_subscription`
  allowlists the endpoint (https + FCM/Apple/Mozilla/WNS/legacy-Google, built
  from the hosts measured live; harness
  `db/tests/push-endpoint-allowlist.sql`, red-then-green with a revert
  self-test), and push-send carries the same allowlist before its fetch.
  Item 11: squad-push copy travels through `public.push_outbox` (body carries
  only the id; push-send renders from the row and CONSUMES it — single-use,
  replay-inert; the row doubles as the cancellation tombstone), and
  availability nudges are re-derived from `event_id` in the function. Proven
  live end-to-end with a zero-audience probe (row written → id-only POST →
  v12 consumed it → 200 'ok (no subscriptions)'). Item 10: nudges travel as
  profile ids; the function loads addresses itself, refuses email-bearing
  bodies, caps the batch at 100.

### UX, not data (RLS already refuses the write)

- ✅ **Item 4 FIXED, 30 Aug 2026**: `canEditTeam`'s staff arm and Roster's
  `canEditAnything` require `isActiveMembership`, matching the SQL
  `can_edit_team`. `visibleTeams` keeps pending squads visible per D6 and now
  documents why; `isOwnPlayer` documents its deliberate status-blindness
  (item 18's residual comment). Pending-coach + active-parent fixtures pinned
  in `tests/scope.test.js`; every staff fixture in tests/ now carries a
  status, the shape the schema requires.

### Latent — bites only when a narrowed admin grant is issued (harmless today via the `clubadmin` backfill)

- ✅ **Item 7 FIXED (core), 30 Aug 2026**: new client mirrors `canWriteChild`,
  `canSeeChildPhotos`, `canEditChildPhotos`, `canWritePlayer` (the "player
  edit" policy) and `canReviewDm` (explicit welfare, NO super short-circuit);
  PlayerForm and Roster gate player editing on `canWritePlayer`, so a
  narrowed admin gets no dead form (the welfare persona reaches data
  read-only via PlayerDetail's refuse-by-empty, not a failing form); the
  Welfare portal greys for an un-ticked super; the stale "rights gate
  screens not data" / "any admin can read a DM" doctrine comments rewritten.
  Residual (minor, latent): PlayerDetail/Accounts read-surface polish for a
  narrowed persona rides on RLS refuse-by-empty rather than explicit gating —
  revisit if a narrowed grant is ever issued and a screen looks broken.

### Hygiene / process (medium-low)

- ✅ **Item 14 FIXED, 30 Aug 2026.** `db/schema/policies.sql` re-captured
  from live for every drifted body: `player_contacts`, `player_parents`,
  `player_private` (the 28 Aug S2 read/write allowlists, four per-verb
  policies each), `players` "player edit" (S1 write allowlist), the
  `player-photos` storage read/write (S3), and `welfare_access_log`
  "welfare log read" (Phase-4 super+welfare). `pitch_occupancy`'s signature
  in `functions.sql` was recaptured in PR 3, `chat_media_owner` pinned by
  #552 — so `db/schema/` diffs true against live again.
- **Edge-function hygiene (item 15) — CORE DONE 30 Aug 2026, residuals
  accepted.** ✅ `supabase/config.toml` pins `verify_jwt=false` for all eleven
  functions (measured against the dashboard first). ✅ `push-send` and
  `notify-unfinished-signup` hash-both-sides on the secret compare and check
  POST; squad-push replay is now inert by construction (single-use outbox).
  ⚠️ **Accepted residuals, deliberately not done tonight**: `send-email`
  still stores no `webhook-id` (~5-min replay of a captured signed POST);
  the other seven secret-guarded functions lack an explicit POST check
  (their `request.json()` already 400s a GET — hygiene, not a hole) and keep
  the length-leaking compare; no dedupe on welcome/feedback/invite re-mail.
  Each is a small change but a separate function deploy — batch them with
  the next edge-function PR rather than seven deploys for comments.
- ✅ **Item 16 RESOLVED, 30 Aug 2026 — half fixed, half RULED.** The missing
  build assertion is added: `tests/pwa-build.test.js` now asserts the built
  `sw.js` carries `denylist` + `calendar\.ics` (measured in the worker:
  `denylist:[/^\/calendar\.ics$/]`). The UID host is deliberately **FROZEN**
  on the retired `quins.adhjrt.com` — peer-review catch: a UID is the event's
  IDENTITY to every subscribed client, and changing the domain would
  duplicate the whole season in 13 families' calendars (13 live tokens,
  measured) with the old copies never updating again. RFC 5545 treats the
  domain as opaque; a loud do-not-fix comment guards it in
  `supabase/functions/calendar/index.ts`. D4 default taken: coach-typed
  `notes` stay in the ICS DESCRIPTION.
- ✅ **Item 17 FIXED, 30 Aug 2026**: `RequireAuth` maps the login URL
  fragment through `friendlyAuthError` (attacker-writable text never reaches
  the DOM as copy; known GoTrue shapes keep specific sentences), and the
  flagged `setError(err.message)` sites (Chat, DirectMessages, Notices,
  PersonCard, Welfare, WelfareReports) route through the new
  `friendlyMessage` — an error this app threw shows verbatim, a trusted
  SECURITY DEFINER code (42501/22023/42710/22004/P0001) shows verbatim, raw
  PostgREST / constraint / network strings fall back. Pinned in
  `tests/error-hygiene.test.jsx` (incl. the hostile-fragment case).

### Residual (low, correctly ranked)

- `isOwnPlayer` (`scope.js:516-521`) has no status check, matching SQL
  `is_own_player` — a pending parent filling in their own child is intended; add
  a one-line comment so a future "add status everywhere" pass doesn't "fix" it.
- Parent tap on a tournament game → `/match-sheet/:id` (`Schedule.jsx:915`) they
  usually cannot use — UX rough edge, not a leak.

### Realtime — MEASURED AT THE RLS LAYER, no action needed (31 Aug 2026)

- ✅ **Does Supabase Realtime's walrus filter role-channel / welfare / DM
  message rows out of a RAW-websocket non-member's `postgres_changes` stream?
  MEASURED — yes, at the layer walrus applies.** `public.messages` and
  `public.conversations` are in the `supabase_realtime` publication, RLS is
  enabled, and the `message read` / `conversation read` SELECT policies are
  CORRECT (role channels → `in_role_channel`, DMs →
  `in_conversation`/`admin_may_review`). **Our own client is RLS-safe
  regardless**: `subscribeToTable` (`src/data/subscribeToTable.js`) forwards a
  NO-ARG "something changed, re-read" callback and refetches through
  PostgREST — it never reads the realtime payload. The only threat is a raw
  Realtime websocket, and walrus delivers a row to a subscriber ONLY if that
  subscriber's role+claims can SELECT it. That per-row check was computed
  directly against live prod (rolled back), which is exactly what walrus runs:
  - **anon** (a keyless raw subscriber): `anon` has NO table grant on
    `messages` — refused before RLS even evaluates.
  - **authenticated non-member** (an active parent): SELECT of a `welfare`
    message AND a `headcoaches` message → **0 rows** each.
  - **welfare holder** (positive control): SELECT of the `welfare` message →
    **1 row**.
  So walrus delivers nothing to a non-member for role-channel/welfare
  messages. The only residual is the platform-level guarantee that Supabase
  correctly invokes RLS for `postgres_changes` at all — a standard,
  widely-relied-on Supabase behavior, not something this app controls, and
  belt-and-braces on top of the anon grant-refusal. **No action for Jay; no
  code change.** If ever a reason arises to remove even this residual for
  children's messages, the path is a broadcast-only reload signal (trigger →
  broadcast; client subscribes to broadcast instead of `postgres_changes`) —
  ⚠️ NOT "drop `messages` from the publication", which would kill the
  live-chat reload signal.

### Cosmetic non-findings (recorded, deliberately NOT fixed in a security pass)

- **`message_reads` INSERT is exists-only, not see-able.** `"message mark
  read"` WITH CHECK is `profile_id = auth.uid() AND EXISTS(a message with
  that id)` — it does not check the reader can SEE the message. Practically
  inert: `message_id` is an unguessable UUID, so an attacker cannot target an
  unreadable message, and the insert leaks nothing back to them (worst case a
  spoofed "X read your message" to the author, which still needs the UUID).
  Tightening would mean the INSERT policy replicating the whole `message
  read` CASE for no real gain.
- **An author can pin their own post directly, bypassing `set_message_pinned`.**
  `pinned` is in the `messages` column-UPDATE grant and the `"message edit"`
  USING admits `author_id = auth.uid()`, so `UPDATE messages SET pinned=true
  WHERE id=<own row>` succeeds even though the RPC restricts pinning to staff
  and refuses role channels (`'unknown channel'`). Boolean flag only — no data
  exposed or destroyed. Pre-existing from the 24 Aug pin work, not introduced
  by any 30 Aug surface. Backlog fix if wanted: freeze `pinned` for non-staff
  in `touch_message`, or drop `pinned` from the column grant.
- **`public.clubs` `"club read"` is status-blind — recorded 2 Sep 2026, NOT
  fixed.** Its USING is, in full,
  `EXISTS (SELECT 1 FROM memberships m WHERE m.profile_id = auth.uid() AND m.club_id = clubs.id)`
  — no `status` test, so a `'left'` or a never-approved `'pending'` membership
  reads the club row just as an active one does. Benign: `clubs` holds the
  club's own name and settings, which are on the sign-in screen anyway, and
  every table that hangs off it is separately gated. Tightening it would also
  need care — a pending parent seeing "no club at all" is the failure mode
  `private.is_own_player` exists to avoid (see
  `db/migrations/20260902_player_leavers_left_grants_nothing.sql`). Recorded so
  the next person who counts status-blind predicates finds it already counted
  rather than thinking it is new.
- **⚠️ THE STATUS-BLIND SWEEP MUST COVER INLINE JOINS, NOT ONLY `private.*`
  HELPERS — and this is the process finding, not the bullet above.** The
  leavers work counted membership predicates twice and both counts were wrong
  in the same way: they searched the bodies of `private.*` helper functions.
  The second migration caught `is_own_player` and `is_attached_to_team` that
  way; the third caught `public.calendar_events_for_token`, which is an
  **inline `join public.memberships` inside a `security definer` function** and
  therefore invisible to a search shaped around helper names. A family who had
  left kept receiving the squad's fixtures in their phone calendar — 54 events
  in the injected-fault run — because of it. **A membership predicate is any
  place a `memberships` row is read to decide access, wherever it is written.**
  Next sweep: `grep` the live catalogue for `from memberships` / `join
  memberships` across `pg_proc` and `pg_policy` bodies, not for helper names.

## Needs Jay (account creations — Claude does not do these)

- **Should a player with their OWN account still count as "no parent on
  file"? — measured 26 Aug 2026, decision not yet made.** Of the players the
  Needs Attention screen flags for parents, none has an unlinked parent
  membership (the 25 Aug trigger is holding); most hold a PLAYER-role
  account themselves (largely U16B — plausibly set up by a parent under the
  child's identity through the old path) and a couple have no account link
  at all. If a self-managed older player is acceptable without a recorded
  guardian, `src/lib/completeness.js` should learn that exception and most
  of the list clears itself; if the club wants a guardian on file for every
  minor regardless, the list is real and the families need chasing (several
  have contact details on file to chase with — counts rot, measure fresh).
  Jay's call either way; measured with the queries in the 26 Aug session.
  **Parked 26 Aug, same session — the parent-match automation idea.** Jay
  asked for suggested matches with a confirm-to-merge; brainstorming got as
  far as one load-bearing finding before he chose to think on it: matching
  a registration contact email to an account is NOT evidence the account is
  a parent — measured live, every player-role account whose email matched
  the family contact is ALSO named as the child, so a blanket
  "reclassify as parent" would have converted self-managed teenagers'
  own logins. Any future build must GRADE the evidence: offer an attach
  only when the matched account bears a different adult's name; a
  child-named match is the self-managed-player policy question above, not
  a merge. Do not re-open without this finding in hand.

- ✅ ~~**Leaked-password protection is OFF.** Supabase → Authentication → Policies.~~
  — **IT IS ON. Read off the dashboard 15 Aug 2026**, after Jay said he thought
  he had already done it and this file said otherwise for two days.
  ⚠️ **AND THE POINTER WAS WRONG TOO, WHICH IS PROBABLY WHY IT LOOKED UNDONE.**
  The setting is not under Authentication → Policies; it is
  **Authentication → Attack Protection**, as "Prevent use of leaked passwords",
  and it shows a green ENABLED badge rather than a toggle. Anyone following the
  old direction landed on the RLS policies list and found nothing to switch.
  ⚠️ **THE ADVISOR AGREES, AND ITS SILENCE IS THE EVIDENCE.** Supabase emits an
  `auth_leaked_password_protection` lint when this is off; `get_advisors` returned
  16 security lints and not that one. **A missing lint only counts because the
  same call returned others** — an empty result would have proved nothing, which
  is the trap `CLAUDE.md` rule 6 exists for.
- **Captcha protection on the auth endpoints is OFF** — same screen, measured the
  same day, `aria-checked="false"`. ⚠️ **RECORDED, NOT RECOMMENDED.** It is a
  real gap and it also puts a challenge in front of every sign-up and password
  reset for a club of a few hundred families, most of them arriving from a
  WhatsApp link on a phone. Nobody has weighed that trade yet, and this line
  exists so the next person knows the switch is there and untouched rather than
  considered and rejected.
- **Flip "Confirm email" OFF** — Supabase → Authentication → Sign In / Providers
  → Email. Jay's 25 Aug 2026 decision
  (`claude/decisions/2026-08-25-remove-email-confirmation.md`): signup no longer
  gates on opening a link; a welcome mail replaces the confirmation. ⚠️ **LAST
  step, after** the `notify-welcome` function is deployed and
  `db/migrations/20260825_welcome_email_no_confirm.sql` is applied — everything
  in code is keyed on rows being born confirmed, so nothing changes until this
  click, and the click is safe the moment those two are live. Once flipped:
  `notify-unfinished-signup` + the `signup_nudges` machinery lose their audience
  (only the pre-flip limbo cohort remains), and the send-email `signup` template
  becomes unreachable for new signups — all mothballed, not deleted, same ruling
  shape as passwordless.
- ✅ **Monitoring — DONE, 16 Aug 2026.** "Detection today is somebody
  telling Jay" was the 13 Aug audit's finding. Two **Better Stack** monitors are
  now live on the free tier, 3-minute checks, e-mail alerts:
  `https://adhquins-clubhub.com/` and the calendar feed at
  `/calendar.ics?token=<Jay's token>`. ✅ **E-mail delivery is PROVEN** — Jay ran
  *Send test alert* and it arrived.
  ✅ **DETECTION IS PROVEN TOO — the drill was RUN, 16 Aug 2026, not just written
  down.** The live site was disabled for **4m 15s** (09:44:04 to 09:48:19 UTC).
  Both monitors opened an incident at **09:44**, e-mail alerts arrived, and the
  incidents auto-resolved by 09:52 once the site was back.
  ⚠️ **DETECTION WAS UNDER A MINUTE, NOT THE THREE THE CHECK INTERVAL IMPLIES** —
  worth knowing before anyone "fixes" the frequency on the strength of the
  setting rather than the measurement.
  ✅ **SENTRY IS LIVE TOO — 16 Aug 2026**, EU region, proven by firing a real
  unhandled rejection on the live site: the lazy chunk loaded, POSTed, got 200,
  and the issue appeared. The entry bundle grew **0.3 KB** (259.6 → 259.9 gzip);
  the 159 KB SDK stays in its own chunk.
  ⚠️ **STACK TRACES ARE MINIFIED** — the smoke-test issue reads `?(<anonymous>)`
  as its location.
  No source maps are uploaded, so an error gives the message, page, browser and
  affected count but no file and line. **The trigger for adding them is the first
  real error nobody can place**, not a tidiness urge — it costs a build secret and
  a Vite plugin.
  ⚠️ **KEYWORD MATCHING IS A PAID FEATURE ON BETTER STACK, AND THE RUNBOOK SAID
  OTHERWISE UNTIL IT WAS SEEN ON THE SIGNUP SCREEN.** The 'Alert us when' dropdown
  carries a **Billable** badge; its keyword and status-code options exist in the UI
  but selecting one risks moving the account to a paid tier. So both monitors use
  the free "URL becomes unavailable" check. **The recommendation had been written
  from research rather than from the product**, which is the same failure as the
  Sentry bundle-size estimate three items down.
  ⚠️ **THE ONE FAILURE THIS CANNOT SEE**: if the `/calendar.ics` proxy rule were
  deleted from `netlify.toml`, the path would fall through to the SPA catch-all
  and answer **200 with the app's HTML** — every calendar subscription in the club
  broken, monitor green. Everything else is caught, because the monitor carries a
  real token and the feed only answers 200 when it genuinely built. **Do not swap
  provider to close it**: UptimeRobot's free tier has keyword monitors but is
  personal/non-commercial only, and StatusCake deactivates accounts idle 90 days.

## Cheap (under an hour each)

- **Two storage buckets still carry `FOR ALL` write policies and nobody has
  audited what that grants them to READ — 31 Aug 2026, documents-repo final
  review.** `for all`'s `using` arm is also the bucket's SELECT arm, so a write
  rule is silently a read rule (the ruling is in `RESTORE.md`). That is exactly
  how the documents bucket shipped with a false orphan claim, fixed by
  `db/migrations/20260831_documents_policy_split.sql`. The **player-photo
  write** and the **training-diagram write** were never checked. Both may be
  perfectly fine — a bucket whose read rule is already as wide as its write rule
  loses nothing by the conflation — but "probably fine" is precisely what the
  documents migration header said. The check is a query, not a migration: count
  permissive SELECT policies mentioning each bucket, the way probe 10b in
  `db/tests/rls-documents.sql` does, and read the ones you find.

- **An orphan in the `documents` bucket can be cleared by `service_role` and by
  nobody else — no sweeper exists yet.** Measured 31 Aug 2026, probes 13d/13e in
  `db/tests/rls-documents.sql`, and it contradicts what
  `20260831_documents_policy_split.sql`'s header claims ("the prefix squad's
  staff or any admin can still remove it" — they cannot). The mechanism is not a
  mistake in any predicate: a `delete` whose `where` reads the table's own
  columns applies the SELECT policies too, and since the split, "document read"
  is the bucket's only SELECT path — so an object with no row is invisible to
  everyone and therefore deletable by nobody holding a user JWT. **Not an
  escalation and not urgent**: an orphan is unreadable, so the cost is storage
  bytes, and `uploadDocument` already removes the file when the RPC refuses. It
  accumulates only when that cleanup itself fails. The fix is a sweeper in the
  `backup-player-photos` style — list bucket objects, drop any whose key no
  `documents.storage_key` names — which is real work rather than an hour, so it
  is the *decision* that belongs here: either build it, or write down that the
  club accepts unbounded orphans. ⚠️ **Do NOT reach for
  `storage.allow_delete_query`** to clear these by hand; `RESTORE.md` records why
  that setting destroys the evidence of a delete rather than performing one.

- ✅ ~~**The ticks' two small gaps (26 Aug 2026, shipped with #430).** The
  floating dock renders no ticks (its bubbles pass no `receipt`), and the
  chat LIST cannot show online dots because `my_chats()` does not return the
  DM counterpart's profile id — a one-column widening of that function plus
  a dot on `RowAvatar`. Both deliberate v1 cuts, named in the PR.~~ — **BOTH
  CLOSED the same day, by other PRs' routes rather than this line's.** The
  dock ticks came free with chat parity (#433): the dock now renders the
  SAME `DmThread`, whose bubbles pass `receipt` (DmThread.jsx, the
  `receiptState` line). The list dots shipped with #438 and were fixed
  live by #441 — paired from `listMyConversations()` (the `my_conversations`
  RPC's `other_id`), so `my_chats()` never needed widening. Verified in
  code 26 Aug, evening.


- ✅ ~~**The suite passes with 5–7 "Unhandled Errors" every run — measured 23 Aug
  2026 on `main` at `c593795`.** `TypeError: The "event" argument must be an
  instance of Event` from undici's WebSocket, originating in five screen suites
  whose screens subscribe to Supabase realtime unmocked, so jsdom opened a REAL
  socket to the project during `npm test`.~~ — **FIXED 24 Aug 2026**: a
  never-connecting WebSocket stub in `src/test/setup.js`, jsdom-only so the
  node-environment files (which only need the global to EXIST) are untouched.
  Measured both sides: 3 unhandled errors on 3 files before, 0 across all 175
  after, full suite green. The vite.config.js note about
  `delete globalThis.WebSocket` as a fault-injection technique still stands —
  the stub replaces, never deletes.

- **Training plans follow-ups from the 21 Aug 2026 whole-branch review** (none
  blocking): client-side age validation on the drill and template forms (a typo
  of 99 surfaces a raw `drills_min_age_check`); `saveTemplate`/`saveSessionBlocks`
  are two round trips (caveat recorded in the spec; an RPC would close it);
  a `.gitattributes` decision — the system `core.autocrlf=true` flattens CRLF test
  files on `git add` and cost one review round; no test for the embed sort in
  `listTemplates`/`getSession`; the three screens are 600–760 lines (seams named
  in their headers).

- ✅ ~~**`authenticated` holds TRUNCATE on every table it holds anything on**,
  including `memberships`, `player_parents` and (as of 18 Aug 2026)
  `push_subscriptions` — found while capturing that table's grants, measured
  against the first two as controls to confirm it is systemic rather than
  new. **TRUNCATE is not filtered by RLS at all** — Postgres never applies row
  security to it — so any signed-in member currently holds the ability to
  empty any table outright, RLS policies notwithstanding.~~ — **REVOKED
  19 Aug 2026**, on all 31 tables that had it, plus the `postgres` default
  privilege so the next table does not arrive with it.
  `db/migrations/20260819_revoke_truncate_from_authenticated.sql`,
  `db/tests/truncate-grants.sql`.

  ✅ **"Wants its own harness proving nothing legitimate needs it" — that was
  this item's condition, and it was met three ways.** No code anywhere issues a
  SQL TRUNCATE (every `truncate` in `src/` is a Tailwind class); PostgREST
  exposes no TRUNCATE verb; and **three tables had already been running without
  it** — `photo_backup_runs` since 13 Aug, `photo_orphan_scans` since 16 Aug,
  `membership_audit` since 17 Aug — one of them carrying the photo backup the
  club depends on. The exceptions were the argument, not a footnote.

  ⚠️ **THE CAPABILITY WAS DEMONSTRATED RATHER THAN READ OFF A CATALOGUE ROW.**
  A throwaway table created down our own migration path, then `set local role
  authenticated; truncate` — it really emptied. A throwaway rather than
  `players` on purpose: the real roster would have proved the same thing while
  taking an ACCESS EXCLUSIVE lock on a live club mid-onboarding, and it would
  not have shown that the DEFAULT is live as well as the existing grants.

- ⛔ **`authenticated` CAN TRUNCATE `storage.objects`, AND WE ARE NOT ALLOWED TO
  FIX IT.** Five tables outside `public` — `storage.objects`,
  `storage.buckets`, `storage.buckets_analytics`, `net.http_request_queue`,
  `net._http_response`. `storage.objects` is the row behind every player photo,
  so this is not an academic leftover; the `net` pair carry a PUBLIC grant, so
  `anon` holds them too. Measured 19 Aug 2026.

  ⚠️ **AND THE WAY THE FIX FAILS IS THE THING TO REMEMBER: A REVOKE ISSUED BY
  SOMEONE WHO IS NOT THE GRANTOR SUCCEEDS AND DOES NOTHING.** No error, no
  failed statement — `revoke truncate on storage.objects from authenticated`
  ran clean as `postgres` and `has_table_privilege` still returned true
  afterwards. Postgres only removes grants YOU made, and the grantor here is
  `supabase_storage_admin`. **A migration listing these tables would apply
  cleanly, review as correct, and be a lie**, which is why
  `20260819_revoke_truncate_from_authenticated.sql` names them and asserts
  nothing about them.

  ⚠️ **Do not "fix" this by asserting it in a harness either** — an assertion we
  know to be false is worse than a gap somebody can read about. This is an item
  against Supabase, not against us. Same threat model as the `public` one was:
  no PostgREST verb, so it needs a direct connection with a stolen JWT.
- ✅ ~~**`public.register_my_player` is executable by `anon`, and it looks
  deliberate when it is not.** Measured on production 16 Aug 2026 while adding
  `request_staff_role`:

  ```
  register_my_player   postgres=X anon=X authenticated=X service_role=X
  accept_invite        postgres=X        authenticated=X service_role=X
  claim_roster_access  postgres=X        authenticated=X service_role=X
  set_admin_rights     postgres=X        authenticated=X service_role=X
  ```

  ⚠️ **NOT A HOLE, WHICH IS WHY IT IS HERE AND NOT HIGHER UP.** Every guard in
  that function keys on `auth.uid()`, so an anon caller is refused at the first
  line with `42501`. The problem is that three comparable RPCs do *not* carry the
  grant, so anybody reading the ACLs will conclude the difference was a decision.
  It was not: Supabase ships `ALTER DEFAULT PRIVILEGES … GRANT EXECUTE ON
  FUNCTIONS TO anon, authenticated, service_role`, so a new function arrives with
  an EXPLICIT anon grant, and `revoke all … from public` does not remove it —
  it only removes the implicit PUBLIC entry. Whoever wrote the tightened three
  added an explicit `revoke … from anon`; whoever wrote this one did not.~~ —
  **REVOKED 18 Aug 2026.**
  `db/migrations/20260818_revoke_anon_execute_register_my_player.sql`.

  ⚠️ **A SEPARATE FILE HAD CALLED THIS GRANT DELIBERATE, FOR FIVE DAYS, ON THE
  SAME MISREADING THIS ITEM WARNS ABOUT.** `db/tests/grants.sql` §3b — written
  13 Aug, three days before this item — named `register_my_player` alongside
  `calendar_events_for_token` as one of "TWO ALLOWED ENTRIES ARE DELIBERATE AND
  MUST NOT BE TIDIED", citing the two migrations that re-granted it explicitly
  as evidence of a decision. **An explicit grant is evidence someone typed it,
  not evidence someone decided it** — reading the two migrations shows both are
  restating a DROP/CREATE side-effect to avoid an outage, and neither gives a
  reason `anon` itself needs this function. A harness got the same fact this
  item was built to catch wrong, in the opposite direction, and would have
  failed loudly the moment anyone acted on THIS item without also fixing that
  one. Both are now consistent.

  ⚠️ **AND THE GRANT WAS FUNCTIONALLY INERT, WHICH ANSWERS WHY REVOKING IT
  BROKE NOTHING.** A PostgREST call only executes as the `anon` role when it
  carries no session; a signed-in user's calls run as `authenticated` whatever
  this grant said. So the only caller who could ever reach the function AS
  `anon` is one the `auth.uid() is null` guard was always going to refuse one
  line later. Measured after the revoke, inside a rolled-back transaction: a
  signed-in call with a deliberately bad team id still reaches past the
  auth/email guards and fails on `22023 "That age group does not exist"` —
  identical to before. `request_staff_role` was tightened at creation and
  carries the full explanation in its migration header; this one now matches.

- ✅ ~~**No dependency scanning.** No Dependabot, no `npm audit` step.~~ —
  **both shipped 15 Aug 2026.** `.github/dependabot.yml` watches npm weekly and
  the workflow actions monthly, grouped so minor and patch arrive as one
  reviewable pull request and majors arrive alone; `npm audit --omit=dev
  --audit-level=high` is a step of the `test` job, which is one of the two
  REQUIRED checks, so it gates from the moment it merged.
  ⚠️ **`--omit=dev` IS THE DESIGN, NOT A SHORTCUT.** Measured the same day: the
  full tree carries **10 advisories — 5 moderate, 4 high, 1 CRITICAL — and eight
  of them, including the critical (`vitest`), are devDependencies that never
  ship.** Gating on the full tree would let a critical in a test runner block a
  fix to the live site.
  ⚠️ **AND `high` RATHER THAN `moderate` BECAUSE THE TWO PRODUCTION ADVISORIES
  HAVE NO NON-BREAKING FIX** — see the item below. Gating at `moderate` would
  red every build from the day it merged, and a permanently red gate teaches
  people to ignore the gate. **Drop it to `moderate` the day react-router 7
  lands.**
  ✅ **Proved it can fail rather than assuming**: the same command at
  `--audit-level=moderate` exits 1 today, at `high` it exits 0.
- ✅ ~~**The two production advisories are `react-router`, and the ONLY fix is a
  major version.**~~ — **taken, 15 Aug 2026. `npm audit --omit=dev` is now 0.**
  react-router-dom 6.30.4 → 7.18.2, and the whole tree is down to 4 findings from
  the 10 that were there when scanning was switched on the same morning.
  ⚠️ **IT WAS A BUMP RATHER THAN A MIGRATION ONLY BECAUSE THIS APP USES NO DATA
  ROUTER.** It uses the declarative API and nothing else, so v7's changes did not
  reach it. An app on `createBrowserRouter` would have had a real piece of work
  here.
  ⚠️ **Exercised in a real browser, not only in jsdom** — every test uses
  `MemoryRouter` and the app ships `BrowserRouter`, so navigation was driven in
  Chromium: `/` → Schedule → `/roster`, URL and content both changing.
  ⚠️ **`react-dom` 19 WAS OFFERED AND REFUSED** the same day (#152): Dependabot
  bumped `react-dom` while leaving `react` at 18, and `npm ci` fails outright with
  `Conflicting peer dependency: react@19.2.8`. **React 18 → 19 is a migration and
  wants its own piece of work**, with both packages moved together — not a
  dependency PR.
- ~~**The old note, kept for its reasoning:**~~ ⚠️ **Re-measured 15 Aug 2026 and the old note was right about
  what ships but silent about the rest**: production is exactly 2 moderate, both
  react-router, and **neither is exploitable here** — `safeNext()` blocks
  `//host` and `/\host`, and the third advisory in the set is SSR hydration,
  which this app does not do. Recorded so nobody re-panics at the same output.
  ⚠️ **`npm audit` SAYS `fixAvailable: true` AND THAT IS MISLEADING.** The
  advisory range is `6.0.0-alpha.0 - 7.17.0`, and the installed 6.30.4 is
  already the newest v6 — so the "available fix" is **react-router-dom 7.18.2, a
  major**, i.e. a migration rather than a bump. That is why Dependabot is
  configured to bring majors as their own pull request.
- ✅ ~~**No `LICENSE`, no `SECURITY.md`** on a public repo running children's-data
  infrastructure.~~ — **both shipped 14 Aug 2026.** `LICENSE.md` is all rights
  reserved, held by Abu Dhabi Harlequins RFC (Jay's call; there was no prior
  ruling — every "licence" in `claude/` was an M365 seat). `SECURITY.md` sends
  reports to `admin@adhquins-clubhub.com`, which is already the app's public
  contact on the privacy and account-deletion screens, and rules out a GitHub
  issue as a disclosure route.
  ⚠️ **Named `.md` on purpose** — a bare `LICENSE` misses
  `scripts/netlify-ignore.mjs`'s `/^[^/]+\.md$/` and would deploy.
  ✅ **`package.json` now carries `"license": "UNLICENSED"`** — folded in on
  15 Aug 2026 exactly as this line asked, alongside the DMARC chore that was
  going to build anyway. ⚠️ **It is `UNLICENSED`, not a SPDX id, and that is
  correct**: npm reserves that string for a package that is deliberately not
  open source, which is what "all rights reserved" means in `LICENSE.md`.
- **CSP is `frame-ancestors 'none'` and nothing else.** `netlify.toml` explains why
  and the reasoning is sound — a wrong `connect-src` breaks the app silently for
  anyone holding a cached service worker. It stays here because it is the only thing
  that would contain a compromised npm dependency. Do `connect-src` first, and test
  against a browser that already has a service worker registered.
- ✅ ~~**CI pins Node 20.**~~ — **all three workflows pin Node 24 as of 15 Aug
  2026**, matching both dev PCs, and the eight files that were stuck in jsdom
  now run in `node`. Measured on the move: `environment` across those eight went
  to **3ms**.
  ⚠️ **PROVED THE BUMP IS WHAT FIXED THEM**, using the technique `vite.config.js`
  already documented: `delete globalThis.WebSocket` in `src/test/setup.js` turns
  a dev machine into a Node 20 runner, and with it the eight fail with the exact
  CI error. Without it they pass. A green run alone would not have shown which
  change was responsible.
  ✅ **NETLIFY'S BUILD NODE IS NOW PINNED — `NODE_VERSION = "24"` in
  `netlify.toml`, 24 Aug 2026, in the same PR as the vite 8 pair below.** It was
  unpinned (no `.nvmrc`, no `.node-version`, nothing in `netlify.toml`) and the
  production build ran on whatever Netlify defaulted to, which CI never proved.
  Pinning waited for Jay's call because it alters the runtime a live release is
  built on; the vite 8 upgrade forced the question and Jay took it.

## The four dependency majors, parked 17 Aug 2026

**Dependabot opened five majors at 00:15 on 17 Aug. One was taken; these four were
parked, each for a measured reason and not for nervousness.** Jay's call, having
been shown what each one actually fails with. ⚠️ **Every one of them is ALSO red on
`docs-check`, which is structural and means nothing** — see
`claude/runbooks/session-and-push.md`. **Read the `test` line, not the tick count.**

- **react 18.3.1 → 19.2.8.** `ERESOLVE` at install: `react-dom` stays at 18.3.1
  and the peer ranges cannot be satisfied. ⚠️ **The exact mirror of #152**, which
  bumped `react-dom` and left `react` behind — so this has now failed in both
  directions, which is the evidence that it is a migration and not a bump. Both
  packages have to move in one change. The ruling above still stands.
- ✅ **vite 5.4.21 → 8.2.2 and `@vitejs/plugin-react` 4.7.0 → 6.1.0 TAKEN
  TOGETHER, 24 Aug 2026, exactly as this item prescribed** — one PR carrying
  both, with the Node pin above in the same change. The mutual block was real
  and the finding held: each had failed alone (vite 8 because plugin-react 4
  refuses it; plugin-react 6 because it declares `"vite": "^8.0.0"` — exactly 8,
  not "7 or newer"). The clean route was a from-scratch lockfile resolve —
  an incremental install fights the existing tree over plugin-react 6's
  *optional* Babel-8/oxc peer chain; regenerating `package-lock.json` settles
  it without pulling any of those peers in. Suite green on the pair
  (nothing needed changing), build green, dependabot's #354/#355 closed in
  favour of the combined PR.
- **tailwindcss 3.4.19 → 4.3.3 is a migration, and the install is not what
  breaks.** `npm ci` succeeds; **the BUILD fails on `src/index.css`**. Three things
  in this repo are v3-shaped: the `@tailwind base/components/utilities` trio at the
  top of that file, `postcss.config.js` naming `tailwindcss` directly where v4
  wants `@tailwindcss/postcss`, and a **377-line `tailwind.config.js`** that v4
  expects as CSS-first `@theme`.
  ⚠️ **THERE IS A REAL PRIZE IN IT, WHICH IS WHY THIS IS PARKED RATHER THAN
  REFUSED.** `src/index.css`'s token layer exists only to mirror
  `tailwind.config.js` "exactly", by hand, with a comment telling the next person
  to change both — v4 would make them one source and delete that whole class of
  drift. It is a day's careful work against the visual contract of a live site,
  with `claude/specs/design-system.md` to keep in step. **It wants a plan, not a
  merge.**

## One migration each

- **Positions staff-only, the two follow-ups (25 Aug 2026).**
  `db/migrations/20260825_positions_staff_only.sql` moves position/unit into
  staff-only tables and NULLS `players.position` / `players.unit`. Left open
  deliberately:
  1. ✅ ~~**A later migration DROPS the two nulled columns**~~ — **DONE, same
     day, after the deploy**: `20260825_drop_players_position_unit.sql`.
     Evidence, in order: live bundle grepped for the new code first; both
     columns measured all-NULL (nothing had re-written them); every deployed
     players read is `select('*')` so nothing names the columns; a
     rolled-back dry-run dropped them with no dependents; then the real drop,
     and `information_schema.columns` no longer lists either.
  2. ✅ ~~**Re-capture `db/schema/`** after the migration applies~~ — **the
     pieces this change touched are captured, 25 Aug**: players' column list
     and prose, player_positions + player_units DDL in tables.sql (verified
     against information_schema and pg_indexes), and the three `manage`
     policies in policies.sql (verified against pg_policies). ⚠️ **The wider
     drift is NOT fixed and is the item below.**
  Also: ~~the screenshot harness has NO playerTiers stub (it never did), so its
  roster shots now render "Position not set" where the stub players carried
  inline positions — cosmetic, but a stub returning the maps is the fix when
  the shots are next regenerated~~ — **DONE the same day**:
  `harness/stubs/playerTiers.js` landed with the three-view roster builder
  (PR #420), aliased in `harness/vite.config.js` and held to export parity by
  `tests/harness-stubs.test.js`. It returns empty maps on purpose — grades and
  positions are decoration on the screens under shoot, and their rendering has
  its own tests.

- ✅ ~~**`db/schema/tables.sql` is FIFTEEN TABLES behind the live database —
  measured 25 Aug 2026.**~~ — **RE-CAPTURED IN FULL, later the same day.** All
  13 missing tables written (the other two were the player_positions/units
  same-day capture), 11 drifted blocks corrected in place, 25 missing + 5
  drifted policies, 22 missing functions + 3 stale bodies, 15 missing
  triggers, the inverted anon-grants headline, and the inverted publication
  claim (live publishes SIX tables, availability included). Every item
  measured against pg_catalog; the full account is the 25 Aug entry in
  `db/schema/README.md`. Two findings became their own items below.

- ✅ ~~**`20260825_player_parents_from_parent_membership.sql` (squash `a5c5efd`)
  WAS NEVER APPLIED TO PRODUCTION — found 25 Aug 2026 by the re-capture.**~~
  — **APPLIED later the same day, with Jay's yes.** Trigger + helper measured
  live, backfill wrote 21 rows (player_parents 62 → 83, zero children left
  with a parent membership and an empty list), trigger fault-injected in a
  rolled-back transaction with a positive rollback control. The ⛔ marker in
  triggers.sql is replaced by the applied record. Original finding:
  The commit shipped the migration AND wrote the capture as if applied, but
  neither the trigger nor `private.memberships_write_parent_row()` exists
  live and `schema_migrations` has no row for it. Consequence: parent
  memberships created since the merge are NOT writing `player_parents`, so
  the Needs Attention badge under-reports — the exact gap the migration
  exists to close. **Needs Jay's yes to apply** (production migration), plus
  the backfill it carries. `db/schema/triggers.sql` carries the ⛔ NOT LIVE
  marker until a measurement shows it applied.

- ✅ ~~**Four tables' grant ceilings are wider than their migrations granted —
  measured 25 Aug 2026.** notification_opt_outs (UPDATE present despite the
  "complete vocabulary is S/I/D" ruling), conversation_members ("SELECT
  only" — live holds all 7), message_reactions and message_stars (S,I,D —
  live holds UPDATE too). Mechanism: the REVOKE lines target PUBLIC/anon and
  never trimmed authenticated's birth defaults. Inert today through
  owner-scoped policies, but it is the exact rely-on-policies-not-grants
  shape this repo's rules warn about. One tidy migration across the four;
  annotated in grants.sql.~~ — **TRIMMED 26 Aug 2026**:
  `db/migrations/20260826_trim_grant_ceilings.sql` (REVOKE ALL + re-grant
  the intended set, so the MAINTAIN/REFERENCES/TRIGGER defaults went too);
  `db/tests/grants.sql` §5 asserts the four ceilings and its self-test was
  proved to fail by re-granting UPDATE on conversation_members inside the
  rolled-back run. Measured after applying: each table's authenticated verb
  set equals the migration's grant line exactly.

- **`anon` holds full table privileges on `public`.** ⚠️ **Re-measured 14 Aug 2026:
  it is 23 of the 24 tables, not the "seven" this line used to claim** — seven was a
  sample read as a total. The exception is `photo_backup_runs`, created 13 Aug with
  an explicit revoke. Source is Supabase's default privileges. **Safe today by its
  POLICIES, not by its grants** — which is the thing this repo's rules say not to
  rely on, and it was confirmed safe by measurement: `set local role anon` sees zero
  rows on ten tables where the same counts unprivileged return real ones.
  ✅ ~~**APPLIED TO PRODUCTION 14 Aug 2026**~~ —
  `db/migrations/20260814_revoke_anon_table_privileges.sql` and
  `db/tests/anon-table-grants.sql`. **Measured after: `anon` holds SELECT,
  INSERT, UPDATE and DELETE on 0 of 24 tables; `authenticated` and
  `service_role` still hold all 24.**
  ✅ **AND THE PROTECTION DEMONSTRABLY MOVED FROM POLICY TO GRANT.** `set local
  role anon; select … from teams` used to return zero rows silently; it now
  raises `42501: permission denied for table teams`. ⚠️ **That distinction is
  the whole point of the change** — and the error names the missing GRANT, so
  it is refused by the gate this was aimed at rather than by something earlier.
  ✅ **The calendar feed was smoke-tested after applying** — `/calendar.ics`
  with a bogus token returned **200, `content-type: text/calendar;
  charset=utf-8`, a real `BEGIN:VCALENDAR` body**. It is SECURITY DEFINER and
  never depended on an anon table grant, but it is the one thing here that
  could not be repaired if it broke.
  ⚠️ **THAT PROBE NO LONGER RETURNS 200, AND THE LINE ABOVE IS KEPT AS THE
  RECORD OF 14 Aug RATHER THAN CORRECTED.** Re-run 18 Aug 2026: a bogus token
  now answers **404, `content-type: text/plain; charset=UTF-8`, body
  `Not found`**. The edge function tightened at some point between the two
  dates — arguably an improvement, since an invalid token no longer receives a
  valid-looking empty calendar.
  ✅ **IT IS NOT THE FAILURE THIS LINE EXISTS TO CATCH.** The dangerous case is
  the SPA catch-all answering **200 with the app's HTML**, which the free uptime
  check cannot see (`claude/runbooks/monitoring.md`). A plain-text 404 is the
  edge function itself refusing, so the proxy is still wired.
  ⚠️ **AND IT IS NOT A REGRESSION FROM THE 18 Aug RELEASES** — measured against
  the PREVIOUS production deploy's permalink as well as the current one, and
  both answer identically.
  ⚠️ **WHAT WAS NOT VERIFIED: THAT A VALID TOKEN STILL RETURNS 200.** That needs
  a real token, which is an unrevocable credential in a URL (see the item below)
  and was deliberately not used. **The Better Stack monitor carries a real one
  and is the thing that would catch a genuine break** — so treat its silence,
  not this paragraph, as the evidence the feed works.
  ⚠️ **IT REMAINS A PARTIAL FIX:** the
  `postgres` default privilege can be closed, the `supabase_admin` one cannot, so a
  table created down that path still arrives open. The harness walks every table
  rather than trusting either default.
- **18 RLS policies re-evaluate an `auth.*` call per row.** ⚠️ **This line said "call
  `auth.uid()` bare" and that is wrong in a way that would make a migration miss
  one:** 17 of the 18 call `auth.uid()`, and the 18th — `invites / invites read own`
  — calls `auth.jwt()`. The count comes from Supabase's own `auth_rls_initplan`
  lint; a string search for `auth.uid()` finds only 17. There are **19 bare calls**
  across those 18 policies, because `calendar_tokens / calendar token own` and
  `social_ideas / social idea create` carry two each. Fix is `(select auth.uid())`
  and changes no meaning.
  ✅ ~~**APPLIED TO PRODUCTION 14 Aug 2026**~~ —
  `db/migrations/20260814_rls_initplan_wrap_auth_calls.sql` and
  `db/tests/rls-initplan.sql`. Equivalence was proved BEFORE applying, by
  comparing the expressions Postgres RE-PRINTS before and after, normalised for
  the wrapper: 60 policies in, 60 out, zero differences in meaning.
  **Measured after applying: 60 policies still 60, bare calls 0, wrapped 24, and
  Supabase's `auth_rls_initplan` lint went from 18 entries to none.**
  ⚠️ **THE ADVISOR IS STILL NOISY AND THAT IS NOT A FAILURE** — 132 lints
  remain, of which **100 are `multiple_permissive_policies`**, a separate
  question this migration never touched. Do not read a noisy advisor as this
  having not worked; read the lint NAME.
  ✅ **THE HOUSE STYLE ALREADY EXISTS — SIX POLICIES USE THE WRAPPED FORM**, all
  on `announcements` and `announcement_reads`, shipped 14 Aug. So this is
  following a precedent in the schema, not inventing one; copy those.
  ⚠️ **An earlier draft of this line claimed no policy used the wrapped form.**
  That came from a query that listed only policies with BARE calls — the wrapped
  ones were filtered out before they could be counted, and the absence was read
  as evidence. The same mistake as reading an empty search as proof of absence,
  which `CLAUDE.md` rule 6 exists to stop.

## ✅ The Supabase security advisor — walked in full, 15 Aug 2026

**16 warnings. Fourteen are deliberate and correctly guarded; two are untidy
grants worth one small migration. Nothing here is a hole.** This section exists
because the list had never been read, and "16 unknown warnings" is a worse state
than a longer list of understood ones. **Re-run `get_advisors` rather than
trusting these counts.**

⚠️ **THE ADVISOR FLAGS EXPOSURE, NOT VULNERABILITY.** Fifteen of the sixteen say
"this `SECURITY DEFINER` function can be called through the API", which is TRUE
of every RPC this app has — it is how the app works. The question the lint cannot
answer, and this walk did, is whether each function guards itself.

**What was checked, and what it found:**

- **All fourteen `public` `SECURITY DEFINER` functions set `search_path`
  explicitly** — twelve to `public`, and `delete_my_account` and
  `photo_backup_list_objects` to the empty string. That is the hardening the
  lint's dangerous cousin is about, and it was already done.
- **Every mutating function enforces its own authorisation**, by its own code
  and not by the grant: `set_admin_rights` requires `private.is_super_admin()`,
  `approve_membership` requires `private.can_approve_team()`, the
  `set_own_player_*` pair check ownership, `accept_invite` matches the invite's
  email against the caller's, and `delete_my_account` refuses the last admin.
- **Every reading function is scoped**: `my_squad_staff` by
  `private.can_see_team()`, `announcement_audience` and `announcement_stats` by
  author-or-admin, `calendar_events_for_token` by the memberships attached to
  the token itself.
- **`photo_backup_list_objects` is `service_role` only** and is correctly absent
  from the advisor's list.

**Measured against production, not reasoned about:**

| Probe | Result |
|---|---|
| `private.squad_expects_gender` via REST, anon key | **404** — the `private` schema is not exposed by PostgREST |
| `public.my_squad_staff` via REST, anon key | **401** — granted to `authenticated` only |
| `public.register_my_player` via REST, anon key | **42501 "You must be signed in."** |
| `public.calendar_events_for_token` via REST, anon key, bogus token | **`[]`** |
| `select auth.uid()` under `set local role anon` | **null**, which is what makes the guard above fire |

⚠️ **THE `register_my_player` PROBE WAS BUILT SO IT COULD NOT WRITE EVEN IF THE
GUARD HAD FAILED** — it passed a team id that does not exist, so the second
guard would have stopped it before any insert. Confirmed after the fact: zero
rows created. **A probe against production has to be safe in the branch where it
proves you wrong.**

### The two worth a migration

- ✅ ~~**`public.register_my_player` has `anon` EXECUTE and does not need it.**
  No hole — the body's first statement refuses a null `auth.uid()`, proven
  above — but the grant is unnecessary, and revoking it is the same reasoning
  as the 14 Aug table-privilege revoke: protection should come from the GRANT,
  not only from the code behind it. The app calls this as `authenticated`, so
  nothing legitimate loses access.
  `revoke execute on function public.register_my_player(text, uuid, text, boolean, boolean, boolean) from anon;`~~
  — **DONE, 18 Aug 2026.** Full account, and the harness that had called this
  grant deliberate on the strength of the same misreading, in the "Cheap"
  section above.
- **Ten `private.` functions carry an `anon` EXECUTE grant**, including
  `squad_expects_gender`, which is also the one function the advisor flags for a
  mutable `search_path`. ⚠️ **IT IS `SECURITY INVOKER`, SO THE search_path LINT
  IS MILD** — it runs with the caller's own privileges and gains nothing from a
  hijacked path — and the schema is unreachable through the API anyway (404
  above). Worth setting `search_path` for hygiene, since it is called from inside
  a `SECURITY DEFINER` function, and worth revoking grants that were never meant
  to exist. **Low priority and honestly labelled as such.**

## The status check the approval gate never had

- ✅ **FIXED — `private.can_approve_team` did not require `status = 'active'`.**
  Found 17 Aug 2026 by chasing an "Unnamed player" in the live approval queue,
  which turned out to be a `request_staff_role` row. Its two siblings
  (`can_see_team`, `can_edit_team`) both carry the test; this one did not, and
  had not needed to until a pending STAFF row became possible on 16 Aug.
  Measured on production in a rolled-back transaction with an invented club —
  **pending coach: ALLOWED; active coach: ALLOWED; coach of another squad:
  refused** — then re-measured with the fix applied inside the same transaction,
  where only the first line changed.
  `db/migrations/20260817_approve_requires_active_membership.sql`,
  `db/tests/approve-status-gate.sql`, and the client half in `src/lib/scope.js`.
  ⚠️ **IT WAS NOT ONLY THE APPROVE BUTTON.**
  `private.can_squad_staff_see_pending` calls `can_approve_team`, and backs the
  policy letting an approver read a pending registrant's NAME and EMAIL. So the
  same omission exposed those to somebody who had merely asked to coach.
  ⚠️ **AND THE EXISTING HARNESS COULD NOT HAVE CAUGHT IT.**
  `db/tests/rls-squad-staff-approval.sql` tests a medic, a coach of another
  squad, and a parent self-approving — but every staff row in its fixture is
  `'active'`, because when it was written on 9 Aug a pending staff row could not
  exist. Same for every membership fixture in `tests/` — none carried a `status`
  at all, though the column is NOT NULL. **A new writer was added and the old
  readers were not audited: the screen, the SQL gate, and the tests all missed
  it for the same reason.**

- ✅ ~~**`private.is_admin` HAS THE SAME OMISSION AND WAS DELIBERATELY LEFT.**
  It tests role and club and never status. **Not reachable today** — measured
  17 Aug 2026, production held **zero** admin memberships that were not active,
  and `request_staff_role` refuses any role but coach/manager/medic, so nothing
  can currently create one. It was left alone because `is_admin` backs most of
  the admin RLS surface, and adding a condition to it changes the blast radius
  from one function to every admin policy on a live site.
  **Re-measure the count before assuming it is still unreachable**; the moment
  any path can create a pending admin row, this becomes the same bug with a
  bigger radius.~~ — **APPLIED TO PRODUCTION 18 Aug 2026.** Jay's call, having
  been shown the blast radius measured rather than described.
  `db/migrations/20260818_admin_gates_require_active_membership.sql`,
  `db/tests/admin-status-gate.sql`, and the client half in `src/lib/scope.js`.

  ⚠️ **IT WAS FOUR FUNCTIONS, NOT ONE, AND THE LINE ABOVE NAMED ONLY THE ONE
  SOMEBODY ALREADY KNEW.** Found by asking production which functions mention
  `memberships` and not `status`, rather than by grepping for `is_admin`:

  | Function | Backs | Had a status test |
  |---|---|---|
  | `private.is_admin(uuid)` | 15 policies, 9 tables | no |
  | `private.is_admin_anywhere()` | `access_requests`, `photo_backup_runs` | no |
  | `private.shares_admin_club(uuid)` | `profiles` ×2 | no |
  | `private.can_admin_see_pending(uuid)` | `profiles` | no |

  ⚠️ **THE LAST TWO WERE THE ONES THAT MATTERED, AND THEY ARE THE ONES NOBODY
  HAD NAMED.** They back `profiles`, so a pending admin row could read every
  member's NAME and E-MAIL — the same thing the 17 Aug bug leaked, by a
  different route. Fixing only `is_admin` would have closed this item while
  leaving that open.

  ✅ **Measured under RLS, before and after, in a rolled-back transaction on
  production with an invented club.** A pending admin read **1** profile row
  belonging to another member before, **0** after; an active admin reads **1**
  throughout, which is the control that stops "refuse everybody" passing as a
  fix. The four functions answered `true/true/true/true` to a pending admin
  before and `false/false/false/false` after, with an ordinary parent `false`
  throughout as the second control.
  ✅ **The harness injects the four pre-18 Aug bodies back and confirms it
  fails** — a green run from it means something.

  ⚠️ **THREE MORE FUNCTIONS OMIT THE TEST AND WERE LEFT, ON PURPOSE.**
  `private.is_attached_to_team` and `private.is_own_player` answer for PARENTS
  and PLAYERS too, and **a pending parent row is the ordinary registration
  state — reachable today, unlike a pending admin.** Whether a parent awaiting
  approval should see their child's squad is a design question with a real
  answer either way, not a hole, and changing it under cover of a security fix
  would alter what live families see mid-registration.
  `private.may_set_staff_photo` delegates to `is_admin` and `can_edit_team`, so
  its caller side is already fixed.

  ⚠️ **AND THE DEFERRAL WAS RECORDED IN A WAY THAT COULD NOT FIND THE OTHER
  THREE.** Both this file and `db/schema/functions.sql` wrote it as
  "`private.is_admin` still has the same omission" — the NAME already known,
  not the QUESTION. **A deferral is worth writing down as the question it
  leaves open**, because the name only finds what somebody had already looked
  at.

## ✅ `npm run db:check` RUNS AGAIN — fixed 18 Aug 2026

- ✅ ~~**Every SQL harness is currently unrunnable, because ONE of them cannot
  fail.** `scripts/db-check.mjs` checks its files before it connects and stops
  the whole run if any is unsafe. Today it stops on:

  ```
  db-check: REFUSING TO RUN. These harnesses cannot FAIL:
    head-coach-flag.sql: no "raise exception" anywhere
  ```

  `db/tests/head-coach-flag.sql` arrived in `caddd7f` (#228) with its
  assertions written as SELECTs, which the runner reports `ok` for whatever
  number comes back. **The runner is right and the harness is wrong** — this is
  the gate working, not a bug in the gate.
  ⚠️ **THE COST IS THAT NOTHING ELSE RUNS EITHER.** The refusal is all-or-
  nothing by design (an unsafe file must not be reachable part way down a run),
  so every other harness — including `db/tests/admin-status-gate.sql`, added
  18 Aug — is currently unreachable through its own runner. That is precisely
  the state `claude/runbooks/db-harnesses.md` exists to prevent: "a check nobody
  RUNS is not a check."
  ⚠️ **AND IT WAS NOT NOTICED FOR A REASON WORTH KNOWING**: the nightly
  `.github/workflows/db-check.yml` is inert until a `SUPABASE_DB_URL` secret
  exists, so it reports "did not run" and PASSES. Nothing was ever going to go
  red. **Fix is to wrap that file's expectations in `do $$ … raise exception …
  end $$;`**, which is a small piece of work on somebody else's assertions and
  wants doing on purpose rather than in passing.~~ — **DONE the same day.**
  `db/tests/head-coach-flag.sql` now judges its six answers in a `do $$ … raise
  exception … end $$;` block instead of printing them under an `EXPECTED:`
  comment for a human to compare.

  ✅ **The runner gets past its static gate**: `npm run db:check` now stops at
  "no connection string" — which is Jay's to supply — rather than refusing the
  files. That is the measurement, not the absence of the old message.
  ✅ **Run against production in a rolled-back transaction: all six pass, and
  the self-test fires** — dropping the one-head-coach-per-squad index flips
  assertion 3 from `refused (23505)` to `ALLOWED` while assertion 4 stays
  `refused (23514)`. That second half is a new control: without it, a fault
  wider than the one named would flip check 3 for the wrong reason.
  ✅ **AND THE NEW VERDICT BLOCK WAS PROVED TO FAIL**, by feeding it a table
  with one planted wrong answer: it raised
  `HEAD COACH: "1 backfill flags the titled head coach" answered not flagged,
  expected FLAGGED.` **A check that has never failed is not a check — which is
  the entire reason this item existed.**

  ⚠️ **THE SQLSTATES ARE PART OF THE ASSERTION NOW.** `23505` is the unique
  index refusing a second head coach; `23514` is the CHECK refusing a non-coach.
  A change that swapped one guarantee for the other would leave both lines
  reading "refused" and the old eyeball comparison would have shrugged.

  ⚠️ **THE NIGHTLY IS STILL INERT.** Fixing the harness did not add the
  `SUPABASE_DB_URL` secret, so `.github/workflows/db-check.yml` continues to
  report "did not run" and pass. **Until Jay adds it, these harnesses run only
  when somebody runs them** — which is the same failure one step further back.
  Settings → Secrets and variables → Actions → New repository secret.

  ✅ **THE SECRET WAS ADDED 19 Aug 2026 AND THE RUNNER NOW RUNS.** What it
  found on its first real execution is the point of this whole item: **14 of
  34 harnesses failed**, and they had been failing silently for up to nine
  days. Thirteen are now fixed. **Two remain and are recorded here rather than
  quietly dropped.**

  ✅ **BOTH REMAINING FAILURES WERE RESOLVED THE SAME DAY, AND NEITHER WAS
  WHAT IT LOOKED LIKE.** All **34 harnesses now pass, with all 34 self-tests
  firing.**

  ✅ **`rls-squad-staff-approval.sql` was NOT a disclosure.** It reported
  `pending membership rows still visible: U16 coach -> 2`, which reads exactly
  like a coach seeing rows they should not. **Measured instead of assumed:**
  production held 2 genuine pending registrations at the time, the fixture's
  own two rows were both correctly approved, and a U16B coach was measured
  seeing **0** pending rows belonging to any other squad. RLS was right.
  ⚠️ **The harness counted every pending row in the CLUB rather than its own**,
  so it would have gone red on any night a real family was waiting for
  approval — a check whose result depended on the live roster. Now scoped to
  the two profiles it creates.

  ✅ **`rls-availability-equivalence.sql` is REPOINTED, not deleted** (rule 7).
  It was written to compare a policy merge before and after, and the merge
  shipped 9 Aug — so the fault could no longer be injected and it aborted every
  night. The seven-caller matrix it proved is now asserted directly against the
  merged policies that ship today.
  ⚠️ **Repointing it caught three real behaviour changes since 9 Aug**, all
  deliberate and each owned by another migration: a PENDING coach lost access
  when the admin gates began requiring an active membership (18 Aug); a PENDING
  parent GAINED the ability to see their own child's answer (the "app lost my
  answer" fix); and `anon` moved from silently matching nothing to being refused
  by the table grant (14 Aug).
  ⚠️ **AND ITS ORIGINAL SELF-TEST HAD QUIETLY STOPPED WORKING.** It dropped the
  `can_edit_team` arm of `avail read` — load-bearing on 9 Aug, when that
  function ignored status. Since 18 Aug it requires an active membership, so
  every caller it admits is already admitted by `can_see_team`: **the arm is
  redundant today and removing it moves nothing**, meaning the self-test would
  have passed while proving nothing. It now drops `is_own_player` instead,
  which genuinely blinds a parent to their own child's answer.
  ⚠️ **The redundant arm was KEPT.** It costs one boolean and is what stops
  `avail read` drifting if that status test is ever taken back out.

  ✅ **CLOSED 20 Aug 2026 — THE RUNNER RUNS.** This said the set that had never
  met its own runner "keeps growing", and named `db/tests/approval-push.sql`.
  `SUPABASE_DB_URL` was set on **19 Aug 12:50 UTC** and the nightly at
  **20 Aug 04:01 executed 34 harnesses**, approval-push among them, reporting
  "All harnesses passed." The distinction this item was built on — "the harness
  is green" versus "the harness runs" — is now true in both directions.
  ⚠️ **AND IT IMMEDIATELY TAUGHT A THIRD THING, WHICH IS WHY THIS STAYS HERE.**
  approval-push and notice-push passed that 04:01 run **by coincidence**: both
  compared the whole audience's notified devices against one person's, equal
  only while a single person had subscribed. Subscribers went 1 → 8 during the
  day and both would have gone red the next morning, for a change nobody made.
  **A green nightly is evidence about the moment it ran and nothing else.**
  Fixed in `7390a2c`; `claude/runbooks/db-harnesses.md` carries the rule.
  ✅ Before trusting the paste route for DDL, the rollback itself was proved:
  a throwaway `create table` inside `begin`/`rollback` was gone afterwards,
  **with a control confirming the same query could see a table that does
  exist** — otherwise the zero proves only that the query found nothing.

## Real gaps, no cheap fix

- 🟡 **No audit log — NARROWED 17 Aug 2026, NOT CLOSED.** `public.membership_audit`
  now records every grant, change and revoke of a MEMBERSHIP, including
  super-admin, written by a trigger on the row and readable at
  `/admin/rights-log` by super admins only. **⚠️ THAT IS ONE OF THE FOUR THINGS
  THIS ITEM LISTED.** Still unrecorded: **who deleted a player**, and **who edited
  a child's contact details**. `events.created_by`, `availability.updated_by` and
  `attendance.recorded_by` remain single overwritten columns rather than history.
  ⚠️ **DO NOT READ THE NEW SCREEN AS "we have an audit log".** It answers "who
  gave this person access", and nothing else — a deleted player still leaves no
  trace at all, which is the more alarming of the two gaps on a club whose members
  are children.
  ⚠️ **AND IT STARTS AT 17 Aug 2026.** There is no history before that date and
  none can be reconstructed, so an empty log is not evidence that nothing
  happened. The screen says so in its empty state.
- 🟡 **DELETING A PLAYER FAILS FOR MOST REAL PLAYERS — found 2 Sep 2026 while
  designing "mark as left", NOT fixed by it.** Read from `db/schema/tables.sql`,
  not yet reproduced live. Two independent causes: (1) `memberships.player_id` is
  `ON DELETE SET NULL` but `memberships_family_role_needs_player` requires a
  parent/player row to carry a `player_id`, so the delete violates the CHECK for
  any child with a linked parent; (2) `invites.player_id` and
  `invite_targets.player_id` have no `ON DELETE` rule, so any child ever invited
  is refused. `deletePlayer` surfaces both as a permissions-shaped message and
  the staff member gives up. ⚠️ **AND WHEN IT DOES SUCCEED IT IS WORSE:** the
  parent's membership survives with a blank player link, still `active`, still on
  the squad — roster, chat and pushes for a squad their child has left.
  ✅ **THE DESIGNED REMEDY FOR "THE CHILD QUIT" HAS BEEN BUILT — both migrations applied to live 2 Sep 2026, pull request pending** —
  `claude/specs/2026-09-02-player-leavers-design.md`, `mark_player_left`/
  `restore_player`. **Delete itself is UNTOUCHED and still broken** for
  exactly the reasons above; it still needs its cascades decided (parent
  membership: delete the row; invites: cascade) and a harness that first
  REPRODUCES both refusals.
- 🟡 **A `staff-photos` OBJECT IS ORPHANED IN PRODUCTION, since 31 Aug 2026 —
  found 2 Sep 2026 by the whole `db:check` run while shipping player leavers;
  not caused by it.** `db/tests/photo-orphans.sql`: "staff-photos orphaned
  (expect 0) -> 1". Measured: one `staff-photos` object created 2026-08-31
  17:57 UTC with no `profiles` row pointing at it. `RESTORE.md` already
  records that `staff-photos` is NOT mirrored to R2, so deleting it is
  irreversible — do not sweep it without checking who it was and whether it
  is still wanted; use the Storage API, never `storage.allow_delete_query`.
  Not fixed here.
- **The whole app is one JavaScript chunk** and every parent downloads all of it.
  ⚠️ Re-measure rather than citing an old figure. Two fixes, biggest first:
  `flag-icons` is imported whole for a phone country picker and is most of the CSS
  plus megabytes of SVG; and route-level `React.lazy` on `AdminDashboard`,
  `MatchSheet`, `PlayerImport` and `Allocation` — the admin half is used by three
  people and shipped to everyone.
  ⚠️ `tests/pwa-build.test.js` and `tests/button-sweep.test.js` READ `dist/`, so run
  `npm run build && npm test`, never `npm test` alone, when touching this.

  ✅ **THE FLAG HALF IS FIXED — 17 Aug 2026. The CSS claim was RIGHT and the
  reason nobody had found was the BUNDLER, not the library.** `flag-icons`
  itself is 28 kB raw / **2.36 kB gzip** — 2.5% of the stylesheet, so anyone who
  measured the package would have concluded this item was wrong and moved on.
  What made it 88.6% of the built CSS was Vite's `build.assetsInlineLimit`
  (4096 bytes by default), which had written **400 of the 542 flag images
  straight into `index.css` as `data:` URIs**. Measured on the same build with
  only that option changed:

  | | before | after |
  |---|---|---|
  | `index.css` | 475.15 kB (gzip **95.74**) | 84.31 kB (gzip **18.37**) |
  | `.fi-` rules | 420,823 of 475,154 chars | unchanged in count, now `url()` refs |
  | flags inlined | 400 | **0** |
  | PWA precache | 1682.76 KiB | **1301.08 KiB** |

  ⚠️ **IT COUNTED TWICE, WHICH IS WHY IT BEAT THE JS SPLIT.** The stylesheet is
  render-blocking AND precached, so ~77 kB gzip of other countries' flags was
  downloaded before first paint and again into every install — for a component
  that draws ONE flag, on the registration and profile forms only.
  ⚠️ **AND `PhoneInput`'s OWN HEADER ALREADY CLAIMED THE FIXED BEHAVIOUR** —
  "because they are CSS background images the browser only fetches the handful
  actually painted". True of flag-icons and defeated underneath it. **A design
  rationale can be correct about the library and wrong about the build.**
  ⚠️ **THE WORKBOX `globIgnores` AIMED AT THIS AND MATCHES NOTHING** — see the
  note now in `vite.config.js`. Deleting all three patterns produces an
  identical precache. It guarded a door the flags never used.

  ✅ ~~**THE `React.lazy` HALF IS MEASURED BUT NOT TAKEN.**~~ — **EXAMINED IN
  FULL AND CLOSED, 18 Aug 2026. Jay's call.
  `claude/decisions/2026-08-18-no-route-level-code-splitting.md` is the ruling;
  read it before re-proposing this.** Built as a spike, measured three ways,
  reverted — nothing was committed to `src/`.

  ⚠️ **THE SAVING WAS BIGGER THAN THE FIGURE THIS ITEM CARRIED, NOT SMALLER.**
  The −27.26 kB above covered the `/admin` screens only; splitting the coach
  screens (`Lineup`, `GameTime`, `MatchSheet`, `Accounts`) as well measured
  **283.51 → 244.08 kB gzip, −39.43**. It was not refused for being too small.

  ⚠️ **IT WAS REFUSED BECAUSE THE BEST ARGUMENT FOR IT IS FALSE, AND THAT IS
  THE PART WORTH KEEPING.** The case was that splitting makes every DEPLOY
  cheaper for members — one chunk today means one edited screen re-downloads
  the whole app. **Tested: one rendered string changed in `Allocation.jsx` moved
  EVERY chunk hash, all twenty.** Lazy chunks import their shared code from the
  entry chunk, so a leaf change bumps the entry, and the entry bump rewrites
  every sibling's import. **Deploys cost members exactly what they cost today.**
  Fixing that needs a `manualChunks` vendor split, which is its own piece of work.

  ⚠️ **THE PRECACHE NOTE ABOVE WAS RIGHT AND IS NOW MEASURED FURTHER**: splitting
  alone takes the install 1301.07 → 1305.66 KiB, i.e. **larger**. Leaving the
  desktop-only admin chunks out via `globIgnores` gets it to **1228.44 KiB
  (−72.63)**, and taking `Accounts` with them to 1194.26 KiB — **recommended
  against**, because `/approvals` renders `Accounts` and that is a coach on a
  phone at a pitch. A chunk left out of the precache has no offline story at all;
  `runtimeCaching` covers Supabase REST GETs, not JavaScript.

  ⚠️ **AND THE MEASUREMENT READ FALSE TWICE BEFORE IT READ TRUE.** A comment
  added to a screen rebuilt byte-identically (the minifier strips it), and so did
  an exported `const` nobody imports (Rollup tree-shakes it). Both said "one edit
  changes nothing", the opposite of the truth. **Only an edit to a rendered
  string moves a hash** — confirm the marker is present in `dist/` before
  trusting any before/after bundle comparison.
- **The calendar token is an unrevocable, non-expiring credential in a URL**, and
  nobody can see if one has leaked. ⛔ **Do not add an expiry** — a feed that dies on
  a timer produces a club-wide "my calendar stopped working" with no way to warn
  anyone. The cheap fix is visibility: `last_used_at`, shown on the subscribe screen,
  plus an admin-side reset.
- ✅ ~~**`saveParents` is delete-then-write**, so a failure between the two loses a child's
  parent records. ⚠️ Not the same as the deliberate two-call split for player
  contacts, where a partial failure surfaces distinctly; here it surfaces as missing
  data.~~ — **FIXED 18 Aug 2026.**
  `db/migrations/20260818_save_player_parents_atomically.sql`,
  `db/tests/save-player-parents.sql`, and the client half in `src/data/parents.js`.
  `public.save_player_parents` does the delete, the updates and the inserts in one
  statement, so a child's list either ends up exactly as submitted or is untouched.

  ⚠️ **THE LINE ABOVE OVERSTATED IT, AND THE OVERSTATEMENT IS WORTH KEEPING.**
  "Loses a child's parent records" is not what usually happened. The DELETE only
  removed rows NOT in the submitted set, so **a plain edit was always safe** —
  every kept row carries an id and nothing was deleted. The damage needed a row
  to be **removed in the same sitting**: then the removal applied, the edits did
  not, and **the screen said the save had failed.** The record left behind was
  one nobody chose, and the user had been told it did not exist.
  **An overstated finding is one the next person disproves in five minutes and
  then stops trusting the file.** The honest version is narrower and still worth
  fixing.

  ✅ **Measured on production in a rolled-back transaction**: replaying the old
  delete-then-write sequence left **1 of 2 rows**. That replay is kept as the
  harness's self-test, because "the row count did not change" is an assertion
  that would pass against a table nothing ever touches.
  ⚠️ **AND IT COULD NOT BE MODELLED WITH AN EXCEPTION BLOCK ROUND BOTH HALVES** —
  `begin … exception` opens a SUBTRANSACTION, which rolls the DELETE back too and
  makes the old code look atomic. It never was: the DELETE and the UPDATE were
  separate PostgREST requests, so the first COMMITTED before the second was sent.
  The harness leaves the DELETE outside any handler and fails only the step after
  it.

  ⚠️ **THE `PlayerForm` PREFILL GUARD IS STILL LOAD-BEARING.** A failed parent
  read sets `parentsStatus` to 'error' and the submit handler skips the parent
  write entirely. That stops an EMPTY editor being saved over rows that were
  never loaded — a correct-but-unwanted write rather than a failed one, which no
  amount of atomicity helps with. **Do not delete it as redundant.**

  ⚠️ **THE FUNCTION IS `SECURITY INVOKER`**, so the two existing policies on
  `player_parents` still decide who may write and this added no authorisation
  surface. Proved in the harness by a coach of another squad being refused.
  **If anyone ever makes it `SECURITY DEFINER`, it needs a guard the same
  minute.**
- **`social_ideas` uploads the image BEFORE inserting the row**, so a failed insert
  orphans an object that appears on no screen and nothing sweeps.
- **`supabase_migrations.schema_migrations` is polluted** — many stale rows, a dozen
  of one name. ⚠️ **Supabase branching replays that history, so branching does not
  work on this project** (tried 13 Aug, `MIGRATIONS_FAILED`, zero tables). Cleaning it
  is a prerequisite for having any staging environment. **Use a rolled-back
  transaction on production instead** — the house style for `db/tests/*.sql`.

## Shipped but never exercised by a real person

- **The match sheet** — no coach has filled one in during a real match.
  ⚠️ **BUT IT HAS NOW HAD ITS FIRST REAL ENCOUNTER, AND THAT CHANGES WHAT THIS
  ITEM MEANS.** Jay opened it on a phone and shared one on 16 Aug 2026. Three
  bugs fell out, all fixed and live in `d576bb1`: the facsimile collapsed at
  phone width and the share photographed the collapse, the away TRIES had no
  box, and the 22 never populated from the lineup. **So this is no longer
  "untouched by reality" — the KNOWN bugs are gone, and what is left is the
  half nobody can test from a desk**: a coach filling one in for a real match,
  and the picture arriving at RCM — the same open question already recorded
  against the lineup image, and for the same reason: both go through
  `src/lib/shareImage.js`, and no query can see a WhatsApp group.
- **The scoring model** — no coach has entered a real score.
- **Staff photos** — nobody has uploaded one in the real app.
- **The photo backup restores** — copying is not restoring, and nobody has ever got a
  photograph back. ⛔ **Tabled by Jay.**
- **Realtime's safety half** — nobody has watched a non-admin *fail* to receive a
  change for a squad they are not in. ⚠️ **That test must be an EDIT, never a DELETE**:
  Supabase does not apply RLS to delete events, so a deleted fixture reaches every
  subscriber regardless of squad and would read as a leak that is not one.
  ⚠️ **The thundering herd is real now that realtime works** — every subscriber in
  scope refetches on any change. Nothing at today's size; the least-tested thing in
  the app at the 1500 members Jay expects, and SQL cannot measure it.
- **`/notices` has no real-browser coverage.** `harness/` carries only the pure
  `NoticeBoard` card, so the composer and the receipts sheet cannot be reached there.
- **`attendance` is empty.** Anything computed from it — a percentage, consecutive
  absences, an "at risk" flag — has no data to stand on and no way to have its
  thresholds judged. Take some registers first.

## Deferred by Jay, still deferred

- **The `group_id` multi-squad edit/cancel.** A series can be edited; a group cannot.
  Reaching across squads has a different blast radius, because there RLS makes the
  write genuinely partial rather than all-or-nothing.
- **Test data cleanup.**

## Supabase security advisor — read through, not yet actioned

Run `get_advisors` rather than trusting this list. As of 14 Aug 2026:

- ✅ **Leaked-password protection no longer appears** — Jay turned it on. Recorded
  because the evidence is the ABSENCE of a lint, which this repo has misread
  before; confirm on the dashboard if it ever matters.
- ✅ **`private.events_result_from_components` is pinned**
  (`20260814_pin_scoring_trigger_search_path.sql`), and
  `db/tests/search-path.sql` now guards the whole schema.
- ⛔ **`private.squad_expects_gender` stays unpinned deliberately.** Do not
  "finish the job" — the reasoning is in `db/schema/functions.sql` and the
  harness names it as an exemption rather than counting.
- ✅ **The two lint types newer than the 13 Aug audit were READ THROUGH IN FULL
  on 24 Aug 2026, and there were no findings.** What was measured, in the
  database rather than in the advisor's prose:
  - **`anon` + `public` schema:** exactly ONE `SECURITY DEFINER` function is
    executable — `calendar_events_for_token`, deliberate and asserted both
    directions by `db/tests/grants.sql` §3b. The advisor's `anon` lint lists
    only it. Nothing else.
  - **`authenticated` + `public` schema:** every listed function is the app's
    own RPC API, and each is expected to SELF-GATE because SECURITY DEFINER
    bypasses RLS. The risky ones were read in source, not assumed:
    `set_admin_rights` gates on `is_super_admin` and raises;
    `welfare_overview`, `approval_recipients`, `announcement_stats`,
    `storage_usage`, `publish_training`, `clear_channel` gate on `is_admin`
    variants; `message_read_stats` filters on `private.can_edit_team` **as a
    WHERE predicate** (a keyword probe for `raise` misses it — it refuses by
    returning nothing); `pitch_occupancy` requires an active staff/admin
    membership and redacts by column selection; `set_staff_photo` gates on
    `may_set_staff_photo` plus path ownership.
  - **`private` schema:** many helpers carry the Postgres-default PUBLIC
    execute bit, including for `anon` — and it is UNREACHABLE: `anon` has **no
    USAGE on the `private` schema** (measured:
    `has_schema_privilege('anon','private','usage')` = false), and PostgREST
    does not expose the schema. `authenticated` keeps USAGE because RLS
    policies call these helpers as the querying role. Tidiness option, not a
    gap: new `private` functions could revoke default execute, but nothing is
    open through it today.
  - The three `rls_enabled_no_policy` INFO lints (`availability_nudges`,
    `photo_orphan_scans`, `signup_nudges`) are RLS-on with zero policies —
    **deny-all to client roles**, which is correct for service-role-only
    tables.
  ⚠️ **THIS LINE ITSELF CARRIED THE STALE CLAIM UNTIL 18 Aug 2026** — it named
  `register_my_player` as deliberate too, on the same evidence (an explicit
  re-grant in two migrations) that `claude/open-items.md`'s "Cheap" section had
  already, elsewhere in this same file, correctly identified as NOT a decision.
  Two sections of one file disagreed about one grant for five days. Revoked;
  see the "Cheap" section entry for the full account.

## Shipped but never seen against real data

⚠️ **These are not known-broken. They are known-UNVERIFIED**, which is a
different claim and the one this repo has confused before. Each shipped with a
green suite and has never been exercised by a human on the live site.

- ✅ ~~**Push notifications have never been received by a real browser.**~~ —
  **RECEIVED, 23 Aug 2026, on a real iPhone that is not Jay's.** A notice and a
  U13 Mixed fixture change, posted by Jay from another device, both arrived on
  the lock screen of the club iPhone signed in as a parent of that squad;
  `push-send` logged two POST 200s at 07:26 and 07:27 UTC. The ONE thing the
  server-side smoke tests could not prove is now proven — **on iPhone AND
  Android.** The Android test followed at 07:48 UTC the same morning: Chrome
  on Jay's Android, signed in as a parent-only account on U13 Mixed, a
  fixture change by Jay's main account from his laptop, banner in the shade.
  Two more `push-send` POST 200s. (The club's one earlier FCM subscription,
  from 20 Aug, was already dead and was deleted by `push-send` during the
  first notice — Google answered 404/410 — which is the self-cleaning
  behaviour working as designed.)
  ⚠️ **The first attempt found a bug before it could test anything**: the
  second person to sign in on that phone could not turn notifications on —
  `db/migrations/20260823_push_subscription_takeover.sql`, fixed and deployed
  the same morning. The rest of this item is kept for what it records about
  the smoke tests. Built and
  deployed 18 Aug 2026 — `claude/plans/2026-08-18-push-notifications.md`. Every
  server-side piece was smoke-tested LIVE against production: a real trigger
  fire, a real Vault-stored VAPID key, a real signed JWT, real RFC 8291
  encryption, a real HTTP POST, a real 410 cleaning up its own subscription
  row. **None of that proves a real browser can decrypt and show one** — the
  one thing only an actual person, subscribing from an installed PWA, can
  close. The first real test is a member turning the toggle on in
  More → Notifications and getting a reply on a report.
  ⚠️ **On iPhone this needs the app added to the Home Screen first** (iOS
  16.4+) — the UI says so, but nobody has confirmed that message reads clearly
  to somebody who has never done it.

- **The staff-request queue has never been seen with a real row in it.** Built
  17 Aug 2026 after Jay found a coach's request rendered as "Unnamed player".
  ⚠️ **AND IT CANNOT BE SEEN TODAY**: production has **zero** pending
  memberships — the one real staff request was approved by Jay, deliberately,
  at 11:16 UTC that morning. So the section is correct-by-test and unseen by
  anyone, and it renders only when non-empty, meaning the live site shows
  exactly what it showed before. **The first real look at it will be the next
  person who asks to help with a squad.**
  ⚠️ Its vouching controls are also unexercised — `membership_vouches` is empty.
- **The tier-eligibility warning has never had anything to render.** It was
  verified present in the live bundle on the day it shipped, which proves the code
  deployed and proves nothing else. **Measured on production 17 Aug 2026: the club
  has 1 fixture carrying a tier and 4 graded players, and the two do not overlap.**
  Seven children are picked on that fixture and **none of them is graded at all**,
  so there is no row in the database on which the sentence could appear.
  ✅ **THAT ZERO IS A FACT ABOUT THE CLUB, NOT A BROKEN QUERY** — the control was
  run: all 4 grades join to real players, and **all 4 graded children ARE picked in
  lineups**, just in the two lineups whose fixtures carry no tier. So both halves of
  the feature are in live use and have simply never met.
  ⚠️ **SO ITS SILENCE ON THE LIVE SITE IS NOT EVIDENCE THAT IT WORKS.** A coach
  opening that lineup today sees exactly what they would see if the feature had
  never been built — which is also the state a broken read would produce, since the
  screen is deliberately built to fall silent rather than fail. **The first real
  test is a graded child picked for a tiered fixture**, and nothing has produced
  one yet. Re-run the counts rather than trusting these.
- **The coach roster's nested grouping** (`cf8a221`, `3044872`) — tier, then
  forwards and backs. Every test runs in jsdom against invented squads. Nobody
  has yet opened the real U16B roster and confirmed the headings, the counts, or
  that the constant-column rule hides what it should. **The club-wide view will
  show one "Not graded" heading over everything until more players are graded**;
  that is expected, not a bug.
  ⚠️ **THE "TIDY FIX" THIS ITEM PROPOSED IS NOW HALF-DONE, BY A DIFFERENT ROUTE.**
  It suggested defaulting to tier grouping only when the roster is filtered to a
  single squad. What shipped on 15 Aug (`de82481`) instead drops tier and
  forwards/backs entirely when every squad in view is **U10 or below**, because
  those squads have no grades and no positions to group by — `src/lib/minis.js`.
  A club-wide view, or any view containing one U11+ squad, still defaults to tier
  and still shows the single "Not graded" heading. **So the complaint this item
  records is unchanged for the squads it was actually about.**
- **The all-day calendar entry has never reached a phone.**
- ✅ ~~**THREE FEATURES SHIPPED TO PRODUCTION ON 15 Aug AND NONE HAS BEEN LOOKED
  AT.**~~ — **Jay opened the live site on a phone at the end of that day, after
  eight deploys, and reported no problems.** That closes the biggest unknown of
  the day: sign-in and tab navigation work under react-router 7, which was the
  one failure nobody could have detected from here.
  ⚠️ **BE PRECISE ABOUT WHAT "it's fine" ESTABLISHES.** It is one person, on one
  device, looking — not a per-item verification, and not a check against a real
  photograph or a large squad. What it rules out is the class of failure that
  would have been obvious: a blank screen, a broken route, a page that lurches.
  It does not rule out a wrong colour on a state edge nobody happened to look
  at, or a tile that only misbehaves at a size his own squads do not have.
  ⚠️ **THE ITEMS BELOW ARE STILL UNVERIFIED IN THE NARROW SENSE THEY DESCRIBE**,
  and are kept for that reason rather than deleted. In particular the contact
  tiles have STILL never been drawn with a real photograph — two of fifteen
  staff have one, and neither sits on a squad that was opened.
  The original entry, kept because the reasoning outlives the verdict:
  The Home redesign (`d5b8667`), the minis simplification (`de82481`) and the
  squad-contact tiles (`03de5ca`). ⚠️ **Every visual claim made about them was
  measured in the harness against INVENTED data**, which is the right tool and is
  not the same as having seen them. The specific things a browser cannot settle:
  - **The contact tiles have never been drawn with a real photograph.** The
    harness stands one in with a 1×1 pink PNG stretched by `object-cover`, so
    the scrim's whole job — holding white text legible over an unknown image —
    is untested against an actual face. Two staff have photos; thirteen do not.
    ✅ **THIS ONE PAID OUT ON 15 Aug 2026, AND IT IS THE BEST ARGUMENT IN THIS
    FILE FOR KEEPING SUCH ITEMS.** The first real photograph put on a real tile
    exposed a bug no harness could have: the photo positioner did not position
    anything. `SquadStaffCard` had no `object-position`, so `object-cover`
    centred every crop and the lead tile cut the top off a head. A 1×1 PNG has
    no top of a head to cut off — **the fixture was incapable of failing.**
    ⚠️ **The scrim half of this item is still unverified** and the entry stays
    for it.
  - **Almost every squad will render an even grid, not the featured tile**,
    because the lead is chosen by title and only two people are titled "Head
    Coach". That is the design working, and it will look like the feature is
    missing. Setting titles on `/admin/staff` is the lever.
  - **The collapse only appears for a parent attached to more than one squad**,
    which is two of the club's twelve.
  - **The skeleton holds the first screenful and the page still grows below it.**
    Measured at 390×844: the loading block goes from 110px to 942px, against a
    loaded page of about 1,800. The honest claim is "nothing above the fold
    moves", and whether that is enough is a question only a phone can answer.
- **`src/lib/shareImage.js` revokes its blob URL on the line after `link.click()`,
  and never puts the anchor in the document.** DESKTOP DOWNLOAD PATH ONLY — the
  phone takes the `navigator.canShare({files})` branch above it and never reaches
  this code, so it cannot be behind any share problem reported from a phone.
  Chrome tolerates both (the download starts synchronously inside `click()`);
  Firefox has historically required the anchor to be IN the DOM, and an immediate
  revoke is a documented race elsewhere.
  ⚠️ **NOT FIXED, AND DELIBERATELY SO: IT HAS NEVER BEEN SEEN TO FAIL.** Noticed
  16 Aug 2026 only because instrumenting the share to measure the PNG's size
  revoked the URL before an async reader could load it — which is a fact about
  the instrument, not evidence about Firefox. Fixing shared code on a hunch is
  how a working path acquires a regression. **The trigger is somebody reporting
  that Share does nothing on a desktop browser**; the fix is two lines
  (`document.body.append(link)` … `link.remove()`, and revoke on a later tick).
- **The lineup image has never been seen to reach a WhatsApp group.** Rows exist
  in `lineups` and `lineup_players` — measured 15 Aug 2026, so a team HAS been
  picked and saved against production — but the image is the actual deliverable
  and no query can tell you whether one arrived. Moved here from
  `claude/plans/2026-08-14-match-lineups.md`, whose status header had claimed the
  whole feature was unmerged for two pull requests after it went live.
- **The RCM match sheet, the register and the noticeboard have no rows at all.**
  All three shipped and all three are empty, so every screen that reads them has
  only ever been seen in its empty state on the live site. ⚠️ **Empty is the
  CORRECT state for a club three days into onboarding — this is a note, not a
  fault.** Run the query in `claude/state-of-play.md` rather than trusting this
  sentence.
- **Nothing is graded and no player has two positions** beyond what Jay entered
  by hand while testing, so neither the tier column nor the position chips have
  been seen on a realistic roster.

## Not built, and deliberately so

- ✅ ~~**Nothing compares a player's grade against a fixture's tier.** Both exist —
  `player_grades.tier` and `events.tier` — and an eligibility warning in the
  lineup picker ("graded C, this is an A-tier fixture") was offered and not
  taken up. Recorded so the next session knows the data is already there and the
  absence is a choice, not an oversight.~~ — **BUILT AND LIVE, 17 Aug 2026**
  (`ae98b8f`). `src/lib/tierEligibility.js`, rendered by `src/screens/Lineup.jsx`,
  spec at `claude/plans/2026-08-17-lineup-eligibility-warning.md`. Jay took it up
  the day after this line recorded that he had not.
  ⚠️ **THIS FILE WAS THE SECOND PLACE THAT STALE CLAIM SURVIVED, AND IT OUTLIVED
  THE FIRST BY A COMMIT.** `2ac2782` corrected
  `claude/plans/2026-08-14-tiers-and-game-time.md` for saying the same feature was
  unbuilt; this line said it too, in different words, and was not looked for.
  **The reason generalises: a "deliberately not built" note is a STATUS claim
  wearing a RULING's clothes.** Everything around it in this file is a finding that
  stays true until someone acts on it, so nothing about the wording suggests it
  needs re-reading the moment the thing ships. **When a decision to not build
  something is reversed, grep for the feature, not for the plan that named it.**
  The section is kept rather than emptied, per this file's rule at the top.

## Unexplained

- **One phantom test failure in `tests/notice-board.test.jsx`** does not fit the
  timeout mechanism fixed on 14 Aug — the file is synchronous and runs in ~160ms. It
  was never reproduced and its message was never recorded. **If a phantom failure
  appears again, capture the MESSAGE, not the file name.**

- 🆕 **THE MESSAGE, CAPTURED — 17 Aug 2026.** A full `npm test` reports
  **unhandled errors** that fail no test and appear in no single-file run:

  ```
  Serialized Error: { code: 'ERR_INVALID_ARG_TYPE' }
  ❯ node_modules/undici/lib/web/fetch/index.js:1119:19
  ❯ processTicksAndRejections node:internal/process/task_queues:104:5
  originated in "tests/dashboard-availability.test.jsx" / "tests/dashboard.test.jsx"
  ```

  ⚠️ **IT IS NOT THE FILE IT NAMES, AND THE COUNT MOVES BETWEEN RUNS** — two
  errors on one run, three on the next, naming a different pair. Vitest says so
  itself: the error is thrown *while* that file is running, not by it.
  ⚠️ **PRE-EXISTING, AND THAT WAS MEASURED RATHER THAN ASSUMED.** The audit that
  found it ran the full suite on its own branch (3 errors) and again with its
  changes stashed (2 errors), so it is not attributable to the flag or
  dead-code work. `tests/dashboard-availability.test.jsx` alone: **2 passed, 0
  errors.**
  ⚠️ **IT IS AN UNHANDLED REJECTION IN `undici`'s FETCH, ESCAPING A TEST THAT
  HAS ALREADY FINISHED** — the shape of a component firing a real request during
  teardown because a mock did not cover a path. **The suite is green and this is
  not a failure; it is an un-awaited promise nobody owns**, and the next person
  to chase it should look for a fetch that outlives its test rather than at
  either file's assertions.

## A Dependabot PR cannot satisfy `docs:check` on its own

**1 Sep 2026, third occurrence.** `docs:check` demands main's current tip SHA be
cited in `claude/changelog.md`. A Dependabot PR only ever touches `package.json`
and the lockfile, so it can never cite anything — and `@dependabot rebase` simply
moves it onto a NEWER uncited tip. #567, #568 and #616 were all red for exactly
this, and no amount of rebasing would have cleared any of them.

**The fix:** push the changelog citation ONTO the Dependabot branch
(`git push origin <local>:<dependabot/…>` — same repo, not a fork), then merge.
Do the citation and the merge back to back, because every merge creates the next
uncited tip.

⚠️ **Not proposed as a rule change.** The one-behind rule is load-bearing and has
caught real omissions; this is a known cost of it, written down so the next
session does not spend an hour rediscovering it.
