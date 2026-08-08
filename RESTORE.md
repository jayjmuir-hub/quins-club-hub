# Quins Club Hub — what is TRUE about this codebase

**This file is the DURABLE half.** How the code actually behaves, the rulings that
cost real effort to discover. It should not need editing because a status changed.

⚠️ **STATUS DOES NOT LIVE HERE.** Where things stand today — what is shipped, what is
blocked, test counts, which domain is live, which clone is behind — is
`claude/state-of-play.md`. This file previously carried all of that and went badly
stale: on 7 Aug 2026 it was still announcing a domain move that had completed two days
earlier, a test count four revisions old, and **"DO NOT INVITE THE COMMITTEE"** over an
email blocker that no longer existed. Because `CLAUDE.md` ranks this file ABOVE
`state-of-play.md`, the most authoritative document was the most wrong one.

**If you are about to write a date, a count, a deploy id or a "currently" into this
file — it belongs in `state-of-play.md` instead.**

Reading order and precedence are in `CLAUDE.md`. Single source of truth for the code is
https://github.com/jayjmuir-hub/quins-club-hub (public). Branch `main` is the live
work and the production branch. ⚠️ **Until 8 Aug 2026 that was `build/v1-mvp`,
and `main` held only early scaffold history** — an old clone or an old document may
still say so.

**Two things that used to live here now have their own files, because neither is
"how the code behaves":**

- `claude/schema-history.md` — the REASONING behind each migration. Reference, read
  it before changing a policy. Not in the reading order.
- `claude/runbooks/session-and-push.md` — how to start a session and how a change
  gets pushed. Procedure, not truth.

---

## Two rulings worth reading before touching auth or roles

1. **"View as" is a cosmetic preview, not a security boundary.** RLS scopes on the real
   `auth.uid()`, so an admin previewing as a coach still *receives* club-wide rows — the
   browser just declines to render them. Never cite this feature as evidence to the
   committee that coaches cannot see other squads' data (that claim is true, but RLS is
   the evidence, not this). Real impersonation needs a server-side scoped token; noted
   for the AWS migration.
2. **The switcher and its banner gate on `realMemberships`, never on effective
   `memberships`.** Previewing as a parent makes `isAdmin(memberships)` false. If the
   exit control were gated on the effective set, the admin could only escape by clearing
   localStorage. This is the single highest-risk line in that feature.

---

## Toolchain — locked in

The v1 MVP build was reviewed task by task, and every review round was closed by a
scoped re-review. The ledger at
`.superpowers/sdd/quins-v1-mvp/progress.md` records every ruling, fix round and deferred
minor, and it is committed to this repo — a resuming session gets it from the clone.

**Toolchain locked in:** React 18, Vite 5, Tailwind 3 (not 4 — later tasks assume the
config-file API), React Router v6 with `v7_startTransition` and `v7_relativeSplatPath`
future flags, Vitest + React Testing Library. No ESLint or Prettier. `npm test` runs unit
tests only and never touches the network; `npm run test:integration` runs the
`*.integration.test.js` files against the live Supabase project.

---

## How this codebase actually behaves

Things that are true, non-obvious, and have already cost someone an hour. Every entry is
something a session discovered by hitting it.

### UI components with a trap in them

**The roster is TWO components.** Cards on mobile (`data-testid="player-row"`), a table on
desktop (`data-testid="roster-table-row"`). BOTH are in the DOM at every width with one
CSS-hidden — so a selector matching both picks the hidden one and the click silently does
nothing. On desktop the row click edits position/age group/captain IN PLACE; the detail
sheet opens from a separate **"Open"** button in the last column.

**`PhoneInput` takes `country` + `national` + `onCountryChange` + `onNationalChange`** —
not `value`/`onChange`. Phones are stored E.164 and split for editing with
`splitPhone`/`joinPhone` (`src/lib/phone.js`). Formatting is deliberately NOT applied
as-you-type; that reintroduced a caret-jump bug.

**Netlify serves `dist/` from a Vite build — the repo root is NOT served.** (Unlike the
adhjrt tournament repo, where the root IS the deployed site. Rules copied from there about
scratch files in the repo root do not apply here for that reason. The `git add -A` rule
still does, for the `.env` reason.)


### Tests, jsdom and the `harness/`

