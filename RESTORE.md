# Quins Club Hub — what is TRUE about this codebase

**This file is the DURABLE half.** How the code actually behaves, the rulings that
cost real effort to discover, and the schema history. It should not need editing
because a status changed.

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
https://github.com/jayjmuir-hub/quins-club-hub (public). Branch `build/v1-mvp` is the
live work; `main` holds only the initial scaffold commit.

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


---

## Start a session (cloud sandbox, no PC needed)

```bash
git clone https://github.com/jayjmuir-hub/quins-club-hub.git
cd quins-club-hub
git checkout build/v1-mvp
npm install
```

The repo is public and read-only-cloneable from anywhere, so a Cowork cloud session
can bootstrap itself with no device bridge, no connector and no file transfer.

Then create `.env` in the repo root. **It is gitignored by design and is the only
thing a clone does not give you:**

```
VITE_SUPABASE_URL=https://lusmshimxdcxpnrktlgz.supabase.co
VITE_SUPABASE_ANON_KEY=<publishable key from Supabase → Settings → API>
```

That key is the `sb_publishable_…` one — public by design, safe in the frontend.
Never put the `sb_secret_…` key in this repo or in a chat.

Verify:

```bash
npm test        # expect 900 passing (as of ae45aac, 4 Aug 2026)
npm run build   # expect clean
```

---

## Pushing changes back

**Full procedure, with the failure modes that have actually bitten:
`claude/writing-to-github-from-claude.md`.** Summary below.

**The cloud sandbox has no GitHub credentials and must not be given any.** Pushes go
through a PC.

On either PC (`jay-pc` or `cafnet`), git is already authenticated — a classic PAT for
`jayjmuir-hub` (scopes `gist, repo, workflow`) lives in Windows Credential Manager, and
`credential.helper=manager` is set in the system config. A session can drive it through
Desktop Commander without ever handling the token:

```bash
cd C:\Users\<you>\GitHub\quins-club-hub
git pull --ff-only origin build/v1-mvp
# ...apply changes...
git add -A && git commit -m "..."
git push origin build/v1-mvp
```

**Do not rely on the Claude GitHub *connector*.** It returned `Bad credentials` across
multiple sessions and is a different credential from the PC's git. The PC route above is
the reliable one.

**Two PCs use this project — `jay-pc` (user `jayjm`) and `cafnet` (user `Jay`).** Always
`git pull` before starting work on either. GitHub is what keeps them in sync; nothing else
does. **Run `hostname` first, every session** — the Desktop Commander bridge flaps and has
silently reconnected to the *other* machine mid-session. The two clone paths differ
(`C:\Users\jayjm\...` vs `C:\Users\Jay\...`), so assuming the wrong one wastes a round trip
at best and edits a stale tree at worst.

**`cafnet` has `NODE_ENV=production` set machine-wide.** This breaks the dev workflow in two
ways that both look like something else entirely:

1. **`npm install` silently omits devDependencies** — npm resolves `omit=dev` from
   `NODE_ENV`. A plain `npm install` there removed 492 packages including vitest itself, and
   the next `npm test` said `'vitest' is not recognized`. Use **`npm install --include=dev`**
   on that machine.
2. **`npm test` used to fail 535 of 900 tests** with `act(...) is not supported in production
   builds of React`, because Vitest only defaults `NODE_ENV` to `test` when it is *unset*, so
   Vite resolved React's production build. Nothing in the output points at `NODE_ENV`.
   `vite.config.js` now forces `NODE_ENV=test` when `VITEST` is set, so this is handled —
   don't remove that guard. `npm run build` deliberately still sees the real `NODE_ENV`.

Verified on cafnet 4 Aug 2026: `npm test` → 900 passed (37 files), `npm run build` clean,
with ambient `NODE_ENV=production` and no manual override.

#### Getting code from a cloud sandbox onto a PC — do NOT relay bytes by hand

