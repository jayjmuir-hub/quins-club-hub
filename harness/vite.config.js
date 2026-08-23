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
  // ⚠️ envDir must be the REPO ROOT, because `root` above is harness/ and Vite
  // loads .env relative to `root`. Without this the harness boots to a blank
  // page: src/lib/supabase.js throws "Missing required Supabase env var(s)" at
  // module scope, and more of src/ reaches it directly than the alias list
  // below stubs out. Nothing here ever talks to Supabase — the data modules
  // are all aliased to stubs — the module just refuses to be IMPORTED without
  // the vars present. (7 Aug 2026, found while repointing the two rotted
  // screen imports in main.jsx.)
  envDir: path.resolve(__dirname, '..'),
  plugins: [react()],
  resolve: {
    alias: [
      { find: /^\.\.\/lib\/auth\.jsx$/, replacement: path.resolve(__dirname, 'stubs/auth.jsx') },
      { find: /^\.\.\/data\/attendance\.js$/, replacement: path.resolve(__dirname, 'stubs/attendance.js') },
      { find: /^\.\.\/data\/announcements\.js$/, replacement: path.resolve(__dirname, 'stubs/announcements.js') },
      // The dock's Chat dot (src/lib/useDockBadges.js) — see stubs/messages.js.
      { find: /^\.\.\/data\/messages\.js$/, replacement: path.resolve(__dirname, 'stubs/messages.js') },
      // ⚠️ './auth.jsx' as well as '../lib/auth.jsx', and the difference is
      // not cosmetic. These aliases match SPECIFIER TEXT, so they only catch
      // importers sitting one directory below src/. src/lib/useMyProfile.js
      // (added 6 Aug for the greeting and the masthead account button) lives
      // IN src/lib, so it writes './auth.jsx' and slipped straight past the
      // rule above — pulling in the REAL auth module while AppShell had the
      // stub, i.e. two different React contexts, and every scenario died with
      // "useAuth must be used within an AuthProvider".
      //
      // Specifier-text matching is what makes this harness cheap (it never
      // touches src/), and this is its standing cost: a new importer at a
      // different depth silently escapes. Anchored with ^ and $ so it cannot
      // match stubs/auth.jsx's own imports and recurse.
      { find: /^\.\/auth\.jsx$/, replacement: path.resolve(__dirname, 'stubs/auth.jsx') },
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
      // Roster/PlayerDetail (Task 12) reach Supabase through this one.
      { find: /^\.\.\/data\/players\.js$/, replacement: path.resolve(__dirname, 'stubs/players.js') },
      // PlayerDetail's Parents block and PlayerAvatar's URL signing (4 Aug).
      { find: /^\.\.\/data\/parents\.js$/, replacement: path.resolve(__dirname, 'stubs/parents.js') },
      { find: /^\.\.\/data\/photos\.js$/, replacement: path.resolve(__dirname, 'stubs/photos.js') },
      // RequestAccess (4 Aug) — AppShell imports it, so without this the
      // harness cannot boot at all without Supabase env vars.
      {
        find: /^\.\.\/data\/accessRequests\.js$/,
        replacement: path.resolve(__dirname, 'stubs/accessRequests.js'),
      },
      // Admin (Task 17) reaches Supabase through this one.
      { find: /^\.\.\/data\/members\.js$/, replacement: path.resolve(__dirname, 'stubs/members.js') },
      // The RCM match sheet (12 Aug 2026). MatchSheet.jsx lives in src/screens/,
      // one level below src/, so the specifier text matches the rule shape used
      // by every alias above.
      {
        find: /^\.\.\/data\/matchSheets\.js$/,
        replacement: path.resolve(__dirname, 'stubs/matchSheets.js'),
      },
      // The lineup the match sheet seeds its 22 boxes from (16 Aug 2026).
      // MatchSheet.jsx and Lineup.jsx both live in src/screens/, so the one
      // specifier-text rule covers both.
      {
        find: /^\.\.\/data\/lineups\.js$/,
        replacement: path.resolve(__dirname, 'stubs/lineups.js'),
      },
      // The pitch allocation screen (12 Aug 2026). Allocation.jsx is in
      // src/screens/, one level below src/, so the specifier text matches the
      // same rule shape as every alias above.
      { find: /^\.\.\/data\/pitches\.js$/, replacement: path.resolve(__dirname, 'stubs/pitches.js') },
      {
        find: /^\.\.\/data\/pitchRequests\.js$/,
        replacement: path.resolve(__dirname, 'stubs/pitchRequests.js'),
      },
      // The Squad contacts block on Home (13 Aug 2026). Dashboard.jsx is in
      // src/screens/ and AdminStaff.jsx alongside it, so one rule covers both.
      // ⚠️ Without this the harness does not boot AT ALL — Dashboard is reached
      // by AppShell, and src/data/staff.js imports src/lib/supabase.js at module
      // scope, which throws on import rather than on call.
      { find: /^\.\.\/data\/staff\.js$/, replacement: path.resolve(__dirname, 'stubs/staff.js') },
    ],
  },
  server: {
    port: 5199,
    strictPort: true,
  },
})
