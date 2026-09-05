import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Self-service profile editing (Jay's scope, 4 Aug 2026): a parent or the
// player themselves may change the PHOTO, the player's own CONTACT row and the
// PARENT rows — and nothing else.
//
// What these tests are really guarding is the negative half. The database is
// the actual boundary (owner policies scoped by private.is_own_player, plus
// public.set_own_player_photo for photo_path, verified against simulated
// JWTs), but the UI must not offer a control the database will refuse, and
// must never route a self-edit through PlayerForm — which can write name,
// position, age group and captaincy.

const useMembershipsMock = vi.fn()
const listPlayersMock = vi.fn()
const listContactsForPlayersMock = vi.fn()
const getPlayerContactMock = vi.fn()
const upsertContactMock = vi.fn()
const deletePlayerMock = vi.fn()
const upsertPlayerMock = vi.fn()
const insertPlayersMock = vi.fn()
const listParentsMock = vi.fn()
const saveParentsMock = vi.fn()
const setOwnPlayerPhotoMock = vi.fn()
const uploadPlayerPhotoMock = vi.fn()

vi.mock('../src/lib/memberships.jsx', () => ({
  useMemberships: () => useMembershipsMock(),
}))

vi.mock('../src/data/playups.js', () => ({
  listPlayerGuestTeamIds: async () => [],
  listPlayerGuestPlayups: async () => [],
  addJuniorPlayup: async () => null,
  removeJuniorPlayup: async () => null,
}))

vi.mock('../src/data/players.js', () => ({
  listPlayers: (...a) => listPlayersMock(...a),
  listContactsForPlayers: (...a) => listContactsForPlayersMock(...a),
  // The completeness card on YourPlayers reads this (17 Aug 2026).
  listPlayerPrivate: async () => [],
  getPlayerDob: vi.fn(() => Promise.resolve(null)),
  getPlayerContact: (...a) => getPlayerContactMock(...a),
  upsertContact: (...a) => upsertContactMock(...a),
  deletePlayer: (...a) => deletePlayerMock(...a),
  upsertPlayer: (...a) => upsertPlayerMock(...a),
  insertPlayers: (...a) => insertPlayersMock(...a),
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
  uploadPlayerPhoto: (...a) => uploadPlayerPhotoMock(...a),
  setOwnPlayerPhoto: (...a) => setOwnPlayerPhotoMock(...a),
  deletePlayerPhoto: async () => {},
  forgetPhotoUrl: () => {},
  clearPhotoUrlCache: () => {},
}))

import Roster from '../src/screens/Roster.jsx'

const CLUB = 'club-1'
const TEAM_U10 = { id: 't-u10', club_id: CLUB, name: 'U10', sort_order: 4 }
const TEAM_U14 = { id: 't-u14', club_id: CLUB, name: 'U14', sort_order: 9 }
const TEAMS = [TEAM_U10, TEAM_U14]

const MY_CHILD = {
  id: 'p-mine',
  club_id: CLUB,
  team_id: 't-u14',
  full_name: 'Tyler Muir',
  position: 'Flanker',
  is_captain: false,
  photo_path: null,
}
const OTHER = {
  id: 'p-other',
  club_id: CLUB,
  team_id: 't-u14',
  full_name: 'Oscar Beaumont',
  position: 'Prop',
  is_captain: false,
  photo_path: null,
}

// A parent linked to p-mine only.
const PARENT = [{ id: 'm-p', role: 'parent', team_id: 't-u14', player_id: 'p-mine', club_id: CLUB }]
// A parent of an UNDER-13, where the player's own contact fields must not appear.
const PARENT_U10 = [
  { id: 'm-p10', role: 'parent', team_id: 't-u10', player_id: 'p-u10', club_id: CLUB },
]
const COACH = [{ id: 'm-c', role: 'coach', status: 'active', team_id: 't-u14', club_id: CLUB }]

const U10_CHILD = { ...MY_CHILD, id: 'p-u10', team_id: 't-u10', full_name: 'Jackson Muir' }

function membershipValue(memberships) {
  return { memberships, teams: TEAMS, loading: false, error: null, reload: vi.fn() }
}

async function openSheet(memberships, playerName, players) {
  listPlayersMock.mockResolvedValue(players)
  useMembershipsMock.mockReturnValue(membershipValue(memberships))
  const user = userEvent.setup()
  render(<MemoryRouter><Roster /></MemoryRouter>)
  await user.click(await screen.findByRole('button', { name: new RegExp(playerName, 'i') }))
  await screen.findByRole('dialog')
  return user
}

beforeEach(() => {
  vi.clearAllMocks()
  listContactsForPlayersMock.mockResolvedValue({})
  getPlayerContactMock.mockResolvedValue(null)
  listParentsMock.mockResolvedValue([])
  saveParentsMock.mockResolvedValue([])
  upsertContactMock.mockResolvedValue({})
  setOwnPlayerPhotoMock.mockResolvedValue({})
  window.localStorage.clear()
})

describe('Self-service profile editing', () => {
  it('offers a parent one action on their own child, not Edit and Delete', async () => {
    await openSheet(PARENT, 'Tyler Muir', [MY_CHILD, OTHER])
    const dialog = screen.getByRole('dialog')

    expect(within(dialog).getByRole('button', { name: /update details/i })).toBeInTheDocument()
    // Deleting a player is never self-service.
    expect(within(dialog).queryByRole('button', { name: 'Delete' })).toBeNull()
    expect(within(dialog).queryByRole('button', { name: 'Edit' })).toBeNull()
  })

  it("offers a parent nothing on somebody else's child", async () => {
    await openSheet(PARENT, 'Oscar Beaumont', [MY_CHILD, OTHER])
    const dialog = screen.getByRole('dialog')

    expect(within(dialog).queryByRole('button', { name: /update details/i })).toBeNull()
    expect(within(dialog).queryByRole('button', { name: 'Edit' })).toBeNull()
  })

  it('gives a coach the full form, never the self-service one', async () => {
    const user = await openSheet(COACH, 'Tyler Muir', [MY_CHILD, OTHER])
    const dialog = screen.getByRole('dialog')

    expect(within(dialog).queryByRole('button', { name: /update details/i })).toBeNull()
    await user.click(within(dialog).getByRole('button', { name: 'Edit' }))

    // The coach's form owns the club-controlled fields; the self-service one
    // does not render them at all.
    expect(
      await screen.findByLabelText('First name', { selector: '#player-first-name' }),
    ).toBeInTheDocument()
  })

  it('never renders the club-controlled fields in the self-service form', async () => {
    const user = await openSheet(PARENT, 'Tyler Muir', [MY_CHILD, OTHER])
    await user.click(screen.getByRole('button', { name: /update details/i }))

    await screen.findByRole('button', { name: /save changes/i })

    // Absent, not disabled. A disabled input is a field someone will
    // eventually be tempted to enable.
    expect(screen.queryByLabelText('First name', { selector: '#player-first-name' })).toBeNull()
    expect(screen.queryByLabelText('Position')).toBeNull()
    expect(screen.queryByLabelText('Age group')).toBeNull()
    expect(screen.getByText(/set by the club/i)).toBeInTheDocument()
  })

  it('saves contact and parents for the owned player, and touches nothing else', async () => {
    getPlayerContactMock.mockResolvedValue({
      player_id: 'p-mine',
      phone: '+971502001000',
      email: 'tyler@example.com',
    })

    const user = await openSheet(PARENT, 'Tyler Muir', [MY_CHILD, OTHER])
    await user.click(screen.getByRole('button', { name: /update details/i }))
    await screen.findByRole('button', { name: /save changes/i })

    expect(screen.getByLabelText('Phone')).toHaveValue('502001000')
    await user.clear(screen.getByLabelText('Email'))
    await user.type(screen.getByLabelText('Email'), 'new@example.com')
    await user.click(screen.getByRole('button', { name: /save changes/i }))

    await waitFor(() =>
      expect(upsertContactMock).toHaveBeenCalledWith({
        player_id: 'p-mine',
        phone: '+971502001000',
        email: 'new@example.com',
      }),
    )
    expect(saveParentsMock).toHaveBeenCalledWith('p-mine', [])
    // The route that could write team_id / full_name is never taken.
    expect(upsertPlayerMock).not.toHaveBeenCalled()
    // No photo was chosen, so no photo write either.
    expect(setOwnPlayerPhotoMock).not.toHaveBeenCalled()
  })

  it('records a new photo through the RPC, never through upsertPlayer', async () => {
    uploadPlayerPhotoMock.mockResolvedValue('p-mine/1754300000000.jpg')

    const user = await openSheet(PARENT, 'Tyler Muir', [MY_CHILD, OTHER])
    await user.click(screen.getByRole('button', { name: /update details/i }))
    await screen.findByRole('button', { name: /save changes/i })

    const file = new File(['x'], 'face.jpg', { type: 'image/jpeg' })
    const input = document.querySelector('input[type="file"]')
    await user.upload(input, file)
    await user.click(screen.getByRole('button', { name: /save changes/i }))

    await waitFor(() =>
      expect(setOwnPlayerPhotoMock).toHaveBeenCalledWith('p-mine', 'p-mine/1754300000000.jpg'),
    )
    // upsertPlayer would carry the whole row, team_id included. The RPC has a
    // hard-coded column list; this is the difference that matters.
    expect(upsertPlayerMock).not.toHaveBeenCalled()
  })

  it('withholds the player-contact fields for an under-13, but still allows parents', async () => {
    const user = await openSheet(PARENT_U10, 'Jackson Muir', [U10_CHILD])
    await user.click(screen.getByRole('button', { name: /update details/i }))
    await screen.findByRole('button', { name: /save changes/i })

    // The U13 rule holds inside the self-service form too — otherwise it
    // would be the one screen that let a parent give a 10-year-old a direct
    // contact route.
    expect(screen.queryByLabelText('Email')).toBeNull()
    expect(screen.queryByLabelText('Phone')).toBeNull()
    expect(screen.getByRole('button', { name: /add parent/i })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /save changes/i }))
    await waitFor(() => expect(saveParentsMock).toHaveBeenCalled())
    expect(upsertContactMock).not.toHaveBeenCalled()
  })

  it('surfaces a refused save instead of closing as though it worked', async () => {
    saveParentsMock.mockRejectedValue(new Error('You can only change your own player.'))

    const user = await openSheet(PARENT, 'Tyler Muir', [MY_CHILD, OTHER])
    await user.click(screen.getByRole('button', { name: /update details/i }))
    await screen.findByRole('button', { name: /save changes/i })
    await user.click(screen.getByRole('button', { name: /save changes/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent('You can only change your own player.')
    expect(screen.getByRole('button', { name: /save changes/i })).toBeEnabled()
  })
})
