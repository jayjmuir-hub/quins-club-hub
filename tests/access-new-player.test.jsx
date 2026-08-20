import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Granting PLAYER access to somebody who is not on the roster yet.
//
// ⚠️ THE BUG THIS FIXES, reported by Jay 10 Aug 2026: he created a login for
// his son, went to give him Player access, and the only choices were six
// unrelated `Test Player` rows. There was no way to add a new player, so the
// account could not be granted at all.
//
// ⚠️ AND IT IS THE NORMAL CASE, NOT AN EDGE ONE. The 10 Aug no-roster-import
// decision settled that parents self-onboard and the old roster most likely
// never goes in — so almost every player ever granted access will not be on
// the roster beforehand.
//
// ⚠️ WHY IT CREATES A PLAYER RATHER THAN REUSING THE PARENT'S FALLBACK. A
// parent whose children are not on the roster gets age-group rows with
// player_id null. That cannot work for a player: `private.is_own_player` is
// `m.player_id = _player AND role in ('parent','player')`, so a player
// membership with a null player_id matches nothing, and the account could
// never set its own availability, photo or gender. It would look granted and
// behave like a stranger.

const upsertPlayerMock = vi.fn()

vi.mock('../src/data/players.js', () => ({
  upsertPlayer: (...args) => upsertPlayerMock(...args),
}))

const AccessBuilder = (await import('../src/components/AccessBuilder.jsx')).default

const TEAMS = [
  { id: 'team-u16b', name: 'U16B Contact', club_id: 'club-1' },
  { id: 'team-u14b', name: 'U14B Contact', club_id: 'club-1' },
]

function setup(props = {}) {
  const onSubmit = vi.fn()
  render(
    <AccessBuilder
      label="t.brennan@example.com"
      teams={TEAMS}
      players={[]}
      onSubmit={onSubmit}
      {...props}
    />,
  )
  return { onSubmit, user: userEvent.setup() }
}

async function chooseNewPlayer(user) {
  await user.selectOptions(screen.getByLabelText(/role for/i), 'player')
  await user.click(screen.getByRole('checkbox', { name: /on the roster yet/i }))
}

beforeEach(() => {
  upsertPlayerMock.mockReset()
  upsertPlayerMock.mockResolvedValue({ id: 'player-new', team_id: 'team-u16b' })
})

