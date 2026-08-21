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

describe('the top-nav sheen is retired', () => {
  // ⚠️ REPOINTED, NOT DELETED — phase 5 of the 2.0 retheme (21 Aug 2026).
  // This file used to pin that the desktop pill sheen SHIPPED: the
  // mix-blend-mode, the keyframes, the media-query adjacency, the
  // reduced-motion switch-off — each assertion built by injecting its fault.
  // Phase 2 moved desktop nav into the Sidebar, no element carries
  // `.nav-tab` at any width, and phase 5 removed the block (tombstone in
  // src/index.css). What this anchor now pins is the ABSENCE: if the sheen
  // CSS creeps back into the bundle without a consumer, or a consumer
  // reappears without a decision, this is the alarm. The built-CSS reading
  // mechanics are unchanged — a source-only check would pass against CSS
  // that never shipped, in either direction.

  it('has a built stylesheet to read at all', () => {
    expect(css.length, 'run `npm run build` first — dist/assets/*.css missing').toBeGreaterThan(1000)
  })

  it('emits NO nav-tab rules and NO nav-sheen keyframes', () => {
    expect(css).not.toMatch(/\.nav-tab/)
    expect(css).not.toMatch(/@keyframes nav-sheen/)
  })

  it('control: the matcher can still see rules that DO ship', () => {
    // A negative search is only evidence if the same probe finds a known
    // positive — the rule this repo has been burned by twice. brand-rule is
    // the sheen block's surviving neighbour in the same @layer.
    expect(css).toMatch(/\.brand-rule/)
  })
})
