# Task 1 Report: Scaffold app + build pipeline

## What was implemented

A working Vite + React 18 + Tailwind CSS 3 toolchain, wired for Netlify
deployment and Vitest testing, per the task brief.

Files created:
- `package.json` — scripts (`dev`, `build`, `preview`, `test`, `test:integration`),
  `react`, `react-dom`, `react-router-dom`, `@supabase/supabase-js` as
  dependencies (installed now so later tasks don't each re-run installs, per
  instructions — not yet used in app code); `vitest`, `@testing-library/*`,
  `jsdom`, `tailwindcss`, `postcss`, `autoprefixer`, `vite`,
  `@vitejs/plugin-react` as devDependencies. No ESLint/Prettier added
  (explicit instruction).
- `package-lock.json` — committed for reproducible installs.
- `vite.config.js` — `base: '/'`, React plugin, and a `test` block
  (`environment: 'jsdom'`, `globals: true`, `setupFiles: ['./src/test/setup.js']`).
  Unit vs integration selection is driven by `process.env.VITEST_MODE`:
  default run uses `include: ['**/*.test.{js,jsx}']` and excludes
  `**/*.integration.test.{js,jsx}`; `VITEST_MODE=integration` flips `include`
  to only `**/*.integration.test.{js,jsx}` (see "TDD evidence" below — the
  simpler CLI-flag approach from my initial plan didn't work with Vitest 2.x
  and was corrected before commit).
- `tailwind.config.js` — content globs `./index.html`, `./src/**/*.{js,jsx}`;
  theme tokens `quinsRed #C21F32`, `quinsGreen #7DC351`, `quinsGreenSoft #87C97F`,
  `quinsRedDark #8E1526`, `quinsBlack #141414` under `theme.extend.colors`.
- `postcss.config.js` — tailwindcss + autoprefixer.
- `src/index.css` — Tailwind directives + the design-system font stack
  (`-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial,
  sans-serif`) and `-webkit-font-smoothing: antialiased`, per
  `docs/design-system.md` §2.
- `index.html` — Vite entry HTML; `<title>Abu Dhabi Harlequins</title>`,
  `theme-color #C21F32`, Apple PWA meta tags (`apple-mobile-web-app-title`
  = "Quins"), favicon/apple-touch-icon pointed at the existing
  `public/icons/*` assets.
- `src/main.jsx` — standard React 18 `createRoot` entry, renders `<App />`
  inside `StrictMode`, imports `./index.css`.
