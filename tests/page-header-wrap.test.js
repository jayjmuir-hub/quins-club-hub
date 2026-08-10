import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join, sep } from 'node:path'

// The page-header row must be allowed to wrap.
//
// ⚠️ WHAT THIS PREVENTS, AND WHY IT LOOKS LIKE FOUR BUGS RATHER THAN ONE.
// Every screen's header is a `justify-between` row holding a title on the left
// and a `shrink-0` action group on the right. `shrink-0` means the buttons
// never give way, so if the title plus the buttons exceed the viewport the ROW
// does not clip — THE WHOLE DOCUMENT GETS WIDER THAN THE SCREEN.
//
// Once that happens the symptom shows up everywhere except where the cause is:
//   - the masthead stops reaching the right edge (it is sized to the viewport,
//     the document is wider);
//   - an open Sheet has its close button and every field value cut off;
//   - the bottom nav still looks fine, because it is fixed.
// Reported from a phone on 10 Aug 2026 as "not scaling correctly", with a
// screenshot of the event sheet — three screens away from the header that
// caused it.
//
// Measured against the built stylesheet at 375px: Schedule's row wanted 368px
// inside a 339px content box. It was 25px over BEFORE the button routing and
// 29px after, so the routing exposed it rather than caused it.
//
// ⚠️ WHY A SOURCE CHECK AND NOT A LAYOUT ONE. jsdom has no layout engine —
// every width it reports is 0 — so no test in this suite can measure overflow.
// A real check belongs in `harness/` (Playwright, real Chromium, real widths)
// and does not exist yet. This pins the class that prevents the failure, which
// is weaker than measuring the failure, and is honest about being a proxy:
// it cannot catch a NEW way of overflowing, only the removal of the guard.

const SRC = join(process.cwd(), 'src')

function jsxFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name)
    return entry.isDirectory() ? jsxFiles(full) : entry.name.endsWith('.jsx') ? [full] : []
  })
}

// The page-header row, identified by the spacing every screen shares.
const HEADER_ROW = /className="mb-3\.5 mt-1 flex\b[^"]*"/g

describe('the page-header row can wrap', () => {
  it('⚠️ every page header carries flex-wrap', () => {
    const offenders = []

    for (const file of jsxFiles(SRC)) {
      const source = readFileSync(file, 'utf8')
      for (const match of source.matchAll(HEADER_ROW)) {
        if (!/\bflex-wrap\b/.test(match[0])) {
          offenders.push(`${file.slice(SRC.length + 1)}: ${match[0]}`)
        }
      }
    }

    expect(
      offenders,
      'a page header without flex-wrap will push the whole document wider than\n' +
        'the phone viewport, clipping the masthead and every open sheet:\n' +
        offenders.join('\n'),
    ).toEqual([])
  })

  it('finds the header rows at all — the check is not vacuous', () => {
    // ⚠️ Guarding the guard. If the shared spacing is ever restyled, this
    // regex matches nothing and the test above passes by finding no headers to
    // check — green because it went blind. Rule 6: confirm the search can find
    // something known to be there.
    let found = 0
    for (const file of jsxFiles(SRC)) {
      found += [...readFileSync(file, 'utf8').matchAll(HEADER_ROW)].length
    }
    expect(found, 'no page-header rows matched — the selector has gone stale').toBeGreaterThan(0)
  })
})
