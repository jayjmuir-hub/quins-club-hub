import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Tests for the desktop roster table (desktop-spec.md §5.1) and its inline
// editing. The mobile card list is covered by tests/roster.test.jsx and is
// deliberately untouched by this file.
//
// Desktop is selected by stubbing window.matchMedia rather than by a shared
// setup flag, so the intent is visible here: jsdom does not implement
// matchMedia, useMediaQuery returns false without it, and every other suite
// therefore keeps rendering the mobile branch. That is the whole reason the
// switch is made in JS — a CSS-only switch would leave both the cards and the
// table in the DOM and make every by-name query ambiguous.
//
// The failure-mode tests are the ones that matter. Inline editing writes
// straight to the database, so a refusal has to put the old value back and
// say so in the row that caused it.

const useMembershipsMock = vi.fn()
const listPlayersMock = vi.fn()
const upsertPlayerMock = vi.fn()
const savePlayerPositionsMock = vi.fn()
const listPlayerPositionsMock = vi.fn()

// Positions live in staff-only player_positions since 25 Aug 2026; the screen
// decorates its rows from this map for staff, and the inline editor writes
// through savePlayerPositions rather than the players row.
vi.mock('../src/data/playerTiers.js', () => ({
  listPlayerGrades: vi.fn(async () => new Map()),
  listPlayerUnits: vi.fn(async () => new Map()),
  listPlayerPositions: (...a) => listPlayerPositionsMock(...a),
  savePlayerPositions: (...a) => savePlayerPositionsMock(...a),
}))

vi.mock('../src/lib/memberships.jsx', () => ({
  useMemberships: () => useMembershipsMock(),
}))

// The photo bucket is private, so a viewable URL has to be signed. Mocked
// here because the table now renders faces: without it the photo test would
// reach for the network. The no-photo tests never call it — Roster skips the
// signing effect entirely when no player has a photo_path.
vi.mock('../src/data/photos.js', () => ({
  signPhotoUrl: vi.fn().mockResolvedValue('https://signed.example/single.jpg'),
  signPhotoUrls: vi.fn(async (paths) =>
    Object.fromEntries(paths.map((p) => [p, `https://signed.example/${p.split('/').pop()}`]))),
}))

vi.mock('../src/data/players.js', () => ({
  // ⚠️ The roster reads birthdays for staff since 17 Aug 2026 to show an age.
  // An omitted export is undefined and throws from inside an effect.
  listPlayerPrivate: () => Promise.resolve([]),
  // PlayerDetail shows a birthday when there is one; null is the honest default.
  getPlayerDob: () => Promise.resolve(null),
  listPlayers: (...a) => listPlayersMock(...a),
  getPlayerContact: vi.fn().mockResolvedValue(null),
  upsertPlayer: (...a) => upsertPlayerMock(...a),
}))

import Roster from '../src/screens/Roster.jsx'

const TEAM_U10 = { id: 'team-u10', name: 'U10', sort_order: 5 }
const TEAM_U12 = { id: 'team-u12', name: 'U12', sort_order: 6 }
const TEAMS = [TEAM_U10, TEAM_U12]

const ADMIN = [{ id: 'm1', role: 'admin', status: 'active', team_id: null }]
const COACH_U10 = [{ id: 'm2', role: 'coach', team_id: 'team-u10' }]

const TOM = { id: 'p1', team_id: 'team-u10', full_name: 'Tom Fletcher', position: 'Flanker', is_captain: true }
const AMY = { id: 'p2', team_id: 'team-u12', full_name: 'Amy Rose', position: 'Wing', is_captain: false }
const ZAC = { id: 'p3', team_id: 'team-u10', full_name: 'Zac Bell', position: null, is_captain: false }

function setDesktop(isDesktop = true) {
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches: isDesktop,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
  }))
}

beforeEach(() => {
  vi.clearAllMocks()
  setDesktop(true)
  useMembershipsMock.mockReturnValue({ memberships: ADMIN, teams: TEAMS })
  listPlayersMock.mockResolvedValue([TOM, AMY, ZAC])
  upsertPlayerMock.mockImplementation(async (p) => ({ ...p }))
  savePlayerPositionsMock.mockResolvedValue([])
  // Mirrors the inline fixture positions on TOM and AMY above — the fixture
  // fields themselves are ignored for a staff viewer.
  listPlayerPositionsMock.mockResolvedValue(new Map([
    ['p1', ['Flanker']],
    ['p2', ['Wing']],
  ]))
})

