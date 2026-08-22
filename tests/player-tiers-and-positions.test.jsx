import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// A/B/C grading and multiple positions — phase 2 of
// claude/plans/2026-08-14-tiers-and-game-time.md.
//
// ⚠️ EVERY NAME HERE IS INVENTED. CLAUDE.md rule 9.
//
// ⚠️ THE TWO TABLES HAVE DELIBERATELY DIFFERENT VISIBILITY AND MUST NOT BE
// TIDIED INTO ONE SHAPE. `player_grades` is coach-only on BOTH read and write —
// a parent cannot read their own child's grade. `player_positions` is
// squad-readable and coach-writable, like `players.position` itself. That is
// enforced by RLS, not here; these tests pin the SCREEN behaviour that sits on
// top of it.

const useMembershipsMock = vi.fn()
const upsertPlayerMock = vi.fn()
const upsertContactMock = vi.fn()
const savePlayerPositionsMock = vi.fn()
const setPlayerGradeMock = vi.fn()
const listPlayerPositionsMock = vi.fn()
const listPlayerGradesMock = vi.fn()

vi.mock('../src/lib/memberships.jsx', () => ({ useMemberships: () => useMembershipsMock() }))
vi.mock('../src/data/players.js', () => ({
  listPlayers: async () => [],
  getPlayerDob: vi.fn(() => Promise.resolve(null)),
  getPlayerContact: async () => null,
  upsertPlayer: (...a) => upsertPlayerMock(...a),
  deletePlayer: async () => {},
  upsertContact: (...a) => upsertContactMock(...a),
}))
vi.mock('../src/data/parents.js', () => ({ listParents: async () => [], saveParents: async () => [] }))
vi.mock('../src/data/photos.js', () => ({
  signPhotoUrl: async () => null,
  signPhotoUrls: async () => ({}),
  uploadPlayerPhoto: async () => 'p/1.jpg',
  deletePlayerPhoto: async () => true,
  forgetPhotoUrl: () => {},
}))
vi.mock('../src/data/playerTiers.js', () => ({
  TIERS: ['A', 'B', 'C'],
  listPlayerGrades: (...a) => listPlayerGradesMock(...a),
  listPlayerPositions: (...a) => listPlayerPositionsMock(...a),
  savePlayerPositions: (...a) => savePlayerPositionsMock(...a),
  setPlayerGrade: (...a) => setPlayerGradeMock(...a),
}))

import PlayerForm from '../src/screens/PlayerForm.jsx'

const CLUB_ID = '00000000-0000-0000-0000-0000000000ad'
const TEAM = { id: 't-u16', club_id: CLUB_ID, name: 'U16', sort_order: 11 }
const COACH = [{ id: 'm-c', role: 'coach', team_id: 't-u16' }]
// All three name columns, as a real row carries them — the split pair is what
// the form's two name boxes bind to, and a fixture with only full_name renders
// them empty, which the form then refuses to save.
const PLAYER = {
  id: 'p-1',
  club_id: CLUB_ID,
  team_id: 't-u16',
  full_name: 'Idris Vanterpool',
  first_name: 'Idris',
  last_name: 'Vanterpool',
}

function renderForm({ player = null } = {}) {
  useMembershipsMock.mockReturnValue({
    memberships: COACH,
    teams: [TEAM],
    loading: false,
    error: null,
    reload: vi.fn(),
  })
  render(<PlayerForm player={player} onClose={vi.fn()} onSaved={vi.fn()} />)
  return userEvent.setup()
}

beforeEach(() => {
  vi.clearAllMocks()
  upsertPlayerMock.mockImplementation(async (p) => ({ id: p?.id ?? 'p-new', ...p }))
  upsertContactMock.mockImplementation(async (c) => ({ ...c }))
  savePlayerPositionsMock.mockResolvedValue([])
  setPlayerGradeMock.mockResolvedValue(null)
  listPlayerPositionsMock.mockResolvedValue(new Map())
  listPlayerGradesMock.mockResolvedValue(new Map())
})

