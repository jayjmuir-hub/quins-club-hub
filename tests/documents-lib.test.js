import { describe, it, expect } from 'vitest'
import {
  DOCUMENT_CATEGORIES, MAX_DOCUMENT_BYTES, validateDocumentFile,
  canUploadDocuments, uploadableTeamIds, filterDocuments, mayDeleteDocument,
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

// mayDeleteDocument mirrors private.can_manage_document
// (db/schema/functions.sql, via private.is_active_staff_of) — the uploader,
// an admin, or an active COACH/MANAGER of a targeted squad. ⚠️ NOT
// isSquadStaffRole's wider set: the DB's manage gate deliberately excludes
// medic ("a medic reads a staff document; a coach or manager curates one"),
// so this reuses UPLOAD_ROLES rather than a second role-set literal, keeping
// "who may add" and "who may remove" from drifting apart.
describe('mayDeleteDocument', () => {
  const squadDoc = {
    id: 'd1', created_by: 'uploader-1', club_wide: false,
    document_squads: [{ team_id: 't1' }],
  }

  // ⚠️ THE DEFECT THIS PINS. A medic of the targeted squad passes
  // isSquadStaffRole but must NOT see a Remove control RLS then refuses.
  it('refuses a medic of the targeted squad — the DB manage gate excludes medic', () => {
    expect(mayDeleteDocument(squadDoc, 'someone-else', [active('medic', 't1')])).toBe(false)
  })

  it('allows a coach of the targeted squad', () => {
    expect(mayDeleteDocument(squadDoc, 'someone-else', [active('coach', 't1')])).toBe(true)
  })

  it('allows a manager of the targeted squad', () => {
    expect(mayDeleteDocument(squadDoc, 'someone-else', [active('manager', 't1')])).toBe(true)
  })

  it('allows the uploader even with no staff role at all', () => {
    expect(mayDeleteDocument(squadDoc, 'uploader-1', [active('parent', 't1')])).toBe(true)
  })

  it('allows an admin regardless of squad', () => {
    expect(mayDeleteDocument(squadDoc, 'someone-else', [active('admin', null)])).toBe(true)
  })

  // Club-wide documents are not squad-manageable — only the uploader or an
  // admin may remove one, never a targeting squad's own staff.
  it('refuses a squad coach on a club-wide document, when not the uploader or an admin', () => {
    const clubWideDoc = { id: 'd2', created_by: 'uploader-1', club_wide: true, document_squads: [] }
    expect(mayDeleteDocument(clubWideDoc, 'someone-else', [active('coach', 't1')])).toBe(false)
  })
})
