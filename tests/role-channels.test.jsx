import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Role channels (claude/plans/2026-08-30-role-channels.md) — the CLIENT half.
// Who is IN a channel is the database's rule (db/tests/role-channels.sql
// proves the policies); this proves the client speaks the same vocabulary:
// the five keys route and label correctly, the admin ticks exist for supers
// to grant, and the member sheet renders the reasons and opens a DM on tap.

import { ROLE_CHANNELS, ROLE_CHANNEL_KEYS, isRoleChannel, roleChannelLabel } from '../src/lib/roleChannels.js'
import { chatPath } from '../src/data/messages.js'
import { ADMIN_RIGHTS, adminRightLabel } from '../src/lib/scope.js'

describe('the role-channel vocabulary', () => {
  it('names exactly the five channels the migration created', () => {
    expect(ROLE_CHANNEL_KEYS.sort()).toEqual(
      ['clubstaff', 'headcoaches', 'managers', 'medics', 'welfare'].sort(),
    )
  })

  it('cannot mistake a team id or the club sentinel for a role channel', () => {
    expect(isRoleChannel('headcoaches')).toBe(true)
    expect(isRoleChannel('club')).toBe(false)
    expect(isRoleChannel('4cf9f7a2-0000-4000-8000-000000000000')).toBe(false)
    expect(isRoleChannel(null)).toBe(false)
  })

  it('labels read as the channels Jay named', () => {
    expect(roleChannelLabel('headcoaches')).toBe('Club Head Coaches')
    expect(roleChannelLabel('managers')).toBe('Club Managers')
    expect(roleChannelLabel('medics')).toBe('Club Medics')
    expect(roleChannelLabel('welfare')).toBe('Welfare')
    expect(roleChannelLabel('clubstaff')).toBe('Club Staff')
  })
})

describe('chatPath routes a role row like the club sentinel', () => {
  it.each(Object.keys(ROLE_CHANNELS))('%s → /chat/%s', (key) => {
    expect(chatPath({ kind: key, team_id: null, conversation_id: null })).toBe(`/chat/${key}`)
  })

  it('leaves the existing kinds alone', () => {
    expect(chatPath({ kind: 'club' })).toBe('/chat/club')
    expect(chatPath({ kind: 'staff', team_id: 't1' })).toBe('/chat/t1?channel=staff')
    expect(chatPath({ kind: 'dm', conversation_id: 'c1' })).toBe('/chat/dm/c1')
  })
})

describe('the chat-access admin rights', () => {
  it('exist for exactly the three tick-gated channels — welfare needs no new right', () => {
    const chatRights = ADMIN_RIGHTS.filter((r) => r.startsWith('chat-'))
    expect(chatRights.sort()).toEqual(['chat-headcoaches', 'chat-managers', 'chat-medics'])
    // Welfare's channel rides the EXISTING grant; a chat-welfare right would
    // create a second door into the tightest circle in the system.
    expect(ADMIN_RIGHTS).not.toContain('chat-welfare')
  })

  it('label as channel access, not jobs', () => {
    expect(adminRightLabel('chat-headcoaches')).toBe('Chat: Club Head Coaches')
    expect(adminRightLabel('chat-managers')).toBe('Chat: Club Managers')
    expect(adminRightLabel('chat-medics')).toBe('Chat: Club Medics')
  })
})

// ── The member sheet ─────────────────────────────────────────────────────────

const channelMembersMock = vi.fn()
vi.mock('../src/data/messages.js', async (orig) => ({
  ...(await orig()),
  channelMembers: (...a) => channelMembersMock(...a),
}))

const { default: ChannelMembersSheet } = await import('../src/components/ChannelMembersSheet.jsx')

describe('ChannelMembersSheet', () => {
  beforeEach(() => {
    channelMembersMock.mockReset()
  })

  it('lists members with the reason each is in the channel, and DMs on tap', async () => {
    channelMembersMock.mockResolvedValue([
      { profile_id: 'p-hc', full_name: 'Zz Probe Headcoach', reason: 'Head coach — U13 Mixed' },
      { profile_id: 'p-me', full_name: 'Zz Probe Self', reason: 'Admin — chat access' },
    ])
    const onOpenDm = vi.fn()
    const onClose = vi.fn()
    render(
      <ChannelMembersSheet open channel="headcoaches" selfId="p-me" onOpenDm={onOpenDm} onClose={onClose} />,
    )

    expect(await screen.findByText('Zz Probe Headcoach')).toBeInTheDocument()
    expect(screen.getByText('Head coach — U13 Mixed')).toBeInTheDocument()
    expect(screen.getByText(/Members · 2/)).toBeInTheDocument()
    // Me: labelled, and not a DM door to myself.
    expect(screen.getByText(/Zz Probe Self \(you\)/)).toBeInTheDocument()

    await userEvent.click(screen.getByText('Zz Probe Headcoach'))
    expect(onOpenDm).toHaveBeenCalledWith('p-hc')
    expect(onClose).toHaveBeenCalled()
  })

  it('shows the refusal as the database words it, not a crash', async () => {
    channelMembersMock.mockRejectedValue(new Error('not your channel'))
    render(<ChannelMembersSheet open channel="welfare" selfId="p-me" onOpenDm={vi.fn()} onClose={vi.fn()} />)
    expect(await screen.findByRole('alert')).toHaveTextContent(/not your channel/)
  })

  it('fetches nothing until opened', async () => {
    render(<ChannelMembersSheet open={false} channel="managers" selfId="p" onOpenDm={vi.fn()} onClose={vi.fn()} />)
    await waitFor(() => expect(channelMembersMock).not.toHaveBeenCalled())
  })
})
