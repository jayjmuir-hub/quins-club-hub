import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

vi.mock('../src/lib/memberships.jsx', () => ({
  useMemberships: () => ({
    memberships: [{ id: 'm1', role: 'coach', status: 'active', team_id: 't-u16b', is_head_coach: true }],
    teams: [{ id: 't-u16b', name: 'U16B', sort_order: 16, is_senior: false }],
    loading: false,
  }),
}))

import SquadHubNav from '../src/components/SquadHubNav.jsx'

// Phone Hub tabs (Overview / Match roster / Training / …). Jay, 5 Sep 2026:
// the grey underline kissed the W–D–L band. Shared SquadHubNav is the only
// phone chrome — every hub screen imports it. mb-4 is 16px, in the 12–16px
// window. Invented squad name.

describe('SquadHubNav — underline breathing room', () => {
  it('keeps a grey underline and 16px before the content below', () => {
    render(
      <MemoryRouter>
        <SquadHubNav teamId="t-u16b" />
      </MemoryRouter>,
    )

    const nav = screen.getByTestId('squad-hub-pills')
    expect(nav.className).toMatch(/\bborder-b\b/)
    expect(nav.className).toMatch(/\bborder-line\b/)
    expect(nav.className).toMatch(/\bmb-4\b/)
    expect(nav.className).not.toMatch(/\bmb-3\.5\b/)
    expect(screen.getByRole('link', { name: 'Overview' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Match roster' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Training' })).toBeInTheDocument()
  })
})
