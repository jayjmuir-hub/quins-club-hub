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
      registerType: 'prompt',
      injectRegister: null,
      manifest: {
        name: 'Abu Dhabi Harlequins',
        short_name: 'Quins',
        description: 'Abu Dhabi Harlequins — Quins Club Hub: schedule, roster & availability.',
        theme_color: '#C21F32',
        // Splash-screen background shown while the app loads on first launch.
        // Matches the app's --paper background so there's no colour flash
        // before the CSS paints.
        background_color: '#f5f4f3',
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
