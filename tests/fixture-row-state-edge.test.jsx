import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

import FixtureRow from '../src/components/FixtureRow.jsx'

// The 3px state edge added to every fixture row (15 Aug 2026).
//
// ⚠️ THE EDGE IS A COLOUR, SO THE TESTS ARE ABOUT THE RULE, NOT THE PIXELS.
// jsdom has no layout and computes no Tailwind, so asserting "it is 3px wide
// and green" here would assert nothing. What IS testable, and what actually
// breaks, is the mapping from an event to a tone class and the fact that the
// edge never becomes the only signal — the chip and the score still carry the
// same information in words.
//
// ⚠️ AND ONE STRUCTURAL TEST THAT LOOKS LIKE PEDANTRY AND IS NOT: the row must
// stay a DIRECT child of whatever list renders it. See the divider test at the
// bottom.

const BASE = {
  id: 'e1',
  team_id: 't1',
  type: 'match',
  opponent: 'Sharjah Wanderers',
  title: null,
  venue: 'Zayed Sports City',
  home: true,
  starts_at: '2026-09-12T15:00:00Z',
  result_us: null,
  result_them: null,
}

function edgeOf(container) {
  // The edge is the only aria-hidden span carrying a w-[3px] utility.
  const edge = container.querySelector('span[aria-hidden="true"][class*="w-[3px]"]')
  return edge
}

function renderRow(event) {
  return render(<FixtureRow event={event} teamName="U12 Boys" onSelect={vi.fn()} />)
}

describe('FixtureRow — the state edge', () => {
  it('is brand red for a match with a known pitch', () => {
    const { container } = renderRow({ ...BASE, pitch: 'Pitch 3' })
    expect(edgeOf(container).className).toContain('bg-brand')
  })

  it('is amber for a match with no pitch at all', () => {
    const { container } = renderRow({ ...BASE, pitch: null })
    expect(edgeOf(container).className).toContain('bg-warn')
  })

  // ⚠️ THE FREE-TEXT CASE, AND IT IS THE ONE THAT MATTERS. "Pitch TBD" is a
  // non-empty string, so any check that merely asks whether a pitch was typed
  // calls this row settled and shows it brand red. A coach then reads the
  // Upcoming list as "everything has a pitch" when nothing does.
  it.each(['TBD', 'tba', 'Pitch TBC', '   '])(
    'is amber for a match whose pitch reads %j',
    (pitch) => {
      const { container } = renderRow({ ...BASE, pitch })
      expect(edgeOf(container).className).toContain('bg-warn')
    },
  )

  it('is accent green for a training', () => {
    const { container } = renderRow({
      ...BASE,
      type: 'training',
      opponent: null,
      title: 'U12 Squad Training',
    })
    expect(edgeOf(container).className).toContain('bg-accent')
  })

  it('is neutral for a social', () => {
    const { container } = renderRow({
      ...BASE,
      type: 'social',
      opponent: null,
      title: 'Family BBQ',
    })
    expect(edgeOf(container).className).toContain('bg-line-strong')
  })

  // ⚠️ A PLAYED MATCH IS A RESULT FIRST. Without this branch a finished match
  // with no pitch recorded would still shout amber — asking a coach to go and
  // book a pitch for a game that has already been lost.
  it('is neutral for a played match, whatever its pitch says', () => {
    const { container } = renderRow({
      ...BASE,
      pitch: null,
      result_us: 8,
      result_them: 21,
    })
    expect(edgeOf(container).className).toContain('bg-line-strong')
  })
})

describe('FixtureRow — the edge is never the only signal', () => {
  it('hides the edge from assistive technology and says the type in words', () => {
    const { container } = renderRow({
      ...BASE,
      type: 'training',
      opponent: null,
      // Deliberately NOT "U12 Squad Training" — a title containing the word
      // would make the assertion below pass on the title rather than on the
      // chip, which is the thing that has to carry the meaning in words.
      title: 'Skills and handling',
    })
    expect(edgeOf(container)).toHaveAttribute('aria-hidden', 'true')
    // The chip carries the same fact the colour does.
    expect(screen.getByText(/training/i)).toBeInTheDocument()
  })

  it('still writes the score on a played row', () => {
    renderRow({ ...BASE, result_us: 8, result_them: 21 })
    expect(screen.getByText(/8/)).toBeInTheDocument()
    expect(screen.getByText(/21/)).toBeInTheDocument()
  })
})

describe('FixtureRow — the animation goes on the row, not a wrapper', () => {
  // ⚠️ THIS TEST EXISTS BECAUSE THE OBVIOUS IMPLEMENTATION IS A SILENT BUG.
  // The row carries `last:border-b-0` — CSS `:last-child`. Wrapping each row in
  // its own <div> to hold the stagger makes EVERY row the last child of its
  // wrapper, so every divider in the list disappears, not just the final one.
  // Measured in Chromium on 15 Aug 2026: five rows went from 1/1/1/1/0 px of
  // bottom border to 0/0/0/0/0 the moment wrappers were introduced.
  //
  // jsdom cannot see that. What it CAN see is the structural cause, so that is
  // what is pinned here: the className and style land on the button itself.
  it('puts a caller className and style on the button, so it stays a direct child', () => {
    render(
      <FixtureRow
        event={BASE}
        teamName="U12 Boys"
        onSelect={vi.fn()}
        className="animate-rise-in"
        style={{ animationDelay: '120ms' }}
      />,
    )
    const row = screen.getByTestId('fixture-row')
    expect(row.tagName).toBe('BUTTON')
    expect(row.className).toContain('animate-rise-in')
    expect(row.className).toContain('last:border-b-0')
    expect(row).toHaveStyle({ animationDelay: '120ms' })
  })

  it('renders without a className and keeps its own classes intact', () => {
    render(<FixtureRow event={BASE} teamName="U12 Boys" onSelect={vi.fn()} />)
    const row = screen.getByTestId('fixture-row')
    expect(row.className).toContain('last:border-b-0')
    expect(row.className).not.toContain('undefined')
  })
})