This cost most of a session on 4 Aug 2026 and nearly lost the work. **Never pass file
content (especially base64) through the model's output to reconstruct it on the other
side.** Two attempts corrupted silently — 43,296 bytes expected, 42,718 written, ~578
dropped mid-stream with no error anywhere. It was caught only by an MD5 check that was
almost skipped. Google Drive's `create_file` has the same shape and the same risk.

The route that works, when the bridge cannot move a file directly:

1. In the sandbox: `git bundle create <file> <base>..<branch>` — a *thin* bundle, ~48 KB
   for a two-commit feature rather than 1.9 MB for full history.
2. Upload to a temp file host. `litterbox.catbox.moe` (72h expiry) worked from the sandbox;
   `tmpfiles.org` works but expires in ~60 min and needs a fake `.zip` extension; `0x0.st`
   and catbox proper both rejected sandbox uploads.
3. **Download it back into the sandbox and verify it is byte-identical before handing the
   URL to the PC.** This is the step that turns "probably fine" into "verified".
4. On the PC: `curl -L -o`, then `certutil -hashfile <file> MD5` against the reference
   hash, then `git bundle verify`, then `git pull ..\<file> <branch>`, then `git push`.

Windows gotchas seen doing this: a first `curl` with `-s` looked like a silent failure when
the host was just slow — re-run verbosely before concluding anything; and
`interact_with_process` errors if the process already exited, so start a fresh command
rather than trying to read from a dead one.

**Commit and push durable work in the session that produces it.** The sandbox, chat
attachments and temp links all expire. GitHub is the only thing that survives, and no other
session can see work that never reached it.

**Every Cowork/Claude session — not just the two PCs — runs in its own throwaway cloud
sandbox, separate from every other session.** GitHub is the *only* thing connecting any of
them. Anything written but not committed exists only in that one session's sandbox and is
gone the moment the session ends — this already happened once (see the "Prior art note" in
`claude/specs/2026-08-03-club-overview-dashboard-design.md`: a real planning doc,
`desktop-spec.md`, was written in a different session, referenced by several commit messages,
and never committed — now unrecoverable). **The fix: commit and push anything durable —
specs, plans, docs, not just code — before a session ends, regardless of which PC or session
started it.**

---


---

## Toolchain — locked in

rounds, all closed by a scoped re-review. The ledger at
`.superpowers/sdd/quins-v1-mvp/progress.md` records every ruling, fix round and deferred
minor, and it is committed to this repo — a resuming session gets it from the clone.

**Toolchain locked in:** React 18, Vite 5, Tailwind 3 (not 4 — later tasks assume the
config-file API), React Router v6 with `v7_startTransition` and `v7_relativeSplatPath`
future flags, Vitest + React Testing Library. No ESLint or Prettier. `npm test` runs unit
tests only and never touches the network; `npm run test:integration` runs the
`*.integration.test.js` files against the live Supabase project.

---


---

## How this codebase actually behaves

Things that are true, non-obvious, and have already cost someone an hour. Every entry is
something a session discovered by hitting it.

**The roster is TWO components.** Cards on mobile (`data-testid="player-row"`), a table on
desktop (`data-testid="roster-table-row"`). BOTH are in the DOM at every width with one
CSS-hidden — so a selector matching both picks the hidden one and the click silently does
nothing. On desktop the row click edits position/age group/captain IN PLACE; the detail
sheet opens from a separate **"Open"** button in the last column.

**`PhoneInput` takes `country` + `national` + `onCountryChange` + `onNationalChange`** —
not `value`/`onChange`. Phones are stored E.164 and split for editing with
`splitPhone`/`joinPhone` (`src/lib/phone.js`). Formatting is deliberately NOT applied
as-you-type; that reintroduced a caret-jump bug.

**The test suite needs `.env`, which is gitignored.** A fresh clone fails with "Missing
required Supabase env var(s)" until you create it — values in "Start a session" above.
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

