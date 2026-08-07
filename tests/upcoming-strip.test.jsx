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
  it('renders a fortnight of cells', () => {
    render(<UpcomingStrip events={[]} now={NOW} />)
    expect(screen.getAllByTestId('strip-day')).toHaveLength(14)
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
        events={[ev('past', '2026-07-01T10:00:00Z'), ev('far', '2026-12-01T10:00:00Z')]}
        now={NOW}
      />,
    )
    expect(screen.queryAllByTestId('strip-dot')).toHaveLength(0)
  })

  it('caps the dots so a busy club day cannot stretch the row', () => {
    const many = Array.from({ length: 6 }, (_, i) => ev(`e${i}`, '2026-08-08T10:00:00Z'))
    render(<UpcomingStrip events={many} now={NOW} />)
    expect(screen.getAllByTestId('strip-dot')).toHaveLength(3)
  })

  it('survives an unparseable date instead of rendering NaN', () => {
    render(<UpcomingStrip events={[ev('bad', 'not-a-date'), ev('none', null)]} now={NOW} />)
    expect(screen.getAllByTestId('strip-day')).toHaveLength(14)
    expect(screen.queryAllByTestId('strip-dot')).toHaveLength(0)
  })
})

describe('UpcomingStrip — what is tappable', () => {
  it('makes a day with an event a real button', async () => {
    const onSelect = vi.fn()
    render(<UpcomingStrip events={[ev('e1', '2026-08-08T14:00:00Z')]} now={NOW} onSelect={onSelect} />)

    const buttons = screen.getAllByRole('button')
    expect(buttons).toHaveLength(1)
    await userEvent.click(buttons[0])
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'e1' }))
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
