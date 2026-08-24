import { useEffect, useState } from 'react'
import Button from '../components/Button.jsx'
import Card from '../components/Card.jsx'
import Chip from '../components/Chip.jsx'
import Empty from '../components/Empty.jsx'
import Spinner from '../components/Spinner.jsx'
import { listDrills, setDrillActive, upsertDrill } from '../data/trainingPlans.js'
import { useMemberships } from '../lib/memberships.jsx'
import {
  ageDraftProblem,
  ageOrNull,
  bandLabel,
  CATEGORIES,
  CATEGORY_LABELS,
  textOrNull,
} from '../lib/trainingPlans.js'
import TrainingGate from './TrainingGate.jsx'

// The Library tab of the Rugby Performance Director portal — the club's drills.
// Plan: claude/plans/2026-08-21-training-plans-implementation.md (Task 6).
// Spec: claude/specs/2026-08-21-training-plans-dashboard-design.md
//
// ⚠️ THE LIBRARY IS CLUB-WIDE, NOT PER-SQUAD. There is one set of drills and
// every coach draws from it; what keeps a tackling drill off a tag squad is the
// drill's own `requires_contact` and age band, checked at publish time
// (src/lib/trainingPlans.js), never a copy of the library per age group.
//
// ⚠️ THE `training` RIGHT IS A MESSAGE, NOT A BOUNDARY. TrainingGate below
// decides what this screen SAYS; RLS on public.drills decides what the database
// actually hands over and accepts. Every write here goes through
// src/data/trainingPlans.js, which turns the RLS zero-row result — a successful
// nothing — into a thrown error, so a refused save can never be drawn as a
// completed one.
//
// ⚠️ RETIRE, NEVER DELETE, AND THERE IS NO DELETE ANYWHERE ON THIS SCREEN.
// session_template_blocks.drill_id is ON DELETE RESTRICT and
// training_session_blocks holds the same reference: a drill that has ever been
// in a published session is part of what the club actually ran that week.
// Retiring takes it out of the pickers and leaves that history intact.

const INPUT =
  'w-full rounded-[8px] border-[1.5px] border-line bg-surface-card px-3 py-2 text-[16px] text-ink outline-none transition focus:border-brand'
const LABEL = 'mb-1.5 block text-[12.5px] font-bold uppercase tracking-[.4px] text-ink-muted'
const CHIP =
  'rounded-[8px] border-[1.5px] px-2.5 py-1 text-[12.5px] font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2'

const BLANK = {
  title: '',
  summary: '',
  body: '',
  source_name: '',
  source_url: '',
  // The table's own default. Seeding the box with it means a drill nobody
  // times still saves something legal rather than tripping the 1..120 check.
  minutes: '10',
  category: CATEGORIES[0],
  requires_contact: false,
  min_age: '',
  max_age: '',
}

/** The draft boxes, filled from a row that already exists. */
function draftFrom(drill) {
  return {
    title: drill.title ?? '',
    summary: drill.summary ?? '',
    body: drill.body ?? '',
    source_name: drill.source_name ?? '',
    source_url: drill.source_url ?? '',
    minutes: String(drill.minutes ?? 10),
    category: drill.category ?? CATEGORIES[0],
    requires_contact: drill.requires_contact === true,
    min_age: drill.min_age == null ? '' : String(drill.min_age),
    max_age: drill.max_age == null ? '' : String(drill.max_age),
  }
}

function DrillRow({ drill, onSelect, busy }) {
  const retired = drill.is_active === false
  // ⚠️ SAID OUT LOUD. The dashed border that marks a retired drill and the
  // Contact chip's colour are both invisible to a screen reader, and "is this
  // one still in use, and is it contact" is what the row is here to answer.
  const label = [
    drill.title,
    CATEGORY_LABELS[drill.category] ?? drill.category,
    bandLabel(drill.min_age, drill.max_age),
    drill.requires_contact ? 'contact' : null,
    retired ? 'retired' : null,
  ]
    .filter(Boolean)
    .join(', ')

  return (
    <button
      type="button"
      data-testid={`drill-${drill.id}`}
      aria-label={label}
      disabled={busy}
      onClick={() => onSelect(drill)}
      className={[
        'flex w-full flex-col gap-1 border-b border-line px-3.5 py-3 text-left last:border-b-0 transition hover:bg-surface-mute',
        retired ? 'opacity-60' : '',
        busy ? 'opacity-60' : '',
      ].join(' ')}
    >
      <span className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-extrabold text-ink">{drill.title}</span>
        <Chip>{CATEGORY_LABELS[drill.category] ?? drill.category}</Chip>
        <Chip>{bandLabel(drill.min_age, drill.max_age)}</Chip>
        {drill.requires_contact && <Chip>Contact</Chip>}
        {retired && <Chip>Retired</Chip>}
      </span>
      {drill.summary && (
        <span className="text-[12.5px] leading-relaxed text-ink-muted">{drill.summary}</span>
      )}
      <span className="text-[12px] font-bold text-ink-faint">{drill.minutes} min</span>
    </button>
  )
}

