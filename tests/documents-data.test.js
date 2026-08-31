import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../src/lib/supabase.js', () => ({
  supabase: { from: vi.fn(), rpc: vi.fn(), storage: { from: vi.fn() } },
}))

import { supabase } from '../src/lib/supabase.js'
import {
  listDocuments, uploadDocument, deleteDocument,
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
