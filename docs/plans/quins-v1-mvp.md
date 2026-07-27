# Quins Club Hub — v1 Implementation Plan

**Goal:** Ship a logged-in, installable PWA where Abu Dhabi Harlequins manage fixtures, roster, and per-player availability, with roles enforced server-side by Supabase.

**Architecture:** React single-page app (Vite build) talking directly to Supabase (Postgres + Auth + RLS + Realtime) via `@supabase/supabase-js`. No custom backend. Row-Level Security does all access enforcement; the frontend just holds the session and renders scoped data. Deployed as static files on Netlify, auto-built from a private GitHub repo.

**Tech Stack:** Vite · React 18 · React Router · Tailwind CSS · @supabase/supabase-js v2 · Vitest + React Testing Library (tests) · Netlify (hosting/CI).

## Global Constraints
- **Supabase project:** ref `lusmshimxdcxpnrktlgz`, URL `https://lusmshimxdcxpnrktlgz.supabase.co`. Publishable (anon) key `sb_publishable_grr3_ko7nK-7EM6COlaFoA_opaOTa71`. Env vars only; NEVER commit the secret key. `.env` is git-ignored; `.env.example` documents the names.
- **Repo:** private GitHub `jayjmuir-hub/quins-club-hub`. Frequent small commits (conventional commits: `feat:`, `fix:`, `chore:`, `test:`).
- **Brand (exact):** app name "Abu Dhabi Harlequins", tagline "Quins Club Hub", icon label "Quins". Colours: primary red `#C21F32`, green `#7DC351`, soft green `#87C97F`, dark red `#8E1526`, black `#141414`, white. Header = red→green gradient. Crest = `src/assets/crest.png` (transparent PNG built from the real club crest).
- **Age groups (15):** U6, U7, U8, U9, U10, U11, U12, U13, U14, U15, U16, U18 Colts, Senior Men 1st XV, Senior Men 2nd XV, Women's XV. Club id `00000000-0000-0000-0000-0000000000ad`.
- **Roles:** admin / coach / parent / player. Enforcement is server-side (RLS); the UI only hides what the DB already forbids.
- **Copy:** sentence case, active voice; buttons name the action ("Add fixture", "Send invite"); every screen has loading, empty, and error states.
- **Testing convention:** each task is TDD — write the test first (Vitest/RTL for components & pure logic; integration smoke tests against the live Supabase project for data/auth/RLS), watch it fail, implement minimally, watch it pass, commit. Data-access and RLS tasks that can't be pure-unit-tested specify an explicit integration/manual verification instead.
- **Design reference:** `assets/prototype-desktop.html` is the approved prototype (vanilla HTML/CSS/JS). Port its look and interaction to React; do not invent a new visual identity.
- **No network at test time:** unit tests must not hit the network. Integration tests are separate files named `*.integration.test.js` and excluded from the default `npm test` run.

---

## Phase A — Scaffold & deploy pipeline

### Task 1: Scaffold app + first deploy
**Files:** Create `package.json`, `vite.config.js`, `index.html`, `src/main.jsx`, `src/App.jsx`, `tailwind.config.js`, `postcss.config.js`, `src/index.css`, `netlify.toml`, `.gitignore`, `.env.example`.
**Interfaces:** Produces a running Vite+React+Tailwind app and a build that Netlify can publish.
- [ ] Scaffold Vite React app; add Tailwind; add the brand colours as Tailwind theme tokens (`quinsRed #C21F32`, `quinsGreen #7DC351`, `quinsGreenSoft #87C97F`, `quinsRedDark #8E1526`, `quinsBlack #141414`).
- [ ] Put a temporary "Quins Club Hub" heading on the red→green gradient to confirm styling.
- [ ] Add `netlify.toml` (build `npm run build`, publish `dist`, SPA redirect `/* → /index.html` status 200).
- [ ] Add Vitest + React Testing Library + jsdom; `npm test` runs unit tests only (exclude `*.integration.test.js`).
- [ ] Verify: `npm run build` succeeds and `npm test` passes. Commit.

