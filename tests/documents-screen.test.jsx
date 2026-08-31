import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// The documents-repo screen — /documents (task-6-brief.md). RLS decides who
// may READ/WRITE a document; this file exercises only what the screen OFFERS,
// mirroring the header comments in tests/pitches-screen.test.jsx and
// tests/notices.test.js's sibling: everything permission-shaped here is a UI
// convenience, and the real boundary lives in db/migrations/20260831_documents.sql.

const listDocumentsMock = vi.fn()
const signDocumentUrlMock = vi.fn()
const deleteDocumentMock = vi.fn()
const useMembershipsMock = vi.fn()

vi.mock('../src/data/documents.js', () => ({
  listDocuments: (...a) => listDocumentsMock(...a),
  signDocumentUrl: (...a) => signDocumentUrlMock(...a),
  deleteDocument: (...a) => deleteDocumentMock(...a),
}))

vi.mock('../src/lib/memberships.jsx', () => ({
  useMemberships: () => useMembershipsMock(),
}))

vi.mock('../src/lib/auth.jsx', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}))

// Import after vi.mock so this binds to the mocked modules.
const Documents = (await import('../src/screens/Documents.jsx')).default

const TEAM_U10 = { id: 'team-u10', name: 'U10', sort_order: 1 }
const TEAM_U12 = { id: 'team-u12', name: 'U12', sort_order: 2 }
const TEAMS = [TEAM_U10, TEAM_U12]

const PARENT = [{ id: 'm1', role: 'parent', status: 'active', team_id: 'team-u10' }]
const COACH = [{ id: 'm2', role: 'coach', status: 'active', team_id: 'team-u10' }]

function membershipsReturn(rows, teams = TEAMS) {
  return { memberships: rows, teams }
}

function doc(overrides = {}) {
  return {
    id: 'd1',
    title: 'Registration form',
    category: 'registration',
    staff_only: false,
    club_wide: true,
    storage_key: 'club/d1.pdf',
    file_name: 'form.pdf',
    file_size: 204800,
    content_type: 'application/pdf',
    created_by: 'user-2',
    created_at: '2026-08-20T10:00:00Z',
    document_squads: [],
    ...overrides,
  }
}

const REG_DOC = doc()
const COACHING_DOC = doc({
  id: 'd2',
  title: 'U10 training plan',
  category: 'coaching',
  staff_only: true,
  club_wide: false,
  storage_key: 'team-u10/d2.pdf',
  file_name: 'plan.pdf',
  file_size: 512000,
  created_by: 'user-3',
  created_at: '2026-08-21T10:00:00Z',
  document_squads: [{ team_id: 'team-u10' }],
})

beforeEach(() => {
  vi.clearAllMocks()
  listDocumentsMock.mockResolvedValue([COACHING_DOC, REG_DOC])
  signDocumentUrlMock.mockResolvedValue('https://signed.example/d1?token=abc')
  deleteDocumentMock.mockResolvedValue(undefined)
  useMembershipsMock.mockReturnValue(membershipsReturn(PARENT))
})

describe('Documents — loading the list', () => {
  it('renders rows from listDocuments', async () => {
    render(<Documents />)

    expect(await screen.findByText('Registration form')).toBeInTheDocument()
    expect(screen.getByText('U10 training plan')).toBeInTheDocument()
  })

  it('shows the empty-state copy when there are no documents', async () => {
    listDocumentsMock.mockResolvedValue([])
    render(<Documents />)

    expect(
      await screen.findByText('No documents yet — the club and your coaches can share files here.'),
    ).toBeInTheDocument()
  })
})

