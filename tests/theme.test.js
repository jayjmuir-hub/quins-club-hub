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
    expect(families).toContain('Anton')
    expect(families).toContain('Barlow')
    expect(families).toContain('Barlow Condensed')

    for (const m of css.matchAll(/url\(['"]?\/fonts\/([^)'"]+)/g)) {
      expect(
        existsSync(path.join(projectRoot, 'public', 'fonts', m[1])),
        `fonts.css references /fonts/${m[1]}, which does not exist`
      ).toBe(true)
    }

    // Barlow Condensed must be present at both weights rule 2 depends on.
    for (const w of ['600', '700']) {
      expect(
        new RegExp(`font-family:\\s*['"]?Barlow Condensed['"]?[\\s\\S]{0,200}?font-weight:\\s*${w}`).test(css) ||
          new RegExp(`font-weight:\\s*${w}[\\s\\S]{0,200}?font-family:\\s*['"]?Barlow Condensed`).test(css),
        `no Barlow Condensed @font-face at weight ${w}`
      ).toBe(true)
    }
  })
})
