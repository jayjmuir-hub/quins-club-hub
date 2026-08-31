import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import userEvent from '@testing-library/user-event'

// SquadDocumentsCard — the Squad Hub's "staff door" onto the documents repo
// (task-7-brief.md). Squad Hub is staff-only by construction (canEditTeam
// already gated the page before this card ever mounts), so this file tests
// only what the CARD does with a squad's documents — filtering, capping,
// signing/opening, and handing DocumentUploadSheet a locked squad.

const listDocumentsMock = vi.fn()
const signDocumentUrlMock = vi.fn()
const uploadDocumentMock = vi.fn()
const useMembershipsMock = vi.fn()

vi.mock('../src/data/documents.js', () => ({
  listDocuments: (...a) => listDocumentsMock(...a),
  signDocumentUrl: (...a) => signDocumentUrlMock(...a),
  uploadDocument: (...a) => uploadDocumentMock(...a),
}))

vi.mock('../src/lib/memberships.jsx', () => ({
  useMemberships: () => useMembershipsMock(),
}))

// Import after vi.mock so this binds to the mocked module.
const SquadDocumentsCard = (await import('../src/components/SquadDocumentsCard.jsx')).default

const TEAM_U10 = { id: 'team-u10', name: 'U10' }
const TEAM_U12 = { id: 'team-u12', name: 'U12' }
const TEAMS = [TEAM_U10, TEAM_U12]
const COACH_MEMBERSHIPS = [{ id: 'm1', role: 'coach', status: 'active', team_id: 'team-u10' }]

function doc(overrides = {}) {
  return {
    id: 'd1',
    title: 'Some doc',
    category: 'other',
    staff_only: false,
    club_wide: false,
    storage_key: 'team-u10/d1.pdf',
    file_name: 'd1.pdf',
    file_size: 1024,
    content_type: 'application/pdf',
    created_by: 'user-1',
    created_at: '2026-08-20T10:00:00Z',
    document_squads: [{ team_id: 'team-u10' }],
    ...overrides,
  }
}

// Invented names — this repo is public.
const SQUAD_DOC = doc({ id: 'squad-doc', title: 'U10 kit list' })
const CLUB_DOC = doc({
  id: 'club-doc',
  title: 'Club handbook',
  club_wide: true,
  document_squads: [],
})
const OTHER_SQUAD_DOC = doc({
  id: 'other-squad-doc',
  title: 'U12 training plan',
  document_squads: [{ team_id: 'team-u12' }],
})

function renderCard(props = {}) {
  return render(
    <MemoryRouter>
      <SquadDocumentsCard teamId="team-u10" teamName="U10" {...props} />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  listDocumentsMock.mockResolvedValue([SQUAD_DOC, CLUB_DOC, OTHER_SQUAD_DOC])
  signDocumentUrlMock.mockResolvedValue('https://signed.example/squad-doc?token=abc')
  uploadDocumentMock.mockResolvedValue({ id: 'new-doc' })
  useMembershipsMock.mockReturnValue({ memberships: COACH_MEMBERSHIPS, teams: TEAMS, loading: false })
})

describe('SquadDocumentsCard — what it shows', () => {
  it('renders the squad doc and a club-wide doc, but not another squad\'s', async () => {
    renderCard()

    expect(await screen.findByText('U10 kit list')).toBeInTheDocument()
    expect(screen.getByText('Club handbook')).toBeInTheDocument()
    expect(screen.queryByText('U12 training plan')).not.toBeInTheDocument()
  })

  it('shows the empty-state copy when the squad has no documents', async () => {
    listDocumentsMock.mockResolvedValue([])
    renderCard()

    expect(await screen.findByText(/no documents/i)).toBeInTheDocument()
  })
})

describe('SquadDocumentsCard — the cap', () => {
  it('caps the list at 8 rows and offers "See all"', async () => {
    const many = Array.from({ length: 12 }, (_, i) =>
      doc({
        id: `many-${i}`,
        title: `Doc ${i}`,
        created_at: `2026-08-${String(i + 1).padStart(2, '0')}T10:00:00Z`,
      }))
    listDocumentsMock.mockResolvedValue(many)
    renderCard()

    await screen.findByText('Doc 11') // newest first — created_at 12th is newest
    const rows = screen.getAllByTestId('squad-document-row')
    expect(rows).toHaveLength(8)
    const seeAll = screen.getByRole('link', { name: /see all/i })
    expect(seeAll).toHaveAttribute('href', '/documents')
  })
})

