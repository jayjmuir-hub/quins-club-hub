import { useCallback, useEffect, useMemo, useState } from 'react'
import { AccentTitle, Kicker } from '../components/Editorial.jsx'
import Button from '../components/Button.jsx'
import Card from '../components/Card.jsx'
import { Chip } from '../components/Chip.jsx'
import { Empty } from '../components/Empty.jsx'
import DocumentUploadSheet from '../components/DocumentUploadSheet.jsx'
import { deleteDocument, listDocuments, signDocumentUrl } from '../data/documents.js'
import { formatBytes } from '../data/storage.js'
import { formatTableDate } from '../lib/eventFormat.js'
import { friendlyMessage } from '../lib/friendlyError.js'
import { useAuth } from '../lib/auth.jsx'
import { useMemberships } from '../lib/memberships.jsx'
import {
  canUploadDocuments,
  DOCUMENT_CATEGORIES,
  filterDocuments,
} from '../lib/documents.js'
import { isActiveMembership, isAdmin, isSquadStaffRole, visibleTeams } from '../lib/scope.js'

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

/**
 * The client-side mirror of who may delete a document — the uploader, an
 * admin, or staff of a squad the document targets. RLS on `documents delete`
 * is the real boundary; this only decides whether to draw the control.
 */
function mayDeleteDocument(memberships, userId, document) {
  if (!document) return false
  if (document.created_by && document.created_by === userId) return true
  if (isAdmin(memberships)) return true
  if (document.club_wide) return false
  const targetedIds = new Set((document.document_squads ?? []).map((s) => s.team_id))
  return (memberships ?? []).some(
    (m) => isActiveMembership(m) && isSquadStaffRole(m.role) && targetedIds.has(m.team_id),
  )
}

export default function Documents() {
  const { memberships, teams } = useMemberships()
  const { user } = useAuth()

  const [documents, setDocuments] = useState(null)
  const [error, setError] = useState(null)
  const [category, setCategory] = useState(ALL)
  const [teamFilter, setTeamFilter] = useState(ALL)
  const [uploadOpen, setUploadOpen] = useState(false)

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
      window.open(url, '_blank', 'noopener')
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

      <div className="flex flex-col gap-2.5">
        {shown.map((document) => {
          const canDelete = mayDeleteDocument(memberships, user?.id, document)
          return (
            <Card
              key={document.id}
              data-testid="document-row"
              className="cursor-pointer p-[14px]"
              role="button"
              tabIndex={0}
              onClick={() => handleOpen(document)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  handleOpen(document)
                }
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-[15px] font-bold text-ink">{document.title}</p>
                  <p className="mt-0.5 text-[12.5px] text-ink-muted">
                    {DOCUMENT_CATEGORIES.find((c) => c.key === document.category)?.label
                      ?? document.category}
                    {' · '}
                    {audienceLabel(document, teamsById)}
                  </p>
                  <p className="mt-1.5 text-[12px] text-ink-faint">
                    {formatBytes(document.file_size)} · {formatTableDate(new Date(document.created_at))}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  {document.staff_only && <Chip>Staff only</Chip>}
                  {canDelete && (
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation()
                        handleDelete(document)
                      }}
                      className="text-[12.5px] font-bold text-danger-ink"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
            </Card>
          )
        })}
      </div>

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
