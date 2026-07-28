# Task 18 — Independent Browser Verification (Invite flow)

Repo: `/home/claude/quins-club-hub`, branch `build/v1-mvp`, HEAD `fe09c2e`.
Tool: Playwright (via `PLAYWRIGHT_MODULE=/opt/node-tools/node_modules/playwright/index.mjs`),
harness dev server on `http://localhost:5199` (`harness/vite.config.js`).

New harness artifacts added for this pass (not part of the app build):
- `harness/shoot-invite.mjs` — the scripted run (report at
  `screenshots/task18-invite/report.json`).
- `harness/stubs/members.js` — added `createInvite()` (`?inviteDelay=<ms>`,
  `?inviteThrow=1`) and `acceptInvite(token)` (`?acceptDelay=<ms>` default
  500, `?acceptThrow=1`, `?acceptError=<url-encoded text>`) stubs, following
  the file's existing `?membersDelay=`/`?membersThrow=` convention.
- `harness/main.jsx` — added a `full-app` scenario: a **faithful reproduction
  of `App.jsx`'s own route structure** (each of `/`, `/schedule`, `/roster`,
  `/more` wrapped in its own `<AppShell>`; `/accept-invite/:token` as a
  sibling `<Route>` outside all of them; `?start=none` picks a
  zero-membership account) — needed because this task's top-priority risk is
  a full-app navigation behaviour, not a single-screen render. `memberships`
  is real `useState` in this scenario (not a fixed prop) so `AcceptInvite`'s
  `reload()`-then-`<Navigate>` sequence can be exercised end-to-end, the same
  way the real `reload()` picks up a freshly-inserted membership row.

Two ad hoc production-mode checks (not committed, used only to isolate a
finding's root cause) were run against `vite build --config harness/vite.config.js`
+ `vite preview`, then discarded (`harness/dist` removed afterward).

## Verdict: 2 DEFECTS found (1 High, 1 Low). The flagged top-priority risk (cross-route AppShell remount) is CLEAN.

---

## Defects

### D1 — `AcceptInvite` permanently hangs on "Accepting your invite…" in React StrictMode / dev mode (`npm run dev`), for both success AND failure

- **File/line:** `src/screens/AcceptInvite.jsx:41-68` (the `calledRef` + `mounted` guard combination), triggered by `src/main.jsx:8` wrapping the app in `<React.StrictMode>`.
- **Severity:** High for local development (the flow **never completes**, in either the success or failure branch — the admin cannot verify the invite flow works at all during `npm run dev`). **Does not reproduce in the production build** (confirmed below), so it does not affect the deployed app once built with `vite build`.
- **Root cause, confirmed with temporary instrumentation (added, tested, then reverted — `git diff --stat src/screens/AcceptInvite.jsx` shows no diff after):**
  1. React 18 StrictMode (dev mode only) mounts the effect, immediately unmounts it (running cleanup), then remounts it, synchronously, before first paint.
  2. First mount: `calledRef.current` is `false` → set to `true`, `mounted = true`, `acceptInvite(token)` is called (the promise starts).
  3. StrictMode's synchronous unmount runs the cleanup: `mounted = false`.
  4. StrictMode's remount: the guard `if (calledRef.current) return undefined` now fires (it's `true` from step 2), so the effect exits immediately **without starting a new call** — but the *first* call's promise is still in flight, and its closure has `mounted = false` forever now.
  5. When the real (stubbed) `acceptInvite` promise resolves or rejects, `.then()`/`.catch()` checks `if (!mounted) return` and silently no-ops. `setStatus`, `reload()`, and the eventual `<Navigate to="/" />` never fire.
  6. Console log evidence from the instrumented run: `EFFECT RUN, calledRef= false` → `CLEANUP RUN` → `EFFECT RUN, calledRef= true` → `THEN, mounted= false` — then nothing. The screen is stuck on the spinner forever (confirmed waiting 5s, no change).
- **Repro (dev harness, `http://localhost:5199`):**
  1. Load `?scenario=full-app&start=none&acceptDelay=700` at `/accept-invite/tok-good-1234`.
  2. Wait 5000ms. `document.body.innerText` is still `"Accepting your invite…"`, URL unchanged (never redirects to `/`).
  3. Same result for the failure path (`?acceptThrow=1`): waited 2000ms past the point the stub's promise rejects — never shows the `role="alert"` error text, stays on the spinner.
  4. Logged in `screenshots/task18-invite/report.json` cases `2-3-accept-invite-routing-and-success-flow` (`settledUrl` is still the `/accept-invite/...` URL, `settledState.bodyTextSnippet` is still `"Accepting your invite…"`) and `4-accept-invite-failure-mobile`/`4-accept-invite-failure-desktop` (`alertPresent: false` in both).
