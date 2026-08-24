import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// The "New group" flow (claude/plans/2026-08-24-group-chats.md). The data
// functions are injected as props — the same pattern NewChatPicker uses for
// its `load` — so nothing here touches Supabase. The database's own floor
// (a group is three people or more) is db/tests/group-chats.sql's job; this
// file covers the UI half: Create stays disabled until a name and two
// people are picked.
import NewGroupPicker from '../src/components/NewGroupPicker.jsx'

// ⚠️ NAMES INVENTED — CLAUDE.md rule 9.
const CANDIDATES = [
  { profile_id: 'p1', full_name: 'Mira Vantel', role: 'parent', via_team: 'U10 Reds' },
  { profile_id: 'p2', full_name: 'Tomas Orrin', role: 'parent', via_team: 'U10 Reds' },
  { profile_id: 'p3', full_name: 'Dara Kellen', role: 'coach', via_team: 'U10 Reds' },
]

function setup(props = {}) {
  const create = vi.fn().mockResolvedValue('conv-1')
  const onCreated = vi.fn()
  render(
    <NewGroupPicker
      loadCandidates={() => Promise.resolve(CANDIDATES)}
      create={create}
      onCreated={onCreated}
      onClose={() => {}}
      {...props}
    />,
  )
  return { create, onCreated, user: userEvent.setup() }
}

describe('NewGroupPicker', () => {
  it('keeps Create disabled until a name and two people are picked', async () => {
    const { user } = setup()
    const button = await screen.findByRole('button', { name: /create group/i })
    expect(button).toBeDisabled()
    await user.type(screen.getByPlaceholderText('Group name'), 'Zz Test Group')
    await user.click(await screen.findByText('Mira Vantel'))
    expect(button).toBeDisabled() // one other person is a DM, not a group
    await user.click(screen.getByText('Tomas Orrin'))
    expect(button).toBeEnabled()
  })

  it('creates and reports the conversation id', async () => {
    const { create, onCreated, user } = setup()
    await screen.findByText('Mira Vantel')
    await user.type(screen.getByPlaceholderText('Group name'), 'Zz Test Group')
    await user.click(screen.getByText('Mira Vantel'))
    await user.click(screen.getByText('Tomas Orrin'))
    await user.click(screen.getByRole('button', { name: /create group/i }))
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith('conv-1'))
    expect(create).toHaveBeenCalledWith('Zz Test Group', ['p1', 'p2'])
  })
})
