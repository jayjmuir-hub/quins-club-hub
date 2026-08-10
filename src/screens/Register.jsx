import { useEffect, useRef, useState } from 'react'
import Sheet from '../components/Sheet.jsx'
import Spinner from '../components/Spinner.jsx'
import { listPlayers } from '../data/players.js'
import { listAttendance, setAttendance, ATTENDANCE_STATUSES } from '../data/attendance.js'
import { useMemberships } from '../lib/memberships.jsx'
import { canEditTeam } from '../lib/scope.js'
import { initials } from '../lib/playerFormat.js'
import { eventDate, eventTitle, formatLongDate } from '../lib/eventFormat.js'

// The register — who actually turned up.
//
// ⚠️ DELIBERATELY NOT src/screens/Availability.jsx WITH DIFFERENT WORDS, and
// the differences are the design rather than an oversight:
//
//   Availability   before the event   anyone may set their OWN child's
//   Register       after the event    only a coach may set ANYONE's
//
// So there is no per-row `editable`: either the whole sheet is writable
// (canEditTeam) or it is read-only. A parent must never mark their own child
// present — the entire value of the number is that somebody else recorded it —
// which is why `is_own_player` appears in the attendance READ policy and in no
// write policy. See db/migrations/20260810_attendance.sql.
//
// ⚠️ NO REALTIME SUBSCRIPTION, unlike the availability sheet. A register is
// taken once, by one person standing on a pitch, and the refetch-on-change
// machinery exists there because a squad of parents RSVP concurrently. Adding
// it here would be cost with no case behind it — and a register that
// re-sorted itself under a coach's thumb mid-tap would be actively worse.
//
// ⚠️ NOT GATED ON `FEATURES.availability`. Attendance is a separate feature
// from RSVP, and Jay's 10 Aug ruling was to ship it INSTEAD of turning RSVP
// on. Wiring it to that flag would switch the two on together, which is
// exactly what the ruling declined.

const STATUSES = [
  { value: 'present', label: 'Present' },
  { value: 'absent', label: 'Absent' },
  // ⚠️ Not politeness. The attendance percentage is present/(present+absent)
  // with this excluded from BOTH sides, so a player away injured or on holiday
  // is not ranked as uncommitted. The label says "Excused" rather than
  // "Away" because it is a judgement a coach is making, not a fact about a
  // diary.
  { value: 'excused', label: 'Excused' },
]

const STATUS_ON = {
  present: 'border-accent-mid bg-accent-bg text-accent-ink',
  absent: 'border-danger bg-danger-bg text-brand-deep',
  excused: 'border-warn bg-warn-bg text-warn-ink',
}
const STATUS_OFF = 'border-line bg-surface-card text-ink-muted hover:bg-surface-mute'