**The test suite needs `.env`, which is gitignored.** A fresh clone fails with "Missing
required Supabase env var(s)" until you create it — values in
`claude/runbooks/session-and-push.md`.
Delete it before committing.

**jsdom applies no Tailwind.** Any test asserting "this is visible" proves nothing about
real rendering. Assert class tokens, and verify anything visual in Chromium via `harness/`.

**jsdom has no `URL.createObjectURL`.** Touching a file input without the stub in
`src/test/setup.js` throws inside an effect and React unmounts the ENTIRE tree — an empty
`<body>` and an error mentioning nothing about object URLs.

**`harness/` stubs must mirror the real modules, and `tests/harness-stubs.test.js` enforces
it.** Add an alias in `harness/vite.config.js` without a matching stub — or add an export to
a real data module without adding it to the stub — and every harness scenario goes dark at
once, because `harness/main.jsx` imports every screen into one bundle.

**The harness needs a stub for anything AppShell imports TRANSITIVELY.** `AppShell` →
`RequestAccess` → `data/accessRequests.js` → the real Supabase client, which throws on
missing env vars before a single pixel renders.

**The pinned Playwright expects a Chromium build a cloud sandbox may not have.** Launch with
an explicit `executablePath` rather than downloading a second copy — see
`harness/shoot-playerdetail.mjs`.


### Postgres, RLS and the schema

**`composite IS NOT NULL` is only true when EVERY field is non-null.** A perfectly good
`players` row reads as null because `jersey_num` is empty. This made a working RPC look
broken. Test a FIELD, not the row.

**A temp table created before `set local role` is unreadable afterwards.** In an RLS
verification script, `create temp table` as one role then `set local role anon` gives
"permission denied" until you `grant select` explicitly.

**`private.can_see_team` has a hand-copied twin.** `public.calendar_events_for_token`
restates the same visibility rule against a token-resolved profile, because a calendar
client has no JWT and `auth.uid()` is unavailable. **CHANGE ONE, CHANGE BOTH.**

**RLS grants access to ROWS, not COLUMNS.** This is why `players.photo_path` is written by
`set_own_player_photo()` and not by an owner policy: a row-level owner policy on `players`
would hand a parent `team_id` as well. Don't "simplify" it back into a policy.


### Auth and onboarding

**⚠️ `accept_invite` matches on EMAIL, and that is an onboarding trap.** Invite someone
at `jane@work.com`, they sign in with Google as `jane@gmail.com`, and the invite does not
match their account — they land in the access-request queue instead. Nothing is broken
when that happens, but it looks like a failure to the person it happens to.

---

## Rulings that cost real effort to discover — don't rediscover them

### Scope and RLS

**RLS is stricter than the plan assumed.** Every SELECT policy — `teams`, `clubs`,
`events`, `players`, `availability` — requires a `memberships` row matching `auth.uid()`.
A signed-in user with zero memberships reads **zero rows from every table, including
`teams`** — no error, just empty. Correct for an invite-only club app; the database was not
changed. The app renders an explicit "you're signed in but not linked to a squad yet" state
instead of a blank screen.

**Admin memberships have `team_id = NULL`** — admin is club-wide. The `teams` read policy
matches on `club_id`, so an admin still sees all 15 teams. `visibleTeams` special-cases
admin rather than collecting `team_id` values.

**`canEditTeam(memberships, null)` returns `false`, even for an admin.** Deliberate, and a
knowing departure from the plan's literal wording. A null team id means "we don't know which
team", and the safe answer to "may I edit an unknown team?" is no. `events.team_id` and
`players.team_id` are both NOT NULL, so only a bug or a partial load reaches that path.
There is a comment in `scope.js` saying so — don't "fix" it back.

**`listEvents({teamIds: []})` returns `[]` without querying.** An empty array means "no
teams, show nothing", not "no filter, show everything". One keystroke apart, opposite in
consequence: a user with no squads would otherwise see the whole club.


### Domain rules the club actually uses

**A fixture is a "result" when a score is present, not when its date has passed.** The
prototype used this rule. A match played last week with no score entered is still Upcoming.

**The club does not use jersey numbers.** `players.jersey_num` stays in the schema (nullable,
harmless, available if a senior side ever wants it) but nothing in the UI reads it. Roster rows
and the PlayerDetail hero show initials instead, via `src/lib/playerFormat.js`. Never add a
jersey field to the event/player forms.

