import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

// The admin portal split — /admin is a chooser, each job is its own space.
// claude/decisions/2026-08-12-admin-portals.md
//
// ⚠️ EVERY ASSERTION HERE WAS PROVED AGAINST AN INJECTED FAULT before it was
// trusted (rule 6). The ones worth naming, because they are the ones a
// plausible "tidy-up" would break:
//   - Pitch Management links to ALLOCATION, not to the setup screen.
//   - A grey card is not a link IN THE MARKUP, so it cannot be tabbed to or
//     pressed. Styling it grey and leaving it a <Link> passes a screenshot and
//     fails a person.
//   - Social Media Management is grey for a SUPER admin, who implicitly holds
//     every right — because the reason is "no screen", not "no right".

const useMembershipsMock = vi.fn()
const useAuthMock = vi.fn()

vi.mock('../src/lib/memberships.jsx', () => ({
  useMemberships: () => useMembershipsMock(),
}))

vi.mock('../src/lib/auth.jsx', () => ({
  useAuth: () => useAuthMock(),
}))

// Import after vi.mock so these bind to the mocked modules.
import AdminDashboard from '../src/screens/AdminDashboard.jsx'
import PortalChooser from '../src/screens/PortalChooser.jsx'
import { PORTALS, closedReason, portalForPath, portalHome, portalLabel } from '../src/lib/portals.js'

const TEAMS = [{ id: 'team-u10', name: 'U10', sort_order: 5 }]

/** ⚠️ `status: 'active'` is load-bearing — adminRights() skips anything else. */
function admin(rights = [], extra = {}) {
  return [{ id: 'm1', role: 'admin', status: 'active', team_id: null, admin_rights: rights, ...extra }]
}

// ⚠️ `realMemberships` IS LOAD-BEARING HERE, NOT PADDING. ViewAsSwitcher gates
// on it and returns null without it — so a switcher assertion made against a
// fixture lacking it would pass for both branches and prove nothing. A test
// that cannot fail is worse than no test.
function memberships(rows) {
  return {
    memberships: rows,
    realMemberships: rows,
    teams: TEAMS,
    viewAs: null,
    setViewAs: vi.fn(),
    loading: false,
    error: null,
    reload: vi.fn(),
  }
}

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route path="/admin" element={<AdminDashboard />}>
          <Route index element={<PortalChooser />} />
          <Route path="accounts" element={<div>Accounts marker</div>} />
          <Route path="club" element={<div>Club marker</div>} />
          <Route path="allocation" element={<div>Allocation marker</div>} />
          <Route path="pitches" element={<div>Pitches marker</div>} />
          <Route path="youth" element={<div>Match sheets marker</div>} />
          <Route path="social" element={<div>What&apos;s on marker</div>} />
          <Route path="social/ideas" element={<div>Ideas marker</div>} />
        <Route path="training" element={<div>Library marker</div>} />
        <Route path="training/templates" element={<div>Templates marker</div>} />
        <Route path="training/publish" element={<div>Publish marker</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  useAuthMock.mockReturnValue({ user: { id: 'admin-1', email: 'jay@example.com' } })
})