describe('multiple positions', () => {
  it('saves every ticked position, and makes the first one the PRIMARY', async () => {
    // ⚠️ players.position IS NOT REPLACED. Six things read it — the roster meta
    // line and its inline editor, YourPlayers, PlayerDetail, the importer, and
    // the forwards/backs fallback — so the form keeps it in step with the first
    // position rather than rewriting all six readers.
    const user = renderForm()
    await user.type(screen.getByLabelText('First name', { selector: '#player-first-name' }), 'Idris')
    await user.type(screen.getByLabelText('Family name', { selector: '#player-last-name' }), 'Vanterpool')
    // ⚠️ BY ROLE, NOT BY TEXT. Each position appears TWICE in this form — once
    // as a checkbox chip and once as an <option> in the single-select below it,
    // which is deliberate (the select still serves players with one position).
    // getByText finds both and throws.
    await user.click(screen.getByRole('checkbox', { name: 'Hooker' }))
    await user.click(screen.getByRole('checkbox', { name: 'Flanker' }))
    await user.click(screen.getByRole('button', { name: /add player/i }))

    await waitFor(() => expect(savePlayerPositionsMock).toHaveBeenCalled())
    // ⚠️ ORDERED BY THE POSITIONS LIST, NOT BY WHICH WAS TICKED FIRST. A
    // checkbox group has no memory of press order, so deriving the primary from
    // it would make it depend on invisible state.
    expect(savePlayerPositionsMock).toHaveBeenCalledWith('p-new', ['Hooker', 'Flanker'])
    expect(upsertPlayerMock.mock.calls[0][0].position).toBe('Hooker')
  })

  it('leaves the primary alone when nothing is ticked', async () => {
    const user = renderForm()
    await user.type(screen.getByLabelText('First name', { selector: '#player-first-name' }), 'Idris')
    await user.type(screen.getByLabelText('Family name', { selector: '#player-last-name' }), 'Vanterpool')
    await user.selectOptions(screen.getByLabelText('Position'), 'Wing')
    await user.click(screen.getByRole('button', { name: /add player/i }))

    await waitFor(() => expect(upsertPlayerMock).toHaveBeenCalled())
    // The single-select still works for the players who only ever have one.
    expect(upsertPlayerMock.mock.calls[0][0].position).toBe('Wing')
  })
})

describe('tier grading', () => {
  it('saves the chosen tier', async () => {
    const user = renderForm()
    await user.type(screen.getByLabelText('First name', { selector: '#player-first-name' }), 'Idris')
    await user.type(screen.getByLabelText('Family name', { selector: '#player-last-name' }), 'Vanterpool')
    await user.selectOptions(screen.getByLabelText('Tier'), 'B')
    await user.click(screen.getByRole('button', { name: /add player/i }))

    await waitFor(() => expect(setPlayerGradeMock).toHaveBeenCalledWith('p-new', 'B'))
  })

  it('passes null when ungraded, so the row is DELETED rather than stored empty', async () => {
    // ⚠️ `player_grades.tier` is NOT NULL on purpose: "ungraded" is the ABSENCE
    // of a grade, not a grade whose value is nothing. Two ways to say ungraded
    // would mean every reader had to check both.
    const user = renderForm()
    await user.type(screen.getByLabelText('First name', { selector: '#player-first-name' }), 'Idris')
    await user.type(screen.getByLabelText('Family name', { selector: '#player-last-name' }), 'Vanterpool')
    await user.click(screen.getByRole('button', { name: /add player/i }))

    await waitFor(() => expect(setPlayerGradeMock).toHaveBeenCalledWith('p-new', null))
  })

  it('says so plainly that parents cannot see it', async () => {
    // The control is coach-only by RLS, but a coach typing a judgement about a
    // child needs to know where it goes — and specifically that it never rides
    // along on the shared team sheet image.
    renderForm()
    expect(screen.getByText(/Only coaches and managers can see this/i)).toBeInTheDocument()
    expect(screen.getByText(/never appears on a shared team sheet/i)).toBeInTheDocument()
  })
})

describe('the write order', () => {
  it('⚠️ writes the CONTACT before positions and grade', async () => {
    // ⚠️ THE BUG THIS FILE EXISTS FOR. These two writes were briefly placed
    // straight after the player row, so a refused position write RETURNED EARLY
    // and the contact details were never saved — a phone number lost to a
    // secondary table. Ten existing tests failed and the fix was the ORDER, not
    // the mock. Every write in the sequence blocks the ones after it, so it has
    // to run most-important first.
    const order = []
    upsertContactMock.mockImplementation(async (c) => {
      order.push('contact')
      return { ...c }
    })
    savePlayerPositionsMock.mockImplementation(async () => {
      order.push('positions')
      return []
    })
    setPlayerGradeMock.mockImplementation(async () => {
      order.push('grade')
      return null
    })

    const user = renderForm({ player: PLAYER })
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /save changes/i })).not.toBeDisabled(),
    )
    await user.type(screen.getByLabelText('Player phone'), '501234567')
    await user.click(screen.getByRole('button', { name: /save changes/i }))

    await waitFor(() => expect(order).toContain('grade'))
    expect(order.indexOf('contact')).toBeLessThan(order.indexOf('positions'))
    expect(order.indexOf('positions')).toBeLessThan(order.indexOf('grade'))
  })

  it('reports a failed position write WITHOUT claiming the player was lost', async () => {
    // savePlayerPositions deletes before it inserts, so a refusal can leave a
    // player with none — the coach has to be told which of the two to check.
    savePlayerPositionsMock.mockRejectedValue(new Error('nope'))
    const user = renderForm()
    await user.type(screen.getByLabelText('First name', { selector: '#player-first-name' }), 'Idris')
    await user.type(screen.getByLabelText('Family name', { selector: '#player-last-name' }), 'Vanterpool')
    await user.click(screen.getByRole('button', { name: /add player/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /player was saved, but their positions were not/i,
    )
  })
})
