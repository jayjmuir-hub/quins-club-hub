import { useEffect, useRef, useState } from 'react'
import Sheet from '../components/Sheet.jsx'
import Spinner from '../components/Spinner.jsx'
import { listPlayers } from '../data/players.js'
import { listAvailability, setAvailability, subscribeAvailability } from '../data/availability.js'
import { useMemberships } from '../lib/memberships.jsx'
import { canEditTeam, childPlayerIds } from '../lib/scope.js'
import { initials } from '../lib/playerFormat.js'
import { eventDate, eventTitle, formatLongDate, formatTime } from '../lib/eventFormat.js'

// The availability / RSVP sheet (Task 16, design-system.md §4.23's bar +
// legend has no screen-level mockup — this is new functionality Task 16
// originates, so it borrows the app's existing card/typography/spacing
// language rather than inventing one).
//
// One list serves both purposes the brief asks for, rather than two
// screens: every player on the event's squad is shown, with a live
// in/maybe/out status. Whether a given row's status is a clickable toggle
// or a plain label is the only thing that differs by who is looking —
// a coach/admin (canEditTeam) may override ANY row, a parent/player
// (childPlayerIds) may only toggle their OWN child(ren), and everyone else
// sees a read-only status. That is `editable` below, computed per row, and
// it is what actually decides what renders — not a role check that could
// drift out of step with it. RLS's "availability write" policy is the real
// boundary; getting `editable` wrong here can only hide a control, never
// authorise a write setAvailability's own RLS-refusal handling wouldn't
// catch (see src/data/availability.js).
//
// Mounted only while an event is selected for RSVP — Schedule renders it
// conditionally from within the event detail flow — so there is no `open`
// prop to thread through, matching EventDetail's own contract.

const STATUSES = [
  { value: 'in', label: 'In' },
  { value: 'maybe', label: 'Maybe' },
  { value: 'out', label: 'Out' },
]

const STATUS_LABELS = { in: 'In', maybe: 'Maybe', out: 'Out' }

// Same tones as EventDetail's AvailabilitySummary (design-system.md §4.23),
// so a status reads the same colour whether it's seen on the summary bar or
// here on the team sheet.
const STATUS_ON = {
  in: 'border-[#2F9E4F] bg-[#eef7ee] text-[#2F7D3D]',
  maybe: 'border-[#c9861a] bg-[#fbf1dd] text-[#8a5a12]',
  out: 'border-[#d1483b] bg-[#fbeae8] text-quinsRedDark',
}
const STATUS_OFF = 'border-[#e6e3e1] bg-white text-[#5c5854] hover:bg-[#faf8fb]'

