import { useCallback, useEffect, useMemo, useState } from 'react'
import { AccentTitle, Kicker } from '../components/Editorial.jsx'
import Button from '../components/Button.jsx'
import Card from '../components/Card.jsx'
import { Chip } from '../components/Chip.jsx'
import { Empty } from '../components/Empty.jsx'
import DocumentUploadSheet from '../components/DocumentUploadSheet.jsx'
import { deleteDocument, listDocuments, signDocumentUrl } from '../data/documents.js'
import { formatBytes } from '../data/storage.js'
import { friendlyMessage } from '../lib/friendlyError.js'
import { useAuth } from '../lib/auth.jsx'
import { useMemberships } from '../lib/memberships.jsx'
import {
  ACCEPTED_DOCUMENT_TYPES,
  canUploadDocuments,
  DOCUMENT_CATEGORIES,
  filterDocuments,
  mayDeleteDocument,
} from '../lib/documents.js'
import { DESKTOP_QUERY, useMediaQuery } from '../lib/useMediaQuery.js'
import { visibleTeams } from '../lib/scope.js'

// The documents repo — /documents. Task 6 of
// claude/plans/2026-08-31-documents-repo.md.
//
// ⚠️ EVERY GATE HERE IS COSMETIC, THE SAME RULING AS Notices.jsx. `documents
// create/select/delete` and the create_document RPC (Task 3/4) are the
// enforcement — this screen decides only what to OFFER: the "Add document"
// button, the delete control, and which chip narrows the list.

const ALL = 'all'

/** The audience label for one row: club-wide, or the squads it targets, in
 * whatever order document_squads came back. A squad this reader cannot
 * resolve is dropped rather than rendered blank — the same rule
 * audienceLabel() uses for notices. */
function audienceLabel(document, teamsById) {
  if (document.club_wide) return 'Whole club'
  const names = (document.document_squads ?? [])
    .map((s) => teamsById.get(s.team_id)?.name)
    .filter(Boolean)
  return names.length > 0 ? names.join(', ') : 'Your squad'
}

// ── "Cells" restyle, 31 Aug 2026 ────────────────────────────────────────────
// Jay picked this from a mock: staff-card ROWS on phones (the shape
// SquadStaffCard.jsx's StaffRow uses), a TILE GRID on desktop. isDesktop
// branches the whole rendering — not two DOMs with one hidden by CSS — the
// same reason useMediaQuery.js gives for Roster/Schedule: it keeps one DOM,
// which is what a jsdom query needs.
//
// ⚠️ THE FILE-TYPE COLOUR IS DERIVED FROM content_type VIA
// ACCEPTED_DOCUMENT_TYPES (lib/documents.js), NOT GUESSED FROM THE
// FILENAME. That map already mirrors the storage bucket's allowed
// mime types exactly, so a document this app could not have uploaded can
// never reach a colour lookup either. Unknown content_type falls back to
// the neutral pairing rather than a blank swatch — the same "never
// announce itself" rule StaffAvatar's monogram fallback follows.
//
// Blue/green/amber are Tailwind's stock ramps (theme.extend keeps them
// available), not custom hexes — tests/theme.test.js's raw-hex rule only
// polices arbitrary-value literals, but a named token is still preferred
// wherever the palette already has one: PDF and "Staff only" both use the
// themed danger/brand-red pairing rather than a fourth literal.
const FILE_TYPE_STYLE = {
  pdf: { abbr: 'PDF', bg: 'bg-danger-bg', text: 'text-danger-ink' },
  doc: { abbr: 'DOC', bg: 'bg-blue-100', text: 'text-blue-700' },
  docx: { abbr: 'DOC', bg: 'bg-blue-100', text: 'text-blue-700' },
  xls: { abbr: 'XLS', bg: 'bg-green-100', text: 'text-green-700' },
  xlsx: { abbr: 'XLS', bg: 'bg-green-100', text: 'text-green-700' },
  ppt: { abbr: 'PPT', bg: 'bg-amber-100', text: 'text-amber-700' },
  pptx: { abbr: 'PPT', bg: 'bg-amber-100', text: 'text-amber-700' },
  jpg: { abbr: 'IMG', bg: 'bg-surface-mute', text: 'text-ink-muted' },
  png: { abbr: 'IMG', bg: 'bg-surface-mute', text: 'text-ink-muted' },
  webp: { abbr: 'IMG', bg: 'bg-surface-mute', text: 'text-ink-muted' },
}
const NEUTRAL_FILE_TYPE = { abbr: 'FILE', bg: 'bg-surface-mute', text: 'text-ink-muted' }

function fileTypeInfo(document) {
  const ext = ACCEPTED_DOCUMENT_TYPES[document.content_type]
  return FILE_TYPE_STYLE[ext] ?? NEUTRAL_FILE_TYPE
}

/** The type swatch: a 42px circle on a phone row, a 38px rounded square atop
 * a desktop tile. `aria-hidden` — the abbreviation repeats the file type the
 * category label already says in words, same reasoning StaffAvatar's
 * monogram follows. */
