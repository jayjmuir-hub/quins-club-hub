import { useEffect, useState } from 'react'
import Sheet from '../components/Sheet.jsx'
import Button from '../components/Button.jsx'
import AddGameForm from './AddGameForm.jsx'
import { listTournamentGames, deleteEvent, setTournamentPlacing } from '../data/events.js'
import {
  clubDateTimeInputs,
  eventDate,
  eventTitle,
  formatLongDate,
  resultOutcome,
  resultScore,
} from '../lib/eventFormat.js'

// The detail screen for a tournament CONTAINER — the counterpart to EventDetail
// for an ordinary fixture. It shows the day's setup, the games played inside it,
// and the overall placing, and it is where games are added. Schedule routes a
// container here instead of to EventDetail; a container is
// competition_type='tournament' with tournament_id null (see isTournamentEvent
// below and claude/plans/2026-08-29-tournaments-as-containers.md).
//
// ⚠️ A SEPARATE SCREEN, NOT EventDetail WITH A FLAG. A container has no single
// opponent, score, team sheet or lineup — the three EventDetail buttons that
// define that screen — and it DOES have a games list and a placing, which
// EventDetail has no room for. Threading both shapes through one file would make
// every existing EventDetail test reason about a mode it never sees.

// A starter list; a value already stored that is not in it stays selectable so
// nothing is stranded (the escape-hatch pattern the pitch/tournament pickers
// use). Free-text entry of a brand-new placing is a deliberate follow-up.
const PLACINGS = [
  'Winners',
  'Runners-up',
  'Semi-finalists',
  'Quarter-finalists',
  'Group stage',
  'Plate winners',
  'Plate runners-up',
]

// True for a tournament container: a match whose competition is a tournament and
// which is not itself a game inside another. The single source of this test, so
// Schedule and this screen cannot disagree about what a container is.
export function isTournamentEvent(event) {
  return (
    event?.type === 'match' &&
    event?.competition_type === 'tournament' &&
    !event?.tournament_id
  )
}

function gameTime(game) {
  return clubDateTimeInputs(eventDate(game)).time || 'TBD'
}

