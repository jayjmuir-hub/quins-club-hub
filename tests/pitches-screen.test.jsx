import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// The pitch setup screen — "blocks as columns", picked by Jay from six laid
// out at browser width on 11 Aug 2026.
//
// ⚠️ THE RIGHT GATES THE SCREEN, NOT THE DATA, and these tests must not be
// read as security. Every admin can already write `pitches` — the RLS policy
// is `is_admin` deliberately, because these rights decide which dashboard
// somebody is SHOWN. Hiding this screen is a "not your job" message. What
// actually governs the table is RLS, and no test in this file touches it.

const listPitchesMock = vi.fn()
const upsertPitchMock = vi.fn()
const setPitchActiveMock = vi.fn()
const useMembershipsMock = vi.fn()

vi.mock('../src/data/pitches.js', () => ({
  listPitches: (...a) => listPitchesMock(...a),
  upsertPitch: (...a) => upsertPitchMock(...a),
  setPitchActive: (...a) => setPitchActiveMock(...a),
  PITCH_TBD: 'Pitch TBD',
}))

vi.mock('../src/lib/memberships.jsx', () => ({
  useMemberships: () => useMembershipsMock(),
}))

const mod = await import('../src/screens/Pitches.jsx')
const Pitches = mod.default
const { blockOf, groupByBlock, OTHER_BLOCK } = mod

const pitch = (name, extra = {}) => ({
  id: `p-${name}`,
  club_id: 'club-1',
  name,
  sort_order: 1,
  is_active: true,
  ...extra,
})

const THE_CLUBS_PITCHES = [
  pitch('A1'), pitch('A2'), pitch('A3', { is_active: false }), pitch('A4'),
  pitch('B1'),
  pitch('C1'), pitch('C2'), pitch('C3'), pitch('C4'), pitch('C5'),
  pitch('D1'), pitch('D2'), pitch('D3'), pitch('D4'), pitch('D5'),
]

const withRight = [{ role: 'admin', status: 'active', admin_rights: ['pitches'] }]

beforeEach(() => {
  listPitchesMock.mockReset().mockResolvedValue(THE_CLUBS_PITCHES)
  upsertPitchMock.mockReset().mockResolvedValue(pitch('A5'))
  setPitchActiveMock.mockReset().mockResolvedValue(pitch('A3', { is_active: false }))
  useMembershipsMock.mockReset().mockReturnValue({ memberships: withRight, teams: [] })
})

describe('blockOf', () => {
  it('reads the block out of the name', () => {
    expect(blockOf('A1')).toBe('A')
    expect(blockOf('C5')).toBe('C')
    expect(blockOf('d2')).toBe('D')
  })

  it('⚠️ gives a name that does not fit the scheme its own bucket', () => {
    // There is no `block` column — the block is derived, because the club
    // already puts it in the name and a second column is a second place for it
    // to be wrong. The cost is names like this, which must land SOMEWHERE
    // rather than being silently dropped from the grouping.
    expect(blockOf('Clubhouse lawn')).toBe(OTHER_BLOCK)
    expect(blockOf('')).toBe(OTHER_BLOCK)
    expect(blockOf(null)).toBe(OTHER_BLOCK)
  })
})

describe('groupByBlock', () => {
  it('groups the club into A, B, C, D', () => {
    expect(groupByBlock(THE_CLUBS_PITCHES).map((g) => g.block)).toEqual(['A', 'B', 'C', 'D'])
  })

  it('⚠️ always sorts Other last', () => {
    // A bucket for names that do not fit, sorting into the middle of A/B/C/D,
    // reads as a block the club does not have.
    const grouped = groupByBlock([pitch('Clubhouse lawn'), pitch('D1'), pitch('A1')])
    expect(grouped.map((g) => g.block)).toEqual(['A', 'D', OTHER_BLOCK])
  })

  it('loses no pitch', () => {
    const total = groupByBlock(THE_CLUBS_PITCHES).reduce((n, g) => n + g.pitches.length, 0)
    expect(total).toBe(THE_CLUBS_PITCHES.length)
  })
})

