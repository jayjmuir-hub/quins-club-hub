import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import Button from '../components/Button.jsx'
import Card from '../components/Card.jsx'
import Spinner from '../components/Spinner.jsx'
import crest from '../assets/crest.png'
import { getEvent } from '../data/events.js'
import { listPlayers } from '../data/players.js'
import { listAvailability } from '../data/availability.js'
import { createLineup, listLineups, saveLineupPlayers, updateLineup } from '../data/lineups.js'
import { listPlayerGrades, listPlayerPositions } from '../data/playerTiers.js'
import { useMemberships } from '../lib/memberships.jsx'
import useUnsavedChanges from '../lib/useUnsavedChanges.js'
import { canEditTeam } from '../lib/scope.js'
import { TIER_OK, tierEligibility } from '../lib/tierEligibility.js'
import { rosterFormat, slotLabel } from '../lib/rosterFormats.js'
import { formatOf } from '../lib/fixtureFormat.js'
import { useDragReorder } from '../lib/useDragReorder.js'
import PitchDiagram from '../components/PitchDiagram.jsx'
import {
  eventDate,
  eventTimeLabel,
  eventTitle,
  formatLongDate,
  venueLine,
} from '../lib/eventFormat.js'
import { shareElementAsImage } from '../lib/shareImage.js'
import { friendlyMessage } from '../lib/friendlyError.js'

// Picking a team, and sharing it — three VIEWS over one lineup since 25 Aug
// 2026 (claude/plans/2026-08-25-roster-builder-three-views.md): Quick is the
// 14 Aug tap flow unchanged, Slots adds shirt numbers and drag-to-reorder,
// Pitch lays the same roster out on a field. One state, one save, one share.
// Phase 2 (same day): the pitch is drawn by components/PitchDiagram.jsx for
// two customers — this screen's interactive view (which also gained
// drag-a-circle-onto-another) and the share facsimile's pitch-style sheet,
// chosen by the Sheet style toggle and remembered per device.
//
// ⚠️ COACH-ONLY, AND THAT IS A PRODUCT DECISION RATHER THAN A STUB (Jay, 14 Aug
// 2026). Parents get the lineup as a WhatsApp image; the app shows it to nobody
// else. That adds no new place where one family can read about another family's
// child. The database agrees — the `lineup manage` policy is
// private.can_edit_team — so this screen's own gate only decides what to OFFER.
//
// ⚠️ DRAG IS BACK, AND THE 14 AUG "NOT DRAG AND DROP" RULING IS SUPERSEDED —
// re-opened by Jay, answered objection by objection in
// claude/decisions/2026-08-25-drag-reopened.md. The short version: pointer
// events not HTML5 drag, ~120 in-repo lines not a 30KB library, and the tap
// path remains everywhere as the accessible route — drag calls the same state
// transitions taps do.
//
// ⚠️ THE SLOT MODEL IS SPARSE. `slotted` is an array of player ids and nulls
// whose INDEX is the shirt number minus one — a coach filling the pitch picks
// the full-back before the props, so slot 15 must be fillable while 1–14 are
// empty. Quick view simply shows the non-null entries in order, which is why
// every 14 Aug test passes untouched. sort_order on save is the slot index,
// so the share image and MatchSheet inherit shirt order for free.

const ROLE_STARTER = 'starter'
const ROLE_REPLACEMENT = 'replacement'

// ⚠️ THE ORDER IS THE POINT. A coach picks from who said yes, then works down.
// `out` is last and collapsed, because picking somebody who said no is allowed
// (Jay asked for it) but should never be the easy accident.
const AVAILABILITY_GROUPS = [
  { key: 'in', label: 'Available', tone: 'text-accent-ink' },
  { key: 'maybe', label: 'Maybe', tone: 'text-warn-ink' },
  { key: 'none', label: 'No response', tone: 'text-ink-muted' },
  { key: 'out', label: 'Not available', tone: 'text-danger-ink' },
]

const STATUS_CHIP = {
  in: null, // the expected case says nothing
  maybe: { label: 'Maybe', className: 'bg-warn-bg text-warn-ink' },
  none: { label: 'No response', className: 'bg-surface-mute text-ink-muted' },
  out: { label: 'Said no', className: 'bg-danger-bg text-danger-ink' },
}

// ⚠️ A GUIDE, NOT A GATE. See the migration's comment on players_per_side: the
// count warns when it is over, and never refuses. Coaches over-pick then cut.
// 5 joined the set on 25 Aug with the format presets — minis tag.
const SIDE_SIZES = [5, 7, 9, 10, 12, 13, 15]

const VIEWS = [
  { key: 'quick', label: 'Quick' },
  { key: 'slots', label: 'Slots' },
  { key: 'pitch', label: 'Pitch' },
]

const VIEW_STORAGE_KEY = 'lineup-view'
const SHEET_STYLE_STORAGE_KEY = 'lineup-sheet-style'

/** availability rows -> { [playerId]: 'in'|'maybe'|'out' }. */
function statusMap(rows) {
  const map = new Map()
  for (const row of rows ?? []) map.set(row.player_id, row.status)
  return map
}

function StatusChip({ status }) {
  const chip = STATUS_CHIP[status ?? 'none']
  if (!chip) return null
  return (
    <span className={`shrink-0 rounded-tab px-[7px] py-[2px] text-[11px] font-bold ${chip.className}`}>
      {chip.label}
    </span>
  )
}

/**
 * The grade-against-tier warning, or nothing at all.
 *
 * ⚠️ A SECOND LINE UNDER THE NAME, NOT A CHIP IN THE ROW. The row already carries
 * a status chip and two buttons and there is no width left on a phone; this also
 * needs a sentence rather than two words, which is the other half of why a chip is
 * wrong here.
 *
 * ⚠️ THE GRADE LETTER APPEARS ONLY WHERE THERE IS A MISMATCH — Jay's call, 17 Aug
 * 2026, over badging every row the way the coach Roster does. The letter is an
 * ability judgement about a child and this screen gets held up pitch-side with
 * parents standing next to it. Where it earns its place it explains the warning;
 * everywhere else it is a label on a child for no reason.
 *
 * ⚠️ NOT role="alert". One per row would announce a dozen alerts on load; as plain
 * text a screen reader reads it in row order, next to the name it belongs to.
 */
