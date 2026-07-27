# Quins Club Hub — resume here

**Single source of truth: https://github.com/jayjmuir-hub/quins-club-hub (public).**
Branch `build/v1-mvp` is the live work. `main` holds only the initial scaffold commit.

**10 of 22 tasks complete, 167 tests passing, build clean.**

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
npm test        # expect 167 passing across 11 files
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
| **D — Read features** | 10 data-access modules | done |
| | 11 schedule, 12 roster, 13 dashboard | next |
| **E — Write features** | 14 event form, 15 player form, 16 availability RSVPs | todo |
| **F — Admin** | 17 admin overview, 18 invite flow, 19 first-admin doc | todo |
| **G — Release** | 20 PWA, 21 RLS hardening, 22 E2E + a11y + deploy docs | todo |

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

## Resume at Task 11 — Schedule screen

Its brief is already generated at `.superpowers/sdd/quins-v1-mvp/task-11-brief.md`, as are
briefs 12 and 13. The plan is `docs/plans/quins-v1-mvp.md`; the visual spec is
`docs/design-system.md` (597 lines, extracted from the approved prototype — implementers
build from it without reading the prototype HTML).

Execution method: `superpowers:subagent-driven-development` — one implementer subagent per
task, then a spec+quality review, then a scoped re-review of any fixes, then a ledger entry.

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

**`getPlayerContact` uses `.maybeSingle()`, not `.single()`.** Zero rows is the normal
outcome for a parent — RLS hides contacts from them. `.single()` throws on zero rows, which
would turn a safeguarding feature into a crash.

**`auth.users` already has an `on_auth_user_created` trigger** calling `handle_new_user()`,
which creates the `profiles` row. No app-side profile creation needed.

**Contrast:** `quinsGreen #7DC351` on white is ~1.9:1 and fails AA for text — gradient stop
or block fill only. Error text uses `quinsRedDark #8E1526` (~7.9:1). The neutral chip's text
was darkened to `#5c5854` (6.04:1) because the design system's `--muted` on the chip
background was 4.07:1, under the threshold.

**Conventions set by earlier tasks:** data-access functions **throw** on error, never return
`{data, error}` tuples, and return `[]` not `null`. `src/lib/scope.js` holds only pure
functions with zero imports. Screens catch and render errors in a `role="alert"` region.
Data modules never import React.

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
- **First-admin SQL** — after Jay's first sign-in, grant himself `admin` (Task 19 documents
  this). Until then he sees the "not linked to a squad yet" screen.
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