- **Confirmed absent in a production build** (the exact same stub/scenario, built with `vite build --config harness/vite.config.js` then served via `vite preview`): the success case redirects to `/` and shows the real Dashboard within ~1s; the failure case shows `"We couldn't accept that invite" / "This invite has already been used."` in a real `role="alert"`, at both 375px and 1280px, with no horizontal overflow (`innerWidth === docWidth` at both sizes). This is expected — React only double-invokes effects in development StrictMode, never in a production build — but it means **anyone testing this flow locally via `npm run dev` before deploying will see it hang forever**, which is exactly the kind of interaction jsdom/RTL unit tests (which don't wrap components in `<StrictMode>` by default) would never catch, and is worth fixing before it costs someone a confusing debugging session.
- **Suggested fix direction (not applied — verification-only pass):** the `mounted` ref and the `calledRef` guard are fighting each other. Either drop the `mounted` flag and rely solely on `calledRef` to prevent a second real network call (StrictMode's dev-only double-mount does not itself require ignoring the original promise's result), or restructure so cleanup does not disable the very call that's still in flight after the double-invoke settles — e.g. only setting `mounted = false` in the cleanup of the *second* (real, lasting) mount, not the throwaway first one.

### D2 — First-ever screen a brand-new invitee sees (`/accept-invite/:token`) has zero club branding

- **File/line:** `src/screens/AcceptInvite.jsx:74-96` (the whole return — no `<img src={crest}>`, no club name, no red/green gradient anywhere).
- **Severity:** Low / cosmetic (not a functional bug — this is an intentional design tradeoff per the code comment explaining why this route sits outside `AppShell`, and the reviewer's brief explicitly asked me to flag this rather than treat it as broken).
- **What it looks like:** a plain light-grey background (`#f5f4f3`) with one small white rounded card containing only a spinner + "Accepting your invite…" text, or the error heading/message. No crest, no "Abu Dhabi Harlequins" wordmark, no brand color beyond a red spinner/heading. See `screenshots/task18-invite/2-accept-invite-loading-unchromed.png`.
- **Why it matters:** this is literally the first screen the club's new members (parents, players, coaches) ever see after clicking their invite link — before they have any other context that this is the Quins app. A completely unbranded page at that exact moment is a weaker first impression than the rest of the app's polish suggests, even though it is not broken.
- **Suggested fix direction (not applied):** add the crest image and/or club name as a small standalone header on this screen (it doesn't need the full `AppShell` gradient header or nav — just enough branding that a first-time visitor recognizes it's the club's app), without touching the `ready`-gate reasoning that correctly keeps this route out of `AppShell` itself.

---

## Everything else checked: CLEAN

### 1. TOP PRIORITY — cross-route navigation flash/jank (the reviewer's flagged risk)

Checked 4 real Playwright-clicked nav transitions (Home→Schedule, Schedule→Roster, Roster→More, More→Home) at 1280×900, admin role (every route reachable), with a full `App.jsx`-shaped router (`full-app` scenario) — **not** a single screen in isolation.

- **Frames captured** at 0ms, 16ms, 50ms, 150ms after each click (16 frames total across the 4 transitions): `headerPresent: true` and `headerVisible: true` in **every single frame**, no frame with an empty/missing `<header>`. No blank-frame flash was observed at any sampled point.
- **Active-link styling**: `activeLinkText` in the `t0` frame (the very first evaluate call after the click resolves) already matches the destination page in all 4 transitions (e.g. clicking "Schedule" → `t0.activeLinkText === "Schedule"` immediately) — no stale "previous page still marked active" frame was ever observed, even at the earliest sampled point.
- **Crest image reload**: tracked every network request matching `crest` for the whole session (initial load + all 4 clicked navigations + the 24-click rapid-navigation stress test below). **`crestRequestCount: 0`** post-initial-load — the crest is not re-requested from the network on any client-side route change (React reconciliation keeps the same `<img>` DOM node across the per-route `AppShell` remounts here since the `src` never changes, so the browser doesn't even need to serve it from cache — it's the same image element). No performance concern.
- **Keyboard focus**: before each click, the target nav `<a>` was explicitly given focus and confirmed (`focusedBeforeClick: "A"`). After the click+remount, `activeElementTag` was still `"A"` (not reset to `<body>`) in every one of the 16 sampled frames, and `activeElementIsBody: false` throughout. I have no pre-restructuring build to compare this against (per the brief's caveat), but on its own terms this is reasonable: a screen reader user's focus is never silently dropped to the document body by the remount.
- **Rapid repeated navigation**: clicked through Schedule→Roster→More→Home 6 times in a row (24 clicks) as fast as Playwright could issue them. **Zero new console/page errors** appeared during or after this stress run (`rapidNavConsoleErrors: []`) — only the two React Router "future flag" warnings present from initial page load (pre-existing, unrelated to this task, not real errors).
- **Visual screenshots**: `nav-*-before.png` / `nav-*-after.png` for all 4 pairs show clean, fully-rendered headers with correct focus rings on the newly-active nav item and no visual artifacts (see `nav-Home-to-Schedule-after.png` as a representative example — focus ring correctly on "Schedule", gradient header intact, page content fully rendered).

**Conclusion: the restructuring from one shared `<AppShell><Routes>` to per-route `<AppShell>` wrapping does not cause a visible flash/jank, an active-nav-styling lag, a focus regression, or extra crest network requests.** The reviewer's top-priority concern is not borne out in real Chromium.

### 2. `/accept-invite/:token` routing fix itself

- Navigated directly to `/accept-invite/tok-good-1234` as a signed-in user with **zero** memberships (`?start=none`). Confirmed: `hasHeader: false`, `hasNav: false`, `hasNoMembershipHeading: false` (i.e. `NoMembershipState`'s "You're signed in" text is genuinely absent), `hasAcceptingText: true` — the real `AcceptInvite` screen renders, not the old blocking `NoMembershipState`. This is the actual bug the restructuring was meant to fix, and it is fixed.
- Confirmed it renders **without** `AppShell`'s header/nav chrome, per the implementer's documented design choice (see D2 above for the cosmetic flag on how bare that looks).

### 3. Successful accept flow (end-to-end, production build)

Since D1 blocks this in the dev harness, this was verified against a production build (`vite build` + `vite preview`) of the exact same stub/scenario:
- Brief loading state shown ("Accepting your invite…" with a spinner) immediately after navigation.
- After the stubbed `acceptInvite` resolves (700ms), the screen calls `reload()` (which, in the `full-app` scenario, genuinely flips `memberships` from `[]` to a real one-row array via `useState` — not a no-op stub) then navigates to `/`.
- Confirmed the app then shows **real Dashboard content** — "Dashboard", stat tiles, nav — not stuck on `NoMembershipState`. This proves the reload-then-navigate sequence works end-to-end in a real browser once the code actually gets to run (i.e., outside the StrictMode double-invoke described in D1).

### 4. Failed accept flow (bad/expired/already-used token), 375px and 1280px

Also verified against the production build for the same reason as #3:
- A real `role="alert"` region renders with the stub's error text verbatim ("This invite has already been used.") at both viewport widths.
- No horizontal overflow at either width: `innerWidth === document.documentElement.scrollWidth` exactly (375 vs 375, 1280 vs 1280) at both sizes.
- Screenshots: `4-prod-error-mobile.png`, `4-prod-error-desktop.png`.

### 5. `InviteForm` in the shared `Sheet`

- Opens correctly from `Admin.jsx`'s "Invite a member" button into the real `Sheet` component (`role="dialog"`, `aria-modal="true"`, focus moved into the panel).
- **Age-group field removal is a genuine DOM removal, not CSS-hiding**: switching role to "admin" via `page.selectOption('#invite-role', 'admin')` makes `document.getElementById('invite-team')` return `null` (`teamFieldInDom: false`) — confirmed by DOM query, not a visibility/opacity check.
- **Contrast**: every muted-looking leaf label/paragraph in the form computed to `rgb(92, 88, 84)` (`#5c5854`, the passing value) — the failing `#77726e` value did not appear anywhere in this form.
- **No jersey numbers in the player picker**: `playerPickerState.jerseyAnywhere: false` (regex checked for "jersey"/"shirt number"/"squad number"/`#<digit>` anywhere in the sheet's text) — the player `<option>` list showed only player names.
- **Accept link is genuinely focus-to-select**: after a successful (stubbed) invite creation, clicking into the read-only `#invite-link` input and reading `selectionStart`/`selectionEnd` afterward gave `selectionStart: 0, selectionEnd: 59` for a 59-character value — the full value is selected, confirming the claimed "focus-to-select" behaviour is real, not just a claim in a comment.
- Screenshots: `5a-invite-sheet-open.png`, `5b-invite-sheet-role-admin.png` (age-group field visibly gone), `5c-invite-sheet-success-link.png`.

### 6. No horizontal overflow at 375px + zero console/page errors

- `InviteForm` opened at 375px viewport: `innerWidth === docWidth` (375 vs 375), zero overflowing elements detected via `getBoundingClientRect().right > window.innerWidth`.
- Across **every** case run in this pass (cross-route nav × 4, rapid-nav stress × 24 clicks, accept-invite loading/error at 2 viewports, InviteForm open/switch/submit, 375px sweep): the only console messages captured anywhere were the two pre-existing React Router v7 future-flag warnings present from initial page load — no `console.error`, no `pageerror`, in any scenario.
