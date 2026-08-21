import { useEffect, useState } from 'react'
import Button from '../components/Button.jsx'
import Card from '../components/Card.jsx'
import Chip from '../components/Chip.jsx'
import Empty from '../components/Empty.jsx'
import Spinner from '../components/Spinner.jsx'
import { listDrills, listTemplates, saveTemplate, setTemplateActive } from '../data/trainingPlans.js'
import { useMemberships } from '../lib/memberships.jsx'
import {
  ageOrNull,
  bandLabel,
  CATEGORY_LABELS,
  DEFAULT_MINUTES,
  drillFitsTemplate,
  textOrNull,
  totalMinutes,
  totalWarning,
} from '../lib/trainingPlans.js'
import TrainingGate from './TrainingGate.jsx'

// The Templates tab of the Rugby Performance Director portal — the hour builder.
// Plan: claude/plans/2026-08-21-training-plans-implementation.md (Task 7).
// Spec: claude/specs/2026-08-21-training-plans-dashboard-design.md
//
// ⚠️ THE HOUR IS A TARGET, NOT A RULE. The running total is always on screen
// and 60 is marked, but a total that is not 60 only ASKS — a wet-night 40 is
// something a coach means, and the thing worth catching is the arithmetic slip
// that makes 65. Nothing here ever refuses to save.
//
// ⚠️ AN UNFIT DRILL IS OFFERED AND REFUSED, NEVER MISSING. A coach who cannot
// find a tackling drill concludes the library is broken; a coach told "Contact
// drill; this template is tag" fixes the template. Same rule as the publish
// preview, and the reasons come from the one place — src/lib/trainingPlans.js.
//
// ⚠️ THE FIT IS CHECKED AGAINST THE DRAFT, NOT THE SAVED ROW. The band and the
// contact switch are being typed into right now; reading the saved template
// would answer last week's question, and on a brand-new template there is no
// saved row to read at all.
//
// ⚠️ RETIRE, NEVER DELETE, AND THERE IS NO DELETE ANYWHERE ON THIS SCREEN. A
// template that has been published is the plan somebody's squad actually ran.
//
// ⚠️ THE `training` RIGHT IS A MESSAGE, NOT A BOUNDARY. TrainingGate decides
// what this screen SAYS; RLS on public.session_templates decides what the
// database hands over and accepts. Every write goes through
// src/data/trainingPlans.js, which turns the RLS zero-row result — a successful
// nothing — into a thrown error, so a refused save is never drawn as a done one.

const INPUT =
  'w-full rounded-[8px] border-[1.5px] border-line bg-surface-card px-3 py-2 text-[16px] text-ink outline-none transition focus:border-brand'
const LABEL = 'mb-1.5 block text-[12.5px] font-bold uppercase tracking-[.4px] text-ink-muted'
const CHIP =
  'rounded-[8px] border-[1.5px] px-2.5 py-1 text-[12.5px] font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2'
const MOVE =
  'rounded-[8px] border-[1.5px] border-line px-2 py-1 text-[13px] font-bold text-ink transition hover:border-brand hover:text-brand disabled:opacity-40 disabled:hover:border-line disabled:hover:text-ink'

const BLANK = { name: '', min_age: '', max_age: '', requires_contact: false, notes: '' }

/** The draft boxes, filled from a template that already exists. */
function draftFrom(template) {
  return {
    name: template.name ?? '',
    min_age: template.min_age == null ? '' : String(template.min_age),
    max_age: template.max_age == null ? '' : String(template.max_age),
    requires_contact: template.requires_contact === true,
    notes: template.notes ?? '',
  }
}

// ⚠️ A DRAFT BLOCK CARRIES THE WHOLE DRILL, NOT JUST ITS id. The row shows the
// title and category, and the fit check needs `requires_contact` and the band —
// looking each one back up out of the library on every keystroke would make the
// builder depend on the library query having finished, which it may not have.
// `key` is a local counter because the same drill may legitimately appear twice
// in one session and an index changes under a move.
let nextKey = 1
function blockFromDrill(drill) {
  return { key: `block-${nextKey++}`, drill, minutes: String(drill.minutes ?? 10), coach_note: '' }
}

function blocksFrom(template) {
  return (template.blocks ?? []).map((block) => ({
    key: `block-${nextKey++}`,
    drill: block.drill,
    minutes: String(block.minutes ?? 10),
    coach_note: block.coach_note ?? '',
  }))
}

