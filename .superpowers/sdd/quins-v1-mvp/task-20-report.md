# Task 20 report — PWA (installable + offline read)

## Summary

Added `vite-plugin-pwa` and configured it to generate a web app manifest and
service worker at build time, wired service-worker registration through the
plugin's `virtual:pwa-register` module, and added Workbox runtime caching for
Supabase REST GET requests so previously-loaded schedule/roster/dashboard data
still renders when the device is offline.

## Files touched

- `package.json` / `package-lock.json` — added `vite-plugin-pwa` (^1.3.0) as a
  dev dependency.
- `vite.config.js` — added the `VitePWA` plugin to the existing `plugins`
  array (the Vitest `test` block is untouched), with `manifest` and
  `workbox.runtimeCaching` options.
- `src/sw-register.js` — new. Registers the service worker via
  `virtual:pwa-register`'s `registerSW()`.
- `src/main.jsx` — one new line: `import './sw-register.js'`.
- `index.html` — **not changed** in the end (see "manifest link" note below).
- `tests/pwa-build.test.js` — new. Shells out to a real `vite build` and
  asserts on the produced `dist/` output.

Icons were not touched, per the brief — referenced by their existing paths
only. No defects spotted in them while working with them.

## Manifest field values chosen

- `name`: "Abu Dhabi Harlequins", `short_name`: "Quins" — exact strings from
  the brief.
- `theme_color`: `#C21F32` — matches `index.html`'s existing
  `<meta name="theme-color">`, kept in sync deliberately (both are literals;
  if one is ever changed the other needs a matching edit — there's no single
  source of truth here yet, which is fine for a v1 but worth flagging for a
  later "theme tokens in one place" pass).
- `background_color`: `#f5f4f3` — the app's `--paper` background colour, so
  the OS splash screen shown before the SPA paints doesn't flash a jarring
  colour against the eventual UI. Reasonable alternative would have been
  white; `--paper` felt closer to the actual first-paint background.
- `display`: `"standalone"` — per brief.
- `start_url` / `scope`: `/` — whole app, single origin, no sub-scoping
  needed.
- `icons`: four entries — `icon-192.png`/`icon-512.png` as `purpose: "any"`,
  `maskable-192.png`/`maskable-512.png` as `purpose: "maskable"`. Confirmed in
  the built manifest that the maskable variants are used only for the
  maskable role, not reused for `any`.