**Netlify serves `dist/` from a Vite build — the repo root is NOT served.** (Unlike the
adhjrt tournament repo, where the root IS the deployed site. Rules copied from there about
scratch files in the repo root do not apply here for that reason. The `git add -A` rule
still does, for the `.env` reason.)

---

**⚠️ `accept_invite` matches on EMAIL, and that is an onboarding trap.** Invite someone
at `jane@work.com`, they sign in with Google as `jane@gmail.com`, and the invite does not
match their account — they land in the access-request queue instead. Nothing is broken
when that happens, but it looks like a failure to the person it happens to.

## Rulings that cost real effort to discover — don't rediscover them

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

**A fixture is a "result" when a score is present, not when its date has passed.** The
prototype used this rule. A match played last week with no score entered is still Upcoming.

**A selected team pill must be reconciled against live scope.** Both Schedule and Roster
derive `activeFilter = teamIds.includes(teamFilter) ? teamFilter : ALL_TEAMS_ID`. Without it,
a membership reload that drops the selected team leaves the list filtered to nothing — and
below two teams both screens hide the pill row entirely, so there is no "All" pill to click
as a manual recovery.

**Pill counts come from the search-only set, never the team-filtered set.** Otherwise every
unselected pill reads "· 0" the moment any pill is clicked.

**Never render a loading state for `getPlayerContact`.** Render nothing until a row arrives.
A spinner there put an aria-live "Loading contact details…" announcement in front of a parent
who is not permitted to see them.

**Distinguish first load from refresh.** `setLoading(true)` on every refetch flashes a
spinner over already-rendered content — Schedule uses a derived `isFirstLoad`, EventDetail a
`settledForEvent` ref (an empty availability list is a legitimate steady state there).

**A `<button>` used as a layout box inherits Chromium's UA content-centring**, which no jsdom
test can see. Task 11's calendar shipped with populated day cells floating 66px below their
empty neighbours at desktop width. Set layout explicitly on any interactive non-text element.

**The club does not use jersey numbers.** `players.jersey_num` stays in the schema (nullable,
harmless, available if a senior side ever wants it) but nothing in the UI reads it. Roster rows
and the PlayerDetail hero show initials instead, via `src/lib/playerFormat.js`. Never add a
jersey field to the event/player forms.

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

**"Upcoming" and "not yet scored" are two different questions that happen to look similar.**
Schedule's Upcoming *tab* deliberately shows unscored events regardless of date — a match still
needing a score stays visible until someone scores it. That's correct and must not change.
Dashboard's "what's coming up" list and its stat tile want something different: chronologically
future events (`starts_at > now`), because trainings and socials can never have a score and
would otherwise sit in "Upcoming" forever. Don't collapse these two back into one filter — they
were split apart on purpose in Task 13.

**Task 14's event form must interpret an entered date and time as Abu Dhabi time** when it
builds the `starts_at` value. A naive `new Date(\`${d}T${t}\`)` resolves in the browser's zone,
so a coach entering 20:00 from outside the UAE would write a 23:00 (or worse) Abu Dhabi
kick-off. This is the mirror image of the read-side timezone fix and is easy to miss.

**`getPlayerContact` uses `.maybeSingle()`, not `.single()`.** Zero rows is the normal
outcome for a parent — RLS hides contacts from them. `.single()` throws on zero rows, which
would turn a safeguarding feature into a crash.

**`auth.users` already has an `on_auth_user_created` trigger** calling `handle_new_user()`,
which creates the `profiles` row. No app-side profile creation needed.

**Contrast:** `quinsGreen #7DC351` on white is ~1.9:1 and fails AA for text — gradient stop
or block fill only. Error text uses `quinsRedDark #8E1526` (~7.9:1). The neutral chip's text
was darkened to `#5c5854` (6.04:1) because the design system's `--muted` on the chip
background was 4.07:1, under the threshold. `--muted #77726e` also fails on the **paper**
background `#f5f4f3` (4.33:1) while passing on white inside a card (4.75:1) — on-paper text
uses `#5c5854` (6.42:1).

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

