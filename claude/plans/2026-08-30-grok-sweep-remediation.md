# Remediation plan — Grok full-sweep (30 Aug 2026)

**Status: IN PROGRESS — Jay's blanket "go" given 30 Aug 2026** ("you will pick
up the security and bug review fix"), with two rulings: report handling SPLITS
BY CONTEXT (conversation reports → welfare, channel reports → any admin), and
PR 1 ships now (Jay already holds `welfare`). `main` is production
(https://adhquins-clubhub.com); every PR is a live release.

- **PR 1 — SHIPPED 30 Aug 2026** (`20260830_welfare_review_gate.sql`, applied
  to prod, harness red-then-green, schema recaptured in-PR).
- **PR 2 — SHIPPED 30 Aug 2026** (`20260830_last_admin_guard.sql`, applied to
  prod, harness red-then-green with dropped-trigger self-test).
- **PR 4 — SHIPPED 30 Aug 2026** (items 5 & 9: write-safety guards + view-as
  welfare audit; D5 default taken — unread badges left as-is).
- **PR 5 — SHIPPED 30 Aug 2026** (item 4: staff edit-gates active-only; D6
  default taken — pending squads stay visible, now documented).
- **PR 6 — SHIPPED 30 Aug 2026** (item 7 core: child-PII allowlist mirrors
  wired into PlayerForm/Roster, Welfare portal explicit-only for supers,
  doctrine comments rewritten; read-surface polish left on refuse-by-empty).

⚠️ **RE-VALIDATED 30 Aug 2026 after ~20 PRs merged** (see the same-day note in
`claude/open-items.md`). All 18 items still stand; two fixes changed and the
`file:line` refs below have drifted (scope.js/messages.js grew — trust the
symbol name). **(a) PR 3 (item 3) is now Pitch-Glance-only** — the pitch rework
fixed the Allocation path (`listEvents` filters `tournament_id`); the
`pitch_occupancy` RPC still leaks, so Pitch Glance still shows false clashes.
**(b) PR 1's item-2 fix is no longer a flat `is_admin → can_review_dm` swap** —
role channels made general report-handling an admin duty, and `message_reports`
gates every report type through one table; a flat swap would over-restrict
squad-chat moderation to welfare holders. See the amended PR 1 and PR 3 below.

This plans the fixes for the items Claude **confirmed** from the 29 Aug Grok
sweep (verified against the code and, for the RLS items, against the live
database). Item severities and the confirmed evidence live in the review
itself; this file is the *how*, ordered so no fix breaks another.

---

## 0 · Guardrails that apply to EVERY PR here

1. **Reading order first, every session.** `git fetch origin` then
   `git rev-list --left-right --count origin/main...HEAD` must be `0 0` before
   editing. The code wins over this plan — re-read the live file before changing
   it (several line numbers below will have drifted).
2. **One coherent change per PR. SQL, frontend, edge, PWA are separate PRs.**
3. **Every SQL change ships with a `db/tests/` harness** (`npm run db:check`,
   `claude/runbooks/db-harnesses.md`), and the harness is **proven by injected
   fault** — run it against the *pre-fix* function/policy and watch it go red,
   then apply the fix and watch it go green. A harness that has never failed is
   not a harness (CLAUDE.md rule 6).
4. **Every RLS fix needs a POSITIVE control, not just a negative one.** The bug
   is "too many people can do X"; the fix must not become "nobody can do X". So
   each harness asserts BOTH: the narrowed persona gets 0 / is refused, AND the
   legitimately-entitled persona still succeeds.
5. **Client tests that `vi.mock('src/data/messages.js')` are theatre for RLS.**
   Data-layer tests that exercise the real `supabase` builder's 0-row handling
   (like the existing `tests/messages-data.test.js` `removeMessage` cases) are
   real and are what several items below need. Do not add mocked-button tests
   and call a security fix covered.
6. **Recapture `db/schema/` in the SAME PR that changes a policy or function**
   (item 14). The capture is the tripwire for silent reverts; leaving it stale
   is how the next review can't see the truth.
7. **Deploy ordering.** These fixes almost all *tighten* the server or *tighten*
   the client to match an already-tight server, so FE-before-SQL is safe here
   (the reverse of a `DROP COLUMN`). The one exception is called out in PR 1.
8. **Full suite before every push** (`npm test`), plus `npm run db:check` for
   SQL PRs and `npm run docs:check` for any `claude/` edit. Verify live after
   deploy (bundle grep / a live RLS probe), not just a green suite.
9. **Never a real person's name** in a migration, harness, comment, or fixture
   (CLAUDE.md rule 9). Invent data, keep the shape.

---

## 1 · Decisions Jay must make (these gate specific PRs)

Do not guess these — they change what ships.

- **D1 — Welfare right holder (blocks PR 1 from being *usable*).** PR 1 makes the
  welfare overview + reports require `can_review_dm`, which requires the
  `welfare` admin right, which **nobody holds today** and which has **no
  super-admin short-circuit** (deliberate, 28 Aug). So the moment PR 1 ships,
  the Welfare dashboard and Reports go empty **for everyone, including you**,
  until you grant `welfare` to a safeguarding person in the app. That is the
  intended Phase-4 posture — but PR 1 should ship *with* that grant, not before
  it, or minor-DM review is briefly a lockout. This is an ops action for Jay,
  not code.
- **D2 — Item 13 scope (blocks item 13 entirely).** Are match sheets, lineups,
  attendance, grades/positions/units, squad chat + chat-media, and availability
  override accepted Shape-α leftovers on `can_edit_team`/`can_see_team`, or the
  next allowlist wave? The matrix says narrow; the code hasn't. **No S4–S8 work
  is in this plan until you answer.** See §4.
- **D3 — PWA cache (PR 7).** Confirm the set to stop caching:
  `messages`, `player_private`, `player_contacts`, `player_parents`,
  `poll_votes`. Default in the plan is all five.
- **D4 — ICS notes (PR 7, optional).** Strip coach-typed `notes` from the public
  calendar feed's `DESCRIPTION`, or leave them (a subscribed URL is a credential
  that leaves the app)? Policy call; default is leave-as-is and only fix the UID
  alias + the missing build test.
