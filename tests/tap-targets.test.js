// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Pitch-side tap targets — item 5 of the 2 Sep 2026 UX review. jsdom has no
// layout, so this reads the SOURCE for the class that produces the size: a
// rot detector, not a measurement. The review's numbers came from the
// Tailwind classes too (py-1.5 + 12.5px ≈ 34px; h-5 = 20px), so the class is
// the honest thing to pin.
//
// Two shapes:
//   - a control that can grow gets `min-h-[44px]` (or min-w on the dock);
//   - a control that must stay small on screen (a 20px chevron, a 32px close)
//     gets a ::before hit area: `before:absolute before:-inset-N before:content-['']`.
//
// ⚠️ THE CONTROL IS LAST. A sweep that has never found anything is not a sweep.

const src = (file) => readFileSync(join(process.cwd(), 'src', file), 'utf8')

const HIT_AREA = /before:absolute before:-inset-[\d.]+ before:content-\[''\]/

describe('pitch-side tap targets', () => {
  it('availability In / Maybe / Out are 44px tall', () => {
    expect(src('screens/Availability.jsx')).toMatch(/min-h-\[44px\] rounded-\[9px\] border-\[1\.5px\]/)
  })

  it('lineup row actions (Bench / Remove / Start / Shirt) are 44px tall, and none is left at 11.5px', () => {
    const lineup = src('screens/Lineup.jsx')
    // ⚠️ The codemod that added min-h-[44px] on 2 Sep 2026 ate the space after
    // font-bold on ten buttons (`font-boldtext-ink`), which Tailwind silently
    // drops: no weight, no colour, live for two hours. A class list is a
    // space-separated string; the sweep now refuses any glued utility.
    expect(lineup).not.toMatch(/font-bold(?=text-)/)
    expect(lineup.match(/min-h-\[44px\] py-1 text-\[12px\] font-bold/g)?.length ?? 0).toBeGreaterThanOrEqual(4)
    expect(lineup).not.toMatch(/py-1 text-\[11\.5px\] font-bold/)
  })

  it('the chat message chevron, the tray remove and the Sheet close carry a hit area', () => {
    expect(src('components/MessageMenu.jsx')).toMatch(HIT_AREA)
    expect(src('components/AttachmentTray.jsx')).toMatch(HIT_AREA)
    expect(src('components/Sheet.jsx')).toMatch(HIT_AREA)
  })

  it('an idle dock tab is at least 44px wide', () => {
    expect(src('components/Nav.jsx')).toMatch(/min-w-\[44px\] px-2 text-white\/90/)
  })

  it('Button sm and the vouch chips grew', () => {
    expect(src('components/Button.jsx')).toMatch(/sm: 'rounded-\[6px\] px-3 py-2\.5 text-\[13px\]'/)
    expect(src('screens/Accounts.jsx')).toMatch(/min-h-\[36px\] rounded-\[6px\] border px-2\.5 py-1 text-\[12px\]/)
  })

  it('control: the hit-area pattern really matches, and misses a plain button', () => {
    expect("relative before:absolute before:-inset-3 before:content-['']").toMatch(HIT_AREA)
    expect('grid h-5 w-5 place-items-center rounded-full').not.toMatch(HIT_AREA)
  })
})