**Writing a player's contact details is two separate calls, never one.** `upsertPlayer` then
`upsertContact` — so a partial failure (player saved, contact rejected) is surfaced distinctly
rather than silently rolled into one ambiguous error.

**Delete confirmation is a two-step inline control, never a native `confirm()`.** A native
dialog blocks the event loop and hangs Playwright's browser check dead — established in
Task 14, reused in Task 15's player delete.

**Squad reassignment on edit must fall back to the entity's own team, not the first editable
one.** `editableTeams[0]` as a fallback silently reassigns whoever is being edited to a coach's
first squad the moment the form opens. Reconcile against the entity's actual `team_id` instead.
Fixed in `PlayerForm.jsx`; `EventForm.jsx` has the identical shape and has NOT been fixed —
it's a separate file and a separate decision, deliberately left alone in Task 15's fix round.

**Conventions set by earlier tasks:** data-access functions **throw** on error, never return
`{data, error}` tuples, and return `[]` not `null`. `src/lib/scope.js` holds only pure
functions with zero imports. Screens catch and render errors in a `role="alert"` region.
Data modules never import React.

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

---

**⚠️ A Workbox `urlPattern` function cannot see build-time module scope.** Workbox
stringifies and re-executes those functions inside `dist/sw.js`, which does not share
`vite.config.js`'s scope — an outer-scope `const` (e.g. `SUPABASE_HOST`) is `undefined`
at runtime. Only visible by reading the real generated `dist/sw.js`, never the plugin
config object. **This is why `tests/pwa-build.test.js` shells out to a real `vite build`
rather than asserting on config.** Fixed by inlining the hostname as a string literal.

## Two bugs worth knowing about, because the tests didn't catch them

**jsdom does not apply Tailwind's CSS.** Any test asserting "this is visible" proves nothing
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


---

## Infrastructure facts

- **Netlify:** project `quins-club-hub`, connected to GitHub, branch `build/v1-mvp`,
  auto-deploys on push.
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

---

# Schema and migration history

**Reference, not instruction.** The migrations themselves are in `db/migrations/` and
the captured schema is in `db/schema/` — those are authoritative. What follows is the
REASONING behind each one, which the SQL does not carry. Read it before changing a
policy; do not trust its status lines.

### Migration `self_service_profile` (4 Aug 2026)

File: `db/migrations/20260804_self_service_profile.sql`. Owner policies on
`player_contacts` and `player_parents`, an `is_own_player` arm on the photo storage write,
and `public.set_own_player_photo()`.

**READ THIS BEFORE "SIMPLIFYING" IT INTO A POLICY.** The obvious implementation is another
PERMISSIVE policy on `public.players` scoped by `is_own_player`. That is a real hole: **RLS
grants access to ROWS, not COLUMNS**, so it would let a parent write every column on their
child's row — `full_name`, `position`, `jersey_num` and, fatally, **`team_id`**. Moving
their own child into another age group would become an RLS-*approved* write, widening
everything `is_own_player`-adjacent with it. Column GRANTs cannot help (they attach to the
ROLE, and coaches and parents are both `authenticated`), and no policy can express
"unchanged except photo_path" — USING sees the old row, WITH CHECK the new one, nothing sees
both. Hence a SECURITY DEFINER function with a hard-coded column list.

That function has **two** guards, and the second is not decoration: you own the player, AND
the key lives in that player's own folder. Without the second, an owner could point
`photo_path` at another player's object and read it back through the signed-URL route.

`MyPlayerForm` is a separate screen, not a restricted mode on `PlayerForm`. The
club-controlled fields do not exist in the component, so there is no path — not disabled,
not hidden — through which they could be written. That is convenience; the database is the
boundary.

**Verified with simulated JWTs as a real parent:** own contact/parents/photo allowed; rename
own child 0 rows; move own child's squad 0 rows; another player's contact 0 rows; parent row
for another player refused; the RPC refused for a non-owned player and for a foreign folder
key.

