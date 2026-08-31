// Data access for the documents repo. RLS scopes every read server-side;
// writes go through the create/update RPCs, never table inserts (see
// db/migrations/20260831_documents.sql for why). Upload order is FILE
// FIRST, then row — an orphaned file is signable by nobody, while a row
// without a file is a broken link on every reader's screen.
import { supabase } from '../lib/supabase'
import { ACCEPTED_DOCUMENT_TYPES } from '../lib/documents'

export const DOCUMENT_BUCKET = 'documents'
const SIGNED_URL_SECONDS = 600

const SELECT = 'id, title, category, staff_only, club_wide, storage_key, '
  + 'file_name, file_size, content_type, created_by, created_at, '
  + 'document_squads ( team_id )'

export async function listDocuments() {
  const { data, error } = await supabase
    .from('documents')
    .select(SELECT)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function uploadDocument({
  file, title, category, staffOnly, clubWide, teamIds, prefixTeamId, notify,
}) {
  const extension = ACCEPTED_DOCUMENT_TYPES[file.type] ?? 'bin'
  const prefix = clubWide ? 'club' : prefixTeamId
  if (!prefix) throw new Error('uploadDocument needs a prefix team.')
  const key = `${prefix}/${crypto.randomUUID()}.${extension}`

  const { error: uploadError } = await supabase.storage
    .from(DOCUMENT_BUCKET)
    .upload(key, file, { contentType: file.type, upsert: false })
  if (uploadError) throw uploadError

  const { data, error } = await supabase.rpc('create_document', {
    _title: title,
    _category: category,
    _staff_only: staffOnly,
    _club_wide: clubWide,
    _team_ids: clubWide ? [] : teamIds,
    _storage_key: key,
    _file_name: file.name,
    _file_size: file.size,
    _content_type: file.type,
    _notify: Boolean(notify),
  })
  if (error) {
    // Best-effort orphan cleanup — the file is invisible without a row,
    // so a failed cleanup costs storage, not correctness.
    try { await supabase.storage.from(DOCUMENT_BUCKET).remove([key]) }
    catch { /* retention is the storage card's problem, not this upload's */ }
    throw error
  }
  return data
}

export async function signDocumentUrl(storageKey) {
  const { data, error } = await supabase.storage
    .from(DOCUMENT_BUCKET)
    .createSignedUrl(storageKey, SIGNED_URL_SECONDS)
  if (error) throw error
  return data.signedUrl
}

export async function deleteDocument({ id, storageKey }) {
  const { error } = await supabase.from('documents').delete().eq('id', id)
  if (error) throw error
  try { await supabase.storage.from(DOCUMENT_BUCKET).remove([storageKey]) }
  catch { /* row is gone; the orphan appears on no screen */ }
}

export async function updateDocument({
  id, title, category, staffOnly, clubWide, teamIds,
}) {
  const { error } = await supabase.rpc('update_document', {
    _id: id,
    _title: title,
    _category: category,
    _staff_only: staffOnly,
    _club_wide: clubWide,
    _team_ids: clubWide ? [] : teamIds,
  })
  if (error) throw error
}
