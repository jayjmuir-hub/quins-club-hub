import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

// The same-day clash note (4 Sep 2026): rendered from public.event_clashes,
// null when there is nothing to say or the database refuses.

const rpcMock = vi.fn()
vi.mock('../src/lib/supabase', () => ({ supabase: { rpc: (...a) => rpcMock(...a) } }))

import ClashNote from '../src/components/ClashNote.jsx'

beforeEach(() => vi.clearAllMocks())

describe('ClashNote', () => {
  it('names the player and the other fixture, with its time', async () => {
    rpcMock.mockResolvedValue({
      data: [
        { player_id: 'p1', full_name: 'Idris Vantongeren', other_event_id: 'e2', other_team: 'U18B', other_title: 'v Dubai Exiles', other_starts_at: '2026-10-10T07:00:00Z', other_time_tbd: false },
        { player_id: 'p2', full_name: 'Rafferty Nwosu', other_event_id: 'e3', other_team: 'U18B', other_title: 'v Dubai Exiles', other_starts_at: '2026-10-09T20:00:00Z', other_time_tbd: true },
      ],
      error: null,
    })
    render(<ClashNote eventId="e1" />)
    const note = await screen.findByTestId('clash-note')
    expect(note).toHaveTextContent('Also selected the same day')
    expect(note).toHaveTextContent('Idris Vantongeren — U18B v Dubai Exiles, 11:00')
    expect(note).toHaveTextContent('Rafferty Nwosu — U18B v Dubai Exiles, time TBC')
    expect(rpcMock).toHaveBeenCalledWith('event_clashes', { _event: 'e1' })
  })

  it('CONTROL: renders nothing with no clashes, and nothing when refused', async () => {
    rpcMock.mockResolvedValueOnce({ data: [], error: null })
    const { unmount } = render(<ClashNote eventId="e1" />)
    await new Promise((r) => setTimeout(r, 10))
    expect(screen.queryByTestId('clash-note')).not.toBeInTheDocument()
    unmount()
    rpcMock.mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'Not your fixture.' } })
    render(<ClashNote eventId="e1" />)
    await new Promise((r) => setTimeout(r, 10))
    expect(screen.queryByTestId('clash-note')).not.toBeInTheDocument()
  })
})