const rows = () => screen.getAllByTestId('roster-table-row')
const names = () => screen.getAllByTestId('table-player-name').map((n) => n.textContent)

describe('RosterTable — rendering', () => {
  it('renders the table on desktop instead of the mobile card list', async () => {
    render(<MemoryRouter><Roster /></MemoryRouter>)
    expect(await screen.findByTestId('roster-table')).toBeInTheDocument()
    expect(screen.queryByTestId('player-row')).not.toBeInTheDocument()
  })

  it('renders the mobile card list and no table below the breakpoint', async () => {
    setDesktop(false)
    render(<MemoryRouter><Roster /></MemoryRouter>)
    expect(await screen.findAllByTestId('player-row')).toHaveLength(3)
    expect(screen.queryByTestId('roster-table')).not.toBeInTheDocument()
  })

  it('shows every visible player as one row', async () => {
    render(<MemoryRouter><Roster /></MemoryRouter>)
    await screen.findByTestId('roster-table')
    expect(rows()).toHaveLength(3)
  })

  it('has no jersey column — the club does not use squad numbers', async () => {
    render(<MemoryRouter><Roster /></MemoryRouter>)
    await screen.findByTestId('roster-table')
    expect(screen.queryByRole('columnheader', { name: /jersey|number|#/i })).not.toBeInTheDocument()
  })
})

describe('RosterTable — sorting', () => {
  // ⚠️ THESE TWO TURN GROUPING OFF FIRST, since 15 Aug 2026. Grouping now
  // defaults to ON for anyone who can edit (Jay's instruction), and a grouped
  // table cannot also be sorted end-to-end — the headings would be meaningless
  // if rows crossed them. Sorting ACROSS the whole table is precisely what the
  // "Nothing" grouping gives, so that is what these two now ask for; the
  // grouped case is covered by the section-sorting test below.
  async function ungroup(user) {
    await user.selectOptions(screen.getByLabelText('Group by'), 'none')
  }

  it('sorts by name ascending by default', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><Roster /></MemoryRouter>)
    await screen.findByTestId('roster-table')
    await ungroup(user)
    expect(names()).toEqual(['Amy Rose', 'Tom Fletcher', 'Zac Bell'])
  })

  it('reverses the sort when the same header is clicked twice', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><Roster /></MemoryRouter>)
    await screen.findByTestId('roster-table')
    await ungroup(user)
    await user.click(screen.getByRole('button', { name: /^Name/ }))
    expect(names()).toEqual(['Zac Bell', 'Tom Fletcher', 'Amy Rose'])
  })

  it('⚠️ still sorts WITHIN a group when the table is grouped', async () => {
    // The regression this exists to stop: when grouping went on by default the
    // column headers still highlighted and still flipped their arrow while
    // changing nothing on screen. Tom and Zac are both in the U10 squad; with
    // no grades they share the "Not graded" group, where Tom is a Flanker
    // (Forwards) and Zac has no position (Other). Amy is U12.
    const user = userEvent.setup()
    listPlayersMock.mockResolvedValue([
      TOM,
      { ...ZAC, position: 'Lock' },
      { id: 'p4', team_id: 'team-u10', full_name: 'Alfie Denning', position: 'Prop', is_captain: false },
    ])
    // The decoration reads THIS, not the inline fixture fields above.
    listPlayerPositionsMock.mockResolvedValue(new Map([
      ['p1', ['Flanker']],
      ['p3', ['Lock']],
      ['p4', ['Prop']],
    ]))
    render(<MemoryRouter><Roster /></MemoryRouter>)
    await screen.findByTestId('roster-table')

    // All three are forwards, so they sit in one section and the sort is
    // visible end to end within it.
    expect(names()).toEqual(['Alfie Denning', 'Tom Fletcher', 'Zac Bell'])
    await user.click(screen.getByRole('button', { name: /^Name/ }))
    expect(names()).toEqual(['Zac Bell', 'Tom Fletcher', 'Alfie Denning'])
  })

  it('sorts players with no position last, not first', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><Roster /></MemoryRouter>)
    await screen.findByTestId('roster-table')
    await ungroup(user)
    await user.click(screen.getByRole('button', { name: /^Position/ }))
    expect(names()[2]).toBe('Zac Bell')
  })

  it('exposes the sort direction to assistive tech via aria-sort', async () => {
    render(<MemoryRouter><Roster /></MemoryRouter>)
    await screen.findByTestId('roster-table')
    const header = screen.getByRole('columnheader', { name: /Name/ })
    expect(header).toHaveAttribute('aria-sort', 'ascending')
  })
})

