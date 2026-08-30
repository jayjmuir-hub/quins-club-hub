import { describe, it, expect } from 'vitest'
import { createRef } from 'react'
import { render, screen, within } from '@testing-library/react'
import { PitchDayCard, PitchWeekCard } from '../src/components/PitchShareCard.jsx'
import { diagramSlots, diagramWeek } from '../src/lib/pitchOccupancy.js'

// The pitch-layout picture — the card that is both the on-screen "visual
// representation" and the PNG that shareElementAsImage photographs. What matters:
// every squad and pitch is NAMED (colour is never the only signal — the club is
// mostly men, ~8% colour-blind), the status reads in words, and each pitch bar is
// role="img" with a spoken label. It also forwards a ref so the screen can
// capture it.

const ev = (iso, pitch, portion, team_name, extra = {}) => ({
  id: extra.id ?? `${pitch}-${team_name}`,
  starts_at: iso,
  ends_at: null,
  pitch,
  pitch_portion: portion,
  team_name,
  ...extra,
})

describe('PitchDayCard', () => {
  it('names every squad and its portion, and forwards a ref for capture', () => {
    const slots = diagramSlots(
      [
        ev('2026-08-31T14:00:00Z', 'D1', 'quarter', 'U6 Tag'),
        ev('2026-08-31T14:00:00Z', 'D1', 'quarter', 'U7 Tag'),
        ev('2026-08-31T14:00:00Z', 'D1', 'quarter', 'U8 Tag'),
        ev('2026-08-31T14:00:00Z', 'D1', 'quarter', 'U9 Mixed'),
        ev('2026-08-31T14:00:00Z', 'D2', 'half', 'U16 Boys'),
      ],
      new Map(),
    )
    const ref = createRef()
    render(<PitchDayCard ref={ref} title="Monday 31 August" slots={slots} />)

    expect(ref.current).toBeInstanceOf(HTMLElement) // the screen photographs this
    expect(screen.getByText('Monday 31 August')).toBeInTheDocument()
    expect(screen.getByText('U6 Tag')).toBeInTheDocument()
    expect(screen.getByText('U7 Tag')).toBeInTheDocument()
    expect(screen.getByText('U16 Boys')).toBeInTheDocument()
    // The D1 bar carries a spoken label naming its occupants and its fullness.
    const d1 = screen.getByRole('img', { name: /^D1:/ })
    expect(d1).toHaveAccessibleName(/Full — nothing spare/)
  })

  it('draws the spare as its own labelled segment when a pitch is not full', () => {
    const slots = diagramSlots([ev('2026-08-31T14:00:00Z', 'D3', 'half', 'U12 Mixed')], new Map())
    render(<PitchDayCard title="Monday 31 August" slots={slots} />)
    expect(screen.getByText('Spare')).toBeInTheDocument()
  })
})

describe('PitchWeekCard', () => {
  it('lays out seven days, showing a dash for the quiet ones', () => {
    const days = [
      { year: 2026, month: 7, day: 31 },
      { year: 2026, month: 8, day: 1 },
    ]
    const model = diagramWeek(
      [
        ev('2026-08-31T14:00:00Z', 'D1', 'full', 'U10 Mixed', { id: 'mon' }),
        // 1 Sep left empty on purpose
      ],
      days,
      new Map(),
    ).map(({ dayParts, empty, slots }) => ({
      weekday: empty ? 'TUE' : 'MON',
      dayNum: dayParts.day,
      empty,
      slots,
    }))

    render(<PitchWeekCard title="Aug 31 – Sep 6" days={model} />)
    expect(screen.getByText('Aug 31 – Sep 6')).toBeInTheDocument()
    // Monday names its squad (compact form uses the leading token).
    expect(screen.getByText('U10')).toBeInTheDocument()
    // The empty day shows a dash rather than nothing.
    expect(screen.getByText('—')).toBeInTheDocument()
  })
})
