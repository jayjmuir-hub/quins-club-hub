import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'

// /admin/needs-attention — the third and last surface of the completeness rule
// (item 6 of claude/plans/2026-08-16-account-creation-redesign.md).
//
// ⚠️ THE TESTS THAT MATTER HERE ARE THE ONES ABOUT WHAT IT DOES NOT DO. It is
// easy to build a list of every incomplete record; the whole design question is
// whether it can ever be EMPTY, whether it repeats a plea addressed to somebody
// else, and whether a sweep of every child in the club drags private data into a
// browser to answer a question that only needed a count.

const listPlayersMock = vi.fn()
const listPlayerPrivatePresenceMock = vi.fn()
const listParentsForPlayersMock = vi.fn()
const useMembershipsMock = vi.fn()

vi.mock('../src/data/players.js', () => ({
  listPlayers: (...args) => listPlayersMock(...args),
  listPlayerPrivatePresence: (...args) => listPlayerPrivatePresenceMock(...args),
}))

vi.mock('../src/data/parents.js', () => ({
  listParentsForPlayers: (...args) => listParentsForPlayersMock(...args),
}))

vi.mock('../src/lib/memberships.jsx', () => ({
  useMemberships: () => useMembershipsMock(),
}))

import AdminNeedsAttention from '../src/screens/AdminNeedsAttention.jsx'

// ⚠️ U13B IS SINGLE-GENDER AND U12 MIXED, which is what makes the gender rule
// testable at all — it is asked for only where the squad requires it.
const TEAMS = [
  { id: 't-u13b', name: 'U13B', sort_order: 4 },
  { id: 't-u12', name: 'U12', sort_order: 3 },
]

// Invented names — this repo is public and its members are mostly children.
const COMPLETE = {
  id: 'p-complete',
  full_name: 'Ada Fitzhardinge',
  team_id: 't-u13b',
  gender: 'boys',
}
const NO_DOB = { id: 'p-nodob', full_name: 'Bo Nkemelu', team_id: 't-u13b', gender: 'boys' }
const NO_PARENT = { id: 'p-noparent', full_name: 'Cai Rasmussen', team_id: 't-u12', gender: null }

function memberships() {
  return {
    memberships: [{ id: 'm1', role: 'admin', status: 'active', team_id: null, admin_rights: [] }],
    realMemberships: [],
    teams: TEAMS,
    viewAs: null,
    setViewAs: vi.fn(),
    loading: false,
    error: null,
    reload: vi.fn(),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  useMembershipsMock.mockReturnValue(memberships())
  listPlayerPrivatePresenceMock.mockResolvedValue(new Set())
  listParentsForPlayersMock.mockResolvedValue([])
})