### Migration `calendar_feed` (4 Aug 2026)

File: `db/migrations/20260804_calendar_feed.sql`, plus `supabase/functions/calendar`
(deployed with **verify_jwt off**).

**A calendar client cannot sign in.** It fetches a URL on a timer with no cookies, no
Authorization header and no way to refresh. **The URL is the credential.** Everything follows:
the token is a random uuid (not the profile id — a feed keyed on anything enumerable is no
protection), one per person, revocable, and the feed returns only what that person can
already see. Reset DELETEs and re-inserts, so the old token dies the instant the new one
exists — no grace period, because that is how a revoked link keeps working.

**The Edge Function holds the ANON key only** and could not read a fixture on its own. All
authorisation is in `public.calendar_events_for_token()`, which is a **line-by-line mirror of
`private.can_see_team`** with the profile resolved from the token instead of `auth.uid()`.
**If `can_see_team` changes, that function must change with it.** The duplication is the price
of a caller with no JWT; reimplementing scoping in TypeScript would put it somewhere nothing
tests.

An unknown token returns **zero rows, not an error** — distinguishing "no such token" from
"token with no fixtures" is an oracle for guessing tokens. So a bad token yields an empty
calendar with a 200, deliberately.

**ICS details that bite:** folding is 75 **octets** not characters (counting characters splits
UTF-8 mid-sequence); backslash/semicolon/comma are structural and must be escaped or a venue
like "Zayed Sports City, Abu Dhabi" truncates silently; CRLF is required or strict clients
reject the whole calendar; UIDs must be stable or every refresh duplicates every event.

The token is minted **lazily**, only when someone opens the sheet — minting on Schedule render
would create a live bearer credential for every member who never wanted one.

### Migration `access_requests` — the signup approval gate (4 Aug 2026)

File: `db/migrations/20260804_access_requests.sql`. Adds `public.access_requests` and
`private.is_admin_anywhere()`.

**READ THIS BEFORE PROPOSING "just close signup".** Signup cannot simply be turned off.
Invites are accepted at `/accept-invite/:token`, which sits behind `RequireAuth` — the
invitee must already have a session to accept one. Flipping Supabase's "allow new users to
sign up" would therefore kill the invite flow for **every new member**, not just for
strangers. Closing signup at the auth layer needs admin-side user creation through a
service-role Edge Function, which is a separate build. The gate is approval, not exclusion.

**What actually protects club data is unchanged**, and it is not this feature: an account
with no membership reads ZERO rows from every table, because every SELECT policy bottoms
out in a memberships row for `auth.uid()`. What was missing was the admin's side. The
"Waiting for access" list is derived by SUBTRACTION (every profile an admin can read, minus
everyone who already has a membership), so every stranger who ever signed in sat in it
permanently, indistinguishable from a real member mid-invite, with no way to clear them.

**Shape.** One row per profile (`profile_id` is UNIQUE), `status` in
`('pending','dismissed')`. There is deliberately **no 'granted' status** — granted access
*is* a memberships row, and the screen already subtracts members out; a second record of the
same fact would only give the two a way to disagree.

**The anti-spam mechanism is an ABSENCE.** The owner gets a SELECT policy and an INSERT
policy and nothing else — no UPDATE, no DELETE. Combined with the UNIQUE key, a dismissed
person cannot flip their own row back to `pending`, cannot delete it and try again, and
cannot insert a second one. Re-opening the door is an admin action. If you ever add an
owner-side UPDATE policy "for convenience", you have removed the gate.

The `status = 'pending'` clause in the insert policy's WITH CHECK is load-bearing for the
same reason: any status value a client can send is a value it can choose.

**Verified server-side with simulated JWTs** (not the MCP service role, whose `auth.uid()`
is null and makes every negative test look green): a dismissed owner's UPDATE and DELETE
both affect 0 rows while they can still read their own row; inserting for another profile
and self-inserting `status='dismissed'` are both refused outright; a second request hits the
unique key; a non-admin sees exactly one row and an admin sees all of them.