### Task 2: Supabase client + connection smoke test
**Files:** Create `src/lib/supabase.js`, `tests/supabase.test.js`, `tests/supabase.integration.test.js`.
**Interfaces:** Produces `supabase` client. Consumes env `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
- [ ] Unit test first: module throws a clear error when env vars are missing; exports a client when they are present.
- [ ] Integration test (excluded from default run): selects `count` from `teams` and expects 15.
- [ ] Implement `createClient(url, anonKey)` from Vite env; export `supabase`.
- [ ] Run both; commit.

## Phase B — Auth & scope

### Task 3: Auth context (session + magic link + sign-out)
**Files:** Create `src/lib/auth.jsx` (`AuthProvider`, `useAuth`), `tests/auth.test.jsx`.
**Interfaces:** Produces `useAuth() → { session, user, loading, signInWithEmail(email), signOut() }`.
- [ ] Test: provider exposes `loading: true` then a null session when signed out (mock `supabase.auth`); `signInWithEmail` calls `signInWithOtp` with the email and an `emailRedirectTo` of the app origin; `signOut` calls `supabase.auth.signOut`.
- [ ] Implement provider: `supabase.auth.getSession()`, `onAuthStateChange` (unsubscribe on unmount), `signInWithOtp({email})`, `signOut()`.
- [ ] Verify test passes. Commit.

### Task 4: Google OAuth sign-in
**Files:** Modify `src/lib/auth.jsx` (add `signInWithGoogle()`), `tests/auth.test.jsx`.
**Interfaces:** Produces `signInWithGoogle()` → `supabase.auth.signInWithOAuth({provider:'google', options:{redirectTo}})`.
- [ ] Test: `signInWithGoogle` calls supabase OAuth with provider `google` (mock).
- [ ] Implement; commit. (Jay task: create Google OAuth client, paste into Supabase → Auth → Providers.)

### Task 5: Login screen
**Files:** Create `src/screens/Login.jsx`, `tests/login.test.jsx`.
**Interfaces:** Consumes `useAuth`. Renders crest, email field, "Email me a link" button, "Continue with Google", and success/error/loading states.
- [ ] Test: entering an email + submit calls `signInWithEmail`; shows a "Check your email" confirmation; an error from `signInWithEmail` renders an error message; the submit button is disabled while sending.
- [ ] Implement UI in house style (crest, gradient, card). Empty/error/loading states. Accessible labels on the email field.
- [ ] Verify. Commit.

### Task 6: Auth gate + routing
**Files:** Modify `src/App.jsx`; create `src/components/RequireAuth.jsx`.
**Interfaces:** Logged-out → `Login`; logged-in → app shell. Handles the magic-link/OAuth redirect callback.
- [ ] Test: `RequireAuth` renders `Login` when there is no session, its children when a session is present, and a spinner while `loading`.
- [ ] Implement React Router (`BrowserRouter`) with protected routes; strip the `#access_token` fragment from the URL after Supabase consumes it. Commit.

### Task 7: Memberships + scope helpers
**Files:** Create `src/lib/scope.js`, `src/data/members.js`, `tests/scope.test.js`.
**Interfaces:** Produces `loadMyMemberships()`; `visibleTeams(memberships, allTeams)`, `canEditTeam(memberships, teamId)`, `isAdmin(memberships)`, `roleLabel(memberships)`, `childPlayerIds(memberships)`.
- [ ] Test each helper with fixture membership arrays: admin sees all teams and `canEditTeam` is true for any team; coach sees and can edit only their own teams; parent sees their child's team and cannot edit; `roleLabel` picks the highest role; `childPlayerIds` returns linked `player_id`s.
- [ ] Implement pure helpers + `loadMyMemberships()` query (`memberships` joined to `teams`). Verify. Commit.

## Phase C — Shell & design system

### Task 8: App shell + navigation
**Files:** Create `src/components/AppShell.jsx`, `src/components/Nav.jsx`; modify `App.jsx`.
**Interfaces:** Header (crest + "Abu Dhabi Harlequins" / "Quins Club Hub" + red→green gradient); bottom tab nav on mobile, top nav on desktop; routes Home/Schedule/Roster/More; sign-out in More.
- [ ] Test: shell renders the four nav items, shows the signed-in user's role label, and clicking a nav item changes the active route.
- [ ] Implement responsive shell in brand style, with `env(safe-area-inset-bottom)` padding on the mobile tab bar. Commit.

