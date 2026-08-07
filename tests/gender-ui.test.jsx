import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Male/Female buttons on a player (Jay's brief, 7 Aug 2026).
//
// The two assertions that actually matter here are the negative ones:
//
//   1. A PARENT's save must go through setOwnPlayerGender, NOT upsertPlayer.
//      A parent holds no write on public.players at all — the only write
//      policy is `player edit`, gated on can_edit_team — so an ordinary
//      update would be refused server-side and the parent would see a
//      permission error on a field they were invited to change. The RPC
//      exists precisely so that write does not need an owner-update policy,
//      which would hand the parent team_id as well.
//
//   2. The squad-mismatch note must NOT block a save. The club really does
//      have four women in "Senior Men 2nd XV"; a hard validation would make
//      those four players uneditable by anyone.
//
// The db-level halves of both (the is_own_player guard, the CHECK constraint)
// were exercised against the live database with injected faults; these cover
// the client half.

const useMembershipsMock = vi.fn()
const listPlayersMock = vi.fn()
const listContactsForPlayersMock = vi.fn()
const getPlayerContactMock = vi.fn()
const upsertContactMock = vi.fn()
const deletePlayerMock = vi.fn()
const upsertPlayerMock = vi.fn()
const insertPlayersMock = vi.fn()
const setOwnPlayerGenderMock = vi.fn()
const listParentsMock = vi.fn()
const saveParentsMock = vi.fn()

vi.mock('../src/lib/memberships.jsx', () => ({
  useMemberships: () => useMembershipsMock(),
}))

vi.mock('../src/data/players.js', () => ({
  listPlayers: (...a) => listPlayersMock(...a),
  listContactsForPlayers: (...a) => listContactsForPlayersMock(...a),
  getPlayerContact: (...a) => getPlayerContactMock(...a),
  upsertContact: (...a) => upsertContactMock(...a),
  deletePlayer: (...a) => deletePlayerMock(...a),
  upsertPlayer: (...a) => upsertPlayerMock(...a),
  insertPlayers: (...a) => insertPlayersMock(...a),
  setOwnPlayerGender: (...a) => setOwnPlayerGenderMock(...a),
}))

vi.mock('../src/data/parents.js', () => ({
  listParents: (...a) => listParentsMock(...a),
  listParentsForPlayers: async () => ({}),
  saveParents: (...a) => saveParentsMock(...a),
  deleteParent: async () => {},
}))

vi.mock('../src/data/photos.js', () => ({
  PHOTO_BUCKET: 'player-photos',
  signPhotoUrl: async () => null,
  signPhotoUrls: async () => ({}),
  uploadPlayerPhoto: async () => 'k',
  setOwnPlayerPhoto: async () => ({}),
  deletePlayerPhoto: async () => {},
  forgetPhotoUrl: () => {},
  clearPhotoUrlCache: () => {},
}))

// Desktop switches Roster to the table; force the mobile card list so the
// by-name buttons these tests click actually exist. (The two never render
// together — see src/lib/useMediaQuery.js.)
vi.mock('../src/lib/useMediaQuery.js', () => ({
  DESKTOP_QUERY: '(min-width: 1024px)',
  useMediaQuery: () => false,
}))

import Roster from '../src/screens/Roster.jsx'

const CLUB = 'club-1'
const TEAM_U14 = { id: 't-u14', club_id: CLUB, name: 'U14', sort_order: 9 }
const TEAM_MEN = { id: 't-men', club_id: CLUB, name: 'Senior Men 2nd XV', sort_order: 14 }
const TEAMS = [TEAM_U14, TEAM_MEN]

const base = { club_id: CLUB, position: 'Flanker', is_captain: false, photo_path: null }
const MY_CHILD = { ...base, id: 'p-mine', team_id: 't-u14', full_name: 'Tyler Muir', gender: null }
const A_GIRL = { ...base, id: 'p-girl', team_id: 't-u14', full_name: 'Amy Rose', gender: 'female' }
const A_BOY = { ...base, id: 'p-boy', team_id: 't-u14', full_name: 'Ben Shaw', gender: 'male' }
const UNKNOWN = { ...base, id: 'p-unk', team_id: 't-u14', full_name: 'Chris Dale', gender: null }
const WOMAN_IN_MENS = {
  ...base, id: 'p-wm', team_id: 't-men', full_name: 'Dana Reid', gender: 'female',
}

const PARENT = [{ id: 'm-p', role: 'parent', team_id: 't-u14', player_id: 'p-mine', club_id: CLUB }]
const ADMIN = [{ id: 'm-a', role: 'admin', team_id: null, club_id: CLUB }]

function membershipValue(memberships) {
  return { memberships, teams: TEAMS, loading: false, error: null, reload: vi.fn() }
}

async function renderRoster(memberships, players) {
  listPlayersMock.mockResolvedValue(players)
  useMembershipsMock.mockReturnValue(membershipValue(memberships))
  const user = userEvent.setup()
  render(<Roster />)
  await screen.findByRole('heading', { name: /roster/i })
  return user
}

async function openSheet(user, playerName) {
  await user.click(await screen.findByRole('button', { name: new RegExp(playerName, 'i') }))
  return screen.findByRole('dialog')
}

// ⚠️ Every radio query in a form MUST go through this, and the reason is a
// genuine collision rather than tidiness: Roster's own gender FILTER is a
// radio group whose options are also named "Male" and "Female", and it stays
// mounted underneath the open sheet. An unscoped
// getByRole('radio', {name: 'Male'}) therefore finds two elements and throws
// — which is how this was caught. Scoping to the dialog also means a test
// that thinks it is clicking the form cannot silently be driving the filter.
function inForm(name) {
  return within(screen.getByRole('dialog')).getByRole('radio', { name })
}

beforeEach(() => {
  vi.clearAllMocks()
  listContactsForPlayersMock.mockResolvedValue({})
  getPlayerContactMock.mockResolvedValue(null)
  listParentsMock.mockResolvedValue([])
  saveParentsMock.mockResolvedValue([])
  upsertContactMock.mockResolvedValue({})
  upsertPlayerMock.mockResolvedValue({ id: 'p-mine' })
  setOwnPlayerGenderMock.mockResolvedValue({ id: 'p-mine', gender: 'male' })
  window.localStorage.clear()
})

describe('Gender on the roster list', () => {
  it('appends a recorded gender to the player row', async () => {
    await renderRoster(ADMIN, [A_GIRL])
    const row = await screen.findByRole('button', { name: /Amy Rose/i })
    expect(within(row).getByText(/Flanker · U14 · Female/)).toBeInTheDocument()
  })

  // ⚠️ The injected fault for the test above. If genderLabel ever returned a
  // placeholder instead of null, this row would read "· Not set" and ~300
  // roster rows would carry a nag about missing data.
  it('shows nothing at all when the gender is not recorded', async () => {
    await renderRoster(ADMIN, [UNKNOWN])
    const row = await screen.findByRole('button', { name: /Chris Dale/i })
    expect(within(row).getByText('Flanker · U14')).toBeInTheDocument()
    expect(within(row).queryByText(/Not set|Not recorded|·\s*$/)).toBeNull()
  })
})

describe('The roster gender filter', () => {
  it('narrows the list to one gender', async () => {
    const user = await renderRoster(ADMIN, [A_GIRL, A_BOY, UNKNOWN])
    await user.click(screen.getByRole('radio', { name: 'Female' }))

    expect(screen.getByRole('button', { name: /Amy Rose/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Ben Shaw/i })).toBeNull()
  })

  // ⚠️ THE HONEST HALF, and the injected fault for the filter itself. With
  // almost every player unrecorded, "Female" on a 53-player squad can show 2
  // rows — which reads as "this squad has 2 girls" unless this line is there
  // to say otherwise.
  it('says how many players it is hiding for having no gender recorded', async () => {
    const user = await renderRoster(ADMIN, [A_GIRL, A_BOY, UNKNOWN])
    expect(screen.queryByTestId('gender-unrecorded-note')).toBeNull()

    await user.click(screen.getByRole('radio', { name: 'Female' }))
    expect(screen.getByTestId('gender-unrecorded-note')).toHaveTextContent(
      '1 player has no gender recorded and is not shown.',
    )
  })

  it('drops the note again when the filter goes back to All', async () => {
    const user = await renderRoster(ADMIN, [A_GIRL, UNKNOWN])
    await user.click(screen.getByRole('radio', { name: 'Male' }))
    expect(screen.getByTestId('gender-unrecorded-note')).toBeInTheDocument()

    await user.click(screen.getByRole('radio', { name: 'All' }))
    expect(screen.queryByTestId('gender-unrecorded-note')).toBeNull()
    expect(screen.getByRole('button', { name: /Chris Dale/i })).toBeInTheDocument()
  })
})

describe('Gender on the player detail sheet', () => {
  it('shows a pill for a recorded gender', async () => {
    const user = await renderRoster(ADMIN, [A_GIRL])
    const dialog = await openSheet(user, 'Amy Rose')
    expect(within(dialog).getByTestId('player-gender')).toHaveTextContent('Female')
  })

  it('renders no pill at all when it is not recorded', async () => {
    const user = await renderRoster(ADMIN, [UNKNOWN])
    const dialog = await openSheet(user, 'Chris Dale')
    expect(within(dialog).queryByTestId('player-gender')).toBeNull()
  })
})

describe("PlayerForm — the coach's buttons", () => {
  it('starts with neither button chosen for a player who has no gender', async () => {
    const user = await renderRoster(ADMIN, [UNKNOWN])
    const dialog = await openSheet(user, 'Chris Dale')
    await user.click(within(dialog).getByRole('button', { name: 'Edit' }))
    await screen.findByLabelText('Full name')

    // Not "defaults to Male". Recording an answer nobody gave is the failure
    // mode this asserts against.
    expect(inForm('Male')).not.toBeChecked()
    expect(inForm('Female')).not.toBeChecked()
  })

  it('writes the chosen gender in the player payload', async () => {
    const user = await renderRoster(ADMIN, [UNKNOWN])
    const dialog = await openSheet(user, 'Chris Dale')
    await user.click(within(dialog).getByRole('button', { name: 'Edit' }))
    await screen.findByLabelText('Full name')

    await user.click(inForm('Female'))
    await user.click(screen.getByRole('button', { name: /save changes/i }))

    await waitFor(() => expect(upsertPlayerMock).toHaveBeenCalled())
    expect(upsertPlayerMock.mock.calls[0][0]).toMatchObject({ gender: 'female' })
  })

  it('warns, without blocking, when the gender contradicts the squad', async () => {
    const user = await renderRoster(ADMIN, [WOMAN_IN_MENS])
    const dialog = await openSheet(user, 'Dana Reid')
    await user.click(within(dialog).getByRole('button', { name: 'Edit' }))
    await screen.findByLabelText('Full name')

    expect(screen.getByText(/Female player in Senior Men 2nd XV/)).toBeInTheDocument()

    // ⚠️ And it saves anyway. Four real players depend on this.
    await user.click(screen.getByRole('button', { name: /save changes/i }))
    await waitFor(() => expect(upsertPlayerMock).toHaveBeenCalled())
    expect(upsertPlayerMock.mock.calls[0][0]).toMatchObject({ gender: 'female' })
  })

  it('says nothing about a youth squad, whatever the gender', async () => {
    const user = await renderRoster(ADMIN, [A_GIRL])
    const dialog = await openSheet(user, 'Amy Rose')
    await user.click(within(dialog).getByRole('button', { name: 'Edit' }))
    await screen.findByLabelText('Full name')

    expect(screen.queryByText(/player in U14/)).toBeNull()
  })
})

describe('MyPlayerForm — a parent setting it on their own child', () => {
  it('offers the buttons and says so in the what-you-can-change line', async () => {
    const user = await renderRoster(PARENT, [MY_CHILD])
    const dialog = await openSheet(user, 'Tyler Muir')
    await user.click(within(dialog).getByRole('button', { name: /update details/i }))
    await screen.findByRole('button', { name: /save changes/i })

    expect(inForm('Male')).toBeInTheDocument()
    expect(screen.getByText(/photo, gender, contact details and parents/i)).toBeInTheDocument()
  })

  // ⚠️ THE ONE THAT MATTERS. upsertPlayer would be refused by RLS for this
  // user — `player edit` is can_edit_team only. The RPC is the only path.
  it('saves through the RPC and never through upsertPlayer', async () => {
    const user = await renderRoster(PARENT, [MY_CHILD])
    const dialog = await openSheet(user, 'Tyler Muir')
    await user.click(within(dialog).getByRole('button', { name: /update details/i }))
    await screen.findByRole('button', { name: /save changes/i })

    await user.click(inForm('Male'))
    await user.click(screen.getByRole('button', { name: /save changes/i }))

    await waitFor(() => expect(setOwnPlayerGenderMock).toHaveBeenCalledWith('p-mine', 'male'))
    expect(upsertPlayerMock).not.toHaveBeenCalled()
  })

  // The injected fault for the test above: without the equality guard this
  // fires a privileged write on every save a parent makes, for a field they
  // never touched.
  it('does not call the RPC at all when the gender was not changed', async () => {
    const user = await renderRoster(PARENT, [MY_CHILD])
    const dialog = await openSheet(user, 'Tyler Muir')
    await user.click(within(dialog).getByRole('button', { name: /update details/i }))
    await screen.findByRole('button', { name: /save changes/i })

    await user.click(screen.getByRole('button', { name: /save changes/i }))

    await waitFor(() => expect(saveParentsMock).toHaveBeenCalled())
    expect(setOwnPlayerGenderMock).not.toHaveBeenCalled()
  })

  it('still refuses the club-controlled fields', async () => {
    const user = await renderRoster(PARENT, [MY_CHILD])
    const dialog = await openSheet(user, 'Tyler Muir')
    await user.click(within(dialog).getByRole('button', { name: /update details/i }))
    await screen.findByRole('button', { name: /save changes/i })

    // Gender being editable here must not have opened the door to the rest.
    expect(screen.queryByLabelText('Full name')).toBeNull()
    expect(screen.queryByLabelText('Age group')).toBeNull()
    expect(screen.queryByLabelText('Position')).toBeNull()
  })
})
