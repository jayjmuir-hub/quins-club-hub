import { useEffect, useState } from 'react'
import Button from './Button.jsx'
import Chip from './Chip.jsx'
import { getSession, listDrills, listFocus, saveSessionBlocks } from '../data/trainingPlans.js'
import { CATEGORY_LABELS, squadFitsTemplate, totalMinutes } from '../lib/trainingPlans.js'
import { clubDateTimeInputs, eventDate } from '../lib/eventFormat.js'

// Tonight's session plan, on the event sheet.
// Plan: claude/plans/2026-08-21-training-plans-implementation.md (Task 9).
// Spec: claude/specs/2026-08-21-training-plans-dashboard-design.md
//
// ⚠️ SELF-CONTAINED ON PURPOSE, the same as PitchRequest and for the same
// reason: it loads and writes its own session rather than taking handlers from
// the screen above. EventDetail rendered a DEAD availability button for weeks
// because Schedule passed the handler and the Dashboard did not, and the
// optional call swallowed every tap. A component with no handler to forget
// cannot be wired up wrongly by the next screen that renders it.
//
// ⚠️ A PARENT SEES THIS, READ-ONLY, AND THAT IS DELIBERATE. The RLS read policy
// on public.training_sessions follows the EVENT rather than any admin right,
// because a session plan holds no children's data — it is drills and minutes.
// A parent who can see that tonight is 20 minutes of tackle technique is a
// parent who knows what boots to send. `canEdit` decides what is OFFERED here;
// the database decides what is handed over and what it will accept.
//
// ⚠️ IT DECIDES FOR ITSELF WHETHER TO RENDER ANYTHING. Most training sessions
// have no published plan, and an empty "Session plan" heading on every one of
// them is noise on the screen a member actually reads. No session and no focus
// covering the night means no card at all.
//
// ⚠️ THE FIT CHECK IN THE PICKER IS AGAINST THE SQUAD, NOT A TEMPLATE. A coach
// adding a drill to one night's plan is adding it for THESE children, so the
// drill's own contact flag and age band are handed to squadFitsTemplate as the
// "template" and the answer is about this team. That carries the null-band rule
// with it: a squad whose name cannot be parsed gets offered no age-limited
// drill and is told why, rather than being given a default band — the fault
// that once offered a twelve-year-old squad an adult contact form.

const INPUT =
  'w-full rounded-[8px] border-[1.5px] border-line bg-surface-card px-3 py-2 text-[16px] text-ink outline-none transition focus:border-brand'
const LABEL = 'mb-1.5 block text-[12.5px] font-bold uppercase tracking-[.4px] text-ink-muted'
const MOVE =
  'rounded-[8px] border-[1.5px] border-line px-2 py-1 text-[13px] font-bold text-ink transition hover:border-brand hover:text-brand disabled:opacity-40 disabled:hover:border-line disabled:hover:text-ink'

/** A blank box is "not said", which is NULL — never '' and never 0. */
function textOrNull(value) {
  const trimmed = (value ?? '').trim()
  return trimmed === '' ? null : trimmed
}

// ⚠️ A DRAFT BLOCK CARRIES THE WHOLE DRILL, NOT JUST ITS id — the row shows the
// title and the category. `key` is a local counter because the same drill may
// legitimately appear twice in one session and an index changes under a move.
let nextKey = 1
function draftFrom(session) {
  return (session?.blocks ?? []).map((block) => ({
    key: `sp-${nextKey++}`,
    drill_id: block.drill_id ?? block.drill?.id ?? null,
    drill: block.drill ?? null,
    minutes: String(block.minutes ?? 10),
    coach_note: block.coach_note ?? '',
  }))
}

/** A drill picked out of the library, as a draft block. */
function blockFromDrill(drill) {
  return {
    key: `sp-${nextKey++}`,
    drill_id: drill.id,
    drill,
    minutes: String(drill.minutes ?? 10),
    coach_note: '',
  }
}

/**
 * One block as it READS: the running order a coach holds a phone to follow.
 * The drill's own words live behind a <details> — two paragraphs per block
 * buries the running order, which is the thing the card exists to show.
 */
