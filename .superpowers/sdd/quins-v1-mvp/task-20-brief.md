### Task 20: PWA (installable + offline read)
**Files:** Create `public/manifest.webmanifest`, icons (from the crest), `src/sw-register.js`; add `vite-plugin-pwa` config.
**Interfaces:** Installable to home screen; caches the app shell and last-loaded data for offline read. Icon label "Quins", theme colour `#C21F32`.
- [ ] Test: the built `dist/` contains the manifest and a service worker; the manifest declares name, short_name "Quins", 192px and 512px icons, `display: standalone`, and the theme colour.
- [ ] Implement. Commit.

---

## Icons: already exist, verified, do not regenerate

The brief's "Files" line says "icons (from the crest)" as if they still need creating, but they
were already generated in Task 1's original scaffold commit and are sitting unused in
`public/icons/` right now, already correctly sized and already branded:

- `public/icons/icon-192.png` — 192×192, crest on white, verified via `identify`.
- `public/icons/icon-512.png` — 512×512, crest on white.
- `public/icons/maskable-192.png` / `maskable-512.png` — the crest sits comfortably inside the
  safe-zone circle with red (`#C21F32`) padding around it, the correct pattern for a maskable
  icon (content must stay within the inner ~80% circle so OS icon-masking on Android doesn't
  clip it) — visually confirmed, not just dimension-checked.
- `public/icons/apple-touch-icon.png` — 180×180.
- `public/icons/favicon-32.png` — 32×32.

**Do not regenerate or replace any of these.** Reference them by their existing paths in the
manifest. If you spot an actual defect in one while working (wrong padding, wrong colour), flag
it in your report rather than silently fixing it — these are shared brand assets, not
scaffolding to iterate on freely.

`index.html` already has some of the groundwork from Task 1: `<meta name="theme-color"
content="#C21F32">`, `apple-mobile-web-app-capable`, `apple-mobile-web-app-title` = "Quins",
the favicon and apple-touch-icon `<link>` tags. You're adding the `<link rel="manifest">` tag
and wiring the service worker on top of what's already there — read the current `index.html`
before touching it.

## What's actually new for this task

1. **`vite-plugin-pwa`** — not yet a dependency (checked `package.json` — absent). Install it
   (`npm install -D vite-plugin-pwa`) and add it to `vite.config.js`'s `plugins` array,
   alongside the existing `react()` plugin. This repo's `vite.config.js` also holds the Vitest
   `test` config block in the same file — don't disturb that, just add the PWA plugin to
   `plugins`.

2. **The manifest** — `vite-plugin-pwa`'s `manifest` option generates `dist/manifest.webmanifest`
   at build time from a JS object in your config (you don't hand-write the `.webmanifest` file
   directly — the plugin does, from config). It must declare, matching the brief's test
   bullet exactly:
   - `name`: "Abu Dhabi Harlequins" (the full app name, established branding).
   - `short_name`: **"Quins"** — exact string, this is what a phone home screen shows under
     the icon.
   - `theme_color`: `#C21F32` (`quinsRed`) — matches `index.html`'s existing meta tag; keep
     them consistent, don't let them drift apart.
   - `background_color`: reasonable to set to the app's `--paper` background (`#f5f4f3`) or
     white — used as the splash-screen background while the app loads on first launch. Your
     call on the exact value; document your reasoning.
   - `display`: `"standalone"` (brief requirement — no browser chrome when installed).
   - `icons`: array covering at minimum the 192px and 512px sizes (`public/icons/icon-192.png`,
     `public/icons/icon-512.png`, both `type: "image/png"`, `purpose: "any"`), plus the
     maskable variants with `purpose: "maskable"` (`public/icons/maskable-192.png`/`-512.png`)
     — these already exist and are the correct format for Android's adaptive-icon masking; use
     them rather than reusing the `any`-purpose icons for both roles.
   - `start_url` / `scope`: `/` (the whole app).

