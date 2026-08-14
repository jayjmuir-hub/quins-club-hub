// @vitest-environment node
// Nothing in this file touches the DOM, and a jsdom costs ~1.3s to build. The
// measurement and the rule are in vite.config.js.
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function sourceFiles() {
  const out = []
  ;(function walk(d) {
    for (const e of readdirSync(d)) {
      const p = path.join(d, e)
      statSync(p).isDirectory() ? walk(p) : /\.jsx?$/.test(p) && out.push(p)
    }
  })(path.join(projectRoot, 'src'))
  return out
}

// These pin the two rules that the retheme depends on and that CSS will not
// enforce for you — both fail silently in a browser, so only a test catches
// them. See tailwind.config.js for the full reasoning behind each.
describe('theme integrity', () => {
  // Rule 1: no raw colour literals in component class names.
  //
  // The whole point of the token layer is that a future theme change is a
  // config edit, not another 39-file sweep. A single `bg-[#ff0000]` slipping
  // back in is invisible until someone tries to change the theme again.
  it('has no raw hex colours in Tailwind arbitrary values', () => {
    const offenders = []
    for (const f of sourceFiles()) {
      const src = readFileSync(f, 'utf8')
      // Strip comments first: the components carry a lot of prose explaining
      // which old hex a token replaced, and that history is worth keeping.
      const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
      for (const m of code.matchAll(/[a-z][a-z-]*-\[(#[0-9a-fA-F]{3,8})[^\]]*\]/g)) {
        offenders.push(`${path.relative(projectRoot, f)}: ${m[0]}`)
      }
    }
    expect(offenders).toEqual([])
  })

  // Rule 2: font-condensed must always carry a 600 or 700 weight.
  //
  // Only those two cuts of Barlow Condensed are bundled. CSS does not error on
  // a missing weight — it drops to the next family in the stack — so a
  // condensed element left at the default 400 renders in Barlow and nobody
  // notices until they compare screenshots.
  it('never uses font-condensed without a 600/700 weight', () => {
    const offenders = []
    for (const f of sourceFiles()) {
      const src = readFileSync(f, 'utf8')
      const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
      // Inspect each class-name string that mentions font-condensed.
      for (const m of code.matchAll(/(?:className=|`|'|")([^`'"]*font-condensed[^`'"]*)/g)) {
        const cls = m[1]
        if (!/font-(semibold|bold|extrabold)/.test(cls)) {
          offenders.push(`${path.relative(projectRoot, f)}: ${cls.trim().slice(0, 90)}`)
        }
      }
    }
    expect(offenders).toEqual([])
  })

  // Rule 3: the fonts are actually present to be served.
  it('ships the self-hosted font files the CSS references', () => {
    const cssPath = path.join(projectRoot, 'public', 'fonts', 'fonts.css')
    expect(existsSync(cssPath)).toBe(true)
    const css = readFileSync(cssPath, 'utf8')
    const families = new Set(
      [...css.matchAll(/font-family\s*:\s*['"]?([^;'"]+)/g)].map((m) => m[1].trim())
    )
    // One family since 6 Aug 2026 — Anton, Barlow and Barlow Condensed were
    // replaced by Inter to match the club redesign, and all seven of their
    // woff2 files deleted.
    expect(families).toContain('Inter')
    expect(families).not.toContain('Anton')
    expect(families).not.toContain('Barlow')
    expect(families).not.toContain('Barlow Condensed')

    for (const m of css.matchAll(/url\(['"]?\/fonts\/([^)'"]+)/g)) {
      expect(
        existsSync(path.join(projectRoot, 'public', 'fonts', m[1])),
        `fonts.css references /fonts/${m[1]}, which does not exist`
      ).toBe(true)
    }

    // ⚠️ EVERY WEIGHT THE APP CAN ASK FOR MUST HAVE AN @font-face.
    // 900 is the one that matters most and is the easiest to lose: it exists
    // only for .font-display, and if it went missing the browser would
    // synthesise a fake heavy from 400 rather than raise an error — every
    // screen title subtly wrong, nothing in the console.
    for (const w of ['400', '500', '600', '700', '800', '900']) {
      expect(
        new RegExp(`font-weight:\\s*${w};`).test(css),
        `no Inter @font-face at weight ${w}`
      ).toBe(true)
    }
  })

  // Rule 4: the display face must be heavy.
  //
  // ⚠️ THE SINGLE MOST DANGEROUS LINE IN THIS CHANGE. .font-display used to
  // set font-weight: 400, because Anton ships one weight. Inter's 400 is body
  // text. Leaving that line as it was would have turned every screen title,
  // the masthead club name and every stat numeral into regular-weight type —
  // silently, with nothing to catch it but a screenshot.
  it('sets a heavy weight on the display face', () => {
    const css = readFileSync(path.join(projectRoot, 'src', 'index.css'), 'utf8')
    const rule = css.match(/\.font-display[^{]*\{[^}]*\}/)
    expect(rule, '.font-display rule not found').toBeTruthy()
    const weight = rule[0].match(/font-weight:\s*(\d+)/)
    expect(weight, '.font-display sets no font-weight').toBeTruthy()
    expect(Number(weight[1])).toBeGreaterThanOrEqual(800)
  })
})
