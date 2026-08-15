import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { isCacheableRestGet } from './pwa-cache-rules.js'

// Vitest only defaults NODE_ENV to 'test' when NODE_ENV is UNSET. One of the
// two dev PCs (cafnet) has NODE_ENV=production set machine-wide, and the
// failure that causes is loud but deeply misleading: Vite resolves React's
// PRODUCTION build, act() is unavailable, and all 535 React Testing Library
// tests fail with "act(...) is not supported in production builds of React"
// while the pure-JS tests pass. Nothing points at NODE_ENV. (The same variable
// also makes `npm install` silently omit devDependencies — including vitest
// itself — so use `npm install --include=dev` on that machine.)
//
// Test runs are never production builds, so overriding here is safe. Scoped to
// VITEST so `npm run build` still sees the real NODE_ENV.
if (process.env.VITEST && process.env.NODE_ENV === 'production') {
  process.env.NODE_ENV = 'test'
}

// npm test                 -> unit tests only (default), never touches the network
// npm run test:integration -> only *.integration.test.{js,jsx} files
const isIntegration = process.env.VITEST_MODE === 'integration'

// The Supabase project URL is fixed for this build (see .env / src/lib/supabase.js);
// matching on the host directly (see the runtimeCaching urlPattern below) is acceptable
// here, but if the Supabase project ever moves, search this file for
// "lusmshimxdcxpnrktlgz.supabase.co" and update it alongside VITE_SUPABASE_URL.

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // 'autoUpdate' (not 'prompt'): the new service worker calls skipWaiting +
      // clientsClaim and takes over on the next page load, then the page
      // reloads itself.
      //
      // This started as 'prompt' to avoid swapping app code under someone
      // mid-form. In practice that protection was imaginary: 'prompt' only
      // defers to a UI that asks the user, and no such UI was ever built —
      // onNeedRefresh just wrote to the console. The real-world result was
      // that a deploy never reached anyone. Worse, once a deploy changed
      // asset hashes (the retheme + crest), the stale cached build kept
      // requesting files that no longer exist on the CDN, so members saw a
      // BROKEN crest rather than merely an old one, with no way back short of
      // a hard reload or closing every instance of an installed PWA.
      //
      // Reloading someone mid-form is the lesser evil, and is rare: it only
      // happens on the first load after a deploy. If that ever bites, the fix
      // is a real refresh banner wired to updateSW(true) — not going back to
      // a 'prompt' that prompts nobody.
      registerType: 'autoUpdate',
      injectRegister: null,
      manifest: {
        name: 'Abu Dhabi Harlequins',
        short_name: 'Quins',
        description: 'Abu Dhabi Harlequins — Quins Club Hub: schedule, roster & availability.',
        // theme_color tints the mobile browser/OS chrome so it blends into the
        // top of the page. The top of the page is the near-black masthead, so
        // this is chrome (#0c0c0e), not the brand red — a red status bar above
        // a black masthead reads as a rendering bug. Keep in sync with the
        // <meta name="theme-color"> in index.html.
        theme_color: '#0a0a0a',
        // Splash-screen background shown while the app loads on first launch.
        // Matches the app's page surface so there's no colour flash before the
        // CSS paints.
        background_color: '#f3f3f3',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        icons: [
          {
            src: '/icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/icons/maskable-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: '/icons/maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // The flag SVGs behind the phone-number country picker are emitted by
        // the build (flag-icons is a CSS file of ~271 background images) but
        // must NOT be precached: that would make every install download every
        // country's flag, several megabytes of which no user will ever see.
        // They are fetched on demand instead — a picker that needs the network
        // to draw a flag it has never shown before is an acceptable trade,
        // since the field still works and the number still saves offline.
        //
        // ⚠️ og-image.png is here for the SAME reason and it is not an
        // oversight. It is 1200x630 and about 100KB, and NO MEMBER EVER SEES
        // IT — the only thing that fetches it is WhatsApp's link scraper, on
        // its own servers. Precaching it would put 100KB into every install's
        // download for a file that renders on nobody's device.
        globIgnores: ['**/flags/**', '**/assets/*-flag*.svg', '**/og-image.png'],
        // /calendar.ics is a Netlify proxy to the Supabase edge function, not
        // a route in this app. Workbox's navigateFallback answers ANY
        // same-origin navigation it does not recognise with index.html, so
        // without this denylist an installed user opening their own feed URL
        // in the browser gets the app's HTML instead of their calendar --
        // which looks exactly like a broken feed and is untraceable from the
        // server, because the service worker answers before the request ever
        // leaves the device. Calendar clients (Google, Apple) are unaffected
        // either way: they fetch from their own servers, where no service
        // worker exists. This protects the human sanity-checking the link.
        navigateFallbackDenylist: [/^\/calendar\.ics$/],
        // Runtime caching for Supabase REST reads (schedule/roster/dashboard data) so a
        // previously-loaded screen still shows its last-seen data when offline. Auth
        // endpoints and mutations (POST/PATCH/DELETE) are intentionally NOT cached —
        // caching a write response or an auth token exchange would be actively harmful.
        runtimeCaching: [
          {
            // NOTE: this urlPattern function is stringified by Workbox and
            // executed inside the built service worker, which does NOT share
            // this config file's module scope — so the Supabase host must be
            // a literal inside it, not a reference to an outer-scope const
            // (see the file-level comment above for where to update it if the
            // Supabase project ever moves).
            //
            // ⚠️ It is imported rather than written inline ONLY so the tests
            // can exercise it against real urls; Workbox stringifies whatever
            // function it is handed, so the isolation rule is unchanged and
            // the body still references nothing outside itself. The
            // exclusions — and why the club-wide admin reads are not stored on
            // anybody's device — are documented in that file.
            urlPattern: isCacheableRestGet,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'quins-supabase-rest-get',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24, // 1 day — avoid stale data lingering once back online
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      },
    }),
  ],
  base: '/',
  test: {
    // jsdom is the DEFAULT, not the rule. Building one costs ~1.3s per test
    // file, and a third of this suite never touches the DOM — so those files
    // carry `// @vitest-environment node` as their first line and opt out.
    //
    // Measured 14 Aug 2026 across the 33 files that qualify: the `environment`
    // figure in vitest's own duration breakdown went **43.91s to 10ms**, and all
    // 622 of their tests passed either way. ⚠️ **That figure is the check worth
    // repeating** — a docblock that is malformed, or not on the first line, is
    // silently ignored and the file simply keeps running in jsdom and passing.
    // "The tests still pass" proves nothing here; the environment time does.
    //
    // ⚠️ IT DOES NOT MAKE THE WHOLE RUN MUCH FASTER ON A BIG MACHINE, and that
    // is not a disappointment. On 16 cores the wall clock is set by the slowest
    // FILE, not by total CPU, so it stays ~40s. At four workers — the shape of
    // the CI runner — it is ~59s to ~53s. The win is CPU, and CPU only shows up
    // as time when the workers are the bottleneck.
    //
    // ⚠️ ADDING ONE TO A FILE THAT LATER GROWS A DOM ASSERTION FAILS LOUDLY
    // (`document is not defined`), which is the right direction: the fix is to
    // delete the docblock, not to reach for a shim.
    //
    // ✅ **THE `@supabase/supabase-js` / WebSocket TRAP IS RETIRED — 15 Aug 2026.**
    // It used to say a file reaching supabase-js MUST stay in jsdom, because
    // supabase-js needs a global `WebSocket`: jsdom supplies one, and **Node 20,
    // which the workflows pinned, does not** — it became a global in Node 22. So
    // eight files passed locally on Node 24 and failed only in CI, with
    // `Node.js detected but native WebSocket not found`, an error naming nothing
    // to do with the docblock that caused it.
    //
    // **The workflows now pin Node 24**, matching both dev PCs, and those eight
    // run in `node` with the rest. Measured on the move: `environment` across the
    // eight went to **3ms**.
    //
    // ⚠️ **THE CLOSURE STILL MATTERS, AND THAT PART IS NOT RETIRED.** Four of the
    // eight reached supabase-js only transitively, and `tests/session-guard.test.js`
    // reaches it through a DYNAMIC `import(MODULE_PATH)` that no grep for
    // `from '...'` will find. The reason to trace the whole graph before
    // annotating has changed — it is no longer WebSocket — but a file that
    // touches the DOM anywhere in its closure still cannot move.
    //
    // ⚠️ **AND THE REPRODUCTION TECHNIQUE IS WORTH KEEPING even though the bug is
    // gone**: `delete globalThis.WebSocket` at the top of src/test/setup.js turns
    // any dev machine into a Node 20 runner for this purpose. It was used again
    // on the way out — with it, the eight fail with the exact CI error; without
    // it they pass — which is what proves the bump is the thing that fixed them
    // rather than something incidental.
    //
    // ⚠️ **IF CI IS EVER PINNED BACK BELOW NODE 22, THOSE EIGHT BREAK** and the
    // error will not mention Node. That is the rot this note exists to catch.
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.js'],
    // ⚠️ THE FLAKY SUITE WAS THIS NUMBER, AND NOTHING ELSE. Four unrelated test
    // files (admin-dashboard, accounts, player-form, notice-board) each produced
    // a phantom failure in a full run and passed alone, which read as cross-file
    // state and is not.
    //
    // Measured 14 Aug 2026. The heaviest tests in this suite legitimately cost
    // 1.4-2.6s in jsdom — the worst is InviteForm's five-children case, which
    // types five search terms into a picker over a 45-player roster and
    // re-renders the list on every keystroke. Vitest's default testTimeout is
    // 5000ms, so those tests run with a margin of about 2x. Under CPU contention
    // everything slows proportionally and whichever test is nearest the ceiling
    // tips over — so the failing FILE is a function of machine load, not of the
    // file, which is exactly why chasing individual files never converged.
    //
    // Reproduced on demand by oversubscribing the pool (16 logical CPUs, 40
    // forks): 8 runs, 8 failures, all of them "Test timed out in 5000ms", across
    // three files none of which were the four originally blamed. The 2.27s test
    // measured 5.02s under that load — a 2.2x slowdown against a 2.2x margin.
    //
    // 15000ms tolerates ~6.6x. It is deliberately not "as high as possible": a
    // genuinely hung test — see the unmocked-data-module trap in
    // src/test/setup.js, which hangs in CI and not locally — still has to fail
    // in a reasonable time rather than sit there.
    //
    // ⚠️ THIS DOES NOT MAKE A SLOW TEST CORRECT. If a test approaches this
    // ceiling on an idle machine, it is doing too much and the fix is the test.
    testTimeout: 15000,
    include: isIntegration
      ? ['**/*.integration.test.{js,jsx}']
      : ['**/*.test.{js,jsx}'],
    exclude: isIntegration
      ? ['**/node_modules/**', '**/dist/**']
      : ['**/node_modules/**', '**/dist/**', '**/*.integration.test.{js,jsx}'],
  },
})
