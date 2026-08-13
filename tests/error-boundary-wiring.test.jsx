import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => readFileSync(resolve(root, p), 'utf8')

// ⚠️ THIS FILE EXISTS BECAUSE tests/error-boundary.test.jsx CANNOT FAIL FOR
// THE REASON THAT MATTERS.
//
// That file renders <ErrorBoundary> directly and proves the component works.
// It stays perfectly green if nothing in the app ever renders one — which is
// exactly the state src/ was in before 13 Aug 2026, and the state a careless
// refactor would put it back in. A component nobody mounts prevents nothing.
//
// So these are SOURCE assertions on the two call sites, deliberately, and they
// are the discriminating half of this feature's coverage. They are cheap and
// blunt on purpose: delete either boundary and this goes red immediately, with
// a message naming which one.
//
// ⚠️ WHY NOT RENDER <App/> AND THROW SOMETHING INSTEAD. Because App mounts
// BrowserRouter, RequireAuth, MembershipProvider and the real Supabase client
// behind them; making a specific screen throw inside all of that needs so much
// mocking that the test ends up proving the mocks work. The same reasoning
// tests/page-header-wrap.test.js gives for pinning a class token in source
// rather than measuring a rendered width in jsdom.
//
// ⚠️ THE HONEST LIMITATION, STATED SO NOBODY OVER-READS A GREEN RUN: these
// prove the boundaries are WIRED, not that they CATCH. The catching is proved
// by the sibling file, and the two together are the claim. Neither alone is.

describe('error boundary wiring — the part a component test cannot prove', () => {
  it('AppShell wraps the routed screen, not the whole shell', () => {
    const src = read('src/components/AppShell.jsx')

    expect(src, 'AppShell must import ErrorBoundary').toMatch(
      /import ErrorBoundary from '\.\/ErrorBoundary\.jsx'/,
    )

    // ⚠️ THE EXACT SHAPE MATTERS. `<ErrorBoundary key={...}>{children}</ErrorBoundary>`
    // keeps the masthead and nav OUTSIDE the boundary, which is what lets a
    // parent whose Roster crashed still tap through to Schedule. A boundary
    // around the whole shell would take the navigation down with the screen.
    expect(
      src,
      'AppShell must wrap {children} — and only {children} — in an ErrorBoundary',
    ).toMatch(/<ErrorBoundary[^>]*>\{children\}<\/ErrorBoundary>/)
  })

  it('AppShell keys the boundary on the pathname, or a crashed screen never clears', () => {
    const src = read('src/components/AppShell.jsx')

    // ⚠️ THIS IS THE ASSERTION MOST LIKELY TO BE "TIDIED" AWAY, because the key
    // looks decorative. It is not. A boundary holds its error state until
    // something clears it, so without this a crashed Roster stays on the
    // fallback while the person taps Schedule — nav working, content
    // permanently broken, which reads as deliberate and is worse than the
    // blank page this whole feature replaced.
    expect(
      src,
      'the AppShell boundary must be keyed on location.pathname so navigating recovers',
    ).toMatch(/<ErrorBoundary\s+key=\{location\.pathname\}>/)
  })

  it('App wraps every route, including the four public ones AppShell never sees', () => {
    const src = read('src/App.jsx')

    expect(src, 'App must import ErrorBoundary').toMatch(
      /import ErrorBoundary from '\.\/components\/ErrorBoundary\.jsx'/,
    )

    // ⚠️ NOT redundant with AppShell's. /privacy, /delete-account,
    // /reset-password and /auth/confirm render OUTSIDE any AppShell, and the
    // first two are linked from the Play Store listing and opened cold by a
    // reviewer. A white page there is a rejected app.
    expect(src, 'App must wrap <Routes> in an ErrorBoundary').toMatch(
      /<ErrorBoundary>[\s\S]*<Routes>/,
    )
    expect(src).toMatch(/<\/Routes>[\s\S]*<\/ErrorBoundary>/)
  })

  it('the public routes really are outside AppShell — the premise of the test above', () => {
    // ⚠️ A CONTROL. The claim "App's boundary is not redundant" rests entirely
    // on some routes rendering outside AppShell. If someone later wraps
    // everything in AppShell, the reasoning above quietly stops being true
    // while both assertions stay green. This is the line that notices.
    const src = read('src/App.jsx')

    // ⚠️ THE JSX MARKER, NOT THE BARE STRING. The first pass sliced on
    // `indexOf('SIGNED-IN')`, which matched the routing essay at the top of
    // App.jsx — line 28 — so `publicRoutes` was the file header and contained
    // no routes at all. The test went red for the right reason by accident:
    // an empty slice fails the `toContain` below. **A control that can only
    // pass when it is looking at the right text is the point of a control.**
    // ⚠️ ANCHORED ON THE FUNCTION DECLARATION, AND IT TOOK THREE GOES TO GET
    // THE WINDOW RIGHT — worth writing down, because the cause is a property
    // of this codebase rather than a slip.
    //
    //   1st: sliced on 'SIGNED-IN'  → hit the routing essay on line 28.
    //   2nd: sliced from byte 0     → hit `<AppShell>` quoted in a COMMENT.
    //   3rd: sliced from '<Routes>' → hit `<Routes>` quoted in a COMMENT.
    //
    // **This repo comments heavily and quotes real JSX while doing it**, so any
    // source-text assertion here is reading prose as well as code unless it is
    // anchored on something no comment says. `export default function App` is
    // that; every other candidate turned out to be discussed before it is used.
    //
    // All three failures were in the CONTROL, never in the code — which is the
    // control doing its job. A source assertion is only ever as good as the
    // slice it reads.
    const marker = '{/* SIGNED-IN */}'
    const markerAt = src.indexOf(marker)
    const bodyAt = src.indexOf('export default function App')
    expect(markerAt, 'the SIGNED-IN route-group marker must exist in App.jsx').toBeGreaterThan(0)
    expect(bodyAt, 'App.jsx must declare `export default function App`').toBeGreaterThan(0)
    expect(bodyAt, 'the marker must sit inside the component body').toBeLessThan(markerAt)
    const publicRoutes = src.slice(bodyAt, markerAt)

    for (const path of ['/privacy', '/delete-account', '/reset-password', '/auth/confirm']) {
      expect(publicRoutes, `${path} must stay outside the signed-in group`).toContain(
        `path="${path}"`,
      )
    }
    expect(
      publicRoutes,
      'no public route may be wrapped in AppShell — App.jsx is their only boundary',
    ).not.toMatch(/<AppShell>/)
  })
})