function FileTypeIcon({ document, shape = 'round' }) {
  const info = fileTypeInfo(document)
  const shapeClass = shape === 'round' ? 'h-[42px] w-[42px] rounded-full' : 'h-[38px] w-[38px] rounded-[10px]'
  return (
    <span
      aria-hidden="true"
      className={`grid shrink-0 place-items-center font-display text-[11px] font-extrabold ${shapeClass} ${info.bg} ${info.text}`}
    >
      {info.abbr}
    </span>
  )
}

function RowChevron(props) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d="m9 6 6 6-6 6" />
    </svg>
  )
}

function categoryLabel(document) {
  return DOCUMENT_CATEGORIES.find((c) => c.key === document.category)?.label ?? document.category
}

export default function Documents() {
  const { memberships, teams } = useMemberships()
  const { user } = useAuth()

  const [documents, setDocuments] = useState(null)
  const [error, setError] = useState(null)
  const [category, setCategory] = useState(ALL)
  const [teamFilter, setTeamFilter] = useState(ALL)
  const [uploadOpen, setUploadOpen] = useState(false)

  const isDesktop = useMediaQuery(DESKTOP_QUERY)

  const myTeams = useMemo(() => visibleTeams(memberships, teams), [memberships, teams])
  const teamsById = useMemo(() => new Map((teams ?? []).map((t) => [t.id, t])), [teams])
  const mayUpload = canUploadDocuments(memberships)

  const load = useCallback(async () => {
    setError(null)
    try {
      setDocuments(await listDocuments())
    } catch (err) {
      setError(friendlyMessage(err, 'We could not load the documents just now.'))
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const shown = useMemo(
    () =>
      filterDocuments(documents, {
        category: category === ALL ? null : category,
        teamId: teamFilter === ALL ? null : teamFilter,
      }),
    [documents, category, teamFilter],
  )

  async function handleOpen(document) {
    try {
      const url = await signDocumentUrl(document.storage_key)
      // ⚠️ THE AWAIT ABOVE HAS ALREADY ENDED THE USER-GESTURE CONTEXT, AND ON
      // iOS THAT IS THE DIFFERENCE BETWEEN THIS FEATURE WORKING AND DOING
      // NOTHING AT ALL. Safari — and an installed PWA especially — only honours
      // window.open while a tap is still being handled. Signing the URL is a
      // network round trip, so by the time we call open the gesture is spent:
      // the popup is blocked, window.open returns null, and NOTHING throws. The
      // catch below never runs and the member taps a row that silently does
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
      // ⚠️ SquadDocumentsCard.jsx CARRIES THE SAME LINES. Change both.
      const opened = window.open(url, '_blank')
      if (opened) opened.opener = null
      else window.location.assign(url)
    } catch (err) {
      setError(friendlyMessage(err, 'That document could not be opened.'))
    }
  }

  async function handleDelete(document) {
    // eslint-disable-next-line no-alert -- confirm-before-delete, same as Notices.
    if (!window.confirm(`Remove "${document.title}"? This cannot be undone.`)) return
    try {
      await deleteDocument({ id: document.id, storageKey: document.storage_key })
      await load()
    } catch (err) {
      setError(friendlyMessage(err, 'That document could not be removed.'))
    }
  }

  return (
    <section>
      <div className="mb-3.5 mt-1 flex flex-wrap items-center justify-between gap-3">
        <div>
          <Kicker>Documents</Kicker>
          <AccentTitle lead="Club" accent="documents." />
        </div>
        {mayUpload && (
          <Button data-testid="add-document" onClick={() => setUploadOpen(true)}>
            Add document
          </Button>
        )}
      </div>

      {error && (
        <Card className="mb-3 px-4 py-3">
          <p role="alert" className="text-[13px] font-semibold text-danger-ink">
            {error}
          </p>
        </Card>
      )}

      <div className="mb-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setCategory(ALL)}
          className={`rounded-full border px-3 py-1.5 text-[13px] font-bold transition ${
            category === ALL
              ? 'border-ink bg-ink text-surface-card'
              : 'border-line bg-surface-card text-ink-muted'
          }`}
        >
          All
        </button>
        {DOCUMENT_CATEGORIES.map((cat) => (
          <button
            key={cat.key}
            type="button"
            onClick={() => setCategory(cat.key)}
            className={`rounded-full border px-3 py-1.5 text-[13px] font-bold transition ${
              category === cat.key
                ? 'border-ink bg-ink text-surface-card'
                : 'border-line bg-surface-card text-ink-muted'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* ⚠️ HIDDEN BELOW TWO SQUADS, the same rule Notices/Schedule/Roster
          follow — a single pill that cannot change anything is furniture. */}
      {myTeams.length > 1 && (
        <div className="mb-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setTeamFilter(ALL)}
            className={`rounded-full border px-3 py-1.5 text-[13px] font-bold transition ${
              teamFilter === ALL
                ? 'border-ink bg-ink text-surface-card'
                : 'border-line bg-surface-card text-ink-muted'
            }`}
          >
            All squads
          </button>
          {myTeams.map((team) => (
            <button
              key={team.id}
              type="button"
              onClick={() => setTeamFilter(team.id)}
              className={`rounded-full border px-3 py-1.5 text-[13px] font-bold transition ${
                teamFilter === team.id
                  ? 'border-ink bg-ink text-surface-card'
                  : 'border-line bg-surface-card text-ink-muted'
              }`}
            >
              {team.name}
            </button>
          ))}
        </div>
      )}

      {!documents && !error && (
        <div role="status" aria-live="polite">
          <span className="sr-only">Loading documents…</span>
        </div>
      )}

      {documents && shown.length === 0 && (
        <Empty message="No documents yet — the club and your coaches can share files here." />
      )}

      {/* ⚠️ ONE BRANCH RENDERS, NOT BOTH WITH CSS HIDING — see useMediaQuery.js's
          own note. Both render the SAME document titles, so a CSS-only switch
          would leave every title in the DOM twice and any getByText query
          would throw. */}
      {isDesktop ? (
        <div
          data-testid="document-grid"
          className="grid grid-cols-3 gap-3 xl:grid-cols-4"
        >
          {shown.map((document) => {
            const canDelete = mayDeleteDocument(document, user?.id, memberships)
            return (
              <Card key={document.id} data-testid="document-row" className="flex flex-col gap-2.5 p-[14px]">
                <div className="flex items-start justify-between gap-2">
                  <FileTypeIcon document={document} shape="square" />
                  {canDelete && (
                    <button
                      type="button"
                      onClick={() => handleDelete(document)}
                      className="text-[12.5px] font-bold text-danger-ink"
                    >
                      Remove
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  data-testid="document-open"
                  onClick={() => handleOpen(document)}
                  className="min-w-0 rounded-[9px] px-1 py-0.5 text-left hover:bg-surface-mute"
                >
                  {/* line-clamp-3, NOT truncate — the desktop tile is where a
                      long title is meant to wrap, up to three lines, rather
                      than being cut to one. Tailwind ships line-clamp-* as a
                      core utility since v3.3 (this app is on ^3.4), so no
                      -webkit- fallback or plugin is needed. */}
                  <span className="line-clamp-3 block text-[14px] font-semibold text-ink">
                    {document.title}
                  </span>
                </button>
                <div className="flex flex-wrap gap-1.5">
                  <Chip>{categoryLabel(document)}</Chip>
                  {document.staff_only && (
                    <Chip className="bg-danger-bg text-danger-ink">Staff only</Chip>
                  )}
                </div>
                <span className="block text-[12px] text-ink-faint">
                  {audienceLabel(document, teamsById)} · {formatBytes(document.file_size)}
                </span>
              </Card>
            )
          })}
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {shown.map((document) => {
            const canDelete = mayDeleteDocument(document, user?.id, memberships)
            return (
              // ⚠️ THE CARD IS A CONTAINER, NOT THE CONTROL — 31 Aug 2026, final
              // review. It used to carry role="button" + tabIndex + onClick, which
              // put the Remove <button> INSIDE an element claiming to be a button.
              // Nested interactive content is invalid HTML, and screen readers
              // flatten it: the row announced as one button whose name swept up
              // "Remove", and the delete control was not reliably reachable on its
              // own. The title is now a real <button> — the same row-button shape
              // SquadDocumentsCard uses — so the two controls are siblings, keyboard
              // focus order is free, and the hand-rolled Enter/Space handler that
              // stood in for real button semantics is gone with it.
              <Card key={document.id} data-testid="document-row" className="p-[14px]">
                <div className="flex items-center gap-3">
                  <FileTypeIcon document={document} shape="round" />
                  <button
                    type="button"
                    data-testid="document-open"
                    onClick={() => handleOpen(document)}
                    className="min-w-0 flex-1 rounded-[9px] px-1 py-0.5 text-left hover:bg-surface-mute"
                  >
                    <span className="block truncate text-[14px] font-semibold text-ink">
                      {document.title}
                    </span>
                    <span className="mt-0.5 block truncate text-[12.5px] text-ink-muted">
                      {categoryLabel(document)} · {audienceLabel(document, teamsById)}
                      {' · '}
                      {formatBytes(document.file_size)}
                      {document.staff_only && (
                        <>
                          {' · '}
                          <span className="font-bold text-danger-ink">Staff only</span>
                        </>
                      )}
                    </span>
                  </button>
                  <div className="flex shrink-0 items-center gap-2">
                    {canDelete && (
                      <button
                        type="button"
                        onClick={() => handleDelete(document)}
                        className="text-[12.5px] font-bold text-danger-ink"
                      >
                        Remove
                      </button>
                    )}
                    <RowChevron className="h-4 w-4 shrink-0 text-ink-faint" />
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {mayUpload && (
        <DocumentUploadSheet
          open={uploadOpen}
          onClose={() => setUploadOpen(false)}
          teams={teams ?? []}
          memberships={memberships}
          onUploaded={load}
        />
      )}
    </section>
  )
}
