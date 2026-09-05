// Type pill for a chat document (XLSX / DOCX / PDF / CSV / …).
// Lives here, not in chatMedia.js, so FileCard still works when a test stubs
// the data module (every thread suite does). Keep the MIME keys in lockstep
// with CHAT_FILE_TYPES in src/data/chatMedia.js.

const MIME_TO_KIND = {
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'text/csv': 'csv',
  'application/csv': 'csv',
}
const KINDS = new Set(Object.values(MIME_TO_KIND))

export function fileKindLabel({ type, name, path } = {}) {
  if (type && MIME_TO_KIND[type]) return MIME_TO_KIND[type].toUpperCase()
  const fromName = name?.split('.').pop()?.toLowerCase()
  if (fromName && KINDS.has(fromName)) return fromName.toUpperCase()
  const fromPath = path?.split('.').pop()?.toLowerCase()
  if (fromPath && KINDS.has(fromPath)) return fromPath.toUpperCase()
  return 'FILE'
}
