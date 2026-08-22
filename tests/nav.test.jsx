import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import Nav, { NAV_ITEMS } from '../src/components/Nav.jsx'

// Unit tests for src/components/Nav.jsx (Task 8). Nav renders one tree used
// for both the mobile tab bar and the desktop top nav (CSS-responsive, see
// AppShell) — these tests only cover the shared behaviour: the four items,
// their routes, and NavLink's active-route wiring. No network involved.

const routerFuture = { v7_startTransition: true, v7_relativeSplatPath: true }

function renderNav(initialEntry = '/', props = {}) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]} future={routerFuture}>
      <Nav {...props} />
    </MemoryRouter>,
  )
}

describe('NAV_ITEMS', () => {
  it('is exactly Home, Schedule, Roster, More, in that order', () => {
    expect(NAV_ITEMS.map((item) => item.label)).toEqual(['Home', 'Schedule', 'Roster', 'More'])
    expect(NAV_ITEMS.map((item) => item.to)).toEqual(['/', '/schedule', '/roster', '/more'])
  })
})

describe('Nav', () => {
  it('renders all four nav items as links', () => {
    renderNav()

    expect(screen.getByRole('link', { name: 'Home' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Schedule' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Roster' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'More' })).toBeInTheDocument()
  })

  // The tab bar's Squad Hub entry (22 Aug 2026) — same showSquadHub gate the
  // sidebar uses, so a coach gets five tabs and a parent still gets four.
  it('has no Squad Hub tab by default', () => {
    renderNav()

    expect(screen.queryByRole('link', { name: 'Squad Hub' })).not.toBeInTheDocument()
    expect(document.querySelector('nav')).toHaveClass('grid-cols-4')
  })

  it('shows Squad Hub between Roster and More when showSquadHub is set, in a 5-column grid', () => {
    renderNav('/', { showSquadHub: true })

    const squadHub = screen.getByRole('link', { name: 'Squad Hub' })
    expect(squadHub).toHaveAttribute('href', '/squad')
    const labels = [...document.querySelectorAll('nav a span')].map((el) => el.textContent)
    expect(labels).toEqual(['Home', 'Schedule', 'Roster', 'Squad Hub', 'More'])
    expect(document.querySelector('nav')).toHaveClass('grid-cols-5')
  })

  it('marks Home active with aria-current="page" at the root route', () => {
    renderNav('/')

    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Schedule' })).not.toHaveAttribute('aria-current')
  })

  it('does not mark Home active on other routes (end matching on /)', () => {
    renderNav('/roster')

    expect(screen.getByRole('link', { name: 'Home' })).not.toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Roster' })).toHaveAttribute('aria-current', 'page')
  })

  it('clicking a nav item moves aria-current to the clicked item', async () => {
    const user = userEvent.setup()
    renderNav('/')

    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page')

    await user.click(screen.getByRole('link', { name: 'More' }))

    expect(screen.getByRole('link', { name: 'More' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Home' })).not.toHaveAttribute('aria-current')
  })

  it('links point at the correct hrefs', () => {
    renderNav()

    expect(screen.getByRole('link', { name: 'Schedule' })).toHaveAttribute('href', '/schedule')
    expect(screen.getByRole('link', { name: 'Roster' })).toHaveAttribute('href', '/roster')
    expect(screen.getByRole('link', { name: 'More' })).toHaveAttribute('href', '/more')
  })
})

// One Admin pill replaces the old pair (admin-dashboard plan, 2026-08-05):
// the Overview pill (admin OR coach, gated on `canManage`) and the Accounts
// pill (admin only, gated on `canManageAccounts`). /overview is deleted and
// /accounts is now a tab inside /admin, so there is one destination and one
// gate. NAV_ITEMS is deliberately still exactly four — the Admin pill is a
// conditional desktop-only extra, not a tab-bar item, so the "exactly Home,
// Schedule, Roster, More" assertion above still holds.
describe('Nav — Admin pill', () => {
  it('does not render an Admin link when canManageClub is false (default)', () => {
    renderNav()
    expect(screen.queryByRole('link', { name: 'Admin' })).not.toBeInTheDocument()
  })

  it('never renders an Admin link — the pill moved to the Sidebar in phase 2', () => {
    // The prop is gone; passing the old one must change nothing. The admin
    // gate now lives in AppShell -> Sidebar and tests/app-shell.test.jsx
    // still proves it role by role.
    renderNav('/', { canManageClub: true })

    const link = screen.queryByRole('link', { name: 'Admin' })
    expect(link).not.toBeInTheDocument()
  })

  // The two retired pills. Nothing should be able to bring them back by
  // passing the old prop names — a stale caller must render no pill at all
  // rather than silently linking to a route that no longer exists.
  it('never renders an Overview or Accounts pill, whatever props are passed', () => {
    renderNav('/', { canManage: true, canManageAccounts: true, canManageClub: true })

    expect(screen.queryByRole('link', { name: 'Overview' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Accounts' })).not.toBeInTheDocument()
  })
})
