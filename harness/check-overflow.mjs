#!/usr/bin/env node
// Horizontal-overflow gate: every harness scenario, at phone width, must not
// make the document wider than the viewport.
//
// ⚠️ WHY THIS EXISTS. On 10 Aug 2026 Jay opened the app on a phone and said it
// was "not scaling correctly", with a screenshot of the event sheet: close
// button cut off, "Match · Awa", "The Sevens Stadium, Duba". The sheet was
// fine. The cause was the Schedule page-header row three layers away — a
// `justify-between` row whose right-hand action group is `shrink-0` and so
// could never give way. When it did not fit, the row did not clip: THE
// DOCUMENT got wider than the viewport, and after that every element sized to
// the viewport rendered short or clipped.
//
// That is the failure mode this file is built around, and it is nasty for two
// specific reasons:
//
//   1. ⚠️ THE SYMPTOM APPEARS NOWHERE NEAR THE CAUSE. One bad row on Schedule
//      clipped the masthead and an open Sheet — it read as four bugs on three
//      screens, none of them where the fix belonged.
//   2. ⚠️ FIXED ELEMENTS LOOK FINE THROUGHOUT. The bottom nav is `fixed`, so
//      it tracks the viewport and stays correct while everything else breaks.
//      Anything that only checks "does the nav look right" is blind to this.
//
// ⚠️ AND NO UNIT TEST CAN CATCH IT. jsdom has no layout engine; every width it
// reports is 0. `tests/page-header-wrap.test.js` pins the CLASS that prevents
// the known instance, which catches the guard being removed and cannot catch a
// new way of overflowing. This file is the one that measures the real thing.
//
// ⚠️ HOW THIS FILE NEARLY SHIPPED USELESS, because it is the more instructive
// half of the story. The first fault injection reverted only `flex-wrap` from
// Schedule's header and the gate came back GREEN — which was read, and
// reported to Jay, as "the check disproves the fix". It did not. The fix was
// TWO classes, `flex-wrap` and `min-w-0`, and `min-w-0` is the load-bearing
// one: it lets the title block shrink and absorb the row. Leaving it in place
// meant the bug was never actually restored. Injecting the real pre-fix markup
// fails 8 of 140 pairs and names the row.
// **An injected fault only proves a check when it restores the WHOLE original.
// Reverting part of a fix tests nothing and reads exactly like a passing run.**
//
// ⚠️ Also measured while proving this: Roster's header does NOT overflow even
// without its `flex-wrap`/`min-w-0`. That change is house-pattern consistency,
// not a fix, and should not be described as one. Only Schedule was broken.
//
// ⚠️ NOT WIRED INTO CI, DELIBERATELY. Playwright is not a dependency of this
// repo — see harness/playwright.mjs for the reasoning — and adding a ~300MB
// browser download to every Netlify build and Actions run to catch a class of
// bug that has bitten once is not a trade this repo has agreed to. So this is
// a gate you RUN, not one that runs itself. In two terminals:
//
//   npm run harness           # serves the stubbed app on :5199
//   npm run check:overflow
//
// Playwright is not installed by default (see harness/playwright.mjs). Add it
// without touching package.json's dependency list:
//
//   npm i -D playwright --no-save && npx playwright install chromium
//
// It exits non-zero on the first overflowing scenario, so it works as a
// pre-release check by hand. If overflow ever bites twice, that is the moment
// to argue for the 300MB.

import { loadChromium } from './playwright.mjs'

const BASE = process.env.HARNESS_BASE || 'http://localhost:5199'

// Phone first, because that is where it bit and where the app is used —
// standing on a pitch.
//
// ⚠️ 360 IS NOT OPTIONAL AND WAS MISSING FROM THE FIRST VERSION OF THIS FILE.
// It is the most common Android CSS width by a wide margin — a 1440px panel at
// DPR 4 — and it is what Jay reported the bug from. The first list here was
// [320, 375, 414], which straddles it: the Schedule regression overflows by
// 53px at 320 and by roughly 13px at 360, and had shrunk to nothing by 375. A
// width list that skips the most common phone can report a clean run on a
// screen that is visibly broken.
//
// 320 stays because it is the narrowest phone still in circulation and it is
// where a row that "just fits" at 375 gives way first. 414 and 390 cover the
// larger iPhones, where a regression that only bites on big phones would
// otherwise hide.
const WIDTHS = [320, 360, 375, 390, 414]

