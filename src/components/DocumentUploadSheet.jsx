import { useRef, useState } from 'react'
import Sheet from './Sheet.jsx'
import Button from './Button.jsx'
import { uploadDocument } from '../data/documents.js'
import {
  DOCUMENT_CATEGORIES, documentAccept, validateDocumentFile,
  uploadableTeamIds,
} from '../lib/documents.js'
import { adminTeamReach, isAdmin } from '../lib/scope.js'
import { friendlyMessage } from '../lib/friendlyError.js'

// Upload a document, as a sheet — the same Sheet-with-checkbox-grid shape as
// NoticeComposer, and this file copies its field markup/classes deliberately
// so the two sheets read as siblings (task-5-brief.md: "no new styling
// decisions"). See claude/plans/2026-08-31-documents-repo.md for the spec.
//
// ⚠️ THE CALLER DECIDES WHO MAY SEE THE BUTTON, NOT THIS FILE — same ruling
// as NoticeComposer's header comment. canUploadDocuments (src/lib/documents.js)
// answers that, and RLS/the create_document RPC are the actual boundary.

const FIELD =
  'w-full rounded-[11px] border-[1.5px] border-line bg-surface-card px-3 py-2.5 text-[16px] text-ink outline-none transition focus:border-brand disabled:cursor-not-allowed disabled:opacity-60'
const LABEL = 'mb-1.5 block text-[12.5px] font-bold uppercase tracking-[.4px] text-ink-muted'

// Mirrors PhotoPositioner's UploadIcon (src/components/PhotoPositioner.jsx)
// exactly — same drop-zone idiom, same glyph, so the two upload affordances
// read as siblings.
function UploadIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M12 16V4m0 0L8 8m4-4 4 4" />
      <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
    </svg>
  )
}

