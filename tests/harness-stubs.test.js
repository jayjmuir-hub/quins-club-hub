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
  ['harness/stubs/auth.jsx', 'src/lib/auth.jsx'],
  ['harness/stubs/memberships.jsx', 'src/lib/memberships.jsx'],
  ['harness/stubs/events.js', 'src/data/events.js'],
  ['harness/stubs/availability.js', 'src/data/availability.js'],
  ['harness/stubs/players.js', 'src/data/players.js'],
  ['harness/stubs/members.js', 'src/data/members.js'],
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
