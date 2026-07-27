import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Throwaway harness config, sibling to the repo's real vite.config.js.
// root is this harness/ directory so it serves harness/index.html instead
// of the real app's index.html; postcss.config.js and tailwind.config.js at
// the repo root are still discovered normally since we run `vite` from the
// repo root (cwd), so Tailwind's real generated CSS applies to the real
// components exactly as it would in the actual app.
//
// The only things swapped out are the two data-layer modules that would
// otherwise reach out to Supabase: src/lib/auth.jsx and
// src/lib/memberships.jsx. AppShell.jsx and Login.jsx both import them via
// the literal relative specifier '../lib/auth.jsx' / '../lib/memberships.jsx'
// (both files sit one directory below src/), so aliasing that exact
// specifier text redirects both call sites to the harness stubs without
// touching src/ at all.
export default defineConfig({
  root: __dirname,
  plugins: [react()],
  resolve: {
    alias: [
      { find: /^\.\.\/lib\/auth\.jsx$/, replacement: path.resolve(__dirname, 'stubs/auth.jsx') },
      {
        find: /^\.\.\/lib\/memberships\.jsx$/,
        replacement: path.resolve(__dirname, 'stubs/memberships.jsx'),
      },
      // Same trick for the two data modules Schedule/EventDetail reach
      // Supabase through. Both screens live in src/screens/, one level below
      // src/, so the specifier text is identical from both call sites.
      { find: /^\.\.\/data\/events\.js$/, replacement: path.resolve(__dirname, 'stubs/events.js') },
      {
        find: /^\.\.\/data\/availability\.js$/,
        replacement: path.resolve(__dirname, 'stubs/availability.js'),
      },
    ],
  },
  server: {
    port: 5199,
    strictPort: true,
  },
})