- **D5 — View-as unread badge (PR 4, optional).** Filter unread counts under
  view-as preview, or leave them (documented non-boundary)? Default: leave;
  fix only the welfare-audit skip, which is a real bug.
- **D6 — `visibleTeams` pending squads (PR 5).** Hide pending squads from the
  team list, or keep showing them (documented)? Default: keep + document, and
  fix only the *edit-control* gate.

---

## 2 · PR sequence (dependency-ordered)

Ordered so criticals land first and no PR depends on a later one. Each is
independently shippable.

### PR 1 — SQL: close the welfare directory (items 1, 2) — CRITICAL

**Change**
- Re-create `public.welfare_overview()` (currently
  `db/migrations/20260824_group_chats.sql:532-599`): swap the gate
  `ok as (select private.is_admin(club.id) …)` → `private.can_review_dm(club.id)`.
  Body otherwise unchanged.
- Alter the two `message_reports` policies (currently
  `db/migrations/20260823_squad_chat_phase3.sql:600-603`):
  - `"report read"`: `reporter_id = auth.uid() OR private.can_review_dm(club_id)`
    (keep the reporter arm so a reporter still sees their own report).
  - `"report resolve"` (USING + WITH CHECK): `private.can_review_dm(club_id)`.
  ⚠️ **RE-VALIDATION 30 Aug: this is the point that needs a decision, not a
  swap.** `message_reports` is one table gating EVERY report — minor-DM,
  squad-chat moderation, and (since role channels) role-channel reports. A flat
  `→ can_review_dm` narrows *all* report handling to welfare holders, which
  over-restricts ordinary squad-chat moderation that any admin is meant to do
  (role_channels.sql's comment: "report handling is an admin duty"). Two ways
  out, Jay's call: (i) report handling IS a welfare function wholesale → the
  flat swap is correct; or (ii) split — a report on a minor DM (or a
  reviewable/minor conversation) requires `can_review_dm`, other reports stay
  `is_admin`. Option (ii) keys the read/resolve on the reported message's
  context (its conversation/channel), which is more predicate but preserves
  moderation. Settle this before writing the migration. Whichever wins, also
  reconcile the role-channel reported-message DELETE
  (`role_channels.sql:196-208`, currently `is_admin`) so "can delete" and "can
  see/resolve the report" don't diverge.
- New migration file `db/migrations/20260830_welfare_review_gate.sql`. It must
  `drop policy … ; create policy …` for the two report policies and
  `create or replace function` for the overview.

**Tests / harness**
- Extend `db/tests/dm-review-welfare.sql` (it currently never calls either):
  - `welfare_overview()` returns **0 rows** for a `['pitches']`-demoted admin;
    returns rows for a `welfare`-holding admin. (Positive + negative.)
  - `message_reports` SELECT returns 0 for the pitches admin (except their own
    reports), > 0 for the welfare holder; UPDATE `resolved_at` is refused for
    the pitches admin, allowed for the welfare holder.
- Injected fault: run the extended harness against the current (is_admin)
  definitions first — it must fail — then apply and re-run.

**Won't break**
- `can_review_dm` is the *same* predicate already gating `"welfare log read"`
  and `admin_may_review`, so the three welfare surfaces become consistent
  rather than divergent.
- Client is untouched (`src/data/messages.js` welfare reads are pure
  RLS/RPC-narrowing). The Welfare screens are already portal-gated on the
  `welfare` right in `src/lib/portals.js:119-124`.
- ⚠️ **Behavioural change, by design (D1):** with no welfare holder, the
  screens go empty for everyone. Ship alongside Jay granting `welfare`. A super
  who has NOT ticked welfare will also see empty screens — that UI mismatch is
  cleaned up in PR 6 (item 7); PR 1 and PR 6 should land close together.

**Deploy / rollback**
- Migration to prod. Rollback = re-create the prior bodies (keep them in the
  migration's header comment). No data migration.
- Recapture `db/schema/functions.sql` (welfare_overview) and
  `db/schema/policies.sql` (message_reports) in this PR (item 14, partial).

---

### PR 2 — SQL: last-admin lockout guard (item 8)

**Change**
- `updateMembershipRole` / `deleteMembership` are **direct table writes**
  (`src/data/members.js:945-950`, `:1138-1149`) under `memb manage` (is_admin),
  so there is no RPC chokepoint — the guard must be a **trigger**.
- New `db/migrations/20260830_last_admin_guard.sql`: a `BEFORE UPDATE OR DELETE
  ON public.memberships` trigger (SECURITY DEFINER, pinned search_path) that
  raises `P0001` (same wording as `delete_my_account`,
  `db/migrations/20260806_delete_my_account.sql:51-59`) when the row is the
  club's **last active admin** and the operation would remove that status:
  - UPDATE: fires only when `OLD.role='admin' AND OLD.status='active'` AND
    (`NEW.role <> 'admin' OR NEW.status <> 'active'`).
  - DELETE: fires when `OLD.role='admin' AND OLD.status='active'`.
  - Guard passes iff another active admin exists in `OLD.club_id` with
    `id <> OLD.id`.

**Tests / harness**
- New `db/tests/last-admin-guard.sql`: with one active admin → demote raises,
  delete raises; with two → demoting/deleting one succeeds and the other
  survives; a non-admin row update is untouched; changing an admin's *team*
  (no role/status change) is untouched. Injected fault (drop the trigger) →
  the single-admin demote succeeds, proving the harness bites.

**Won't break**
- Only fires on the exact "last active admin ceases to be one" transition, so
  ordinary role edits, approvals, and non-last-admin demotions pass.
- `delete_my_account`'s own guard still raises first for a self-deleting last
  admin; for a non-last admin its cascade deletes the membership and the trigger
  sees other admins → allows. No double-raise conflict.
- ⚠️ Watch backfill/bulk migrations that touch `memberships` — the trigger will
  evaluate them. None are planned here; if a future one needs to bypass, it can
  `set session_replication_role = replica` inside its own transaction. Note this
  in the migration header.

**Deploy / rollback**
- Migration to prod. Rollback = `drop trigger`. Recapture `db/schema/` (the
  trigger + function).
- The existing client guard (`Accounts.jsx` `LAST_ADMIN_REFUSAL`) stays as the
  friendly first line; the trigger is the real one. No client change required.

---

### PR 3 — SQL: tournament games out of `pitch_occupancy` (item 3) + harness repair

⚠️ **RE-VALIDATION 30 Aug: scope is now Pitch Glance ONLY.** The pitch rework
(#533-#547) made the Allocation path clean — it feeds clash detection from
`listEvents` (`src/data/events.js:73`), which filters `tournament_id IS NULL`.
Pitch Glance still reads `listPitchOccupancy` → the `pitch_occupancy` RPC, which
still leaks. So this fix removes the FALSE CLASHES that remain in Pitch Glance;
Allocation no longer disagrees because it was already fixed. `src/lib/
pitchOccupancy.js` is display math only and is not the fix site.

**Change**
- `pitch_occupancy` (currently `db/migrations/20260829_pitch_portion.sql:44-77`,
  WHERE at ~`:68-76`): add `and e.tournament_id is null` to the WHERE, matching
  `listEvents` (`src/data/events.js:73`) and the token feed
  (`20260829_calendar_feed_exclude_tournament_games.sql`).
- New `db/migrations/20260830_pitch_occupancy_exclude_tournament_games.sql`
  (`drop function` first, then re-create — the live signature already carries
  `pitch_portion`, so a plain replace works, but drop-first matches the file it
  came from and avoids a return-type trap).
- **Do NOT** also stop copying the pitch onto games unless Jay asks — that is a
  display change with its own blast radius; the RPC filter is the minimal,
  correct fix.

**Tests / harness**
- **Repair** `db/tests/pitch-occupancy.sql` first — it currently
  `create or replace`s the OLD 8-column return type against the live 9-column
  function, which throws `cannot change return type`. Bring it to the current
  signature.
- Add cases: a tournament container + its games on one pitch produce occupancy
  for the container only (games excluded); portions still sum; a genuine
  same-pitch same-slot double-booking still clashes.
- Client: add a `tournament_id` case to `tests/pitch-clashes.test.js`
  (`occupantKey`/`portionFraction` path in `src/data/pitches.js:133-135` /
  `src/lib/pitchPortion.js:41`) so a game never counts as a full-pitch occupant.

**Won't break**
- Real clashes, the `group_id` fan-out exemption, `Pitch TBD`, and nullable
  `ends_at` are all preserved (only tournament *games* are excluded, matching
  the two calendar reads).
- Pitch Glance (uses the RPC) stops showing false clashes on tournament days;
  Allocation (uses `listEvents`) was already clean, so the two now agree.
- Recapture `db/schema/functions.sql` occupancy signature (item 14, partial).

---

### PR 4 — Frontend/data: chat write-safety + view-as audit (items 5, 9)

**Change**
- Item 5: `deleteConversation` (`src/data/messages.js:197-200`) and
  `resolveReport` (`:660-666`) → `.select('id')` + throw on empty rows, exactly
  mirroring the patched `removeMessage` (`:187-189`). The thrown copy must be
  honest (not "deleted for both of you") — check the caller in
  `src/screens/DirectMessages.jsx:94-101` renders the throw instead of
  navigating on a silent 0-row.
- Item 9: in `src/lib/useDmThread.js`, key `reviewing` (`:261`) and the
  `logWelfareAccess` call (`:182-185`) on the **real** membership set. Use
  `realMemberships` from `useMemberships()` (already exposed,
  `src/lib/memberships.jsx:297-306`) rather than the synthetic `memberships`
  (`:54,56`). Simplest correct rule: compute `admin` from `realMemberships` so a
  real admin previewing as a parent still logs and still sees the banner.

**Tests**
- Real data-layer tests in `tests/messages-data.test.js` for `deleteConversation`
  and `resolveReport` — both directions (success returns; 0 rows throws) — the
  pattern already there for `removeMessage` (`:164-178`).
- A `useDmThread` test: under view-as-parent, opening a DM still fires
  `logWelfareAccess` and sets `reviewing`. (Mockable at the hook boundary — this
  is client wiring, not an RLS claim.)

**Won't break**
- Item 5 is strictly stricter error handling on already-failing writes — a
  legitimate owner delete still returns rows and succeeds.
- Item 9 uses `realMemberships`, which equals `memberships` when NOT in view-as,
  so normal admin review is unchanged; only the preview path gains the log.
- D5 (unread-badge filter) is intentionally **out** of this PR unless Jay says
  otherwise.

---

### PR 5 — Frontend: staff edit-gates require active status (item 4, + item 18 comment)

**Change**
- `src/lib/scope.js` `canEditTeam` (`:452-465`): add `isActiveMembership(m)` to
  the squad-staff arm (mirror `canApproveTeam` / `notices.js` `postableScopes`).
- `src/screens/Roster.jsx` `canEditAnything` (`:306-310`): same active check
  (and note it isn't team-scoped — tighten to active staff).
- `visibleTeams` (`scope.js:441-442`): per D6 — hide pending `team_id`s, or add
  a one-line comment documenting why pending squads still appear.
- Item 18 residual: add a one-line comment on `isOwnPlayer` (`scope.js:516-521`)
  that the missing status check is deliberate (matches SQL `is_own_player`), so
  the next "add status everywhere" pass doesn't "fix" it.

**Tests**
- `tests/scope.test.js`: a fixture with an **active parent row + a pending
  coach/manager request** for the same team asserts `canEditTeam` is false and
  Roster `canEditAnything` is false; an active coach still passes.

**Won't break**
- Pure client tightening; every write already failed at RLS
  (`private.can_edit_team` requires `status='active'`,
  `db/schema/functions.sql:625-636`), so this only removes dead controls. No
  deploy-order dependency.

---

### PR 6 — Frontend: wire child-PII gates to the RLS that already exists (item 7)

The largest FE change, and the UI half of the 28 Aug allowlists. Harmless today
(the `clubadmin` backfill puts every current admin in every allowlist), but it
is what stops a *future* narrowed admin from seeing a broken screen.

**Change**
- Wire the existing, tested-but-unused `canSeeChildContacts` /
  `canEditChildContacts` (`src/lib/scope.js:368,374`) into the screens that read
  or write child PII: `PlayerForm` (`:194-195`, currently `canEditTeam`),
  `PlayerDetail`, `Roster` age/DOB reads, and the Accounts approval gaps.
- Add the missing sibling helpers: `canWriteChild`, `canSeeChildPhotos`,
  `canReviewDm` (client mirrors of `can_edit_child_contacts` /
  `can_see_child_photos` / `can_review_dm`). Keep them faithful to the SQL
  predicates.
- Welfare persona → **read-only** contact/DOB fields, not a writable form that
  fails Save.
- Stop implying super holds `welfare`: in `adminRights` (`scope.js:335`) /
  `hasAdminRight` (`portals.js:191-198`), don't offer the Welfare portal to a
  super who hasn't ticked it — closes the item-7 mismatch that PR 1 makes
  visible (empty Welfare screen for a super).
- Rewrite the stale doctrine comment (`scope.js:211-241`): "rights gate screens
  not data" / "any admin can read a DM" describes pre-28-Aug and is now false.

**Tests**
- `tests/scope.test.js` / `tests/super-admin.test.js`: each new helper returns
  the right answer per persona (clubadmin=yes, pitches=no, welfare=read-only,
  super=only-if-ticked). Screen tests assert the read-only vs editable vs hidden
  states per persona.

**Won't break**
- `clubadmin` is in every allowlist, so every *current* admin keeps full access
  — the UI change is invisible until a narrowed grant is issued, which is the
  point. Verify with a persona fixture that a `clubadmin` admin still edits.
- Deploy order safe: the client is tightening to match RLS that is already live;
  it can never hide data a current admin is entitled to.

---

### PR 7 — PWA cache + calendar feed (items 6, 16)

**Change**
- Item 6 (per D3): in `pwa-cache-rules.js` `isCacheableRestGet` (`:45-69`),
  return `false` for `/rest/v1/messages`, `/rest/v1/player_private`,
  `/rest/v1/player_contacts`, `/rest/v1/player_parents`, `/rest/v1/poll_votes`
  (unscoped), so children's chat/DOB/named votes are never written to the
  on-disk `quins-supabase-rest-get` cache.
- Item 16: fix the ICS `UID` alias in `supabase/functions/calendar/index.ts:326`
  (`quins.adhjrt.com` → `adhquins-clubhub.com`; a UID must be stable for existing
  subscribers, so note this changes UIDs once — acceptable, it's not auth). Per
  D4, optionally strip `notes` from the ICS `DESCRIPTION`.

**Tests**
- Pin the new exclusions in BOTH `tests/pwa-cache-rules.test.js` (unit) AND
  `tests/pwa-build.test.js` (which inspects the real built `sw.js`) — the latter
  is where a Workbox regression would actually show.
- Add the missing assertion that `calendar.ics` appears in the generated
  `sw.js` `navigateFallbackDenylist` (item 16 test gap) to `tests/pwa-build.test.js`.

**Won't break**
- `NetworkFirst` still serves these tables online; only the *offline/cached*
  copy of sensitive rows goes away. The three existing admin-read exclusions are
  untouched. `apiCache.js` owner-purge is unchanged.
- The calendar edge function's token/anti-oracle behaviour is untouched; only
  the UID string (and optionally DESCRIPTION) changes.

---

### PR 8 — Edge functions (items 10, 11, 12, then 15)

Separate PR; `main`-live but no `dist/` deploy — these deploy via the function
pipeline. **Item 12 is the one that needs no secret leak to matter** — do it
first within this PR.

**Change**
- Item 12 (SSRF): in `register_push_subscription`
  (`db/migrations/20260823_push_subscription_takeover.sql:59-67`) require
  `https://` and an allowlist of known push hosts (FCM `fcm.googleapis.com`,
  Apple `web.push.apple.com`, Mozilla `updates.push.services.mozilla.com`), and
  deny private/link-local/metadata ranges — in **SQL** (reject at insert). Add
  the same defence in `supabase/functions/push-send/index.ts:768-782` before the
  `fetch` (belt and braces). Harness for the SQL check.
- Item 10 (open relay): `notify-unfinished-signup/index.ts:117-144` must load
  recipients from the DB by id (mirror `notify-welcome`
  `notify-welcome/index.ts:191-200`), not from the request body, and cap batch
  size. Change the SQL caller (`private.send_signup_nudges`) to pass ids.
- Item 11 (body-trust): `push-send` `squad_push` / `availability_nudge`
  (`:584-616`) — pass event/batch ids and render title/body/path/category in the
  function from DB state, not free-form JSON. Cancellations: store a tombstone
  id + snapshot in SQL.
- Item 15 (hygiene): add `supabase/config.toml` with `[functions.*]
  verify_jwt = false` for the intended set (so an MCP deploy can't silently flip
  it to true and 401 the workers); persist `webhook-id` in `send-email` to close
  the ~5-min replay window; add POST-method checks to the functions missing
  them; add idempotency (dedupe on a request/batch id) to welcome/feedback/invite
  re-mail/push; make the secret compare hash-both-sides so it can't leak
  `len(secret)` via the early length return.

**Tests**
- SQL harness for the endpoint allowlist (item 12): a member inserting
  `http://169.254.169.254/…` or an off-allowlist host is refused; a real FCM
  endpoint is accepted.
- Function-level tests where the harness exists (the repo has Deno-testable
  functions); at minimum assert the DB-load path and the method/idempotency
  guards.

**Won't break**
- Legitimate pushes/mails keep working (real endpoints allowlisted, real ids
  resolve in the DB). `config.toml` matching the current dashboard state is a
  no-op to behaviour, a guard against a future silent flip.
- ⚠️ Coordinate the deploy: another session was recently in the pitch/edge area
  — check `gh pr list` and message any active peer before deploying an edge
  function (parallel-session rule).

---

### PR 9 — Frontend: error-message hygiene (item 17)

**Change**
- `src/components/RequireAuth.jsx:47-52`: allow-list `error_description` from the
  URL hash (map known GoTrue codes to friendly copy; otherwise a generic
  fallback) instead of rendering attacker-controlled text on the club origin.
- Adopt the `src/data/parents.js:208,240` pattern (whitelist `error.code`, then
  show `error.message`) at the parent-facing `setError(err.message)` sites
  flagged in the review (Chat, DirectMessages, Notices, Availability, PersonCard,
  Welfare) — or route them through `friendlyAuthError`-style mapping.

**Tests**
- Unit: an `error_description` hash value renders the mapped/fallback copy, not
  the raw string.

**Won't break**
- Pure presentational hardening; genuine errors still surface, just mapped.

---

### PR 10 — Residual docs/comments + schema-capture sweep (item 14 remainder, item 18)

**Change**
- Finish the `db/schema/` recapture if any PR above left a gap
  (`policies.sql` player-private/photo/welfare-log bodies, `functions.sql`
  signatures). ⚠️ **RE-VALIDATION 30 Aug: the `chat_media_owner` pin is DONE**
  (#552, `20260830_pin_private_helper_search_path.sql`, proven live) — drop that
  sub-task; only the stale `policies.sql` recapture remains.
- Item 18 UX residual: `Schedule.jsx:915` parent-taps-tournament-game →
  `/match-sheet/:id` they can't use. Product/UX, low — fix only if Jay wants
  (route parents to the game's detail view instead).

**Tests**
- `db:check` and `docs:check` green.

---

## 3 · Regression-safety summary (the "don't break anything" contract)

| Risk | Guard in this plan |
|---|---|
| An RLS fix locks out the legitimately-entitled persona | Every harness has a **positive control** (welfare holder / clubadmin / real FCM endpoint succeeds) alongside the negative one (§0.4) |
| Welfare review silently disabled for everyone | D1 — PR 1 ships *with* the `welfare` grant; called out, not assumed |
| Last-admin trigger blocks legitimate edits | Fires only on the exact last-active-admin transition; harness covers non-last, team-only, and non-admin edits (PR 2) |
| Client tightening hides data from a current admin | `clubadmin` is in every allowlist; PR 5/6 verified with a clubadmin positive fixture |
| Schema capture drifts from live (silent revert later) | Recapture in the same PR (§0.6), `db:check` green |
| A harness that never fails | Injected-fault step on every SQL harness (§0.3) |
| Parallel-session collision on edge/SQL | `gh pr list` + message the peer before an edge deploy or migration (PR 8) |
| Mocked-button "coverage" | Real data-layer / db harnesses only for the security items (§0.5) |

**Full-stack verification per PR:** `npm test` (whole suite) → `npm run db:check`
(SQL PRs) → `npm run docs:check` (docs) → deploy → **live probe** (an RLS query
as the narrowed persona for PR 1–3, a bundle grep for FE PRs).

---

## 4 · Held for a ruling — item 13 (S4–S8 matrix)

**Not in this plan until D2 is answered.** `private.is_admin` is still
all-or-nothing, and match sheets, lineups, attendance, grades/positions/units,
squad chat + chat-media, and availability override are gated by
`can_edit_team`/`can_see_team` (= any active admin), not by a narrowed right —
so "names-read-only access to children" is true for DOB/contacts/photos but
false for those team surfaces. Two sub-findings to fold in **if** Jay opens this
wave:

- The allowlist helpers `can_see_child_contacts` / `can_edit_child_contacts`
  (`db/migrations/20260828_child_contacts_allowlist.sql:49-68`) are **club-blind**
  (no `club_id` param). One club today; a second club would let A's admin read
  B's children. Same class as `is_admin_anywhere`. Flag; fix only in a
  multi-club context.
- No **sensitive-read audit** (S10 / Phase 0d): `welfare_access_log`
  (`db/schema/tables.sql:2187-2198`) logs DM opens only, not `player_private` /
  `player_contacts` SELECTs. Build only if Jay asks.

---

## 5 · Suggested landing order

1. **PR 1** (welfare close) + Jay grants `welfare` — the live, most-sensitive hole.
2. **PR 2** (last-admin) and **PR 3** (pitch occupancy) — independent SQL, either order.
3. **PR 4** (chat write-safety + view-as) and **PR 5** (staff active-gate).
4. **PR 6** (child-PII UI) — lands close to PR 1 so a super stops seeing an empty Welfare tab.
5. **PR 7** (PWA + calendar).
6. **PR 8** (edge — item 12 first).
7. **PR 9** (error hygiene), **PR 10** (residuals/recapture).
8. **Item 13** — only after D2.

Each merges to `main` only on Jay's word, and only after its checks pass.

## 6 · Docs to update as each PR ships (not before)

- `claude/changelog.md` — one entry per merge; never cite a branch SHA
  (cite the previous PR's squash SHA per the one-behind rule).
- `claude/open-items.md` — delete a finding when its PR ships; move anything Jay
  defers into it.
- `RESTORE.md` — only where behaviour actually changed (PR 1, 2, 3, 6).
- `db/schema/*` — recaptured in-PR (§0.6).
- This file's status line — flip to shipped-per-PR as they land.
