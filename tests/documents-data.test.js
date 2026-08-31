import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../src/lib/supabase.js', () => ({
  supabase: { from: vi.fn(), rpc: vi.fn(), storage: { from: vi.fn() } },
}))

import { supabase } from '../src/lib/supabase.js'
import {
  listDocuments, uploadDocument, deleteDocument, signDocumentUrl, updateDocument,
} from '../src/data/documents.js'

function createQueryBuilder(result = { data: [], error: null }) {
  const builder = {}
  for (const method of ['select', 'order', 'delete', 'eq']) {
    builder[method] = vi.fn(() => builder)
  }
  builder.then = (resolve) => resolve(result)
  return builder
}

function storageBucket() {
  return {
    upload: vi.fn().mockResolvedValue({ error: null }),
    remove: vi.fn().mockResolvedValue({ error: null }),
    createSignedUrl: vi.fn().mockResolvedValue(
      { data: { signedUrl: 'https://signed' }, error: null }),
  }
}

beforeEach(() => vi.clearAllMocks())

describe('listDocuments', () => {
  it('selects documents with their squads, newest first', async () => {
    const builder = createQueryBuilder()
    supabase.from.mockReturnValue(builder)
    await listDocuments()
    expect(supabase.from).toHaveBeenCalledWith('documents')
    expect(builder.select).toHaveBeenCalledWith(
      expect.stringContaining('document_squads'))
    expect(builder.order).toHaveBeenCalledWith(
      'created_at', { ascending: false })
  })
})

describe('uploadDocument', () => {
  const file = { name: 'pack.pdf', type: 'application/pdf', size: 10 }

  it('uploads file first, then creates the row via the RPC', async () => {
    const bucket = storageBucket()
    supabase.storage.from.mockReturnValue(bucket)
    supabase.rpc.mockResolvedValue({ data: 'doc-1', error: null })
    await uploadDocument({ file, title: 'Pack', category: 'registration',
      staffOnly: true, clubWide: false, teamIds: ['t1'], prefixTeamId: 't1' })
    expect(supabase.storage.from).toHaveBeenCalledWith('documents')
    const key = bucket.upload.mock.calls[0][0]
    expect(key).toMatch(/^t1\/[0-9a-f-]{36}\.pdf$/)
    expect(supabase.rpc).toHaveBeenCalledWith('create_document',
      expect.objectContaining({ _storage_key: key, _title: 'Pack' }))
  })

  it('files a club-wide upload under club/', async () => {
    const bucket = storageBucket()
    supabase.storage.from.mockReturnValue(bucket)
    supabase.rpc.mockResolvedValue({ data: 'doc-1', error: null })
    await uploadDocument({ file, title: 'Code of conduct',
      category: 'policies', staffOnly: false, clubWide: true, teamIds: [] })
    expect(bucket.upload.mock.calls[0][0]).toMatch(/^club\//)
  })

  it('removes the orphan file when the row insert fails, then throws', async () => {
    const bucket = storageBucket()
    supabase.storage.from.mockReturnValue(bucket)
    supabase.rpc.mockResolvedValue({ data: null,
      error: new Error('refused') })
    await expect(uploadDocument({ file, title: 'Pack',
      category: 'registration', staffOnly: true, clubWide: false,
      teamIds: ['t1'], prefixTeamId: 't1' })).rejects.toThrow('refused')
    expect(bucket.remove).toHaveBeenCalledWith(
      [bucket.upload.mock.calls[0][0]])
  })
})

describe('deleteDocument', () => {
  it('deletes the row FIRST, then best-effort removes the file', async () => {
    const order = []
    const builder = createQueryBuilder({ data: null, error: null })
    builder.delete = vi.fn(() => { order.push('row'); return builder })
    supabase.from.mockReturnValue(builder)
    const bucket = storageBucket()
    bucket.remove = vi.fn(() => { order.push('file')
      return Promise.resolve({ error: null }) })
    supabase.storage.from.mockReturnValue(bucket)
    await deleteDocument({ id: 'doc-1', storageKey: 't1/x.pdf' })
    expect(order).toEqual(['row', 'file'])
  })

  it('a failed file removal does not throw — the orphan is invisible', async () => {
    supabase.from.mockReturnValue(createQueryBuilder({ data: null, error: null }))
    const bucket = storageBucket()
    bucket.remove = vi.fn().mockRejectedValue(new Error('storage down'))
    supabase.storage.from.mockReturnValue(bucket)
    await expect(deleteDocument({ id: 'doc-1', storageKey: 't1/x.pdf' }))
      .resolves.not.toThrow()
  })
})

describe('signDocumentUrl', () => {
  it('calls createSignedUrl(storageKey, 600) on the documents bucket and returns data.signedUrl', async () => {
    const bucket = storageBucket()
    supabase.storage.from.mockReturnValue(bucket)
    const url = await signDocumentUrl('t1/doc.pdf')
    expect(supabase.storage.from).toHaveBeenCalledWith('documents')
    expect(bucket.createSignedUrl).toHaveBeenCalledWith('t1/doc.pdf', 600)
    expect(url).toBe('https://signed')
  })

  it('throws when storage returns an error', async () => {
    const bucket = storageBucket()
    bucket.createSignedUrl = vi.fn().mockResolvedValue(
      { data: null, error: new Error('storage error') })
    supabase.storage.from.mockReturnValue(bucket)
    await expect(signDocumentUrl('t1/doc.pdf')).rejects.toThrow('storage error')
  })
})

describe('updateDocument', () => {
  it('calls supabase.rpc(\'update_document\', {...}) with exact arguments', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: null })
    await updateDocument({ id: 'doc-1', title: 'New title', category: 'policies',
      staffOnly: false, clubWide: true, teamIds: [] })
    expect(supabase.rpc).toHaveBeenCalledWith('update_document',
      expect.objectContaining({
        _id: 'doc-1',
        _title: 'New title',
        _category: 'policies',
        _staff_only: false,
        _club_wide: true,
        _team_ids: [],
      }))
  })

  it('sets _team_ids to [] when clubWide is true', async () => {
    supabase.rpc.mockResolvedValue({ data: null, error: null })
    await updateDocument({ id: 'doc-1', title: 'Title', category: 'policies',
      staffOnly: false, clubWide: true, teamIds: ['t1', 't2'] })
    expect(supabase.rpc).toHaveBeenCalledWith('update_document',
      expect.objectContaining({ _team_ids: [] }))
  })

  it('throws when rpc returns an error', async () => {
    supabase.rpc.mockResolvedValue({ data: null,
      error: new Error('rpc failed') })
    await expect(updateDocument({ id: 'doc-1', title: 'Title', category: 'policies',
      staffOnly: false, clubWide: false, teamIds: ['t1'] })).rejects.toThrow('rpc failed')
  })
})