### Task 9: Shared UI components (port from prototype)
**Files:** Create `src/components/{Card,Chip,Sheet,Badge,TeamPills,ScopeNote,Empty,Spinner}.jsx`, `tests/components.test.jsx`.
**Interfaces:** Reusable primitives consumed by all screens; match prototype styling (chips: match=red, training=green, social=amber; card radius/shadow; bottom-sheet modal).
- [ ] Test: `Chip` renders the correct variant class per type; `Sheet` opens, closes on backdrop click and on Escape, and traps focus; `Empty` renders its message; `TeamPills` marks the selected pill and calls `onChange`.
- [ ] Implement; commit.

## Phase D — Read features

### Task 10: Data-access modules
**Files:** Create `src/data/{events,players,availability}.js`, `tests/data.test.js`.
**Interfaces:** Produces `listEvents({teamIds, from, to})`, `listPlayers({teamIds})`, `getPlayerContact(playerId)`, `listAvailability(eventId)`, and realtime `subscribeEvents(cb)`, `subscribeAvailability(eventId, cb)`. All rely on RLS for scoping (no client-side secrets).
- [ ] Test with a mocked supabase client: each function builds the expected query (table, filters, ordering) and returns `data`; errors are thrown, not swallowed; `subscribe*` returns an unsubscribe function.
- [ ] Implement query modules + realtime channels. Commit.

### Task 11: Schedule screen
**Files:** Create `src/screens/Schedule.jsx`, `src/screens/EventDetail.jsx`, `tests/schedule.test.jsx`.
**Interfaces:** Tabs Upcoming/Results/Calendar; team-filter pills = `visibleTeams`; event detail sheet with availability summary; realtime refresh.
- [ ] Test: renders events from a mocked `listEvents`; the Results tab shows only past events with a score and Upcoming shows only future ones; the team pill filters the list; loading, empty and error states render.
- [ ] Implement (port prototype schedule UI to React); wire realtime. Commit.

### Task 12: Roster screen
**Files:** Create `src/screens/Roster.jsx`, `src/screens/PlayerDetail.jsx`, `tests/roster.test.jsx`.
**Interfaces:** Grouped by age group when multiple teams are visible, by position when one; search by name; player detail shows contact ONLY when `getPlayerContact` returns data (RLS decides).
- [ ] Test: grouping logic (multi vs single team); search filters; contact block hidden when the contact query returns no row.
- [ ] Implement. Commit.

### Task 13: Dashboard
**Files:** Create `src/screens/Dashboard.jsx`, `tests/dashboard.test.jsx`.
**Interfaces:** Next fixture + countdown, stats (players/fixtures/groups), quick actions (edit-gated by `canEditTeam`/`isAdmin`), last result — all scoped to `visibleTeams`.
- [ ] Test: shows the next upcoming scoped event; hides "Add fixture"/"Add player" actions for a parent membership and shows them for a coach.
- [ ] Implement. Commit.

## Phase E — Write features

### Task 14: Event create/edit/delete
**Files:** Create `src/screens/EventForm.jsx`; modify `src/data/events.js` (`upsertEvent`, `deleteEvent`).
**Interfaces:** Coaches/admin only; squad dropdown limited to `canEditTeam` teams; type match/training/social with conditional fields (opponent/home/competition/score only for match).
- [ ] Test: `upsertEvent` inserts when there is no id and updates when there is; the form blocks submit when required fields are empty; team options are limited to editable teams; a Supabase error surfaces as a visible error message.
- [ ] Implement. Commit.

### Task 15: Player create/edit/delete + contact
**Files:** Create `src/screens/PlayerForm.jsx`; modify `src/data/players.js` (`upsertPlayer`, `deletePlayer`, `upsertContact`).
**Interfaces:** Coaches/admin only; writes `players` + `player_contacts`; team-restricted.
- [ ] Test: `upsertPlayer` insert then update; `upsertContact` upserts on `player_id`; `deletePlayer` removes; form validates required name + team.
- [ ] Implement. Commit.

