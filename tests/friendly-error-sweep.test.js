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
//   3. `<anything>.message || IDENTIFIER` — the same raw-with-fallback shape
//      with a CONSTANT as the fallback, which the quoted pattern let through
//      (3 Sep 2026: the whole data layer was written this way, and because the
//      wrap dropped the database's code, friendlyMessage() then trusted the
//      raw text — src/lib/dbError.js is the fix, wrapDbError the shape);
//   4. `setError(x.message)` / `setFooError(x.message)` — the raw message
//      handed straight to state, no mapper, no fallback.
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
// `x.message || SOME_CONSTANT` — an identifier fallback. `?? MAP[code]` and
// `|| ''` are not this shape and are left alone.
const RAW_WITH_IDENT = /\.message\s*\|\|\s*[A-Za-z_$][\w$]*/
// `setError(err.message)` and every `set<Something>Error(err.message)`.
const BARE_SET_STATE = /set[A-Za-z]*Error\(\s*[\w$?.]*\.message\s*\)/

// The mapper is the one file allowed to spell the shape out.
//
// ⚠️ THE OTHER THREE ARE A TRUCE, NOT A RULING. On 2 Sep 2026 the
// senior-squads-2a session had uncommitted edits on exactly the error lines
// in these files, so the sweep left them alone to avoid a conflict on merge.
// Remove them from this list in the follow-up that converts them; each one
// deleted here must come with the conversion, or the sweep starts lying.
// ⚠️ THE THREE ROSTER/ADMIN FILES CAME OFF THIS LIST ON 2 Sep 2026, the
// follow-up the UX programme recorded: senior squads (#640) landed, the two
// remaining `error.message ||` renders were converted, and RosterTable had
// already gone through friendlyMessage. Only the helper itself is exempt now.
// ⚠️ ErrorBoundary IS EXEMPT ON PURPOSE (3 Sep 2026). The crash screen is the
// one place the raw message IS the point: it is the string Jay pastes into a
// report and the same string Sentry receives, and friendlyMessage() would
// replace a stack-derived message with "Something went wrong" — exactly the
// information loss that screen exists to avoid.
const ALLOW = new Set([
  'lib/friendlyError.js',
  'components/ErrorBoundary.jsx',
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
    if (RAW_WITH_FALLBACK.test(line) || BARE_RENDER.test(line) || RAW_WITH_IDENT.test(line) || BARE_SET_STATE.test(line)) {
      hits.push(`${file}:${index + 1}: ${line.trim()}`)
    }
  })
  return hits
}

describe('raw error text never reaches the screen', () => {
  it('finds none of the four shapes under src/', () => {
    const hits = []
    for (const full of walk(ROOT)) {
      const file = relative(ROOT, full).replace(/\\/g, '/')
      if (ALLOW.has(file)) continue
      hits.push(...offenders(readFileSync(full, 'utf8'), file))
    }
    expect(hits, hits.join('\n')).toEqual([])
  })

  it('control: would catch all four shapes if they came back', () => {
    const bad = [
      "      setError(err.message || 'Could not load.')",
      '          {error.message}',
      '          {saveError?.message}',
      '  if (error) throw new Error(error.message || REFUSED)',
      '    mapError: (error) => new Error(error.message || REFUSED_PERMISSION),',
      '      setError(err.message)',
      '      setHeadError(failure?.message)',
    ].join('\n')
    expect(offenders(bad, 'x.jsx')).toHaveLength(7)
    // And leaves data uses alone.
    const fine = [
      "    if (LAST_ADMIN.test(error.message || ''))",
      '          {ageCheck.message}',
      "            {contactError?.message ? ` (${contactError.message})` : ''}",
      "    const friendly = MESSAGES[error.code] ?? error.message ?? FALLBACK",
      '  if (error) throw wrapDbError(error, REFUSED)',
      "      setError(friendlyMessage(err, 'Could not load.'))",
      "      setError(err.message || '')",
    ].join('\n')
    expect(offenders(fine, 'y.js')).toHaveLength(0)
  })
})