**`private.is_admin_anywhere()` is club-blind on purpose** — a requester has no club, so
they cannot put a `club_id` on their own row and the admin policies cannot be club-scoped.
Same single-club assumption as `can_admin_see_pending`; if a second club is ever added,
those two need revisiting together.

**Restore DELETES the row** rather than setting it back to `pending`. A reversed dismissal
did not turn into a request the person made; marking it pending would invent one and then be
indistinguishable from the real thing.

**Both admin-side reads fail OPEN.** A failed `listAccessRequests()` costs the notes and the
dismissals, not the screen — everyone reappears in the waiting list. Noisier is the correct
direction to fail; hiding someone genuinely waiting is not.

### Migration `player_parents` + head-shot photos (applied 3 Aug, shipped 4 Aug 2026)

File: `db/migrations/20260803_player_parents_and_photos.sql`. Adds `public.player_parents`,
`public.players.photo_path`, and a **private** storage bucket `player-photos` (5 MB cap,
`image/jpeg|png|webp` only) with two policies on `storage.objects` driven by two new
helpers, `private.photo_player(text)` and `private.photo_team(text)`.

**RLS shape.** `player_parents` mirrors `player_contacts` byte for byte — read =
`can_edit_team(player's team)` OR `is_own_player`, edit = `can_edit_team` only. Parent
details are the same class of safeguarding-sensitive data, so they get the same boundary
rather than a second one to reason about. A parent sees their own child's parent rows and
nobody else's. **Photo read is deliberately looser** — `can_see_team`, i.e. squad-wide,
matching `players`' own read policy, because the photo sits beside a name that audience can
already see. Jay approved that explicitly. Tightening it is a documented one-line swap; the
exact change is written out in the migration and in `db/schema/policies.sql`.

**The object key format is load-bearing security, not a naming convention.**
`<player_id>/<timestamp>.<ext>` — the storage policies parse the first path segment as the
player id to find the squad. Change the key format and you silently change who can read
photos. The uuid regex guard in `photo_player` matters too: `'not-a-uuid'::uuid` *raises*
rather than returning null, and inside a policy that surfaces an error on every unrelated
storage operation.

**Product rulings Jay locked in — fixed decisions, not defaults:**

- Relationship dropdown is a **fixed** list: Mother, Father, Step-mother, Step-father,
  Aunt, Uncle, Grandmother, Grandfather, Guardian. No free text, no additions. The
  database column is plain `text` on purpose so widening the list stays a UI change.
- "At least one parent" **warns, never blocks**. ~159 existing players have no parent rows;
  a hard rule would make every one of them unsaveable and break the bulk importer.
- Own contact fields (email/phone on the player) only for **U13+** —
  `src/lib/ageGroup.js`, `OWN_CONTACT_MIN_AGE = 13`. Senior sides count as adult. It
  **fails closed** on a missing/unparseable squad name.
- Phones stored **E.164**, default country AE, formatted nationally on display.
  Deliberately *not* formatted as-you-type — that reintroduced a caret-jump bug.
- Photos are client-resized to a 600px square JPEG at q0.82 before upload (~4 MB → ~40 KB).
  Signed URLs are cached for the session and **cleared on `signOut`**.

New runtime deps: `flag-icons@7`, `libphonenumber-js@1`.

**`saveParents` is delete-then-write, not atomic.** A failure between the two leaves the
player with no parent rows. Acceptable today (single-editor, low frequency); if it ever
matters, move it into a Postgres function.

### Migration `admin_can_see_pending_profiles` (3 Aug 2026)

`private.can_admin_see_pending(_profile uuid)` + policy `profile read pending`, so an
admin can see people who signed up but hold **no membership**. Without it they are
invisible: the Accounts screen lists memberships, and `profile read club admin` only
exposes people who already share a club with you.

