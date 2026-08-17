import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

// The `allowsOwnContact` re-point — item 3 of
// claude/plans/2026-08-16-account-creation-redesign.md, promised on 3 Aug 2026
// and deferred three times.
//
// THE RULE (Jay, 3 Aug 2026): a player in U13 or above may optionally hold their
// own email and phone. Below U13 they may not, and the forms must not render the
// fields at all rather than render them disabled.
//
// ⚠️ EVERY TEST HERE IS ABOUT DIRECTION. The birthday is allowed to CLOSE this
// gate and never to open it, because a parent writes their own child's birthday
// — so a gate a birthday could open is a gate a family unlocks by typing a
// different year. Half of these assertions exist to fail if somebody makes the
// rule "more accurate" in the widening direction.

const getPlayerDobMock = vi.fn()

vi.mock('../src/data/players.js', () => ({
  getPlayerDob: (...args) => getPlayerDobMock(...args),
}))

import { allowsOwnContactFor } from '../src/lib/ageGrade.js'
import { allowsOwnContact } from '../src/lib/ageGroup.js'
import useOwnContactGate from '../src/lib/useOwnContactGate.js'

// Fixed so the cut-off is not a moving target. October 2026 → the governing
// cut-off is 31 Aug 2026.
const TODAY = new Date('2026-10-01T00:00:00Z')

// Ages AT that cut-off, which is the only age this gate is allowed to ask about.
const AGE_15 = '2011-01-15'
const AGE_12 = '2014-01-15'
const AGE_11 = '2015-01-15'

describe('allowsOwnContactFor', () => {
  it('leaves a normal U13 player exactly as the squad name had them', () => {
    // ⚠️ "U13" MEANS AGE 12 AT THE CUT-OFF, so a U13 squad is mostly
    // TWELVE-year-olds for most of the season. A gate asking "is this child 13
    // today?" would strip the field from nearly a whole squad the club's own
    // rule permits it for — gradually, as birthdays passed.
    expect(allowsOwnContact('U13')).toBe(true)
    expect(allowsOwnContactFor({ teamName: 'U13', dateOfBirth: AGE_12, today: TODAY })).toBe(true)
  })

  it('⚠️ takes the field away from a child playing UP into a squad old enough for it', () => {
    // The case the re-point exists for: an eleven-year-old in U13. The squad
    // name says yes and the birthday says no, and the birthday wins because it
    // is the stricter of the two.
    expect(allowsOwnContact('U13')).toBe(true)
    expect(allowsOwnContactFor({ teamName: 'U13', dateOfBirth: AGE_11, today: TODAY })).toBe(false)
  })

  it('⚠️ NEVER hands the field to a child in a squad too young for it', () => {
    // A fifteen-year-old in U8 is nonsense data, but this is the direction that
    // matters: a parent writes the birthday, so if it could OPEN the gate, a
    // family could unlock a field the club forbids by typing a different year.
    expect(allowsOwnContact('U8')).toBe(false)
    expect(allowsOwnContactFor({ teamName: 'U8', dateOfBirth: AGE_15, today: TODAY })).toBe(false)
  })

  it('⚠️ leaves the squad answer alone when there is no birthday', () => {
    // getPlayerDob returns null both for "not set" and for "RLS will not show
    // you". Failing closed would strip the field from every child in a club
    // whose player_private is nearly empty, and would do it to team-mates'
    // records purely because the reader could not see them.
    expect(allowsOwnContactFor({ teamName: 'U16B', dateOfBirth: null, today: TODAY })).toBe(true)
    expect(allowsOwnContactFor({ teamName: 'U8', dateOfBirth: null, today: TODAY })).toBe(false)
  })

  it('leaves the squad answer alone for an unparseable birthday', () => {
    expect(allowsOwnContactFor({ teamName: 'U16B', dateOfBirth: 'not a date', today: TODAY })).toBe(
      true,
    )
  })

  it('still fails CLOSED on a missing squad, birthday or not', () => {
    // ageBandFromTeamName returns null both for "Senior Men 1st XV" (adults) and
    // for undefined (we have no idea). A name we have is trusted; a name we do
    // not have is refused, so a team row that failed to load withholds.
    expect(allowsOwnContactFor({ teamName: undefined, dateOfBirth: AGE_15, today: TODAY })).toBe(
      false,
    )
    expect(allowsOwnContactFor({ teamName: '', dateOfBirth: AGE_15, today: TODAY })).toBe(false)
  })

  it('leaves the senior sides alone', () => {
    expect(allowsOwnContactFor({ teamName: 'Senior Men 1st XV', today: TODAY })).toBe(true)
  })

  // ⚠️ THE ONE PROPERTY THAT MUST HOLD FOR EVERY INPUT, not just the cases
  //    somebody thought to write down. If a future change adds a branch that
  //    opens the gate for some combination nobody enumerated, this catches it.
  it('⚠️ never returns true where the squad name alone returned false — any birthday, any squad', () => {
    const squads = ['U6 Tag', 'U8', 'U10', 'U12G QR', 'U13', 'U14B', 'U16G', 'U18 Colts', 'Senior Women', '', undefined]
    const births = [AGE_11, AGE_12, AGE_15, null, 'nonsense', '2026-01-01']

    for (const teamName of squads) {
      for (const dateOfBirth of births) {
        const bySquad = allowsOwnContact(teamName)
        const withDob = allowsOwnContactFor({ teamName, dateOfBirth, today: TODAY })
        if (!bySquad) {
          expect(withDob, `${teamName} / ${dateOfBirth} widened the gate`).toBe(false)
        }
      }
    }
  })
})

