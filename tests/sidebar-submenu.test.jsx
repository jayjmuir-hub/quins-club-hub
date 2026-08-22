import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Sidebar from '../src/components/Sidebar.jsx'

// The sidebar's expanding sub-menus (22 Aug 2026). The contract:
//   - only the ACTIVE section expands — elsewhere, no sub-items at all;
//   - Squad Hub's children carry the squad from the URL, and bare /squad
//     (the multi-squad picker) has no children because there is no squad yet;
//   - Schedule's children are ?open= deep-links, and "Add an event" only
//     shows for people the Squad Hub gate already admits.

function renderAt(path, props = {}) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Sidebar showSquadHub {...props} />
    </MemoryRouter>,
  )
}

describe('Squad Hub sub-menu', () => {
  it('expands with Overview and Build a Match Roster inside a squad, carrying the teamId', () => {
    renderAt('/squad/t-u12')
    const submenu = screen.getByTestId('submenu-squad')
    expect(within(submenu).getByRole('link', { name: 'Overview' })).toHaveAttribute('href', '/squad/t-u12')
    expect(within(submenu).getByRole('link', { name: 'Build a Match Roster' })).toHaveAttribute(
      'href',
      '/squad/t-u12/match-roster',
    )
  })

  it('stays expanded on the match-roster child route', () => {
    renderAt('/squad/t-u12/match-roster')
    expect(screen.getByTestId('submenu-squad')).toBeInTheDocument()
  })

  it('shows no children on bare /squad — no squad chosen yet', () => {
    renderAt('/squad')
    expect(screen.queryByTestId('submenu-squad')).not.toBeInTheDocument()
  })

  it('shows no children anywhere else', () => {
    renderAt('/roster')
    expect(screen.queryByTestId('submenu-squad')).not.toBeInTheDocument()
    expect(screen.queryByTestId('submenu-schedule')).not.toBeInTheDocument()
  })
})

describe('Schedule sub-menu', () => {
  it('expands on /schedule with the two deep-links for squad staff', () => {
    renderAt('/schedule')
    const submenu = screen.getByTestId('submenu-schedule')
    expect(within(submenu).getByRole('link', { name: 'Add an event' })).toHaveAttribute(
      'href',
      '/schedule?open=add-event',
    )
    expect(within(submenu).getByRole('link', { name: 'Add to calendar' })).toHaveAttribute(
      'href',
      '/schedule?open=subscribe',
    )
  })

  it('hides Add an event from people without the Squad Hub gate', () => {
    renderAt('/schedule', { showSquadHub: false })
    const submenu = screen.getByTestId('submenu-schedule')
    expect(within(submenu).queryByRole('link', { name: 'Add an event' })).not.toBeInTheDocument()
    expect(within(submenu).getByRole('link', { name: 'Add to calendar' })).toBeInTheDocument()
  })
})
