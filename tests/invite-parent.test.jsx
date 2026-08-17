import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useState } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// The Invite button on a parent/carer row — src/components/InviteParentButton.jsx,
// src/data/parents.js's inviteParent, and the ParentsEditor wiring that puts one
// beside every address.
//
// ⚠️ ONLY THE SUPABASE CLIENT IS MOCKED, DELIBERATELY. The obvious shape for
// this file was to mock src/data/parents.js and assert the component called it.
// That would have proved nothing about the property this feature actually turns
// on: THAT AN EMAIL ADDRESS IS NEVER SENT TO THE SERVER. public.invite_parent
// takes a row id and reads the address off the row, because an address as a
// parameter turns "invite this row" into "invite anyone, attached to this row's
// child". Mocking one layer lower means the test can look at the exact RPC
// arguments and say so.
//
// Names here are invented, per the rule in CLAUDE.md.

vi.mock('../src/lib/supabase.js', () => ({
  supabase: { rpc: vi.fn(), from: vi.fn() },
}))

import { supabase } from '../src/lib/supabase.js'
import ParentsEditor from '../src/components/ParentsEditor.jsx'
import { toEditorRows } from '../src/lib/parentRows.js'

const MOTHER = {
  id: 'pp-1',
  player_id: 'p-1',
  full_name: 'Nadia Farrow',
  first_name: 'Nadia',
  last_name: 'Farrow',
  relationship: 'Mother',
  email: 'nadia@example.com',
  phone: '+971501234567',
  is_primary: true,
  invited_at: null,
}

/** What public.invite_parent returns: the invites row itself. */
function inviteRow(overrides = {}) {
  return {
    id: 'inv-1',
    token: 'tok-abc',
    email: 'nadia@example.com',
    role: 'parent',
    team_id: 't-u12',
    player_id: 'p-1',
    grant_status: 'pending',
    ...overrides,
  }
}

/**
 * A stateful wrapper, because ParentsEditor is controlled and half of what is
 * being tested here is what happens WHILE somebody is typing. Rendering the
 * editor with a fixed prop would let a test assert the "you edited the address"
 * rule without ever proving the editor feeds it.
 */
function Harness({ rows }) {
  const [parents, setParents] = useState(() => toEditorRows(rows))
  return <ParentsEditor parents={parents} onChange={setParents} />
}

function renderEditor(rows = [MOTHER]) {
  return render(<Harness rows={rows} />)
}

beforeEach(() => {
  vi.clearAllMocks()
  supabase.rpc.mockResolvedValue({ data: inviteRow(), error: null })
})

describe('when the button appears at all', () => {
  it('offers no invite for a contact with no email on file', () => {
    renderEditor([{ ...MOTHER, email: null }])
    expect(screen.queryByRole('button', { name: /invite/i })).toBeNull()
    // And no explanation either: the empty Email box above IS the prompt, and a
    // note beside it would be telling somebody off for not filling in a field
    // they can see is empty.
    expect(screen.queryByText(/save this player first/i)).toBeNull()
  })

  it('asks for a save first on a row that has never been saved', async () => {
    const user = userEvent.setup()
    renderEditor([])
    await user.click(screen.getByRole('button', { name: /add parent/i }))
    await user.type(screen.getByLabelText('Email'), 'newmum@example.com')

    expect(screen.getByText(/save this player first/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /invite/i })).toBeNull()
  })

  // ⚠️ THE TRAP THIS WHOLE COMPONENT EXISTS TO CLOSE. The RPC reads the address
  // off the DATABASE ROW. Pressing Invite after correcting the address but
  // before saving would send an account to the OLD address while the screen
  // showed the new one — and nothing would look wrong.
  it('withdraws the button while the typed address differs from the saved one', async () => {
    const user = userEvent.setup()
    renderEditor()

    expect(screen.getByRole('button', { name: /Invite Nadia Farrow/ })).toBeInTheDocument()

    await user.type(screen.getByLabelText('Email'), 'x')

    expect(screen.queryByRole('button', { name: /Invite Nadia Farrow/ })).toBeNull()
    expect(screen.getByText(/save this player first/i)).toBeInTheDocument()
    expect(supabase.rpc).not.toHaveBeenCalled()
  })

  it('ignores a difference that is only case or whitespace', async () => {
    const user = userEvent.setup()
    renderEditor()
    const box = screen.getByLabelText('Email')
    await user.clear(box)
    await user.type(box, ' NADIA@example.com ')

    expect(screen.getByRole('button', { name: /Invite Nadia Farrow/ })).toBeInTheDocument()
  })
})

