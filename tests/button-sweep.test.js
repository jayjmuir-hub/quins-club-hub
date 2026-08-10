import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

// The Sweep treatment, asserted against the BUILT stylesheet.
//
// ⚠️ WHY THE BUILT CSS AND NOT THE SOURCE — the same reason
// tests/press-feedback.test.js does it. This rule lives in `@layer components`
// in src/index.css and is only real if Tailwind emits it. A test reading
// index.css would pass on a rule that never shipped: purged, mis-layered, or
// dropped by a config change nobody connected to buttons.
//
// ⚠️ AND THE ONE THAT MATTERS IS `z-index: -1` + `isolation`. The sweep passes
// UNDER the label; without its own stacking context it disappears behind the
// button's background instead, which looks exactly like "the animation didn't
// work" and gets debugged as a timing problem.

const DIST = join(process.cwd(), 'dist', 'assets')

let css = ''

beforeAll(() => {
  if (!existsSync(DIST)) return
  const sheets = readdirSync(DIST).filter((f) => f.endsWith('.css'))
  css = sheets.map((f) => readFileSync(join(DIST, f), 'utf8')).join('\n')
})

describe('the sweep ships', () => {
  it('has a built stylesheet to read at all', () => {
    expect(css.length, 'run `npm run build` first — dist/assets/*.css missing').toBeGreaterThan(1000)
  })

  it('emits the sweep pseudo-element', () => {
    expect(css).toMatch(/\.btn-sweep/)
    // ⚠️ `translateX(…)` MINIFIES TO `translate(…)`. Matching the authored
    // spelling would pass in dev and fail only in the production build —
    // exactly the gap this file exists to close.
    expect(css).toMatch(/translate(X)?\(-130%\)/)
    expect(css).toMatch(/translate(X)?\(130%\)/)
  })

  it('⚠️ keeps the sweep behind the label, in its own stacking context', () => {
    // Both halves, because either alone is broken: z-index:-1 without
    // `isolation` escapes behind the button entirely.
    expect(css).toMatch(/isolation:\s*isolate/)
    expect(css).toMatch(/z-index:\s*-1/)
  })

  it('blooms in the brand red rather than a generic shadow', () => {
    // 200 16 46 is #c8102e. A grey drop shadow here would read as a generic
    // material button and lose the only thing tying it to the club.
    expect(css).toMatch(/200\s*,?\s*16\s*,?\s*46/)
  })

  it('⚠️ does not sweep a disabled button', () => {
    // A disabled button that still lights up on hover reads as working, and is
    // how a saving button gets tapped four times.
    expect(css).toMatch(/\.btn-sweep:disabled::?after/)
  })

  it('⚠️ is switched off for prefers-reduced-motion', () => {
    const blocks = css.match(/@media[^{]*prefers-reduced-motion:\s*reduce[^{]*\{[\s\S]*?\}\s*\}/g) ?? []
    const joined = blocks.join('\n')
    expect(joined, 'no reduced-motion block found').not.toBe('')
    expect(joined).toMatch(/\.btn-sweep/)
  })

  it('⚠️ the radius token moved to 8px — and the old value is still everywhere', () => {
    // Not a style assertion: a RECEIPT. `rounded-btn` is the token and it is
    // used twice, while the identical literal `rounded-[11px]` appears 117
    // times because the shared component was never adopted. Both radii are in
    // the built sheet today, and that is expected until the 105 raw buttons
    // are routed through <Button>. When this test starts failing because 11px
    // has gone, the routing is finished — delete it then.
    expect(css).toMatch(/border-radius:\s*8px/)
    expect(css).toMatch(/border-radius:\s*11px/)
  })
})
