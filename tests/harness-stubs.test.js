import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Guard against harness stub drift.
//
// harness/vite.config.js aliases a handful of src/ modules to fixture stubs in
// harness/stubs/, and harness/main.jsx statically imports EVERY screen into one
// bundle. So when a real module gains an export and its stub does not, the
// failure is not "the new scenario is wrong" — it is an unresolved named import,
// which blanks every scenario in the harness at once. That has now happened
// twice: players.js/insertPlayers during the Overview build, and
// members.js/listPendingProfiles + grantMembership during this plan's Task B/C,
// where the stub was left behind and every pre-existing scenario went dark.
//
// The check is deliberately source-text based rather than a dynamic import:
// these are JSX/browser modules (they read window.location, import .jsx), and
// importing them under jsdom to reflect over their exports would test the
// import machinery more than the mirror. Parsing `export function|const|...`
// covers every export form actually used in these files — the assertion below
// pins that, so an unusual export form (export {x}, export default) fails
// loudly here rather than being silently skipped.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// Derived from harness/vite.config.js's alias list. If an alias is added there
// without a line here the new stub simply is not checked, so the aliased-module
// count is asserted too.
const ALIASES = [
  // The Squad Hub pair, added 21 Aug 2026 with the dark-mode repro scenario.
  ['harness/stubs/attendance.js', 'src/data/attendance.js'],
  ['harness/stubs/announcements.js', 'src/data/announcements.js'],
  ['harness/stubs/messages.js', 'src/data/messages.js'],
  ['harness/stubs/auth.jsx', 'src/lib/auth.jsx'],
  // auth.jsx is aliased TWICE, from two different specifier texts — these
  // rules match the import string, not the resolved file, so '../lib/auth.jsx'
  // (importers in src/screens, src/components) and './auth.jsx' (importers
  // inside src/lib itself, e.g. useMyProfile.js) each need their own rule.
  // Listed twice so the count below stays honest; the export-mirror check
  // simply runs against the same pair a second time, which is harmless.
  ['harness/stubs/auth.jsx', 'src/lib/auth.jsx'],
  ['harness/stubs/memberships.jsx', 'src/lib/memberships.jsx'],
  ['harness/stubs/events.js', 'src/data/events.js'],
  ['harness/stubs/availability.js', 'src/data/availability.js'],
  ['harness/stubs/players.js', 'src/data/players.js'],
  ['harness/stubs/members.js', 'src/data/members.js'],
  ['harness/stubs/parents.js', 'src/data/parents.js'],
  ['harness/stubs/photos.js', 'src/data/photos.js'],
  ['harness/stubs/accessRequests.js', 'src/data/accessRequests.js'],
  // The RCM match sheet's `match-sheet` scenario, 12 Aug 2026.
  //
  // ⚠️ THE COUNT ASSERTION ABOVE IS WHAT CAUGHT THIS, exactly as its own
  // comment promised it would: the alias was added to harness/vite.config.js
  // and this list was not, and the suite went red on 11 vs 10 before anybody
  // had to notice. That is the third time this guard has earned its keep.
  ['harness/stubs/matchSheets.js', 'src/data/matchSheets.js'],
  // The pitch allocation screen, 12 Aug 2026.
  ['harness/stubs/pitches.js', 'src/data/pitches.js'],
  ['harness/stubs/pitchRequests.js', 'src/data/pitchRequests.js'],
  // The Squad contacts block on Home, 13 Aug 2026.
  //
  // ⚠️ AND THE COUNT ASSERTION CAUGHT IT AGAIN — 14 vs 13, on the fourth
  // occasion this guard has earned its keep. Worth recording because the
  // failure mode it prevents got WORSE with this alias: src/data/staff.js is
  // imported by Dashboard, which AppShell reaches, so a missing stub does not
  // blank one scenario — it stops the harness booting at all, with a module-
  // scope throw from src/lib/supabase.js rather than an unresolved import.
  ['harness/stubs/staff.js', 'src/data/staff.js'],
  // The lineup the RCM match sheet seeds its 22 boxes from, 16 Aug 2026.
  //
  // ⚠️ FIFTH TIME, AND THE COUNT ASSERTION CAUGHT IT AGAIN — 15 vs 14. The
  // pattern is now unmistakable: every single alias added to
  // harness/vite.config.js since this guard was written has been added without
  // this list, and every one of them has been caught here rather than by
  // somebody opening the harness and finding it blank.
  ['harness/stubs/lineups.js', 'src/data/lineups.js'],
  // The DM thread's late-signing photos (25 Aug 2026, the dm-thread scenario).
  ['harness/stubs/chatMedia.js', 'src/data/chatMedia.js'],
]

function read(relative) {
  return fs.readFileSync(path.join(ROOT, relative), 'utf8')
}

function namedExports(source) {
  const names = new Set()
  const pattern = /^export\s+(?:async\s+)?(?:function|const|let|var|class)\s+([A-Za-z0-9_$]+)/gm
  let match
  while ((match = pattern.exec(source)) !== null) names.add(match[1])
  return names
}

describe('harness stubs mirror the modules they replace', () => {
  it('checks every alias declared in harness/vite.config.js', () => {
    const config = read('harness/vite.config.js')
    const aliasCount = (config.match(/replacement: path\.resolve\(/g) ?? []).length
    expect(aliasCount).toBe(ALIASES.length)
  })

  it.each(ALIASES)('%s exports everything %s does', (stubPath, realPath) => {
    const stub = namedExports(read(stubPath))
    const real = namedExports(read(realPath))

    const missing = [...real].filter((name) => !stub.has(name)).sort()
    expect(missing).toEqual([])
  })

  it.each(ALIASES)('%s and %s use only parseable export forms', (stubPath, realPath) => {
    // `export { … }` and `export default` would slip past namedExports above
    // and make the mirror check quietly incomplete.
    ;[stubPath, realPath].forEach((file) => {
      const source = read(file)
      expect(source).not.toMatch(/^export\s*\{/m)
      expect(source).not.toMatch(/^export\s+default\b/m)
    })
  })
})