function BlockRow({ block }) {
  const drill = block.drill ?? {}
  const category = CATEGORY_LABELS[drill.category] ?? drill.category ?? null
  const hasDetail = Boolean(drill.summary || drill.body || drill.source_url)

  return (
    <li className="border-b border-line py-2 last:border-b-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-extrabold text-ink">{block.minutes} min</span>
        <span aria-hidden="true" className="text-ink-faint">
          ·
        </span>
        <span className="text-sm font-bold text-ink">{drill.title ?? 'Drill'}</span>
        {category && <Chip>{category}</Chip>}
      </div>

      {block.coach_note && (
        <p className="mt-1 text-[12.5px] leading-relaxed text-ink-muted">{block.coach_note}</p>
      )}

      {hasDetail && (
        <details className="mt-1">
          <summary className="cursor-pointer text-[12.5px] font-bold text-brand">
            How it runs
          </summary>
          {drill.summary && (
            <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">{drill.summary}</p>
          )}
          {drill.body && (
            <p className="mt-1 whitespace-pre-line text-[13px] leading-relaxed text-ink">
              {drill.body}
            </p>
          )}
          {/* ⚠️ CREDITED AND OPENED AWAY FROM THE APP. The library holds other
              people's drills; the source is how a coach checks one, and
              `rel="noreferrer"` keeps the new tab from reaching back. */}
          {drill.source_url && (
            <p className="mt-1 text-[12.5px]">
              <a
                href={drill.source_url}
                target="_blank"
                rel="noreferrer"
                className="font-bold text-brand underline"
              >
                {drill.source_name || 'Source'}
              </a>
            </p>
          )}
        </details>
      )}
    </li>
  )
}

/**
 * One block while a coach is ADJUSTING it.
 *
 * ⚠️ THE CONTROLS ARE LABELLED PLAINLY ("Minutes", "Move up"). Five blocks
 * means five boxes called Minutes; what tells a screen reader — and a test —
 * which one it is on is the group name, not a title spliced into every label.
 */
function EditRow({ block, index, count, onChange, onMove, onRemove, busy }) {
  const title = block.drill?.title ?? 'Drill'

  return (
    <li
      role="group"
      aria-label={`Block ${index + 1}: ${title}`}
      className="flex flex-col gap-2 border-b border-line py-2.5 last:border-b-0"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[12px] font-bold text-ink-faint">{index + 1}</span>
        <span className="text-sm font-extrabold text-ink">{title}</span>
        <span className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            aria-label="Move up"
            disabled={busy || index === 0}
            onClick={() => onMove(index, -1)}
            className={MOVE}
          >
            ▲
          </button>
          <button
            type="button"
            aria-label="Move down"
            disabled={busy || index === count - 1}
            onClick={() => onMove(index, 1)}
            className={MOVE}
          >
            ▼
          </button>
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => onRemove(index)}>
            Remove
          </Button>
        </span>
      </div>

      <div className="flex flex-wrap items-end gap-2.5">
        <label className="w-24">
          <span className={LABEL}>Minutes</span>
          <input
            type="number"
            min={1}
            max={120}
            aria-label="Minutes"
            value={block.minutes}
            disabled={busy}
            onChange={(domEvent) => onChange(index, 'minutes', domEvent.target.value)}
            className={INPUT}
          />
        </label>
        <label className="min-w-0 flex-1">
          <span className={LABEL}>Coach note</span>
          <input
            type="text"
            aria-label="Coach note"
            value={block.coach_note}
            disabled={busy}
            onChange={(domEvent) => onChange(index, 'coach_note', domEvent.target.value)}
            placeholder="Keep the width"
            className={INPUT}
          />
        </label>
      </div>
    </li>
  )
}

