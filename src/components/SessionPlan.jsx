import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Button from './Button.jsx'
import Chip from './Chip.jsx'
import { SessionPlanCapture } from './SessionPlanCapture.jsx'
import DrillDiagram from './DrillDiagram.jsx'
import { safeHttpUrl } from '../lib/safeUrl.js'
import {
  createSession,
  getSession,
  listDrills,
  listFocus,
  listTemplates,
  saveSessionBlocks,
  saveSquadTemplate,
  setSessionVisibility,
  submitDrillToClub,
  submitTemplateToClub,
  upsertDrill,
} from '../data/trainingPlans.js'
import {
  ageOrNull,
  CATEGORIES,
  CATEGORY_LABELS,
  textOrNull,
  totalMinutes,
} from '../lib/trainingPlans.js'
import { shelfRowsForSquad } from '../lib/trainingShelf.js'
import { clubDateTimeInputs, eventDate } from '../lib/eventFormat.js'
import { sessionPlanShareCopy } from '../lib/sessionPlanShare.js'
import { shareElementAsImage } from '../lib/shareImage.js'
import { friendlyMessage } from '../lib/friendlyError.js'

// Who sees a coach's plan. The order is the promotion path: a coach starts a
// plan as their own (draft), shares it with the squad's other staff, then
// publishes it to the families — never the other way by accident, which is why
// 'staff' is the default a new plan is born at (Jay, 27 Aug 2026).
const VISIBILITY = [
  { value: 'draft', label: 'Only me', hint: 'A private draft while you build it.' },
  { value: 'staff', label: 'Squad staff', hint: 'The other coaches and managers of this squad.' },
  { value: 'squad', label: 'The whole squad', hint: 'Players and their families see it too.' },
]

const BLANK_DRILL = {
  title: '',
  minutes: '10',
  category: CATEGORIES[0],
  requires_contact: false,
  min_age: '',
  max_age: '',
}

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
// ⚠️ THE PICKERS FILTER AT THE LIST, NEVER CSS-HIDE AND NEVER A DISABLED
// OPTION. START FROM A TEMPLATE and ADD A DRILL reuse shelfRowsForSquad —
// age from the squad name, contact from teams.requires_contact. Disabled-
// with-reason is the chip-row rule; a dropdown option you cannot pick is
// worse than omitting it (Jay, 27 Aug 2026). EventDetail and Squad Training
// mount this same card; they have no sibling picker. Director /admin/training
// lists stay unfiltered on purpose.

const INPUT =
  'w-full rounded-[8px] border-[1.5px] border-line bg-surface-card px-3 py-2 text-[16px] text-ink outline-none transition focus:border-brand'