- `description`: added one line (not required by the brief, but Chrome/Edge
  install prompts show it, so it's a small, safe addition — "Abu Dhabi
  Harlequins — Quins Club Hub: schedule, roster & availability.").

## Service worker registration

`src/sw-register.js` imports `registerSW` from `virtual:pwa-register` and
calls it with `onNeedRefresh`/`onOfflineReady` callbacks that currently just
`console.info`. Chose `registerType: 'prompt'` (not `'autoUpdate'`) over
silent auto-update: this app has forms (event/player editing) and a session
mid-update swap of app code is exactly the kind of thing that could surprise
a user filling something in. `'prompt'` means the new service worker waits in
`waiting` state until something calls `updateSW(true)`, rather than taking
over automatically.

For v1 I deliberately did **not** build a bespoke "update available" toast —
`updateSW` is exported from `sw-register.js` so a future task can wire it
into the existing alert/toast UI once there's a natural place for it. No
`confirm()` is used anywhere in this change, consistent with the binding
ruling.

## Runtime caching (offline data reads)

`workbox.runtimeCaching` has one rule:

- `urlPattern`: a function checking `url.hostname === 'lusmshimxdcxpnrktlgz.supabase.co'`,
  `url.pathname.startsWith('/rest/v1/')`, and `request.method === 'GET'`.
- `handler: 'NetworkFirst'` — always prefers a live network response; falls
  back to the cache only when the network request fails (i.e. offline).
- `cacheName: 'quins-supabase-rest-get'`.
- `expiration`: `maxEntries: 100`, `maxAgeSeconds: 86400` (1 day) — short
  enough that stale data doesn't linger once connectivity returns, generous
  enough to cover a full day's dashboard/schedule/roster reads.
- `cacheableResponse.statuses: [0, 200]` — the Workbox-recommended pairing so
  opaque/successful responses are cached, not error responses.

This rule matches GET only, so Supabase Auth endpoints (`/auth/v1/...`) and
any POST/PATCH/DELETE mutation against `/rest/v1/...` are never cached —
confirmed by reading the generated `dist/sw.js` and by the new test's
assertions.

**Bug caught and fixed during this task:** my first draft of the
`urlPattern` function referenced a module-level `const SUPABASE_HOST = '...'`
declared earlier in `vite.config.js`, for readability. Workbox stringifies
`urlPattern` functions and re-executes them *inside the built service
worker*, which does not share `vite.config.js`'s module scope — so
`SUPABASE_HOST` would have been `undefined` at runtime, throwing
`ReferenceError: SUPABASE_HOST is not defined` on every fetch the service
worker intercepted (in dev this wouldn't show up in a config check, only in
the real generated `dist/sw.js`, which is exactly why the brief insisted on
testing the actual build output rather than the plugin config object). Fixed
by inlining the hostname as a string literal directly inside the function,
with a comment explaining why. This is exactly the kind of thing item 5's
"config vs. build output" distinction was warning about, and the fix is
confirmed by `grep`-ing the built `dist/sw.js` for the literal hostname.

## Manifest `<link>` tag — index.html ended up unchanged

The brief expected a manual `<link rel="manifest" href="...">` addition to
`index.html`. I added one, then discovered by building and inspecting
`dist/index.html` that `vite-plugin-pwa` auto-injects its own
`<link rel="manifest">` tag into the HTML (both at `vite build` and `vite`
dev-server time) whenever a `manifest` config is supplied — this is default,
undocumented-in-the-brief plugin behaviour. With my manual tag present, the
built `dist/index.html` had **two** identical manifest `<link>` tags. Rather
than leave a harmless-but-untidy duplicate, I removed my manual addition;
`index.html` is therefore unchanged from before this task, and the manifest
link comes entirely from the plugin at build/serve time. Confirmed via a
clean rebuild that exactly one `<link rel="manifest">` appears in
`dist/index.html`.

## Build-artifact test approach (item 5)

Chose: **a dedicated test file (`tests/pwa-build.test.js`) that shells out to
a real `vite build`** via `node:child_process`'s `execFileSync`, into a
disposable `mkdtemp` output directory, then asserts on the files it actually
produced (`manifest.webmanifest` exists and parses with the right
name/short_name/display/theme_color/icons; `sw.js` exists and its source
contains the precache call, the Supabase host, `rest/v1`, `NetworkFirst`, and
the cache name).

Reasoning: the brief is explicit that this test is about the *built output*,
not the plugin config object — and this task's own development caught a real
bug (the `SUPABASE_HOST` scoping issue above) that a config-only test would
have missed entirely, since the config object looked completely correct;
only the generated `sw.js` revealed the problem. A real `vite build` reads
only the local filesystem and already-present `.env` values — no network
call — so it's compatible with this codebase's "tests never touch the
network" convention, even though shelling out to a full production build from
inside Vitest is unusual for this codebase. It costs ~6s of the ~38s total
suite time, which I judged acceptable for a test that guards against a whole
class of "looks right in config, wrong in output" bugs; I did not push it
into the integration-only lane (`test:integration`) since the brief's
acceptance bullet needs to run under plain `npm test`.

I additionally ran a manual `npm run build` (not just via the test) and
inspected `dist/` directly, as belt-and-braces, before writing the test.

### Real `dist/` file listing (from `npm run build`)

```
dist/assets/crest-BPS7q37W.png
dist/assets/index-Bzkb_BGS.js
dist/assets/index-C6wT_zpK.css
dist/assets/workbox-window.prod.es5-BqEJf4Xk.js
dist/icons/apple-touch-icon.png
dist/icons/favicon-32.png
dist/icons/icon-192.png
dist/icons/icon-512.png
dist/icons/maskable-192.png
dist/icons/maskable-512.png
dist/index.html
dist/manifest.webmanifest
dist/sw.js
dist/workbox-7c24d614.js
```

Build log:

```
vite v5.4.21 building for production...
transforming...
✓ 115 modules transformed.
rendering chunks...
computing gzip size...
dist/manifest.webmanifest                          0.62 kB
dist/index.html                                    0.88 kB │ gzip:   0.43 kB
dist/assets/crest-BPS7q37W.png                   148.21 kB
dist/assets/index-C6wT_zpK.css                    28.56 kB │ gzip:   6.16 kB
dist/assets/workbox-window.prod.es5-BqEJf4Xk.js    5.71 kB │ gzip:   2.34 kB
dist/assets/index-Bzkb_BGS.js                    480.14 kB │ gzip: 134.17 kB
✓ built in 2.69s

PWA v1.3.0
mode      generateSW
precache  9 entries (503.28 KiB)
files generated
  dist/sw.js
  dist/workbox-7c24d614.js
```

### `dist/manifest.webmanifest` contents

```json
{"name":"Abu Dhabi Harlequins","short_name":"Quins","description":"Abu Dhabi Harlequins — Quins Club Hub: schedule, roster & availability.","start_url":"/","display":"standalone","background_color":"#f5f4f3","theme_color":"#C21F32","lang":"en","scope":"/","icons":[{"src":"/icons/icon-192.png","sizes":"192x192","type":"image/png","purpose":"any"},{"src":"/icons/icon-512.png","sizes":"512x512","type":"image/png","purpose":"any"},{"src":"/icons/maskable-192.png","sizes":"192x192","type":"image/png","purpose":"maskable"},{"src":"/icons/maskable-512.png","sizes":"512x512","type":"image/png","purpose":"maskable"}]}
```

All required fields present: `name`, `short_name` = "Quins", 192px and 512px
icons (both `any` and `maskable` purposes), `display: "standalone"`,
`theme_color: "#C21F32"`.

## Test results

- Before this task: 528 tests passing (22 files).
- After this task: **535 tests passing (23 files)** — 7 new tests in
  `tests/pwa-build.test.js`, all existing 528 still green, no regressions.
- `npm run build` is clean (no warnings beyond the normal Vite chunk-size
  note, which didn't appear this run).

## Self-review against binding rulings

- **No native `confirm()`**: confirmed absent from `src/sw-register.js` and
  every other file touched — the update path only logs to console for now.
- **`--muted` text colour**: not applicable — this task added no visible UI
  text/screens.
- **Scoped infrastructure task**: `index.html` ended up byte-identical to
  before (see manifest-link note above); `main.jsx` has exactly one new
  import line; no unrelated files touched.

## Concerns / follow-ups for later tasks

1. `theme_color` is duplicated as a literal in both `index.html`'s `<meta>`
   tag and `vite.config.js`'s manifest config — no single source of truth.
   Low risk (rarely changes) but worth a comment or shared constant if the
   brand colour ever needs to move.
2. The "update available" UX is currently silent (console-only). Fine for
   v1beta/committee trial per this task's judgment call, but before wider
   rollout it likely deserves a small in-app toast using the existing
   alert/toast pattern, wired to the exported `updateSW` function.
3. Runtime-caching only covers `GET /rest/v1/...` on the Supabase REST API.
   If a later task adds Supabase Storage or Realtime usage that should also
   work offline-read, that would need its own `runtimeCaching` rule — out of
   scope here.
