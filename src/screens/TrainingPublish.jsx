import { useEffect, useState } from 'react'
import Button from '../components/Button.jsx'
import Card from '../components/Card.jsx'
import Chip from '../components/Chip.jsx'
import DatePicker from '../components/DatePicker.jsx'
import Empty from '../components/Empty.jsx'
import Spinner from '../components/Spinner.jsx'
import {
  deleteFocus,
  listFocus,
  listTemplates,
  previewPublish,
  publish,
  upsertFocus,
  listSuggestionUptake,
} from '../data/trainingPlans.js'
import { clubToday } from '../lib/eventFormat.js'
import { useMemberships } from '../lib/memberships.jsx'
import { describePublishRow, describeUptake, squadFitsTemplate, summariseUptake, textOrNull } from '../lib/trainingPlans.js'
import TrainingGate from './TrainingGate.jsx'
import { friendlyMessage } from '../lib/friendlyError.js'

// The Publish tab of the Rugby Performance Director portal — one template onto
// several squads' existing training sessions, and the focus periods that label
// a block of weeks.
// Plan: claude/plans/2026-08-21-training-plans-implementation.md (Task 8).
// Spec: claude/specs/2026-08-21-training-plans-dashboard-design.md
//
// ⛔ NOTHING ON THIS SCREEN KEYS ON A WEEKDAY, AND NOTHING EVER MAY. There is no
// day name here, no getDay(), no "which night does this squad train". Publish is
// a TEMPLATE, some SQUADS and a DATE RANGE; suggest_training finds each squad's
// own training events inside that range and writes the plan onto those. The
// moment a screen decides "training is Tuesday" it is wrong for every squad that
// trains on another night, and it is wrong silently — the sessions it should
// have written simply never appear. See claude/decisions/ on the training
// publish shape; this comment is the guard rail, the tests are the fence.
//
// ⚠️ PREVIEW FIRST, ALWAYS, AND THE BUTTON IS THE PROOF. previewPublish() and
// publish() are the SAME database function with `_preview` flipped, so the
// counts on screen are not an estimate — they are what the write will do. The
// "Publish to N squads" button therefore exists only while the rows on screen
// describe the CURRENT boxes. Change the template, the squads or either date
// and the rows are cleared and the button goes with them: offering to publish
// against a preview of a different question is how somebody overwrites six
// weeks of sessions they never looked at.
//
// ⚠️ AN UNFIT SQUAD IS OFFERED AND REFUSED, NEVER MISSING. Same rule as the
// template builder. A director who cannot find U12 Mixed in the list concludes
// the screen is broken; one told "Contact template; this squad is tag" fixes the
// template. The sentences come from the one place — src/lib/trainingPlans.js.
//
// ⚠️ THE `training` RIGHT IS A MESSAGE, NOT A BOUNDARY. TrainingGate decides what
// this screen SAYS; RLS and suggest_training decide what the database accepts.
// Every write goes through src/data/trainingPlans.js, which turns the RLS
// zero-row result — a successful nothing — into a thrown error, so a refused
// write is never drawn as a done one.

const INPUT =
  'w-full rounded-[8px] border-[1.5px] border-line bg-surface-card px-3 py-2 text-[16px] text-ink outline-none transition focus:border-brand'
const LABEL = 'mb-1.5 block text-[12.5px] font-bold uppercase tracking-[.4px] text-ink-muted'
const CHIP =
  'rounded-[8px] border-[1.5px] px-2.5 py-1 text-[13px] font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50'

/** How far ahead the range reaches by default — four weeks of training. */
const DEFAULT_SPAN_DAYS = 28

function pad(value) {
  return String(value).padStart(2, '0')
}