describe('sending one', () => {
  it('asks the server for the ROW, and never sends the address', async () => {
    const user = userEvent.setup()
    renderEditor()

    await user.click(screen.getByRole('button', { name: /Invite Nadia Farrow/ }))

    await waitFor(() => expect(supabase.rpc).toHaveBeenCalledTimes(1))
    const [fn, args] = supabase.rpc.mock.calls[0]
    expect(fn).toBe('invite_parent')
    expect(args).toEqual({ p_parent_row: 'pp-1' })
    // Stated separately from the toEqual above so that adding a parameter in
    // future fails on the REASON rather than on the shape.
    expect(JSON.stringify(args)).not.toContain('nadia@example.com')
  })

  // ⚠️ THE LINK IS SHOWN *AS WELL AS* THE EMAIL, AND THAT IS NOT LEFTOVER COPY
  // FROM BEFORE THE MAIL EXISTED (17 Aug 2026). The invite email is queued by a
  // trigger through pg_net, which does not wait for a result — so a failed send
  // is SILENT by design, and the person who pressed the button is the only one
  // who can notice and act. Take the link away and a bounced invite becomes
  // unrecoverable without an admin.
  it('shows the accept link as well as saying the email went', async () => {
    const user = userEvent.setup()
    renderEditor()
    await user.click(screen.getByRole('button', { name: /Invite Nadia Farrow/ }))

    const link = await screen.findByLabelText(/invite link for Nadia Farrow/i)
    expect(link).toHaveValue(`${window.location.origin}/accept-invite/tok-abc`)
    expect(screen.getByText(/we've emailed an invite/i)).toBeInTheDocument()
    // ⚠️ "emailed", NEVER "sent": nothing here has proof of delivery, and
    // promising one is how somebody stops chasing an invite that never arrived.
    expect(screen.queryByText(/invitation sent/i)).toBeNull()
  })

  // ⚠️ THE TWO SENTENCES BELOW ARE THE FEATURE'S SAFEGUARDING RULE MADE VISIBLE:
  // an invite is worth only what the person sending it could already approve. A
  // parent's and a medic's land pending; a coach's, manager's or admin's does
  // not. The component reads it off the returned row rather than deciding for
  // itself — the client has no way to evaluate can_approve_team, and a second
  // rule up here would be free to disagree with the one in the database.
  it('says an invite it cannot grant will go to the approval queue', async () => {
    const user = userEvent.setup()
    renderEditor()
    await user.click(screen.getByRole('button', { name: /Invite Nadia Farrow/ }))

    expect(await screen.findByText(/added to the approval queue/i)).toBeInTheDocument()
  })

  it('says an invite it can grant needs nothing further', async () => {
    supabase.rpc.mockResolvedValue({ data: inviteRow({ grant_status: 'active' }), error: null })
    const user = userEvent.setup()
    renderEditor()
    await user.click(screen.getByRole('button', { name: /Invite Nadia Farrow/ }))

    expect(await screen.findByText(/as soon as they accept/i)).toBeInTheDocument()
    expect(screen.queryByText(/approval queue/i)).toBeNull()
  })
})

// ⚠️ THE THIRD STATE, WHICH ARRIVED LAST. Invite → Invited → JOINED. Until
// player_parents.profile_id existed the button could not tell an adult who had
// accepted from one who had never opened the email — a client may not read
// `profiles` for anybody but itself.
describe('somebody who already joined', () => {
  const JOINED = { ...MOTHER, profile_id: 'user-9' }

  it('says so instead of offering an invite', () => {
    renderEditor([JOINED])

    expect(screen.getByText(/joined/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Invite Nadia Farrow/ })).toBeNull()
  })

  // ⚠️ CHECKED BEFORE THE ADDRESS, so a joined adult is never offered a button
  // whose only outcome is a refusal — invite_parent answers 42710 for an
  // address that already has an account.
  it('says so even for a row still being edited', async () => {
    const user = userEvent.setup()
    renderEditor([JOINED])

    await user.type(screen.getByLabelText('Email'), 'x')

    expect(screen.getByText(/joined/i)).toBeInTheDocument()
    expect(screen.queryByText(/save this player first/i)).toBeNull()
  })
})

describe('the middle state', () => {
  // Without it, two coaches invite the same person on the same evening and
  // neither ever finds out.
  it('shows when somebody was last invited, and offers the link again', () => {
    renderEditor([{ ...MOTHER, invited_at: '2026-08-16T09:00:00Z' }])

    expect(screen.getByText(/Invited 16 Aug 2026/)).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /Send Nadia Farrow's invite link again/ }),
    ).toBeInTheDocument()
  })

  it('says "invited", never "sent" — nothing here proves delivery', () => {
    renderEditor([{ ...MOTHER, invited_at: '2026-08-16T09:00:00Z' }])
    expect(screen.queryByText(/^Sent /)).toBeNull()
  })
})

describe('refusals', () => {
  it("shows the server's own sentence for a refusal it wrote", async () => {
    supabase.rpc.mockResolvedValue({
      data: null,
      error: {
        code: '42710',
        message: 'That person already has an account. Ask an admin to connect them instead.',
      },
    })
    const user = userEvent.setup()
    renderEditor()
    await user.click(screen.getByRole('button', { name: /Invite Nadia Farrow/ }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/already has an account/i)
  })

  // ⚠️ AND NOT FOR ANYTHING ELSE. A dropped connection, an expired session or a
  // PostgREST schema-cache miss all arrive as an error with a message, and none
  // of those sentences were written for a coach standing on a pitch.
  it('does not read out an error the function did not write', async () => {
    supabase.rpc.mockResolvedValue({
      data: null,
      error: { code: 'PGRST202', message: 'Could not find the function in the schema cache' },
    })
    const user = userEvent.setup()
    renderEditor()
    await user.click(screen.getByRole('button', { name: /Invite Nadia Farrow/ }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/couldn't send that invite/i)
    expect(alert).not.toHaveTextContent(/schema cache/i)
  })

  it('leaves the button pressable again after a refusal', async () => {
    supabase.rpc.mockResolvedValue({
      data: null,
      error: { code: '42501', message: 'You cannot invite that person.' },
    })
    const user = userEvent.setup()
    renderEditor()
    await user.click(screen.getByRole('button', { name: /Invite Nadia Farrow/ }))
    await screen.findByRole('alert')

    expect(screen.getByRole('button', { name: /Invite Nadia Farrow/ })).toBeEnabled()
  })
})
