# Quins Club Hub — resume here

**Single source of truth: https://github.com/jayjmuir-hub/quins-club-hub (public).**
Branch `build/v1-mvp` is the live work. `main` holds only the initial scaffold commit.

**19 of 22 tasks complete, 528 tests passing, build clean.**

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
npm test        # expect 528 passing across 22 files
npm run build   # expect clean
```

---

## Pushing changes back

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
does.

---

## What's built

| Phase | Tasks | State |
|---|---|---|
| **A — Scaffold** | 1 scaffold, 2 Supabase client | done |
| **B — Auth & scope** | 3+4 auth context, 5 login screen, 6 auth gate + router, 7 scope helpers | done |
| **C — Shell & design system** | 8 app shell + nav, 9 shared UI primitives | done |
| **D — Read features** | 10 data-access, 11 schedule, 12 roster, 13 dashboard | done |
| **E — Write features** | 14 event form, 15 player form, 16 availability RSVPs | done |
| **F — Admin** | 17 admin overview, 18 invite flow, 19 first-admin doc | done |
| **G — Release** | 20 PWA, 21 RLS hardening, 22 E2E + a11y + deploy docs | next |

Every completed task passed a spec-compliance and code-quality review; several needed fix
rounds, all closed by a scoped re-review. The ledger at
`.superpowers/sdd/quins-v1-mvp/progress.md` records every ruling, fix round and deferred
minor, and it is committed to this repo — a resuming session gets it from the clone.

**Toolchain locked in:** React 18, Vite 5, Tailwind 3 (not 4 — later tasks assume the
config-file API), React Router v6 with `v7_startTransition` and `v7_relativeSplatPath`
future flags, Vitest + React Testing Library. No ESLint or Prettier. `npm test` runs unit
tests only and never touches the network; `npm run test:integration` runs the
`*.integration.test.js` files against the live Supabase project.

---

## Resume at Task 20 — PWA (installable + offline read)

Phase F is now FULLY COMPLETE (17 admin overview, 18 invite flow, 19 first-admin bootstrap
doc). Task 18 added a new `invites` table + RLS + a `SECURITY DEFINER accept_invite(token)`
RPC — **applied directly by the controller against the live Supabase project, not by an
implementer subagent**, because this was the first task in the build to touch the database,
and a bad RLS predicate fails silently (wrong rows, no error) rather than loudly. See
"Database schema changes" below for the exact shape and a real gotcha worth remembering for
Task 21 (RLS hardening) or any future `SECURITY DEFINER` function.

Task 19 added `docs/first-admin.md` — the exact SQL for Jay to run himself (not something this
build automates — see the doc's own reasoning) after his first sign-in, to grant himself
`admin`. This was docs-only (no app code, no tests, no review loop or browser check — those
gates exist for code, not a static SQL doc), but the controller caught a real bug in its own
first draft before committing: the draft used `ON CONFLICT DO NOTHING` to make the admin-grant
insert safe to run twice, but `memberships` has no unique constraint on
`(profile_id, club_id, role)` — only a PK on a fresh uuid every insert, which never conflicts
— so that statement would have silently created a SECOND admin row if ever run twice, not
no-op'd as claimed. Fixed with `INSERT ... SELECT ... WHERE NOT EXISTS (...)`, which is
genuinely idempotent. Verified live before writing: `auth.users` currently has zero rows (Jay
hasn't signed in yet — the doc's "sign in first" framing isn't hypothetical), and the club/
memberships schema details the doc references (club id `00000000-...000ad`, nullable
`team_id`/`player_id`) were checked against the live database, not assumed from memory.

Task 20 (PWA) starts Phase G — the final phase. Per the plan (`docs/plans/quins-v1-mvp.md`,
Task 20): create `public/manifest.webmanifest`, icons from the crest, `src/sw-register.js`,
add `vite-plugin-pwa` config. Interfaces: installable to home screen; caches the app shell and
last-loaded data for offline read. Icon label "Quins", theme colour `#C21F32`. Test: the built
`dist/` contains the manifest and a service worker; the manifest declares name, short_name
"Quins", 192px and 512px icons, `display: standalone`, and the theme colour. Its brief is not
yet generated.