**"Upcoming" and "not yet scored" are two different questions that happen to look similar.**
Schedule's Upcoming *tab* deliberately shows unscored events regardless of date — a match still
needing a score stays visible until someone scores it. That's correct and must not change.
Dashboard's "what's coming up" list and its stat tile want something different: chronologically
future events (`starts_at > now`), because trainings and socials can never have a score and
would otherwise sit in "Upcoming" forever. Don't collapse these two back into one filter — they
were split apart on purpose in Task 13.


### Time — everything is Abu Dhabi time

**All event times are forced to Abu Dhabi time (`Asia/Dubai`), always** — a deliberate,
twice-reviewed decision, not a leftover default. One club, one ground: "20:00" must always mean
20:00 at Zayed Sports City, regardless of the viewer's browser timezone. Route every date/time
formatter through `src/lib/eventFormat.js`'s Dubai-anchored functions — never `toLocale*` with
an implicit zone, never a hardcoded `+04:00` offset (use the IANA zone via `Intl`'s `timeZone`
option; offsets are a derived fact and the wrong abstraction). Calendar day-bucketing and any
"today" highlight must also be computed in club-local days, not the browser's. **Any test
touching this must prove zone-independence, not assume it** — pin a fixed instant and
demonstrate the same output under a hostile `TZ` (e.g. `America/New_York`); a test that only
passes because the runner sits in UTC is not evidence. This exact failure mode has shipped
twice already, hiding in tests that *looked* zone-safe.

**Task 14's event form must interpret an entered date and time as Abu Dhabi time** when it
builds the `starts_at` value. A naive `new Date(\`${d}T${t}\`)` resolves in the browser's zone,
so a coach entering 20:00 from outside the UAE would write a 23:00 (or worse) Abu Dhabi
kick-off. This is the mirror image of the read-side timezone fix and is easy to miss.


### Data access conventions

**`getPlayerContact` uses `.maybeSingle()`, not `.single()`.** Zero rows is the normal
outcome for a parent — RLS hides contacts from them. `.single()` throws on zero rows, which
would turn a safeguarding feature into a crash.

**`auth.users` already has an `on_auth_user_created` trigger** calling `handle_new_user()`,
which creates the `profiles` row. No app-side profile creation needed.

**Writing a player's contact details is two separate calls, never one.** `upsertPlayer` then
`upsertContact` — so a partial failure (player saved, contact rejected) is surfaced distinctly
rather than silently rolled into one ambiguous error.

**Conventions set by earlier tasks:** data-access functions **throw** on error, never return
`{data, error}` tuples, and return `[]` not `null`. `src/lib/scope.js` holds only pure
functions with zero imports. Screens catch and render errors in a `role="alert"` region.
Data modules never import React.


### Safeguarding — contact details

**Never render a loading state for `getPlayerContact`.** Render nothing until a row arrives.
A spinner there put an aria-live "Loading contact details…" announcement in front of a parent
who is not permitted to see them.

**A component that states a safeguarding invariant must enforce it itself.** Task 15's
`PlayerForm` claimed "a null contact row here can only mean nothing recorded yet, never
withheld" — true only because *something else* (`Roster.jsx`) gated who could open the form
for which player. The form's own gate was coarser ("has any editable squad"). Fixed by
folding the per-player check directly into the component that makes the claim:
`Boolean(player) && !canEditTeam(memberships, player.team_id)`. Nothing leaked — RLS and
Roster's gating were both already correct — but don't split "asserts" from "enforces" across
files again.

**Contact disclosure copy must match the real RLS predicate, not the intuitive one.** The
read policy is `can_edit_team(...) OR is_own_player(player_id)` — the linked player can read
their own contact row, not just coaches/admins. Copy shown to whoever is entering a minor's
guardian details must name both.


### UI state, forms and design

**A selected team pill must be reconciled against live scope.** Both Schedule and Roster
derive `activeFilter = teamIds.includes(teamFilter) ? teamFilter : ALL_TEAMS_ID`. Without it,
a membership reload that drops the selected team leaves the list filtered to nothing — and
below two teams both screens hide the pill row entirely, so there is no "All" pill to click
as a manual recovery.

