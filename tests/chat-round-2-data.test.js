import { describe, it, expect, vi, beforeEach } from 'vitest'

// Round 2 data layer (claude/plans/2026-08-24-chat-round-2.md): quotes,
// forwarding and photo attachments through src/data/messages.js, and the
// chat-media upload path in src/data/chatMedia.js. The supabase client is
// mocked; this proves the SHAPE of each call. Who may do any of it is the
// database's (db/tests/chat-round-2.sql).

vi.mock('../src/lib/supabase.js', () => ({
  supabase: { from: vi.fn(), rpc: vi.fn(), channel: vi.fn(), removeChannel: vi.fn(), storage: { from: vi.fn() } },
}))
vi.mock('../src/lib/imageResize.js', () => ({
  resizePhoto: vi.fn(async (file) => file),
}))

import { supabase } from '../src/lib/supabase.js'
import { resizePhoto } from '../src/lib/imageResize.js'
import { forwardMessagesTo, postMessage, sendDirectMessage } from '../src/data/messages.js'
import { removeChatPhoto, uploadChatPhoto } from '../src/data/chatMedia.js'

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

beforeEach(() => {
  supabase.from.mockReset()
  supabase.storage.from.mockReset()
  resizePhoto.mockClear()
})

describe('sendDirectMessage — round 2 options', () => {
  it('sends a quote as quoted_id and nothing extra when the options are off', async () => {
    const ins = builder({ data: { id: 'd9' }, error: null })
    supabase.from.mockReturnValue(ins.b)
    await sendDirectMessage('c1', 'quoting you', { quotedId: 'd1' })
    expect(ins.calls.insert[0][0]).toEqual({ conversation_id: 'c1', body: 'quoting you', quoted_id: 'd1' })

    const plain = builder({ data: { id: 'da' }, error: null })
    supabase.from.mockReturnValue(plain.b)
    await sendDirectMessage('c1', 'no frills')
    // ⚠️ absent, not null/false — an insert that always names the columns
    // would turn every old message into a round-2 shape in the tests below.
    expect(plain.calls.insert[0][0]).toEqual({ conversation_id: 'c1', body: 'no frills' })
  })

  it('a photo may travel alone; bare-empty is still refused', async () => {
    const ins = builder({ data: { id: 'db' }, error: null })
    supabase.from.mockReturnValue(ins.b)
    await sendDirectMessage('c1', '', { attachmentPath: 'me-1/abc.jpg' })
    expect(ins.calls.insert[0][0]).toEqual({ conversation_id: 'c1', body: '', attachment_path: 'me-1/abc.jpg' })

    await expect(sendDirectMessage('c1', '   ')).rejects.toThrow('Write something first.')
  })
})

describe('postMessage — round 2 options', () => {
  it('carries an attachment into a squad channel and stays silent otherwise', async () => {
    const ins = builder({ data: { id: 'p9' }, error: null })
    supabase.from.mockReturnValue(ins.b)
    await postMessage('team-a', '', { attachmentPath: 'me-1/abc.jpg' })
    expect(ins.calls.insert[0][0]).toEqual({ team_id: 'team-a', body: '', mentions: [], attachment_path: 'me-1/abc.jpg' })
    await expect(postMessage('team-a', '')).rejects.toThrow('Write something first.')
  })
})

describe('forwardMessagesTo', () => {
  const older = { id: 'm1', body: 'first', created_at: '2026-08-24T08:00:00Z', attachment_path: null }
  const newer = { id: 'm2', body: 'second', created_at: '2026-08-24T09:00:00Z', attachment_path: 'me-1/pic.jpg' }

  it('sends into a DM oldest-first, marked forwarded, photo re-pointed', async () => {
    const inserts = []
    supabase.from.mockImplementation(() => {
      const { b, calls } = builder({ data: { id: 'x' }, error: null })
      inserts.push(calls)
      return b
    })
    await forwardMessagesTo({ kind: 'dm', conversation_id: 'c2' }, [newer, older])
    expect(inserts).toHaveLength(2)
    expect(inserts[0].insert[0][0]).toEqual({ conversation_id: 'c2', body: 'first', forwarded: true })
    expect(inserts[1].insert[0][0]).toEqual({ conversation_id: 'c2', body: 'second', forwarded: true, attachment_path: 'me-1/pic.jpg' })
  })

  it('a squad destination goes through the channel path, forwarded and all', async () => {
    const inserts = []
    supabase.from.mockImplementation(() => {
      const { b, calls } = builder({ data: { id: 'x' }, error: null })
      inserts.push(calls)
      return b
    })
    await forwardMessagesTo({ kind: 'squad', team_id: 'team-b' }, [older])
    expect(inserts[0].insert[0][0]).toEqual({ team_id: 'team-b', body: 'first', mentions: [], forwarded: true })
  })
})

describe('uploadChatPhoto', () => {
  function storageBucket() {
    const upload = vi.fn(async () => ({ error: null }))
    const remove = vi.fn(async () => ({ error: null }))
    supabase.storage.from.mockReturnValue({ upload, remove })
    return { upload, remove }
  }

  it('refuses a non-image and a giant file with plain words', async () => {
    storageBucket()
    await expect(uploadChatPhoto('me-1', { type: 'application/pdf', size: 100 })).rejects.toThrow('not a photo')
    await expect(uploadChatPhoto('me-1', { type: 'image/jpeg', size: 6 * 1024 * 1024 })).rejects.toThrow('too large')
  })

  it('resizes, uploads under the caller’s own folder and returns the key', async () => {
    const { upload } = storageBucket()
    const key = await uploadChatPhoto('me-1', { type: 'image/jpeg', size: 1000 })
    expect(resizePhoto).toHaveBeenCalledTimes(1)
    expect(key).toMatch(/^me-1\/[0-9a-f-]{36}\.jpg$/)
    expect(upload).toHaveBeenCalledWith(key, expect.anything(), { contentType: 'image/jpeg', upsert: false })
  })
})

describe('removeChatPhoto', () => {
  it('is best-effort: a storage failure never throws', async () => {
    supabase.storage.from.mockReturnValue({ remove: vi.fn(async () => { throw new Error('boom') }) })
    await expect(removeChatPhoto('me-1/abc.jpg')).resolves.toBeUndefined()
  })
})