describe('SquadDocumentsCard — opening a row', () => {
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

  it('signs the row\'s storage key and opens the signed url in a new tab', async () => {
    const user = userEvent.setup()
    // A truthy return = the popup was allowed, which is the desktop path.
    const fakeTab = {}
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(fakeTab)
    renderCard()

    const row = (await screen.findByText('U10 kit list')).closest('[data-testid="squad-document-row"]')
    await user.click(row)

    expect(signDocumentUrlMock).toHaveBeenCalledWith('team-u10/d1.pdf')
    await screen.findByText('U10 kit list') // still there, nothing crashed
    // ⚠️ EXACTLY TWO ARGUMENTS — 'noopener' MUST NOT COME BACK. With it,
    // window.open returns null BY SPEC even on success, so the blocked-popup
    // fallback also navigated the current tab and the document opened TWICE
    // (Jay hit this live, 31 Aug 2026). Tabnabbing protection is the
    // opener-nulling assertion below instead.
    await vi.waitFor(() =>
      expect(openSpy).toHaveBeenCalledWith(
        'https://signed.example/squad-doc?token=abc',
        '_blank',
      ),
    )
    expect(fakeTab.opener).toBeNull()

    openSpy.mockRestore()
  })

  // ⚠️ THE iOS CASE. The await on signDocumentUrl ends the user-gesture
  // context, so Safari and installed PWAs block the popup: window.open returns
  // null and throws NOTHING, so the catch/friendlyMessage path cannot catch it.
  // Without the same-tab fallback, tapping a document in the Squad Hub silently
  // does nothing on an iPhone. Drop the `if (!opened)` line in the component and
  // this test fails while the one above still passes.
  it('falls back to same-tab navigation when the popup is blocked', async () => {
    const user = userEvent.setup()
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null)
    const assignSpy = stubAssign()
    renderCard()

    const row = (await screen.findByText('U10 kit list')).closest('[data-testid="squad-document-row"]')
    await user.click(row)

    await vi.waitFor(() =>
      expect(assignSpy).toHaveBeenCalledWith('https://signed.example/squad-doc?token=abc'),
    )

    openSpy.mockRestore()
  })

  // The control: an allowed popup must NOT also navigate the current tab.
  it('does not navigate the current tab when the popup was allowed', async () => {
    const user = userEvent.setup()
    const openSpy = vi.spyOn(window, 'open').mockReturnValue({})
    const assignSpy = stubAssign()
    renderCard()

    const row = (await screen.findByText('U10 kit list')).closest('[data-testid="squad-document-row"]')
    await user.click(row)

    await vi.waitFor(() => expect(openSpy).toHaveBeenCalled())
    expect(assignSpy).not.toHaveBeenCalled()

    openSpy.mockRestore()
  })
})

describe('SquadDocumentsCard — Add', () => {
  it('opens DocumentUploadSheet with the squad locked, hiding the checkboxes', async () => {
    const user = userEvent.setup()
    renderCard()

    await screen.findByText('U10 kit list')
    await user.click(screen.getByRole('button', { name: /add/i }))

    expect(await screen.findByRole('heading', { name: 'Add document' })).toBeInTheDocument()
    // fixedTeamId hides the age-group picker entirely (DocumentUploadSheet's
    // own contract) — no squad checkboxes on offer.
    expect(screen.queryByText('Age groups')).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: 'U10' })).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: 'U12' })).not.toBeInTheDocument()
  })

  it('reloads the list once a document is uploaded', async () => {
    const user = userEvent.setup()
    renderCard()

    await screen.findByText('U10 kit list')
    expect(listDocumentsMock).toHaveBeenCalledTimes(1)

    await user.click(screen.getByRole('button', { name: /add/i }))
    await screen.findByRole('heading', { name: 'Add document' })

    const file = new File(['x'], 'kit-list.pdf', { type: 'application/pdf' })
    await user.upload(screen.getByLabelText('File'), file)
    await user.click(screen.getByRole('button', { name: /add document/i }))

    await vi.waitFor(() => expect(uploadDocumentMock).toHaveBeenCalled())
    // Against the fault "close the sheet but never reload": listDocuments
    // would still show its first-mount count only.
    await vi.waitFor(() => expect(listDocumentsMock).toHaveBeenCalledTimes(2))
  })
})