**Pill counts come from the search-only set, never the team-filtered set.** Otherwise every
unselected pill reads "· 0" the moment any pill is clicked.

**Distinguish first load from refresh.** `setLoading(true)` on every refetch flashes a
spinner over already-rendered content — Schedule uses a derived `isFirstLoad`, EventDetail a
`settledForEvent` ref (an empty availability list is a legitimate steady state there).

**A `<button>` used as a layout box inherits Chromium's UA content-centring**, which no jsdom
test can see. Task 11's calendar shipped with populated day cells floating 66px below their
empty neighbours at desktop width. Set layout explicitly on any interactive non-text element.

**Contrast:** `quinsGreen #7DC351` on white is ~1.9:1 and fails AA for text — gradient stop
or block fill only. Error text uses `quinsRedDark #8E1526` (~7.9:1). The neutral chip's text
was darkened to `#5c5854` (6.04:1) because the design system's `--muted` on the chip
background was 4.07:1, under the threshold. `--muted #77726e` also fails on the **paper**
background `#f5f4f3` (4.33:1) while passing on white inside a card (4.75:1) — on-paper text
uses `#5c5854` (6.42:1).

**Delete confirmation is a two-step inline control, never a native `confirm()`.** A native
dialog blocks the event loop and hangs Playwright's browser check dead — established in
Task 14, reused in Task 15's player delete.

**Squad reassignment on edit must fall back to the entity's own team, not the first editable
one.** `editableTeams[0]` as a fallback silently reassigns whoever is being edited to a coach's
first squad the moment the form opens. Reconcile against the entity's actual `team_id` instead.
Fixed in `PlayerForm.jsx`; `EventForm.jsx` has the identical shape and has NOT been fixed —
it's a separate file and a separate decision, deliberately left alone in Task 15's fix round.


### Routing, React and the PWA build

**A screen that must be reachable before a user has any memberships cannot live inside
`AppShell`.** `AppShell` deliberately refuses to render its routed content at all until
`memberships.length > 0` (showing `NoMembershipState` instead) — correct for every normal
screen, but it means any future screen aimed at a membership-less user (Task 18's
`/accept-invite/:token` is the first, and likely not the last — an invite-decline flow, an
"invalid invite" landing page, etc. would have the same shape) must be routed as a sibling
OUTSIDE `AppShell`, per-route now that `src/App.jsx` wraps each route in its own `<AppShell>`
individually rather than one shared instance around a shared `<Routes>`. Don't nest a new
"pre-membership" screen inside an `AppShell`-wrapped route and expect it to be reachable.

**React 18 StrictMode's dev-only double-invoke can permanently break a non-idempotent effect
if a `mounted`-ref guard and a `calledRef`-style once-only guard fight each other.** Task 18's
`AcceptInvite` hung forever in `npm run dev` (never in a production build) because the
StrictMode mount→cleanup→remount cycle set `mounted = false` in the throwaway first mount's
cleanup, and the guarded second mount declined to start a new call — so the real in-flight
promise's result got silently discarded by the `if (!mounted) return` check with nothing left
to ever flip `mounted` back. The fix was to drop the `mounted` flag and rely solely on the
once-only guard, since the underlying call (`accept_invite`) is deliberately not safely
re-callable anyway. Any future one-shot side-effecting screen (payment confirmation, a
one-time RPC) should be built with this in mind, and tested by literally rendering under a
real `<React.StrictMode>` wrapper in RTL — jsdom/RTL doesn't do this by default, so a normal
test render won't catch it.

**⚠️ A Workbox `urlPattern` function cannot see build-time module scope.** Workbox
stringifies and re-executes those functions inside `dist/sw.js`, which does not share
`vite.config.js`'s scope — an outer-scope `const` (e.g. `SUPABASE_HOST`) is `undefined`
at runtime. Only visible by reading the real generated `dist/sw.js`, never the plugin
config object. **This is why `tests/pwa-build.test.js` shells out to a real `vite build`
rather than asserting on config.** Fixed by inlining the hostname as a string literal.

---

## Two bugs worth knowing about, because the tests didn't catch them

**jsdom does not apply Tailwind's CSS** — also listed above, repeated here for the story. Any test asserting "this is visible" proves nothing
about real rendering. This hid a role label that was CSS-hidden on every phone while
`getByText('Coach')` passed happily. The fix was to assert on class tokens directly, and to
render the real components in Chromium via `harness/` as a controller-side check. That
browser pass also caught the club crest being squashed flat by `object-fit: fill` in a
square badge.

