// @vitest-environment node
// Nothing in this file touches the DOM, and a jsdom costs ~1.3s to build. The
// measurement and the rule are in vite.config.js.
import { describe, it, expect, beforeAll } from 'vitest'
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

// Press feedback, added 6 Aug 2026 when the club-site comparison showed the
// app had none at all: zero `active:` states across 72 source files.
//
// Asserted against the BUILT css, not the source, for the same reason
// tests/pwa-build.test.js reads dist — the source could be right while
// Tailwind's layer ordering or a purge drops the rule from the output. What
// ships is what matters.
//
// ⚠️ This file needs `npm run build` to have run. It skips loudly rather than
// silently passing if dist is missing, because a test that quietly passes
// when it cannot see its subject is worse than no test.

const DIST = 'dist/assets'
let css = ''

beforeAll(() => {
  if (!existsSync(DIST)) return
  const file = readdirSync(DIST).find((f) => f.endsWith('.css'))
  if (file) css = readFileSync(join(DIST, file), 'utf8')
})

describe('press feedback in the shipped stylesheet', () => {
  it('has a built stylesheet to inspect', () => {
    expect(css.length, 'run `npm run build` first — dist/assets/*.css missing').toBeGreaterThan(1000)
  })

  it('scales buttons down on :active', () => {
    // Minified output drops spaces, so match loosely on the pieces.
    expect(css).toMatch(/button:not\(:disabled\):active/)
    expect(css).toMatch(/scale\(\.97\)|scale\(0\.97\)/)
  })

  it('still transitions colour, not only transform', () => {
    // ⚠️ THE REGRESSION THIS EXISTS TO CATCH. `button:not(:disabled)` outranks
    // a `.transition-colors` utility (0,1,1 vs 0,1,0), so a bare
    // `transition: transform` in the base layer would silently reset
    // transition-property and kill the hover colour fade on every button.
    const rule = css.match(/button:not\(:disabled\)[^{]*\{[^}]*\}/)
    expect(rule, 'base button transition rule not found').toBeTruthy()
    expect(rule[0]).toMatch(/transform/)
    expect(rule[0]).toMatch(/background-color/)
  })

  it('does not move for anyone who asked for reduced motion', () => {
    expect(css).toMatch(/prefers-reduced-motion:\s*reduce/)
    // The override must be inside a reduced-motion block, not just present.
    const blocks = css.match(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{(?:[^{}]*\{[^}]*\})*[^{}]*\}/g) || []
    const joined = blocks.join('')
    expect(joined, 'no reduced-motion block found').not.toBe('')
    expect(joined).toMatch(/transform:\s*none/)
  })

  it('keeps the diagonal on the brand green, not the retired one', () => {
    // rgba(59,208,112) is the OLD green. It survived the palette re-point by
    // one commit because it is written in decimal rgb() and the search was
    // for the hex "3bd070".
    expect(css).not.toMatch(/59\s*,?\s*208\s*,?\s*112/)
    expect(css).toMatch(/42\s*,?\s*157\s*,?\s*85/)
  })
})
