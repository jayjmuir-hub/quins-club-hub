// @vitest-environment node
// Nothing in this file touches the DOM, and a jsdom costs ~1.3s to build. The
// measurement and the rule are in vite.config.js.
import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

// The desktop top-nav treatment, asserted against the BUILT stylesheet.
//
// ⚠️ WHY THE BUILT CSS AND NOT src/index.css — the same reason
// tests/button-sweep.test.js does it. These rules live in `@layer components`,
// and Tailwind tree-shakes that layer against the content files: if `nav-tab`
// ever stops appearing in a scanned source file, the whole block silently
// vanishes from the bundle while index.css still reads perfectly. A test on the
// source would pass on CSS that never shipped.
//
// ⚠️ AND THE MINIFIER REWRITES WHAT YOU AUTHORED. `::before` ships as `:before`
// and `translateX()` as `translate()`. Writing the authored spelling here would
// pass in dev and fail only in production — which is the gap this file closes,
// and which cost a false "NOT FOUND" while this feature was being built.

const DIST = join(process.cwd(), 'dist', 'assets')

let css = ''

beforeAll(() => {
  if (!existsSync(DIST)) return
  const sheets = readdirSync(DIST).filter((f) => f.endsWith('.css'))
  css = sheets.map((f) => readFileSync(join(DIST, f), 'utf8')).join('\n')
})

describe('the top-nav sheen ships', () => {
  it('has a built stylesheet to read at all', () => {
    expect(css.length, 'run `npm run build` first — dist/assets/*.css missing').toBeGreaterThan(1000)
  })

  it('emits the sheen and its keyframes', () => {
    expect(css).toMatch(/\.nav-tab::?before/)
    expect(css).toMatch(/@keyframes nav-sheen/)
    expect(css).toMatch(/animation:\s*nav-sheen/)
  })

  it('⚠️ blends the sheen rather than painting over the active fill', () => {
    // `mix-blend-mode: screen` is the only reason ONE gradient works over both
    // the transparent idle item and the solid red active one. Without it the
    // sheen paints a grey wash across the current page's red fill.
    expect(css).toMatch(/mix-blend-mode:\s*screen/)
  })

  it('⚠️ keeps green OUT of the sheen — it means success everywhere else', () => {
    // Jay's call, 11 Aug 2026: adhjrt.com sweeps red -> white -> green, and
    // green in this app is a success colour. The underline may be red->green
    // (it reuses `brand-rule`, which is decorative); the sheen may not.
    //
    // ⚠️ BOTH SPELLINGS, AND THE HEX-ONLY VERSION OF THIS TEST WAS WRITTEN
    // FIRST AND PASSED WITH GREEN INJECTED. src/index.css already carries the
    // warning that made it obvious in hindsight — the brand green is authored
    // as decimal `rgb()` in the `.harlequin` diagonal, "which is why the
    // re-point's hex search for 3bd070 walked straight past it". A hex-only
    // matcher here is the same mistake in the same file. Caught by injecting
    // the fault, not by review.
    const GREEN = /2a9d55|17a34a|42\s*,?\s*157\s*,?\s*85|23\s*,?\s*163\s*,?\s*74/i
    const sheen = css.match(/\.nav-tab::?before\{[^}]*\}/)?.[0] ?? ''
    expect(sheen, 'no .nav-tab::before rule found').not.toBe('')
    expect(sheen).not.toMatch(GREEN)
    // ...and it IS carrying the brand red, so this cannot pass by emptiness.
    expect(sheen).toMatch(/200\s*,?\s*16\s*,?\s*46|c8102e/i)
    // The matcher must be able to SEE a green when one is present. The
    // underline deliberately has one, so it doubles as the positive control:
    // if this stops matching, the pattern above has stopped working and the
    // negative assertion above it is worth nothing.
    const underline = css.match(/\.nav-tab::?after\{[^}]*\}/)?.[0] ?? ''
    expect(underline, 'no .nav-tab::after rule found').not.toBe('')
    expect(underline, 'the GREEN matcher no longer matches a known green').toMatch(GREEN)
  })

  it('⚠️ never reaches the phone tab bar', () => {
    // `.nav-tab` is on the element at EVERY width — the same element is a
    // bottom-tab-bar cell on a phone. The media query is the only thing
    // keeping a hover sheen off a touch target, so if this ever stops being
    // nested the effect leaks to mobile, where it cannot even be triggered.
    // 820px is `screens.desktop` in tailwind.config.js.
    //
    // ⚠️ THE ADJACENCY IS THE ASSERTION, and the first version of this test
    // did not have it. It read `min-width:\s*820px\)\{[\s\S]*?\.nav-tab\{`,
    // which is unanchored and lazy — Tailwind emits DOZENS of
    // `@media (min-width: 820px)` blocks for the `desktop:` variants, so the
    // pattern matched one of those and then scanned forward to `.nav-tab`
    // anywhere later in the file. It passed with the gate rewritten to
    // `min-width: 1px`, i.e. it would have passed against the exact bug it
    // exists to catch. Minified CSS opens a media block immediately before
    // its first rule, so requiring them to be ADJACENT is what makes this
    // real. Caught by injecting the fault.
    expect(css, '.nav-tab escaped its desktop media query').toMatch(
      /@media\s*\(min-width:\s*820px\)\{\.nav-tab\{position:relative/,
    )
  })

  it('⚠️ gives the current page no underline', () => {
    // It already carries the solid red fill, and a red-to-green rule inside a
    // red box reads as a rendering fault rather than an accent.
    expect(css).toMatch(/aria-current=["']?page["']?\]::?after\{display:none\}/)
  })

  it('⚠️ is switched off for prefers-reduced-motion', () => {
    // The global reduced-motion block drives durations to ~0, which for an
    // ANIMATED sheen means it snaps to its end state and sits there lit. Only
    // removing the element fixes that — the same conclusion `.btn-sweep`
    // reached, and the reason this assertion is separate from that one.
    const blocks = css.match(/@media[^{]*prefers-reduced-motion:\s*reduce[^{]*\{[\s\S]*?\}\s*\}/g) ?? []
    const joined = blocks.join('\n')
    expect(joined, 'no reduced-motion block found').not.toBe('')
    expect(joined).toMatch(/\.nav-tab::?before\{display:none\}/)
  })
})