function TemplateRow({ template, onSelect, busy }) {
  const retired = template.is_active === false
  // ⚠️ SAID OUT LOUD. The dashed border that marks a retired template and the
  // Contact chip's colour are both invisible to a screen reader, and "is this
  // one still in use, is it contact, and how long is it" is what the row is
  // here to answer.
  const label = [
    template.name,
    `${template.total_minutes ?? 0} minutes`,
    bandLabel(template.min_age, template.max_age),
    template.requires_contact ? 'contact' : null,
    retired ? 'retired' : null,
  ]
    .filter(Boolean)
    .join(', ')

  return (
    <button
      type="button"
      data-testid={`template-${template.id}`}
      aria-label={label}
      disabled={busy}
      onClick={() => onSelect(template)}
      className={[
        'flex w-full flex-col gap-1 border-b border-line px-3.5 py-3 text-left last:border-b-0 transition hover:bg-surface-mute',
        retired ? 'border-dashed opacity-60' : '',
        busy ? 'opacity-60' : '',
      ].join(' ')}
    >
      <span className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-extrabold text-ink">{template.name}</span>
        <Chip>{`${template.total_minutes ?? 0} min`}</Chip>
        <Chip>{bandLabel(template.min_age, template.max_age)}</Chip>
        {template.requires_contact && <Chip>Contact</Chip>}
        {retired && <Chip>Retired</Chip>}
      </span>
      {template.notes && (
        <span className="text-[12.5px] leading-relaxed text-ink-muted">{template.notes}</span>
      )}
    </button>
  )
}

/**
 * One block of the hour.
 *
 * ⚠️ THE CONTROLS INSIDE ARE LABELLED PLAINLY ("Minutes", "Move up") AND THE
 * ROW IS A NAMED GROUP. Five blocks means five controls called "Minutes"; what
 * tells a screen reader — and a test — which one it is on is the group name,
 * not a title spliced into every label.
 */
function BlockRow({ block, index, count, unfit, onChange, onMove, onRemove, busy }) {
  const title = block.drill?.title ?? 'Drill'
  const category = CATEGORY_LABELS[block.drill?.category] ?? block.drill?.category

  return (
    <li
      role="group"
      data-testid={`block-${index}`}
      aria-label={`Block ${index + 1}: ${title}${unfit ? `, ${unfit}` : ''}`}
      className="flex flex-col gap-2 border-b border-line px-3.5 py-3 last:border-b-0"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[12px] font-bold text-ink-faint">{index + 1}</span>
        <span className="text-sm font-extrabold text-ink">{title}</span>
        {category && <Chip>{category}</Chip>}

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
          <Button variant="ghost" disabled={busy} onClick={() => onRemove(index)}>
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

      {/* ⚠️ SHOWN, NOT DROPPED. Narrowing the band under a block that is
          already in the hour does not remove it — somebody put it there on
          purpose, and losing it without a word is worse than saying why it no
          longer fits and letting them decide. */}
      {unfit && (
        <p className="text-[12.5px] font-semibold text-brand-deep">{unfit}</p>
      )}
    </li>
  )
}

