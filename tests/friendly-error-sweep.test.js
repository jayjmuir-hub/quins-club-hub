import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

// Every error a person can read goes through friendlyMessage — item 2 of the
// 2 Sep 2026 UX review. The mapper (src/lib/friendlyError.js) existed since
// 30 Aug and was used in 9 files while 147 sites bypassed it with
// `err.message || 'fallback'`: the `||` only fires on an EMPTY message, so a
// raw PostgREST or "Failed to fetch" string always won over the fallback.
//
// This sweep turns a convention into an invariant. It fails on the two
// shapes that leak raw text:
//   1. `<anything>.message || '…'` / `"…"` / `` `…` `` — the raw-with-fallback shape;
//   2. `{<something named error>.message}` — a bare render with no fallback.
// It does NOT fail on `.message` used as data (regex tests, template strings,
// message maps): those are not shown as-is to a person, and the two patterns
// above are exactly the ones that are.
//
// ⚠️ THE CONTROL IS BELOW. A sweep that has never found anything is not a
// sweep; the second test hands it a known-bad line and demands a hit.

// process.cwd(), not import.meta.url: under the jsdom environment the latter
// is an http:// URL and fileURLToPath refuses it. Vitest runs from the repo
// root, as does CI.
const ROOT = join(process.cwd(), 'src')

// A NON-EMPTY quoted fallback: `x.message || ''` is a regex-test idiom, not copy.
const RAW_WITH_FALLBACK = /\.message\s*\|\|\s*(['"`])(?!\1)/
// A JSX expression, not a `${…}` template hole.
const BARE_RENDER = /(?<!\$)\{\s*[\w$?.]*[eE]rror[\w$?.]*\.message\s*\}/

// The mapper is the one file allowed to spell the shape out.
//
// ⚠️ THE OTHER THREE ARE A TRUCE, NOT A RULING. On 2 Sep 2026 the
// senior-squads-2a session had uncommitted edits on exactly the error lines
// in these files, so the sweep left them alone to avoid a conflict on merge.
// Remove them from this list in the follow-up that converts them; each one
// deleted here must come with the conversion, or the sweep starts lying.
const ALLOW = new Set([
  'lib/friendlyError.js',
  'screens/AdminClub.jsx',
  'screens/Roster.jsx',
  'components/RosterTable.jsx',
])

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.(jsx?|tsx?)$/.test(name)) out.push(full)
  }
  return out
}

function offenders(source, file) {
  const hits = []
  source.split('\n').forEach((line, index) => {
    if (RAW_WITH_FALLBACK.test(line) || BARE_RENDER.test(line)) hits.push(`${file}:${index + 1}: ${line.trim()}`)
  })
  return hits
}

describe('raw error text never reaches the screen', () => {
  it('finds no `.message || "…"` or bare `{error.message}` under src/', () => {
    const hits = []
    for (const full of walk(ROOT)) {
      const file = relative(ROOT, full).replace(/\\/g, '/')
      if (ALLOW.has(file)) continue
      hits.push(...offenders(readFileSync(full, 'utf8'), file))
    }
    expect(hits, hits.join('\n')).toEqual([])
  })

  it('control: would catch both shapes if they came back', () => {
    const bad = [
      "      setError(err.message || 'Could not load.')",
      '          {error.message}',
      '          {saveError?.message}',
    ].join('\n')
    expect(offenders(bad, 'x.jsx')).toHaveLength(3)
    // And leaves data uses alone.
    const fine = [
      "    if (LAST_ADMIN.test(error.message || ''))",
      '          {ageCheck.message}',
      "            {contactError?.message ? ` (${contactError.message})` : ''}",
      "    const friendly = MESSAGES[error.code] ?? error.message ?? FALLBACK",
    ].join('\n')
    expect(offenders(fine, 'y.js')).toHaveLength(0)
  })
})