export default function TournamentDetail({
  event,
  team,
  canEdit = false,
  onClose,
  onEdit,
  onDeleted,
  // Called after a change that keeps the sheet open (placing, a game added or
  // edited) so the schedule's copy of this event re-reads. Distinct from
  // onDeleted, which also closes the sheet.
  onChanged,
  onOpenAvailability,
  onOpenGame,
}) {
  const [games, setGames] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [refreshToken, setRefreshToken] = useState(0)

  const [addingGame, setAddingGame] = useState(false)
  const [editingGame, setEditingGame] = useState(null)
  const [placingBusy, setPlacingBusy] = useState(false)
  const [placingError, setPlacingError] = useState(null)
  // Two-step inline confirm, never a native confirm() (RESTORE.md; the pattern
  // is Notices' NoticeRow). The cascade is not recoverable, so the armed state
  // names how many games go with the tournament.
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState(null)

  useEffect(() => {
    let mounted = true
    setLoading(true)
    setLoadError(null)
    listTournamentGames(event.id)
      .then((rows) => mounted && setGames(rows))
      .catch((err) => mounted && setLoadError(err))
      .finally(() => mounted && setLoading(false))
    return () => {
      mounted = false
    }
  }, [event.id, refreshToken])

  const date = eventDate(event)
  const placing = event.placing ?? ''
  const placingOptions = placing && !PLACINGS.includes(placing) ? [placing, ...PLACINGS] : PLACINGS

  async function savePlacing(next) {
    setPlacingBusy(true)
    setPlacingError(null)
    try {
      await setTournamentPlacing(event.id, next)
      // The parent re-reads so the schedule (and this sheet's event prop)
      // reflects the new placing.
      onChanged?.()
    } catch (err) {
      setPlacingError(err)
    } finally {
      setPlacingBusy(false)
    }
  }

  async function doDelete() {
    setDeleting(true)
    setDeleteError(null)
    try {
      await deleteEvent(event.id)
      onDeleted?.()
      onClose?.()
    } catch (err) {
      setDeleteError(err)
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  return (
    <Sheet open onClose={onClose} title="Tournament">
      <div className="-mx-[18px] -mt-4 mb-4 bg-[image:linear-gradient(135deg,theme(colors.brand.deep),theme(colors.brand.DEFAULT))] px-[18px] py-[22px] text-white">
        <div className="mb-3 grid h-14 w-14 place-items-center rounded-[14px] bg-white/20">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
               strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7" aria-hidden="true">
            <path d="M7 4h10v5a5 5 0 0 1-10 0V4Z" />
            <path d="M7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3" />
            <path d="M12 14v3M9 20h6M10 20l.5-3h3l.5 3" />
          </svg>
        </div>
        <h3 className="text-[22px] font-bold leading-tight">{eventTitle(event)}</h3>
        <p className="mt-1 text-sm font-semibold text-white/[.85]">
          {formatLongDate(date)}
          {date && <span className="font-normal"> · Abu Dhabi time</span>}
        </p>
      </div>

      <div className="mb-4">
        <KeyValue label="Age group">{team?.name ?? 'Not set'}</KeyValue>
        <KeyValue label="Venue">{event.venue || 'To be confirmed'}</KeyValue>
        {event.tier && <KeyValue label="Tier">{event.tier}</KeyValue>}
      </div>

      {/* Placing — the day's overall result, one line that sums up many games.
          Editable in place for staff; a read-only line otherwise. */}
      <div className="mb-4">
        <label className="mb-1.5 block text-[12.5px] font-bold uppercase tracking-[.4px] text-ink-muted" htmlFor="tournament-placing">
          Placing
        </label>
        {canEdit ? (
          <select
            id="tournament-placing"
            value={placing}
            disabled={placingBusy}
            onChange={(e) => savePlacing(e.target.value)}
            className="w-full rounded-[11px] border-[1.5px] border-line bg-surface-card px-3 py-[11px] text-[16px] text-ink outline-none transition focus:border-brand"
          >
            <option value="">Not recorded yet</option>
            {placingOptions.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        ) : (
          <p className="text-[15px] text-ink">{placing || 'Not recorded yet'}</p>
        )}
        {placingError && (
          <p role="alert" className="mt-1.5 text-[12.5px] font-semibold text-danger-ink">
            Couldn&apos;t save the placing. Try again.
          </p>
        )}
      </div>

      {onOpenAvailability && (
        <div className="mb-4">
          <Button variant="secondary" full onClick={() => onOpenAvailability(event)}>
            Touring squad &amp; availability
          </Button>
        </div>
      )}

      {/* Games — the fixtures played inside the tournament. */}
      <div className="mb-4">
        <div className="mb-2 flex items-center justify-between">
          <h4 className="text-[12.5px] font-bold uppercase tracking-[.4px] text-ink-muted">Games</h4>
          {!loading && !loadError && (
            <span className="text-[12px] text-ink-faint">
              {games.length === 0 ? 'None yet' : `${games.length} played`}
            </span>
          )}
        </div>

        {loading ? (
          <p className="text-[13px] text-ink-muted">Loading games…</p>
        ) : loadError ? (
          <p role="alert" className="rounded-[9px] bg-danger-bg px-3 py-2 text-[13px] font-semibold text-danger-ink">
            Couldn&apos;t load the games.
          </p>
        ) : games.length === 0 ? (
          <p className="rounded-[11px] border border-dashed border-line px-3 py-4 text-center text-[13px] text-ink-muted">
            No games yet. Add each one as the draw unfolds.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {games.map((game) => {
              const outcome = resultOutcome(game)
              const score = resultScore(game)
              return (
                <li key={game.id}>
                  <button
                    type="button"
                    onClick={() => (canEdit ? setEditingGame(game) : onOpenGame?.(game))}
                    className="flex w-full items-center gap-3 rounded-[11px] border border-line bg-surface-card px-3 py-2.5 text-left outline-none transition hover:border-line-strong focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand"
                  >
                    <span className="w-[42px] shrink-0 text-[12px] font-bold tabular-nums text-ink-faint">
                      {gameTime(game)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-semibold text-ink">
                        Quins vs {game.opponent || 'TBC'}
                      </span>
                      {game.stage && <span className="block text-[11.5px] text-ink-faint">{game.stage}</span>}
                    </span>
                    <span
                      className={[
                        'shrink-0 text-[14px] font-extrabold tabular-nums',
                        outcome === 'win' ? 'text-good' : outcome === 'loss' ? 'text-danger-ink' : 'text-ink-muted',
                      ].join(' ')}
                    >
                      {score ?? '—'}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}

        {canEdit && (
          <button
            type="button"
            onClick={() => setAddingGame(true)}
            className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-[11px] border-[1.5px] border-dashed border-line-strong px-3 py-2.5 text-[13.5px] font-bold text-brand-ink outline-none transition hover:bg-surface-mute focus-visible:ring-2 focus-visible:ring-brand"
          >
            ＋ Add game
          </button>
        )}
      </div>

      {canEdit && (onEdit || onDeleted) && (
        <div className="mt-5 border-t border-line pt-4">
          {onEdit && (
            <Button variant="secondary" full onClick={() => onEdit(event)} className="mb-2">
              Edit tournament
            </Button>
          )}
          {onDeleted && (
            <>
              <Button
                variant={confirmDelete ? 'danger' : 'dangerQuiet'}
                full
                disabled={deleting}
                onClick={() => (confirmDelete ? doDelete() : setConfirmDelete(true))}
              >
                {deleting
                  ? 'Deleting…'
                  : confirmDelete
                    ? `Delete the tournament and ${games.length === 1 ? 'its 1 game' : `all ${games.length} games`}`
                    : 'Delete tournament'}
              </Button>
              {confirmDelete && !deleting && (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="mt-2 w-full text-center text-[12.5px] text-ink-muted underline"
                >
                  Keep it
                </button>
              )}
              {deleteError && (
                <p role="alert" className="mt-2 text-[12.5px] font-semibold text-danger-ink">
                  Couldn&apos;t delete it. You may not have permission.
                </p>
              )}
            </>
          )}
        </div>
      )}

      {addingGame && (
        <AddGameForm
          tournament={event}
          onClose={() => setAddingGame(false)}
          onSaved={() => {
            setRefreshToken((n) => n + 1)
            onChanged?.()
          }}
        />
      )}
      {editingGame && (
        <AddGameForm
          tournament={event}
          game={editingGame}
          onClose={() => setEditingGame(null)}
          onSaved={() => {
            setRefreshToken((n) => n + 1)
            onChanged?.()
          }}
        />
      )}
    </Sheet>
  )
}

function KeyValue({ label, children }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-line py-2.5 last:border-b-0">
      <span className="text-[12.5px] font-bold uppercase tracking-[.4px] text-ink-muted">{label}</span>
      <span className="text-right text-[15px] text-ink">{children}</span>
    </div>
  )
}