// ⚠️ EVERY RENDER IS RECORDED, NOT JUST THE LAST ONE, AND THAT IS THE POINT OF
// THIS PROBE. The hook's useState seed is what the browser PAINTS FIRST, before
// useEffect runs — but in jsdom the effect flushes inside `render`, so reading
// the DOM afterwards can only ever see the effect's value. Breaking the seed on
// purpose left every assertion green until this array existed.
const renders = []

function Probe({ playerId, teamName }) {
  const { allowed, settled } = useOwnContactGate(playerId, teamName)
  renders.push(allowed)
  return (
    <div data-testid="gate" data-allowed={String(allowed)} data-settled={String(settled)}>
      gate
    </div>
  )
}

describe('useOwnContactGate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    renders.length = 0
    getPlayerDobMock.mockResolvedValue(null)
  })

  it('⚠️ opens on the squad answer FROM THE VERY FIRST RENDER, so the fields do not blink', async () => {
    // Starting closed and opening on arrival would flicker the boxes out of
    // existence and back on every open, for every player old enough to have
    // them — which is how people come to believe a field is broken. Starting
    // open is safe because the only move available afterwards is to close.
    let resolve
    getPlayerDobMock.mockReturnValue(new Promise((r) => { resolve = r }))

    render(<Probe playerId="p-1" teamName="U16B" />)

    // ⚠️ THE FIRST RENDER, NOT THE DOM. In a real browser useEffect runs after
    // paint, so the useState seed is what a person actually sees for a frame;
    // in jsdom the effect has already flushed by the time the DOM is readable,
    // and asserting on the DOM alone leaves the seed untested. Proved by
    // breaking it: the DOM assertion below stayed green, this one did not.
    expect(renders[0]).toBe(true)
    expect(screen.getByTestId('gate')).toHaveAttribute('data-allowed', 'true')
    // ⚠️ AND IT SAYS SO: `settled` is false while the birthday is in flight,
    // which is what lets MyPlayerForm decline to FETCH the child's contact row
    // rather than merely decline to render it.
    expect(screen.getByTestId('gate')).toHaveAttribute('data-settled', 'false')

    resolve(null)
    await waitFor(() => {
      expect(screen.getByTestId('gate')).toHaveAttribute('data-settled', 'true')
    })
  })

  it('closes once a birthday says the child is too young', async () => {
    getPlayerDobMock.mockResolvedValue(AGE_11)
    render(<Probe playerId="p-1" teamName="U13" />)

    await waitFor(() => {
      expect(screen.getByTestId('gate')).toHaveAttribute('data-allowed', 'false')
    })
  })

  it('⚠️ does not read a birthday at all when the squad already says no', async () => {
    // Not an optimisation. An under-13's record should not be queried to
    // confirm a refusal the squad name has already made.
    render(<Probe playerId="p-1" teamName="U8" />)

    await waitFor(() => {
      expect(screen.getByTestId('gate')).toHaveAttribute('data-settled', 'true')
    })
    expect(getPlayerDobMock).not.toHaveBeenCalled()
    expect(screen.getByTestId('gate')).toHaveAttribute('data-allowed', 'false')
  })

  it('asks nothing for a player being created, and answers from the squad', async () => {
    render(<Probe playerId={null} teamName="U16B" />)

    await waitFor(() => {
      expect(screen.getByTestId('gate')).toHaveAttribute('data-settled', 'true')
    })
    expect(getPlayerDobMock).not.toHaveBeenCalled()
    expect(screen.getByTestId('gate')).toHaveAttribute('data-allowed', 'true')
  })

  it('⚠️ keeps the field when the read FAILS, rather than closing on a timeout', async () => {
    // getPlayerDob already returns null for "you may not see it", so a rejection
    // here is a network fault. Closing the gate on it would remove a field a
    // thirteen-year-old is entitled to because a request was slow.
    getPlayerDobMock.mockRejectedValue(new Error('network down'))
    render(<Probe playerId="p-1" teamName="U16B" />)

    await waitFor(() => {
      expect(screen.getByTestId('gate')).toHaveAttribute('data-settled', 'true')
    })
    expect(screen.getByTestId('gate')).toHaveAttribute('data-allowed', 'true')
  })

  it('⚠️ closes IMMEDIATELY when the squad is changed down, before any read returns', async () => {
    // PlayerForm keys this on the SELECTED squad, so somebody moving a child
    // from U16 to U8 in the dropdown must lose the fields at once — not after a
    // request that is still in flight for the previous squad.
    getPlayerDobMock.mockReturnValue(new Promise(() => {}))
    const { rerender } = render(<Probe playerId="p-1" teamName="U16B" />)
    expect(screen.getByTestId('gate')).toHaveAttribute('data-allowed', 'true')

    rerender(<Probe playerId="p-1" teamName="U8" />)
    expect(screen.getByTestId('gate')).toHaveAttribute('data-allowed', 'false')
  })
})