function LibraryBody() {
  // ⚠️ WHERE A NEW DRILL'S club_id COMES FROM. `drills.club_id` is NOT NULL, and
  // the app has no other handle on "which club is this" — the same source
  // AdminClub uses for a new league team (`adding.club_id`, a team row). A
  // person with the training right always has at least one squad in context; if
  // they somehow do not, Save stays disabled rather than sending null and
  // getting a foreign-key error nobody can read.
  const { teams } = useMemberships()
  const clubId = teams[0]?.club_id ?? null

  const [drills, setDrills] = useState([])
  const [loading, setLoading] = useState(true)
  const [settled, setSettled] = useState(false)
  const [error, setError] = useState(null)
  const [reloadToken, setReloadToken] = useState(0)

  // Filters. `includeRetired` is NOT a client-side filter: it changes the
  // query, because the default read never fetches retired rows at all.
  const [includeRetired, setIncludeRetired] = useState(false)
  const [categoryFilter, setCategoryFilter] = useState('')
  const [contactFilter, setContactFilter] = useState('any')

  // The drill being edited, or 'new'. null means the panel is closed.
  const [editing, setEditing] = useState(null)
  const [draft, setDraft] = useState(BLANK)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)

  useEffect(() => {
    let mounted = true
    setLoading(true)
    setError(null)

    listDrills({ includeRetired })
      .then((rows) => {
        if (!mounted) return
        setDrills(rows)
      })
      .catch((failure) => {
        if (!mounted) return
        setError(failure)
        setDrills([])
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

  const shown = drills.filter((drill) => {
    if (categoryFilter && drill.category !== categoryFilter) return false
    if (contactFilter === 'contact' && drill.requires_contact !== true) return false
    if (contactFilter === 'tag' && drill.requires_contact === true) return false
    return true
  })

  function openAdd() {
    setEditing('new')
    setDraft(BLANK)
    setSaveError(null)
  }

  function openEdit(drill) {
    setEditing(drill)
    setDraft(draftFrom(drill))
    setSaveError(null)
  }

  function closePanel() {
    setEditing(null)
    setDraft(BLANK)
    setSaveError(null)
  }

  function set(field, value) {
    setDraft((current) => ({ ...current, [field]: value }))
  }

  /**
   * ⚠️ THE PANEL STAYS OPEN, WITH THE TYPING INTACT, ON A REFUSED WRITE. The
   * data layer throws on the RLS zero-row result, and closing here would draw a
   * save that never landed as a completed one — losing everything typed on the
   * way. Same shape as AdminClub's `run`.
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

  function save() {
    const row = {
      title: draft.title.trim(),
      summary: textOrNull(draft.summary),
      body: textOrNull(draft.body),
      source_name: textOrNull(draft.source_name),
      source_url: textOrNull(draft.source_url),
      minutes: Number(draft.minutes),
      category: draft.category,
      requires_contact: draft.requires_contact === true,
      min_age: ageOrNull(draft.min_age),
      max_age: ageOrNull(draft.max_age),
    }

    // ⚠️ club_id GOES ON BOTH BRANCHES. `upsert` sends a whole row, and on the
    // insert path a missing NOT NULL column is a constraint error rather than a
    // no-op — so an edit that omitted it would work only by luck of the
    // conflict path. On an edit it is the drill's OWN club, never the context's,
    // so editing can never move a drill between clubs.
    const payload = editing === 'new'
      ? { club_id: clubId, ...row }
      : { id: editing.id, club_id: editing.club_id, ...row }

    return run(() => upsertDrill(payload))
  }

  const minutes = Number(draft.minutes)
  const minutesOk = Number.isFinite(minutes) && minutes >= 1 && minutes <= 120
  // Caught here so a typo of 99 reads "Ages are 4 to 19", not a raw
  // drills_min_age_check from Postgres. See ageDraftProblem.
  const ageProblem = ageDraftProblem(draft.min_age, draft.max_age)
  const canSave =
    draft.title.trim() !== '' && minutesOk && ageProblem == null && (editing !== 'new' || clubId != null)

  if (isFirstLoad) {
    return (
      <Card className="flex justify-center py-10">
        <Spinner label="Loading the drill library…" />
      </Card>
    )
  }

  if (error) {
    return (
      <Card role="alert" className="p-6 text-center">
        <h3 className="text-base font-extrabold text-danger-ink">We couldn&apos;t load the drills</h3>
        <p className="mt-2 text-sm leading-relaxed text-danger-ink">
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
        <div className="flex flex-wrap items-end gap-2.5">
          <label className="min-w-0">
            {/* ⚠️ "Filter by category", not "Category" — the edit panel below
                has a Category select of its own, and two controls answering to
                the same name is a screen reader (and a test) unable to tell
                which one it is on. */}
            <span className={LABEL}>Filter by category</span>
            <select
              aria-label="Filter by category"
              value={categoryFilter}
              onChange={(domEvent) => setCategoryFilter(domEvent.target.value)}
              className={INPUT}
            >
              <option value="">All categories</option>
              {CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {CATEGORY_LABELS[category]}
                </option>
              ))}
            </select>
          </label>

          {/* Three states of one question, so radios rather than three
              independent toggles: "contact only" and "tag only" at the same
              time is not a thing anybody means. */}
          <div role="radiogroup" aria-label="Contact" className="flex flex-wrap gap-[6px]">
            {[
              ['any', 'Any'],
              ['contact', 'Contact only'],
              ['tag', 'Tag only'],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={contactFilter === value}
                onClick={() => setContactFilter(value)}
                className={[
                  CHIP,
                  contactFilter === value
                    ? 'border-brand bg-brand text-white'
                    : 'border-line text-ink hover:border-brand hover:text-brand-ink',
                ].join(' ')}
              >
                {label}
              </button>
            ))}
          </div>

          {/* ⚠️ THIS ONE RE-READS THE DATABASE. The other filters sieve rows
              already in hand; retired drills are excluded by the QUERY, so
              showing them is a different question asked of Postgres. */}
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
                : 'border-line text-ink hover:border-brand hover:text-brand-ink',
            ].join(' ')}
          >
            Show retired
          </button>

          <Button className="ml-auto" onClick={openAdd}>
            Add a drill
          </Button>
        </div>
      </Card>

      {shown.length === 0 ? (
        <Card>
          <Empty message={drills.length === 0 ? 'No drills yet.' : 'No drills match those filters.'} />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          {shown.map((drill) => (
            <DrillRow key={drill.id} drill={drill} onSelect={openEdit} busy={saving} />
          ))}
        </Card>
      )}

      {editing && (
        <Card className="mt-3.5 p-3.5" data-testid="drill-panel">
          <h3 className="mb-2.5 text-[12px] font-extrabold uppercase tracking-[.8px] text-ink-muted">
            {editing === 'new' ? 'Add a drill' : `Edit ${editing.title}`}
          </h3>

          <div className="flex flex-col gap-2.5">
            <label>
              <span className={LABEL}>Title</span>
              <input
                type="text"
                aria-label="Drill title"
                value={draft.title}
                disabled={saving}
                autoFocus
                onChange={(domEvent) => set('title', domEvent.target.value)}
                placeholder="Chop tackle ladder"
                className={INPUT}
              />
            </label>

            <label>
              {/* One line, for the list row. The full text goes below. */}
              <span className={LABEL}>One-line summary</span>
              <input
                type="text"
                aria-label="One-line summary"
                value={draft.summary}
                disabled={saving}
                onChange={(domEvent) => set('summary', domEvent.target.value)}
                className={INPUT}
              />
            </label>

            <label>
              <span className={LABEL}>The drill</span>
              <textarea
                aria-label="The drill"
                rows={6}
                value={draft.body}
                disabled={saving}
                onChange={(domEvent) => set('body', domEvent.target.value)}
                className={INPUT}
              />
            </label>

            <div className="flex flex-wrap items-end gap-2.5">
              <label className="min-w-0 flex-1">
                <span className={LABEL}>Category</span>
                <select
                  aria-label="Category"
                  value={draft.category}
                  disabled={saving}
                  onChange={(domEvent) => set('category', domEvent.target.value)}
                  className={INPUT}
                >
                  {CATEGORIES.map((category) => (
                    <option key={category} value={category}>
                      {CATEGORY_LABELS[category]}
                    </option>
                  ))}
                </select>
              </label>

              <label className="w-24">
                <span className={LABEL}>Minutes</span>
                <input
                  type="number"
                  min={1}
                  max={120}
                  aria-label="Minutes"
                  value={draft.minutes}
                  disabled={saving}
                  onChange={(domEvent) => set('minutes', domEvent.target.value)}
                  className={INPUT}
                />
              </label>

              {/* ⚠️ BLANK IS A REAL ANSWER AT EITHER END — "no youngest" and
                  "no oldest" are how most drills actually are. See ageOrNull. */}
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
            </div>

            {ageProblem != null && (
              <p role="alert" className="text-[12.5px] font-semibold text-danger-ink">{ageProblem}</p>
            )}

            <div className="flex flex-wrap items-end gap-2.5">
              <label className="min-w-0 flex-1">
                <span className={LABEL}>Where it came from</span>
                <input
                  type="text"
                  aria-label="Source name"
                  value={draft.source_name}
                  disabled={saving}
                  onChange={(domEvent) => set('source_name', domEvent.target.value)}
                  placeholder="World Rugby passport"
                  className={INPUT}
                />
              </label>

              {/* Optional, and a LINK rather than a copied page: the source is
                  somebody else's writing, and pointing at it is the honest form
                  as well as the shorter one. */}
              <label className="min-w-0 flex-1">
                <span className={LABEL}>Link (optional)</span>
                <input
                  type="url"
                  aria-label="Source link"
                  value={draft.source_url}
                  disabled={saving}
                  onChange={(domEvent) => set('source_url', domEvent.target.value)}
                  placeholder="https://…"
                  className={INPUT}
                />
              </label>
            </div>

            {/* ⚠️ A DRAFT FLAG, NOT AN IMMEDIATE WRITE — the opposite of
                AdminClub's contact switch, and for a reason: this drill may not
                exist yet, so there is nothing to write to. It is still a switch
                because it reports a state, and it is saved with the rest of the
                boxes. The flag is what keeps a tackling drill off a tag squad
                at publish time. */}
            <div className="flex items-center justify-between gap-3">
              <span className="text-[13px] font-bold text-ink">Contact drill</span>
              <button
                type="button"
                role="switch"
                aria-label="Contact drill"
                aria-checked={draft.requires_contact === true}
                disabled={saving}
                onClick={() => set('requires_contact', !draft.requires_contact)}
                className={[
                  CHIP,
                  draft.requires_contact
                    ? 'border-brand bg-brand text-white'
                    : 'border-line text-ink hover:border-brand hover:text-brand-ink',
                ].join(' ')}
              >
                {draft.requires_contact ? 'Contact' : 'Tag'}
              </button>
            </div>

            <div className="flex flex-wrap gap-2.5">
              <Button disabled={saving || !canSave} onClick={save}>
                {saving ? 'Saving…' : editing === 'new' ? 'Add drill' : 'Save'}
              </Button>

              {/* ⚠️ RETIRE, AND THE WORD "DELETE" APPEARS NOWHERE. */}
              {editing !== 'new' && (
                <Button
                  variant={editing.is_active === false ? 'secondary' : 'dangerQuiet'}
                  disabled={saving}
                  onClick={() => run(() => setDrillActive(editing.id, editing.is_active === false))}
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
              Retiring takes this drill out of the template builder. Sessions already published
              keep it, and it can be brought back at any time.
            </p>
          )}

          {saveError && (
            <p role="alert" className="mt-2.5 text-[12.5px] font-semibold text-danger-ink">
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
// library is never even REQUESTED for somebody without the right — where a
// single component with an early return inside it would have run its effect
// first. Pinned by tests/training-library.test.jsx.
export default function TrainingLibrary() {
  return (
    <TrainingGate>
      <LibraryBody />
    </TrainingGate>
  )
}