export default function SessionPlan({ event, team, canEdit }) {
  const [session, setSession] = useState(null)
  const [focus, setFocus] = useState(null)
  const [drills, setDrills] = useState([])
  const [loading, setLoading] = useState(true)

  const [editing, setEditing] = useState(false)
  const [blocks, setBlocks] = useState([])
  const [notes, setNotes] = useState('')
  const [picked, setPicked] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [reloadToken, setReloadToken] = useState(0)

  // ⚠️ THE EVENT'S DATE IN CLUB TIME, never a bare `new Date()` and never
  // date.getDate(). A 20:00 Abu Dhabi session is 16:00 UTC the same day but
  // 18:00 the previous evening in some readers' zones, and a focus window is
  // stored as plain dates — reading the wrong day is how a fortnight's theme
  // shows on the wrong Tuesday. ISO date strings compare correctly as strings,
  // which is why the window test below needs no Date arithmetic at all.
  const clubDate = clubDateTimeInputs(eventDate(event)).date

  useEffect(() => {
    let mounted = true
    setLoading(true)

    // ⚠️ allSettled, NOT all. A failed read of the focus list must not take the
    // plan down with it, and vice versa — the same rule PitchRequest states: a
    // small block at the bottom of a sheet whose main job is showing an event
    // does not get to refuse to render because one side table was unreachable.
    // ⚠️ THE DRILL LIBRARY IS FETCHED ONLY FOR SOMEBODY WHO MAY EDIT. A parent
    // reading tonight's plan has no picker and no use for every drill the club
    // owns; asking for them anyway is a wasted round trip on a phone.
    Promise.allSettled([
      getSession(event.id),
      listFocus(),
      canEdit ? listDrills() : Promise.resolve([]),
    ])
      .then(([sessionResult, focusResult, drillResult]) => {
        if (!mounted) return

        const loaded = sessionResult.status === 'fulfilled' ? sessionResult.value : null
        setSession(loaded)
        setNotes(loaded?.notes ?? '')
        setBlocks(draftFrom(loaded))

        const focusRows = focusResult.status === 'fulfilled' ? focusResult.value ?? [] : []
        setFocus(
          focusRows.find(
            (row) =>
              row.team_id === event.team_id &&
              clubDate !== '' &&
              row.starts_on <= clubDate &&
              clubDate <= row.ends_on,
          ) ?? null,
        )

        setDrills(drillResult.status === 'fulfilled' ? drillResult.value ?? [] : [])
      })
      .finally(() => {
        if (mounted) setLoading(false)
      })

    return () => {
      mounted = false
    }
  }, [event.id, event.team_id, clubDate, canEdit, reloadToken])

  if (loading) return null
  // Nothing published and no theme for the fortnight: nothing to say.
  if (!session && !focus) return null

  const numericBlocks = editing
    ? blocks.map((block) => ({ minutes: Number(block.minutes) }))
    : session?.blocks ?? []
  const total = totalMinutes(numericBlocks)

  // ⚠️ A HALF-TYPED BOX IS NOT A SAVE. `minutes` is an integer column with a
  // 1..120 check, and Number('') is 0 — sending that gets a Postgres error
  // nobody can read, so Save waits instead.
  const minutesOk = blocks.every((block) => {
    const value = Number(block.minutes)
    return String(block.minutes).trim() !== '' && Number.isInteger(value) && value >= 1 && value <= 120
  })

  function openEdit() {
    setBlocks(draftFrom(session))
    setNotes(session?.notes ?? '')
    setPicked('')
    setError(null)
    setEditing(true)
  }

  function cancelEdit() {
    setBlocks(draftFrom(session))
    setNotes(session?.notes ?? '')
    setPicked('')
    setError(null)
    setEditing(false)
  }

  function changeBlock(index, field, value) {
    setBlocks((current) =>
      current.map((block, at) => (at === index ? { ...block, [field]: value } : block)),
    )
  }

  function moveBlock(index, step) {
    const target = index + step
    setBlocks((current) => {
      if (target < 0 || target >= current.length) return current
      const next = [...current]
      const [moved] = next.splice(index, 1)
      next.splice(target, 0, moved)
      return next
    })
  }

  function removeBlock(index) {
    setBlocks((current) => current.filter((_, at) => at !== index))
  }

  function addBlock(drillId) {
    const drill = drills.find((row) => row.id === drillId)
    // Back to the placeholder either way, so the same drill can be picked
    // twice — a session may legitimately run one drill in two halves.
    setPicked('')
    if (!drill) return
    setBlocks((current) => [...current, blockFromDrill(drill)])
  }

  /**
   * ⚠️ THE EDITOR STAYS OPEN, WITH THE TYPING INTACT, ON A REFUSED WRITE. The
   * data layer turns the RLS zero-row result — a successful nothing — into a
   * thrown error, and closing here would draw a save that never landed as a
   * completed one, losing the adjustment somebody just made.
   */
  async function save() {
    setSaving(true)
    setError(null)
    try {
      await saveSessionBlocks(
        session.id,
        // ⚠️ NUMBERS, AND IN THE ORDER ON SCREEN. The boxes hold strings, the
        // column is an integer, and the data layer renumbers positions 1..n
        // from this array — so this order is the only source of truth.
        blocks.map((block) => ({
          drill_id: block.drill_id ?? block.drill?.id ?? null,
          minutes: Number(block.minutes),
          coach_note: textOrNull(block.coach_note),
        })),
        textOrNull(notes),
      )
      setEditing(false)
      // ⚠️ RELOADED, NOT GUESSED. coach_edited_at is stamped by the write, and
      // the chip that reads it must come from the row the database now holds.
      setReloadToken((token) => token + 1)
    } catch (failure) {
      setError(failure)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mt-4 border-t border-line pt-4">
      <h4 className="mb-2 text-[13px] font-extrabold uppercase tracking-[.8px] text-ink-faint">
        Session plan
      </h4>

      {/* A focus is a LABEL over a run of weeks and gates nothing — it can be
          the only thing this card has to say. */}
      {focus && (
        <p data-testid="session-focus" className="mb-2 text-[13px] text-ink-muted">
          Focus: <span className="font-bold text-ink">{focus.title}</span>
        </p>
      )}

      {session && !editing && (
        <div>
          {session.coach_edited_at && (
            <p className="mb-2">
              {/* ⚠️ NOT DECORATION. publish_training skips a coach-edited
                  session, so this is the only thing on screen that explains why
                  tonight's plan did not change when a new template was
                  published to the squad. */}
              <Chip>Edited by the coach</Chip>
            </p>
          )}

          <ol className="mb-2">
            {session.blocks.map((block) => (
              <BlockRow key={block.id} block={block} />
            ))}
          </ol>

          <p data-testid="session-total" className="text-[12.5px] font-bold text-ink-muted">
            Total {total} min
          </p>

          {session.notes && (
            <p className="mt-2 text-[13px] leading-relaxed text-ink-muted">{session.notes}</p>
          )}

          {canEdit && (
            <div className="mt-2.5">
              <Button variant="secondary" size="sm" onClick={openEdit}>
                Adjust
              </Button>
            </div>
          )}
        </div>
      )}

      {session && editing && (
        <div>
          <ol>
            {blocks.map((block, index) => (
              <EditRow
                key={block.key}
                block={block}
                index={index}
                count={blocks.length}
                onChange={changeBlock}
                onMove={moveBlock}
                onRemove={removeBlock}
                busy={saving}
              />
            ))}
          </ol>

          <label className="mt-2.5 block">
            <span className={LABEL}>Add a drill</span>
            <select
              aria-label="Add a drill"
              value={picked}
              disabled={saving}
              onChange={(domEvent) => addBlock(domEvent.target.value)}
              className={INPUT}
            >
              <option value="">Choose a drill…</option>
              {drills.map((drill) => {
                // ⚠️ DISABLED WITH THE REASON, NOT FILTERED OUT. A coach who
                // cannot find a tackling drill concludes the library is broken;
                // a coach told "U12 is outside…" understands the squad.
                // 'session' is the subject word: this is a drill being fitted
                // to tonight's session, not a template being published.
                const fit = squadFitsTemplate(
                  team,
                  {
                    requires_contact: drill.requires_contact,
                    min_age: drill.min_age,
                    max_age: drill.max_age,
                  },
                  'session',
                )
                const label = `${drill.title} · ${drill.minutes} min`
                return (
                  <option key={drill.id} value={drill.id} disabled={!fit.ok}>
                    {fit.ok ? label : `${label} — ${fit.reason}`}
                  </option>
                )
              })}
            </select>
          </label>

          <label className="mt-2.5 block">
            <span className={LABEL}>Notes for this session</span>
            <textarea
              rows={2}
              aria-label="Notes for this session"
              value={notes}
              disabled={saving}
              onChange={(domEvent) => setNotes(domEvent.target.value)}
              placeholder="Half the squad away at a tournament"
              className={`${INPUT} resize-y`}
            />
          </label>

          <p className="mt-2 text-[12.5px] font-bold text-ink-muted">Total {total} min</p>

          <div className="mt-2.5 flex gap-2">
            <Button disabled={saving || !minutesOk} onClick={save}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
            <Button variant="ghost" disabled={saving} onClick={cancelEdit}>
              Cancel
            </Button>
          </div>

          {!minutesOk && (
            <p className="mt-2 text-[12.5px] font-semibold text-brand-deep">
              Every block needs a whole number of minutes, from 1 to 120.
            </p>
          )}
        </div>
      )}

      {error && (
        <p role="alert" className="mt-2 text-[12.5px] font-semibold text-brand-deep">
          {error.message || "That didn't save. Try again."}
        </p>
      )}
    </div>
  )
}