const LABEL = 'mb-1.5 block text-[12.5px] font-bold uppercase tracking-[.4px] text-ink-muted'
const MOVE =
  'rounded-[8px] border-[1.5px] border-line px-2 py-1 text-[13px] font-bold text-ink transition hover:border-brand hover:text-brand-ink disabled:opacity-40 disabled:hover:border-line disabled:hover:text-ink'

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
  const hasDetail = Boolean(drill.summary || drill.body || drill.source_url || drill.diagram_url)

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
          <summary className="cursor-pointer text-[12.5px] font-bold text-brand-ink">
            How it runs
          </summary>
          <DrillDiagram url={drill.diagram_url} title={drill.title ?? 'Drill'} />
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
          {safeHttpUrl(drill.source_url) && (
            <p className="mt-1 text-[12.5px]">
              <a
                href={safeHttpUrl(drill.source_url)}
                target="_blank"
                rel="noreferrer"
                className="font-bold text-brand-ink underline"
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
  // The event's team carries its club (EventDetail passes the full row). A new
  // drill/template needs a club_id; the session author is filled by the DB
  // default (created_by = auth.uid()), so no auth provider is needed here.
  const clubId = team?.club_id ?? null

  const [session, setSession] = useState(null)
  const [focus, setFocus] = useState(null)
  const [drills, setDrills] = useState([])
  const [templates, setTemplates] = useState([])
  const [loading, setLoading] = useState(true)

  // `editing` = adjusting an existing session; `creating` = building the first
  // plan for an event that has none. Both drive the same block editor below.
  const [editing, setEditing] = useState(false)
  const [creating, setCreating] = useState(false)
  const [blocks, setBlocks] = useState([])
  const [notes, setNotes] = useState('')
  const [picked, setPicked] = useState('')
  const [seedId, setSeedId] = useState('')
  const [visibility, setVisibility] = useState('staff')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [reloadToken, setReloadToken] = useState(0)

  // The inline "create a drill" form, so a coach is not limited to the club
  // library while planning. A squad-owned drill (team_id = this squad).
  const [newDrillOpen, setNewDrillOpen] = useState(false)
  const [newDrill, setNewDrill] = useState(BLANK_DRILL)
  const [drillBusy, setDrillBusy] = useState(false)

  // "Save this running order as my template" — a squad-owned template.
  const [tplName, setTplName] = useState('')
  const [tplBusy, setTplBusy] = useState(false)
  const [tplSaved, setTplSaved] = useState(null) // null | { id } | 'suggested'
  const [sharing, setSharing] = useState(false)
  const shareRef = useRef(null)

  // ⚠️ A REF, NOT THE STATE, BECAUSE THE READER BELOW IS ASYNCHRONOUS. The
  // effect's `.then` runs long after the effect body captured its variables,
  // so a coach who opened the form mid-load would be judged by whatever
  // `editing` was when the fetch started. The ref always reads what is true
  // now.
  const editingRef = useRef(false)
  editingRef.current = editing || creating

  // ⚠️ THE EVENT'S DATE IN CLUB TIME, never a bare `new Date()` and never
  // date.getDate(). A 20:00 Abu Dhabi session is 16:00 UTC the same day but
  // 18:00 the previous evening in some readers' zones, and a focus window is
  // stored as plain dates — reading the wrong date is how a fortnight's theme
  // shows on the wrong day. (It said "the wrong Tuesday" until 21 Aug 2026;
  // nothing in this feature keys on a weekday and the wording invited it to.)
  // ISO date strings compare correctly as strings, which is why the window
  // test below needs no Date arithmetic at all.
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
    // ⚠️ THE DRILL LIBRARY IS SCOPED TO THE SQUAD FOR A COACH — the club
    // library plus this squad's own drills, never another squad's (listDrills's
    // teamId). Templates the same, and only for somebody who may edit; a parent
    // reading tonight's plan needs neither.
    Promise.allSettled([
      getSession(event.id),
      listFocus(),
      canEdit ? listDrills({ teamId: event.team_id }) : Promise.resolve([]),
      canEdit ? listTemplates({ teamId: event.team_id }) : Promise.resolve([]),
    ])
      .then(([sessionResult, focusResult, drillResult, templateResult]) => {
        if (!mounted) return

        const loaded = sessionResult.status === 'fulfilled' ? sessionResult.value : null
        setSession(loaded)
        // ⚠️ NEVER RE-SEED THE FORM UNDER A COACH WHO IS TYPING IN IT. This
        // effect reruns on canEdit and on the event's club date as well as on
        // reloadToken, and each rerun used to overwrite `blocks` and `notes`
        // with the saved session — throwing away an unsaved running order with
        // no warning and no way back. After a save, `editing` is already false
        // and the reload seeds the form as before.
        if (!editingRef.current) {
          setNotes(loaded?.notes ?? '')
          setBlocks(draftFrom(loaded))
          // An existing session with no visibility is a legacy 'squad' one;
          // openCreate sets 'staff' for a brand-new coach plan.
          setVisibility(loaded?.visibility ?? 'squad')
        }

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
        setTemplates(templateResult.status === 'fulfilled' ? templateResult.value ?? [] : [])
      })
      .finally(() => {
        if (mounted) setLoading(false)
      })

    return () => {
      mounted = false
    }
  }, [event.id, event.team_id, clubDate, canEdit, reloadToken])

  const building = editing || creating
  // Club + this squad's rows from the query; this squad's age/contact fit at
  // the option list. Unbounded rows still appear (any-age Freestyle seed).
  const visibleTemplates = shelfRowsForSquad(templates, team)
  const visibleDrills = shelfRowsForSquad(drills, team)

  if (loading) return null
  // Nothing published and no theme for the fortnight. A coach still gets a card
  // — it is where they build the first plan — but a parent sees nothing, the
  // same as before this feature (the card must not be an empty labelled block
  // on every training session in the club).
  if (!session && !focus && !canEdit) return null

  const numericBlocks = building
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

  // ── Building the FIRST plan for an event that has none ──────────────────
  function openCreate() {
    setBlocks([])
    setNotes('')
    setPicked('')
    setSeedId('')
    setVisibility('staff')
    setError(null)
    setCreating(true)
  }

  function cancelCreate() {
    setCreating(false)
    setBlocks([])
    setNotes('')
    setSeedId('')
    setError(null)
  }

  // Seed the running order from a template (club or this squad's own). Replaces
  // whatever is in the builder — the coach chose this template on purpose.
  function seedFrom(templateId) {
    setSeedId(templateId)
    const template = templates.find((row) => row.id === templateId)
    if (!template) {
      setBlocks([])
      return
    }
    setBlocks(
      (template.blocks ?? []).map((block) => ({
        key: `sp-seed-${block.id}`,
        drill_id: block.drill_id ?? block.drill?.id ?? null,
        drill: block.drill ?? null,
        minutes: String(block.minutes ?? 10),
        coach_note: block.coach_note ?? '',
      })),
    )
    if (template.notes) setNotes(template.notes)
  }

  const blockPayload = () =>
    blocks.map((block) => ({
      drill_id: block.drill_id ?? block.drill?.id ?? null,
      minutes: Number(block.minutes),
      coach_note: textOrNull(block.coach_note),
    }))

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
      if (creating) {
        await createSession({
          eventId: event.id,
          visibility,
          // created_by is filled by the DB default (auth.uid()).
          // ⚠️ NUMBERS, IN THE ORDER ON SCREEN — createSession renumbers 1..n.
          blocks: blockPayload(),
          notes: textOrNull(notes),
        })
        setCreating(false)
      } else {
        await saveSessionBlocks(session.id, blockPayload(), textOrNull(notes))
        // Visibility is a second column, not part of the block replace; only
        // written when the coach actually changed it, so an Adjust that leaves
        // it alone makes no extra round trip.
        if (visibility !== (session.visibility ?? 'squad')) {
          await setSessionVisibility(session.id, visibility)
        }
        setEditing(false)
      }
      // ⚠️ RELOADED, NOT GUESSED. coach_edited_at is stamped by the write, and
      // the chip that reads it must come from the row the database now holds.
      setReloadToken((token) => token + 1)
    } catch (failure) {
      setError(failure)
    } finally {
      setSaving(false)
    }
  }

  // ── A new squad-owned drill, created without leaving the builder ────────
  const newDrillMinutes = Number(newDrill.minutes)
  const newDrillOk =
    newDrill.title.trim() !== '' &&
    Number.isFinite(newDrillMinutes) &&
    newDrillMinutes >= 1 &&
    newDrillMinutes <= 120 &&
    clubId != null

  async function saveNewDrill() {
    setDrillBusy(true)
    setError(null)
    try {
      const created = await upsertDrill({
        club_id: clubId,
        team_id: event.team_id,
        title: newDrill.title.trim(),
        minutes: newDrillMinutes,
        category: newDrill.category,
        requires_contact: newDrill.requires_contact === true,
        min_age: ageOrNull(newDrill.min_age),
        max_age: ageOrNull(newDrill.max_age),
      })
      // Offer it to the club library too, if the coach asked. The drill is
      // theirs to use either way; suggesting only puts it in the Director's
      // queue (submitted_at), it does not move it.
      if (newDrill.suggest && created?.id) await submitDrillToClub(created.id)
      setDrills((current) => [...current, created])
      setBlocks((current) => [...current, blockFromDrill(created)])
      setNewDrill(BLANK_DRILL)
      setNewDrillOpen(false)
    } catch (failure) {
      setError(failure)
    } finally {
      setDrillBusy(false)
    }
  }

  // ── Save the running order as this squad's own template ─────────────────
  async function saveAsTemplate() {
    setTplBusy(true)
    setError(null)
    try {
      const saved = await saveSquadTemplate({
        clubId,
        teamId: event.team_id,
        name: tplName.trim(),
        notes: textOrNull(notes),
        blocks: (session?.blocks ?? []).map((block) => ({
          drill_id: block.drill_id ?? block.drill?.id ?? null,
          minutes: block.minutes,
          coach_note: block.coach_note ?? null,
        })),
      })
      setTplSaved(saved?.id ? { id: saved.id } : 'suggested')
      setTplName('')
    } catch (failure) {
      setError(failure)
    } finally {
      setTplBusy(false)
    }
  }

  async function suggestTemplate() {
    if (!tplSaved?.id) return
    setTplBusy(true)
    setError(null)
    try {
      await submitTemplateToClub(tplSaved.id)
      setTplSaved('suggested')
    } catch (failure) {
      setError(failure)
    } finally {
      setTplBusy(false)
    }
  }

  async function sharePlan() {
    setSharing(true)
    setError(null)
    try {
      await shareElementAsImage(shareRef.current, sessionPlanShareCopy(event))
    } catch (failure) {
      setError(failure)
    } finally {
      setSharing(false)
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

      {session && !building && (
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            {session.coach_edited_at && (
              // ⚠️ NOT DECORATION. publish_training skips a coach-edited
              // session, so this is the only thing on screen that explains why
              // tonight's plan did not change when a new template was
              // published to the squad.
              <Chip>Edited by the coach</Chip>
            )}
            {/* Who can see it — shown to staff only; a family sees a squad plan
                and does not need telling it is a squad plan. */}
            {canEdit && (
              <span data-testid="session-visibility">
                <Chip>
                  {VISIBILITY.find((v) => v.value === (session.visibility ?? 'squad'))?.label ?? 'The whole squad'}
                </Chip>
              </span>
            )}
          </div>

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

          {/* ⚠️ PORTALED TO document.body, SAME WRAPPER AS LINEUP.
              html2canvas photographs shareRef. Nested inside EventDetail's
              Sheet, `position:fixed; left:-9999px` is NOT against the
              viewport: the scrim has backdrop-filter, the panel animates
              with transform, overflow-y-auto clips. The clone then paints
              the on-screen BlockRow <ol> (How it runs, Chip concat,
              overlapped notes). Lineup's capture works because that screen
              is a full page. Portal + the same classes makes Share the
              same trick against the viewport. Not display:none.
              Spec: claude/specs/2026-08-27-session-plan-share.md */}
          {canEdit &&
            createPortal(
              <div className="pointer-events-none fixed -left-[9999px] top-0" aria-hidden="true">
                <SessionPlanCapture
                  ref={shareRef}
                  event={event}
                  team={team}
                  session={session}
                  total={total}
                />
              </div>,
              document.body,
            )}

          {canEdit && (
            <div className="mt-2.5 flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" onClick={openEdit}>
                Adjust
              </Button>
              {/* Same control on EventDetail and Squad Training — this card
                  is the one renderer. Photographs the running order, not
                  Adjust / the event-sheet footer. Spec:
                  claude/specs/2026-08-27-session-plan-share.md */}
              <Button variant="secondary" size="sm" disabled={sharing} onClick={sharePlan}>
                {sharing ? 'Sharing…' : 'Share'}
              </Button>
              {!tplSaved && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setTplName(tplName || `${team?.name ?? 'Squad'} session`)}
                  data-testid="save-as-template"
                >
                  Save as my template
                </Button>
              )}
            </div>
          )}

          {/* Save-as-template: names the running order and keeps it as this
              squad's own template, ready to reuse. Squad-owned until suggested
              to the club. */}
          {canEdit && tplName !== '' && !tplSaved && (
            <div className="mt-2.5 flex flex-wrap items-end gap-2">
              <label className="min-w-0 flex-1">
                <span className={LABEL}>Template name</span>
                <input
                  type="text"
                  aria-label="Template name"
                  value={tplName}
                  disabled={tplBusy}
                  onChange={(domEvent) => setTplName(domEvent.target.value)}
                  className={INPUT}
                />
              </label>
              <Button disabled={tplBusy || tplName.trim() === ''} onClick={saveAsTemplate}>
                {tplBusy ? 'Saving…' : 'Save template'}
              </Button>
              <Button variant="ghost" disabled={tplBusy} onClick={() => setTplName('')}>
                Cancel
              </Button>
            </div>
          )}
          {tplSaved && tplSaved !== 'suggested' && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <p className="text-[12.5px] font-semibold text-brand-ink">
                Saved to your squad&apos;s templates.
              </p>
              <Button variant="ghost" size="sm" disabled={tplBusy} onClick={suggestTemplate}>
                Suggest to the club
              </Button>
            </div>
          )}
          {tplSaved === 'suggested' && (
            <p className="mt-2 text-[12.5px] font-semibold text-brand-ink">
              Suggested to the club — the Rugby Performance Director will see it.
            </p>
          )}
        </div>
      )}

      {/* No plan yet — the coach builds one. A parent never reaches here (the
          guard above returns null for them). */}
      {!session && canEdit && !creating && (
        <div>
          <p className="mb-2.5 text-[13px] leading-relaxed text-ink-muted">
            No plan for this session yet. Build your own — from scratch, or start from a template.
          </p>
          <Button size="sm" onClick={openCreate} data-testid="build-session">
            Build a session
          </Button>
        </div>
      )}

      {building && (
        <div>
          {/* Seed from a template — only when building a NEW plan. Freestyle
              first, then hours shelfRowsForSquad accepts for THIS squad.
              Another squad's rows never appear (listTemplates's teamId);
              another age pack's hours never appear (the filter). The select
              stays up so Freestyle remains even when every club hour is
              the wrong contact or age. */}
          {creating && templates.length > 0 && (
            <label className="mb-2.5 block">
              <span className={LABEL}>Start from a template</span>
              <select
                aria-label="Start from a template"
                value={seedId}
                disabled={saving}
                onChange={(domEvent) => seedFrom(domEvent.target.value)}
                className={INPUT}
              >
                <option value="">Freestyle — an empty plan</option>
                {visibleTemplates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name}
                    {template.team_id ? ' (your squad)' : ''}
                  </option>
                ))}
              </select>
            </label>
          )}

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
              {visibleDrills.map((drill) => (
                <option key={drill.id} value={drill.id}>
                  {`${drill.title} · ${drill.minutes} min`}
                </option>
              ))}
            </select>
          </label>

          {/* Not in the library? Make one, without leaving the plan. A squad
              drill, yours to reuse and to suggest to the club later. */}
          {!newDrillOpen ? (
            <button
              type="button"
              disabled={saving}
              onClick={() => setNewDrillOpen(true)}
              className="mt-2 text-[12.5px] font-bold text-brand-ink underline"
            >
              + Create a drill
            </button>
          ) : (
            <div className="mt-2.5 rounded-[10px] border border-line p-2.5" data-testid="new-drill">
              <div className="flex flex-wrap items-end gap-2">
                <label className="min-w-0 flex-1">
                  <span className={LABEL}>New drill title</span>
                  <input
                    type="text"
                    aria-label="New drill title"
                    value={newDrill.title}
                    disabled={drillBusy}
                    onChange={(domEvent) => setNewDrill((d) => ({ ...d, title: domEvent.target.value }))}
                    className={INPUT}
                  />
                </label>
                <label className="w-20">
                  <span className={LABEL}>Minutes</span>
                  <input
                    type="number"
                    min={1}
                    max={120}
                    aria-label="New drill minutes"
                    value={newDrill.minutes}
                    disabled={drillBusy}
                    onChange={(domEvent) => setNewDrill((d) => ({ ...d, minutes: domEvent.target.value }))}
                    className={INPUT}
                  />
                </label>
              </div>
              <div className="mt-2 flex flex-wrap items-end gap-2">
                <label className="min-w-0 flex-1">
                  <span className={LABEL}>Category</span>
                  <select
                    aria-label="New drill category"
                    value={newDrill.category}
                    disabled={drillBusy}
                    onChange={(domEvent) => setNewDrill((d) => ({ ...d, category: domEvent.target.value }))}
                    className={INPUT}
                  >
                    {CATEGORIES.map((category) => (
                      <option key={category} value={category}>
                        {CATEGORY_LABELS[category]}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  role="switch"
                  aria-label="New drill is contact"
                  aria-checked={newDrill.requires_contact === true}
                  disabled={drillBusy}
                  onClick={() => setNewDrill((d) => ({ ...d, requires_contact: !d.requires_contact }))}
                  className={[
                    'rounded-[8px] border-[1.5px] px-2.5 py-2 text-[12.5px] font-bold transition',
                    newDrill.requires_contact
                      ? 'border-brand bg-brand text-white'
                      : 'border-line text-ink hover:border-brand hover:text-brand-ink',
                  ].join(' ')}
                >
                  {newDrill.requires_contact ? 'Contact' : 'Tag'}
                </button>
              </div>
              <label className="mt-2 flex items-center gap-2 text-[12.5px] font-semibold text-ink">
                <input
                  type="checkbox"
                  aria-label="Suggest this drill to the club"
                  checked={newDrill.suggest === true}
                  disabled={drillBusy}
                  onChange={() => setNewDrill((d) => ({ ...d, suggest: !d.suggest }))}
                  className="h-4 w-4 accent-[color:var(--brand)]"
                />
                Suggest this to the club library too
              </label>
              <div className="mt-2 flex gap-2">
                <Button size="sm" disabled={drillBusy || !newDrillOk} onClick={saveNewDrill}>
                  {drillBusy ? 'Adding…' : 'Add drill'}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={drillBusy}
                  onClick={() => {
                    setNewDrillOpen(false)
                    setNewDrill(BLANK_DRILL)
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}

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

          {/* Who sees it. draft → staff → squad, the promotion path. */}
          <fieldset className="mt-2.5 border-0 p-0">
            <legend className={LABEL}>Who can see this plan</legend>
            <div role="radiogroup" aria-label="Who can see this plan" className="flex flex-wrap gap-1.5">
              {VISIBILITY.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={visibility === option.value}
                  disabled={saving}
                  onClick={() => setVisibility(option.value)}
                  className={[
                    'rounded-[8px] border-[1.5px] px-2.5 py-1.5 text-[12.5px] font-bold transition',
                    visibility === option.value
                      ? 'border-brand bg-brand text-white'
                      : 'border-line text-ink hover:border-brand hover:text-brand-ink',
                  ].join(' ')}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <p className="mt-1 text-[12px] leading-relaxed text-ink-muted">
              {VISIBILITY.find((v) => v.value === visibility)?.hint}
            </p>
          </fieldset>

          <p className="mt-2 text-[12.5px] font-bold text-ink-muted">Total {total} min</p>

          <div className="mt-2.5 flex gap-2">
            <Button disabled={saving || !minutesOk || blocks.length === 0} onClick={save}>
              {saving ? 'Saving…' : creating ? 'Save plan' : 'Save'}
            </Button>
            <Button variant="ghost" disabled={saving} onClick={creating ? cancelCreate : cancelEdit}>
              Cancel
            </Button>
          </div>

          {!minutesOk && (
            <p className="mt-2 text-[12.5px] font-semibold text-danger-ink">
              Every block needs a whole number of minutes, from 1 to 120.
            </p>
          )}
        </div>
      )}

      {error && (
        <p role="alert" className="mt-2 text-[12.5px] font-semibold text-danger-ink">
          {friendlyMessage(error, "That didn't save. Try again.")}
        </p>
      )}
    </div>
  )
}
