import { describe, it, expect } from 'vitest'
import {
  DOCUMENT_CATEGORIES, MAX_DOCUMENT_BYTES, validateDocumentFile,
  canUploadDocuments, uploadableTeamIds, filterDocuments,
} from '../src/lib/documents.js'

const active = (role, teamId) => ({ role, team_id: teamId, status: 'active' })

describe('documents lib', () => {
  it('has the five agreed categories in order', () => {
    expect(DOCUMENT_CATEGORIES.map((c) => c.key)).toEqual(
      ['registration', 'fixtures', 'policies', 'coaching', 'other'])
  })

  it('rejects an oversized file with a friendly message', () => {
    const file = { name: 'huge.pdf', type: 'application/pdf',
                   size: MAX_DOCUMENT_BYTES + 1 }
    expect(validateDocumentFile(file)).toMatch(/25 MB/)
  })

  it('rejects a type the bucket would refuse, BEFORE the upload', () => {
    const file = { name: 'movie.mp4', type: 'video/mp4', size: 1000 }
    expect(validateDocumentFile(file)).toMatch(/PDF/)
  })

  it('accepts a PDF under the limit', () => {
    const file = { name: 'pack.pdf', type: 'application/pdf', size: 1000 }
    expect(validateDocumentFile(file)).toBeNull()
  })

  it('lets admins and squad staff upload; parents and pending staff not', () => {
    expect(canUploadDocuments([active('admin', null)])).toBe(true)
    expect(canUploadDocuments([active('coach', 't1')])).toBe(true)
    expect(canUploadDocuments([active('manager', 't1')])).toBe(true)
    expect(canUploadDocuments([active('medic', 't1')])).toBe(false)
    expect(canUploadDocuments([active('parent', 't1')])).toBe(false)
    expect(canUploadDocuments([{ role: 'coach', team_id: 't1',
      status: 'pending' }])).toBe(false)
  })

  it('uploadableTeamIds lists only actively staffed squads', () => {
    expect(uploadableTeamIds([
      active('coach', 't1'), active('parent', 't2'),
      { role: 'manager', team_id: 't3', status: 'pending' },
    ])).toEqual(['t1'])
  })

  it('filterDocuments narrows by category and squad', () => {
    const docs = [
      { id: 'a', category: 'policies', club_wide: true, document_squads: [] },
      { id: 'b', category: 'coaching', club_wide: false,
        document_squads: [{ team_id: 't1' }] },
    ]
    expect(filterDocuments(docs, {}).map((d) => d.id)).toEqual(['a', 'b'])
    expect(filterDocuments(docs, { category: 'coaching' })
      .map((d) => d.id)).toEqual(['b'])
    // A club-wide document belongs to EVERY squad filter.
    expect(filterDocuments(docs, { teamId: 't1' })
      .map((d) => d.id)).toEqual(['a', 'b'])
    expect(filterDocuments(docs, { teamId: 't2' })
      .map((d) => d.id)).toEqual(['a'])
  })
})