`src/App.jsx` was restructured from one shared `<AppShell><Routes>...</Routes></AppShell>` to
each route wrapping its own `<AppShell>` individually, so `/accept-invite/:token` could exist
as a sibling route OUTSIDE any `AppShell` — `AppShell` refuses to render its routed content at
all until `memberships.length > 0`, which a fresh invitee doesn't have until they accept. This
was a real, confirmed-live bug the restructuring fixes (a naive route nested inside the old
single-`AppShell` structure would have been permanently unreachable for exactly the people who
need it most). The independent browser check specifically stress-tested cross-route navigation
after this restructuring (16 sampled frames across 4 real nav clicks, a 24-click rapid-nav
stress test) and found it CLEAN — no remount flash, no stale active-nav frame, no focus loss,
no extra crest network requests. It did catch two real defects: `AcceptInvite` hung forever
under React StrictMode/`npm run dev` only (a `mounted` ref's cleanup fired on StrictMode's
throwaway first mount, permanently discarding the real in-flight `acceptInvite` promise's
result — confirmed absent in a production build, fixed by relying solely on `calledRef`), and
the invite-accept screen — the first screen a brand-new member ever sees — had zero club
branding (fixed with a small crest + name addition, without touching the AppShell-avoidance
routing).

Task 19 (First-admin bootstrap) is next and is **docs-only, no app code**: create
`docs/first-admin.md` documenting the exact SQL to grant Jay `admin` after his first sign-in
(see `docs/plans/quins-v1-mvp.md`, Task 19), plus how to verify he then sees all 15 teams.
This does not need the full subagent-driven-development task loop (no code, no tests to
review) — a single pass of writing the doc, having it reviewed against the plan text and the
live schema (the `memberships` table's actual columns/constraints), is proportionate.

**Tooling note:** the `superpowers` plugin (subagent-driven-development's `task-brief`/
`review-package`/`sdd-workspace` scripts) disappeared from disk mid-Task-17 after an MCP
reconnect churn — re-invoking the skill failed with "Unknown skill." If this recurs, fall
back to doing it by hand: extract a task's plan section directly into
`.superpowers/sdd/quins-v1-mvp/task-N-brief.md`, and build review diffs with `git log
--oneline`/`git diff --stat`/`git diff -U10` redirected to
`.superpowers/sdd/quins-v1-mvp/review-<base7>..<head7>.diff` — same naming convention the
scripts used. The ledger/workspace layout doesn't depend on the scripts existing.

The plan is `docs/plans/quins-v1-mvp.md`; the visual spec is `docs/design-system.md` (597
lines, extracted from the approved prototype — implementers build from it without reading
the prototype HTML).

Execution method: `superpowers:subagent-driven-development` (or its manual equivalent above)
— one implementer subagent per task, then a spec+quality review, then a scoped re-review of
any fixes, then a ledger entry. Tasks 11 onward added a further gate that has earned its
place every time: an **independent controller-side browser pass**, rendering the real
components in Chromium at 375px and 1280px via `harness/`. It has caught defects on every
screen that jsdom could not see — Task 17 caught a hard-reload navigation bug, Task 18 caught
the StrictMode hang and branding gap above. Screenshots are git-ignored — regenerate them,
don't commit them.

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

**`.superpowers/sdd/.gitignore` gets reset to `*` by tooling, repeatedly.** It silently
untracks the whole ledger. Do not fight it — stage the workspace with
`git add -f .superpowers/sdd/quins-v1-mvp/` every time.

---

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

## Outstanding, needs Jay

- **Google OAuth client credentials** for Supabase -> Auth -> Providers. Task 4's code is
  done and waiting on them.
- **First-admin SQL** — after Jay's first sign-in, grant himself `admin` (Task 19 will
  document this — not yet built). Until then he sees the "not linked to a squad yet" screen.
  Note: with Task 18 now live, an alternative to raw SQL exists — any existing admin could
  send Jay an invite through the app's own `InviteForm` instead, but there is no admin yet, so
  the very first grant still has to happen via direct SQL (or the Supabase dashboard) either
  way. Task 19 documents that one-time bootstrap step.
- **Netlify** — MCP works. `adhjrt.com` points at Netlify project `serene-gingersnap-1d0eb6`
  (Pro plan, password-protected, deploy current). Deploying builds directly via MCP is the
  route until CI is wired to this repo.

## Infrastructure facts

- **Supabase:** project `quins-club-hub`, ref `lusmshimxdcxpnrktlgz`, region
  `ap-northeast-1`, Postgres 17, status `ACTIVE_HEALTHY`. A second project `adhjrt-app`
  (`nnlfjbnoiyqcvxwbwsjf`) exists and is **not** used by this app.
- **This repo is public.** Nothing secret is committed: `.env` is ignored, no `sb_secret_`
  or `service_role` string appears in any tracked file. Security rests on Supabase RLS, not
  on the code being hidden. Keep it that way.