describe('Documents — category chips', () => {
  it('narrows the list to the clicked category', async () => {
    const user = userEvent.setup()
    render(<Documents />)

    await screen.findByText('Registration form')
    expect(screen.getByText('U10 training plan')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Coaching' }))

    expect(screen.getByText('U10 training plan')).toBeInTheDocument()
    expect(screen.queryByText('Registration form')).not.toBeInTheDocument()
  })
})

describe('Documents — "Add document"', () => {
  it('is absent for a parent-only membership', async () => {
    useMembershipsMock.mockReturnValue(membershipsReturn(PARENT))
    render(<Documents />)

    await screen.findByText('Registration form')
    expect(screen.queryByRole('button', { name: /add document/i })).not.toBeInTheDocument()
  })

  it('is present for a coach', async () => {
    useMembershipsMock.mockReturnValue(membershipsReturn(COACH))
    render(<Documents />)

    await screen.findByText('Registration form')
    expect(screen.getByRole('button', { name: /add document/i })).toBeInTheDocument()
  })
})

describe('Documents — opening a document', () => {
  // The title is a real <button> (data-testid="document-open") rather than a
  // role="button" Card, so that the Remove control is its SIBLING and not a
  // button nested inside another button. Query the control, not the container.
  function openButtonFor(title) {
    return screen.getByText(title).closest('[data-testid="document-open"]')
  }

  // ⚠️ `vi.spyOn(window.location, 'assign')` THROWS "Cannot redefine property"
  // — jsdom's Location instance is sealed. The whole `location` global IS
  // configurable though, so the way to observe a navigation is to replace it,
  // which is what vi.stubGlobal does (the same idiom tests/more.test.jsx and
  // tests/photo-positioner.test.jsx use for rAF). afterEach unstubs, so the
  // real location is back for every other file.
  function stubAssign() {
    const assign = vi.fn()
    vi.stubGlobal('location', { ...window.location, assign, href: window.location.href })
    return assign
  }

  afterEach(() => vi.unstubAllGlobals())

  it('signs the storage key and opens the signed url in a new tab', async () => {
    const user = userEvent.setup()
    // A truthy return = the popup was allowed, which is the desktop path.
    const fakeTab = {}
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(fakeTab)
    render(<Documents />)

    await screen.findByText('Registration form')
    await user.click(openButtonFor('Registration form'))

    await waitFor(() => expect(signDocumentUrlMock).toHaveBeenCalledWith('club/d1.pdf'))
    // ⚠️ EXACTLY TWO ARGUMENTS — 'noopener' MUST NOT COME BACK. With it,
    // window.open returns null BY SPEC even on success, the blocked-popup
    // fallback fires anyway, and the document opens in the new tab AND the
    // current one (Jay hit this live, 31 Aug 2026). Tabnabbing protection is
    // the opener-nulling assertion below instead.
    await waitFor(() =>
      expect(openSpy).toHaveBeenCalledWith('https://signed.example/d1?token=abc', '_blank'),
    )
    expect(fakeTab.opener).toBeNull()

    openSpy.mockRestore()
  })

  // ⚠️ THE iOS CASE, AND IT IS THE ONE THAT MATTERS MOST. The await on
  // signDocumentUrl ends the user-gesture context, so Safari and installed PWAs
  // block the popup: window.open returns null and throws NOTHING, which is why
  // the catch/friendlyMessage path cannot be what catches it. Without the
  // same-tab fallback the primary action of this whole feature silently does
  // nothing on an iPhone.
  //
  // The fault this discriminates against is the ORIGINAL code: drop the
  // `if (!opened)` line and this test fails while the one above still passes.
  it('falls back to same-tab navigation when the popup is blocked', async () => {
    const user = userEvent.setup()
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null)
    const assignSpy = stubAssign()
    render(<Documents />)

    await screen.findByText('Registration form')
    await user.click(openButtonFor('Registration form'))

    await waitFor(() =>
      expect(assignSpy).toHaveBeenCalledWith('https://signed.example/d1?token=abc'),
    )

    openSpy.mockRestore()
  })

  // The control for the pair above: an allowed popup must NOT also navigate the
  // current tab, or the fallback would be firing every time and the member
  // would lose the app behind the file on desktop too.
  it('does not navigate the current tab when the popup was allowed', async () => {
    const user = userEvent.setup()
    const openSpy = vi.spyOn(window, 'open').mockReturnValue({})
    const assignSpy = stubAssign()
    render(<Documents />)

    await screen.findByText('Registration form')
    await user.click(openButtonFor('Registration form'))

    await waitFor(() => expect(openSpy).toHaveBeenCalled())
    expect(assignSpy).not.toHaveBeenCalled()

    openSpy.mockRestore()
  })
})