function StatusButtons({ status, disabled, onSet }) {
  return (
    <div className="flex shrink-0 gap-1.5" role="group" aria-label="Record attendance">
      {STATUSES.map((option) => (
        <button
          key={option.value}
          type="button"
          disabled={disabled}
          aria-pressed={status === option.value}
          onClick={() => onSet(option.value)}
          className={[
            'rounded-[9px] border-[1.5px] px-2.5 py-1.5 text-xs font-bold transition',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1',
            'disabled:cursor-not-allowed disabled:opacity-60',
            status === option.value ? STATUS_ON[option.value] : STATUS_OFF,
          ].join(' ')}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

export default function Register({ event, team, onClose }) {
  const { memberships } = useMemberships()
  const canEdit = canEditTeam(memberships, event?.team_id)

  const [players, setPlayers] = useState([])
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [savingPlayerId, setSavingPlayerId] = useState(null)
  const [saveError, setSaveError] = useState(null)

  const settledForEvent = useRef(null)

  useEffect(() => {
    let mounted = true
    if (settledForEvent.current !== event.id) setLoading(true)
    setError(null)

    Promise.all([listPlayers({ teamIds: [event.team_id] }), listAttendance(event.id)])
      .then(([playerRows, attendanceRows]) => {
        if (!mounted) return
        setPlayers(playerRows)
        setRows(attendanceRows)
      })
      .catch((err) => {
        if (!mounted) return
        setError(err)
        setPlayers([])
        setRows([])
      })
      .finally(() => {
        if (!mounted) return
        setLoading(false)
        settledForEvent.current = event.id
      })

    return () => {
      mounted = false
    }
  }, [event.id, event.team_id])

  const statusByPlayer = new Map(rows.map((row) => [row.player_id, row.status]))

  // ⚠️ "NOT RECORDED" IS NEVER A STORED ROW. It is the absence of one, derived
  // by diffing the squad against the attendance rows that exist — the same
  // shape the availability sheet uses for "no response". It matters more here:
  // "not recorded" and "absent" are different facts, and a register that
  // silently defaulted everyone to absent would manufacture absences for every
  // session a coach forgot to take.
  const counts = { present: 0, absent: 0, excused: 0, none: 0 }
  players.forEach((player) => {
    const status = statusByPlayer.get(player.id)
    if (ATTENDANCE_STATUSES.includes(status)) counts[status] += 1
    else counts.none += 1
  })

  function applySaved(saved) {
    setRows((current) => {
      const next = current.filter((row) => row.player_id !== saved.player_id)
      next.push(saved)
      return next
    })
  }

  function handleSet(playerId, status) {
    setSavingPlayerId(playerId)
    setSaveError(null)
    setAttendance(event.id, playerId, status)
      // Patch the clicked row in on a genuine success only, so a refused write
      // never optimistically shows a status that was never saved. There is no
      // realtime echo here to correct it later.
      .then(applySaved)
      .catch((err) => setSaveError(err))
      .finally(() => setSavingPlayerId(null))
  }

  // ⚠️ THE ONE AFFORDANCE THAT MAKES THIS USABLE ON A TOUCHLINE. The common
  // case is that nearly everyone turned up, so a coach otherwise taps twenty-
  // five times to record "the usual". This marks only the players with NO
  // record yet — it never overwrites a decision already made, so a coach who
  // has marked two absences first can then sweep the rest without undoing
  // their own work.
  const [sweeping, setSweeping] = useState(false)
  function markRemainingPresent() {
    const remaining = players.filter((player) => !statusByPlayer.has(player.id))
    if (remaining.length === 0) return
    setSweeping(true)
    setSaveError(null)
    // Sequential, not Promise.all: these are writes against one table under
    // RLS, and a failure halfway through should leave the earlier ones saved
    // and say so, rather than firing twenty-five concurrent requests whose
    // partial failure is unreportable.
    remaining
      .reduce(
        (chain, player) =>
          chain.then(() => setAttendance(event.id, player.id, 'present').then(applySaved)),
        Promise.resolve(),
      )
      .catch((err) => setSaveError(err))
      .finally(() => setSweeping(false))
  }

  const date = eventDate(event)
  const busy = sweeping || savingPlayerId != null

  return (
    <Sheet open onClose={onClose} title="Register">
      <div className="mb-4">
        <h3 className="text-base font-extrabold text-ink">{eventTitle(event)}</h3>
        <p className="mt-0.5 text-sm text-ink-faint">
          {team?.name ? `${team.name} · ` : ''}
          {date ? formatLongDate(date) : 'Date unknown'}
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-10">
          <Spinner label="Loading the register…" />
        </div>
      ) : error ? (
        <p role="alert" className="rounded-[11px] bg-danger-bg px-3 py-2 text-sm font-semibold text-brand-deep">
          {error.message || "We couldn't load the register. Try again."}
        </p>
      ) : players.length === 0 ? (
        <p className="py-8 text-center text-sm text-ink-faint">
          There are no players in this squad yet.
        </p>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs font-bold uppercase tracking-[0.06em] text-ink-muted">
              {counts.present} present · {counts.absent} absent · {counts.excused} excused
              {counts.none > 0 ? ` · ${counts.none} not recorded` : ''}
            </p>
            {canEdit && counts.none > 0 && (
              <button
                type="button"
                onClick={markRemainingPresent}
                disabled={busy}
                className="rounded-[9px] border-[1.5px] border-line bg-surface-card px-3 py-1.5 text-xs font-bold text-ink transition hover:bg-surface-mute focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:cursor-not-allowed disabled:opacity-60"
              >
                {sweeping ? 'Marking…' : `Mark remaining ${counts.none} present`}
              </button>
            )}
          </div>

          {saveError && (
            <p role="alert" className="mb-3 rounded-[11px] bg-danger-bg px-3 py-2 text-sm font-semibold text-brand-deep">
              {saveError.message || "We couldn't save that. Try again."}
            </p>
          )}

          {!canEdit && (
            // A parent reaching this sheet sees only their own child, because
            // `attendance read` is is_own_player for them. Saying so stops the
            // short list reading as a bug.
            <p className="mb-3 text-xs text-ink-faint">
              Only a coach can record attendance. You can see your own child’s record here.
            </p>
          )}

          <ul className="divide-y divide-line">
            {players.map((player) => {
              const status = statusByPlayer.get(player.id)
              return (
                <li key={player.id} data-testid="register-row" className="flex items-center gap-3 py-2.5">
                  <span
                    aria-hidden="true"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-sunk text-xs font-extrabold text-ink-muted"
                  >
                    {initials(player.full_name)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-bold text-ink">
                    {player.full_name}
                  </span>
                  {canEdit ? (
                    <StatusButtons
                      status={status}
                      disabled={busy}
                      onSet={(next) => handleSet(player.id, next)}
                    />
                  ) : (
                    <span className="shrink-0 text-xs font-bold text-ink-muted">
                      {status ? STATUSES.find((s) => s.value === status)?.label : 'Not recorded'}
                    </span>
                  )}
                </li>
              )
            })}
          </ul>
        </>
      )}
    </Sheet>
  )
}