describe('portals.js', () => {
  // Five since 23 Aug 2026: `welfare` (squad chat phase 3).
  it('labels the five jobs from scope.js, so the naming ruling has one home', () => {
    const byKey = Object.fromEntries(PORTALS.map((p) => [p.key, portalLabel(p)]))
    expect(byKey).toEqual({
      club: 'Club Admin',
      pitches: 'Pitch Management',
      youth: 'Club Youth Manager',
      media: 'Social Media Management',
      training: 'Rugby Performance Director',
      welfare: 'Welfare',
    })
  })

  it('⚠️ enters Pitch Management at ALLOCATION, the weekly job — not the setup screen', () => {
    const pitches = PORTALS.find((p) => p.key === 'pitches')
    expect(portalHome(pitches)).toBe('/admin/allocation')
  })

  it('maps every tab URL back to its own portal, and bare /admin to none', () => {
    expect(portalForPath('/admin')).toBeNull()
    expect(portalForPath('/admin/accounts').key).toBe('club')
    expect(portalForPath('/admin/club').key).toBe('club')
    expect(portalForPath('/admin/allocation').key).toBe('pitches')
    expect(portalForPath('/admin/pitches').key).toBe('pitches')
    expect(portalForPath('/admin/youth').key).toBe('youth')
    // ⚠️ NESTED, like /admin/social — the child paths must land in the SAME
    // portal, not fall through to the chooser.
    expect(portalForPath('/admin/training').key).toBe('training')
    expect(portalForPath('/admin/training/templates').key).toBe('training')
    expect(portalForPath('/admin/training/publish').key).toBe('training')
  })

  // ⚠️ TESTED AGAINST A SYNTHETIC PORTAL, NOT A REAL ONE, AND ON PURPOSE.
  // Until Social Media Management shipped its screens later on 12 Aug 2026,
  // `media` was the live example of a screenless portal and this asserted
  // against it. Every real portal now has tabs — so pointing this at PORTALS
  // would leave the rule untested the moment it had nothing to bite on.
  // The rule is what matters: no tabs means closed, whatever the right says.
  // (Rot rule: repoint an anchor, never delete it.)
  it('⚠️ closes a portal with no screens even for somebody holding the right', () => {
    const screenless = { key: 'ghost', right: 'media', blurb: '', tabs: [] }
    expect(closedReason(screenless, admin(['media']))).toBe('no-screen')
    // And a super admin, who holds every right implicitly.
    expect(closedReason(screenless, admin([], { is_super: true }))).toBe('no-screen')
    expect(portalHome(screenless)).toBeNull()
  })

  it('every real portal now has at least one screen', () => {
    for (const portal of PORTALS) {
      expect(portal.tabs.length).toBeGreaterThan(0)
    }
  })

  it('distinguishes "no right" from "no screen" — different problems, different fixes', () => {
    const pitches = PORTALS.find((p) => p.key === 'pitches')
    expect(closedReason(pitches, admin([]))).toBe('no-right')
    expect(closedReason(pitches, admin(['pitches']))).toBeNull()
  })
})