export default function DocumentUploadSheet({
  open, onClose, teams, memberships, fixedTeamId, onUploaded,
}) {
  const admin = isAdmin(memberships)
  const staffedIds = uploadableTeamIds(memberships)
  const pickable = fixedTeamId
    ? teams.filter((t) => t.id === fixedTeamId)
    : admin && adminTeamReach(memberships, 'edit') ? teams : teams.filter((t) => staffedIds.includes(t.id))

  const [file, setFile] = useState(null)
  const [fileError, setFileError] = useState(null)
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('other')
  // ⚠️ STAFF-ONLY IS THE LAZY-SAFE DEFAULT — the spec's deliberate call. A
  // mis-tap here costs a family a document they were meant to see; a
  // mis-tap the other way costs the club a document it meant to keep
  // internal, in front of parents. Default to the narrower audience.
  const [staffOnly, setStaffOnly] = useState(true)
  // ⚠️ NARROWEST DEFAULT, EXACT — NOT NoticeComposer's "always pick teams[0]".
  // That works there because a coach's only option IS teams[0]. Here an admin
  // routinely has several squads pickable, and pre-ticking the first one for
  // them would let "add document" silently target a squad nobody chose. So
  // this only auto-picks when there is exactly ONE option on offer — a fixed
  // squad (Squad Hub door) or a coach/manager with a single staffed squad —
  // where the "choice" is not really a choice. Anyone with more than one
  // option starts empty and must pick, matching "nothing chosen blocks
  // submit; it never silently widens" below.
  const [picked, setPicked] = useState(() => {
    if (fixedTeamId) return new Set([fixedTeamId])
    return new Set(pickable.length === 1 ? [pickable[0].id] : [])
  })
  // ⚠️ A SEPARATE FLAG, NOT A MEMBER OF `picked` — the NoticeComposer ruling
  // against expressing "whole club AND U12" as one set.
  const [wholeClub, setWholeClub] = useState(false)
  const [notify, setNotify] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef(null)

  // ⚠️ TAKES A FILE OBJECT DIRECTLY, not an event — so both the hidden
  // <input>'s onChange AND the drop zone's onDrop can route through it, and
  // a dropped file gets EXACTLY the same validateDocumentFile check a picked
  // one does. Mirrors PhotoPositioner's PhotoDropZone `take` (same file).
  function pickFile(next) {
    setFile(next ?? null)
    setFileError(validateDocumentFile(next ?? null))
    if (next && !title) setTitle(next.name.replace(/\.[^.]+$/, ''))
  }

  function toggleTeam(id) {
    setPicked((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (!file || fileError) { setError(fileError ?? 'Choose a file first.'); return }
    const teamIds = [...picked]
    // ⚠️ NOTHING CHOSEN BLOCKS, IT NEVER SILENTLY WIDENS — the same failure
    // NoticeComposer guards against. An empty set must not become "everyone".
    if (!wholeClub && teamIds.length === 0) {
      setError('Choose at least one age group.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await uploadDocument({
        file,
        // ⚠️ TRUNCATED TO 120 BECAUSE THE FALLBACK IS UNBOUNDED. The title
        // input has a maxLength, but `file.name` is whatever the OS handed the
        // picker and can be far longer — and `documents_title_check` in
        // 20260831_documents.sql caps the column at
        // `length(trim(title)) between 1 and 120`. Without this slice, someone
        // who leaves the title blank and picks a file with a very long name
        // gets a raw check-constraint violation from Postgres AFTER the file
        // has already uploaded, which then orphans it. Cheaper to trim here.
        title: (title.trim() || file.name).slice(0, 120),
        category,
        staffOnly,
        clubWide: wholeClub,
        teamIds,
        prefixTeamId: fixedTeamId
          ?? teamIds.find((id) => staffedIds.includes(id))
          ?? teamIds[0],
        notify,
      })
      onUploaded?.()
      onClose()
    } catch (err) {
      setError(friendlyMessage(err, 'Could not upload that document.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="Add document">
      <form onSubmit={handleSubmit}>
        {error && (
          <p
            role="alert"
            className="mb-3 rounded-[11px] bg-danger-bg px-3 py-2 text-sm font-semibold text-danger-ink"
          >
            {error}
          </p>
        )}

        <div className="mb-3.5">
          <label className={LABEL} htmlFor="document-file">
            File
          </label>
          {/* Drop zone, mirroring PhotoPositioner's PhotoDropZone shape
              (src/components/PhotoPositioner.jsx) — a real <button> wrapping
              a hidden, real <input type="file">, so the tap target, the
              drag target and keyboard/screen-reader operability are all
              covered by one control. */}
          <button
            type="button"
            data-testid="document-drop-zone"
            disabled={saving}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault()
              setDragOver(true)
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragOver(false)
              // Only the FIRST dropped file, like the photo zone — `accept`
              // cannot filter a drop, so this still goes through pickFile's
              // validateDocumentFile just like a picked file does.
              pickFile(e.dataTransfer?.files?.[0] ?? null)
            }}
            className={`flex w-full flex-col items-center justify-center gap-2 rounded-card border-2 border-dashed px-4 py-7 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-60 ${
              dragOver ? 'border-brand bg-brand/5' : 'border-line-strong bg-surface-mute'
            }`}
          >
            <UploadIcon className="h-7 w-7 text-ink-faint" aria-hidden="true" />
            <span className="text-[14px] font-bold text-ink">
              {file ? file.name : 'Choose a document'}
            </span>
            <span className="text-[12.5px] text-ink-faint">
              Tap to choose, or drag one in
            </span>
          </button>

          {/* ⚠️ A REAL, FOCUSABLE INPUT — visually hidden, not `display:none`.
              Keeps existing getByLabelText(/file/i) queries and keyboard/
              screen-reader operability working exactly as before; the drop
              zone above is an added affordance, not a replacement for it. */}
          <input
            ref={fileInputRef}
            id="document-file"
            type="file"
            accept={documentAccept()}
            disabled={saving}
            className="sr-only"
            aria-label="File"
            onChange={(event) => {
              pickFile(event.target.files?.[0] ?? null)
              // Allows choosing the SAME file again after removing it.
              event.target.value = ''
            }}
          />
          {fileError && (
            <p className="mt-1.5 text-[12.5px] font-semibold text-danger-ink">{fileError}</p>
          )}
        </div>

        <div className="mb-3.5">
          <label className={LABEL} htmlFor="document-title">
            Title
          </label>
          <input
            id="document-title"
            type="text"
            className={FIELD}
            value={title}
            disabled={saving}
            maxLength={120}
            onChange={(event) => setTitle(event.target.value)}
          />
        </div>

        <div className="mb-3.5">
          <label className={LABEL} htmlFor="document-category">
            Category
          </label>
          <select
            id="document-category"
            className={FIELD}
            value={category}
            disabled={saving}
            onChange={(event) => setCategory(event.target.value)}
          >
            {DOCUMENT_CATEGORIES.map((cat) => (
              <option key={cat.key} value={cat.key}>
                {cat.label}
              </option>
            ))}
          </select>
        </div>

        <label className="mb-3.5 flex items-center gap-2.5 text-[14px] font-semibold text-ink">
          <input
            type="checkbox"
            checked={staffOnly}
            disabled={saving}
            onChange={(event) => setStaffOnly(event.target.checked)}
            className="h-4 w-4 accent-brand"
          />
          Staff only
        </label>

        {/* ⚠️ HIDDEN ENTIRELY WHEN fixedTeamId IS SET — the Squad Hub door
            already fixes targeting to that one squad, and offering a picker
            that cannot change anything is worse than offering none. */}
        {!fixedTeamId && (
          <fieldset className="mb-1.5 border-0 p-0" disabled={saving}>
            <legend className={LABEL}>Age groups</legend>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
              {pickable.map((team) => (
                <label
                  key={team.id}
                  className={`flex items-center gap-2 text-[15px] ${
                    wholeClub ? 'cursor-not-allowed opacity-45' : 'cursor-pointer text-ink'
                  }`}
                >
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-brand"
                    checked={!wholeClub && picked.has(team.id)}
                    disabled={wholeClub}
                    onChange={() => toggleTeam(team.id)}
                  />
                  <span>{team.name}</span>
                </label>
              ))}
            </div>

            {admin && (
              <label className="mt-2.5 flex cursor-pointer items-center gap-2 border-t border-line pt-2.5 text-[15px] font-bold text-ink">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-brand"
                  checked={wholeClub}
                  onChange={(event) => setWholeClub(event.target.checked)}
                />
                <span>Whole club</span>
              </label>
            )}
          </fieldset>
        )}

        <label className="mt-3.5 flex items-center gap-2.5 text-[14px] font-semibold text-ink">
          <input
            type="checkbox"
            checked={notify}
            disabled={saving}
            onChange={(event) => setNotify(event.target.checked)}
            className="h-4 w-4 accent-brand"
          />
          Notify people
        </label>

        <div className="mt-4 flex items-center gap-3">
          <Button type="submit" disabled={saving}>
            {saving ? 'Adding…' : 'Add document'}
          </Button>
          {!saving && (
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
          )}
        </div>
      </form>
    </Sheet>
  )
}