function TemplatesBody() {
  // ⚠️ WHERE A NEW TEMPLATE'S club_id COMES FROM. `session_templates.club_id`
  // is NOT NULL and the app has no other handle on "which club is this" — the
  // same source TrainingLibrary uses. If there is somehow no squad in context,
  // Save stays disabled rather than sending null and getting a foreign-key
  // error nobody can read.
  const { teams } = useMemberships()
  const clubId = teams[0]?.club_id ?? null

  const [templates, setTemplates] = useState([])
  const [drills, setDrills] = useState([])
  const [loading, setLoading] = useState(true)
  const [settled, setSettled] = useState(false)
  const [error, setError] = useState(null)
  const [reloadToken, setReloadToken] = useState(0)

  // Not a client-side filter: it changes the query, because the default read
  // never fetches retired templates at all.
  const [includeRetired, setIncludeRetired] = useState(false)

  // The template being edited, or 'new'. null means the builder is closed.
  const [editing, setEditing] = useState(null)
  const [draft, setDraft] = useState(BLANK)
  const [blocks, setBlocks] = useState([])
  const [picked, setPicked] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)

  useEffect(() => {
    let mounted = true
    setLoading(true)
    setError(null)

    Promise.all([listTemplates({ includeRetired }), listDrills()])
      .then(([templateRows, drillRows]) => {
        if (!mounted) return
        setTemplates(templateRows)
        setDrills(drillRows)
      })
      .catch((failure) => {
        if (!mounted) return
        setError(failure)
        setTemplates([])
      })
      .finally(() => {
        if (!mounted) return
        setLoading(false)
        setSettled(true)
      })

    return () => {
      mounted = false
    }
  }, [reloadToken, includeRetired])

  const isFirstLoad = loading && !settled

  // ⚠️ THE DRAFT AS drillFitsTemplate WANTS IT — the boxes as they are right
  // now, not the saved row. One object, built once, used by the picker and by
  // every block row, so the picker and the rows can never disagree.
  const draftTemplate = {
    min_age: ageOrNull(draft.min_age),
    max_age: ageOrNull(draft.max_age),
    requires_contact: draft.requires_contact === true,
  }

  // Minutes live in the boxes as strings; the arithmetic wants numbers, and a
  // half-typed box counts as nothing rather than poisoning the total (NaN).
  const numericBlocks = blocks.map((block) => ({ minutes: Number(block.minutes) }))
  const total = totalMinutes(numericBlocks)
  const warning = totalWarning(numericBlocks)

  function openAdd() {
    setEditing('new')
    setDraft(BLANK)
    setBlocks([])
    setPicked('')
    setConfirming(false)
    setSaveError(null)
  }

  function openEdit(template) {
    setEditing(template)
    setDraft(draftFrom(template))
    setBlocks(blocksFrom(template))
    setPicked('')
    setConfirming(false)
    setSaveError(null)
  }

  function closePanel() {
    setEditing(null)
    setDraft(BLANK)
    setBlocks([])
    setPicked('')
    setConfirming(false)
    setSaveError(null)
  }

  function set(field, value) {
    setDraft((current) => ({ ...current, [field]: value }))
    // Any change to the band or the contact switch changes what the arithmetic
    // and the fit are being asked about, so an outstanding question is stale.
    setConfirming(false)
  }

  function addBlock(drillId) {
    const drill = drills.find((row) => row.id === drillId)
    if (!drill) return
    setBlocks((current) => [...current, blockFromDrill(drill)])
    setConfirming(false)
    // Back to the placeholder, so the same drill can be picked again — a
    // session may legitimately run one drill twice.
    setPicked('')
  }

  function changeBlock(index, field, value) {
    setBlocks((current) =>
      current.map((block, at) => (at === index ? { ...block, [field]: value } : block)),
    )
    setConfirming(false)
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
    setConfirming(false)
  }

  /**
   * ⚠️ THE BUILDER STAYS OPEN, WITH THE TYPING INTACT, ON A REFUSED WRITE. The
   * data layer throws on the RLS zero-row result, and closing here would draw a
   * save that never landed as a completed one — losing a whole hour of blocks
   * somebody just assembled. Same shape as TrainingLibrary's `run`.
   */
  async function run(work) {
    setSaving(true)
    setSaveError(null)
    try {
      await work()
      closePanel()
      setReloadToken((token) => token + 1)
    } catch (failure) {
      setSaveError(failure)
    } finally {
      setSaving(false)
    }
  }

  function doSave() {
    setConfirming(false)

    // ⚠️ A BARE ROW. `blocks` is not a column on session_templates and
    // PostgREST answers 400 on an unknown one; `total_minutes` is the data
    // layer's to compute from the blocks it is handed, so sending our own would
    // be a second opinion that can disagree.
    const row = {
      name: draft.name.trim(),
      min_age: ageOrNull(draft.min_age),
      max_age: ageOrNull(draft.max_age),
      requires_contact: draft.requires_contact === true,
      notes: textOrNull(draft.notes),
    }
    const payload =
      editing === 'new'
        ? { club_id: clubId, ...row }
        : { id: editing.id, club_id: editing.club_id, ...row }

    // The ORDER of this array is the only source of truth for `position` — the
    // data layer renumbers 1..n from it.
    const rows = blocks.map((block) => ({
      drill_id: block.drill.id,
      minutes: Number(block.minutes),
      coach_note: textOrNull(block.coach_note),
    }))

    return run(() => saveTemplate(payload, rows))
  }

  /**
   * ⚠️ THE ASK HAPPENS BEFORE THE SAVE, AND THAT ORDER IS THE POINT. Showing
   * the sentence and saving anyway would look identical on screen and be a
   * different program. It is a question, never a refusal: "Save anyway" is
   * always there, and at exactly 60 there is nothing to ask.
   */
  function attemptSave() {
    if (warning) {
      setConfirming(true)
      return
    }
    doSave()
  }

  // ⚠️ Number.isInteger, NOT Number.isFinite — `minutes` is a smallint with a
  // 1..120 check, and 12.5 is finite. Same test SessionPlan makes.
  const minutesOk = blocks.every((block) => {
    const value = Number(block.minutes)
    return Number.isInteger(value) && value >= 1 && value <= 120
  })
  const canSave =
    draft.name.trim() !== '' && minutesOk && (editing !== 'new' || clubId != null)

  if (isFirstLoad) {
    return (
      <Card className="flex justify-center py-10">
        <Spinner label="Loading the templates…" />
      </Card>
    )
  }

  if (error) {
    return (
      <Card role="alert" className="p-6 text-center">
        <h3 className="text-base font-extrabold text-brand-deep">
          We couldn&apos;t load the templates
        </h3>
        <p className="mt-2 text-sm leading-relaxed text-brand-deep">
          {error.message || 'Something went wrong. Try again.'}
        </p>
        <Button onClick={() => setReloadToken((token) => token + 1)} className="mx-auto mt-4">
          Try again
        </Button>
      </Card>
    )
  }

  return (
    <div>
      <Card className="mb-3.5 p-3.5">
        <div className="flex flex-wrap items-center gap-2.5">
          {/* ⚠️ THIS RE-READS THE DATABASE — retired templates are excluded by
              the QUERY, so showing them is a different question asked of
              Postgres, not a sieve over rows already in hand. */}
          <button
            type="button"
            role="switch"
            aria-label="Show retired"
            aria-checked={includeRetired}
            onClick={() => setIncludeRetired((current) => !current)}
            className={[
              CHIP,
              includeRetired
                ? 'border-brand bg-brand text-white'
                : 'border-line text-ink hover:border-brand hover:text-brand',
            ].join(' ')}
          >
            Show retired
          </button>

          <Button className="ml-auto" onClick={openAdd}>
            Add a template
          </Button>
        </div>
      </Card>

      {templates.length === 0 ? (
        <Card>
          <Empty message="No templates yet." />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          {templates.map((template) => (
            <TemplateRow
              key={template.id}
              template={template}
              onSelect={openEdit}
              busy={saving}
            />
          ))}
        </Card>
      )}

      {editing && (
        <Card className="mt-3.5 p-3.5" data-testid="template-panel">
          <h3 className="mb-2.5 text-[12px] font-extrabold uppercase tracking-[.8px] text-ink-muted">
            {editing === 'new' ? 'Add a template' : `Edit ${editing.name}`}
          </h3>

          <div className="flex flex-col gap-2.5">
            <label>
              <span className={LABEL}>Name</span>
              <input
                type="text"
                aria-label="Template name"
                value={draft.name}
                disabled={saving}
                autoFocus
                onChange={(domEvent) => set('name', domEvent.target.value)}
                placeholder="Tuesday hour"
                className={INPUT}
              />
            </label>

            <div className="flex flex-wrap items-end gap-2.5">
              {/* ⚠️ BLANK IS A REAL ANSWER AT EITHER END — "no youngest" and
                  "no oldest". See ageOrNull. */}
              <label className="w-24">
                <span className={LABEL}>Youngest age</span>
                <input
                  type="number"
                  min={4}
                  max={19}
                  aria-label="Youngest age"
                  value={draft.min_age}
                  disabled={saving}
                  onChange={(domEvent) => set('min_age', domEvent.target.value)}
                  className={INPUT}
                />
              </label>

              <label className="w-24">
                <span className={LABEL}>Oldest age</span>
                <input
                  type="number"
                  min={4}
                  max={19}
                  aria-label="Oldest age"
                  value={draft.max_age}
                  disabled={saving}
                  onChange={(domEvent) => set('max_age', domEvent.target.value)}
                  className={INPUT}
                />
              </label>

              {/* A draft flag, saved with the rest of the boxes — and the thing
                  that decides whether a tackling drill may go in the hour at
                  all, checked against the draft as it is typed. */}
              <div className="ml-auto flex items-center gap-2.5">
                <span className="text-[13px] font-bold text-ink">Contact template</span>
                <button
                  type="button"
                  role="switch"
                  aria-label="Contact template"
                  aria-checked={draft.requires_contact === true}
                  disabled={saving}
                  onClick={() => set('requires_contact', !draft.requires_contact)}
                  className={[
                    CHIP,
                    draft.requires_contact
                      ? 'border-brand bg-brand text-white'
                      : 'border-line text-ink hover:border-brand hover:text-brand',
                  ].join(' ')}
                >
                  {draft.requires_contact ? 'Contact' : 'Tag'}
                </button>
              </div>
            </div>

            <label>
              <span className={LABEL}>Notes</span>
              <textarea
                aria-label="Template notes"
                rows={2}
                value={draft.notes}
                disabled={saving}
                onChange={(domEvent) => set('notes', domEvent.target.value)}
                className={INPUT}
              />
            </label>

            {/* The hour itself. */}
            <div className="rounded-[10px] border-[1.5px] border-line">
              {blocks.length === 0 ? (
                <p className="px-3.5 py-4 text-center text-[12.5px] text-ink-muted">
                  Nothing in this session yet. Add a drill below.
                </p>
              ) : (
                <ul>
                  {blocks.map((block, index) => (
                    <BlockRow
                      key={block.key}
                      block={block}
                      index={index}
                      count={blocks.length}
                      unfit={drillFitsTemplate(block.drill, draftTemplate).reason}
                      onChange={changeBlock}
                      onMove={moveBlock}
                      onRemove={removeBlock}
                      busy={saving}
                    />
                  ))}
                </ul>
              )}
            </div>

            <div className="flex flex-wrap items-end gap-2.5">
              <label className="min-w-0 flex-1">
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
                    // ⚠️ DISABLED WITH THE REASON, NOT FILTERED OUT. The reason
                    // is the library's own sentence, so the picker and the
                    // publish preview can never say different things.
                    const fit = drillFitsTemplate(drill, draftTemplate)
                    const label = `${drill.title} · ${drill.minutes} min`
                    return (
                      <option key={drill.id} value={drill.id} disabled={!fit.ok}>
                        {fit.ok ? label : `${label} — ${fit.reason}`}
                      </option>
                    )
                  })}
                </select>
              </label>

              {/* ⚠️ ALWAYS ON SCREEN WHILE BUILDING, and `aria-live` so the
                  number is announced as it changes rather than only found by
                  somebody who goes looking for it. */}
              <p
                data-testid="running-total"
                aria-live="polite"
                className={[
                  'py-2 text-sm font-extrabold',
                  total === DEFAULT_MINUTES ? 'text-ink' : 'text-brand',
                ].join(' ')}
              >
                {total} / {DEFAULT_MINUTES} min
              </p>
            </div>

            {/* ⚠️ AN INLINE CONFIRM, NOT A BROWSER `confirm()`. It has to be
                readable by a screen reader and testable, and `alertdialog` is
                the role for "something you must answer before going on". */}
            {confirming && warning && (
              <div
                role="alertdialog"
                aria-label="Check the length"
                className="rounded-[10px] border-[1.5px] border-brand bg-surface-mute p-3"
              >
                <p className="text-[13px] font-bold text-ink">{warning}</p>
                <div className="mt-2.5 flex flex-wrap gap-2.5">
                  <Button disabled={saving} onClick={doSave}>
                    Save anyway
                  </Button>
                  <Button variant="ghost" disabled={saving} onClick={() => setConfirming(false)}>
                    Keep editing
                  </Button>
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-2.5">
              <Button disabled={saving || !canSave} onClick={attemptSave}>
                {saving ? 'Saving…' : 'Save template'}
              </Button>

              {/* ⚠️ RETIRE, AND THE WORD "DELETE" APPEARS NOWHERE. */}
              {editing !== 'new' && (
                <Button
                  variant={editing.is_active === false ? 'secondary' : 'dangerQuiet'}
                  disabled={saving}
                  onClick={() =>
                    run(() => setTemplateActive(editing.id, editing.is_active === false))
                  }
                >
                  {editing.is_active === false ? 'Bring back' : 'Retire'}
                </Button>
              )}

              <Button variant="ghost" disabled={saving} onClick={closePanel}>
                Cancel
              </Button>
            </div>
          </div>

          {editing !== 'new' && (
            <p className="mt-2.5 text-[12.5px] leading-relaxed text-ink-muted">
              Retiring takes this template out of the publish picker. Sessions already published
              keep their plan, and it can be brought back at any time.
            </p>
          )}

          {saveError && (
            <p role="alert" className="mt-2.5 text-[12.5px] font-semibold text-brand-deep">
              {saveError.message || "That didn't save. Try again."}
            </p>
          )}
        </Card>
      )}
    </div>
  )
}

// ⚠️ THE GATE WRAPS THE SCREEN, AND THE BODY IS A SEPARATE COMPONENT ON
// PURPOSE. React does not mount children a gate declines to render, so the
// templates and the library are never even REQUESTED for somebody without the
// right — where a single component with an early return inside it would have
// run its effect first. Pinned by tests/training-templates.test.jsx.
export default function TrainingTemplates() {
  return (
    <TrainingGate>
      <TemplatesBody />
    </TrainingGate>
  )
}
