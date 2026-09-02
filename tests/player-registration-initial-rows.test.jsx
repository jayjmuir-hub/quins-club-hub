import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

// The children form seeds from `initialRows` — half of Task 5 of
// claude/plans/2026-09-02-ux-unsaved-work.md. The other half (the wizard
// passing what it collected back in) is tests/signup-wizard-back.test.jsx,
// which mocks this form; vi.mock is hoisted, so the real form has to be
// tested in its own file.
//
// ⚠️ EVERY NAME IN THIS FILE IS INVENTED (CLAUDE.md rule 9).

vi.mock('../src/lib/useMyProfile.js', () => ({
  default: () => ({ profile: null }),
  primeMyProfileCache: vi.fn(),
}))
vi.mock('../src/data/members.js', () => ({
  registerMyPlayer: vi.fn(),
  updateProfileNames: vi.fn(),
}))
vi.mock('../src/data/players.js', () => ({ setPlayerDob: vi.fn() }))

import PlayerRegistrationForm from '../src/components/PlayerRegistrationForm.jsx'

const TEAM = { id: 't-u10', name: 'U10 Mixed', sort_order: 1, self_registration_allowed: false }
const row = (key, firstName) => ({
  key,
  firstName,
  lastName: 'Okonkwo-Reyes',
  dob: '',
  teamId: 't-u10',
  gender: '',
  selfRegister: false,
  playUpConsent: false,
})

describe('PlayerRegistrationForm — initialRows', () => {
  it('starts from the rows it is given instead of one blank row', () => {
    render(
      <PlayerRegistrationForm
        teams={[TEAM]}
        collectOnly
        onCollect={vi.fn()}
        initialRows={[row('row-1', 'Teodora'), row('row-2', 'Bram')]}
      />,
    )
    expect(screen.getByLabelText(/player 1.s first name/i)).toHaveValue('Teodora')
    expect(screen.getByLabelText(/player 2.s first name/i)).toHaveValue('Bram')
  })

  it('still starts blank when given nothing, or an empty list', () => {
    const { unmount } = render(<PlayerRegistrationForm teams={[TEAM]} collectOnly onCollect={vi.fn()} />)
    expect(screen.getByLabelText(/player.s first name/i)).toHaveValue('')
    unmount()
    render(<PlayerRegistrationForm teams={[TEAM]} collectOnly onCollect={vi.fn()} initialRows={[]} />)
    expect(screen.getByLabelText(/player.s first name/i)).toHaveValue('')
  })
})
