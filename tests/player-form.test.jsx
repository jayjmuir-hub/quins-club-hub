import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Unit tests for src/screens/PlayerForm.jsx (Task 15) plus the wiring that
// opens it — Roster's "Add player" button and PlayerDetail's Edit/Delete
// footer. useMemberships and every data module are mocked, so no network is
// reachable from this file.
//
// The theme running through this file is that players and player_contacts are
// TWO tables behind TWO policies, written by TWO statements. Most of the
// assertions below exist to pin that separation down: that a contact refusal
// is reported as a contact refusal and never folded into "saved", that
// blanking a contact clears it rather than being skipped, that a contact the
// form never successfully read is never overwritten with blanks, and that a
// retry after a contact failure does not insert the player a second time.

const useMembershipsMock = vi.fn()
const listPlayersMock = vi.fn()
const getPlayerContactMock = vi.fn()
const upsertPlayerMock = vi.fn()
const deletePlayerMock = vi.fn()
const upsertContactMock = vi.fn()

const listParentsMock = vi.fn()
const saveParentsMock = vi.fn()

vi.mock('../src/data/parents.js', () => ({
  listParents: (...args) => listParentsMock(...args),
  saveParents: (...args) => saveParentsMock(...args),
}))

// The photo bucket is private, so the form signs URLs and uploads through
// these. Mocked wholesale: photo behaviour has its own tests, and an
// unmocked call would put the network into a unit test.
vi.mock('../src/data/photos.js', () => ({
  signPhotoUrl: () => Promise.resolve(null),
  signPhotoUrls: () => Promise.resolve({}),
  uploadPlayerPhoto: vi.fn(() => Promise.resolve('p-1/1.jpg')),
  deletePlayerPhoto: vi.fn(() => Promise.resolve(true)),
  forgetPhotoUrl: vi.fn(),
}))

vi.mock('../src/lib/memberships.jsx', () => ({
  useMemberships: () => useMembershipsMock(),
}))

vi.mock('../src/data/players.js', () => ({
  listPlayers: (...args) => listPlayersMock(...args),
  getPlayerContact: (...args) => getPlayerContactMock(...args),
  upsertPlayer: (...args) => upsertPlayerMock(...args),
  deletePlayer: (...args) => deletePlayerMock(...args),
  upsertContact: (...args) => upsertContactMock(...args),
}))

// Imported after vi.mock so these bind to the mocked module.
import PlayerForm from '../src/screens/PlayerForm.jsx'
import Roster from '../src/screens/Roster.jsx'

const CLUB_ID = '00000000-0000-0000-0000-0000000000ad'

// Both squads are U13 or above on purpose: a player's own phone and email
// only exist from U13 up, and most of this file is about those fields. The
// under-13 case is asserted in its own suite at the foot of the file.
const TEAM_U14 = { id: 't-u14', club_id: CLUB_ID, name: 'U14', sort_order: 9 }
const TEAM_U16 = { id: 't-u16', club_id: CLUB_ID, name: 'U16', sort_order: 11 }
const TEAM_U10 = { id: 't-u10', club_id: CLUB_ID, name: 'U10', sort_order: 5 }
const TEAM_1XV = { id: 't-1xv', club_id: CLUB_ID, name: 'Senior Men 1st XV', sort_order: 13 }
const TEAMS = [TEAM_1XV, TEAM_U14, TEAM_U16] // deliberately unsorted

const ADMIN = [{ id: 'm-a', role: 'admin', team_id: null }]
const COACH_U14 = [{ id: 'm-c', role: 'coach', team_id: 't-u14' }]
const COACH_TWO = [
  { id: 'm-c1', role: 'coach', team_id: 't-u14' },
  { id: 'm-c2', role: 'coach', team_id: 't-u16' },
]
const PARENT = [{ id: 'm-p', role: 'parent', team_id: 't-u14', player_id: 'p-1' }]

function hasClassToken(element, token) {
  return element.className.split(/\s+/).includes(token)
}

const EXISTING_PLAYER = {
  id: 'p-1',
  club_id: CLUB_ID,
  team_id: 't-u14',
  full_name: 'Dhruv Ramachandran',
  position: 'Flanker',
  is_captain: true,
}

const EXISTING_CONTACT = {
  player_id: 'p-1',
  phone: '+971 50 200 1000',
  email: 'guardian@example.com',
}

function membershipValue(memberships, teams = TEAMS) {
  return { memberships, teams, loading: false, error: null, reload: vi.fn() }
}

function renderForm({ memberships = COACH_U14, teams = TEAMS, player = null, ...rest } = {}) {
  useMembershipsMock.mockReturnValue(membershipValue(memberships, teams))
  const onClose = vi.fn()
  const onSaved = vi.fn()
  const utils = render(<PlayerForm player={player} onClose={onClose} onSaved={onSaved} {...rest} />)
  return { ...utils, onClose, onSaved }
}

// An edit form does one contact read before it is usable. Waiting for the
// Save button to come out of its disabled state is how the tests below know
// that read has settled — see the "disables save while the contact prefill is
// in flight" test for why that gate exists at all.
async function renderEditForm(options = {}) {
  const utils = renderForm({ player: EXISTING_PLAYER, ...options })
  await waitFor(() =>
    expect(screen.getByRole('button', { name: /save changes/i })).not.toBeDisabled(),
  )
  return utils
}