describe('PortalChooser', () => {
  it('renders ALL six cards for an admin with no extra rights, only one of them a link', () => {
    useMembershipsMock.mockReturnValue(memberships(admin([])))
    renderAt('/admin')

    expect(screen.getAllByTestId(/^portal-card-/)).toHaveLength(6)
    const open = screen.getAllByTestId('portal-card-open')
    expect(open).toHaveLength(1)
    expect(open[0]).toHaveAttribute('href', '/admin/accounts')
    expect(within(open[0]).getByRole('heading')).toHaveTextContent('Club Admin')
  })

  it('⚠️ a grey card is NOT a link and cannot be focused', () => {
    useMembershipsMock.mockReturnValue(memberships(admin([])))
    renderAt('/admin')

    for (const card of screen.getAllByTestId('portal-card-closed')) {
      expect(card.tagName).not.toBe('A')
      expect(card).not.toHaveAttribute('href')
      expect(card.querySelector('a')).toBeNull()
      expect(card.querySelector('button')).toBeNull()
    }
  })

  it('opens Pitch Management for a holder, pointing at Allocation', () => {
    useMembershipsMock.mockReturnValue(memberships(admin(['pitches'])))
    renderAt('/admin')

    const open = screen.getAllByTestId('portal-card-open')
    expect(open.map((el) => el.getAttribute('href'))).toEqual(['/admin/accounts', '/admin/allocation'])
  })

  // The fourth job (21 Aug 2026). Its card behaves exactly like the other
  // three — which is the point of there being one PORTALS list.
  it('offers the Rugby Performance Director card to an admin holding training', () => {
    useMembershipsMock.mockReturnValue(memberships(admin(['training'])))
    renderAt('/admin')

    const card = screen.getByRole('link', { name: /Rugby Performance Director/ })
    // ⚠️ tabs[0] — entering the portal lands on the Library, not on Publish.
    expect(card).toHaveAttribute('href', '/admin/training')
  })

  // ⚠️ THE GREY CARD, ASSERTED IN WORDS AND IN MARKUP. Colour alone cannot say
  // WHY a card is closed (claude/specs/accessibility.md), and a grey <Link>
  // would pass a screenshot while still being pressable.
  it('greys the card for an admin without the right, in words', () => {
    useMembershipsMock.mockReturnValue(memberships(admin(['youth'])))
    renderAt('/admin')

    expect(screen.queryByRole('link', { name: /Rugby Performance Director/ })).toBeNull()

    const card = screen
      .getAllByTestId('portal-card-closed')
      .find((el) => el.textContent.includes('Rugby Performance Director'))
    expect(card).toBeDefined()
    // "no right", not "no screen" — the two have different fixes.
    expect(card).toHaveAttribute('data-reason', 'no-right')
    expect(card).toHaveTextContent(/hasn’t been added to your account/i)
    expect(card.querySelector('a')).toBeNull()
    expect(card.querySelector('button')).toBeNull()
  })

  // ⚠️ THIS TEST USED TO ASSERT THE OPPOSITE. Until Social Media Management
  // shipped its two screens later on 12 Aug 2026, a super admin saw three open
  // cards and one grey. It is rewritten rather than deleted because the claim
  // it makes is the durable one: a super admin holds every right implicitly,
  // so nothing is closed to them for want of a right.
  it('⚠️ opens every portal for a SUPER admin, who holds every right implicitly', () => {
    useMembershipsMock.mockReturnValue(memberships(admin([], { is_super: true })))
    renderAt('/admin')

    expect(screen.getAllByTestId('portal-card-open')).toHaveLength(6)
    expect(screen.queryAllByTestId('portal-card-closed')).toHaveLength(0)
    expect(screen.getByRole('link', { name: /Social Media Management/ }))
      .toHaveAttribute('href', '/admin/social')
  })

  it('tells somebody without the job how to get it, which is a different message', () => {
    useMembershipsMock.mockReturnValue(memberships(admin([])))
    renderAt('/admin')

    const pitchCard = screen
      .getAllByTestId('portal-card-closed')
      .find((el) => el.textContent.includes('Pitch Management'))
    expect(pitchCard).toHaveAttribute('data-reason', 'no-right')
    expect(pitchCard).toHaveTextContent(/super admin can add it on the Accounts screen/i)
  })

  // ⚠️ THE 12 Aug RULE WAS "the chooser carries the View-as switcher, which
  // portals do not", AND IT IS GONE — 14 Aug 2026, Jay: from any screen. The
  // switcher is in the masthead now, so the chooser and every portal are on
  // equal terms and NEITHER renders one of its own.
  //
  // ⚠️ THE ASSERTION IS KEPT RATHER THAN DELETED, INVERTED TO PIN THE NEW RULE:
  // no screen under /admin may grow its own copy. Two copies of one control
  // drift, and the two would have sat six inches apart doing the same job.
  //
  // ⚠️ These render AdminDashboard WITHOUT AppShell, so the masthead is not in
  // the tree at all — which is exactly what makes this a test of the SCREEN
  // rather than of the shell. tests/view-as.test.jsx covers the masthead copy.
  it('grows no View-as switcher of its own — nor does any portal', () => {
    useMembershipsMock.mockReturnValue(memberships(admin(['pitches'])))
    const { unmount } = renderAt('/admin')
    expect(screen.queryByTestId('view-as-trigger')).not.toBeInTheDocument()
    unmount()

    useMembershipsMock.mockReturnValue(memberships(admin(['pitches'])))
    renderAt('/admin/allocation')
    expect(screen.queryByTestId('view-as-trigger')).not.toBeInTheDocument()
  })

  it('shows no tab row on the chooser itself', () => {
    useMembershipsMock.mockReturnValue(memberships(admin(['pitches', 'youth'])))
    renderAt('/admin')

    expect(screen.queryByRole('navigation', { name: /admin sections/i })).not.toBeInTheDocument()
  })
})