- `src/App.jsx` — temporary placeholder screen: full-viewport flex column on
  the exact design-system header gradient
  (`linear-gradient(100deg, quinsRedDark 0%, quinsRed 42%, #B23A38 62%,
  quinsGreen 100%)`, referenced via Tailwind's `theme()` function inside an
  arbitrary value so the test both proves the tokens resolve and matches
  `docs/design-system.md` §1's literal gradient spec), the crest
  (`src/assets/crest.png`) and the brand name/tagline text. Will be replaced
  in Task 8.
- `src/test/setup.js` — imports `@testing-library/jest-dom`.
- `tests/app.test.jsx` — smoke test asserting `App` renders "Abu Dhabi
  Harlequins" and "Quins Club Hub".
- `netlify.toml` — `command = "npm run build"`, `publish = "dist"`, SPA
  redirect `/* -> /index.html` status 200.
- `.env.example` — documents `VITE_SUPABASE_URL` (real project URL
  `https://lusmshimxdcxpnrktlgz.supabase.co`) and `VITE_SUPABASE_ANON_KEY`
  (placeholder value only).

`.gitignore` was already correct (node_modules, dist, .env, .env.local,
.DS_Store, coverage, .superpowers/) and needed no changes.

## What was tested and the results

- `npm test` (unit only): 1 test file, 1 test, passes. Pristine output, no
  warnings.
- `npm run test:integration` with no integration test files present: passes
  with 0 tests via `--passWithNoTests` (confirms it won't fail CI before any
  integration tests exist).
- Manually verified the unit/integration split is real, not just configured:
  created a throwaway `tests/dummy.integration.test.jsx`, confirmed
  `npm test` still shows only `tests/app.test.jsx` (1 passed) and
  `npm run test:integration` shows only `tests/dummy.integration.test.jsx`
  (1 passed) — then deleted the dummy file (not committed).
- `npm run build`: succeeds, produces `dist/` with `index.html`, hashed JS/CSS
  bundles, and the crest asset copied in.
- `npm run preview` smoke check: served the built `dist/` on a local port;
  `curl` confirmed the response contains `Abu Dhabi Harlequins` and
  `<div id="root">`.
- `npm audit`: 7 advisories, all in devDependency chains (esbuild — dev-server
  only, moderate) or in `react-router-dom` (moderate, fix requires jumping to
  v7's breaking data-router API). Router isn't wired into any app code yet in
  this task, so left at the requested `^6.x` line — flagged under Concerns
  below for whoever wires up routing.

## TDD evidence

**RED** — `npm test` run before `src/App.jsx` existed:
```
$ npm test
 FAIL  tests/app.test.jsx [ tests/app.test.jsx ]
Error: Failed to resolve import "../src/App" from "tests/app.test.jsx". Does the file exist?
...
 Test Files  1 failed (1)
      Tests  no tests
```
Expected failure: the test imports `App` from `src/App.jsx`, which did not
exist yet at that point (only `vite.config.js`, `tailwind.config.js`,
`postcss.config.js`, `src/index.css`, `src/test/setup.js`, `index.html`,
`netlify.toml`, `.env.example` had been created). This confirms the test
harness (Vitest + jsdom + RTL) was wired up correctly and the test would
genuinely fail without the implementation, not fail for an unrelated
configuration reason.

**GREEN** — after creating `src/App.jsx` and `src/main.jsx`:
```
$ npm test
 ✓ tests/app.test.jsx (1 test) 31ms

 Test Files  1 passed (1)
      Tests  1 passed (1)
```

## Files changed

- `/home/claude/quins-club-hub/package.json`
- `/home/claude/quins-club-hub/package-lock.json`
- `/home/claude/quins-club-hub/vite.config.js`
- `/home/claude/quins-club-hub/tailwind.config.js`
- `/home/claude/quins-club-hub/postcss.config.js`
- `/home/claude/quins-club-hub/index.html`
- `/home/claude/quins-club-hub/src/main.jsx`
- `/home/claude/quins-club-hub/src/App.jsx`
- `/home/claude/quins-club-hub/src/index.css`
- `/home/claude/quins-club-hub/src/test/setup.js`
- `/home/claude/quins-club-hub/tests/app.test.jsx`
- `/home/claude/quins-club-hub/netlify.toml`
- `/home/claude/quins-club-hub/.env.example`

Commit: `f912aa2` — `feat: scaffold Vite React app with Tailwind brand tokens
and Vitest` (on branch `build/v1-mvp`, on top of `77244cb`).

## Self-review findings

- Naming matches the brief's exact token names (`quinsRed`, `quinsGreen`,
  `quinsGreenSoft`, `quinsRedDark`, `quinsBlack`) and exact hex values.
- No overbuilding: did not add a Supabase client module, router setup, PWA
  plugin, ESLint, or Prettier — all explicitly deferred to later tasks per
  the brief/context.
- Test is a real behavioural assertion (renders the actual component tree via
  RTL and checks visible text), not a placeholder `expect(true).toBe(true)`.
- Caught and fixed a real bug during self-verification: my first
  `test:integration` script used `vitest run --include ... --exclude ...`,
  which doesn't exist as a CLI flag in Vitest 2.x (`--include` isn't
  recognized; `--exclude` only *adds* to config excludes rather than
  replacing them, so it couldn't have produced "integration tests only"
  either way). Replaced with a `VITEST_MODE=integration` env var read inside
  `vite.config.js` to switch the `include`/`exclude` arrays, then
  re-verified with a throwaway integration test file that both npm scripts
  actually select the right files (see "What was tested").
- `npm test` and `npm run test:integration` output is pristine — no console
  warnings, no React `act()` warnings, no deprecation noise.
- `npm run build` output is clean.
- Double-checked `.env.example` has no real secret — only the public project
  URL and a placeholder for the anon key.

## Issues or concerns

- `npm audit` reports a moderate `react-router-dom` advisory (open-redirect /
  constructor-injection CVEs affecting the whole 6.x line up to 7.17.0); the
  only fix is jumping to React Router v7, which has a different (data-router)
  API and would be a larger decision than this scaffolding task should make
  unilaterally. Router is installed as a dependency only — nothing in the app
  imports or uses it yet — so there's no live exposure from this commit.
  Flagging for whoever implements routing (per the plan, a later task) to
  decide whether to adopt v7 then or accept the advisory for v6.
- `npm audit` also reports an esbuild moderate advisory scoped to the dev
  server (arbitrary origins can talk to `vite dev`); this is a known
  characteristic of the Vite 5 toolchain the task explicitly locked in, not
  fixable without moving to Vite 6+ (which would break the "Vite 5, not the
  config-file API changes" instruction). Not a production risk since it's
  dev-server only.
- Neither issue blocks this task; both are pre-existing upstream advisories
  in dependency ranges explicitly requested by the task brief/context, not
  code written here.
