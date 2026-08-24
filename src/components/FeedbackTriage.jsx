import { useCallback, useEffect, useState } from 'react'
import Card from './Card.jsx'
import Empty from './Empty.jsx'
import Spinner from './Spinner.jsx'
import Button from './Button.jsx'
import { useAuth } from '../lib/auth.jsx'
import {
  listFeedback,
  setFeedbackStatus,
  deleteFeedback,
  subscribeFeedback,
  feedbackRef,
  FEEDBACK_STATUSES,
  FEEDBACK_STATUS_LABELS,
  OPEN_STATUSES,
} from '../data/feedback.js'

// What members have reported, and what has been done about it.
// Design: claude/plans/2026-08-18-help-and-feedback.md.
//
// ══ ⚠️ THIS SCREEN IS THE RECORD. THE E-MAIL IS A PROMPT ═════════════════
//
// An earlier draft of the plan had no admin surface at all: the notification
// carried `Reply-To: <reporter>`, and the argument was that a mail client is a
// serviceable triage tool. Jay, 18 Aug 2026: *"keep everything in one place
// instead of emails"*. He is right, and this app had already settled it once —
// supabase/functions/notify-approval/index.ts says the screen is the source of
// truth and the mail is a prompt to go and look.
//
// An inbox cannot answer "which of these have I dealt with", because the only
// record of that is whether somebody remembers replying.
//
// ⚠️ NOTHING HERE FILTERS BY CLUB, AND THAT IS DELIBERATE. RLS decides what
// comes back. A club filter in the query would read as though it were the
// control, and removing it as redundant would change nothing — which is how a
// filter gets mistaken for a policy.

// ⚠️ IMPORTED, NOT REDECLARED. The member sees these same words on their own
// report in HelpSheet.jsx, and two copies would drift invisibly — nobody sees
// both screens at once.
const STATUS_LABELS = FEEDBACK_STATUS_LABELS

const KIND_LABELS = { bug: 'Problem', idea: 'Suggestion' }

/** Reports still wanting somebody's attention — what the heading counts. */
export function openCount(rows) {
  return (rows ?? []).filter((row) => OPEN_STATUSES.includes(row.status)).length
}

/**
 * What the list shows. Resolved reports are HIDDEN by default.
 *
 * ⚠️ HIDING IS THE ANSWER TO "I CANNOT DELETE THESE", AND DELETING IS NOT.
 * Jay asked for both on 19 Aug 2026, and they solve different problems: this
 * one makes the list usable, `deleteFeedback` destroys evidence. If the only
 * way to get a clean screen were the destructive one, people would use the
 * destructive one — so the tidy list must not cost anything.
 *
 * ⚠️ FILTERED HERE, NOT IN THE QUERY. `listFeedback()` still fetches
 * everything, because the heading counts totals and the toggle has to be able
 * to show them without a second round trip. At this volume that is free; if it
 * ever is not, the count is what needs rethinking, not this filter.
 */
export function visibleReports(rows, showResolved) {
  if (showResolved) return rows ?? []
  return (rows ?? []).filter((row) => OPEN_STATUSES.includes(row.status))
}

