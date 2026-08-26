import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import UpcomingStrip, { stripDays, dayKey } from '../src/components/UpcomingStrip.jsx'

// Option C of the three calendar layouts Jay compared: a fortnight glance on
// the home screen instead of a full month grid.
//
// The interesting behaviour is all TIME ZONE behaviour, so these fixtures use
// instants that fall on different days depending on which zone you read them
// in. The club is Asia/Dubai (UTC+4, no DST).

// 2026-08-06 09:00 Dubai.
const NOW = Date.parse('2026-08-06T05:00:00Z')

const ev = (id, startsAt, type = 'training') => ({ id, starts_at: startsAt, type })

describe('stripDays', () => {
  it('starts on today in CLUB time and covers a fortnight', () => {
    const days = stripDays(NOW)
    expect(days).toHaveLength(14)
    expect(days[0].parts).toEqual({ year: 2026, month: 7, day: 6 })
    expect(days[0].isToday).toBe(true)
    expect(days[13].parts).toEqual({ year: 2026, month: 7, day: 19 })
  })

  it('rolls the month over rather than producing day 32', () => {
    const days = stripDays(Date.parse('2026-08-25T05:00:00Z'))
    expect(days[13].parts).toEqual({ year: 2026, month: 8, day: 7 })
  })

  it('uses the club day, not the reader’s, near midnight', () => {
    // 2026-08-06 22:30 UTC is already 02:30 on the 7th in Dubai. A reader in
    // London would call it the 6th; the club calls it the 7th, and the club
    // is right — its fixtures happen on its own days.
    const days = stripDays(Date.parse('2026-08-06T22:30:00Z'))
    expect(days[0].parts.day).toBe(7)
  })
})

describe('UpcomingStrip', () => {
  it('renders a fortnight of cells when there is something on', () => {
    // ⚠️ THIS TEST USED TO PASS `events={[]}` AND ASSERT 14 CELLS — it was
    // pinning the defect below. The third time this file has caught that shape:
    // see the 10 Aug handoff on "Fixtures to play" and loadMyMemberships, both
    // of which had tests asserting the broken behaviour.
    render(<UpcomingStrip events={[ev('e1', '2026-08-08T14:00:00Z')]} now={NOW} />)
    expect(screen.getAllByTestId('strip-day')).toHaveLength(14)
  })

  describe('when nothing falls in the fortnight', () => {
    // ⚠️ THE DEFECT. Fourteen bordered cells with no dot on any of them is not
    // a calendar, it is 90px of furniture — and it sits ABOVE THE FOLD on a
    // phone, pushing down the thing the app was opened for. It also reads as
    // though it is still loading: "cells with no dots" and "cells whose dots
    // have not arrived yet" look identical.

    it('says so instead of drawing fourteen empty cells', () => {
      render(<UpcomingStrip events={[]} now={NOW} />)

      expect(screen.queryAllByTestId('strip-day')).toHaveLength(0)
      expect(screen.getByTestId('upcoming-strip-empty')).toHaveTextContent(
        /nothing on in the next two weeks/i,
      )
    })

    it('says it about the fortnight, not about the season', () => {
      // An event exists — it is just further out than this component's window.
      // Saying "nothing coming up" here would be false, and the Upcoming list
      // directly below would be visibly contradicting it.
      render(<UpcomingStrip events={[ev('far', '2026-12-01T10:00:00Z')]} now={NOW} />)

      expect(screen.getByTestId('upcoming-strip-empty')).toHaveTextContent(/next two weeks/i)
    })

    it('FAULT: one event inside the fortnight brings the cells back', () => {
      // Without this, a component that ALWAYS rendered the empty state would
      // pass both tests above.
      render(<UpcomingStrip events={[ev('near', '2026-08-08T14:00:00Z')]} now={NOW} />)

      expect(screen.queryByTestId('upcoming-strip-empty')).not.toBeInTheDocument()
      expect(screen.getAllByTestId('strip-day')).toHaveLength(14)
    })
  })

  it('puts a dot on the day an event falls on', () => {
    render(<UpcomingStrip events={[ev('e1', '2026-08-08T14:00:00Z')]} now={NOW} />)
    expect(screen.getAllByTestId('strip-dot')).toHaveLength(1)
  })

  it('files a late-night kick-off under the CLUB day, not UTC', () => {
    // ⚠️ THE BUG THIS PREVENTS. 2026-08-08T21:00Z is 01:00 on the 9th in
    // Dubai. Bucketing on the raw date would paint the dot on the 8th — the
    // wrong cell, for everyone, including people sitting in Abu Dhabi.
    render(<UpcomingStrip events={[ev('e1', '2026-08-08T21:00:00Z')]} now={NOW} />)

    const cells = screen.getAllByTestId('strip-day')
    const eighth = cells.find((c) => c.textContent.startsWith('8'))
    const ninth = cells.find((c) => c.textContent.startsWith('9'))

    expect(eighth.querySelector('[data-testid="strip-dot"]')).toBeNull()
    expect(ninth.querySelector('[data-testid="strip-dot"]')).not.toBeNull()
  })

  it('ignores events outside the fortnight', () => {
    render(
      <UpcomingStrip
        events={[
          ev('past', '2026-07-01T10:00:00Z'),
          ev('far', '2026-12-01T10:00:00Z'),
          // Inside the window, so the strip still renders and this test keeps
          // asking its original question — "do the out-of-range events get a
          // dot" — rather than silently becoming a test of the empty state.
          ev('near', '2026-08-08T14:00:00Z'),
        ]}
        now={NOW}
      />,
    )
    expect(screen.getAllByTestId('strip-dot')).toHaveLength(1)
  })

  it('caps the dots so a busy club day cannot stretch the row', () => {
    const many = Array.from({ length: 6 }, (_, i) => ev(`e${i}`, '2026-08-08T10:00:00Z'))
    render(<UpcomingStrip events={many} now={NOW} />)
    expect(screen.getAllByTestId('strip-dot')).toHaveLength(3)
  })

  it('survives an unparseable date instead of rendering NaN', () => {
    // A good event alongside the bad ones, so the strip still renders and the
    // original question — "does a bad date produce a cell or a dot" — is still
    // being asked. With only bad dates this would now render the empty state
    // and assert nothing about NaN.
    render(
      <UpcomingStrip
        events={[ev('bad', 'not-a-date'), ev('none', null), ev('ok', '2026-08-08T14:00:00Z')]}
        now={NOW}
      />,
    )
    expect(screen.getAllByTestId('strip-day')).toHaveLength(14)
    expect(screen.getAllByTestId('strip-dot')).toHaveLength(1)
    expect(screen.queryByText(/NaN/)).not.toBeInTheDocument()
  })

  it('treats an all-unparseable list as nothing on, rather than crashing', () => {
    render(<UpcomingStrip events={[ev('bad', 'not-a-date'), ev('none', null)]} now={NOW} />)
    expect(screen.getByTestId('upcoming-strip-empty')).toBeInTheDocument()
  })
})