describe('Documents — phone meta line', () => {
  // 31 Aug 2026 follow-up: the date was dropped from the phone row's meta
  // line in the cells restyle (the approved mock only named category ·
  // audience · size), then put back on Jay's say-so — same formatTableDate
  // formatting the row always used. jsdom leaves window.matchMedia
  // undefined, so this renders the phone layout by default.
  it('shows category, audience, size and date together on the row', async () => {
    render(<Documents />)

    const row = (await screen.findByText('Registration form')).closest(
      '[data-testid="document-row"]',
    )
    expect(
      within(row).getByText('Registration · Whole club · 200 kB · Thu, Aug 20'),
    ).toBeInTheDocument()
  })
})

describe('Documents — staff-only badge', () => {
  it('marks a staff-only row and leaves an ordinary row unmarked', async () => {
    render(<Documents />)

    const staffRow = (await screen.findByText('U10 training plan')).closest(
      '[data-testid="document-row"]',
    )
    const publicRow = (await screen.findByText('Registration form')).closest(
      '[data-testid="document-row"]',
    )

    expect(within(staffRow).getByText('Staff only')).toBeInTheDocument()
    expect(within(publicRow).queryByText('Staff only')).not.toBeInTheDocument()
  })
})

// "Cells" restyle (31 Aug 2026): staff-card rows on phones, a tile grid on
// desktop — the same isDesktop-branching idiom Roster.jsx/Schedule.jsx use.
// jsdom leaves window.matchMedia undefined, so useMediaQuery(DESKTOP_QUERY)
// defaults to false = phone; these tests stub it explicitly in both
// directions, same idiom as tests/schedule.test.jsx's stubDesktopViewport.
describe('Documents — responsive layout', () => {
  const LONG_TITLE =
    'A club registration and welfare policy pack for every squad, every season, and every coach to read in full'

  function stubMatchMedia(matches) {
    window.matchMedia = vi.fn().mockImplementation((query) => ({
      matches,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }))
  }

  afterEach(() => {
    delete window.matchMedia
  })

  it('renders staff-card rows on phone: no tile grid, and a long title is nowrap-truncated', async () => {
    stubMatchMedia(false)
    listDocumentsMock.mockResolvedValue([doc({ title: LONG_TITLE })])
    render(<Documents />)

    const title = await screen.findByText(LONG_TITLE)
    expect(screen.queryByTestId('document-grid')).not.toBeInTheDocument()
    expect(title.className).toMatch(/\btruncate\b/)
    expect(title.className).not.toMatch(/line-clamp/)
  })

  it('renders a tile grid on desktop, with a long title wrapped via line-clamp rather than truncated', async () => {
    stubMatchMedia(true)
    listDocumentsMock.mockResolvedValue([doc({ title: LONG_TITLE })])
    render(<Documents />)

    expect(await screen.findByTestId('document-grid')).toBeInTheDocument()
    const title = screen.getByText(LONG_TITLE)
    expect(title.className).toMatch(/line-clamp-3/)
    expect(title.className).not.toMatch(/\btruncate\b/)
  })

  it('desktop tiles still open the same title button and expose Remove as a sibling', async () => {
    stubMatchMedia(true)
    useMembershipsMock.mockReturnValue(membershipsReturn(COACH))
    listDocumentsMock.mockResolvedValue([COACHING_DOC, REG_DOC])
    render(<Documents />)

    await screen.findByTestId('document-grid')
    const openButton = screen
      .getByText('U10 training plan')
      .closest('[data-testid="document-open"]')
    expect(openButton).not.toBeNull()
    expect(openButton.tagName).toBe('BUTTON')

    const row = openButton.closest('[data-testid="document-row"]')
    expect(within(row).getByRole('button', { name: 'Remove' })).toBeInTheDocument()
  })
})
