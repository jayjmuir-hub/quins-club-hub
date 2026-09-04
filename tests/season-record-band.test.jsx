import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { SeasonRecordBand, SeasonRecordCard } from '../src/components/SeasonRecordCard.jsx'
import { squadMatchRecord, formatWdl } from '../src/lib/matchRecord.js'

const AT = new Date('2026-10-15T08:00:00Z')

const events = [
  {
    id: 'lg',
    type: 'match',
    team_id: 't1',
    starts_at: '2026-10-04T13:00:00Z',
    competition_type: 'league',
    result_us: 24,
    result_them: 10,
  },
  {
    id: 'lg2',
    type: 'match',
    team_id: 't1',
    starts_at: '2026-10-11T13:00:00Z',
    competition_type: 'league',
    result_us: 7,
    result_them: 14,
  },
  {
    id: 'tn',
    type: 'match',
    team_id: 't1',
    starts_at: '2026-10-12T09:00:00Z',
    competition_type: 'tournament',
    tournament_id: 'trn',
    opponent: 'Wanderers',
    result_us: 19,
    result_them: 19,
  },
  {
    id: 'fr',
    type: 'match',
    team_id: 't1',
    starts_at: '2026-10-13T13:00:00Z',
    competition_type: null,
    result_us: 30,
    result_them: 0,
  },
]

const record = squadMatchRecord(events, { teamId: 't1', at: AT })

describe('SeasonRecordCard', () => {
  it('renders a thin Won / Drawn / Lost band with Hub footnote', () => {
    render(<SeasonRecordCard teamName="U16B Contact" record={record} />)
    const card = screen.getByTestId('season-record-card')
    expect(card).toHaveTextContent(/U16B Contact/)
    expect(within(card).getByTestId('stat-won')).toHaveTextContent('2')
    expect(within(card).getByTestId('stat-drawn')).toHaveTextContent('1')
    expect(within(card).getByTestId('stat-lost')).toHaveTextContent('1')
    expect(within(card).getByTestId('stat-won')).toHaveTextContent(/won/i)
    expect(within(card).getByTestId('season-record-wdl')).toHaveTextContent(formatWdl(record))
    expect(card).toHaveTextContent('from scores on Hub · 2026-27')
    const grid = within(card).getByTestId('stat-won').parentElement
    expect(grid.className).toContain('grid-cols-3')
    expect(grid.className).toContain('bg-stat-band')
  })

  it('keeps labels on one line and leaves a gap under the numeral', () => {
    render(<SeasonRecordCard teamName="U16B Contact" record={record} />)
    const label = within(screen.getByTestId('stat-won')).getByText(/^won$/i)
    expect(label.className).toContain('whitespace-nowrap')
    expect(label.className).toContain('mt-1.5')
    expect(label.className).toContain('text-[9px]')
  })
})

describe('SeasonRecordBand', () => {
  it('renders one card per scoring squad and nothing when the list is empty', () => {
    const { rerender } = render(
      <SeasonRecordBand
        rows={[
          { team: { id: 't1', name: 'U16B Contact' }, record },
          { team: { id: 't2', name: 'U14B Contact' }, record: squadMatchRecord([], { teamId: 't2', at: AT }) },
        ]}
      />,
    )
    expect(screen.getByTestId('season-record-band')).toBeInTheDocument()
    expect(screen.getAllByTestId('season-record-card')).toHaveLength(2)

    rerender(<SeasonRecordBand rows={[]} />)
    expect(screen.queryByTestId('season-record-band')).not.toBeInTheDocument()
  })
})