beforeEach(() => {
  useMembershipsMock.mockReset()
  listPlayersMock.mockReset()
  getPlayerContactMock.mockReset()
  upsertPlayerMock.mockReset()
  deletePlayerMock.mockReset()
  upsertContactMock.mockReset()
  listPlayersMock.mockResolvedValue([])
  getPlayerContactMock.mockResolvedValue(null)
  upsertPlayerMock.mockImplementation(async (player) => ({ id: player?.id ?? 'p-new', ...player }))
  deletePlayerMock.mockResolvedValue(undefined)
  upsertContactMock.mockImplementation(async (contact) => ({ ...contact }))
  listParentsMock.mockReset()
  saveParentsMock.mockReset()
  listParentsMock.mockResolvedValue([])
  saveParentsMock.mockResolvedValue([])
})

describe('PlayerForm — shape and scoping', () => {
  it('opens as a sheet titled for adding when there is no player', () => {
    renderForm()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Add player' })).toBeInTheDocument()
  })

  it('opens as a sheet titled for editing when there is a player', async () => {
    await renderEditForm()
    expect(screen.getByRole('heading', { name: 'Edit player' })).toBeInTheDocument()
  })

  it('limits the age-group options to the teams the coach can edit', () => {
    renderForm({ memberships: COACH_TWO })
    const select = screen.getByLabelText('Age group')
    const options = within(select).getAllByRole('option').map((o) => o.textContent)
    expect(options).toEqual(['U14', 'U16'])
    expect(options).not.toContain('Senior Men 1st XV')
  })

  it('gives an admin every team, in the club sort order', () => {
    renderForm({ memberships: ADMIN })
    const select = screen.getByLabelText('Age group')
    const options = within(select).getAllByRole('option').map((o) => o.textContent)
    expect(options).toEqual(['U14', 'U16', 'Senior Men 1st XV'])
  })

  it('refuses to render a form at all when there is no team the user can edit', () => {
    // The form's very existence is gated, not just its Save button. A parent
    // has no editable team, and canEditTeam(memberships, null) is false by
    // design even for an admin with an unresolvable team. Crucially the
    // CONTACT fields must not exist either — an editable phone box for a
    // player whose details RLS withholds would be exactly the leak
    // player_contacts exists to prevent.
    renderForm({ memberships: PARENT })
    expect(screen.getByRole('alert')).toHaveTextContent(/squad you can add or change/i)
    expect(screen.queryByRole('button', { name: /save|add player/i })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Age group')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Player phone')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Player email')).not.toBeInTheDocument()
  })

  it('never reads contact details for a form it refuses to render', () => {
    renderForm({ memberships: PARENT, player: EXISTING_PLAYER })
    expect(getPlayerContactMock).not.toHaveBeenCalled()
  })

  it('refuses to render for a player whose squad this user cannot edit', () => {
    // The per-player gate, and the one this file's safeguarding reasoning
    // actually rests on. A coach of U14 handed a U12 player has SOME editable
    // squad, so the "no editable teams" gate lets them through — but
    // getPlayerContact would then return null because RLS withheld the row,
    // which this form would otherwise read as "no contact on file" and render
    // as blank, editable fields. Enforced in the component rather than only in
    // Roster, so it holds whoever opens the form.
    const coachOfOtherSquad = [{ id: 'm-c', role: 'coach', team_id: 't-u16' }]
    renderForm({ memberships: coachOfOtherSquad, player: EXISTING_PLAYER })

    expect(screen.getByRole('alert')).toHaveTextContent(/can't change players in this age group/i)
    expect(screen.queryByRole('button', { name: /save|add player/i })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Player phone')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Player email')).not.toBeInTheDocument()
    expect(getPlayerContactMock).not.toHaveBeenCalled()
  })

  it('still lets a coach edit a player in a squad they do coach', async () => {
    // The other side of the gate above: it must not refuse the normal case.
    await renderEditForm({ memberships: COACH_U14 })
    expect(screen.getByLabelText('Full name')).toHaveValue('Dhruv Ramachandran')
  })

  it('tells the two refusals apart rather than blaming the wrong thing', () => {
    renderForm({ memberships: PARENT })
    expect(screen.getByRole('alert')).toHaveTextContent(/don't have a squad you can add or change/i)
  })

  it('promises exactly who can read the contact details, matching the RLS policy', () => {
    // player_contacts' read policy is `can_edit_team(...) OR
    // is_own_player(player_id)` — the linked player can read their own row.
    // This line is a written safeguarding promise shown to whoever is typing a
    // minor's guardian details in, so it has to match the policy rather than
    // approximate it.
    renderForm()
    expect(
      screen.getByText(/only coaches, club admins and the player themselves can see these/i),
    ).toBeInTheDocument()
  })

  it('has no jersey number field, because the club does not use them', () => {
    renderForm()
    expect(screen.queryByLabelText(/jersey|squad number|shirt number/i)).not.toBeInTheDocument()
    // NOT a document-wide text search for /jersey/i any more: the phone
    // country picker contains Jersey, the Channel Island. Scoped to labels
    // and headings, which is what this test was ever about.
    expect(screen.queryByText(/jersey number|squad number|shirt number/i)).not.toBeInTheDocument()
  })

  it('offers the club position list plus an unset option, since position is optional', () => {
    renderForm()
    const select = screen.getByLabelText('Position')
    const options = within(select).getAllByRole('option').map((o) => o.textContent)
    expect(options[0]).toMatch(/not set/i)
    expect(options).toEqual(
      expect.arrayContaining([
        'Prop',
        'Hooker',
        'Lock',
        'Flanker',
        'Number 8',
        'Scrum-half',
        'Fly-half',
        'Centre',
        'Wing',
        'Fullback',
        'Utility',
      ]),
    )
  })
})

describe('PlayerForm — validation', () => {
  it('blocks submit and explains why when the name is empty', async () => {
    const user = userEvent.setup()
    renderForm()

    await user.click(screen.getByRole('button', { name: /add player/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/highlighted|fill in/i)
    expect(upsertPlayerMock).not.toHaveBeenCalled()
    expect(upsertContactMock).not.toHaveBeenCalled()
  })

  it('marks the offending field invalid rather than only shouting at the top', async () => {
    const user = userEvent.setup()
    renderForm()

    await user.click(screen.getByRole('button', { name: /add player/i }))

    expect(screen.getByLabelText('Full name')).toHaveAttribute('aria-invalid', 'true')
  })

  it('clears the error and the invalid highlight as soon as the field is fixed', async () => {
    const user = userEvent.setup()
    renderForm()

    await user.click(screen.getByRole('button', { name: /add player/i }))
    expect(screen.getByLabelText('Full name')).toHaveAttribute('aria-invalid', 'true')

    await user.type(screen.getByLabelText('Full name'), 'T')

    expect(screen.getByLabelText('Full name')).not.toHaveAttribute('aria-invalid')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('keeps a failed SAVE on screen while typing, unlike a validation error', async () => {
    // Nothing the user types makes a refused write true again, so that message
    // has to survive editing — only the "fill in the highlighted fields"
    // banner is transient.
    const user = userEvent.setup()
    upsertPlayerMock.mockRejectedValue(new Error('permission denied for table players'))
    renderForm()

    await user.type(screen.getByLabelText('Full name'), 'Tom Fletcher')
    await user.click(screen.getByRole('button', { name: /add player/i }))
    await screen.findByRole('alert')

    await user.type(screen.getByLabelText('Full name'), '!')

    expect(screen.getByRole('alert')).toHaveTextContent('permission denied for table players')
  })

  it('treats a whitespace-only name as empty', async () => {
    const user = userEvent.setup()
    renderForm()

    await user.type(screen.getByLabelText('Full name'), '   ')
    await user.click(screen.getByRole('button', { name: /add player/i }))

    expect(upsertPlayerMock).not.toHaveBeenCalled()
  })
})

describe('PlayerForm — saving a new player', () => {
  it('writes the trimmed name, squad, position and captaincy', async () => {
    const user = userEvent.setup()
    const { onSaved, onClose } = renderForm({ memberships: COACH_TWO })

    await user.type(screen.getByLabelText('Full name'), '  Tom Fletcher  ')
    await user.selectOptions(screen.getByLabelText('Position'), 'Flanker')
    await user.selectOptions(screen.getByLabelText('Age group'), 't-u14')
    await user.click(screen.getByRole('radio', { name: 'Captain' }))
    await user.click(screen.getByRole('button', { name: /add player/i }))

    await waitFor(() => expect(upsertPlayerMock).toHaveBeenCalledTimes(1))
    expect(upsertPlayerMock.mock.calls[0][0]).toEqual({
      club_id: CLUB_ID,
      team_id: 't-u14',
      full_name: 'Tom Fletcher',
      position: 'Flanker',
      is_captain: true,
    })
    // No id on an insert, and never a jersey number.
    expect(upsertPlayerMock.mock.calls[0][0]).not.toHaveProperty('id')
    expect(upsertPlayerMock.mock.calls[0][0]).not.toHaveProperty('jersey_num')
    await waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(onClose).toHaveBeenCalled()
  })

  it('writes a null position rather than an empty string when none is chosen', async () => {
    const user = userEvent.setup()
    renderForm()

    await user.type(screen.getByLabelText('Full name'), 'Tom Fletcher')
    await user.click(screen.getByRole('button', { name: /add player/i }))

    await waitFor(() => expect(upsertPlayerMock).toHaveBeenCalled())
    expect(upsertPlayerMock.mock.calls[0][0].position).toBeNull()
  })

  it('skips the contact write entirely when both contact fields are left blank', async () => {
    // A new player with no contact details on file should not leave an
    // all-null contact row behind. There is nothing to record and nothing to
    // clear.
    const user = userEvent.setup()
    renderForm()

    await user.type(screen.getByLabelText('Full name'), 'Tom Fletcher')
    await user.click(screen.getByRole('button', { name: /add player/i }))

    await waitFor(() => expect(upsertPlayerMock).toHaveBeenCalled())
    expect(upsertContactMock).not.toHaveBeenCalled()
  })

  it('writes the contact against the id the player insert came back with', async () => {
    const user = userEvent.setup()
    upsertPlayerMock.mockResolvedValue({ id: 'p-fresh', full_name: 'Tom Fletcher' })
    renderForm()

    await user.type(screen.getByLabelText('Full name'), 'Tom Fletcher')
    await user.type(screen.getByLabelText('Player phone'), '50 200 1000')
    await user.click(screen.getByRole('button', { name: /add player/i }))

    await waitFor(() => expect(upsertContactMock).toHaveBeenCalledTimes(1))
    // Stored canonically: the country picker's default (UAE) plus the typed
    // national number, normalised to E.164 regardless of how it was spaced.
    expect(upsertContactMock).toHaveBeenCalledWith({
      player_id: 'p-fresh',
      phone: '+971502001000',
      email: null,
    })
  })

  it('writes the player before the contact, never as one combined call', async () => {
    const user = userEvent.setup()
    const order = []
    upsertPlayerMock.mockImplementation(async () => {
      order.push('player')
      return { id: 'p-fresh' }
    })
    upsertContactMock.mockImplementation(async () => {
      order.push('contact')
      return {}
    })
    renderForm()

    await user.type(screen.getByLabelText('Full name'), 'Tom Fletcher')
    await user.type(screen.getByLabelText('Player email'), 'guardian@example.com')
    await user.click(screen.getByRole('button', { name: /add player/i }))

    await waitFor(() => expect(order).toEqual(['player', 'contact']))
    // The player payload carries no contact columns: they live in a different
    // table behind a different policy.
    expect(upsertPlayerMock.mock.calls[0][0]).not.toHaveProperty('phone')
    expect(upsertPlayerMock.mock.calls[0][0]).not.toHaveProperty('email')
  })

  it('trims contact values and stores a blank one as null', async () => {
    const user = userEvent.setup()
    renderForm()

    await user.type(screen.getByLabelText('Full name'), 'Tom Fletcher')
    await user.type(screen.getByLabelText('Player email'), '  guardian@example.com  ')
    await user.click(screen.getByRole('button', { name: /add player/i }))

    await waitFor(() => expect(upsertContactMock).toHaveBeenCalled())
    expect(upsertContactMock.mock.calls[0][0]).toMatchObject({
      email: 'guardian@example.com',
      phone: null,
    })
  })
})

describe('PlayerForm — editing an existing player', () => {
  it('prefills the player fields and updates by id', async () => {
    const user = userEvent.setup()
    await renderEditForm({ memberships: COACH_TWO })

    expect(screen.getByLabelText('Full name')).toHaveValue('Dhruv Ramachandran')
    expect(screen.getByLabelText('Position')).toHaveValue('Flanker')
    expect(screen.getByLabelText('Age group')).toHaveValue('t-u14')
    expect(screen.getByRole('radio', { name: 'Captain' })).toBeChecked()

    await user.click(screen.getByRole('button', { name: /save changes/i }))

    await waitFor(() => expect(upsertPlayerMock).toHaveBeenCalled())
    expect(upsertPlayerMock.mock.calls[0][0]).toMatchObject({
      id: 'p-1',
      full_name: 'Dhruv Ramachandran',
      team_id: 't-u14',
    })
  })

  it('never reassigns an edited player to a different age group behind the coach', async () => {
    // The squad reconciliation must fall back to the player's OWN team, not to
    // "the first editable team". Here the player is in U16 and the coach
    // coaches both squads, but the loaded `teams` list only carries U14 — so
    // the player's team is absent from the reconciled options and the old
    // fallback picked U14. That is a child silently moved between age groups
    // on save, which is a materially worse outcome than the same slip on a
    // fixture.
    const user = userEvent.setup()
    const u14Player = { ...EXISTING_PLAYER, id: 'p-14', team_id: 't-u16' }
    renderForm({ memberships: COACH_TWO, teams: [TEAM_U14], player: u14Player })
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /save changes/i })).not.toBeDisabled(),
    )

    await user.click(screen.getByRole('button', { name: /save changes/i }))

    await waitFor(() => expect(upsertPlayerMock).toHaveBeenCalled())
    expect(upsertPlayerMock.mock.calls[0][0]).toMatchObject({ id: 'p-14', team_id: 't-u16' })
    expect(upsertPlayerMock.mock.calls[0][0].team_id).not.toBe('t-u14')
  })

  it('prefills the contact fields from the contact row', async () => {
    getPlayerContactMock.mockResolvedValue(EXISTING_CONTACT)
    await renderEditForm()

    // The stored E.164 number is split across the two controls: the country
    // picker holds +971 and the box holds the national part.
    expect(screen.getByLabelText('Player phone')).toHaveValue('502001000')
    expect(screen.getByLabelText('Player phone country')).toHaveValue('AE')
    expect(screen.getByLabelText('Player email')).toHaveValue('guardian@example.com')
  })

  it('shows empty, editable contact fields when there is simply no contact on file', async () => {
    // "No contact recorded yet" is not "contact withheld". This form only
    // renders for a user who can edit the squad, and the contact-read policy
    // is can_edit_team(...) OR is_own_player(...) — so edit access implies
    // read access and a null row here can only mean "never entered". The
    // fields are therefore blank and usable, with nothing said about why.
    getPlayerContactMock.mockResolvedValue(null)
    await renderEditForm()

    expect(screen.getByLabelText('Player phone')).toHaveValue('')
    expect(screen.getByLabelText('Player email')).toHaveValue('')
    expect(screen.getByLabelText('Player phone')).not.toBeDisabled()
    expect(screen.queryByText(/hidden|withheld|not permitted/i)).not.toBeInTheDocument()
  })

  it('skips the contact write when there was no contact and both fields stay blank', async () => {
    const user = userEvent.setup()
    getPlayerContactMock.mockResolvedValue(null)
    await renderEditForm()

    await user.click(screen.getByRole('button', { name: /save changes/i }))

    await waitFor(() => expect(upsertPlayerMock).toHaveBeenCalled())
    expect(upsertContactMock).not.toHaveBeenCalled()
  })

  it('writes nulls when an existing contact is cleared, so the details really go', async () => {
    // The one case where an all-null contact row is exactly right: a coach
    // deleting a wrong phone number must not have it silently kept.
    const user = userEvent.setup()
    getPlayerContactMock.mockResolvedValue(EXISTING_CONTACT)
    await renderEditForm()

    await user.clear(screen.getByLabelText('Player phone'))
    await user.clear(screen.getByLabelText('Player email'))
    await user.click(screen.getByRole('button', { name: /save changes/i }))

    await waitFor(() => expect(upsertContactMock).toHaveBeenCalledTimes(1))
    expect(upsertContactMock).toHaveBeenCalledWith({ player_id: 'p-1', phone: null, email: null })
  })

  it('disables save while the contact prefill is in flight', async () => {
    // Without this, a fast-fingered coach could submit before the existing
    // contact landed, and the blank fields would overwrite real details.
    let resolveContact
    getPlayerContactMock.mockReturnValue(new Promise((resolve) => { resolveContact = resolve }))
    renderForm({ player: EXISTING_PLAYER })

    expect(screen.getByRole('button', { name: /save changes/i })).toBeDisabled()

    resolveContact(EXISTING_CONTACT)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /save changes/i })).not.toBeDisabled(),
    )
  })

  it('never overwrites contact details it failed to read', async () => {
    // A failed read leaves the fields blank. Writing those blanks would
    // destroy details the coach never saw. The player fields still save; the
    // contact write is skipped and said so.
    const user = userEvent.setup()
    getPlayerContactMock.mockRejectedValue(new Error('network down'))
    renderForm({ player: EXISTING_PLAYER })

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/contact details/i)
    expect(screen.queryByLabelText('Player phone')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /save changes/i }))
    await waitFor(() => expect(upsertPlayerMock).toHaveBeenCalled())
    expect(upsertContactMock).not.toHaveBeenCalled()
  })
})