describe('RosterTable — inline editing', () => {
  it('writes only the changed field, keyed by id', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><Roster /></MemoryRouter>)
    await screen.findByTestId('roster-table')

    await user.selectOptions(screen.getByLabelText('Position for Zac Bell'), 'Prop')
    // Through player_positions since 25 Aug 2026 — the players row carries no
    // position any more, so upsertPlayer must not be touched.
    await waitFor(() => expect(savePlayerPositionsMock).toHaveBeenCalledWith('p3', ['Prop']))
    expect(upsertPlayerMock).not.toHaveBeenCalled()
  })

  it('does not write when the value is unchanged', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><Roster /></MemoryRouter>)
    await screen.findByTestId('roster-table')

    await user.selectOptions(screen.getByLabelText('Position for Tom Fletcher'), 'Flanker')
    expect(savePlayerPositionsMock).not.toHaveBeenCalled()
    expect(upsertPlayerMock).not.toHaveBeenCalled()
  })

  it('clearing the primary clears the set — an empty list, never an empty string', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><Roster /></MemoryRouter>)
    await screen.findByTestId('roster-table')

    await user.selectOptions(screen.getByLabelText('Position for Tom Fletcher'), '')
    await waitFor(() => expect(savePlayerPositionsMock).toHaveBeenCalledWith('p1', []))
  })

  it('moves a player to another age group', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><Roster /></MemoryRouter>)
    await screen.findByTestId('roster-table')

    await user.selectOptions(screen.getByLabelText('Age group for Zac Bell'), 'team-u12')
    await waitFor(() => expect(upsertPlayerMock).toHaveBeenCalledWith({ id: 'p3', team_id: 'team-u12' }))
  })

  it('toggles captain and reports the state through aria-pressed', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><Roster /></MemoryRouter>)
    await screen.findByTestId('roster-table')

    const toggle = screen.getByRole('button', { name: 'Captain: Zac Bell' })
    expect(toggle).toHaveAttribute('aria-pressed', 'false')

    await user.click(toggle)
    await waitFor(() => expect(upsertPlayerMock).toHaveBeenCalledWith({ id: 'p3', is_captain: true }))
    await waitFor(() => expect(
      screen.getByRole('button', { name: 'Captain: Zac Bell' }),
    ).toHaveAttribute('aria-pressed', 'true'))
  })

  it('updates the cell optimistically, before the write resolves', async () => {
    const user = userEvent.setup()
    let release
    savePlayerPositionsMock.mockImplementation(() => new Promise((r) => { release = r }))

    render(<MemoryRouter><Roster /></MemoryRouter>)
    await screen.findByTestId('roster-table')
    await user.selectOptions(screen.getByLabelText('Position for Zac Bell'), 'Prop')

    // Still in flight, but the cell already shows the new value.
    expect(screen.getByLabelText('Position for Zac Bell')).toHaveValue('Prop')
    release([])
  })
})