function StatusButtons({ status, disabled, onSet }) {
  return (
    <div className="flex shrink-0 gap-1.5" role="group" aria-label="Set availability">
      {STATUSES.map((option) => (
        <button
          key={option.value}
          type="button"
          disabled={disabled}
          aria-pressed={status === option.value}
          onClick={() => onSet(option.value)}
          className={[
            'rounded-[9px] border-[1.5px] px-2.5 py-1.5 text-[12.5px] font-bold transition disabled:cursor-not-allowed disabled:opacity-60',
            status === option.value ? STATUS_ON[option.value] : STATUS_OFF,
          ].join(' ')}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

function PlayerRow({ player, status, editable, saving, onSet }) {
  return (
    <li className="flex items-center justify-between gap-3 border-b border-[#e6e3e1] py-3 last:border-b-0">
      <div className="flex min-w-0 items-center gap-3">
        <span
          className="grid h-9 w-9 shrink-0 place-items-center rounded-[11px] bg-[image:linear-gradient(135deg,theme(colors.quinsRedDark),theme(colors.quinsRed))] text-[12px] font-extrabold tracking-[.5px] text-white"
          aria-hidden="true"
        >
          {initials(player.full_name)}
        </span>
        <span className="truncate text-[14.5px] font-bold text-[#221f1d]">{player.full_name}</span>
      </div>

      {editable ? (
        <StatusButtons status={status} disabled={saving} onSet={(next) => onSet(player.id, next)} />
      ) : (
        <span className="shrink-0 text-[13px] font-bold text-[#5c5854]">
          {status ? STATUS_LABELS[status] : 'No response'}
        </span>
      )}
    </li>
  )
}

export default function Availability({ event, team, onClose }) {
  const { memberships } = useMemberships()

  // Whether the signed-in user may override ANY player on this squad.
  // Asked per team through canEditTeam rather than inferred from the role,
  // so its deliberate refusal of a null/unresolvable team_id applies here
  // too — same reasoning as Schedule's/Roster's canEditSelected.
  const canOverrideAll = canEditTeam(memberships, event?.team_id)
  const myPlayerIds = new Set(childPlayerIds(memberships))

  const [players, setPlayers] = useState([])
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [reloadToken, setReloadToken] = useState(0)
  const [savingPlayerId, setSavingPlayerId] = useState(null)
  const [saveError, setSaveError] = useState(null)

  // Only the first attempt shows the spinner — a realtime RSVP re-runs this
  // effect too, and spinning then would tear the roster/tally out of the DOM
  // every time somebody else's status changed. Same settled-ref pattern as
  // EventDetail's AvailabilitySummary.
  const settledForEvent = useRef(null)

  useEffect(() => {
    let mounted = true
    if (settledForEvent.current !== event.id) setLoading(true)
    setError(null)

    Promise.all([listPlayers({ teamIds: [event.team_id] }), listAvailability(event.id)])
      .then(([playerRows, availabilityRows]) => {
        if (!mounted) return
        setPlayers(playerRows)
        setRows(availabilityRows)
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
  }, [event.id, event.team_id, reloadToken])

  // Realtime: bump the token and let the effect above refetch, same pattern
  // as AvailabilitySummary/Schedule. The callback closes over nothing but
  // setReloadToken (a stable state setter), so this subscribes exactly once
  // for the life of the sheet.
  useEffect(() => subscribeAvailability(event.id, () => setReloadToken((token) => token + 1)), [event.id])

  const statusByPlayer = new Map(rows.map((row) => [row.player_id, row.status]))

  // No-response is never a stored row — it is derived by diffing the team
  // roster against the availability rows that do exist, so a player who has
  // never responded still appears (and is still counted) without the
  // database needing a row for "nothing happened yet".
  const counts = { in: 0, maybe: 0, out: 0, none: 0 }
  players.forEach((player) => {
    const status = statusByPlayer.get(player.id)
    if (status === 'in' || status === 'maybe' || status === 'out') {
      counts[status] += 1
    } else {
      counts.none += 1
    }
  })

  function handleSet(playerId, status) {
    setSavingPlayerId(playerId)
    setSaveError(null)
    setAvailability(event.id, playerId, status)
      .then((saved) => {
        // Patch the clicked row into local state immediately on a genuine
        // success — the person who just tapped a status must see it change
        // without waiting on a realtime round-trip (which may be delayed,
        // disconnected, or never echo back to its own writer). Only applied
        // here, in the success branch, so a refused/failed write (caught
        // below) never optimistically shows a status that was never saved.
        setRows((current) => {
          const next = current.filter((row) => row.player_id !== playerId)
          next.push(saved)
          return next
        })
      })
      .catch((err) => setSaveError(err))
      .finally(() => setSavingPlayerId(null))
  }

  const date = eventDate(event)
  const isFirstLoad = loading && players.length === 0 && !error

  return (
    <Sheet open onClose={onClose} title="Availability">
      <div className="mb-4">
        <h3 className="text-[17px] font-extrabold leading-tight text-[#221f1d]">{eventTitle(event)}</h3>
        <p className="mt-1 text-[13px] font-semibold text-[#5c5854]">
          {team?.name ?? 'Age group not set'} · {formatLongDate(date)} · {formatTime(date)}
        </p>
      </div>

      {saveError && (
        <p
          role="alert"
          className="mb-3.5 rounded-[11px] bg-[#fbeae8] px-3 py-2.5 text-sm font-semibold text-quinsRedDark"
        >
          {saveError.message || "We couldn't save that RSVP. Try again."}
        </p>
      )}

      {isFirstLoad && (
        <div className="flex justify-center py-8">
          <Spinner label="Loading team sheet…" />
        </div>
      )}

      {!isFirstLoad && error && (
        <p
          role="alert"
          className="rounded-[11px] bg-[#fbeae8] px-3 py-2.5 text-sm font-semibold text-quinsRedDark"
        >
          {error.message || "We couldn't load availability. Try again."}
        </p>
      )}

      {!isFirstLoad && !error && players.length === 0 && (
        <p className="text-sm text-[#5c5854]">No players in this squad yet.</p>
      )}

      {!isFirstLoad && !error && players.length > 0 && (
        <>
          <div className="mb-4 flex flex-wrap gap-x-4 gap-y-1 text-xs font-bold text-[#5c5854]">
            <span>{counts.in} in</span>
            <span>{counts.maybe} maybe</span>
            <span>{counts.out} out</span>
            <span>{counts.none} no response</span>
          </div>

          <ul>
            {[...players]
              .sort((a, b) => a.full_name.localeCompare(b.full_name))
              .map((player) => (
                <PlayerRow
                  key={player.id}
                  player={player}
                  status={statusByPlayer.get(player.id) ?? null}
                  editable={canOverrideAll || myPlayerIds.has(player.id)}
                  saving={savingPlayerId === player.id}
                  onSet={handleSet}
                />
              ))}
          </ul>
        </>
      )}
    </Sheet>
  )
}
