import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Back from the account step keeps the children already typed — Task 5 of
// claude/plans/2026-09-02-ux-unsaved-work.md. Found by the 2 Sep 2026 UX
// review: the wizard held `players` in state but remounted the children form
// from a blank row, so three children typed in were gone on one tap.
//
// The form is replaced by a probe here, so this proves the WIRING without
// driving date pickers and play-up consent. That the real form seeds from
// `initialRows` is proved in tests/player-registration-initial-rows.test.jsx.
//
// ⚠️ EVERY NAME IN THIS FILE IS INVENTED (CLAUDE.md rule 9).

vi.mock('../src/data/signupSquads.js', () => ({
  listSignupSquads: vi.fn(async () => [
    { id: 't-u10', name: 'U10 Mixed', sort_order: 1, self_registration_allowed: false, is_senior: false },
  ]),
}))

const seenInitialRows = vi.fn()
vi.mock('../src/components/PlayerRegistrationForm.jsx', () => ({
  default: ({ initialRows, onCollect }) => {
    seenInitialRows(initialRows ?? null)
    return (
      <button type="button" onClick={() => onCollect([{ key: 'row-1', firstName: 'Teodora' }])}>
        Continue
      </button>
    )
  },
}))

import SignupWizard from '../src/components/SignupWizard.jsx'

describe('SignupWizard — Back from the account step', () => {
  beforeEach(() => seenInitialRows.mockClear())

  it('hands the collected children back to the form', async () => {
    const user = userEvent.setup()
    render(<SignupWizard busy={false} error={null} onError={vi.fn()} onSubmitAccount={vi.fn()} />)

    await user.type(screen.getByLabelText(/your first name/i), 'Sam')
    await user.type(screen.getByLabelText(/your family name/i), 'Okonkwo-Reyes')
    await user.click(screen.getByRole('checkbox', { name: /i have a child playing here/i }))
    await user.click(await screen.findByRole('checkbox', { name: /u10 mixed/i }))
    await user.click(screen.getByRole('button', { name: /^continue$/i }))

    // Players step: first visit, nothing to seed yet.
    expect(seenInitialRows).toHaveBeenLastCalledWith([])
    await user.click(screen.getByRole('button', { name: /^continue$/i }))

    // Account step, then Back.
    await screen.findByLabelText(/email/i)
    await user.click(screen.getByRole('button', { name: /^back$/i }))

    expect(seenInitialRows).toHaveBeenLastCalledWith([{ key: 'row-1', firstName: 'Teodora' }])
  })
})