function TierWarning({ fixtureTier, grade }) {
  const { status, message } = tierEligibility(fixtureTier, grade)
  if (status === TIER_OK) return null
  return (
    <p className="mt-0.5 text-[12px] font-semibold leading-snug text-warn-ink">{message}</p>
  )
}

function PickedRow({ player, status, fixtureTier, grade, onRemove, onToggleRole }) {
  return (
    <li className="border-b border-line py-2 last:border-b-0">
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-[14.5px] font-bold text-ink">
          {player.full_name}
        </span>
        {/* ⚠️ THE WARNING IS ON THE PICKED ROW, NOT ONLY IN THE POOL. Once somebody
            is in the team the pool is scrolled away, and "did I pick anyone who
            said no?" is exactly the question a coach asks at the end. */}
        <StatusChip status={status} />
        <button
          type="button"
          onClick={onToggleRole}
          className="shrink-0 rounded-[8px] px-2 min-h-[44px] py-1 text-[12px] font-boldtext-brand-ink hover:bg-surface-mute"
        >
          {player.role === ROLE_STARTER ? '→ Bench' : '→ Start'}
        </button>
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${player.full_name}`}
          className="shrink-0 rounded-[8px] px-2 min-h-[44px] py-1 text-[12px] font-boldtext-ink-muted hover:bg-surface-mute"
        >
          Remove
        </button>
      </div>
      {/* ⚠️ UNDER THE WHOLE ROW, NOT INSIDE THE NAME'S COLUMN — AND THE NUMBERS ARE
          THE REASON. Measured in a real browser at 375px: sharing the flex-1 column
          with the status chip and both buttons left the sentence 122px wide, wrapped
          it to FOUR lines and made the row 108px tall against a 42px unwarned
          baseline. Full width gives it 322px, one line, 62px. ⚠️ jsdom CANNOT SEE
          EITHER NUMBER — every assertion in the suite passed on the 108px version —
          so do not "tidy" this back inside the flex row. A structural test in
          tests/lineup-eligibility.test.jsx stands guard in jsdom's place. */}
      <TierWarning fixtureTier={fixtureTier} grade={grade} />
    </li>
  )
}

export default function Lineup() {
  const { eventId } = useParams()
  const navigate = useNavigate()
  const { memberships, teams } = useMemberships()

  const [event, setEvent] = useState(null)
  const [players, setPlayers] = useState([])
  const [statuses, setStatuses] = useState(() => new Map())
  // player_id -> { player_id, tier, note }. Empty is the normal case, not a
  // failure — see listPlayerGrades.
  const [grades, setGrades] = useState(() => new Map())
  const [lineupId, setLineupId] = useState(null)
  // The sparse slot model — see the header. slotted[i] is shirt i+1 or null.
  const [slotted, setSlotted] = useState([])
  // Replacement player ids, in bench order.
  const [reps, setReps] = useState([])
  const [perSide, setPerSide] = useState(null)
  const [squadSize, setSquadSize] = useState(null)
  const [notes, setNotes] = useState('')
  const [showOut, setShowOut] = useState(false)

  // Which of the three views. Remembered per device — a coach who lives in
  // Pitch should land back in Pitch — but Quick is the default and the
  // fallback, because it is the view with no prerequisites.
  const [view, setView] = useState(() => {
    try {
      const stored = window.localStorage.getItem(VIEW_STORAGE_KEY)
      return VIEWS.some((candidate) => candidate.key === stored) ? stored : 'quick'
    } catch {
      return 'quick'
    }
  })
  // The slot a coach is filling (tap an empty slot or circle, then tap a
  // player). Belongs to the slots and pitch views; quick never sets it.
  const [pendingSlot, setPendingSlot] = useState(null)
  // A filled pitch circle that has been tapped, awaiting a second tap (swap)
  // or an action button (bench / remove).
  const [selectedSlot, setSelectedSlot] = useState(null)
  // What the SHARED IMAGE looks like: the two-column list, or the pitch
  // graphic above it. Remembered per device like the view; 'list' is the
  // default because it needs no format to make sense.
  const [sheetStyle, setSheetStyle] = useState(() => {
    try {
      return window.localStorage.getItem(SHEET_STYLE_STORAGE_KEY) === 'pitch' ? 'pitch' : 'list'
    } catch {
      return 'list'
    }
  })

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [sharing, setSharing] = useState(false)
  const [error, setError] = useState(null)
  const [saved, setSaved] = useState(false)
  // ── Unsaved work ────────────────────────────────────────────────────────
  //
  // `saved` says "the last save succeeded"; `dirty` says "something changed
  // since". They are not each other's opposite: a fresh screen is neither.
  // Every edit site calls markEdited() — found by the 2 Sep 2026 UX review,
  // when Save sat at the foot of the whole squad list and Back was a bare
  // navigate(-1), so a coach who had placed fifteen shirts and swiped back
  // lost the lot. claude/plans/2026-09-02-ux-unsaved-work.md, Task 3.
  //
  // ⚠️ NOT AUTOSAVED, ON PURPOSE: save() creates the lineup row on first Save
  // so that "did anyone pick a team?" stays answerable. The dock and sidebar
  // are still an unguarded exit — the plan records that gap.
  const [dirty, setDirty] = useState(false)
  const [confirmingLeave, setConfirmingLeave] = useState(false)
  useUnsavedChanges(dirty && !saving)
  function markEdited() {
    setSaved(false)
    setDirty(true)
  }
  const shareRef = useRef(null)

  useEffect(() => {
    let mounted = true
    setLoading(true)
    Promise.all([getEvent(eventId), listLineups(eventId)])
      .then(async ([eventRow, lineups]) => {
        if (!mounted) return
        setEvent(eventRow)
        const [playerRows, availabilityRows] = await Promise.all([
          listPlayers({ teamIds: eventRow?.team_id ? [eventRow.team_id] : [] }),
          listAvailability(eventId),
        ])
        if (!mounted) return
        // Positions moved off the players row into staff-only player_positions
        // (25 Aug 2026). This screen is staff-run, so decorate each row with
        // the primary the way Roster does — saveLineupPlayers snapshots
        // player.position into the sheet. Swallowed like grades below: a
        // lineup without positions is still a lineup.
        const positionRows = await listPlayerPositions(playerRows.map((p) => p.id)).catch(
          () => new Map(),
        )
        if (!mounted) return
        setPlayers(playerRows.map((p) => ({ ...p, position: positionRows.get(p.id)?.[0] ?? null })))
        setStatuses(statusMap(availabilityRows))

        // ⚠️ ITS FAILURE IS SWALLOWED, UNLIKE EVERYTHING ELSE ON THIS SCREEN, AND
        // THAT IS THE POINT. Picking a team is the job; a grade is decoration on
        // top of it. `player_grades` is coach-only, and playerTiers.js warns that
        // an empty read is the NORMAL case rather than a failure — so a refusal
        // here must leave the lineup loading, saving and sharing exactly as it
        // would have, not raise the screen's error banner over a missing warning.
        // Awaited rather than left floating so there is no second render in which
        // the warnings are absent; the catch is what stops the await mattering.
        const gradeRows = await listPlayerGrades(playerRows.map((p) => p.id)).catch(
          () => new Map(),
        )
        if (!mounted) return
        setGrades(gradeRows)

        // ⚠️ THE FIRST lineup, not "the" lineup — event_id is deliberately not
        // unique (see the migration). This screen edits one; a tournament day
        // with several is what that decision leaves room for.
        const existing = lineups[0]
        if (existing) {
          setLineupId(existing.id)
          setPerSide(existing.players_per_side ?? null)
          setSquadSize(existing.squad_size ?? null)
          setNotes(existing.notes ?? '')
          // Starters land at their sort_order INDEX — pre-slot lineups were
          // dense 0..n so they load exactly as they used to; slotted ones come
          // back with their holes intact.
          const nextSlots = []
          const nextReps = []
          for (const row of [...(existing.lineup_players ?? [])].sort(
            (a, b) => a.sort_order - b.sort_order,
          )) {
            if (row.role === ROLE_REPLACEMENT) {
              nextReps.push(row.player_id)
            } else {
              const at = Number.isInteger(row.sort_order) && row.sort_order >= 0
                ? row.sort_order
                : nextSlots.length
              while (nextSlots.length < at) nextSlots.push(null)
              nextSlots[at] = row.player_id
            }
          }
          setSlotted(nextSlots)
          setReps(nextReps)
        } else {
          // ⚠️ A NEW LINEUP OPENS AT THE FIXTURE'S FORMAT (2 Sep 2026) — 7 for
          // a 7s tournament, 15 for a league match or an unstated one. Still a
          // GUIDE, NOT A GATE: the coach can change it, and an existing lineup
          // above keeps whatever it was saved with. src/lib/fixtureFormat.js.
          setPerSide(formatOf(eventRow))
        }
      })
      .catch((failure) => {
        if (mounted) setError(failure)
      })
      .finally(() => {
        if (mounted) setLoading(false)
      })
    return () => {
      mounted = false
    }
  }, [eventId])

  const playersById = useMemo(() => new Map(players.map((p) => [p.id, p])), [players])

  const format = rosterFormat(perSide)
  // How many slot rows the slots and pitch views draw: the format's size, or
  // however far the sparse array already reaches — over-picking never hides
  // anyone (guide, not gate).
  const slotCount = Math.max(perSide ?? 0, slotted.length)

  // Quick view's world: the non-null starters in slot order. Everything the
  // 14 Aug screen derived from `picked` derives from these two.
  const starters = useMemo(
    () =>
      slotted
        .map((playerId, index) => (playerId ? { player_id: playerId, role: ROLE_STARTER, slot: index } : null))
        .filter(Boolean),
    [slotted],
  )
  const bench = useMemo(
    () => reps.map((playerId) => ({ player_id: playerId, role: ROLE_REPLACEMENT })),
    [reps],
  )
  const picked = useMemo(() => [...starters, ...bench], [starters, bench])
  const pickedIds = useMemo(() => new Set(picked.map((p) => p.player_id)), [picked])

  const canEdit = canEditTeam(memberships, event?.team_id)
  const team = teams.find((t) => t.id === event?.team_id)

  const overPicked = perSide != null && starters.length > perSide
  const overSquad = squadSize != null && picked.length > squadSize

  // The pool, grouped, with everyone already picked removed.
  const pool = useMemo(() => {
    const groups = { in: [], maybe: [], none: [], out: [] }
    for (const player of players) {
      if (pickedIds.has(player.id)) continue
      const status = statuses.get(player.id)
      groups[status === 'in' || status === 'maybe' || status === 'out' ? status : 'none'].push(player)
    }
    for (const key of Object.keys(groups)) {
      groups[key].sort((a, b) => a.full_name.localeCompare(b.full_name))
    }
    return groups
  }, [players, pickedIds, statuses])

  function switchView(next) {
    setView(next)
    setPendingSlot(null)
    setSelectedSlot(null)
    try {
      window.localStorage.setItem(VIEW_STORAGE_KEY, next)
    } catch {
      // Private browsing: the toggle still works, it just isn't remembered.
    }
  }

  function switchSheetStyle(next) {
    setSheetStyle(next)
    try {
      window.localStorage.setItem(SHEET_STYLE_STORAGE_KEY, next)
    } catch {
      // Private browsing: the toggle still works, it just isn't remembered.
    }
  }

  function firstFreeSlot(current) {
    const horizon = Math.max(perSide ?? 0, current.length)
    for (let i = 0; i < horizon; i += 1) {
      if (!current[i]) return i
    }
    return horizon
  }

  function placeInSlot(current, index, playerId) {
    const next = [...current]
    while (next.length <= index) next.push(null)
    next[index] = playerId
    return next
  }

  function add(playerId, role, slotIndex = null) {
    markEdited()
    if (role === ROLE_REPLACEMENT) {
      setReps((current) => [...current, playerId])
    } else {
      setSlotted((current) =>
        placeInSlot(current, slotIndex ?? firstFreeSlot(current), playerId),
      )
    }
    setPendingSlot(null)
  }

  function remove(playerId) {
    markEdited()
    setSlotted((current) => current.map((id) => (id === playerId ? null : id)))
    setReps((current) => current.filter((id) => id !== playerId))
    setSelectedSlot(null)
  }

  function toggleRole(playerId) {
    markEdited()
    if (reps.includes(playerId)) {
      setReps((current) => current.filter((id) => id !== playerId))
      setSlotted((current) => placeInSlot(current, firstFreeSlot(current), playerId))
    } else {
      setSlotted((current) => current.map((id) => (id === playerId ? null : id)))
      setReps((current) => [...current, playerId])
    }
    setSelectedSlot(null)
  }

  // Drag lands here: splice the full slot array — empty slots move too, which
  // is what "shove everyone down one" means on a team sheet.
  function moveSlot(from, to) {
    markEdited()
    setSlotted((current) => {
      const next = [...current]
      while (next.length < slotCount) next.push(null)
      const [row] = next.splice(from, 1)
      next.splice(to, 0, row ?? null)
      return next
    })
  }

  function swapSlots(a, b) {
    markEdited()
    setSlotted((current) => {
      const next = [...current]
      while (next.length <= Math.max(a, b)) next.push(null)
      ;[next[a], next[b]] = [next[b], next[a]]
      return next
    })
    setSelectedSlot(null)
  }

  // Pitch circle TAPS — the phase-1 logic verbatim, now fed by PitchDiagram
  // (a tap is a drag that never travelled; see the component's header).
  function handlePitchCircle(index) {
    const playerId = slotted[index] ?? null
    if (!playerId) {
      setSelectedSlot(null)
      setPendingSlot((current) => (current === index ? null : index))
      return
    }
    setPendingSlot(null)
    if (selectedSlot == null) {
      setSelectedSlot(index)
    } else if (selectedSlot === index) {
      setSelectedSlot(null)
    } else {
      swapSlots(selectedSlot, index)
    }
  }

  // Pitch circle DRAGS: released onto a filled circle swaps, onto an empty
  // one moves — the same two outcomes the tap path already has, so drag adds
  // a gesture and no new state transition.
  function movePitchCircle(from, to) {
    markEdited()
    setSelectedSlot(null)
    setPendingSlot(null)
    if (slotted[to]) {
      swapSlots(from, to)
      return
    }
    setSlotted((current) => {
      const next = [...current]
      while (next.length <= Math.max(from, to)) next.push(null)
      next[to] = next[from]
      next[from] = null
      return next
    })
  }

  const { handleProps, rowRef, dragIndex, overIndex, dragOffset } = useDragReorder(
    slotCount,
    moveSlot,
  )

  async function save() {
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      // ⚠️ THE ROW IS CREATED ON FIRST SAVE, NOT ON MOUNT. Creating it when the
      // screen opens would write a lineup for every fixture a coach merely
      // looked at, and "did anyone pick a team?" would stop being answerable.
      let id = lineupId
      if (!id) {
        const created = await createLineup({
          eventId,
          playersPerSide: perSide,
          squadSize,
          notes: notes.trim() || null,
        })
        id = created.id
        setLineupId(id)
      } else {
        await updateLineup(id, { playersPerSide: perSide, squadSize, notes: notes.trim() || null })
      }
      // sort_order IS the slot index for starters — holes and all — so the
      // shirt a coach placed somebody at survives the round trip. Positions
      // come from the format preset and are a guide (rosterFormats.js).
      const rows = []
      slotted.forEach((playerId, index) => {
        if (!playerId) return
        rows.push({
          player_id: playerId,
          role: ROLE_STARTER,
          position: format?.positions?.[index] ?? null,
          sort_order: index,
        })
      })
      reps.forEach((playerId, index) => {
        rows.push({
          player_id: playerId,
          role: ROLE_REPLACEMENT,
          position: null,
          sort_order: slotCount + index,
        })
      })
      await saveLineupPlayers(id, rows)
      setSaved(true)
      setDirty(false)
    } catch (failure) {
      setError(failure)
    } finally {
      setSaving(false)
    }
  }

  async function share() {
    setSharing(true)
    setError(null)
    try {
      await shareElementAsImage(shareRef.current, {
        filename: `lineup-${eventId}.png`,
        title: 'Team sheet',
      })
    } catch (failure) {
      setError(failure)
    } finally {
      setSharing(false)
    }
  }

  if (loading) {
    return (
      <section>
        <Card className="flex justify-center py-10">
          <Spinner label="Loading the squad…" />
        </Card>
      </section>
    )
  }

  // Defensive, like every other screen reachable by a pasted URL. The database
  // is the boundary; this is a message rather than a control.
  if (!canEdit) {
    return (
      <section>
        <Card className="p-6">
          <p role="alert" className="text-sm text-ink">
            You can&apos;t pick the team for this fixture. Ask a club admin if that looks wrong.
          </p>
        </Card>
      </section>
    )
  }

  const date = eventDate(event)
  const pendingPlayerLabel =
    pendingSlot != null ? slotLabel(format, pendingSlot) : null

  /* The pool card — shared by all three views. In quick view its buttons are
     Start/Bench; while a slot is pending (slots and pitch views) the primary
     button targets that exact slot instead. */
  const poolCard = (
    <>
      {/* ⚠️ "Still to pick", NOT "Squad" — Jay, 14 Aug 2026, having picked all
          four U16B players and asked what the empty section was for. "Squad"
          reads as THE SQUAD (the whole roster), so an empty one looks like the
          roster failed to load. This list is the players NOT yet picked, and the
          heading now says so. */}
      <h3 className="mb-2 text-[13px] font-extrabold uppercase tracking-[.8px] text-ink-muted">
        Still to pick
      </h3>
      <Card className="mb-3 px-[14px] py-2">
        {/* ⚠️ AN EXPLICIT EMPTY STATE, because a heading over an empty card reads
            as broken — the same defect as the orphaned timezone note on the event
            form earlier today, and jsdom cannot see either.
            ⚠️ TWO DIFFERENT EMPTINESSES, said differently. "Everyone is picked"
            is success; "this squad has no players" is a job for an admin, and
            telling somebody the first when the second is true would send them
            looking for a bug that is really a roster gap. */}
        {players.length === 0 ? (
          <p className="py-3 text-[13px] leading-relaxed text-ink-muted">
            There are no players in {team?.name ?? 'this squad'} yet. An admin adds them on
            the Roster screen.
          </p>
        ) : picked.length === players.length ? (
          <p className="py-3 text-[13px] leading-relaxed text-ink-muted">
            Everyone in this squad is in the team — all {players.length}. Remove somebody
            above to put them back here.
          </p>
        ) : null}
        {AVAILABILITY_GROUPS.map((group) => {
          const list = pool[group.key]
          if (list.length === 0) return null
          // ⚠️ "Not available" IS COLLAPSED, NOT ABSENT. Jay asked explicitly for
          // the option to pick somebody who has not marked themselves available;
          // hiding them outright would be the app overruling the coach.
          if (group.key === 'out' && !showOut) {
            return (
              <button
                key={group.key}
                type="button"
                onClick={() => setShowOut(true)}
                className="my-2 text-[13px] font-bold text-brand-ink"
              >
                Show {list.length} who said no
              </button>
            )
          }
          return (
            <div key={group.key} className="py-1.5">
              <p className={`mb-1 text-[11.5px] font-bold uppercase tracking-[.6px] ${group.tone}`}>
                {group.label} — {list.length}
              </p>
              <ul>
                {list.map((player) => (
                  <li key={player.id} className="border-b border-line py-2 last:border-b-0">
                    <div className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate text-[14.5px] text-ink">
                        {player.full_name}
                      </span>
                      {pendingSlot != null ? (
                        <button
                          type="button"
                          onClick={() => add(player.id, ROLE_STARTER, pendingSlot)}
                          aria-label={`Give shirt ${pendingSlot + 1} to ${player.full_name}`}
                          className="shrink-0 rounded-[8px] border-[1.5px] border-brand px-2.5 min-h-[44px] py-1 text-[12px] font-boldtext-brand-ink hover:bg-surface-mute"
                        >
                          Shirt {pendingSlot + 1}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => add(player.id, ROLE_STARTER)}
                          className="shrink-0 rounded-[8px] border-[1.5px] border-line px-2.5 min-h-[44px] py-1 text-[12px] font-boldtext-ink hover:bg-surface-mute"
                        >
                          Start
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => add(player.id, ROLE_REPLACEMENT)}
                        className="shrink-0 rounded-[8px] border-[1.5px] border-line px-2.5 min-h-[44px] py-1 text-[12px] font-boldtext-ink hover:bg-surface-mute"
                      >
                        Bench
                      </button>
                    </div>
                    {/* ⚠️ THE WARNING IS HERE AS WELL AS ON THE PICKED ROWS, for the
                        reason StatusChip already gives above: the pool is where the
                        choice is MADE, and the picked list is where it is reviewed. A
                        warning in only one of the two either arrives too late or is
                        never re-read.
                        ⚠️ AND IT SITS UNDER THE ROW, NOT IN THE NAME'S COLUMN — see
                        PickedRow for the measurements that decided that. */}
                    <TierWarning
                      fixtureTier={event?.tier}
                      grade={grades.get(player.id)?.tier}
                    />
                  </li>
                ))}
              </ul>
            </div>
          )
        })}
      </Card>
    </>
  )

  const replacementsCard = (
    <>
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="text-[13px] font-extrabold uppercase tracking-[.8px] text-ink-muted">
          Replacements — {bench.length}
        </h3>
        {/* ⚠️ THE SQUAD TOTAL IS COUNTED HERE, against ALL picked players rather
            than against the bench, because that is what the number means —
            starters plus replacements. Shown beside Replacements because this is
            where the total is finally reached. */}
        {squadSize != null && (
          <span
            className={`text-[12px] font-bold ${overSquad ? 'text-warn-ink' : 'text-ink-muted'}`}
          >
            {picked.length} of {squadSize} in the squad
            {overSquad ? ` — ${picked.length - squadSize} over` : ''}
          </span>
        )}
      </div>
      <Card className="mb-3 px-[14px] py-1">
        {bench.length === 0 ? (
          <p className="py-3 text-[13px] text-ink-muted">No replacements yet.</p>
        ) : (
          <ul>
            {bench.map((p) => (
              <PickedRow
                key={p.player_id}
                player={{ ...playersById.get(p.player_id), role: p.role }}
                status={statuses.get(p.player_id)}
                fixtureTier={event?.tier}
                grade={grades.get(p.player_id)?.tier}
                onRemove={() => remove(p.player_id)}
                onToggleRole={() => toggleRole(p.player_id)}
              />
            ))}
          </ul>
        )}
      </Card>
    </>
  )

  return (
    <section>
      {/* ⚠️ `flex-wrap` IS REQUIRED, and tests/page-header-wrap.test.js enforces
          it across every screen: a page header without it pushes the whole
          document wider than the viewport rather than wrapping. It caught this
          screen on its first run. */}
      <div className="mb-3.5 mt-1 flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="font-display text-[24px] font-extrabold tracking-[-0.02em] text-ink desktop:text-[26px]">Team sheet</h2>
        <div className="flex items-center gap-3">
          {/* ⚠️ THE STATE AND THE SAVE ARE IN THE HEADER (2 Sep 2026 UX review,
              coaches, Medium): Save used to exist only at the foot of the
              whole squad list, so after picking a team the coach scrolled
              past every unpicked player, the notes and the sheet toggle to
              find it, and "Saved" only appeared down there. The chip says
              how many are picked and whether that is saved; the button is
              the same save() as the one at the foot. "Save changes", not
              "Save", so the two never share an accessible name. */}
          <span
            data-testid="picked-chip"
            className={`rounded-[100px] px-2.5 py-1 text-[12.5px] font-semibold ${dirty ? 'bg-warn-bg text-warn-ink' : 'bg-surface-sunk text-ink-muted'}`}
          >
            {picked.length} picked{dirty ? ' · unsaved changes' : saved ? ' · saved' : ''}
          </span>
          {dirty && (
            <Button size="sm" onClick={save} disabled={saving}>
              {saving ? 'Saving…' : 'Save changes'}
            </Button>
          )}
          {/* 44px tall: the UX review measured the old bare text link at ~16px. */}
          <button
            type="button"
            onClick={() => (dirty ? setConfirmingLeave(true) : navigate(-1))}
            className="min-h-[44px] px-3 text-[13px] font-bold text-brand-ink"
          >
            Back
          </button>
        </div>
      </div>

      {confirmingLeave && (
        <div
          role="alertdialog"
          aria-labelledby="lineup-leave-title"
          aria-describedby="lineup-leave-body"
          className="mb-3 rounded-[11px] border border-line bg-surface-mute px-3 py-2.5"
        >
          <p id="lineup-leave-title" className="text-sm font-bold text-ink">
            Leave without saving?
          </p>
          <p id="lineup-leave-body" className="mt-0.5 text-[12.5px] text-ink-muted">
            The team you picked will be lost.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button variant="danger" onClick={() => navigate(-1)}>
              Leave
            </Button>
            <Button variant="ghost" onClick={() => setConfirmingLeave(false)}>
              Stay
            </Button>
          </div>
        </div>
      )}

      {error && (
        <p
          role="alert"
          className="mb-3 rounded-[11px] bg-danger-bg px-3 py-2.5 text-sm font-semibold text-danger-ink"
        >
          {friendlyMessage(error, "That didn't save. Try again.")}
        </p>
      )}

      <Card className="mb-3 p-[14px]">
        <p className="text-[15px] font-extrabold text-ink">{eventTitle(event)}</p>
        <p className="mt-0.5 text-[12.5px] font-semibold text-ink-muted">
          {team?.name} · {formatLongDate(date)} · {eventTimeLabel(event)}
        </p>

        <label className="mt-3 block">
          <span className="mb-1.5 block text-[12.5px] font-bold uppercase tracking-[.4px] text-ink-muted">
            Players per side
          </span>
          <select
            value={perSide ?? ''}
            onChange={(domEvent) => {
              markEdited()
              setPendingSlot(null)
              setSelectedSlot(null)
              setPerSide(domEvent.target.value === '' ? null : Number(domEvent.target.value))
            }}
            className="w-full rounded-[11px] border-[1.5px] border-line bg-surface-card px-3 py-2.5 text-[16px] text-ink outline-none focus:border-brand"
          >
            <option value="">Not set</option>
            {SIDE_SIZES.map((size) => (
              <option key={size} value={String(size)}>
                {size}-a-side
              </option>
            ))}
          </select>
        </label>

        {/* ⚠️ TOTAL, NOT BENCH SIZE (Jay, 14 Aug 2026). Set independently of
            players-per-side rather than derived from it: "22 for a 15s match"
            and "10 for a 7s tournament" are both things a coach knows and the
            app cannot work out.
            ⚠️ A NUMBER INPUT, NOT A SELECT, unlike players-per-side directly
            above. That set is small and closed — the formats a club plays. A
            matchday squad total is not: it varies by competition, by tournament
            rules and by who is fit. A select would need a dozen options and
            still be wrong for somebody. */}
        <label className="mt-3 block">
          <span className="mb-1.5 block text-[12.5px] font-bold uppercase tracking-[.4px] text-ink-muted">
            Total in the squad
          </span>
          <input
            type="number"
            inputMode="numeric"
            min="1"
            max="40"
            value={squadSize ?? ''}
            onChange={(domEvent) => {
              markEdited()
              const raw = domEvent.target.value
              setSquadSize(raw === '' ? null : Number(raw))
            }}
            placeholder="e.g. 22"
            className="w-full rounded-[11px] border-[1.5px] border-line bg-surface-card px-3 py-2.5 text-[16px] text-ink outline-none focus:border-brand"
          />
          <span className="mt-1.5 block text-[12.5px] leading-relaxed text-ink-muted">
            Starters plus replacements. Used to count against — it never stops you
            picking somebody.
          </span>
        </label>
      </Card>

      {/* The view toggle. Quick is the whole 14 Aug screen; Slots and Pitch are
          other ways of touching the same roster. */}
      <div role="tablist" aria-label="Roster view" className="mb-3 flex gap-1.5">
        {VIEWS.map((candidate) => (
          <button
            key={candidate.key}
            type="button"
            role="tab"
            aria-selected={view === candidate.key}
            onClick={() => switchView(candidate.key)}
            className={`rounded-[10px] px-3.5 py-1.5 text-[13px] font-bold ${
              view === candidate.key
                ? 'bg-brand text-white'
                : 'border-[1.5px] border-line text-ink hover:bg-surface-mute'
            }`}
          >
            {candidate.label}
          </button>
        ))}
      </div>

      {view === 'quick' && (
        <>
          <div className="mb-2 flex items-baseline justify-between">
            <h3 className="text-[13px] font-extrabold uppercase tracking-[.8px] text-ink-muted">
              Starting {perSide != null ? `— ${starters.length} of ${perSide}` : `— ${starters.length}`}
            </h3>
            {overPicked && (
              <span className="text-[12px] font-bold text-warn-ink">
                {starters.length - perSide} over
              </span>
            )}
          </div>
          <Card className="mb-3 px-[14px] py-1">
            {starters.length === 0 ? (
              <p className="py-3 text-[13px] text-ink-muted">Nobody picked yet.</p>
            ) : (
              <ul>
                {starters.map((p) => (
                  <PickedRow
                    key={p.player_id}
                    player={{ ...playersById.get(p.player_id), role: p.role }}
                    status={statuses.get(p.player_id)}
                    fixtureTier={event?.tier}
                    grade={grades.get(p.player_id)?.tier}
                    onRemove={() => remove(p.player_id)}
                    onToggleRole={() => toggleRole(p.player_id)}
                  />
                ))}
              </ul>
            )}
          </Card>
        </>
      )}

      {view === 'slots' && (
        <>
          <div className="mb-2 flex items-baseline justify-between">
            <h3 className="text-[13px] font-extrabold uppercase tracking-[.8px] text-ink-muted">
              Shirts {perSide != null ? `— ${starters.length} of ${perSide}` : `— ${starters.length}`}
            </h3>
            {overPicked && (
              <span className="text-[12px] font-bold text-warn-ink">
                {starters.length - perSide} over
              </span>
            )}
          </div>
          {slotCount === 0 ? (
            <Card className="mb-3 p-4">
              <p className="text-[13px] leading-relaxed text-ink-muted">
                Choose players per side above and the shirts appear here, numbered and
                ready to fill.
              </p>
            </Card>
          ) : (
            <Card className="mb-3 px-[10px] py-1.5">
              <ul>
                {Array.from({ length: slotCount }, (unused, index) => {
                  const playerId = slotted[index] ?? null
                  const player = playerId ? playersById.get(playerId) : null
                  const { shirt, position } = slotLabel(format, index)
                  const isDragging = dragIndex === index
                  const isOver =
                    dragIndex != null && overIndex === index && dragIndex !== index
                  const extra = perSide != null && index >= perSide
                  return (
                    <li
                      key={index}
                      ref={rowRef(index)}
                      className={`flex items-center gap-2 border-b border-line py-2 last:border-b-0 ${
                        isOver ? 'border-t-2 border-t-brand' : ''
                      }`}
                      style={
                        isDragging
                          ? {
                              transform: `translateY(${dragOffset}px)`,
                              position: 'relative',
                              zIndex: 5,
                              opacity: 0.92,
                            }
                          : undefined
                      }
                    >
                      {player ? (
                        <span
                          {...handleProps(index)}
                          aria-label={`Drag to move ${player.full_name}`}
                          className="shrink-0 cursor-grab select-none px-1 text-[16px] leading-none text-ink-faint"
                        >
                          ⠿
                        </span>
                      ) : (
                        <span className="w-[22px] shrink-0" aria-hidden="true" />
                      )}
                      <span
                        className={`flex h-[24px] w-[24px] shrink-0 items-center justify-center rounded-[7px] text-[12px] font-bold ${
                          player
                            ? 'bg-brand text-white'
                            : 'border-[1.5px] border-line text-ink-muted'
                        }`}
                      >
                        {extra ? '+' : shirt}
                      </span>
                      {player ? (
                        <>
                          <span className="min-w-0 flex-1 truncate text-[14.5px] font-bold text-ink">
                            {player.full_name}
                          </span>
                          <StatusChip status={statuses.get(playerId)} />
                          <button
                            type="button"
                            onClick={() => toggleRole(playerId)}
                            className="shrink-0 rounded-[8px] px-2 min-h-[44px] py-1 text-[12px] font-boldtext-brand-ink hover:bg-surface-mute"
                          >
                            → Bench
                          </button>
                          <button
                            type="button"
                            onClick={() => remove(playerId)}
                            aria-label={`Remove ${player.full_name}`}
                            className="shrink-0 rounded-[8px] px-2 min-h-[44px] py-1 text-[12px] font-boldtext-ink-muted hover:bg-surface-mute"
                          >
                            Remove
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() =>
                            setPendingSlot((current) => (current === index ? null : index))
                          }
                          className={`min-w-0 flex-1 truncate rounded-[8px] px-1 py-1 text-left text-[13.5px] font-semibold ${
                            pendingSlot === index
                              ? 'bg-brand/10 text-brand-ink'
                              : 'text-ink-muted hover:bg-surface-mute'
                          }`}
                        >
                          {pendingSlot === index
                            ? 'Now tap a player below'
                            : `Tap to fill${position ? ` · ${position}` : ''}`}
                        </button>
                      )}
                    </li>
                  )
                })}
              </ul>
            </Card>
          )}
          <p className="mb-3 text-[12.5px] leading-relaxed text-ink-muted">
            Drag ⠿ to move somebody to a different shirt. Tap an empty shirt, then a
            player below, to fill it directly.
          </p>
        </>
      )}

      {view === 'pitch' && (
        <>
          {format == null ? (
            <Card className="mb-3 p-4">
              <p className="text-[13px] leading-relaxed text-ink-muted">
                Choose players per side above and the pitch lays the shirts out for that
                format.
              </p>
            </Card>
          ) : (
            <Card className="mb-3 overflow-hidden p-0">
              {/* ⚠️ TAP-FIRST STILL HOLDS — the phase-2 drag is ADDITIVE: a
                  tap is a drag that never travelled past the wobble threshold
                  (PitchDiagram.jsx), so every phase-1 gesture works untouched
                  and drag-a-circle-onto-another is the new one on top. */}
              <PitchDiagram
                interactive
                format={format}
                slotted={slotted}
                playersById={playersById}
                selectedSlot={selectedSlot}
                pendingSlot={pendingSlot}
                onCircle={handlePitchCircle}
                onMove={movePitchCircle}
              />
              <div className="px-[14px] py-2.5">
                {selectedSlot != null && slotted[selectedSlot] ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-[13px] font-bold text-ink">
                      {playersById.get(slotted[selectedSlot])?.full_name} — shirt{' '}
                      {selectedSlot + 1}
                    </span>
                    <button
                      type="button"
                      onClick={() => toggleRole(slotted[selectedSlot])}
                      className="rounded-[8px] border-[1.5px] border-line px-2.5 min-h-[44px] py-1 text-[12px] font-boldtext-ink"
                    >
                      → Bench
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(slotted[selectedSlot])}
                      className="rounded-[8px] border-[1.5px] border-line px-2.5 min-h-[44px] py-1 text-[12px] font-boldtext-ink-muted"
                    >
                      Remove
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedSlot(null)}
                      className="rounded-[8px] px-2 min-h-[44px] py-1 text-[12px] font-boldtext-ink-muted"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <p className="text-[12.5px] leading-relaxed text-ink-muted">
                    {pendingSlot != null
                      ? `Shirt ${pendingSlot + 1}${
                          pendingPlayerLabel?.position ? ` — ${pendingPlayerLabel.position}` : ''
                        }: tap a player below.`
                      : 'Tap an empty circle then a player below. Tap two filled circles to swap them.'}
                  </p>
                )}
              </div>
            </Card>
          )}
        </>
      )}

      {replacementsCard}
      {poolCard}

      <label className="mb-3 block">
        <span className="mb-1.5 block text-[12.5px] font-bold uppercase tracking-[.4px] text-ink-muted">
          Note for the group
        </span>
        <textarea
          rows={2}
          value={notes}
          onChange={(domEvent) => {
            markEdited()
            setNotes(domEvent.target.value)
          }}
          placeholder="Meet 8:15 at the gate. Bring both kits."
          className="w-full resize-y rounded-[11px] border-[1.5px] border-line bg-surface-card px-3 py-2.5 text-[16px] text-ink outline-none focus:border-brand"
        />
      </label>

      {/* Sheet style — what the PICTURE looks like, not what the screen does.
          Offered only with a format: a pitch sheet without pitch coordinates
          is nothing to draw. The full-name lists are in BOTH styles — the
          14 Aug full-names ruling is about what parents receive, and a
          graphic with initials must never be the only naming on the sheet. */}
      {format != null && (
        <div className="mb-2 flex flex-wrap items-center gap-2" role="group" aria-label="Sheet style">
          <span className="text-[12.5px] font-bold uppercase tracking-[.4px] text-ink-muted">
            Sheet style
          </span>
          {[
            { key: 'list', label: 'List' },
            { key: 'pitch', label: 'Pitch' },
          ].map((candidate) => (
            <button
              key={candidate.key}
              type="button"
              aria-pressed={sheetStyle === candidate.key}
              onClick={() => switchSheetStyle(candidate.key)}
              className={`rounded-[9px] px-3 py-1 text-[12.5px] font-bold ${
                sheetStyle === candidate.key
                  ? 'bg-brand text-white'
                  : 'border-[1.5px] border-line text-ink hover:bg-surface-mute'
              }`}
            >
              {candidate.label}
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
        <Button variant="secondary" onClick={share} disabled={sharing || picked.length === 0}>
          {sharing ? 'Preparing…' : 'Share to WhatsApp'}
        </Button>
        {saved && !saving && (
          <span role="status" className="self-center text-[13px] font-semibold text-ink-muted">
            Saved
          </span>
        )}
      </div>

      <p className="mt-2 text-[12.5px] leading-relaxed text-ink-muted">
        Sharing makes a picture of the team sheet and hands it to your phone&apos;s share
        menu — pick the WhatsApp group there. On a computer it downloads instead.
      </p>

      {/* ══ WHAT GETS PHOTOGRAPHED ══════════════════════════════════════════
          ⚠️ THIS IS THE ACTUAL DELIVERABLE. Most parents will never open the app
          for a lineup — they will see this PNG in a WhatsApp group, so it has to
          stand on its own: who, against whom, when, where.
          ⚠️ FULL NAMES, which is Jay's explicit decision (14 Aug 2026) over a
          first-name-plus-initial option that was offered. Consistent with the
          RCM match sheet the club already shares as an image.
          ⚠️ THE NUMBER IS THE SHIRT — the slot index plus one — so a roster
          built by position shares with true numbers, holes skipped.
          ⚠️ RENDERED, NOT HIDDEN WITH display:none. html2canvas cannot photograph
          a display:none element — it has zero size. It is positioned off-screen
          instead, which is the same trick MatchSheet's facsimile relies on. */}
      <div className="pointer-events-none fixed -left-[9999px] top-0" aria-hidden="true">
        {/* force-light: this subtree renders to a shared IMAGE and must come
            out white-on-paper even when the exporter runs dark. */}
        <div ref={shareRef} className="force-light w-[720px] bg-white p-8 font-sans">
          <div className="flex items-center gap-4 border-b-4 border-brand pb-4">
            <img src={crest} alt="" className="h-[64px] w-[59px] object-contain" />
            <div>
              <p className="text-[13px] font-bold uppercase tracking-[2px] text-ink-muted">
                Abu Dhabi Harlequins
              </p>
              <p className="text-[30px] font-extrabold leading-tight text-ink">
                {eventTitle(event)}
              </p>
              <p className="text-[15px] font-semibold text-ink-muted">
                {team?.name} · {formatLongDate(date)} · {eventTimeLabel(event)}
                {venueLine(event) ? ` · ${venueLine(event)}` : ''}
                {perSide != null ? ` · ${perSide}-a-side` : ''}
              </p>
            </div>
          </div>

          {/* The pitch-style sheet: the SAME drawing the Pitch view edits,
              with every handler absent, above the lists. ⚠️ NEVER INSTEAD OF
              THEM — the graphic carries first-name-plus-initial for space,
              and the 14 Aug ruling is FULL NAMES on what parents receive, so
              the lists below are the sheet and the pitch is its picture. */}
          {sheetStyle === 'pitch' && format != null && (
            <div className="mx-auto mt-5 w-[400px]">
              <PitchDiagram format={format} slotted={slotted} playersById={playersById} />
            </div>
          )}

          <div className="mt-5 grid grid-cols-2 gap-8">
            <div>
              <p className="mb-2 text-[13px] font-extrabold uppercase tracking-[1px] text-brand-ink">
                Starting
              </p>
              <ol className="text-[16px] leading-[1.9] text-ink">
                {starters.map((p) => (
                  <li key={p.player_id}>
                    <span className="inline-block w-6 font-bold text-ink-muted">{p.slot + 1}</span>
                    {playersById.get(p.player_id)?.full_name}
                  </li>
                ))}
              </ol>
            </div>
            <div>
              <p className="mb-2 text-[13px] font-extrabold uppercase tracking-[1px] text-brand-ink">
                Replacements
              </p>
              <ol className="text-[16px] leading-[1.9] text-ink">
                {bench.map((p) => (
                  <li key={p.player_id}>{playersById.get(p.player_id)?.full_name}</li>
                ))}
              </ol>
            </div>
          </div>

          {notes.trim() && (
            <p className="mt-5 border-t border-line pt-4 text-[16px] font-semibold text-ink">
              {notes.trim()}
            </p>
          )}
        </div>
      </div>
    </section>
  )
}
