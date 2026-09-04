import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

// 4 Sep 2026, Jay, from a screenshot of the Age Group Managers channel:
// "i don't like how the Team Manager tag goes to a second line and these
// tags should include their age group". Two rules, both here:
//   1. the pill never breaks mid-word — it moves to the next line whole;
//   2. in a CLUB-WIDE channel (team_id null) the pill names the squad behind
//      the role, from messages.author_team (db/migrations/20260908_message_author_team.sql);
//      in a squad's own chat it does not, because the header already says U11.

vi.mock('../src/data/identity.js', () => ({ getMemberIdentity: async () => [] }))
vi.mock('../src/data/profileIcons.js', () => ({
  listClubIconMap: async () => new Map(),
  listMemberIcons: async () => [],
}))
vi.mock('../src/data/personCard.js', () => ({ getPersonCard: async () => null }))
vi.mock('../src/data/chatMedia.js', () => ({
  signChatPhotoUrl: async () => 'blob:signed',
  isAudioAttachment: () => false,
  isFileAttachment: () => false,
  messageAttachmentLabel: () => '📷 Photo',
  chatFileAccept: () => 'application/pdf',
  attachmentPreviewLabel: () => '📷 Photo',
  uploadChatPhoto: vi.fn(),
  uploadChatFile: vi.fn(),
  removeChatPhoto: vi.fn(),
}))

import MessageRow from '../src/components/MessageRow.jsx'

const base = {
  id: 'm-1',
  author_id: 'zz-manager',
  author_role: 'manager',
  author_title: 'Team Manager',
  author_team_id: 'team-u11',
  author_team: { name: 'U11 Mixed' },
  author: { full_name: 'Zz Manager Probe' },
  body: 'Yes fixed. Thank you!',
  parent_id: null,
  team_id: null,
  channel: 'managers',
  created_at: '2026-09-02T18:52:00Z',
  deleted_at: null,
  pinned: false,
  forwarded: false,
  attachment_path: null,
}

function renderRow(message) {
  return render(
    <MemoryRouter>
      <MessageRow message={message} selfId="me-1" />
    </MemoryRouter>,
  )
}

describe('RolePill — the squad, and no mid-word wrap', () => {
  it('in a club-wide channel the pill says the squad and the role', () => {
    renderRow(base)
    expect(screen.getByTestId('role-pill')).toHaveTextContent('U11 Mixed · Team Manager')
  })

  it("CONTROL: in the squad's own chat the pill is just the role", () => {
    renderRow({ ...base, team_id: 'team-u11', channel: 'squad' })
    expect(screen.getByTestId('role-pill')).toHaveTextContent('Team Manager')
    expect(screen.getByTestId('role-pill')).not.toHaveTextContent('U11')
  })

  it('CONTROL: a club-wide role with no squad behind it is just the role', () => {
    renderRow({ ...base, author_role: 'admin', author_title: 'Club Secretary', author_team_id: null, author_team: null })
    expect(screen.getByTestId('role-pill')).toHaveTextContent('Club Secretary')
    expect(screen.getByTestId('role-pill')).not.toHaveTextContent('·')
  })

  it('the pill cannot break across lines mid-word', () => {
    renderRow(base)
    const classes = screen.getByTestId('role-pill').className.split(/\s+/)
    expect(classes).toContain('whitespace-nowrap')
    expect(classes).toContain('inline-block')
  })

  it('CONTROL: a parent wears no pill at all', () => {
    renderRow({ ...base, author_role: 'parent', author_title: null })
    expect(screen.queryByTestId('role-pill')).toBeNull()
  })
})