describe('RosterTable — refusals', () => {
  it('puts the old value back and names the failure in the row when the write is refused', async () => {
    const user = userEvent.setup()
    savePlayerPositionsMock.mockRejectedValue(
      new Error("We couldn't save that player. You may not have permission to change this squad."),
    )

    render(<MemoryRouter><Roster /></MemoryRouter>)
    await screen.findByTestId('roster-table')
    await user.selectOptions(screen.getByLabelText('Position for Zac Bell'), 'Prop')

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/may not have permission/i)
    // Reverted, not left showing a value the database rejected.
    expect(screen.getByLabelText('Position for Zac Bell')).toHaveValue('')
  })

  it('reports the refusal in the row that caused it, not globally', async () => {
    const user = userEvent.setup()
    savePlayerPositionsMock.mockRejectedValue(new Error('Refused'))

    render(<MemoryRouter><Roster /></MemoryRouter>)
    await screen.findByTestId('roster-table')
    await user.selectOptions(screen.getByLabelText('Position for Zac Bell'), 'Prop')

    await screen.findByRole('alert')
    const zacRow = rows().find((r) => within(r).queryByText('Zac Bell'))
    expect(within(zacRow).getByRole('alert')).toBeInTheDocument()
  })

  it('clears a previous error when the next edit on that row succeeds', async () => {
    const user = userEvent.setup()
    savePlayerPositionsMock.mockRejectedValueOnce(new Error('Refused'))

    render(<MemoryRouter><Roster /></MemoryRouter>)
    await screen.findByTestId('roster-table')
    await user.selectOptions(screen.getByLabelText('Position for Zac Bell'), 'Prop')
    await screen.findByRole('alert')

    savePlayerPositionsMock.mockResolvedValue([])
    await user.selectOptions(screen.getByLabelText('Position for Zac Bell'), 'Lock')
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
  })
})

describe('RosterTable — permissions', () => {
  it('renders position controls for a coach of a non-minis squad', async () => {
    // ⚠️ U12, NOT U10, since 25 Aug 2026: a minis-only roster now hides the
    // Position column entirely (tag rugby has no positions — the same 15 Aug
    // rule that already hid Tier), so the control has to be asserted on a
    // squad that can have one.
    useMembershipsMock.mockReturnValue({
      memberships: [{ id: 'm2', role: 'coach', team_id: 'team-u12' }],
      teams: TEAMS,
    })
    listPlayersMock.mockResolvedValue([AMY])

    render(<MemoryRouter><Roster /></MemoryRouter>)
    await screen.findByTestId('roster-table')
    await waitFor(() => expect(screen.getByLabelText('Position for Amy Rose')).toBeInTheDocument())
  })

  it('never renders a control the database would refuse', async () => {
    // Parent role: canEditTeam is false for every team, so no cell in the
    // table may be a form control. This is the UI half of the contract — RLS
    // is what actually enforces it.
    useMembershipsMock.mockReturnValue({
      memberships: [{ id: 'm3', role: 'parent', team_id: 'team-u10', player_id: 'p1' }],
      teams: TEAMS,
    })
    listPlayersMock.mockResolvedValue([TOM, ZAC])

    render(<MemoryRouter><Roster /></MemoryRouter>)
    await screen.findByTestId('roster-table')
    expect(screen.queryByLabelText(/^Position for/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Captain:/ })).not.toBeInTheDocument()
  })
})

// Added 6 Aug 2026. Before this, the name was inert text and the ONLY way into
// a player was the "Open" button in the last column — on a full-width table
// that is most of a screen away from the name being aimed at. The table also
// showed no faces at all, while the mobile list had shown them all along.
describe('RosterTable — opening a player from the name', () => {
  it('opens the player when the name is clicked', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><Roster /></MemoryRouter>)
    await screen.findByTestId('roster-table')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    // Exact string, not /Tom Fletcher/: the captain toggle in the same row is
    // labelled "Captain: Tom Fletcher" and a loose pattern matches both. The
    // monogram is aria-hidden, so this button's accessible name is the name
    // alone — which is also the assertion that the avatar has not started
    // announcing itself as "TF Tom Fletcher".
    await user.click(screen.getByRole('button', { name: 'Tom Fletcher' }))

    expect(await screen.findByRole('dialog')).toBeInTheDocument()
  })

  it('does NOT open the player when an inline control is used', async () => {
    // ⚠️ The injected fault for the test above, and the reason the NAME is the
    // button rather than the row. A row-level click handler passes the test
    // above and then fires on every inline edit — opening a detail sheet on
    // top of the age group somebody just changed.
    const user = userEvent.setup()
    render(<MemoryRouter><Roster /></MemoryRouter>)
    await screen.findByTestId('roster-table')

    await user.selectOptions(screen.getByLabelText('Age group for Tom Fletcher'), 'team-u12')

    await waitFor(() => expect(upsertPlayerMock).toHaveBeenCalled())
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('still opens from the Open button', async () => {
    // The old route stays. Removing it would be a second, unasked-for change.
    const user = userEvent.setup()
    render(<MemoryRouter><Roster /></MemoryRouter>)
    await screen.findByTestId('roster-table')

    const tomRow = rows().find((r) => within(r).queryByText('Tom Fletcher'))
    await user.click(within(tomRow).getByRole('button', { name: 'Open' }))

    expect(await screen.findByRole('dialog')).toBeInTheDocument()
  })
})

