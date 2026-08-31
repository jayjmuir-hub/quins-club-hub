import { describe, it, expect, vi, beforeEach } from 'vitest'

// The ALBUM half of the data layer — plan 2 of the chat-albums series
// (claude/plans/2026-09-01-chat-albums-plan-2-composer.md), task 4.
//
// ⚠️ THE ONE COLUMN A CLIENT MAY WRITE IS `attachments`. The database's
// private.sync_attachment_paths() trigger derives `attachment_paths` (which
// the storage READ POLICY reads) and `attachment_path` (which cached service
// workers still write) from it. Writing any of the three directly alongside
// it invites them to disagree, and a disagreement in attachment_paths is an
// invisible permission bug, not a cosmetic one.
//
// The supabase client is mocked: this proves the SHAPE of each insert. Who
// may do it is the database's (db/tests/chat-album-media.sql).

vi.mock('../src/lib/supabase.js', () => ({
  supabase: { from: vi.fn(), rpc: vi.fn(), channel: vi.fn(), removeChannel: vi.fn(), storage: { from: vi.fn() } },
}))

import { supabase } from '../src/lib/supabase.js'
import {
  forwardMessagesTo,
  postMessage,
  postRoleMessage,
  postStaffMessage,
  sendDirectMessage,
} from '../src/data/messages.js'

function builder(result) {
  const calls = {}
  const b = {}
  for (const name of ['select', 'is', 'eq', 'in', 'order', 'limit', 'insert', 'update', 'delete', 'single', 'maybeSingle']) {
    b[name] = vi.fn((...args) => {
      ;(calls[name] ??= []).push(args)
      return b
    })
  }
  b.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject)
  return { b, calls }
}

function stub() {
  const built = builder({ data: { id: 'm1' }, error: null })
  supabase.from.mockReturnValue(built.b)
  return built
}

const album = [
  { file: 'p1/a.jpg', type: 'image/jpeg', size: 1024, name: 'Tour photo.jpg' },
  { file: 'p1/b.jpg', type: 'image/jpeg', size: 2048, name: 'Team.jpg' },
]

beforeEach(() => {
  supabase.from.mockReset()
})

describe('an album rides the insert as `attachments`', () => {
  it('sends every photo in ONE message, and never writes the derived columns', async () => {
    const ins = stub()
    await sendDirectMessage('c1', 'from the tour', { attachments: album })
    const row = ins.calls.insert[0][0]
    expect(row.attachments).toEqual(album)
    // ⚠️ The trigger owns these two. If a client ever writes one of them
    // beside `attachments`, the storage read policy and the rendered
    // message can disagree about which photos this message carries.
    expect(row).not.toHaveProperty('attachment_path')
    expect(row).not.toHaveProperty('attachment_paths')
  })

  it('keeps the metadata the storage key CANNOT carry', async () => {
    const ins = stub()
    await sendDirectMessage('c1', '', { attachments: album })
    // The key is <uuid>.jpg and preparePhotoUpload re-encodes to JPEG, so
    // the original filename exists nowhere else. This is the entire reason
    // for the 1 Sep metadata reshape.
    expect(ins.calls.insert[0][0].attachments[0].name).toBe('Tour photo.jpg')
  })

  it('⚠️ stays ABSENT when the album is empty — an empty array must not decorate every plain message', async () => {
    const ins = stub()
    await sendDirectMessage('c1', 'just words', { attachments: [] })
    expect(ins.calls.insert[0][0]).toEqual({ conversation_id: 'c1', body: 'just words' })
  })

  it('lets a wordless album through the "write something first" gate', async () => {
    stub()
    await expect(sendDirectMessage('c1', '   ', { attachments: album })).resolves.toBeTruthy()
    // The control: no words AND no photos is still refused.
    stub()
    await expect(sendDirectMessage('c1', '   ')).rejects.toThrow(/write something/i)
  })

  it('reaches the three channel doors too, not just DMs', async () => {
    for (const send of [
      (opts) => postMessage('t1', 'squad album', opts),
      (opts) => postStaffMessage('t1', 'staff album', opts),
      (opts) => postRoleMessage('coaches', 'role album', opts),
    ]) {
      const ins = stub()
      await send({ attachments: album })
      expect(ins.calls.insert[0][0].attachments).toEqual(album)
      expect(ins.calls.insert[0][0]).not.toHaveProperty('attachment_path')
    }
  })
})

describe('forwarding carries the WHOLE album', () => {
  it('⚠️ forwards all ten photos, not just the first', async () => {
    const ins = stub()
    await forwardMessagesTo(
      { kind: 'dm', conversation_id: 'c2' },
      [{ body: 'look', attachments: album, attachment_path: 'p1/a.jpg', created_at: '2026-09-01T10:00:00Z' }],
    )
    // attachment_path is the FIRST key only. Forwarding by it would have
    // silently dropped every photo after the first the moment albums could
    // be sent at all.
    expect(ins.calls.insert[0][0].attachments).toEqual(album)
  })

  it('still forwards an old single-photo message that has no album', async () => {
    const ins = stub()
    await forwardMessagesTo(
      { kind: 'dm', conversation_id: 'c2' },
      [{ body: 'old', attachment_path: 'p1/old.jpg', created_at: '2026-09-01T10:00:00Z' }],
    )
    expect(ins.calls.insert[0][0].attachment_path).toBe('p1/old.jpg')
  })
})