function ReportRow({ row, onStatus, onNote, onDelete, busy }) {
  const who = row.profiles?.full_name ?? 'A member'
  // Local while typing; committed on Save. A controlled field writing straight
  // through would fire an update on every keystroke.
  const [note, setNote] = useState(row.admin_note ?? '')
  const [noteSaved, setNoteSaved] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const dirty = note !== (row.admin_note ?? '')

  return (
    <div className="border-b border-line p-3 last:border-b-0">
      <div className="mb-1 flex items-center gap-2">
        <span className="font-condensed text-[13px] font-bold uppercase tracking-[0.08em] text-ink-muted">
          {KIND_LABELS[row.kind] ?? row.kind}
        </span>
        <span className="text-[13px] text-ink-faint">{feedbackRef(row.ref)}</span>
        {row.route && <span className="text-[13px] text-ink-faint">· {row.route}</span>}
      </div>

      {/* The member's own words, unedited. The column grants stop an admin
          rewriting them; this just presents them as what they are. */}
      <p className="mb-1 text-[15px] text-ink">{row.body}</p>

      {/* ⚠️ THE NAME IS HERE BECAUSE JAY ASKED FOR IT (18 Aug 2026). Knowing
          who reported something is most of knowing what they meant. */}
      <p className="mb-2 text-[13px] text-ink-faint">{who}</p>

      <label className="sr-only" htmlFor={`feedback-status-${row.id}`}>
        Status for {feedbackRef(row.ref)}
      </label>
      <select
        id={`feedback-status-${row.id}`}
        value={row.status}
        disabled={busy}
        onChange={(e) => onStatus(row, e.target.value)}
        className="min-h-[44px] rounded-[11px] border-[1.5px] border-line bg-surface-card px-3 text-[15px] text-ink focus:border-brand focus:outline-none"
      >
        {FEEDBACK_STATUSES.map((status) => (
          <option key={status} value={status}>
            {STATUS_LABELS[status] ?? status}
          </option>
        ))}
      </select>

      {/* ⚠️ THIS IS THE REPLY, AND IT IS THE ONLY ONE. Jay, 18 Aug 2026, chose
          in-app over a second e-mail: "in app only". So whatever is typed here
          is what the reporter reads, on their own report, behind the same `?`
          they used to send it. Nothing else tells them anything. */}
      <div className="mt-2">
        <label
          htmlFor={`feedback-note-${row.id}`}
          className="mb-1 block text-[13px] font-semibold text-ink-muted"
        >
          Reply to {who.split(' ')[0]}
        </label>
        <textarea
          id={`feedback-note-${row.id}`}
          value={note}
          disabled={busy}
          onChange={(e) => {
            setNote(e.target.value)
            setNoteSaved(false)
          }}
          rows={2}
          placeholder="They see this on their own report in the app."
          className="w-full rounded-[11px] border-[1.5px] border-line px-3 py-2 text-[15px] text-ink focus:border-brand focus:outline-none"
        />
        <div className="mt-1 flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={busy || !dirty}
            onClick={async () => {
              await onNote(row, note)
              setNoteSaved(true)
            }}
          >
            Save reply
          </Button>
          {noteSaved && !dirty && (
            <span role="status" className="text-[13px] font-semibold text-accent-ink">
              Saved
            </span>
          )}
        </div>
      </div>

      {/* ⚠️ TWO STEPS, AND `dangerQuiet` ARMS BEFORE `danger` CONFIRMS. The
          house pattern — Button.jsx spells out why, and RESTORE.md rules out a
          native confirm(). A single red button that deletes on first press is
          exactly what this shape exists to prevent.

          ⚠️ THE WARNING NAMES THE PERSON, NOT THE ROW. "It disappears for
          them too" is the fact an admin needs and cannot otherwise know:
          `feedback read` admits submitted_by = auth.uid(), so the reporter can
          see this on /my-reports until the moment it stops existing, with no
          notification and no audit row anywhere. */}
      <div className="mt-3 border-t border-line pt-2.5">
        {confirmingDelete ? (
          <div>
            <p className="mb-2 text-[13px] text-ink-muted">
              Delete {feedbackRef(row.ref)} for good? It disappears for {who.split(' ')[0]} too, and
              there is no undo. To close something that was dealt with, set it to Done instead.
            </p>
            <div className="flex gap-2.5">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={busy}
                onClick={() => setConfirmingDelete(false)}
              >
                Keep it
              </Button>
              <Button
                type="button"
                size="sm"
                variant="danger"
                disabled={busy}
                onClick={() => onDelete(row)}
              >
                Yes, delete
              </Button>
            </div>
          </div>
        ) : (
          <Button
            type="button"
            size="sm"
            variant="dangerQuiet"
            disabled={busy}
            onClick={() => setConfirmingDelete(true)}
          >
            Delete
          </Button>
        )}
      </div>
    </div>
  )
}