**The bottom-sheet modal ate keystrokes.** `Sheet` had `onClose` in a `useEffect` dependency
array; every parent re-render gave it a new identity, re-running the effect, whose cleanup
stole focus back to the trigger. Typing "Tom" into a field inside a sheet produced "T".
Every add/edit form in Tasks 14-16 opens in a `Sheet`, so this would have broken all of
them. Fixed with the latest-ref pattern and pinned by a regression test verified to fail
against the pre-fix code.

Both are the same lesson: for anything visual or focus-related, verify in a browser, not
just in jsdom.

---

## Changing the schema safely — `db/schema/`

Everything above describes the schema in prose. **Prose does not diff.** That is precisely
how an older migration named `accept_invite_multi_target` got re-applied on 2026-08-03 and
silently reverted the incomplete-invite guard inside `public.accept_invite` — repeatedly,
undetected, because there was no file in the repo to compare the live function against.

`db/schema/` fixes that. It holds a **capture of the live database** — four SQL files
(`tables.sql`, `policies.sql`, `functions.sql`, `triggers.sql`) generated from read-only
catalogue queries (`information_schema.columns`, `pg_constraint`, `pg_policies`,
`pg_proc` + `pg_get_functiondef` + `proacl`, `pg_trigger`, `pg_class.relrowsecurity`).

Read `db/schema/README.md` first. The essentials:

- **It is a capture, not a migration runner. Do not run those files.** Supabase migrations
  remain the one and only mechanism for changing the schema.
- The workflow after any schema change is: apply the migration → re-capture into
  `db/schema/` → commit both together. If the re-capture shows changes you did not intend,
  something drifted or was reverted. That is the whole point.
- The files carry the notes that matter alongside the SQL: the deliberately-absent unique
  constraints on `memberships` and `invite_targets`, and a prominent header on
  `public.accept_invite` listing its five guards (signed in / token exists with
  `FOR UPDATE` / not already accepted / caller email matches / incomplete-invite check)
  that must never be weakened.
- `supabase_migrations.schema_migrations` is polluted and must not be trusted as a record
  of intent: **12 rows named `accept_invite_multi_target` are all stale** and each one
  reverts the function if re-run. The authoritative definition is the highest version
  number, `20260803150349 zzz_accept_invite_authoritative_do_not_overwrite` — the `zzz_`
  prefix is there so "the last one by name" is also the right one.

**`.superpowers/sdd/.gitignore` gets reset to `*` by tooling, repeatedly.** It silently
untracks the whole ledger. Do not fight it — stage the workspace with
`git add -f .superpowers/sdd/quins-v1-mvp/` every time.

---

## Infrastructure facts

- **Netlify:** project `quins-club-hub`, connected to GitHub, branch `main`,
  auto-deploys on push. ⚠️ **The branch is a Netlify UI setting, not `netlify.toml`**
  — it cannot be discovered from a clone. `CLAUDE.md` rule 3 is its home.
- ⚠️ **`adhjrt.com`'s bare root is a DIFFERENT, unrelated Netlify project**
  (`serene-gingersnap-1d0eb6`) — a tournament/registration app built from the separate
  repo `jayjmuir-hub/adhjrt`. **Never reuse, overwrite or reconfigure it.** This app owns
  the `app.` subdomain only.
- **Supabase Auth URL Configuration** must list every origin the app is served from.
  Redirect URLs have historically included `https://quins-club-hub.netlify.app/**` as a
  fallback. ⚠️ A magic link opened on an origin that is not listed fails at the redirect,
  not at the send — check this before blaming the mail provider.

- **Supabase:** project `quins-club-hub`, ref `lusmshimxdcxpnrktlgz`, region
  `ap-northeast-1`, Postgres 17, status `ACTIVE_HEALTHY`. A second project `adhjrt-app`
  (`nnlfjbnoiyqcvxwbwsjf`) exists and is **not** used by this app.
- **This repo is public.** Nothing secret is committed: `.env` is ignored, no `sb_secret_`
  or `service_role` string appears in any tracked file. Security rests on Supabase RLS, not
  on the code being hidden. Keep it that way.
