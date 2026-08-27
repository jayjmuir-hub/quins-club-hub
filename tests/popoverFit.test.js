import { describe, it, expect } from 'vitest'
import { fitPopoverX } from '../src/lib/popoverFit.js'
import { REACTION_PICKER_WIDTH } from '../src/components/ReactionBar.jsx'

// Horizontal fit for the chat reaction picker (Jay, 27 Aug 2026: tray hangs
// off the right of an incoming left bubble because the smiley sits on the
// right of the row). Invented geometry — no real members.
//
// Phone width is an iPhone SE / typical Android 375 CSS px. Picker width is
// ReactionBar's five 32px emoji + gaps + padding + border.

const PHONE = 375
const PICKER = REACTION_PICKER_WIDTH
const MARGIN = 8

function fit(partial) {
  return fitPopoverX({
    popoverWidth: PICKER,
    viewportWidth: PHONE,
    margin: MARGIN,
    ...partial,
  })
}

function fullyOnScreen(left) {
  expect(left).toBeGreaterThanOrEqual(MARGIN)
  expect(left + PICKER).toBeLessThanOrEqual(PHONE - MARGIN)
}

describe('fitPopoverX — incoming left bubble, picker from the right-side control', () => {
  // ChatBubble parks the smiley AFTER a left-aligned bubble. A typical
  // incoming row therefore has the trigger near the right bezel; hugging
  // left (grow right) is the clipped-off-right path Jay hit in a DM.
  it('flips to grow left so the tray does not hang off the right edge', () => {
    const left = fit({
      triggerLeft: 330,
      triggerRight: 354,
      preferred: 'left',
    })
    fullyOnScreen(left)
    // Hugging the trigger's right edge: 354 − 194 = 160.
    expect(left).toBe(160)
  })

  it('keeps hugging left when the incoming bubble is short and there is room', () => {
    const left = fit({
      triggerLeft: 48,
      triggerRight: 72,
      preferred: 'left',
    })
    fullyOnScreen(left)
    expect(left).toBe(48)
  })
})

describe('fitPopoverX — right-aligned outgoing bubble', () => {
  // ChatBubble parks the smiley BEFORE a right-aligned bubble. A long
  // outgoing row puts the trigger near the LEFT bezel; hugging right (grow
  // left) would clip the other edge. Flip must not trade one clip for another.
  it('flips to grow right so hugging-right does not clip the left edge', () => {
    const left = fit({
      triggerLeft: 12,
      triggerRight: 36,
      preferred: 'right',
    })
    fullyOnScreen(left)
    expect(left).toBe(12)
  })

  it('keeps hugging right when the outgoing bubble is short and there is room', () => {
    const left = fit({
      triggerLeft: 300,
      triggerRight: 324,
      preferred: 'right',
    })
    fullyOnScreen(left)
    expect(left).toBe(130)
  })
})

describe('fitPopoverX — both edges overflow', () => {
  it('shifts into the viewport instead of scaling the tray down', () => {
    const left = fit({
      triggerLeft: 160,
      triggerRight: 184,
      preferred: 'left',
      viewportWidth: 220,
    })
    // 220 − 8 − 194 = 18 max; preferred left 160 is way past it.
    expect(left).toBe(18)
    expect(left).toBeGreaterThanOrEqual(MARGIN)
  })
})