describe('AdminDashboard — inside a portal', () => {
  it('shows only that portal’s tabs, not every tab the person is entitled to', () => {
    useMembershipsMock.mockReturnValue(memberships(admin(['pitches', 'youth'])))
    renderAt('/admin/allocation')

    const tabs = screen.getByRole('navigation', { name: /admin sections/i })
    expect(within(tabs).getAllByRole('link').map((el) => el.textContent)).toEqual([
      'Allocation',
      'Pitches',
    ])
    // The old single row would have carried these too.
    expect(within(tabs).queryByText('Accounts')).not.toBeInTheDocument()
    expect(within(tabs).queryByText('Match sheets')).not.toBeInTheDocument()
  })

  // ⚠️ Jay went looking for where league team names are created on 12 Aug 2026
  //    and could not tell from the word "Club" which tab held them. That screen
  //    is what fixes an empty TEAM box on an RCM match sheet, so being unable to
  //    find it has a consequence beyond annoyance.
  it('⚠️ names the league-team tab after the JOB, not after the container', () => {
    useMembershipsMock.mockReturnValue(memberships(admin([])))
    renderAt('/admin/accounts')

    const tabs = screen.getByRole('navigation', { name: /admin sections/i })
    // ⚠️ ORDER IS ASSERTED, NOT JUST MEMBERSHIP. Entering a portal lands on
    // tabs[0], so a reordering that put Staff (added 13 Aug 2026) first would
    // silently change where every admin arrives — the same trap the Allocation
    // note in src/lib/portals.js records from the other direction.
    expect(within(tabs).getAllByRole('link').map((el) => el.textContent)).toEqual([
      'Accounts',
      'Squads & league teams',
      'Staff',
      'Needs attention',
    ])
    expect(within(tabs).queryByText(/^Club$/)).not.toBeInTheDocument()
  })

  // ⚠️ THE FIRST TAB WHOSE AUDIENCE IS NARROWER THAN ITS PORTAL'S (17 Aug 2026).
  //    Club Admin has no `right` — every admin holds it — but the Rights log
  //    records what admins DO, so an ordinary admin must not be among the people
  //    it is offered to. The pair below is the whole point: same portal, same
  //    URL, different row.
  it('⚠️ offers the Rights log to a SUPER admin only, in the same portal', () => {
    useMembershipsMock.mockReturnValue(memberships(admin([], { is_super: true })))
    renderAt('/admin/accounts')

    const tabs = screen.getByRole('navigation', { name: /admin sections/i })
    expect(within(tabs).getAllByRole('link').map((el) => el.textContent)).toEqual([
      'Accounts',
      'Squads & league teams',
      'Staff',
      'Needs attention',
      'Rights log',
    ])
  })

  it('⚠️ hides it from an ordinary club admin, who holds the same portal', () => {
    useMembershipsMock.mockReturnValue(memberships(admin([])))
    renderAt('/admin/accounts')

    const tabs = screen.getByRole('navigation', { name: /admin sections/i })
    expect(within(tabs).queryByText('Rights log')).not.toBeInTheDocument()
  })

  // ⚠️ HIDING A TAB IS NOT A PERMISSION, and this is the assertion that stops
  //    anyone reading it as one. The URL must still resolve to the Club Admin
  //    portal for an ordinary admin — they land inside it and the SCREEN
  //    explains itself, which is what every other admin route already does. The
  //    refusal that matters is membership_audit's read policy, not this row.
  it('⚠️ still maps /admin/rights-log to Club Admin for an ordinary admin', () => {
    expect(portalForPath('/admin/rights-log')?.key).toBe('club')
  })

  // ⚠️ NOT TIDINESS. A bare `flex` row does not clip when it overruns — the
  //    DOCUMENT gets wider than the viewport, and every element sized to the
  //    viewport then renders short or clipped on screens three away. That is
  //    already recorded against Schedule's header, where one bug read as four.
  it('⚠️ lets the tab row WRAP, so a long label cannot widen the document', () => {
    useMembershipsMock.mockReturnValue(memberships(admin([])))
    renderAt('/admin/accounts')

    expect(screen.getByRole('navigation', { name: /admin sections/i })).toHaveClass('flex-wrap')
  })

  it('titles the screen with the portal and offers a way back', () => {
    useMembershipsMock.mockReturnValue(memberships(admin(['pitches'])))
    renderAt('/admin/allocation')

    expect(screen.getByRole('heading', { name: 'Pitch Management' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Admin/ })).toHaveAttribute('href', '/admin')
  })

  // ⚠️ THE NESTED-TAB TRAP, AND THE ONLY PLACE IN THE APP THAT HAS IT.
  // /admin/social/ideas starts with /admin/social, so a NavLink without `end`
  // is active for its own path AND everything beneath it — "What's on" would
  // light up while you are standing on "Ideas". Two tabs marked current is
  // worse than none. Every other admin tab is a leaf, so nothing caught this
  // before Social Media Management shipped.
  it('⚠️ marks only the tab you are ON, not its parent, on a nested route', () => {
    useMembershipsMock.mockReturnValue(memberships(admin(['media'])))
    renderAt('/admin/social/ideas')

    const tabs = screen.getByRole('navigation', { name: /admin sections/i })
    const whatsOn = within(tabs).getByRole('link', { name: /What’s on/ })
    const ideas = within(tabs).getByRole('link', { name: 'Ideas' })

    expect(ideas).toHaveAttribute('aria-current', 'page')
    expect(whatsOn).not.toHaveAttribute('aria-current')
  })

  it('marks the parent tab when you are actually on it', () => {
    useMembershipsMock.mockReturnValue(memberships(admin(['media'])))
    renderAt('/admin/social')

    const tabs = screen.getByRole('navigation', { name: /admin sections/i })
    expect(within(tabs).getByRole('link', { name: /What’s on/ })).toHaveAttribute('aria-current', 'page')
    expect(within(tabs).getByRole('link', { name: 'Ideas' })).not.toHaveAttribute('aria-current')
  })

  // ⚠️ THE SECOND NESTED PORTAL, AND IT HAS THE TRAP TWICE OVER.
  // /admin/training/templates and /admin/training/publish both start with
  // /admin/training, so a NavLink without `end` would light "Library" up on all
  // three screens. Social Media Management proved the rule; this proves it did
  // not stop applying when a second portal was nested the same way.
  it('⚠️ marks only the training tab you are ON, not its parent', () => {
    useMembershipsMock.mockReturnValue(memberships(admin(['training'])))
    renderAt('/admin/training/templates')

    const tabs = screen.getByRole('navigation', { name: /admin sections/i })
    expect(within(tabs).getAllByRole('link').map((el) => el.textContent)).toEqual([
      'Library',
      'Templates',
      'Publish',
    ])
    expect(within(tabs).getByRole('link', { name: 'Templates' })).toHaveAttribute('aria-current', 'page')
    expect(within(tabs).getByRole('link', { name: 'Library' })).not.toHaveAttribute('aria-current')
    expect(screen.getByRole('heading', { name: 'Rugby Performance Director' })).toBeInTheDocument()
  })

  it('marks the Library tab when you are actually on it', () => {
    useMembershipsMock.mockReturnValue(memberships(admin(['training'])))
    renderAt('/admin/training')

    const tabs = screen.getByRole('navigation', { name: /admin sections/i })
    expect(within(tabs).getByRole('link', { name: 'Library' })).toHaveAttribute('aria-current', 'page')
    expect(within(tabs).getByRole('link', { name: 'Templates' })).not.toHaveAttribute('aria-current')
  })

  it('⚠️ draws NO tab row for a one-tab portal', () => {
    useMembershipsMock.mockReturnValue(memberships(admin(['youth'])))
    renderAt('/admin/youth')

    expect(screen.getByRole('heading', { name: 'Club Youth Manager' })).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: /admin sections/i })).not.toBeInTheDocument()
  })

  it('still refuses a non-admin, unchanged', () => {
    useMembershipsMock.mockReturnValue(memberships([{ id: 'm2', role: 'coach', status: 'active', team_id: 'team-u10' }]))
    renderAt('/admin')

    expect(screen.getByText('Not authorised')).toBeInTheDocument()
    expect(screen.queryByTestId('portal-chooser')).not.toBeInTheDocument()
  })
})
