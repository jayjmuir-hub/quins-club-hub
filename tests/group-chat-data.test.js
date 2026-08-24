// Group chats (claude/plans/2026-08-24-group-chats.md): a group row in the
// Chats list opens the same conversation thread a DM does.
import { describe, expect, it } from 'vitest'
import { chatPath } from '../src/data/messages.js'

describe('chatPath', () => {
  it('routes a group row to the conversation thread', () => {
    expect(chatPath({ kind: 'group', conversation_id: 'abc' })).toBe('/chat/dm/abc')
  })
  it('still routes a squad row to its channel', () => {
    expect(chatPath({ kind: 'squad', team_id: 't1' })).toBe('/chat/t1')
  })
})
