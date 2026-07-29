import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

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
        theme_color: '#0c0c0e',
        // Splash-screen background shown while the app loads on first launch.
        // Matches the app's page surface so there's no colour flash before the
        // CSS paints.
        background_color: '#eef0f3',
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
        // Runtime caching for Supabase REST reads (schedule/roster/dashboard data) so a
        // previously-loaded screen still shows its last-seen data when offline. Auth
        // endpoints and mutations (POST/PATCH/DELETE) are intentionally NOT cached —
        // caching a write response or an auth token exchange would be actively harmful.
        runtimeCaching: [
          {
            // NOTE: this urlPattern function is stringified by Workbox and
            // executed inside the built service worker, which does NOT share
            // this config file's module scope — so the Supabase host must be
            // a literal here, not a reference to an outer-scope const (see
            // the file-level comment above for where to update it if the
            // Supabase project ever moves).
            urlPattern: ({ url, request }) =>
              url.hostname === 'lusmshimxdcxpnrktlgz.supabase.co' &&
              url.pathname.startsWith('/rest/v1/') &&
              request.method === 'GET',
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
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.js'],
    include: isIntegration
      ? ['**/*.integration.test.{js,jsx}']
      : ['**/*.test.{js,jsx}'],
    exclude: isIntegration
      ? ['**/node_modules/**', '**/dist/**']
      : ['**/node_modules/**', '**/dist/**', '**/*.integration.test.{js,jsx}'],
  },
})
