import { describe, it, expect, vi, beforeEach } from 'vitest'

// Chat file attachments (Excel / Word / PDF) on the existing chat-media rail.
// Spec: claude/plans/2026-09-04-chat-file-attachments.md

vi.mock('../src/lib/supabase.js', () => ({
  supabase: { storage: { from: vi.fn() } },
}))

import { supabase } from '../src/lib/supabase.js'
import {
  CHAT_FILE_TYPES,
  MAX_CHAT_FILE_BYTES,
  isFileAttachment,
  isAudioAttachment,
  attachmentPreviewLabel,
  uploadChatFile,
} from '../src/data/chatMedia.js'

beforeEach(() => supabase.storage.from.mockReset())

function pdf(name = 'notes.pdf', size = 1000) {
  return new File(['x'.repeat(Math.min(size, 8))], name, { type: 'application/pdf' })
}

describe('CHAT_FILE_TYPES and size cap', () => {
  it('allowlists the v1 MIME set and not ppt or images-as-files', () => {
    expect(CHAT_FILE_TYPES['application/pdf']).toBe('pdf')
    expect(CHAT_FILE_TYPES['application/msword']).toBe('doc')
    expect(CHAT_FILE_TYPES['application/vnd.openxmlformats-officedocument.wordprocessingml.document']).toBe('docx')
    expect(CHAT_FILE_TYPES['application/vnd.ms-excel']).toBe('xls')
    expect(CHAT_FILE_TYPES['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']).toBe('xlsx')
    expect(CHAT_FILE_TYPES['text/csv']).toBe('csv')
    expect(CHAT_FILE_TYPES['application/csv']).toBe('csv')
    expect(CHAT_FILE_TYPES['application/vnd.ms-powerpoint']).toBeUndefined()
    expect(CHAT_FILE_TYPES['application/vnd.openxmlformats-officedocument.presentationml.presentation']).toBeUndefined()
    expect(CHAT_FILE_TYPES['image/jpeg']).toBeUndefined()
    expect(CHAT_FILE_TYPES['application/zip']).toBeUndefined()
  })

  it('caps a file at 25 MB (26214400)', () => {
    expect(MAX_CHAT_FILE_BYTES).toBe(26214400)
  })
})

describe('isFileAttachment', () => {
  it('is true for allowlisted keys and false for photos, voice, or nothing', () => {
    expect(isFileAttachment('p1/abc.pdf')).toBe(true)
    expect(isFileAttachment('p1/abc.docx')).toBe(true)
    expect(isFileAttachment('p1/abc.xlsx')).toBe(true)
    expect(isFileAttachment('p1/abc.csv')).toBe(true)
    expect(isFileAttachment('p1/abc.doc')).toBe(true)
    expect(isFileAttachment('p1/abc.xls')).toBe(true)
    expect(isFileAttachment('p1/abc.jpg')).toBe(false)
    expect(isFileAttachment('p1/abc.webm')).toBe(false)
    expect(isFileAttachment('p1/abc.pptx')).toBe(false)
    expect(isFileAttachment(null)).toBe(false)
    expect(isFileAttachment('')).toBe(false)
    expect(isAudioAttachment('p1/abc.pdf')).toBe(false)
  })
})

describe('attachmentPreviewLabel — files win before the photo default', () => {
  it('names a file from its original filename when given', () => {
    expect(attachmentPreviewLabel('p1/uuid.xlsx', 1, 'name.xlsx')).toBe('📄 name.xlsx')
  })

  it('falls back to a generic file label from the path alone (chat list)', () => {
    expect(attachmentPreviewLabel('p1/uuid.pdf')).toBe('📄 File')
  })

  it('still names voice and photo, and still counts albums', () => {
    expect(attachmentPreviewLabel('p1/x.webm')).toBe('🎤 Voice message')
    expect(attachmentPreviewLabel('p1/x.jpg')).toBe('📷 Photo')
    expect(attachmentPreviewLabel('p1/x.jpg', 10)).toBe('📷 10 photos')
  })

  it('a file is never called a photo even when count is 1', () => {
    expect(attachmentPreviewLabel('p1/uuid.pdf', 1)).toBe('📄 File')
  })
})

describe('uploadChatFile', () => {
  function storageBucket() {
    const upload = vi.fn(async () => ({ error: null }))
    supabase.storage.from.mockReturnValue({ upload })
    return { upload }
  }

  it('uploads an allowlisted file with no resize and returns { file, type, size, name }', async () => {
    const { upload } = storageBucket()
    const file = new File(['hello'], 'roster.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    const row = await uploadChatFile('me-1', file)
    expect(supabase.storage.from).toHaveBeenCalledWith('chat-media')
    expect(row.file).toMatch(/^me-1\/[0-9a-f-]{36}\.xlsx$/)
    expect(row).toEqual({
      file: row.file,
      type: file.type,
      size: file.size,
      name: 'roster.xlsx',
    })
    expect(upload).toHaveBeenCalledWith(row.file, file, { contentType: file.type, upsert: false })
  })

  it('accepts every allowlisted MIME including application/csv', async () => {
    storageBucket()
    const csv = new File(['a,b'], 'grid.csv', { type: 'application/csv' })
    const row = await uploadChatFile('me-1', csv)
    expect(row.file.endsWith('.csv')).toBe(true)
    expect(row.type).toBe('application/csv')
  })

  it('refuses ppt and does not upload', async () => {
    const { upload } = storageBucket()
    const ppt = new File(['x'], 'slides.ppt', { type: 'application/vnd.ms-powerpoint' })
    await expect(uploadChatFile('me-1', ppt)).rejects.toThrow(/not supported/i)
    expect(upload).not.toHaveBeenCalled()
  })

  it('refuses an oversize file', async () => {
    const { upload } = storageBucket()
    const big = pdf('huge.pdf', 10)
    Object.defineProperty(big, 'size', { value: MAX_CHAT_FILE_BYTES + 1 })
    await expect(uploadChatFile('me-1', big)).rejects.toThrow(/25 MB/i)
    expect(upload).not.toHaveBeenCalled()
  })

  it('throws without a profile id', async () => {
    await expect(uploadChatFile(null, pdf())).rejects.toThrow(/profile id/i)
  })
})