export default function FeedbackTriage() {
  const { user } = useAuth()
  const [rows, setRows] = useState(null)
  const [error, setError] = useState(null)
  const [busyId, setBusyId] = useState(null)
  const [showResolved, setShowResolved] = useState(false)

  const load = useCallback(async () => {
    setError(null)
    try {
      setRows(await listFeedback())
    } catch (err) {
      setError(err?.message || 'Could not load reports.')
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // ⚠️ A NEW REPORT APPEARS WITHOUT A REFRESH — AND THIS IS HALF OF THAT.
  // The other half is `feedback` being in the `supabase_realtime` publication;
  // without it this opens a correct-looking channel that receives nothing, with
  // no error anywhere. That is not hypothetical: it is what `availability` did
  // from the day it was written until 18 Aug 2026.
  // See db/migrations/20260818_realtime_availability_and_feedback.sql.
  //
  // ⚠️ RE-READ RATHER THAN PATCH FROM THE PAYLOAD. The payload is one row and
  // carries no joined `profiles`, so applying it directly would blank the
  // reporter's name on whichever row just changed. The re-read is RLS-scoped
  // and cheap at this volume.
  useEffect(() => subscribeFeedback(() => load()), [load])

  async function saveNote(row, adminNote) {
    setBusyId(row.id)
    setError(null)
    try {
      // ⚠️ THE STATUS GOES WITH IT UNCHANGED. setFeedbackStatus is the only
      // write path, and it always stamps handled_by/handled_at — which is
      // correct here too: writing a reply IS handling it.
      await setFeedbackStatus(row.id, row.status, { adminNote, actorId: user?.id })
      setRows((current) =>
        (current ?? []).map((r) => (r.id === row.id ? { ...r, admin_note: adminNote } : r)),
      )
    } catch (err) {
      await load()
      setError(err?.message || 'That reply did not save.')
    } finally {
      setBusyId(null)
    }
  }

  async function changeStatus(row, status) {
    setBusyId(row.id)
    setError(null)
    // ⚠️ OPTIMISTIC, THEN RECONCILED. The select has already moved in the DOM,
    // so leaving state behind until the round trip finishes makes the control
    // snap back and forth. On failure the reload below puts the truth back.
    setRows((current) =>
      (current ?? []).map((r) => (r.id === row.id ? { ...r, status } : r)),
    )
    try {
      await setFeedbackStatus(row.id, status, { actorId: user?.id })
    } catch (err) {
      // ⚠️ RELOAD FIRST, THEN REPORT — AND THE ORDER IS A BUG THAT WAS CAUGHT
      // BY A TEST, NOT BY READING. `load()` clears the error on its way in, so
      // setting the message first meant the reload wiped it: the select
      // silently snapped back to its old value with nothing on screen, which
      // is precisely how somebody believes they closed a report they did not.
      await load()
      setError(err?.message || 'That status did not save.')
    } finally {
      setBusyId(null)
    }
  }

  async function removeReport(row) {
    setBusyId(row.id)
    setError(null)
    try {
      await deleteFeedback(row.id)
      // ⚠️ DROPPED FROM STATE RATHER THAN RELOADED. The realtime subscription
      // will fire a reload anyway, but a DELETE payload under replica identity
      // DEFAULT carries only the id — so waiting for it would leave the row on
      // screen for a round trip after the person confirmed. Removing it here
      // makes the confirm feel like it did something.
      setRows((current) => (current ?? []).filter((r) => r.id !== row.id))
    } catch (err) {
      // ⚠️ RELOAD FIRST, THEN REPORT — the same ordering bug changeStatus
      // documents. load() clears the error on its way in, so setting the
      // message first means the reload wipes it and the row silently
      // reappears with nothing on screen to say why.
      await load()
      setError(err?.message || 'That report was not deleted.')
    } finally {
      setBusyId(null)
    }
  }

  if (error && !rows) {
    return (
      <Card className="p-3">
        <p className="text-sm text-ink">{error}</p>
        <button type="button" onClick={load} className="mt-2 text-sm font-bold text-brand-ink underline">
          Try again
        </button>
      </Card>
    )
  }

  if (!rows) return <Spinner />

  const open = openCount(rows)
  const shown = visibleReports(rows, showResolved)
  const resolved = rows.length - openCount(rows)

  return (
    <div className="mb-6">
      <h3 className="mb-1 text-base font-extrabold text-ink">
        Reports and suggestions{open > 0 ? ` (${open})` : ''}
      </h3>
      <p className="mb-3 text-sm text-ink-muted" data-testid="feedback-summary">
        {rows.length === 0
          ? 'Nobody has reported anything yet.'
          : `${open} open, ${rows.length} in total. A reply you save here is what the reporter reads in the app.`}
      </p>

      {/* ⚠️ THE TOGGLE ONLY APPEARS WHEN THERE IS SOMETHING HIDDEN. A control
          that reads "Show resolved (0)" invites a click that changes nothing,
          and a list with no resolved reports is not hiding anything to explain. */}
      {resolved > 0 && (
        <button
          type="button"
          onClick={() => setShowResolved((v) => !v)}
          data-testid="toggle-resolved"
          className="mb-3 min-h-[44px] text-sm font-bold text-brand-ink underline"
        >
          {showResolved ? 'Hide resolved' : `Show resolved (${resolved})`}
        </button>
      )}

      {error && rows && (
        <p role="alert" className="mb-3 rounded-[11px] bg-danger-bg px-3 py-2 text-sm font-semibold text-danger-ink">
          {error}
        </p>
      )}

      {rows.length === 0 ? (
        <Empty message="When somebody taps the ? and reports a problem, it lands here." />
      ) : shown.length === 0 ? (
        /* ⚠️ A DIFFERENT EMPTY STATE FROM "nothing has ever been reported".
           Everything here is resolved, which is the good outcome — saying
           "nobody has reported anything" would be plainly false and would make
           an admin wonder where the reports went. */
        <Empty message="Nothing open. Every report has been dealt with." />
      ) : (
        <Card className="overflow-hidden">
          {shown.map((row) => (
            <ReportRow
              key={row.id}
              row={row}
              onStatus={changeStatus}
              onNote={saveNote}
              onDelete={removeReport}
              busy={busyId === row.id}
            />
          ))}
        </Card>
      )}
    </div>
  )
}
