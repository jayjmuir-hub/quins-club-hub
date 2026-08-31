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
  // The gate's own behaviour (order, HEIC refusal, size-after-resize) is
  // proved in tests/image-resize.test.js against the real implementation;
  // here it just hands the file through so these tests stay about the
  // upload call's SHAPE.
  preparePhotoUpload: vi.fn(async (file) => {
    if (!file) throw new Error('Choose a photo first.')
    return file
  }),
}))

import { supabase } from '../src/lib/supabase.js'
import { preparePhotoUpload, resizePhoto } from '../src/lib/imageResize.js'
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
  preparePhotoUpload.mockClear()
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

  it('group mentions ride the insert when given, and stay ABSENT when empty', async () => {
    // claude/plans/2026-08-31-group-chat-mentions.md — same absent-not-null
    // rule as the round-2 options above: an empty mentions array must not
    // decorate every plain message.
    const withM = builder({ data: { id: 'db' }, error: null })
    supabase.from.mockReturnValue(withM.b)
    await sendDirectMessage('g1', '@Mira Vantel are you driving?', { mentions: ['p-2'] })
    expect(withM.calls.insert[0][0]).toEqual({
      conversation_id: 'g1',
      body: '@Mira Vantel are you driving?',
      mentions: ['p-2'],
    })

    const empty = builder({ data: { id: 'dc' }, error: null })
    supabase.from.mockReturnValue(empty.b)
    await sendDirectMessage('g1', 'plain', { mentions: [] })
    expect(empty.calls.insert[0][0]).toEqual({ conversation_id: 'g1', body: 'plain' })
  })

  it('the quoted embed goes through the FK COLUMN itself — both other spellings shipped broken', async () => {
    // ⚠️ MEASURED LIVE, 24 Aug 2026, twice in one evening. On a SELF-join
    // this project's PostgREST rejects a constraint-name hint
    // (`!messages_quoted_id_fkey` → PGRST200), and `messages!quoted_id`
    // resolves BACKWARDS — an empty array of quoting messages on every row,
    // which chipped every bubble with a phantom "📷 Photo". Only
    // `quoted:quoted_id(…)` is to-one by definition. The mocks make all of
    // this invisible to every screen test, so this anchor pins the one
    // string the live API actually parses.
    const ins = builder({ data: { id: 'dc' }, error: null })
    supabase.from.mockReturnValue(ins.b)
    await sendDirectMessage('c1', 'shape probe')
    const select = ins.calls.select[0][0]
    expect(select).toContain('quoted:quoted_id(')
    expect(select).not.toContain('quoted:messages!')
    expect(select).not.toContain('messages!messages_quoted_id_fkey')
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

  it('lets the shared gate refuse rather than judging the file itself', async () => {
    // ⚠️ THE OLD SHAPE THIS REPLACES: this function used to check type and
    // size ITSELF, size before resize — which refused the 5–8 MB files real
    // phones produce. The whole judgment now lives in preparePhotoUpload
    // (proved against the real implementation in tests/image-resize.test.js);
    // this proves the function actually defers to it.
    storageBucket()
    preparePhotoUpload.mockRejectedValueOnce(new Error('That file is not a photo. Use a JPEG, PNG or WebP image.'))
    await expect(uploadChatPhoto('me-1', { type: 'application/pdf', size: 100 })).rejects.toThrow('not a photo')
    expect(preparePhotoUpload).toHaveBeenCalledTimes(1)
  })

  it('uploads what the gate resolves with, under the caller’s own folder', async () => {
    const { upload } = storageBucket()
    const key = await uploadChatPhoto('me-1', { type: 'image/jpeg', size: 1000 })
    expect(preparePhotoUpload).toHaveBeenCalledTimes(1)
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
