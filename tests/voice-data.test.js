import { describe, it, expect, vi, beforeEach } from 'vitest'

// The voice data layer on chatMedia.js — the SHAPE of the upload call and the
// two helpers the UI branches on. RLS is unchanged (db/tests/chat-voice.sql).

vi.mock('../src/lib/supabase.js', () => ({
  supabase: { storage: { from: vi.fn() } },
}))

import { supabase } from '../src/lib/supabase.js'
import { attachmentPreviewLabel, isAudioAttachment, uploadChatVoice } from '../src/data/chatMedia.js'

beforeEach(() => supabase.storage.from.mockReset())

describe('isAudioAttachment', () => {
  it('is true for audio keys and false for images or nothing', () => {
    expect(isAudioAttachment('p1/abc.webm')).toBe(true)
    expect(isAudioAttachment('p1/abc.m4a')).toBe(true)
    expect(isAudioAttachment('p1/abc.mp4')).toBe(true)
    expect(isAudioAttachment('p1/abc.jpg')).toBe(false)
    expect(isAudioAttachment('p1/abc.webp')).toBe(false)
    expect(isAudioAttachment(null)).toBe(false)
    expect(isAudioAttachment('')).toBe(false)
  })
})

describe('attachmentPreviewLabel', () => {
  it('names a voice note and a photo', () => {
    expect(attachmentPreviewLabel('p1/x.webm')).toBe('🎤 Voice message')
    expect(attachmentPreviewLabel('p1/x.jpg')).toBe('📷 Photo')
  })
})

describe('uploadChatVoice', () => {
  it('uploads the blob into the caller folder with its content-type and returns the key', async () => {
    const upload = vi.fn(async () => ({ error: null }))
    supabase.storage.from.mockReturnValue({ upload })
    const blob = new Blob(['x'], { type: 'audio/webm' })
    const key = await uploadChatVoice('p1', blob, 'webm')
    expect(supabase.storage.from).toHaveBeenCalledWith('chat-media')
    const [objectKey, sent, opts] = upload.mock.calls[0]
    expect(objectKey.startsWith('p1/')).toBe(true)
    expect(objectKey.endsWith('.webm')).toBe(true)
    expect(sent).toBe(blob)
    expect(opts).toMatchObject({ contentType: 'audio/webm', upsert: false })
    expect(key).toBe(objectKey)
  })

  it('throws without a profile id, and surfaces a storage error', async () => {
    await expect(uploadChatVoice(null, new Blob(['x']), 'webm')).rejects.toThrow(/profile id/i)
    supabase.storage.from.mockReturnValue({ upload: vi.fn(async () => ({ error: { message: 'nope' } })) })
    await expect(uploadChatVoice('p1', new Blob(['x'], { type: 'audio/webm' }), 'webm')).rejects.toBeTruthy()
  })
})
