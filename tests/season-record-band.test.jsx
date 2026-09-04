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
  it('renders the Home band: headline W–D–L, split pills, Hub footnote', () => {
    render(<SeasonRecordCard teamName="U16B Contact" record={record} />)
    const card = screen.getByTestId('season-record-card')
    expect(card).toHaveTextContent(/season record/i)
    expect(card).toHaveTextContent(/U16B Contact/)
    expect(card).toHaveTextContent(/All matches/)
    expect(card).toHaveTextContent(/league · tournaments · friendlies/)
    expect(within(card).getByTestId('season-record-wdl')).toHaveTextContent(formatWdl(record))
    expect(card).toHaveTextContent('from scores on Hub · 2026-27')
    expect(within(card).getByTestId('season-record-pill-league')).toHaveTextContent(`League ${formatWdl(record.league)}`)
    expect(within(card).getByTestId('season-record-pill-tournaments')).toHaveTextContent(
      `Tournaments ${formatWdl(record.tournaments)}`,
    )
    expect(within(card).getByTestId('season-record-pill-friendlies')).toHaveTextContent(
      `Friendlies ${formatWdl(record.friendlies)}`,
    )
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