describe('RosterTable — the face beside the name', () => {
  it('shows the monogram when a player has no photo', async () => {
    // 314 of the club's 315 players are in exactly this state today, so this
    // is the normal rendering, not the fallback-nobody-sees.
    render(<MemoryRouter><Roster /></MemoryRouter>)
    await screen.findByTestId('roster-table')

    const tomRow = rows().find((r) => within(r).queryByText('Tom Fletcher'))
    expect(within(tomRow).getByText('TF')).toBeInTheDocument()
    // ⚠️ querySelector, not getByRole('img'): PlayerAvatar renders alt="" on
    // purpose (the name is right beside it), and an empty alt strips the img
    // role. A role-based query here would report "no image" whether the photo
    // rendered or not, and would pass for the wrong reason.
    expect(tomRow.querySelector('img')).toBeNull()
  })

  it('renders the real photo when one exists', async () => {
    // The point of this test is the WIRING: RosterTable only receives
    // photoUrls because Roster now passes it. Drop that prop and the monogram
    // above still renders, so only this test fails.
    listPlayersMock.mockResolvedValue([{ ...TOM, photo_path: 'players/p1.jpg' }, AMY])

    render(<MemoryRouter><Roster /></MemoryRouter>)
    await screen.findByTestId('roster-table')

    const tomRow = await waitFor(() => {
      const row = rows().find((r) => within(r).queryByText('Tom Fletcher'))
      expect(row.querySelector('img')).not.toBeNull()
      return row
    })
    expect(tomRow.querySelector('img')).toHaveAttribute('src', 'https://signed.example/p1.jpg')
    expect(within(tomRow).queryByText('TF')).not.toBeInTheDocument()
  })

  // ⚠️ THE SAME OMISSION THE SQUAD-CONTACT TILE HAD, FOUND WHILE FIXING IT.
  // `PhotoField` has let a parent position their child's head shot since 15 Aug
  // 2026 and PlayerAvatar drew every one of them centred, so the control did
  // nothing anybody could see — on the roster, on the dashboard and in the `xl`
  // detail hero alike.
  it('crops a player photo around its focal point', async () => {
    listPlayersMock.mockResolvedValue([
      { ...TOM, photo_path: 'players/p1.jpg', photo_focus_x: 40, photo_focus_y: 22 },
      AMY,
    ])

    render(<MemoryRouter><Roster /></MemoryRouter>)
    await screen.findByTestId('roster-table')

    const tomImg = await waitFor(() => {
      const row = rows().find((r) => within(r).queryByText('Tom Fletcher'))
      const img = row.querySelector('img')
      expect(img).not.toBeNull()
      return img
    })
    expect(tomImg).toHaveStyle({ objectPosition: '40% 22%' })
  })

  // Every photo uploaded before the columns existed is in this state, and it has
  // to render exactly as it did before the feature landed.
  //
  // ⚠️ ASSERTED ON THE INLINE STYLE RATHER THAN WITH `toHaveStyle`: jsdom's
  // COMPUTED `object-position` is already `50% 50%`, so the matcher form passes
  // on an <img> with no positioning at all — the bug itself. Measured.
  it('centres a player photo nobody has positioned', async () => {
    listPlayersMock.mockResolvedValue([{ ...TOM, photo_path: 'players/p1.jpg' }, AMY])

    render(<MemoryRouter><Roster /></MemoryRouter>)
    await screen.findByTestId('roster-table')

    const tomImg = await waitFor(() => {
      const row = rows().find((r) => within(r).queryByText('Tom Fletcher'))
      const img = row.querySelector('img')
      expect(img).not.toBeNull()
      return img
    })
    expect(tomImg.style.objectPosition).toBe('50% 50%')
  })
})