// Every scenario the harness can render. Kept as a literal list rather than
// parsed out of main.jsx: a regex over that file would silently shrink to
// nothing if the object's shape changed, and a check that quietly stops
// checking is the thing this repo keeps getting bitten by.
//
// ⚠️ IF YOU ADD A SCENARIO TO main.jsx, ADD IT HERE. The guard below fails if
// a scenario name does not render, so a typo cannot pass as a clean run — but
// nothing can tell you about a scenario you never listed.
const SCENARIOS = [
  'login',
  'shell-coach',
  'shell-no-membership',
  'shell-error',
  'schedule',
  'schedule-admin',
  'schedule-parent',
  'schedule-one-team',
  'schedule-admin-15',
  'roster',
  'roster-one-team',
  'roster-admin',
  'roster-parent',
  'roster-three',
  'dashboard',
  'dashboard-admin',
  'dashboard-parent',
  'overview-admin',
  'overview-coach',
  'playerform',
  'availability',
  // ⚠️ LISTED, BUT READ THE LIMIT BEFORE COUNTING IT AS COVERAGE — and the
  // limit applies to `availability` and `playerform` above it too, which is
  // why it is written here rather than only against this line.
  //
  // ⚠️ THIS GATE IS BLIND TO ANYTHING INSIDE A SHEET. Measured 12 Aug 2026:
  // src/components/Sheet.jsx renders `position:fixed inset-0` and sets
  // `document.body.style.overflow = 'hidden'` while open, so a sheet's
  // contents are not in the document's scrollWidth at all. Proved by
  // injecting a 900px `shrink-0` button into this scene's footer — THE GATE
  // STAYED GREEN. Every sheet scenario here therefore verifies that the sheet
  // RENDERS and that the page behind it is clean; it cannot verify the sheet's
  // own layout, and a clean run must never be quoted as if it did.
  //
  // It stays listed anyway: a sheet scenario that fails to boot is still
  // caught (a scenario that does not render fails this file), and the day
  // Sheet stops being `fixed` this line starts measuring something real.
  // The three-button footer it was added for (Edit | Duplicate | Delete,
  // 12 Aug 2026) was verified by MEASURING the row in Chromium instead —
  // 284px wide, buttons 83 + 97 + 85 at 320px, one line, nothing clipped.
  'event-detail',
  'admin',
  'admin-nav',
  // ⚠️ LISTED, BUT IT PROVES ALMOST NOTHING AND THAT IS WORTH KNOWING. The
  // whole /admin tree is inside `hidden desktop:block`, so at every width
  // below it renders the "Needs a bigger screen" card and the chooser's card
  // grid is display:none. This entry catches the scenario failing to BOOT and
  // nothing else. The chooser's own layout has to be looked at in a real
  // browser at desktop width. Same class of blind spot as the sheet scenarios
  // above.
  'portal-chooser',
  'full-app',
  'accounts-admin',
  'view-as',
  'accounts-pending',
  'name-prompt',
  // ⚠️ THE ONE WIDE SCREEN THAT WAS NEVER LISTED. The RCM facsimile is an
  // eight-column table of a paper form, and since 12 Aug 2026 it carries a
  // three-column score grid above it. It is a routed screen and NOT inside a
  // Sheet, so — unlike the three entries above that carry the sheet caveat —
  // this one is measured for real.
  'match-sheet',
  // The pitch calendar, 12 Aug 2026. Routed screen, not a Sheet, so this one
  // is genuinely measured. ?view= is not swept here - the gate loads the
  // default (Day); the month grid was measured by hand at every width.
  'allocation',
  // The noticeboard CARD (16 Aug 2026). Routed nowhere and inside no Sheet, so
  // this one is measured for real. A notice is free text written by a coach on a
  // phone — the widest thing on it is a long squad name beside a long role
  // beside a "Pinned" chip, which is exactly the row that wraps or does not.
  'notice-row',
]

