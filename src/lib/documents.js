// Pure helpers for the documents repo. Everything permission-shaped here is
// a UI convenience ONLY — RLS is the enforcement (see
// db/migrations/20260831_documents.sql). Spec:
// claude/plans/2026-08-31-documents-repo.md.
import { isActiveMembership, isAdmin } from './scope'

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

const UPLOAD_ROLES = new Set(['coach', 'manager'])

export function canUploadDocuments(memberships) {
  return isAdmin(memberships) || uploadableTeamIds(memberships).length > 0
}

export function uploadableTeamIds(memberships) {
  return (memberships ?? [])
    .filter((m) => isActiveMembership(m) && UPLOAD_ROLES.has(m.role) && m.team_id)
    .map((m) => m.team_id)
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