### Task 16: Availability RSVPs + coach team-sheet
**Files:** Create `src/screens/Availability.jsx`; modify `src/data/availability.js` (`setAvailability(eventId, playerId, status)`).
**Interfaces:** Player/parent sets own (`is_own_player` via RLS); default "No response"; coach team-sheet lists all players with live In/Out/Maybe and can override; realtime updates.
- [ ] Test: `setAvailability` upserts one row on the `event_id,player_id` conflict target; the team sheet tallies In/Out/Maybe/No-response counts; a parent sees toggles only for their own children; an RLS error surfaces as a visible message.
- [ ] Implement; wire realtime so the coach sheet updates live. Commit.

## Phase F — Onboarding / admin

### Task 17: Admin overview
**Files:** Create `src/screens/Admin.jsx`; modify `src/data/members.js`.
**Interfaces:** Admin-only; lists teams/players/members; entry points to invite + manage.
- [ ] Test: the Admin screen renders for `isAdmin` and renders a "not authorised" message (no admin data) otherwise.
- [ ] Implement. Commit.

### Task 18: Invite flow (create + accept)
**Files:** Create `src/screens/InviteForm.jsx`, `src/screens/AcceptInvite.jsx`; add `invites` table migration; modify `src/data/members.js` (`createInvite`, `acceptInvite`).
**Interfaces:** Admin creates invite (email + role + team + optional child `player_id`); the invitee follows a tokenised link and, on first login, `acceptInvite(token)` creates the `membership` row and links parent→child; RLS/policy for `invites`.
- [ ] Migration: `invites` table (`id`, `club_id`, `email`, `role`, `team_id`, `player_id`, `token`, `created_by`, `created_at`, `accepted_at`) + RLS (admins manage; an authenticated invitee may read and accept a row matching their own email). Accepting runs through a `SECURITY DEFINER` function `accept_invite(token)` so the invitee never needs write access to `memberships`.
- [ ] Test: `createInvite` inserts with the right fields; `acceptInvite` calls the RPC and surfaces its error; the admin form validates email + role, and requires a team for coach/parent/player roles.
- [ ] Implement admin invite UI + accept screen. Commit.

### Task 19: First-admin bootstrap
**Files:** Create `docs/first-admin.md`.
- [ ] Document the exact SQL to grant Jay `admin` after his first sign-in, plus how to verify he sees all 15 teams. (No app code.)

## Phase G — PWA, security, release

### Task 20: PWA (installable + offline read)
**Files:** Create `public/manifest.webmanifest`, icons (from the crest), `src/sw-register.js`; add `vite-plugin-pwa` config.
**Interfaces:** Installable to home screen; caches the app shell and last-loaded data for offline read. Icon label "Quins", theme colour `#C21F32`.
- [ ] Test: the built `dist/` contains the manifest and a service worker; the manifest declares name, short_name "Quins", 192px and 512px icons, `display: standalone`, and the theme colour.
- [ ] Implement. Commit.

### Task 21: Security hardening (RLS helpers → private schema)
**Files:** Supabase migration.
**Interfaces:** Move `is_admin`, `can_see_team`, `can_edit_team`, `is_own_player` into a `private` schema not exposed by the API; re-point policies; keep behaviour identical. Set a fixed `search_path` on each function.
- [ ] Migration; then run the Supabase security advisors → expect the function-search-path / exposed-helper warnings cleared and no new errors.
- [ ] Verify roles still scope correctly. Commit.

### Task 22: End-to-end role + a11y verification, release
**Files:** Create `docs/e2e-roles.md` (checklist) + any fixes it turns up.
- [ ] Write the end-to-end checklist: admin / coach / parent accounts, scoping, edit-gating, contact hiding, RSVP realtime.
- [ ] Accessibility pass: visible keyboard focus, `prefers-reduced-motion` respected, contrast AA on the brand palette (document the accessible red/green pairings actually used for text).
- [ ] Document the deploy + domain steps (Netlify env vars, `adhjrt.com` trial subdomain, Supabase allowed redirect URLs). Commit.