// A pixel of slack. Sub-pixel layout rounding can put scrollWidth one above
// clientWidth on a page that is visually perfect, and a check that cries wolf
// gets switched off. Two pixels is not a layout bug anyone can see; the one
// that prompted this was 29.
const TOLERANCE_PX = 2

/**
 * Runs in the page. Returns the overflow and, when there is any, the elements
 * actually sticking out past the right edge — because "the document is 29px
 * too wide" is useless on its own and naming the element is the whole value.
 */
function measure(tolerance) {
  const doc = document.documentElement
  const overflow = doc.scrollWidth - doc.clientWidth
  if (overflow <= tolerance) return { overflow, culprits: [] }

  const limit = doc.clientWidth
  const culprits = []
  for (const el of document.querySelectorAll('*')) {
    const rect = el.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) continue
    if (rect.right <= limit + tolerance) continue

    // Report the OUTERMOST offender only. A row that is too wide drags all of
    // its children past the edge too, and listing forty descendants of one bad
    // flex row buries the answer.
    if (culprits.some((c) => c.node.contains(el))) continue

    culprits.push({
      node: el,
      tag: el.tagName.toLowerCase(),
      cls: (el.getAttribute('class') || '').slice(0, 160),
      right: Math.round(rect.right),
      width: Math.round(rect.width),
      text: (el.textContent || '').trim().slice(0, 40),
    })
  }
  return {
    overflow,
    culprits: culprits.map(({ node, ...rest }) => rest),
  }
}

async function main() {
  const chromium = await loadChromium()
  const browser = await chromium.launch()
  const failures = []
  let checked = 0

  try {
    for (const width of WIDTHS) {
      const context = await browser.newContext({
        viewport: { width, height: 812 },
        deviceScaleFactor: 2,
      })
      const page = await context.newPage()

      for (const scenario of SCENARIOS) {
        await page.goto(`${BASE}/?scenario=${scenario}`, { waitUntil: 'networkidle' })

        // ⚠️ A blank page has no overflow and would pass. Every scenario must
        // prove it rendered something before its clean result is believed —
        // otherwise a renamed scenario reports success by rendering nothing.
        const painted = await page.evaluate(
          () => document.body.innerText.trim().length > 0 && document.body.children.length > 0,
        )
        if (!painted) {
          failures.push(
            `${scenario} @${width}px — SCENARIO DID NOT RENDER. ` +
              'Renamed or removed from harness/main.jsx? A blank page cannot overflow, ' +
              'so this would otherwise have passed.',
          )
          continue
        }

        const { overflow, culprits } = await page.evaluate(measure, TOLERANCE_PX)
        checked += 1

        if (overflow > TOLERANCE_PX) {
          const detail = culprits.length
            ? culprits
                .map((c) => `      <${c.tag}> right=${c.right} w=${c.width} "${c.text}"\n        class="${c.cls}"`)
                .join('\n')
            : '      (no single element past the edge — suspect a margin or a fixed width)'
          failures.push(`${scenario} @${width}px — document ${overflow}px too wide\n${detail}`)
        }
      }

      await context.close()
    }
  } finally {
    await browser.close()
  }

  if (failures.length) {
    console.error(`\n✗ horizontal overflow in ${failures.length} of ${checked} scenario/width pairs:\n`)
    for (const failure of failures) console.error(`  ${failure}\n`)
    console.error(
      'A document wider than the viewport does NOT just clip the row that caused it:\n' +
        'it clips the masthead and every open sheet, on screens far from the cause.\n',
    )
    process.exit(1)
  }

  console.log(`✓ no horizontal overflow — ${checked} scenario/width pairs at ${WIDTHS.join('/')}px`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
