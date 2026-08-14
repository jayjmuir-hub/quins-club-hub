// @vitest-environment node
// Nothing in this file touches the DOM, and a jsdom costs ~1.3s to build. The
// measurement and the rule are in vite.config.js.
import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, sep } from 'node:path'

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

  it('⚠️ ships both radii — 8px for buttons, 11px for surfaces', () => {
    // ⚠️ REPOINTED 10 Aug 2026, NOT DELETED (CLAUDE.md rule 7). This used to
    // say: "expected until the 105 raw buttons are routed through <Button>.
    // When this test starts failing because 11px has gone, the routing is
    // finished — delete it then."
    //
    // That exit condition could never fire. It rested on the published claim
    // that `rounded-[11px]` was a drifting BUTTON radius; re-measurement
    // showed the overwhelming majority of its occurrences are alerts, inputs,
    // panels and cards. 11px is the SURFACE radius and stays forever, so the
    // test would have sat here green and unfalsifiable, reading like a
    // countdown to work that was already done.
    //
    // Both radii are still asserted — they are both real and both load-bearing
    // — but the thing that actually needs guarding moved to the test below.
    expect(css).toMatch(/border-radius:\s*8px/)
    expect(css).toMatch(/border-radius:\s*11px/)
  })
})

describe('the routing stays done', () => {
  // ⚠️ THIS IS THE ANCHOR THE ONE ABOVE WAS PRETENDING TO BE. The failure it
  // guards against is a NEW hand-rolled button appearing — the exact drift
  // that produced 100 bespoke class strings in the first place. It reads the
  // SOURCE, not the stylesheet, because a raw button is a source-level fact.
  //
  // It deliberately does not count anything. Every count this repo has
  // written down rotted, including the ones this file used to carry.

  const SRC = join(process.cwd(), 'src')

  function jsxFiles(dir) {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = join(dir, entry.name)
      return entry.isDirectory() ? jsxFiles(full) : entry.name.endsWith('.jsx') ? [full] : []
    })
  }

  // The signature of an ACTION button: a fill or a hairline border, which is
  // what <Button> exists to own. Layout boxes, pills, tabs, toggles, icon
  // chrome and text links carry none of these and are meant to stay raw —
  // src/components/Button.jsx lists them and says why.
  const ACTION_SIGNATURE = /className="[^"]*(?:bg-brand\b|border-\[1\.5px\]\s+border-line)[^"]*"/

  it('⚠️ no raw <button> carries the action-button signature', () => {
    const offenders = []

    for (const file of jsxFiles(SRC)) {
      if (file.endsWith(`components${sep}Button.jsx`)) continue
      const source = readFileSync(file, 'utf8')

      // Walk each `<button` and read only up to the end of its opening tag,
      // so a styled CHILD cannot be blamed on its parent.
      for (const match of source.matchAll(/<button[\s>]/g)) {
        const tag = source.slice(match.index, source.indexOf('>', match.index) + 1)
        if (ACTION_SIGNATURE.test(tag)) {
          offenders.push(`${file.slice(SRC.length + 1)}: ${tag.slice(0, 120)}`)
        }
      }
    }

    expect(
      offenders,
      `hand-rolled action button(s) found — route these through <Button>:\n${offenders.join('\n')}`,
    ).toEqual([])
  })

  it('⚠️ can actually find one — the check is not vacuous', () => {
    // An empty result has been read as proof of absence in this repo twice,
    // and was wrong both times (CLAUDE.md rule 6). So the detector is pointed
    // at a known-bad string to prove it still fires.
    const planted = '<button type="button" className="rounded-[11px] bg-brand px-4 py-2.5">'
    expect(ACTION_SIGNATURE.test(planted)).toBe(true)
  })
})