/**
 * `YYYY-MM-DD` for `<input type="date">`, `days` after the club's today.
 *
 * ⚠️ BUILT FROM clubToday(), NEVER FROM A BARE `new Date()` (design-system.md
 * §7). A reader in London opening this at 22:00 is already on Abu Dhabi's
 * tomorrow, and a range that starts a day early is a range that quietly
 * includes a session nobody meant to touch.
 *
 * ⚠️ THE ARITHMETIC IS IN UTC ON PURPOSE. Date.UTC gives a midnight with no
 * daylight-saving step in it, so "+28 days" is exactly 28 days rather than 27
 * days and 23 hours in a zone that changes clocks. Only the calendar numbers
 * come back out.
 */
function isoDayFromToday(days) {
  const today = clubToday()
  const at = new Date(Date.UTC(today.year, today.month, today.day) + days * 86400000)
  return `${at.getUTCFullYear()}-${pad(at.getUTCMonth() + 1)}-${pad(at.getUTCDate())}`
}

const BLANK_FOCUS = { id: null, team_id: '', title: '', starts_on: '', ends_on: '', notes: '' }

function focusDraftFrom(row) {
  return {
    id: row.id,
    team_id: row.team_id ?? '',
    title: row.title ?? '',
    starts_on: row.starts_on ?? '',
    ends_on: row.ends_on ?? '',
    notes: row.notes ?? '',
  }
}

/** "1 Sep 2026 – 28 Sep 2026", or one end of it when the other is open. */
function rangeLabel(startsOn, endsOn) {
  if (startsOn && endsOn) return `${startsOn} – ${endsOn}`
  if (startsOn) return `from ${startsOn}`
  if (endsOn) return `until ${endsOn}`
  return 'no dates'
}

/**
 * One squad in the checklist.
 *
 * ⚠️ THE REASON IS BESIDE IT, IN WORDS. A greyed chip on its own says "broken";
 * the sentence says which of the two things to change. And the reason is in the
 * accessible name as well as on screen, because a disabled chip is exactly the
 * one a screen-reader user cannot poke at to find out why.
 *
 * Only contact refuses. An out-of-band squad is tickable, with the band said
 * beside it in the muted colour and in the accessible name — age is guidance,
 * not a gate, since 2 Sep 2026.
 */
function SquadChip({ team, checked, fit, ready, busy, onToggle }) {
  const refused = ready && !fit.ok
  const guidance = ready && fit.ok ? fit.guidance : null
  const name = refused ? `${team.name}, ${fit.reason}` : guidance ? `${team.name}, ${guidance}` : team.name

  return (
    <span className="flex flex-col gap-0.5">
      <button
        type="button"
        role="checkbox"
        aria-label={name}
        aria-checked={checked}
        disabled={busy || !ready || !fit.ok}
        onClick={() => onToggle(team.id)}
        className={[
          CHIP,
          checked
            ? 'border-brand bg-brand text-white'
            : 'border-line text-ink hover:border-brand hover:text-brand-ink',
        ].join(' ')}
      >
        {team.name}
      </button>
      {refused && (
        <span className="text-[12px] font-semibold leading-snug text-danger-ink">{fit.reason}</span>
      )}
      {guidance && (
        <span className="text-[12px] font-medium leading-snug text-ink-muted">{guidance}</span>
      )}
    </span>
  )
}

