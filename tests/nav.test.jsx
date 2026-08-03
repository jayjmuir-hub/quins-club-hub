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

describe('Nav — Overview link (Task 4)', () => {
  it('does not render an Overview link when canManage is false (default)', () => {
    renderNav()
    expect(screen.queryByRole('link', { name: 'Overview' })).not.toBeInTheDocument()
  })

  it('renders an Overview link, hidden on mobile, when canManage is true', () => {
    renderNav('/', { canManage: true })

    const link = screen.getByRole('link', { name: 'Overview' })
    expect(link).toBeInTheDocument()
    expect(link).toHaveAttribute('href', '/overview')
    expect(link.className).toMatch(/\bhidden\b/)
    expect(link.className).toMatch(/desktop:flex/)
  })
})

// Accounts is admin-only, unlike Overview (admin OR coach), so it gets its
// own prop. NAV_ITEMS is deliberately still exactly four — like Overview,
// Accounts is a conditional desktop-only extra rather than a tab-bar item,
// so the "exactly Home, Schedule, Roster, More" assertion above still holds.
describe('Nav — Accounts link (design spec 2026-08-03 §2)', () => {
  it('does not render an Accounts link by default', () => {
    renderNav()
    expect(screen.queryByRole('link', { name: 'Accounts' })).not.toBeInTheDocument()
  })

  it('does not render an Accounts link for a coach (canManage alone is not enough)', () => {
    renderNav('/', { canManage: true })
    expect(screen.queryByRole('link', { name: 'Accounts' })).not.toBeInTheDocument()
  })

  it('renders an Accounts link, hidden on mobile, when canManageAccounts is true', () => {
    renderNav('/', { canManage: true, canManageAccounts: true })

    const link = screen.getByRole('link', { name: 'Accounts' })
    expect(link).toHaveAttribute('href', '/accounts')
    expect(link.className).toMatch(/\bhidden\b/)
    expect(link.className).toMatch(/desktop:flex/)
  })
})
