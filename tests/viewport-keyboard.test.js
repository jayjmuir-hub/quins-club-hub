import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

// The phone-keyboard contract, guarded at the file level because jsdom has
// no keyboard, no viewports and no dvh — the same reasoning as
// tests/theme.test.js. Three facts have to hold TOGETHER or the chat
// composer goes back under the keyboard (Jay, 25 Aug 2026, twice — the
// second report arrived AFTER the slack-eater fix, because these two were
// still missing):
//
//   1. index.html opts into interactive-widget=resizes-content — without it
//      Android Chrome only pans the visual viewport and no CSS anywhere can
//      re-flow the layout for the keyboard.
//   2. .min-h-app is dvh with a vh fallback, IN THAT ORDER — vh never
//      shrinks for the keyboard, so dvh must be the winning declaration.
//   3. The app shell actually uses it — a revert to min-h-screen quietly
//      reintroduces the too-tall page.

const read = (p) => fs.readFileSync(path.resolve(__dirname, '..', p), 'utf8')

describe('the keyboard re-flows the layout', () => {
  it('index.html opts into resizes-content', () => {
    const html = read('index.html')
    const meta = html.match(/<meta name="viewport"[^>]*>/)?.[0] ?? ''
    expect(meta).toContain('interactive-widget=resizes-content')
  })

  it('.min-h-app is dvh over a vh fallback, in that order', () => {
    const css = read('src/index.css')
    const rule = css.match(/\.min-h-app\s*\{[^}]*\}/)?.[0] ?? ''
    const vh = rule.indexOf('min-height: 100vh')
    const dvh = rule.indexOf('min-height: 100dvh')
    expect(vh).toBeGreaterThan(-1)
    expect(dvh).toBeGreaterThan(vh)
  })

  it('the shell and the full-height screens use min-h-app, never min-h-screen', () => {
    for (const p of [
      'src/components/AppShell.jsx',
      'src/components/RequireAuth.jsx',
      'src/screens/AcceptInvite.jsx',
      'src/screens/Login.jsx',
      'src/screens/ResetPassword.jsx',
    ]) {
      const source = read(p)
      expect(source, p).toContain('min-h-app')
      // The comment-free test: className strings only. A code comment may
      // still SAY min-h-screen while explaining history.
      const classNames = source.match(/className="[^"]*"/g)?.join(' ') ?? ''
      expect(classNames, p).not.toContain('min-h-screen')
    }
  })
})
