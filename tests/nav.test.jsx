import { describe, it, expect } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
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
  // Chat joined on 23 Aug 2026; the More tab was retired on 29 Aug 2026 — its
  // contents moved to the masthead account menu (see AccountMenu.jsx).
  it('is exactly Home, Schedule, Roster, Chat, in that order', () => {
    expect(NAV_ITEMS.map((item) => item.label)).toEqual(['Home', 'Schedule', 'Roster', 'Chat'])
    expect(NAV_ITEMS.map((item) => item.to)).toEqual(['/', '/schedule', '/roster', '/chat'])
  })

  // The retired tab must not creep back onto the bar — its home is the account
  // menu now, and a second entry point is exactly the clutter the move removed.
  it('has no More tab', () => {
    expect(NAV_ITEMS.map((item) => item.to)).not.toContain('/more')
  })

  it('has no Ops tab — six dock items overlap on a phone', () => {
    expect(NAV_ITEMS.map((item) => item.to)).not.toContain('/ops')
  })
})

describe('Nav', () => {
  it('renders all four nav items as links', () => {
    renderNav()

    expect(screen.getByRole('link', { name: 'Home' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Schedule' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Roster' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Chat' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'More' })).not.toBeInTheDocument()
  })

  // The tab bar's Squad Hub entry (22 Aug 2026) — same showSquadHub gate the
  // sidebar uses, so a coach gets five tabs and a parent still gets four.
  it('has no Squad Hub tab by default', () => {
    renderNav()

    expect(screen.queryByRole('link', { name: 'Squad Hub' })).not.toBeInTheDocument()
    expect(document.querySelectorAll('nav a')).toHaveLength(4)
  })

  // ⚠️ Squad Hub sits BEFORE Chat (29 Aug 2026): Chat keeps the rightmost slot
  // so its short caption, not the long "SQUAD HUB" one, meets the dock's rounded
  // corner. See Nav.jsx. That invariant is unchanged.
  // ⚠️ HOME LEADS, ON THIS BAR TOO (Jay, 31 Aug 2026). Home was centred here
  // — and ONLY here — from 29 Aug; the reorder is gone and the dock now renders
  // NAV_ITEMS order with Squad Hub spliced in, in every view. This assertion is
  // the five-tab half of that rule; the four-tab half is the test below, and
  // the two must agree on Home's slot. See the tombstone in Nav.jsx.
  it('inserts Squad Hub before Chat when showSquadHub is set — five tabs, Home leading, no More', () => {
    renderNav('/', { showSquadHub: true })

    const squadHub = screen.getByRole('link', { name: 'Squad Hub' })
    expect(squadHub).toHaveAttribute('href', '/squad')
    const labels = [...document.querySelectorAll('[data-testid="dock-label"]')].map((el) => el.textContent)
    expect(labels).toEqual(['Home', 'Schedule', 'Roster', 'Squad Hub', 'Chat'])
    // Home FIRST, not at floor(5/2) === 2. A revived centring reorder puts it
    // there and fails this line — which is exactly what the injected fault did.
    expect(labels[0]).toBe('Home')
    expect(document.querySelectorAll('nav a')).toHaveLength(5)
  })

  // ⚠️ HOME STAYS FAR LEFT ON THE FOUR-TAB BAR. True since 30 Aug 2026 (#531),
  // when this bar was pulled back out of the centring experiment, and since
  // 31 Aug it is no longer an EXCEPTION — the five-tab test above now asserts
  // the same thing. Both are kept: they are the two bars a user can actually
  // see, and Home's slot must not diverge between them again. See Nav.jsx.
  it('keeps Home on the far left of the four-tab bar', () => {
    renderNav()

    const labels = [...document.querySelectorAll('[data-testid="dock-caption"]')].map((el) => el.textContent)
    expect(labels).toEqual(['Home', 'Schedule', 'Roster', 'Chat'])
    // Home leads — the natural NAV_ITEMS order, un-reordered.
    expect(labels[0]).toBe('Home')
  })

  // The PILL label (beside the icon) still belongs to the active tab only: it
  // slides open on the active one and stays collapsed to zero width on the
  // rest. The always-on caption under every icon is a separate element, tested
  // below.
  it('shows only the active tab pill label; the rest are collapsed', () => {
    renderNav('/roster')

    const labels = [...document.querySelectorAll('[data-testid="dock-label"]')]
    const open = labels.filter((el) => el.className.includes('max-w-[96px]'))
    const shut = labels.filter((el) => el.className.includes('max-w-0') && el.className.includes('opacity-0'))
    expect(open.map((el) => el.textContent)).toEqual(['Roster'])
    expect(shut).toHaveLength(labels.length - 1)
    // And every link is still named in full for assistive tech.
    expect(screen.getByRole('link', { name: 'Schedule' })).toBeInTheDocument()
  })

  // Captions (29 Aug 2026, Jay): every button carries a small label under its
  // icon so you can tell what it does without tapping. The text is present on
  // every tab; the ACTIVE tab's caption is hidden (its word rides in the pill
  // instead), the rest are shown.
  it('shows a caption under every button, hidden only on the active tab', () => {
    renderNav('/roster')

    const captions = [...document.querySelectorAll('[data-testid="dock-caption"]')]
    expect(captions.map((el) => el.textContent)).toEqual(['Home', 'Schedule', 'Roster', 'Chat'])

    const shown = captions.filter((el) => el.className.includes('opacity-100'))
    const hidden = captions.filter((el) => el.className.includes('opacity-0'))
    expect(hidden.map((el) => el.textContent)).toEqual(['Roster'])
    expect(shown).toHaveLength(captions.length - 1)
  })

  // The corner-ride fix (31 Aug 2026): the WIDE five-tab bar grows wider
  // (inset-x-1.5) and wears px-5 end padding from 360px up, so the long end
  // captions ("SCHEDULE") clear the dock's 22px corner curve while staying
  // DEAD-CENTRED under their icons — an inward end-caption nudge was tried
  // the same day and rejected by Jay as off-centre, so this also pins that
  // no translate other than the plain centring one is present. Below 360px
  // the pre-31-Aug rendering is kept exactly (at 320px the wider padding
  // would make neighbouring captions overlap, measured). jsdom computes no
  // pixels, so these pin the classes that produce the geometry — and that
  // the island keeps its own tuned px-2 (#530).
  it('widens the five-tab bar for corner room, captions dead-centred; the island is untouched', () => {
    renderNav('/', { showSquadHub: true })

    const wide = [...document.querySelectorAll('[data-testid="dock-caption"]')]
    expect(wide.map((el) => el.textContent)).toEqual(['Home', 'Schedule', 'Roster', 'Squad Hub', 'Chat'])
    for (const caption of wide) {
      expect(caption.className).toContain('-translate-x-1/2')
      expect(caption.className).not.toContain('calc(-50%')
    }
    const nav = document.querySelector('nav')
    expect(nav.className).toContain('min-[360px]:inset-x-1.5')
    expect(nav.className).toContain('min-[360px]:px-5')

    cleanup()
    renderNav('/')

    const island = document.querySelector('nav')
    expect(island.className).toContain('px-2')
    expect(island.className).not.toContain('min-[360px]')
    for (const caption of document.querySelectorAll('[data-testid="dock-caption"]')) {
      expect(caption.className).toContain('-translate-x-1/2')
    }
  })

  // Chrome-quarters (31 Aug 2026): the dock is opaque dark chrome again,
  // so idle items return to white — ink was for the clear-glass era when
  // the bar had to read over whatever scrolled beneath it.
  it('idle items are white on the chrome-quarters dock', () => {
    renderNav('/roster')
    const idle = [...document.querySelectorAll('nav a')].filter(
      (a) => a.getAttribute('aria-current') !== 'page',
    )
    expect(idle.length).toBeGreaterThan(0)
    for (const link of idle) {
      expect(link.className).toContain('text-white/90')
      expect(link.className).not.toContain('text-ink')
    }
  })

  // The motion pass (23 Aug 2026): the red pill is ONE element that slides to
  // the active tab. jsdom has no layout, so this pins the structure — a single
  // glider, keyed to the route so its bloom re-runs — not the geometry.
  it('renders exactly one glider, behind the links, re-keyed per route', () => {
    renderNav('/roster')

    const gliders = document.querySelectorAll('[data-testid="dock-glider"]')
    expect(gliders).toHaveLength(1)
    expect(gliders[0]).toHaveAttribute('aria-hidden', 'true')
    // The bloom is on the pill INSIDE the glider; the halo sits behind it.
    const pill = gliders[0].querySelector('.animate-dock-bloom')
    expect(pill).not.toBeNull()
    expect(pill.className).toMatch(/motion-reduce:animate-none/)
    expect(gliders[0].querySelector('.blur-xl')).not.toBeNull()
    // Decorative: no link carries the gradient any more.
    for (const link of document.querySelectorAll('nav a')) {
      expect(link.className).not.toMatch(/linear-gradient/)
    }
  })

  // Status dots (23 Aug 2026): a red dot on a tab with something new, and
  // the word "new" in its accessible name so the dot is never the only
  // signal. Never on the ACTIVE tab — you are looking at it.
  it('shows a dot and says "new" for a badged tab, but not on the active one', () => {
    renderNav('/', { badges: { '/chat': true, '/roster': true } })

    expect(screen.getByRole('link', { name: 'Chat, new' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Roster, new' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Home' })).toBeInTheDocument()
    expect(document.querySelectorAll('[data-testid="dock-dot"]')).toHaveLength(2)

    cleanup()
    renderNav('/chat', { badges: { '/chat': true } })
    // Active: the name still says new (it is true) but no dot is drawn.
    expect(document.querySelectorAll('[data-testid="dock-dot"]')).toHaveLength(0)
  })

  // Auto-hide: scrolling down past 80px slides the dock away; scrolling up
  // brings it back. jsdom has no layout, so scrollY is stubbed and the
  // scroll event fired by hand; the assertion is the data-hidden attribute.
  it('hides on a downward scroll and returns on an upward one', async () => {
    renderNav('/')
    const nav = document.querySelector('nav')
    const scrollTo = (y) => {
      Object.defineProperty(window, 'scrollY', { value: y, configurable: true })
      window.dispatchEvent(new Event('scroll'))
      return new Promise((resolve) => requestAnimationFrame(() => resolve()))
    }
    Object.defineProperty(document.documentElement, 'scrollHeight', { value: 3000, configurable: true })

    await scrollTo(100)
    await scrollTo(200)
    await waitFor(() => expect(nav).toHaveAttribute('data-hidden', 'true'))
    await scrollTo(150)
    await waitFor(() => expect(nav).not.toHaveAttribute('data-hidden'))
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

    await user.click(screen.getByRole('link', { name: 'Chat' }))

    expect(screen.getByRole('link', { name: 'Chat' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Home' })).not.toHaveAttribute('aria-current')
  })

  it('links point at the correct hrefs', () => {
    renderNav()

    expect(screen.getByRole('link', { name: 'Schedule' })).toHaveAttribute('href', '/schedule')
    expect(screen.getByRole('link', { name: 'Roster' })).toHaveAttribute('href', '/roster')
    expect(screen.getByRole('link', { name: 'Chat' })).toHaveAttribute('href', '/chat')
  })
})

// One Admin pill replaces the old pair (admin-dashboard plan, 2026-08-05):
// the Overview pill (admin OR coach, gated on `canManage`) and the Accounts
// pill (admin only, gated on `canManageAccounts`). /overview is deleted and
// /accounts is now a tab inside /admin, so there is one destination and one
// gate. NAV_ITEMS is deliberately just the four core destinations — the Admin
// pill is a conditional desktop-only extra, not a tab-bar item, so the "exactly
// Home, Schedule, Roster, Chat" assertion above still holds.
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

describe('the dock never carries Squad Hub AND Seniors (3 Sep 2026)', () => {
  // Six tabs overlapped on a phone the day Seniors shipped. A person with a
  // Squad Hub reaches the section from the Squad Hub page instead.
  it('shows Seniors only when there is no Squad Hub', () => {
    const { unmount } = render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Nav showSquadHub showSeniors />
      </MemoryRouter>,
    )
    expect(screen.getByRole('link', { name: /squad hub/i })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /seniors/i })).not.toBeInTheDocument()
    unmount()
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Nav showSeniors />
      </MemoryRouter>,
    )
    expect(screen.getByRole('link', { name: /seniors/i })).toHaveAttribute('href', '/seniors')
    expect(screen.queryByRole('link', { name: /squad hub/i })).not.toBeInTheDocument()
  })
})
