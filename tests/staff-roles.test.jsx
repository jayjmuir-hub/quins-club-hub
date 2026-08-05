import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Team Manager ('manager') and Medic ('medic'), added 5 Aug 2026. Both are
// IDENTICAL to 'coach' in what they may do — the distinction is documentary.
//
// The pure half (canEditTeam, labels, precedence, the exact role set) lives in
// tests/scope.test.js. THIS file covers the places a new role could be
// silently forgotten: the grant UI, the accounts UI, and — the one that
// actually matters for the NEXT role — a guard that no screen tests for the
// literal string 'coach' behind scope.js's back.

const useMembershipsMock = vi.fn()
const useAuthMock = vi.fn()
const createInviteMock = vi.fn()
const listPlayersMock = vi.fn()

vi.mock('../src/lib/memberships.jsx', () => ({
  useMemberships: () => useMembershipsMock(),
}))

vi.mock('../src/lib/auth.jsx', () => ({
  useAuth: () => useAuthMock(),
}))

vi.mock('../src/data/members.js', () => ({
  createInvite: (...args) => createInviteMock(...args),
}))

vi.mock('../src/data/players.js', () => ({
  listPlayers: (...args) => listPlayersMock(...args),
}))

import InviteForm from '../src/screens/InviteForm.jsx'
import { SQUAD_STAFF_ROLES } from '../src/lib/scope.js'

const CLUB_ID = '00000000-0000-0000-0000-0000000000ad'
const TEAM_U12 = { id: 't-u12', club_id: CLUB_ID, name: 'U12', sort_order: 7 }
const TEAM_U14 = { id: 't-u14', club_id: CLUB_ID, name: 'U14', sort_order: 9 }
const TEAMS = [TEAM_U14, TEAM_U12]
const ADMIN = [{ id: 'm-a', role: 'admin', team_id: null, club_id: CLUB_ID }]

const ROLE = 'Role for the new member'

function renderInvite() {
  useAuthMock.mockReturnValue({ user: { id: 'user-1', email: 'admin@example.com' } })
  useMembershipsMock.mockReturnValue({
    memberships: ADMIN,
    teams: TEAMS,
    loading: false,
    error: null,
    reload: vi.fn(),
  })
  render(<InviteForm onClose={vi.fn()} onSaved={vi.fn()} />)
  return { user: userEvent.setup() }
}

async function pickAgeGroup(user, name) {
  const group = await screen.findByTestId('age-group-picker')
  await user.click(within(group).getByLabelText(name))
}

beforeEach(() => {
  vi.clearAllMocks()
  listPlayersMock.mockResolvedValue([])
  createInviteMock.mockImplementation(async (fields) => ({ id: 'inv-1', token: 'tok-1', ...fields }))
})

describe('The role pickers offer Team Manager and Medic', () => {
  it('offers both new roles alongside coach', () => {
    renderInvite()

    const options = [...screen.getByLabelText(ROLE).querySelectorAll('option')].map((o) => [
      o.value,
      o.textContent,
    ])

    expect(options).toEqual(
      expect.arrayContaining([
        ['coach', 'Coach'],
        ['manager', 'Team Manager'],
        ['medic', 'Medic'],
      ]),
    )
  })

  // The behaviour that makes them usable at all: like a coach and unlike a
  // parent, they are granted BY AGE GROUP, so the picker has to appear.
  it.each(SQUAD_STAFF_ROLES)('asks for age groups when the role is %s', async (role) => {
    const { user } = renderInvite()

    await user.selectOptions(screen.getByLabelText(ROLE), role)

    expect(await screen.findByTestId('age-group-picker')).toBeInTheDocument()
  })

  it('refuses a Team Manager with no age group chosen, before any network call', async () => {
    const { user } = renderInvite()

    await user.selectOptions(screen.getByLabelText(ROLE), 'manager')
    await user.click(screen.getByRole('button', { name: /send invite/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/at least one age group/i)
    expect(createInviteMock).not.toHaveBeenCalled()
  })
})

describe('Granting the new roles', () => {
  it('gives a Team Manager of two age groups one invite with two targets', async () => {
    const { user } = renderInvite()

    await user.type(screen.getByLabelText(/email/i), 'manager@example.com')
    await user.selectOptions(screen.getByLabelText(ROLE), 'manager')
    await pickAgeGroup(user, 'U12')
    await pickAgeGroup(user, 'U14')
    await user.click(screen.getByRole('button', { name: /send invite/i }))

    await waitFor(() => expect(createInviteMock).toHaveBeenCalled())
    // Same shape tests/invite-form.test.jsx asserts for a coach — camelCase
    // at this layer; createInvite maps to team_id/player_id on the way out.
    expect(createInviteMock.mock.calls[0][0]).toMatchObject({
      role: 'manager',
      teamId: null,
      // No linked player: squad staff are attached to a squad, never a child.
      targets: [
        { teamId: 't-u12', playerId: null },
        { teamId: 't-u14', playerId: null },
      ],
    })
  })

  it('sends a Medic the same way', async () => {
    const { user } = renderInvite()

    await user.type(screen.getByLabelText(/email/i), 'medic@example.com')
    await user.selectOptions(screen.getByLabelText(ROLE), 'medic')
    await pickAgeGroup(user, 'U12')
    await user.click(screen.getByRole('button', { name: /send invite/i }))

    await waitFor(() => expect(createInviteMock).toHaveBeenCalled())
    expect(createInviteMock.mock.calls[0][0].role).toBe('medic')
  })
})

// ---------------------------------------------------------------------------
// The guard that matters for the NEXT role.
//
// Adding 'manager' and 'medic' meant editing Roster.jsx and Schedule.jsx,
// which each carried their own `membership.role === 'coach'` test. Both now
// ask isSquadStaffRole() instead. This test exists so a future role is a
// one-line change to SQUAD_STAFF_ROLES rather than another hunt across the
// tree — it fails the moment somebody writes a raw 'coach' comparison in a
// screen or component again.
// ---------------------------------------------------------------------------

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src')

function sourceFiles(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) return sourceFiles(full)
    return /\.jsx?$/.test(entry) ? [full] : []
  })
}

// Strips // line comments and /* block */ comments so a comment MENTIONING
// 'coach' (there are several, explaining this very rule) is not a violation.
function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

describe('no screen tests for the literal role "coach"', () => {
  it('routes every squad-staff check through scope.js', () => {
    const offenders = []

    for (const file of sourceFiles(SRC)) {
      const rel = path.relative(SRC, file).replace(/\\/g, '/')
      // scope.js DEFINES the set; the two role-picker lists are option
      // labels, not permission checks; ViewAsSwitcher builds a synthetic
      // preview persona rather than reading anyone's access.
      if (['lib/scope.js', 'screens/Accounts.jsx', 'components/AccessBuilder.jsx', 'components/ViewAsSwitcher.jsx'].includes(rel)) continue

      const code = stripComments(readFileSync(file, 'utf8'))
      // A comparison against the string, in any of the shapes that would
      // reintroduce the bug: === 'coach', includes('coach'), role: 'coach'
      // used as a test rather than as an option value.
      if (/(===|!==|==)\s*['"]coach['"]/.test(code) || /['"]coach['"]\s*(===|!==|==)/.test(code)) {
        offenders.push(rel)
      }
    }

    expect(offenders).toEqual([])
  })
})
