// Pure helpers for the documents repo. Everything permission-shaped here is
// a UI convenience ONLY — RLS is the enforcement (see
// db/migrations/20260831_documents.sql). Spec:
// claude/plans/2026-08-31-documents-repo.md.
import { isActiveMembership, isAdmin, UPLOAD_ROLES } from './scope'

export const DOCUMENT_CATEGORIES = [
  { key: 'registration', label: 'Registration' },
  { key: 'fixtures', label: 'Fixtures & Festivals' },
  { key: 'policies', label: 'Policies' },
  { key: 'coaching', label: 'Coaching' },
  { key: 'other', label: 'Other' },
]

export const MAX_DOCUMENT_BYTES = 26214400 // 25 MB — mirrors the bucket limit

// Mirrors the bucket's allowed_mime_types EXACTLY. A mismatch fails ugly:
// the storage API refuses with a raw error after the picker allowed it.
export const ACCEPTED_DOCUMENT_TYPES = {
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-powerpoint': 'ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

export function documentAccept() {
  return Object.keys(ACCEPTED_DOCUMENT_TYPES).join(',')
}

export function validateDocumentFile(file) {
  if (!file) return 'Choose a file first.'
  if (!ACCEPTED_DOCUMENT_TYPES[file.type]) {
    return 'That file type is not supported — use a PDF, Office document, or image.'
  }
  if (file.size > MAX_DOCUMENT_BYTES) {
    return 'That file is over the 25 MB limit.'
  }
  return null
}

// ⚠️ UPLOAD_ROLES NOW LIVES IN scope.js, beside APPROVER_ROLES — 31 Aug 2026,
// final review. It was a local `new Set(['coach','manager'])` here, which put a
// third copy of the squad-role literals outside the one file that is supposed
// to name them (and outside the reach of tests/staff-roles.test.jsx's rule).
// Read its comment there for what the set mirrors in the database; an array
// rather than a Set because that is the shape every sibling list in scope.js
// uses, and these lists are two entries long.
export function canUploadDocuments(memberships) {
  return isAdmin(memberships) || uploadableTeamIds(memberships).length > 0
}

export function uploadableTeamIds(memberships) {
  return (memberships ?? [])
    .filter((m) => isActiveMembership(m) && UPLOAD_ROLES.includes(m.role) && m.team_id)
    .map((m) => m.team_id)
}

/**
 * May this person delete THIS document? The client-side mirror of
 * `private.can_manage_document` (db/schema/functions.sql, via
 * `private.is_active_staff_of`) — the uploader, an admin, or an active
 * coach/manager of a squad the document targets.
 *
 * ⚠️ UPLOAD_ROLES, NOT A SQUAD-STAFF SET — deliberately narrower than
 * `isSquadStaffRole` in scope.js (which also admits 'medic'). The database's
 * manage gate is coach+manager only: "a medic reads a staff document; a
 * coach or manager curates one." A medic of the targeted squad must NOT see
 * a Remove control that RLS will refuse — mirroring the wider
 * SQUAD_STAFF_ROLES set here would draw exactly that dead button. Reusing
 * UPLOAD_ROLES (rather than a second role-set literal) keeps "who may add" and
 * "who may remove" from drifting apart, since the DB defines them as the same
 * set.
 */
export function mayDeleteDocument(doc, userId, memberships) {
  if (!doc) return false
  if (doc.created_by && doc.created_by === userId) return true
  if (isAdmin(memberships)) return true
  if (doc.club_wide) return false
  const targetedIds = new Set((doc.document_squads ?? []).map((s) => s.team_id))
  return (memberships ?? []).some(
    (m) => isActiveMembership(m) && UPLOAD_ROLES.includes(m.role) && targetedIds.has(m.team_id),
  )
}

export function filterDocuments(docs, { category, teamId } = {}) {
  return (docs ?? []).filter((doc) => {
    if (category && doc.category !== category) return false
    if (teamId && !doc.club_wide
        && !(doc.document_squads ?? []).some((s) => s.team_id === teamId)) {
      return false
    }
    return true
  })
}