describe('PlayerForm — failures', () => {
  it('surfaces a player-write failure and keeps the form open with the typed values', async () => {
    const user = userEvent.setup()
    upsertPlayerMock.mockRejectedValue(new Error('permission denied for table players'))
    const { onClose } = renderForm()

    await user.type(screen.getByLabelText('Full name'), 'Tom Fletcher')
    await user.click(screen.getByRole('button', { name: /add player/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent('permission denied for table players')
    expect(screen.getByLabelText('Full name')).toHaveValue('Tom Fletcher')
    expect(onClose).not.toHaveBeenCalled()
    expect(upsertContactMock).not.toHaveBeenCalled()
  })

  it('reports a contact failure as a contact failure, not as a failed save', async () => {
    const user = userEvent.setup()
    upsertContactMock.mockRejectedValue(new Error("We couldn't save the contact details."))
    const { onClose } = renderForm()

    await user.type(screen.getByLabelText('Full name'), 'Tom Fletcher')
    await user.type(screen.getByLabelText('Player phone'), '50 200 1000')
    await user.click(screen.getByRole('button', { name: /add player/i }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/contact details/i)
    // The distinguishing bit: the player DID save, and the message says so
    // rather than implying nothing was written.
    expect(alert).toHaveTextContent(/player.*saved|saved.*player/i)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('does not insert the player twice when a contact failure is retried', async () => {
    const user = userEvent.setup()
    upsertContactMock.mockRejectedValueOnce(new Error('contact write failed'))
    renderForm()

    await user.type(screen.getByLabelText('Full name'), 'Tom Fletcher')
    await user.type(screen.getByLabelText('Player phone'), '50 200 1000')
    await user.click(screen.getByRole('button', { name: /add player/i }))
    await screen.findByRole('alert')

    await user.click(screen.getByRole('button', { name: /save changes|add player/i }))

    await waitFor(() => expect(upsertPlayerMock).toHaveBeenCalledTimes(2))
    // Second attempt is an UPDATE of the row the first attempt created.
    expect(upsertPlayerMock.mock.calls[0][0]).not.toHaveProperty('id')
    expect(upsertPlayerMock.mock.calls[1][0]).toMatchObject({ id: 'p-new' })
  })

  it('disables the submit button while the save is in flight', async () => {
    const user = userEvent.setup()
    let release
    upsertPlayerMock.mockReturnValue(new Promise((resolve) => {
      release = () => resolve({ id: 'p-new' })
    }))
    const { onClose } = renderForm()

    await user.type(screen.getByLabelText('Full name'), 'Tom Fletcher')
    await user.click(screen.getByRole('button', { name: /add player/i }))

    expect(await screen.findByRole('button', { name: /saving/i })).toBeDisabled()

    // Let the in-flight save settle before the test ends, so React's state
    // update lands inside the test's act() scope rather than leaking an
    // "update was not wrapped in act(...)" warning into the suite's stderr.
    release()
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('does not submit twice when the button is clicked twice', async () => {
    const user = userEvent.setup()
    let release
    upsertPlayerMock.mockReturnValue(new Promise((resolve) => {
      release = () => resolve({ id: 'p-new' })
    }))
    const { onClose } = renderForm()

    await user.type(screen.getByLabelText('Full name'), 'Tom Fletcher')
    await user.click(screen.getByRole('button', { name: /add player/i }))
    await user.click(screen.getByRole('button', { name: /saving/i }))

    expect(upsertPlayerMock).toHaveBeenCalledTimes(1)

    release()
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('accepts typed text into every field without losing keystrokes', async () => {
    const user = userEvent.setup()
    renderForm()

    await user.type(screen.getByLabelText('Full name'), 'Faisal Al Mansoori')
    await user.type(screen.getByLabelText('Player phone'), '50 200 1000')
    await user.type(screen.getByLabelText('Player email'), 'guardian@example.com')

    expect(screen.getByLabelText('Full name')).toHaveValue('Faisal Al Mansoori')
    // The box holds EXACTLY what was typed, spaces and all. The field does
    // not reformat as you type on purpose: rewriting an input's value under
    // the user throws the caret to the end, so correcting a digit in the
    // middle of a number becomes impossible. Normalising to E.164 happens
    // once, at save.
    expect(screen.getByLabelText('Player phone')).toHaveValue('50 200 1000')
    expect(screen.getByLabelText('Player phone country')).toHaveValue('AE')
    expect(screen.getByLabelText('Player email')).toHaveValue('guardian@example.com')
  })
})

describe('Roster wiring', () => {
  it('offers an Add player button to a coach', async () => {
    useMembershipsMock.mockReturnValue(membershipValue(COACH_U14))
    render(<Roster />)
    expect(await screen.findByRole('button', { name: /add player/i })).toBeInTheDocument()
  })

  it('does not offer it to a parent', async () => {
    useMembershipsMock.mockReturnValue(membershipValue(PARENT))
    render(<Roster />)
    await screen.findByText(/no players yet/i)
    expect(screen.queryByRole('button', { name: /add player/i })).not.toBeInTheDocument()
  })

  it('opens the empty form from the Add button', async () => {
    const user = userEvent.setup()
    useMembershipsMock.mockReturnValue(membershipValue(COACH_U14))
    render(<Roster />)

    await user.click(await screen.findByRole('button', { name: /add player/i }))

    expect(await screen.findByRole('heading', { name: 'Add player' })).toBeInTheDocument()
    expect(screen.getByLabelText('Full name')).toHaveValue('')
  })

  it('reloads the roster after a save', async () => {
    const user = userEvent.setup()
    useMembershipsMock.mockReturnValue(membershipValue(COACH_U14))
    render(<Roster />)

    await user.click(await screen.findByRole('button', { name: /add player/i }))
    const callsBefore = listPlayersMock.mock.calls.length

    // Scoped to the sheet: the section head's "Add player" button matches the
    // same name, and the one being clicked here is the form's submit.
    const dialog = screen.getByRole('dialog')
    await user.type(within(dialog).getByLabelText('Full name'), 'Tom Fletcher')
    await user.click(within(dialog).getByRole('button', { name: /^add player$/i }))

    await waitFor(() => expect(listPlayersMock.mock.calls.length).toBeGreaterThan(callsBefore))
  })
})

describe('PlayerDetail wiring', () => {
  beforeEach(() => {
    listPlayersMock.mockResolvedValue([EXISTING_PLAYER])
  })

  async function openDetail(memberships) {
    const user = userEvent.setup()
    useMembershipsMock.mockReturnValue(membershipValue(memberships))
    render(<Roster />)
    await user.click(await screen.findByRole('button', { name: /Dhruv Ramachandran/i }))
    await screen.findByRole('dialog')
    return user
  }

  it('offers Edit and Delete to a coach of that squad', async () => {
    await openDetail(COACH_U14)
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByRole('button', { name: 'Edit' })).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Delete' })).toBeInTheDocument()
  })

  it('puts the name, position and age group beside a large photo, not under it', async () => {
    await openDetail(COACH_U14)
    const dialog = screen.getByRole('dialog')

    // The hero is a row: avatar first, then a single text column carrying all
    // three facts. Previously the avatar sat above the name and Position/Age
    // group were ALSO repeated as key/value rows underneath (4 Aug 2026).
    const heading = within(dialog).getByRole('heading', { name: 'Dhruv Ramachandran' })
    const textColumn = heading.parentElement
    const hero = textColumn.parentElement
    expect(hasClassToken(hero, 'flex')).toBe(true)
    expect(hasClassToken(hero, 'items-center')).toBe(true)

    // The avatar is the hero's first child and is the xl size, not lg.
    const avatar = hero.firstElementChild
    expect(avatar).not.toBe(textColumn)
    expect(hasClassToken(avatar, 'h-28')).toBe(true)
    expect(hasClassToken(avatar, 'w-28')).toBe(true)

    expect(within(textColumn).getByText('Flanker')).toBeInTheDocument()
    expect(within(textColumn).getByText('U14')).toBeInTheDocument()

    // The duplicated key/value rows are gone.
    expect(within(dialog).queryByText('Age group')).toBeNull()
  })

  it('still states captaincy as a word, now that the Role row is gone', async () => {
    await openDetail(COACH_U14)
    const dialog = screen.getByRole('dialog')

    // The fixture IS a captain. Captaincy used to be a "Role" key/value row;
    // that row went with Position and Age group, so the fact has to survive
    // somewhere readable — and as a word, never the prototype's "©" glyph,
    // which screen readers announce as "copyright".
    expect(within(dialog).getByText('Captain')).toBeInTheDocument()
    expect(within(dialog).queryByText('©')).toBeNull()
    expect(within(dialog).queryByText('Role')).toBeNull()
  })

  it('lays parent contact out like the player contact block, with Call and Email', async () => {
    listParentsMock.mockResolvedValue([
      {
        id: 'pp-1',
        full_name: 'Sara Fletcher',
        relationship: 'Mother',
        email: 'sara@example.com',
        phone: '+971502001000',
        is_primary: true,
      },
    ])

    await openDetail(COACH_U14)
    const dialog = screen.getByRole('dialog')

    expect(await within(dialog).findByText('Sara Fletcher')).toBeInTheDocument()
    expect(within(dialog).getByText('Mother · main contact')).toBeInTheDocument()
    // Labelled rows, the same shape the player's own contact block uses.
    expect(within(dialog).getAllByText('Phone').length).toBeGreaterThan(0)
    expect(within(dialog).getAllByText('Email').length).toBeGreaterThan(0)
    // ...and the same two actions.
    expect(within(dialog).getByRole('link', { name: /call/i })).toHaveAttribute(
      'href',
      'tel:+971502001000',
    )
    expect(within(dialog).getByRole('link', { name: /^email$/i })).toHaveAttribute(
      'href',
      'mailto:sara@example.com',
    )
  })

  it('offers a parent no buttons, and no read-only banner in their place', async () => {
    await openDetail(PARENT)
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
    // The absence of the buttons IS the message; the banner that used to sit
    // here said nothing the empty footer didn't already (4 Aug 2026).
    expect(within(dialog).queryByText(/read-only|can't change/i)).toBeNull()
  })

  it('opens the edit form prefilled from the player', async () => {
    const user = await openDetail(COACH_U14)

    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Edit' }))

    expect(await screen.findByRole('heading', { name: 'Edit player' })).toBeInTheDocument()
    expect(screen.getByLabelText('Full name')).toHaveValue('Dhruv Ramachandran')
  })

  it('asks for confirmation before deleting, and does nothing if cancelled', async () => {
    const user = await openDetail(COACH_U14)

    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }))
    expect(deletePlayerMock).not.toHaveBeenCalled()
    expect(screen.getByText(/remove this player\?|delete this player\?/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /keep them|keep it/i }))
    expect(deletePlayerMock).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('deletes on confirmation and closes back to the roster', async () => {
    const user = await openDetail(COACH_U14)

    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }))
    await user.click(screen.getByRole('button', { name: /yes, delete/i }))

    await waitFor(() => expect(deletePlayerMock).toHaveBeenCalledWith('p-1'))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('surfaces a delete failure and leaves the player on screen', async () => {
    deletePlayerMock.mockRejectedValue(new Error('permission denied for table players'))
    const user = await openDetail(COACH_U14)

    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }))
    await user.click(screen.getByRole('button', { name: /yes, delete/i }))

    const dialog = screen.getByRole('dialog')
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'permission denied for table players',
    )
    expect(dialog).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------
// Parents editor, photo field and the U13 boundary (3 Aug 2026)
// ---------------------------------------------------------------------

describe('PlayerForm — parents', () => {
  it('warns when there is no parent on file, without blocking the save', async () => {
    // Jay's ruling: warn, never block. ~159 existing players have no parent
    // rows, so a hard requirement would make a typo fix impossible until
    // someone tracked down a phone number.
    const user = userEvent.setup()
    renderForm()

    expect(screen.getByRole('status')).toHaveTextContent(/no parent on file/i)

    await user.type(screen.getByLabelText('Full name'), 'Tom Fletcher')
    const save = screen.getByRole('button', { name: /add player/i })
    expect(save).not.toBeDisabled()

    await user.click(save)
    await waitFor(() => expect(upsertPlayerMock).toHaveBeenCalled())
  })

  it('adds a parent row and saves it as E.164 against the new player id', async () => {
    const user = userEvent.setup()
    upsertPlayerMock.mockResolvedValue({ id: 'p-fresh', full_name: 'Tom Fletcher' })
    renderForm()

    await user.type(screen.getByLabelText('Full name'), 'Tom Fletcher')
    await user.click(screen.getByRole('button', { name: /add parent/i }))

    await user.type(screen.getByLabelText('Full name', { selector: '#parent-name-0' }), 'Sara Fletcher')
    await user.selectOptions(screen.getByLabelText('Relationship'), 'Mother')
    await user.type(screen.getByLabelText('Phone'), '50 200 1000')
    await user.type(screen.getByLabelText('Email'), 'sara@example.com')

    await user.click(screen.getByRole('button', { name: /add player/i }))

    await waitFor(() => expect(saveParentsMock).toHaveBeenCalled())
    const [playerId, rows] = saveParentsMock.mock.calls[0]
    expect(playerId).toBe('p-fresh')
    expect(rows[0]).toMatchObject({
      full_name: 'Sara Fletcher',
      relationship: 'Mother',
      email: 'sara@example.com',
      phone: '+971502001000',
      is_primary: true, // the first parent added is the main contact
    })
  })

  it('prefills existing parent rows with the phone split across the two controls', async () => {
    listParentsMock.mockResolvedValue([
      {
        id: 'pp-1',
        full_name: 'Sara Fletcher',
        relationship: 'Mother',
        email: 'sara@example.com',
        phone: '+971502001000',
        is_primary: true,
      },
    ])
    await renderEditForm()

    expect(screen.getByLabelText('Full name', { selector: '#parent-name-0' })).toHaveValue(
      'Sara Fletcher',
    )
    expect(screen.getByLabelText('Relationship')).toHaveValue('Mother')
    expect(screen.getByLabelText('Phone')).toHaveValue('502001000')
    expect(screen.getByLabelText('Phone country')).toHaveValue('AE')
  })

  it('offers only the agreed relationships, with no free-text option', async () => {
    const user = userEvent.setup()
    renderForm()
    await user.click(screen.getByRole('button', { name: /add parent/i }))

    const select = screen.getByLabelText('Relationship')
    expect(select.tagName).toBe('SELECT')
    const options = within(select)
      .getAllByRole('option')
      .map((option) => option.textContent)
    expect(options).toEqual([
      'Not set',
      'Mother',
      'Father',
      'Step-mother',
      'Step-father',
      'Aunt',
      'Uncle',
      'Grandmother',
      'Grandfather',
      'Guardian',
    ])
  })

  it('skips the parent write entirely when the parent read failed', async () => {
    // saveParents replaces the whole set, so saving an empty editor over rows
    // that exist but were never loaded would delete them.
    const user = userEvent.setup()
    listParentsMock.mockRejectedValue(new Error('nope'))
    await renderEditForm()

    expect(screen.getByRole('alert')).toHaveTextContent(/couldn't load this player's parent/i)

    await user.click(screen.getByRole('button', { name: /save changes/i }))
    await waitFor(() => expect(upsertPlayerMock).toHaveBeenCalled())
    expect(saveParentsMock).not.toHaveBeenCalled()
  })

  it('reports a parent failure as a parent failure, not as a failed save', async () => {
    const user = userEvent.setup()
    saveParentsMock.mockRejectedValue(new Error('Parents refused'))
    await renderEditForm()

    await user.click(screen.getByRole('button', { name: /save changes/i }))

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        /the player was saved, but the parent details were not/i,
      ),
    )
  })
})

describe('PlayerForm — the U13 own-contact boundary', () => {
  it('offers no player contact fields for an under-13 squad', async () => {
    renderForm({ memberships: [{ id: 'm-c', role: 'coach', team_id: 't-u10' }], teams: [TEAM_U10] })

    await waitFor(() => expect(screen.getByLabelText('Age group')).toHaveValue('t-u10'))
    expect(screen.queryByLabelText('Player phone')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Player email')).not.toBeInTheDocument()
    expect(screen.getByText(/players under 13 don't have their own contact details/i)).toBeInTheDocument()
    // The parent rows are still offered — they are where an under-13's
    // details belong.
    expect(screen.getByRole('button', { name: /add parent/i })).toBeInTheDocument()
  })

  it('reveals the fields as soon as the squad is changed to U13 or above', async () => {
    // Keyed off the SELECTED squad, not the stored one, so moving a player up
    // an age group shows the fields immediately rather than after a reopen.
    const user = userEvent.setup()
    renderForm({
      memberships: [
        { id: 'm-c1', role: 'coach', team_id: 't-u10' },
        { id: 'm-c2', role: 'coach', team_id: 't-u14' },
      ],
      teams: [TEAM_U10, TEAM_U14],
    })

    expect(screen.queryByLabelText('Player phone')).not.toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText('Age group'), 't-u14')

    expect(screen.getByLabelText('Player phone')).toBeInTheDocument()
  })
})