describe('AdminNeedsAttention', () => {
  it('⚠️ can be EMPTY, which is the whole contract', async () => {
    // A list that always has rows is one nobody finishes — the same reasoning
    // the family's disappearing card is built on. If this screen cannot reach
    // zero it is a permanent complaint wearing a chase list's clothes.
    listPlayersMock.mockResolvedValue([COMPLETE])
    listPlayerPrivatePresenceMock.mockResolvedValue(new Set(['p-complete']))
    listParentsForPlayersMock.mockResolvedValue([{ id: 'pp-1', player_id: 'p-complete' }])

    render(<AdminNeedsAttention />)

    expect(await screen.findByTestId('attention-summary')).toHaveTextContent('Nothing missing.')
    expect(screen.queryByTestId('attention-player')).not.toBeInTheDocument()
  })

  it('lists only the incomplete players, and says what is missing', async () => {
    listPlayersMock.mockResolvedValue([COMPLETE, NO_DOB])
    listPlayerPrivatePresenceMock.mockResolvedValue(new Set(['p-complete']))
    listParentsForPlayersMock.mockResolvedValue([
      { id: 'pp-1', player_id: 'p-complete' },
      { id: 'pp-2', player_id: 'p-nodob' },
    ])

    render(<AdminNeedsAttention />)

    const rows = await screen.findAllByTestId('attention-player')
    expect(rows).toHaveLength(1)
    expect(within(rows[0]).getByText('Bo Nkemelu')).toBeInTheDocument()
    expect(within(rows[0]).getByText('No date of birth')).toBeInTheDocument()
  })

  // ⚠️ THE DENOMINATOR IS WHAT MAKES IT ACTIONABLE. "1" says how much work there
  //    is; "1 of 2" says how bad it is, and a squad heading that counted only
  //    the broken rows would read as a squad with two players.
  it('counts the incomplete against the whole squad, not against itself', async () => {
    listPlayersMock.mockResolvedValue([COMPLETE, NO_DOB])
    listPlayerPrivatePresenceMock.mockResolvedValue(new Set(['p-complete']))
    listParentsForPlayersMock.mockResolvedValue([
      { id: 'pp-1', player_id: 'p-complete' },
      { id: 'pp-2', player_id: 'p-nodob' },
    ])

    render(<AdminNeedsAttention />)

    const squad = await screen.findByTestId('attention-squad')
    expect(within(squad).getByText('1 of 2')).toBeInTheDocument()
  })

  // ⚠️ THE RULE LIVES IN completeness.js AND IS ONLY READ HERE. Gender is asked
  //    for on a single-gender squad and nowhere else — chasing it on a mixed
  //    squad would be the app demanding something it does not itself require.
  it('⚠️ does not chase a gender on a mixed squad', async () => {
    listPlayersMock.mockResolvedValue([NO_PARENT])
    listPlayerPrivatePresenceMock.mockResolvedValue(new Set(['p-noparent']))

    render(<AdminNeedsAttention />)

    const row = await screen.findByTestId('attention-player')
    expect(within(row).getByText('No parent on file')).toBeInTheDocument()
    expect(within(row).queryByText('No gender')).not.toBeInTheDocument()
  })

  it('chases it on a single-gender squad', async () => {
    listPlayersMock.mockResolvedValue([{ ...NO_DOB, gender: null }])
    listPlayerPrivatePresenceMock.mockResolvedValue(new Set(['p-nodob']))
    listParentsForPlayersMock.mockResolvedValue([{ id: 'pp-2', player_id: 'p-nodob' }])

    render(<AdminNeedsAttention />)

    const row = await screen.findByTestId('attention-player')
    expect(within(row).getByText('No gender')).toBeInTheDocument()
  })

  // ⚠️ THE READ THAT IS DELIBERATELY NOT MADE. player_private is a separate
  //    table precisely so a team-mate's parent cannot read a birthday; a
  //    club-wide sweep that fetches every date to count the missing ones is the
  //    same mistake from the privileged end. The presence reader answers it with
  //    ids alone, and this assertion is what stops somebody "simplifying" it
  //    back to listPlayerPrivate.
  it('⚠️ never fetches a single date of birth', async () => {
    listPlayersMock.mockResolvedValue([COMPLETE, NO_DOB])
    render(<AdminNeedsAttention />)
    await screen.findByTestId('attention-summary')

    expect(listPlayerPrivatePresenceMock).toHaveBeenCalledWith(['p-complete', 'p-nodob'])
    // The set it returns carries ids and nothing else, so there is no date on
    // the object for a later change to start rendering.
    const returned = await listPlayerPrivatePresenceMock.mock.results[0].value
    expect(returned).toBeInstanceOf(Set)
  })

  // ⚠️ THE USEFUL NEXT ACTION IS USUALLY NOTHING. Every gap here is already on
  //    the family's own screen; a registrar who does not know that will ring
  //    people the app is politely asking, and the club gets two channels asking
  //    for one birthday.
  it('⚠️ says the families are already being asked', async () => {
    listPlayersMock.mockResolvedValue([NO_DOB])
    listParentsForPlayersMock.mockResolvedValue([{ id: 'pp-2', player_id: 'p-nodob' }])

    render(<AdminNeedsAttention />)

    expect(await screen.findByTestId('attention-summary')).toHaveTextContent(
      /already being asked on their own screen/i,
    )
  })

  // ⚠️ POSITION FAILS BOTH TESTS IN completeness.js AND MUST STAY OUT: 23 of 26
  //    players have none, and it is a coach's judgement rather than a record to
  //    chase. Listing it would put almost every player on this screen forever,
  //    which is the failure the whole design avoids.
  it('⚠️ says nothing about a missing position', async () => {
    listPlayersMock.mockResolvedValue([{ ...COMPLETE, position: null }])
    listPlayerPrivatePresenceMock.mockResolvedValue(new Set(['p-complete']))
    listParentsForPlayersMock.mockResolvedValue([{ id: 'pp-1', player_id: 'p-complete' }])

    render(<AdminNeedsAttention />)

    expect(await screen.findByTestId('attention-summary')).toHaveTextContent('Nothing missing.')
  })

  it('reports a failed read instead of an empty, healthy-looking list', async () => {
    // ⚠️ THE DISCRIMINATING CASE, and on this screen the two outcomes are
    // opposite: "nothing missing" is the good news everybody wants to see, and
    // it is exactly what a broken read looks like.
    listPlayersMock.mockRejectedValue(new Error('network down'))

    render(<AdminNeedsAttention />)

    expect(await screen.findByRole('alert')).toHaveTextContent('network down')
    expect(screen.queryByText('Nothing missing.')).not.toBeInTheDocument()
  })
})