describe('UpcomingStrip — what is tappable', () => {
  it('makes a day with an event a real button', async () => {
    const onSelect = vi.fn()
    render(<UpcomingStrip events={[ev('e1', '2026-08-08T14:00:00Z')]} now={NOW} onSelect={onSelect} />)

    const buttons = screen.getAllByRole('button')
    expect(buttons).toHaveLength(1)
    await userEvent.click(buttons[0])
    expect(onSelect).toHaveBeenCalledWith(
      [expect.objectContaining({ id: 'e1' })],
      { year: 2026, month: 7, day: 8 },
    )
  })

  it('hands over EVERY event on the day, in kick-off order', async () => {
    // ⚠️ THE BUG THIS PREVENTS. This used to call onSelect(dayEvents[0]) — the
    // same defect DaySheet's comment records for the calendar (Task 23): a
    // Saturday with three age groups playing showed three dots, opened one
    // fixture, and gave no route to the other two. The strip now hands the
    // whole day to the caller, which decides whether to open or to offer.
    const onSelect = vi.fn()
    render(
      <UpcomingStrip
        // Deliberately out of kick-off order, so a pass-through of push order
        // cannot pass this test.
        events={[ev('late', '2026-08-08T14:00:00Z'), ev('early', '2026-08-08T06:00:00Z')]}
        now={NOW}
        onSelect={onSelect}
      />,
    )

    await userEvent.click(screen.getByRole('button'))
    expect(onSelect).toHaveBeenCalledWith(
      [expect.objectContaining({ id: 'early' }), expect.objectContaining({ id: 'late' })],
      { year: 2026, month: 7, day: 8 },
    )
  })

  it('counts every event for the screen reader, not just the three dots', () => {
    // The dots are capped at three so a busy day cannot stretch the row; the
    // COUNT must not inherit that cap. Four events used to read "3 events".
    const onSelect = vi.fn()
    const four = Array.from({ length: 4 }, (_, i) => ev(`e${i}`, '2026-08-08T10:00:00Z'))
    render(<UpcomingStrip events={four} now={NOW} onSelect={onSelect} />)
    expect(screen.getByRole('button', { name: /4 events/ })).toBeInTheDocument()
  })

  it('leaves EMPTY days untappable', () => {
    // ⚠️ Deliberate. A tappable empty day is a control that looks live and
    // does nothing — the dead tap this layout was chosen to avoid.
    const onSelect = vi.fn()
    render(<UpcomingStrip events={[]} now={NOW} onSelect={onSelect} />)
    expect(screen.queryAllByRole('button')).toHaveLength(0)
  })

  it('does not pretend to be tappable with no handler', () => {
    render(<UpcomingStrip events={[ev('e1', '2026-08-08T14:00:00Z')]} now={NOW} />)
    expect(screen.queryAllByRole('button')).toHaveLength(0)
  })

  it('names the day and its load for a screen reader', () => {
    const onSelect = vi.fn()
    render(
      <UpcomingStrip
        events={[ev('a', '2026-08-08T10:00:00Z'), ev('b', '2026-08-08T14:00:00Z')]}
        now={NOW}
        onSelect={onSelect}
      />,
    )
    expect(screen.getByRole('button', { name: /Sat 8, 2 events/ })).toBeInTheDocument()
  })

  it('says "1 event", not "1 events"', () => {
    const onSelect = vi.fn()
    render(<UpcomingStrip events={[ev('a', '2026-08-08T10:00:00Z')]} now={NOW} onSelect={onSelect} />)
    expect(screen.getByRole('button', { name: /1 event$/ })).toBeInTheDocument()
  })
})

describe('dayKey', () => {
  it('is stable for the same club day', () => {
    expect(dayKey({ year: 2026, month: 7, day: 6 })).toBe(dayKey({ year: 2026, month: 7, day: 6 }))
  })

  it('separates the same day number in different months', () => {
    expect(dayKey({ year: 2026, month: 7, day: 6 })).not.toBe(dayKey({ year: 2026, month: 8, day: 6 }))
  })
})
