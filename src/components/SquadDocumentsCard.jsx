import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Button from './Button.jsx'
import Card from './Card.jsx'
import Empty from './Empty.jsx'
import Skeleton from './Skeleton.jsx'
import DocumentUploadSheet from './DocumentUploadSheet.jsx'
import { listDocuments, signDocumentUrl } from '../data/documents.js'
import { filterDocuments } from '../lib/documents.js'
import { friendlyMessage } from '../lib/friendlyError.js'
import { useMemberships } from '../lib/memberships.jsx'

// The Squad Hub's door onto the documents repo — task-7-brief.md. Squad Hub
// is staff-only by construction (SquadHub.jsx gates the whole page on
// canEditTeam before this card ever mounts), so there is no second gate
// here: every squad-staff viewer who reaches this card may see and add to
// it. filterDocuments deliberately INCLUDES club-wide docs — the hub shows
// staff everything their squad can see, the same rule the /documents screen
// itself follows.

const ROW_CAP = 8

export default function SquadDocumentsCard({ teamId, teamName }) {
  const { memberships, teams } = useMemberships()
  const [documents, setDocuments] = useState(null)
  const [error, setError] = useState(null)
  const [uploadOpen, setUploadOpen] = useState(false)

  const load = useCallback(async () => {
    setError(null)
    try {
      setDocuments(await listDocuments())
    } catch (err) {
      setError(friendlyMessage(err, 'We could not load this squad’s documents just now.'))
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function handleOpen(document) {
    try {
      const url = await signDocumentUrl(document.storage_key)
      // ⚠️ THE AWAIT ABOVE HAS ALREADY ENDED THE USER-GESTURE CONTEXT, AND ON
      // iOS THAT IS THE DIFFERENCE BETWEEN THIS FEATURE WORKING AND DOING
      // NOTHING AT ALL. Safari — and an installed PWA especially — only honours
      // window.open while a tap is still being handled. Signing the URL is a
      // network round trip, so by the time we call open the gesture is spent:
      // the popup is blocked, window.open returns null, and NOTHING throws. The
      // catch below never runs and the coach taps a row that silently does
      // nothing.
      //
      // Same-tab navigation is never popup-blocked, so a null return falls back
      // to it. That is an acceptable landing for a signed URL whose only job is
      // to open one file: the browser hands the PDF to its viewer or to the OS,
      // and this app is still behind it in history.
      //
      // ⚠️ NO 'noopener' IN THE FEATURES STRING — MEASURED LIVE, 31 Aug 2026,
      // BY JAY ON THE FIRST REAL DOCUMENT. With 'noopener', window.open
      // returns null BY SPEC even when the tab opens, so the fallback below
      // fired on every successful open and the document opened in BOTH tabs
      // at once. The jsdom test stub returned a truthy window and could not
      // see it (the stub did not share the real API's failure mode). The
      // opener handle is nulled by hand instead — same reverse-tabnabbing
      // protection, and the return value means what this code needs it to
      // mean: null = genuinely blocked.
      //
      // ⚠️ src/screens/Documents.jsx CARRIES THE SAME LINES. Change both.
      const opened = window.open(url, '_blank')
      if (opened) opened.opener = null
      else window.location.assign(url)
    } catch (err) {
      setError(friendlyMessage(err, 'That document could not be opened.'))
    }
  }

  // Newest first, capped — listDocuments already orders newest-first, but
  // sorting again here keeps the cap correct regardless of the data
  // module's own ordering, and costs nothing on a list this short.
  const shown = filterDocuments(documents, { teamId })
    .slice()
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
  const capped = shown.slice(0, ROW_CAP)

  return (
    <Card className="p-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 className="text-[15px] font-extrabold text-ink">Documents</h3>
        <Button size="sm" onClick={() => setUploadOpen(true)}>
          Add
        </Button>
      </div>

      {error && (
        <p role="alert" className="mb-2 text-[13px] font-semibold text-danger-ink">
          {error}
        </p>
      )}

      {!documents && !error && (
        <div role="status" aria-live="polite" className="flex flex-col gap-1.5">
          <span className="sr-only">Loading documents…</span>
          <Skeleton className="h-10 w-full rounded-[9px]" />
          <Skeleton className="h-10 w-full rounded-[9px]" />
        </div>
      )}

      {documents && shown.length === 0 && (
        <Empty message={`No documents for ${teamName ?? 'this squad'} yet.`} />
      )}

      {capped.length > 0 && (
        <ul className="flex flex-col divide-y divide-line/60">
          {capped.map((document) => (
            <li key={document.id}>
              <button
                type="button"
                data-testid="squad-document-row"
                onClick={() => handleOpen(document)}
                className="flex w-full items-center justify-between gap-2 rounded-[9px] px-1 py-2 text-left hover:bg-surface-mute"
              >
                <span className="min-w-0 truncate text-[13.5px] font-semibold text-ink">
                  {document.title}
                </span>
                {document.club_wide && (
                  <span className="shrink-0 text-[11.5px] font-bold uppercase tracking-[.3px] text-ink-muted">
                    Club
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      {shown.length > 0 && (
        <div className="mt-2.5 border-t border-line/60 pt-2">
          <Link to="/documents" className="text-[13px] font-bold text-brand-ink underline-offset-2 hover:underline">
            See all
          </Link>
        </div>
      )}

      <DocumentUploadSheet
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        teams={teams ?? []}
        memberships={memberships}
        fixedTeamId={teamId}
        onUploaded={load}
      />
    </Card>
  )
}