describe('granting Player access to someone not on the roster', () => {
  it('offers the escape hatch at all — the bug was that it did not', async () => {
    const { user } = setup()
    await user.selectOptions(screen.getByLabelText(/role for/i), 'player')
    expect(screen.getByRole('checkbox', { name: /on the roster yet/i })).toBeInTheDocument()
  })

  it('swaps the picker for a new-player form', async () => {
    const { user } = setup()
    await chooseNewPlayer(user)

    expect(screen.getByTestId('new-player-form')).toBeInTheDocument()
    expect(screen.queryByLabelText(/^Player for/i)).not.toBeInTheDocument()
  })

  it('creates the player, then grants against the id the DATABASE returned', async () => {
    const { onSubmit, user } = setup()
    await chooseNewPlayer(user)

    await user.type(screen.getByLabelText(/name of the new player/i), 'Tyler Muir')
    await user.selectOptions(screen.getByLabelText(/age group for the new player/i), 'team-u16b')
    await user.click(screen.getByRole('button', { name: /give access/i }))

    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    // ⚠️ club_id ADDED 20 Aug 2026, AND THIS ASSERTION USED TO PIN THE BUG.
    // It demanded EXACTLY { full_name, team_id }, so it went green while the
    // live insert was missing a NOT NULL column and an admin was shown the raw
    // Postgres refusal mid-approval. It is still an exact match on purpose —
    // an extra column here is a column the database was never asked about.
    expect(upsertPlayerMock).toHaveBeenCalledWith({
      full_name: 'Tyler Muir',
      team_id: 'team-u16b',
      club_id: 'club-1',
    })
    expect(onSubmit).toHaveBeenCalledWith([
      { role: 'player', teamId: 'team-u16b', playerId: 'player-new' },
    ])
  })

  it("⚠️ follows the created row's team, not the one posted", async () => {
    // A trigger or default could legitimately place the player elsewhere. The
    // membership must follow the player, or the account is scoped to a squad
    // the child is not in.
    upsertPlayerMock.mockResolvedValue({ id: 'player-new', team_id: 'team-u14b' })
    const { onSubmit, user } = setup()
    await chooseNewPlayer(user)

    await user.type(screen.getByLabelText(/name of the new player/i), 'Tyler Muir')
    await user.selectOptions(screen.getByLabelText(/age group for the new player/i), 'team-u16b')
    await user.click(screen.getByRole('button', { name: /give access/i }))

    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    expect(onSubmit.mock.calls[0][0][0].teamId).toBe('team-u14b')
  })

  it('refuses without a name, and creates nothing', async () => {
    const { onSubmit, user } = setup()
    await chooseNewPlayer(user)
    await user.selectOptions(screen.getByLabelText(/age group for the new player/i), 'team-u16b')
    await user.click(screen.getByRole('button', { name: /give access/i }))

    expect(await screen.findByText(/give the new player a name/i)).toBeInTheDocument()
    expect(upsertPlayerMock).not.toHaveBeenCalled()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('refuses without an age group, and creates nothing', async () => {
    const { onSubmit, user } = setup()
    await chooseNewPlayer(user)
    await user.type(screen.getByLabelText(/name of the new player/i), 'Tyler Muir')
    await user.click(screen.getByRole('button', { name: /give access/i }))

    expect(await screen.findByText(/choose an age group for the new player/i)).toBeInTheDocument()
    expect(upsertPlayerMock).not.toHaveBeenCalled()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('⚠️ CREATES NO PLAYER WHEN THE GRANT IS REFUSED — no orphan child', async () => {
    // THE ORDERING GUARANTEE, and the reason creation is the LAST thing
    // submit() does rather than part of buildRows(). Creating first would put
    // a real child on the roster every time the grant was then refused — and
    // in THIS table a stray row is a stray CHILD, which somebody has to notice
    // and delete.
    //
    // ⚠️ The existing row must collide with the row AS BUILT — role, teamId,
    // playerId null — because that is what the duplicate check compares. An
    // earlier version of this test used an existing row carrying a player_id,
    // which does not collide, so the refusal never fired and the test proved
    // nothing while passing.
    const { onSubmit, user } = setup({
      existing: [{ role: 'player', team_id: 'team-u16b', player_id: null }],
    })
    await chooseNewPlayer(user)
    await user.type(screen.getByLabelText(/name of the new player/i), 'Tyler Muir')
    await user.selectOptions(screen.getByLabelText(/age group for the new player/i), 'team-u16b')
    await user.click(screen.getByRole('button', { name: /give access/i }))

    expect(await screen.findByText(/already have that access/i)).toBeInTheDocument()
    expect(upsertPlayerMock, 'a refused grant must not leave a child on the roster').not.toHaveBeenCalled()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('⚠️ surfaces a failed creation and grants nothing', async () => {
    // RLS refuses a player insert for anyone who cannot edit that squad. The
    // operator must see that rather than a silent no-op.
    upsertPlayerMock.mockRejectedValue(new Error('permission denied for table players'))
    const { onSubmit, user } = setup()
    await chooseNewPlayer(user)
    await user.type(screen.getByLabelText(/name of the new player/i), 'Tyler Muir')
    await user.selectOptions(screen.getByLabelText(/age group for the new player/i), 'team-u16b')
    await user.click(screen.getByRole('button', { name: /give access/i }))

    expect(await screen.findByText(/permission denied for table players/i)).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  // ⚠️ THIS TEST USED TO PIN A PATH THAT COULD NEVER WORK — rewritten
  // 20 Aug 2026. It asserted that a parent with "not on the roster yet" builds
  // an age-group row and creates NO player. The database refuses exactly that
  // row (`memberships_family_role_needs_player`), so the behaviour it protected
  // produced a refusal every time an admin used it. A green test over a broken
  // control is worse than no test: it is why this survived to production.
  it('adds the child and links the parent to it', async () => {
    upsertPlayerMock.mockResolvedValue({ id: 'player-new', team_id: 'team-u16b' })
    const { onSubmit, user } = setup()
    await user.selectOptions(screen.getByLabelText(/role for/i), 'parent')
    // ⚠️ Matching the SHARED part of the two wordings, not either one: both
    // roles now add the person, but a parent adds a "child" and a player adds
    // themselves, so the labels differ and the behaviour is what matters here.
    await user.click(screen.getByRole('checkbox', { name: /on the roster yet/i }))

    // The same form the player role gets — because the same rule applies.
    expect(screen.getByTestId('new-player-form')).toBeInTheDocument()
    await user.type(screen.getByLabelText(/name of the new child/i), 'Rowan Adeyemi')
    await user.selectOptions(screen.getByLabelText(/age group for the new child/i), 'team-u16b')
    await user.click(screen.getByRole('button', { name: /give access/i }))

    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    expect(upsertPlayerMock).toHaveBeenCalledWith({
      full_name: 'Rowan Adeyemi',
      team_id: 'team-u16b',
      club_id: 'club-1',
    })
    // ⚠️ role 'parent', NOT 'player'. The branch is shared; hard-coding the
    // role there would land a parent on their own child's squad as a PLAYER.
    // And playerId is the id the DATABASE returned — the whole reason this row
    // can exist at all.
    expect(onSubmit).toHaveBeenCalledWith([
      { role: 'parent', teamId: 'team-u16b', playerId: 'player-new' },
    ])
  })
})