3. **`src/sw-register.js`** — a small module that registers the service worker.
   `vite-plugin-pwa` exposes a virtual module (`virtual:pwa-register`) with a `registerSW()`
   helper — this is the standard, supported way to wire registration, not a hand-rolled
   `navigator.serviceWorker.register(...)` call. Import from that virtual module inside
   `src/sw-register.js`, call `registerSW({...})`, and import `./sw-register.js` once from
   `src/main.jsx` (check `src/main.jsx`'s current contents before editing — it's short).
   Handle the plugin's standard callbacks sensibly (e.g. `onNeedRefresh`/`onOfflineReady` — your
   call on whether this build needs a user-facing "update available" prompt or can silently
   auto-update; either is defensible for a v1, but state your choice and why in your report).

4. **Offline read of "last-loaded data"** — the brief's interface line says the service worker
   should cache "the app shell **and** last-loaded data for offline read," not just static
   assets. The app shell (HTML/CSS/JS) is covered automatically by `vite-plugin-pwa`'s default
   precaching. The *data* half means the Supabase REST API responses this app already makes
   (`https://lusmshimxdcxpnrktlgz.supabase.co/rest/v1/...` — schedule/roster/dashboard reads)
   need a **runtime caching** strategy so a previously-loaded screen still shows its last-seen
   data when the device goes offline, rather than an error. Configure `workbox.runtimeCaching`
   in the `VitePWA` plugin options with a rule matching the Supabase REST endpoint (a URL
   pattern, not a hardcoded full string with the project ref baked in twice if you can avoid
   it — though this app's `.env`-supplied Supabase URL IS effectively fixed for this build, so
   matching on `lusmshimxdcxpnrktlgz.supabase.co` directly is acceptable; note this in a
   comment so a future domain change is easy to find) using a `NetworkFirst` strategy (try the
   network, fall back to the last cached response only when offline — this is the right choice
   over `CacheFirst`/`StaleWhileRevalidate` for data that should be fresh whenever a connection
   exists, but must degrade gracefully without one) with a sensible cache name and a short
   expiration (e.g. a day) so stale data doesn't linger indefinitely once connectivity returns.
   Do NOT cache Supabase **auth** endpoints or any mutation (`POST`/`PATCH`/`DELETE`) request —
   scope the runtime-caching rule to GET requests against the REST endpoint only; caching a
   write response, or an auth token exchange, would be actively harmful.

5. **The build-artifact test** ("the built `dist/` contains the manifest and a service
   worker...") — this genuinely means running a real production build and inspecting its
   output, not mocking the plugin config. This project's existing test suite is fast and
   network-free by convention (`npm test` never touches the network — a local build doesn't,
   so this is compatible), but running `vite build` from inside a Vitest test is unusual for
   this codebase; you'll need to decide the cleanest way to do this — e.g. a dedicated test
   file that shells out to `vite build` (via Node's `child_process`) into a temp/throwaway
   output directory before asserting on the files it produced, or checks the plugin's resolved
   config object directly for the manifest fields (name/short_name/icons/display/theme_color)
   as a faster proxy for "the config that WILL produce a correct manifest," while separately
   confirming via a one-time manual `npm run build` + inspecting `dist/manifest.webmanifest`
   and `dist/sw.js` (or whatever the plugin names its output) that the real build genuinely
   produces both files. State clearly in your report which approach you took and why, and
   paste the real `dist/` file listing from an actual `npm run build` run either way, since the
   brief's own wording is explicit that this is about the built output, not just config intent.

## Binding project-wide rulings that still apply

- No native `confirm()` anywhere (n/a for most PWA work, but if you add any user-facing "app
  updated, refresh?" prompt, don't use `confirm()` — use the same in-app alert/toast pattern
  this codebase already has, or keep it silent).
- `--muted` text colour: `#5c5854` on paper/card backgrounds, never `#77726e`, if you add any
  visible UI text for this task (unlikely — this task is mostly config/manifest/service-worker
  plumbing, not a new screen).
- Don't touch anything unrelated — this is a scoped infrastructure task, not an opportunity to
  refactor `index.html` or `main.jsx` beyond what's needed to wire the manifest link and the
  service-worker registration import.

Run `npm test` before you're done and confirm all existing + new tests pass (528 currently,
expect more after this task). Run `npm run build` and confirm it's clean, and manually verify
the real `dist/` output contains what the brief's test bullet asks for.
