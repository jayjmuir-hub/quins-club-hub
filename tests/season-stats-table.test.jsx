import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SeasonStatsTable from '../src/components/SeasonStatsTable.jsx'

const ROWS = [
  { player_id: 'p1', full_name: 'Harness Fly Half', games: 3, starts: 3, bench: 0, tries: 1, conversions: 4, penalties: 2, drops: 0, yellows: 0, reds: 0 },
  { player_id: 'p2', full_name: 'Harness Wing', games: 3, starts: 2, bench: 1, tries: 5, conversions: 0, penalties: 0, drops: 0, yellows: 1, reds: 0 },
  { player_id: 'p3', full_name: 'Harness Prop', games: 1, starts: 0, bench: 1, tries: 0, conversions: 0, penalties: 0, drops: 0, yellows: 0, reds: 1 },
]

function names() {
  return screen.getAllByTestId('season-stats-row').map((tr) => within(tr).getAllByRole('cell')[0].textContent)
}

describe('SeasonStatsTable', () => {
  it('defaults to games desc, then tries desc', () => {
    render(<SeasonStatsTable rows={ROWS} />)
    expect(names()).toEqual(['Harness Wing', 'Harness Fly Half', 'Harness Prop'])
  })
  it('a tapped heading sorts by that column, desc, and says so', async () => {
    const user = userEvent.setup()
    render(<SeasonStatsTable rows={ROWS} />)
    await user.click(screen.getByRole('button', { name: 'Conversions' }))
    expect(names()[0]).toBe('Harness Fly Half')
    expect(screen.getByRole('columnheader', { name: /conversions/i })).toHaveAttribute('aria-sort', 'descending')
  })
  it('the abbreviated headings carry the full word for assistive tech', () => {
    render(<SeasonStatsTable rows={ROWS} />)
    expect(screen.getByRole('button', { name: 'Drop goals' })).toHaveTextContent('DG')
    expect(screen.getByRole('button', { name: 'Bench' })).toBeInTheDocument()
  })
  it('limit shows the first N after sorting', () => {
    render(<SeasonStatsTable rows={ROWS} limit={2} />)
    expect(names()).toEqual(['Harness Wing', 'Harness Fly Half'])
  })
  it('says so when there is nothing', () => {
    render(<SeasonStatsTable rows={[]} />)
    expect(screen.getByText('No games on a sheet yet.')).toBeInTheDocument()
  })
})