describe('the screen', () => {
  it('⚠️ asks for RETIRED pitches too — it is the only screen that can restore one', async () => {
    render(<Pitches />)
    await screen.findByText('Pitches')
    expect(listPitchesMock).toHaveBeenCalledWith({ includeRetired: true })
  })

  it('draws one card per block, with the whole estate visible', async () => {
    render(<Pitches />)
    const blocks = await screen.findAllByTestId('pitch-block')
    expect(blocks).toHaveLength(4)
    expect(await screen.findAllByTestId('pitch-chip')).toHaveLength(15)
  })

  it('counts the retired ones where somebody will look', async () => {
    render(<Pitches />)
    expect(await screen.findByText(/15 pitches · 1 retired/)).toBeInTheDocument()
    const aBlock = (await screen.findAllByTestId('pitch-block'))[0]
    expect(within(aBlock).getByText(/4 pitches · 1 retired/)).toBeInTheDocument()
  })

  it('⚠️ a retired pitch is announced as retired, not merely drawn faintly', async () => {
    // The dashed outline is invisible to a screen reader, and "which are out
    // of action" is the main question this screen answers.
    render(<Pitches />)
    expect(await screen.findByRole('button', { name: 'A3, retired' })).toBeInTheDocument()
  })

  it('renames through upsertPitch', async () => {
    const user = userEvent.setup()
    render(<Pitches />)
    await user.click(await screen.findByRole('button', { name: 'A1' }))
    const field = screen.getByLabelText('Pitch name')
    await user.clear(field)
    await user.type(field, 'A1a')
    await user.click(screen.getByRole('button', { name: /save name/i }))

    await waitFor(() => expect(upsertPitchMock).toHaveBeenCalled())
    expect(upsertPitchMock).toHaveBeenCalledWith({ id: 'p-A1', name: 'A1a' })
  })

  it('⚠️ WARNS THAT A RENAME LEAVES THE FIXTURES BEHIND', async () => {
    // `events.pitch` is TEXT with no foreign key, so a rename does not touch
    // fixtures already naming the pitch — they keep the old string and stop
    // matching for clash detection. This is the single most surprising thing
    // about the screen and it has to be said on it, not in a comment.
    const user = userEvent.setup()
    render(<Pitches />)
    await user.click(await screen.findByRole('button', { name: 'A1' }))
    expect(screen.getByText(/does not change fixtures that already say/i)).toBeInTheDocument()
    expect(screen.getByText(/retire it instead/i)).toBeInTheDocument()
  })

  it('retires through setPitchActive, and offers to bring a retired one back', async () => {
    const user = userEvent.setup()
    render(<Pitches />)

    await user.click(await screen.findByRole('button', { name: 'A1' }))
    await user.click(screen.getByRole('button', { name: /^retire$/i }))
    await waitFor(() => expect(setPitchActiveMock).toHaveBeenCalledWith('p-A1', false))

    await user.click(await screen.findByRole('button', { name: 'A3, retired' }))
    expect(screen.getByRole('button', { name: /bring back/i })).toBeInTheDocument()
  })

  it('adds a pitch, seeded with the block that was clicked', async () => {
    const user = userEvent.setup()
    render(<Pitches />)
    const aBlock = (await screen.findAllByTestId('pitch-block'))[0]
    await user.click(within(aBlock).getByRole('button', { name: /add a pitch to A block/i }))

    await user.type(screen.getByLabelText('Pitch name'), 'A5')
    await user.click(screen.getByRole('button', { name: /add pitch/i }))

    await waitFor(() => expect(upsertPitchMock).toHaveBeenCalled())
    expect(upsertPitchMock.mock.calls[0][0]).toMatchObject({ name: 'A5', club_id: 'club-1' })
  })

  it('refuses to save an empty name', async () => {
    const user = userEvent.setup()
    render(<Pitches />)
    await user.click(await screen.findByRole('button', { name: 'A1' }))
    await user.clear(screen.getByLabelText('Pitch name'))
    expect(screen.getByRole('button', { name: /save name/i })).toBeDisabled()
  })

  it('⚠️ surfaces a refused save rather than closing as if it worked', async () => {
    upsertPitchMock.mockRejectedValue(new Error('duplicate key value violates unique constraint'))
    const user = userEvent.setup()
    render(<Pitches />)
    await user.click(await screen.findByRole('button', { name: 'A1' }))
    await user.click(screen.getByRole('button', { name: /save name/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/duplicate key/i)
  })

  it('⚠️ says "not your job" to an admin without the right, and loads nothing', async () => {
    useMembershipsMock.mockReturnValue({
      memberships: [{ role: 'admin', status: 'active', admin_rights: [] }],
      teams: [],
    })
    render(<Pitches />)
    expect(await screen.findByText(/Pitch Management hasn't been added to your account/i)).toBeInTheDocument()
    expect(screen.queryAllByTestId('pitch-chip')).toHaveLength(0)
  })

  it('lets a SUPER admin in without the right being listed', async () => {
    // A super admin holds every right implicitly, or Jay would have to grant
    // himself each new one as he invents it.
    useMembershipsMock.mockReturnValue({
      memberships: [{ role: 'admin', status: 'active', is_super: true, admin_rights: [] }],
      teams: [],
    })
    render(<Pitches />)
    expect(await screen.findAllByTestId('pitch-chip')).toHaveLength(15)
  })
})