**Signing up does not grant access, and nothing used to tell you it happened.** Magic-link
signup writes `auth.users` + `profiles` (via trigger) but no membership; only
`accept_invite` writes one. Public signup is open, so anyone with the URL can create a
login. They read zero rows from every table — every SELECT policy requires a membership —
so it is contained, but **close signup or add approval before pointing
abudhabiquins.com at the app**.

Both lookups in the helper are `security definer` on purpose: under the caller's own RLS
an admin only sees memberships in their own club, so a profile belonging solely to another
club would read as "unattached" and leak.

**Verify RLS by simulating a real JWT, not via the MCP service role** — service role has a
null `auth.uid()`, so every `auth.uid()`-based policy returns false and the result *looks*
like a clean negative test while proving nothing:

```sql
begin;
select set_config('request.jwt.claims','{"sub":"<user-uuid>","role":"authenticated"}',true);
set local role authenticated;
select count(*) from public.profiles;   -- or whatever you're checking
rollback;
```

Verified this way: admin sees 3 profiles, a genuine coach sees 1, an unattached signup
sees 1. (The coach case first read 3 — because that account turned out to be a *second
admin*. Check what a test account actually is before trusting a negative result.)

**Two admins currently exist.** `jayjmuir@yahoo.com` holds `admin`/`team_id` null even
though its invite was for `coach` on a team. `accept_invite` is correct (it inserts the
invite's own role verbatim — read in full to confirm), so that row was altered afterwards,
almost certainly by running `claude/runbooks/first-admin.md`'s bootstrap SQL against it. If that
account was meant to be a coach test account, it is not testing what you think.

### Migration `profiles_email_and_admin_access` (3 Aug 2026)

Applied while building the Accounts screen. It also fixed a **live latent bug**: `profiles`
RLS was own-row-only (`profile read own` = `id = auth.uid()`) with **no admin policy**, so
`listClubMembers()`'s `profiles(full_name)` embed returned `null` for every member except
the caller. `Admin.jsx`'s `?? 'Unnamed member'` fallback disguised it completely — the
member list had been showing "Unnamed member" for everybody.

- `profiles.email text` added and backfilled from `auth.users`. Client code can now
  identify members; `auth.users` itself stays unreachable from the browser by design, and
  no service-role key goes near the frontend.
- `private.handle_new_user()` now populates `email` on signup; new
  `private.handle_user_email_change()` + `on_auth_user_email_updated` trigger keeps it in
  sync if a user later changes their login email.
- `private.shares_admin_club(_profile uuid)` — `security definer` specifically so its
  `memberships` lookup is not itself subject to `memberships` RLS (which would recurse).
  Execute granted to `authenticated` only.
- New permissive policies `profile read club admin` (SELECT) and `profile update club
  admin` (UPDATE). They OR with the existing own-row policies.

**`profiles.email` is read-only from the app.** It mirrors `auth.users`; writing it would
desync the address people actually log in with. Password resets stay self-serve — an admin
cannot reset another user's password from the client (that needs the service role).

**`memberships` still has no unique constraint** on `(profile_id, club_id, role)` — only a
PK on a fresh uuid. Duplicate rows for one person are possible (one was created once by an
`ON CONFLICT DO NOTHING`, see above), which is why the Accounts screen groups by
`profile_id` instead of rendering one row per membership.

### Database schema changes (Task 18 — the first migration this build has applied)

`public.invites`: `id`, `club_id`, `email`, `role` (same check as `memberships`: admin/coach/
parent/player), `team_id` (nullable, but `invites_team_required_unless_admin` requires it
NOT NULL unless `role='admin'`), `player_id` (nullable, links to an existing player — most
commonly a parent naming their child), `token uuid default gen_random_uuid()` (never generate
this client-side — read it back from the insert), `created_by`, `created_at`, `accepted_at`.
RLS: `invites manage` (ALL, `is_admin(club_id)`) + `invites read own` (SELECT,
`lower(email) = lower(auth.jwt()->>'email')` — the invitee's own verified login email, never
a client-supplied value). `accept_invite(token uuid)`: `SECURITY DEFINER`, verifies the token
exists, isn't already accepted, and the caller's authenticated email matches (row-locked
`for update` against a concurrent double-accept), inserts the `memberships` row, stamps
`accepted_at`, returns the new membership row. Call it via
`supabase.rpc('accept_invite', { _token: token })` — the parameter name is `_token`, not
`token`.

**Gotcha worth remembering for any future `SECURITY DEFINER` function (Task 21 will likely
add more):** Supabase's default privileges auto-grant `EXECUTE` on every new public-schema
function to both `anon` and `authenticated`, regardless of an explicit
`REVOKE ALL ... FROM PUBLIC` — that only revokes the `PUBLIC` pseudo-role's implicit grant,
not each real role's own default-privilege grant. `get_advisors` (security) surfaces this
immediately after applying a migration. Since `accept_invite` performs a real write (unlike
this schema's existing read-only `SECURITY DEFINER` helpers — `is_admin`, `can_edit_team`,
`can_see_team`, `is_own_player` — which are harmless booleans left broadly grantable), it
needed an explicit follow-up `REVOKE EXECUTE ON FUNCTION public.accept_invite(uuid) FROM anon`
— verified afterward via `information_schema.role_routine_grants` that only
`authenticated`/`service_role`/`postgres` can call it.

This is also the **first migration Supabase's own migration history has ever tracked** for
this project — `list_migrations` returned empty before this (the original schema was applied
as raw SQL outside that tracking system at some point before this repo's current build began).

### Database schema changes (Task 21 — RLS helpers moved to a `private` schema)

Two migrations, both controller-applied directly:

1. `move_rls_helpers_to_private_schema` — created `schema private` (`revoke all on schema
   private from public, anon, authenticated; grant usage ... to authenticated` — `anon` has no
   `USAGE` on the schema itself, though this doesn't matter for RLS evaluation, only for
   direct `schema.function()` calls, which `anon` never makes). Recreated `is_admin(_club)`,
   `can_see_team(_team)`, `can_edit_team(_team)`, `is_own_player(_player)` (all `STABLE
   SECURITY DEFINER`, `SET search_path = 'public'`) and `handle_new_user()` (`SECURITY
   DEFINER`, same search_path) in `private`, with bodies byte-identical to their old `public`
   versions. Re-pointed the `on_auth_user_created` trigger to `private.handle_new_user()`.
   Dropped and recreated all 14 policies that referenced the old functions (`teams.team
   manage`; `memberships.memb manage`+`memb read`; `invites.invites manage`; `players.player
   edit`+`player read`; `player_contacts.contact edit`+`contact read`; `events.event
   edit`+`event read`; `availability.avail coach manage`+`avail own insert`+`avail own
   update`+`avail read`) to call `private.*` instead of `public.*`, then dropped the 5 old
   `public` functions.
2. `restore_anon_execute_on_rls_helpers` — same-session fix-up: `grant execute on function
   private.is_admin/can_see_team/can_edit_team/is_own_player(uuid) to anon` (restores
   pre-migration behaviour — see the regression writeup above). `handle_new_user` intentionally
   has no `anon`/`authenticated` grant either before or after — it is only ever invoked by the
   trigger, which runs as the function owner regardless of the firing role's own grants.

`accept_invite(uuid)` is unchanged by this task — still in `public`, still `SECURITY DEFINER`,
still `authenticated`+`service_role` only (no `anon`), per the Task 18 gotcha fix.

**Net effect:** `GET /rest/v1/teams|players|player_contacts|events|availability|memberships`
behave identically for every role, before and after. `POST /rest/v1/rpc/is_admin` (and the
other three) now 404 — PostgREST can no longer find them anywhere in its exposed schema
cache — where before this task they were live, callable endpoints (the advisor's original
"anon/authenticated can execute via RPC" warning). `accept_invite` remains the one function
genuinely reachable via RPC, exactly as intended.

### The schema is now checked into the repo — `db/schema/`

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