function PublishBody() {
  // ⚠️ WHERE club_id COMES FROM. `training_focus.club_id` is NOT NULL, and the
  // squad the focus is FOR is the only handle the app has on which club it
  // belongs to — so it is read off the chosen squad's row, never guessed.
  const { teams } = useMemberships()

  // Sorted the way every other screen sorts squads: the club's own order first,
  // name only to break a tie. AdminClub does the same.
  const squads = [...(teams ?? [])].sort(
    (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || (a.name ?? '').localeCompare(b.name ?? ''),
  )

  const [templates, setTemplates] = useState([])
  const [focus, setFocus] = useState([])
  const [loading, setLoading] = useState(true)
  const [settled, setSettled] = useState(false)
  const [error, setError] = useState(null)
  const [reloadToken, setReloadToken] = useState(0)

  // The publish boxes.
  const [templateId, setTemplateId] = useState('')
  const [selected, setSelected] = useState([])
  const [from, setFrom] = useState(() => isoDayFromToday(0))
  const [to, setTo] = useState(() => isoDayFromToday(DEFAULT_SPAN_DAYS))

  // The preview. Empty means "no question has been answered for these boxes",
  // which is the whole of the rule that hides the Publish button.
  const [rows, setRows] = useState([])
  // ⚠️ SEPARATE FROM `rows` BECAUSE EMPTY HAS TWO MEANINGS. "Nobody has asked
  // yet" and "the server answered, and the answer was nothing" look identical
  // in `rows`, and only the second one deserves a sentence on screen.
  const [previewed, setPreviewed] = useState(false)
  const [running, setRunning] = useState(false)
  const [publishError, setPublishError] = useState(null)
  const [done, setDone] = useState(null)

  // The uptake card: what the coaches did with what was suggested, for the
  // dates in the boxes above. Asked for on a button, never on every keystroke.
  const [uptake, setUptake] = useState(null) // null = not asked; [] = asked, nothing
  const [uptakeBusy, setUptakeBusy] = useState(false)
  const [uptakeError, setUptakeError] = useState(null)

  // The focus form. null means it is closed.
  const [editingFocus, setEditingFocus] = useState(null)
  const [focusSaving, setFocusSaving] = useState(false)
  const [focusError, setFocusError] = useState(null)
  // The focus period whose Remove is ARMED, or null. Two-step inline confirm
  // (2 Sep 2026 UX review, item 4): the button was `dangerQuiet` and deleted
  // on first press, against Button.jsx's own contract that dangerQuiet arms
  // and danger confirms. Notes on the period were gone with no undo.
  const [confirmingRemove, setConfirmingRemove] = useState(null)

  useEffect(() => {
    let mounted = true
    setLoading(true)
    setError(null)

    Promise.all([listTemplates(), listFocus()])
      .then(([templateRows, focusRows]) => {
        if (!mounted) return
        setTemplates(templateRows)
        setFocus(focusRows)
      })
      .catch((failure) => {
        if (!mounted) return
        setError(failure)
        setTemplates([])
        setFocus([])
      })
      .finally(() => {
        if (!mounted) return
        setLoading(false)
        setSettled(true)
      })

    return () => {
      mounted = false
    }
  }, [reloadToken])

  const isFirstLoad = loading && !settled
  const template = templates.find((row) => row.id === templateId) ?? null

  /**
   * ⚠️ EVERY CHANGE TO THE PUBLISH BOXES COMES THROUGH HERE. The rows on screen
   * answer one exact question — this template, these squads, this range — and
   * the instant any part of that changes they are answering a question nobody
   * is asking any more. One funnel rather than four `setRows([])` calls that a
   * fifth box would forget to add.
   */
  function change(apply) {
    apply()
    setRows([])
    setPreviewed(false)
    setPublishError(null)
    setDone(null)
  }

  function toggleSquad(id) {
    change(() =>
      setSelected((current) =>
        current.includes(id) ? current.filter((one) => one !== id) : [...current, id],
      ),
    )
  }

  /** May this squad run the template on screen right now? No template, no.
   *  Contact is the only refusal; an out-of-band squad is allowed. */
  function fitsChosenTemplate(squad) {
    return template !== null && squadFitsTemplate(squad, template).ok
  }

  /** Squads ticked right now that the club would not have suggested this
   *  template for, by age. Said in a sentence under the chips, never a gate. */
  const outsideBand = template
    ? squads.filter((squad) => selected.includes(squad.id) && squadFitsTemplate(squad, template).guidance)
    : []

  /**
   * ⚠️ THE TEMPLATE BOX PRUNES THE TICKS, AND IT HAS TO. A squad ticked under
   * one template can stop fitting under the next one — and the chip that would
   * let somebody untick it is DISABLED the moment it stops fitting, so the
   * ticked-but-unfit state is one the user cannot get out of. It would then
   * ride along into suggest_training, whose server-side check covers contact
   * only (the age check was always client-side, and since 2 Sep 2026 age is
   * guidance and not checked at all). Prune on the way in, and derive
   * `teamIds` from the fit as well (below) so that a future path into
   * `selected` that forgets to prune still cannot publish a contact hour to a
   * tag squad.
   */
  function chooseTemplate(nextId) {
    const next = templates.find((row) => row.id === nextId) ?? null
    change(() => {
      setTemplateId(nextId)
      setSelected((current) =>
        current.filter((id) => {
          const squad = squads.find((one) => one.id === id)
          return squad != null && next !== null && squadFitsTemplate(squad, next).ok
        }),
      )
    })
  }

  // ⚠️ IN THE ORDER THE SQUADS ARE DRAWN IN, not in click order. The array goes
  // straight to the database function, and an argument list that reshuffles
  // itself depending on which chip somebody tapped first makes two identical
  // publishes look like different ones in a log. `squads` is already sorted by
  // sort_order, so filtering it is what keeps that order.
  //
  // ⚠️ AND FIT IS PART OF THE FILTER, not only of whether the chip is clickable.
  // See chooseTemplate() above: the server does not check, so an unfit squad
  // must not be able to reach the argument list by any route.
  const teamIds = squads
    .filter((squad) => selected.includes(squad.id) && fitsChosenTemplate(squad))
    .map((squad) => squad.id)

  const args = { templateId, teamIds, from, to }
  const canRun = templateId !== '' && teamIds.length > 0 && from !== '' && to !== ''

  async function doPreview() {
    setRunning(true)
    setPublishError(null)
    setDone(null)
    try {
      setRows(await previewPublish(args))
      setPreviewed(true)
    } catch (failure) {
      setPublishError(failure)
      setRows([])
      setPreviewed(false)
    } finally {
      setRunning(false)
    }
  }

  /**
   * ⚠️ THE SAME `args` OBJECT THE PREVIEW WAS BUILT FROM. Re-reading the boxes
   * here would be a second opinion that can disagree with the one on screen —
   * and the only moment it would disagree is the moment it matters.
   */
  async function loadUptake() {
    setUptakeBusy(true)
    setUptakeError(null)
    try {
      setUptake(summariseUptake(await listSuggestionUptake({ from, to })))
    } catch (failure) {
      setUptakeError(failure)
      setUptake(null)
    } finally {
      setUptakeBusy(false)
    }
  }

  async function doPublish() {
    setRunning(true)
    setPublishError(null)
    try {
      const result = await publish(args)
      // ⚠️ SQUADS THAT ACTUALLY GOT SOMETHING, not rows returned. A squad with
      // no training in the range comes back as a row too, and counting rows
      // told a director the plan had reached a squad whose sessions were never
      // touched — the one sentence they had to go on, and it was wrong.
      // Since 2 Sep 2026 the thing that reaches a squad is a SUGGESTION its
      // coaches accept or decline; nothing here writes a plan.
      const squadCount = result.filter((row) => (row.will_suggest ?? 0) > 0).length
      const written = result.reduce((sum, row) => sum + (row.will_suggest ?? 0), 0)
      const unchanged = result.reduce((sum, row) => sum + (row.unchanged ?? 0), 0)
      setDone(
        `Suggested to ${squadCount} ${squadCount === 1 ? 'squad' : 'squads'} — ${written} ${
          written === 1 ? 'session' : 'sessions'
        }${unchanged > 0 ? `, ${unchanged} already had it` : ''}. The coaches decide from here.`,
      )
      // The preview described what WOULD happen; it has happened. Leaving the
      // button up would invite a second identical publish.
      setRows([])
      setPreviewed(false)
    } catch (failure) {
      setPublishError(failure)
    } finally {
      setRunning(false)
    }
  }

  /**
   * ⚠️ THE FORM STAYS OPEN, WITH THE TYPING INTACT, ON A REFUSED WRITE. The data
   * layer throws on the RLS zero-row result, and closing here would draw a save
   * that never landed as a completed one. Same shape as TrainingTemplates' `run`.
   */
  async function run(work) {
    setFocusSaving(true)
    setFocusError(null)
    try {
      await work()
      setEditingFocus(null)
      setReloadToken((token) => token + 1)
    } catch (failure) {
      setFocusError(failure)
    } finally {
      setFocusSaving(false)
    }
  }

  function setFocusField(field, value) {
    setEditingFocus((current) => ({ ...current, [field]: value }))
  }

  function saveFocus() {
    const squad = squads.find((one) => one.id === editingFocus.team_id)
    const payload = {
      club_id: squad?.club_id ?? null,
      team_id: editingFocus.team_id,
      title: editingFocus.title.trim(),
      starts_on: editingFocus.starts_on || null,
      ends_on: editingFocus.ends_on || null,
      notes: textOrNull(editingFocus.notes),
    }
    // ⚠️ `id` ONLY WHEN THERE IS ONE. An upsert handed `id: null` asks Postgres
    // to insert a null primary key rather than to add a row.
    if (editingFocus.id) payload.id = editingFocus.id
    return run(() => upsertFocus(payload))
  }

  // ⚠️ BOTH DATES ARE REQUIRED, AND THEY MUST BE THE RIGHT WAY ROUND. The
  // columns are `starts_on`/`ends_on NOT NULL` with `check (ends_on >=
  // starts_on)`, so a blank or reversed pair reaches the user as a raw
  // Postgres message about a constraint nobody has heard of. ISO date strings
  // (yyyy-mm-dd, which is what a date input gives us) compare correctly as
  // strings, so no Date object is needed to order them.
  const datesReversed =
    editingFocus !== null &&
    editingFocus.starts_on !== '' &&
    editingFocus.ends_on !== '' &&
    editingFocus.ends_on < editingFocus.starts_on

  const canSaveFocus =
    editingFocus !== null &&
    editingFocus.title.trim() !== '' &&
    editingFocus.team_id !== '' &&
    editingFocus.starts_on !== '' &&
    editingFocus.ends_on !== '' &&
    !datesReversed

  function squadName(id) {
    return squads.find((one) => one.id === id)?.name ?? 'Unknown squad'
  }

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
        <h3 className="text-base font-extrabold text-danger-ink">
          We couldn&apos;t load this screen
        </h3>
        <p className="mt-2 text-sm leading-relaxed text-danger-ink">
          {friendlyMessage(error, 'Something went wrong. Try again.')}
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
        <h3 className="mb-2.5 text-[12px] font-extrabold uppercase tracking-[.8px] text-ink-muted">
          Publish a template
        </h3>

        <div className="flex flex-col gap-2.5">
          <label>
            <span className={LABEL}>Template</span>
            {/* Retired templates are excluded by the QUERY — listTemplates()
                without includeRetired never fetches them. */}
            <select
              aria-label="Template"
              value={templateId}
              disabled={running}
              onChange={(domEvent) => chooseTemplate(domEvent.target.value)}
              className={INPUT}
            >
              <option value="">Choose a template…</option>
              {templates.map((row) => (
                <option key={row.id} value={row.id}>
                  {`${row.name} · ${row.total_minutes ?? 0} min`}
                </option>
              ))}
            </select>
          </label>

          <div role="group" aria-label="Squads">
            <span className={LABEL}>Squads</span>
            {squads.length === 0 ? (
              <p className="text-[12.5px] text-ink-muted">No squads to publish to.</p>
            ) : (
              <div className="flex flex-wrap items-start gap-2.5">
                {squads.map((squad) => (
                  <SquadChip
                    key={squad.id}
                    team={squad}
                    checked={selected.includes(squad.id)}
                    // ⚠️ CHECKED AGAINST THE TEMPLATE ON SCREEN RIGHT NOW.
                    // With none chosen there is no question to answer, so the
                    // chips are simply not ready rather than being told a
                    // reason that is about the template rather than the squad.
                    fit={template ? squadFitsTemplate(squad, template) : { ok: true, reason: null, guidance: null }}
                    ready={template !== null}
                    busy={running}
                    onToggle={toggleSquad}
                  />
                ))}
              </div>
            )}
            {!template && (
              <p className="mt-1.5 text-[12.5px] text-ink-muted">
                Choose a template first — which squads it suits depends on it.
              </p>
            )}
            {/* Said once, in a sentence, so the director chooses it knowingly.
                It is a note and not a gate: the chips above are ticked. */}
            {outsideBand.length > 0 && (
              <p role="status" className="mt-1.5 text-[12.5px] font-medium text-ink-muted">
                {`${outsideBand.length} ${outsideBand.length === 1 ? 'squad is' : 'squads are'} outside this template's band — publishing anyway is your call.`}
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-end gap-2.5">
            {/* ⛔ A RANGE, NOT A NIGHT. See the header of this file. */}
            {/* ⚠️ min-w-[150px], NOT min-w-0 — a date field needs ~150px for
                "17 Sep 2026", and min-w-0 lets flex-1 shrink it past that instead
                of letting the wrap engage. On a phone (admin renders at every
                width since retheme phase 4) the pair stacks; on desktop it
                still shares the row. Same fix on the focus pair below.
                The app's own DatePicker, not the native box (2 Sep 2026 UX
                review, Low): the native one commits a date on a month swipe. */}
            <label className="min-w-[150px] flex-1">
              <span className={LABEL}>From</span>
              <DatePicker
                id="publish-from"
                value={from}
                disabled={running}
                onChange={(next) => change(() => setFrom(next))}
              />
            </label>
            <label className="min-w-[150px] flex-1">
              <span className={LABEL}>To</span>
              <DatePicker
                id="publish-to"
                value={to}
                disabled={running}
                onChange={(next) => change(() => setTo(next))}
              />
            </label>
          </div>

          <div className="flex flex-wrap gap-2.5">
            <Button disabled={running || !canRun} onClick={doPreview}>
              {running ? 'Working…' : 'Preview'}
            </Button>

            {/* ⚠️ THE BUTTON *IS* THE RULE. It is not disabled-when-empty; it
                does not exist until a preview for these exact boxes does. */}
            {rows.length > 0 && (
              <Button variant="secondary" disabled={running} onClick={doPublish}>
                {`Suggest to ${teamIds.length} ${teamIds.length === 1 ? 'squad' : 'squads'}`}
              </Button>
            )}
          </div>

          {rows.length > 0 && (
            <ul className="rounded-[10px] border-[1.5px] border-line">
              {rows.map((row) => (
                <li
                  key={row.team_id}
                  data-testid={`preview-${row.team_id}`}
                  className="flex flex-wrap items-center gap-2 border-b border-line px-3.5 py-2.5 last:border-b-0"
                >
                  <span className="text-sm font-extrabold text-ink">{squadName(row.team_id)}</span>
                  <span className="text-[12.5px] text-ink-muted">{describePublishRow(row)}</span>
                </li>
              ))}
            </ul>
          )}

          {/* ⚠️ AN ANSWER OF "NOTHING" IS STILL AN ANSWER, AND MUST LOOK LIKE
              ONE. Preview returning no rows used to draw exactly what "I have
              not pressed it yet" draws, so the screen appeared to have ignored
              the button. */}
          {previewed && rows.length === 0 && (
            <p role="status" className="text-[12.5px] text-ink-muted">
              Nothing to preview — pick a template and at least one squad.
            </p>
          )}

          {done && (
            <p aria-live="polite" className="text-[13px] font-bold text-ink">
              {done}
            </p>
          )}

          {publishError && (
            <p role="alert" className="text-[12.5px] font-semibold text-danger-ink">
              {friendlyMessage(publishError, "That didn't run. Try again.")}
            </p>
          )}
        </div>
      </Card>

      {/* ⚠️ UPTAKE, NOT A WRITE COUNT. Since 2 Sep 2026 a publish is a
          suggestion, and the honest measure of whether the programme landed
          is what the coaches did with it. Per squad, for the dates in the
          boxes above: accepted (and how many were then adjusted), declined
          with the coaches' reasons, unanswered. */}
      <Card className="mb-3.5 p-3.5" data-testid="uptake-card">
        <div className="mb-2.5 flex flex-wrap items-center gap-2.5">
          <h3 className="text-[12px] font-extrabold uppercase tracking-[.8px] text-ink-muted">
            Uptake
          </h3>
          <Button
            className="ml-auto"
            size="sm"
            variant="secondary"
            disabled={uptakeBusy || from === '' || to === ''}
            onClick={loadUptake}
          >
            {uptakeBusy ? 'Working…' : uptake === null ? 'Show uptake' : 'Refresh'}
          </Button>
        </div>
        {uptake === null && !uptakeError && (
          <p className="text-[12.5px] text-ink-muted">
            What the coaches did with the suggestions for {from || '…'} to {to || '…'}.
          </p>
        )}
        {uptakeError && (
          <p role="alert" className="text-[12.5px] font-semibold text-danger-ink">
            {friendlyMessage(uptakeError, "Couldn't load the uptake. Try again.")}
          </p>
        )}
        {uptake !== null && uptake.length === 0 && (
          <p role="status" className="text-[12.5px] text-ink-muted">
            Nothing suggested for those dates.
          </p>
        )}
        {uptake !== null && uptake.length > 0 && (
          <ul className="rounded-[10px] border-[1.5px] border-line">
            {uptake.map((bucket) => (
              <li
                key={bucket.team_id}
                data-testid={`uptake-${bucket.team_id}`}
                className="flex flex-col gap-1 border-b border-line px-3.5 py-2.5 last:border-b-0"
              >
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-extrabold text-ink">{squadName(bucket.team_id)}</span>
                  <span className="text-[12.5px] text-ink-muted">{describeUptake(bucket)}</span>
                </span>
                {bucket.notes.length > 0 && (
                  <ul className="text-[12.5px] text-ink-muted">
                    {bucket.notes.map((note, index) => (
                      <li key={index}>“{note}”</li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="p-3.5">
        <div className="mb-2.5 flex flex-wrap items-center gap-2.5">
          <h3 className="text-[12px] font-extrabold uppercase tracking-[.8px] text-ink-muted">
            Focus
          </h3>
          <Button
            className="ml-auto"
            disabled={focusSaving}
            onClick={() => {
              setFocusError(null)
              setEditingFocus(BLANK_FOCUS)
            }}
          >
            Add a focus
          </Button>
        </div>

        {focus.length === 0 ? (
          <Empty message="No focus periods yet." />
        ) : (
          <ul className="rounded-[10px] border-[1.5px] border-line">
            {focus.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-center gap-2 border-b border-line px-3.5 py-2.5 last:border-b-0"
              >
                <span className="text-sm font-extrabold text-ink">{row.title}</span>
                <Chip>{squadName(row.team_id)}</Chip>
                <span className="text-[12.5px] text-ink-muted">
                  {rangeLabel(row.starts_on, row.ends_on)}
                </span>
                <span className="ml-auto flex gap-1.5">
                  <Button
                    variant="ghost"
                    aria-label={`Edit ${row.title}`}
                    disabled={focusSaving}
                    onClick={() => {
                      setFocusError(null)
                      setEditingFocus(focusDraftFrom(row))
                    }}
                  >
                    Edit
                  </Button>
                  {/* ⚠️ THROUGH `run()`, like every other write. deleteFocus
                      throws on the RLS zero-row delete, and this is what turns
                      that into a sentence instead of a silent success. */}
                  {confirmingRemove === row.id ? (
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-[12.5px] font-semibold text-danger-ink">
                        Remove {row.title}?
                      </span>
                      <Button
                        variant="danger"
                        aria-label={`Yes, remove ${row.title}`}
                        disabled={focusSaving}
                        onClick={() =>
                          run(() => deleteFocus(row.id)).finally(() => setConfirmingRemove(null))
                        }
                      >
                        Yes, remove
                      </Button>
                      <Button
                        variant="ghost"
                        disabled={focusSaving}
                        onClick={() => setConfirmingRemove(null)}
                      >
                        Keep
                      </Button>
                    </span>
                  ) : (
                    <Button
                      variant="dangerQuiet"
                      aria-label={`Remove ${row.title}`}
                      disabled={focusSaving}
                      onClick={() => setConfirmingRemove(row.id)}
                    >
                      Remove
                    </Button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}

        {editingFocus && (
          <div className="mt-3.5 flex flex-col gap-2.5" data-testid="focus-panel">
            <label>
              <span className={LABEL}>Squad</span>
              <select
                aria-label="Focus squad"
                value={editingFocus.team_id}
                disabled={focusSaving}
                onChange={(domEvent) => setFocusField('team_id', domEvent.target.value)}
                className={INPUT}
              >
                <option value="">Choose a squad…</option>
                {squads.map((squad) => (
                  <option key={squad.id} value={squad.id}>
                    {squad.name}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span className={LABEL}>Title</span>
              <input
                type="text"
                aria-label="Focus title"
                value={editingFocus.title}
                disabled={focusSaving}
                onChange={(domEvent) => setFocusField('title', domEvent.target.value)}
                placeholder="Breakdown block"
                className={INPUT}
              />
            </label>

            <div className="flex flex-wrap items-end gap-2.5">
              <label className="min-w-[150px] flex-1">
                <span className={LABEL}>Starts</span>
                <DatePicker
                  id="focus-starts"
                  value={editingFocus.starts_on}
                  disabled={focusSaving}
                  onChange={(next) => setFocusField('starts_on', next)}
                />
              </label>
              <label className="min-w-[150px] flex-1">
                <span className={LABEL}>Ends</span>
                <DatePicker
                  id="focus-ends"
                  value={editingFocus.ends_on}
                  disabled={focusSaving}
                  onChange={(next) => setFocusField('ends_on', next)}
                />
              </label>
            </div>

            <label>
              <span className={LABEL}>Notes</span>
              <textarea
                aria-label="Focus notes"
                rows={2}
                value={editingFocus.notes}
                disabled={focusSaving}
                onChange={(domEvent) => setFocusField('notes', domEvent.target.value)}
                className={INPUT}
              />
            </label>

            {datesReversed && (
              <p className="text-[12.5px] font-semibold text-danger-ink">
                Ends can&apos;t be before it starts
              </p>
            )}
            <div className="flex flex-wrap gap-2.5">
              <Button disabled={focusSaving || !canSaveFocus} onClick={saveFocus}>
                {focusSaving ? 'Saving…' : 'Save focus'}
              </Button>
              <Button variant="ghost" disabled={focusSaving} onClick={() => setEditingFocus(null)}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {focusError && (
          <p role="alert" className="mt-2.5 text-[12.5px] font-semibold text-danger-ink">
            {friendlyMessage(focusError, "That didn't save. Try again.")}
          </p>
        )}
      </Card>
    </div>
  )
}

// ⚠️ THE GATE WRAPS THE SCREEN, AND THE BODY IS A SEPARATE COMPONENT ON PURPOSE.
// React does not mount children a gate declines to render, so the templates and
// the focus rows are never even REQUESTED for somebody without the right — where
// a single component with an early return inside it would have run its effect
// first. Pinned by tests/training-publish.test.jsx.
export default function TrainingPublish() {
  return (
    <TrainingGate>
      <PublishBody />
    </TrainingGate>
  )
}
