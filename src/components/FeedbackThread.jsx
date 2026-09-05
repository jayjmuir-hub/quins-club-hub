import { useState } from 'react'
import Button from './Button.jsx'
import { friendlyMessage } from '../lib/friendlyError.js'

// The thread on one report — every message so far, then a box to add one.
// Rendered by BOTH FeedbackTriage (the admin, on /admin/needs-attention) and
// MyReportsList (the reporter, on /my-reports and in the ? sheet), so the two
// sides read the same conversation. Jay, 4 Sep 2026: "there is no thread of
// messages."
//
// ⚠️ WHO WROTE EACH LINE IS DECIDED BY THE ROW, NOT BY WHICH SCREEN THIS IS
// ON. `fromReporter` is author_id === the report's submitted_by. An admin
// reading their own report sees their own messages on the reporter's side,
// which is correct: they wrote them as the reporter.
//
// ⚠️ THE ADMIN'S MESSAGE IS WHAT PUSHES THE REPORTER. The database copies an
// admin's message into feedback.admin_note (20260915_feedback_thread.sql),
// and that is what fires the reply push. Nothing here sends anything.

/** "Fri 4 Sept, 18:42" in club time. */
export function messageTime(iso) {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString('en-GB', {
    timeZone: 'Asia/Dubai',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

export default function FeedbackThread({
  report,
  messages,
  onSend,
  busy = false,
  placeholder = 'Write a message…',
  sendLabel = 'Send',
  viewerId = null,
}) {
  const [draft, setDraft] = useState('')
  const [error, setError] = useState(null)
  const [sending, setSending] = useState(false)
  const rows = messages ?? []

  async function send() {
    const text = draft.trim()
    if (!text) {
      setError('Write something first.')
      return
    }
    setSending(true)
    setError(null)
    try {
      await onSend(text)
      setDraft('')
    } catch (err) {
      setError(friendlyMessage(err, "That didn't send."))
    } finally {
      setSending(false)
    }
  }

  return (
    <div data-testid="feedback-thread">
      {rows.length > 0 && (
        <ol className="mb-2 flex flex-col gap-1.5" aria-label="Messages">
          {rows.map((m) => {
            const fromReporter = m.author_id === report.submitted_by
            const mine = viewerId != null && m.author_id === viewerId
            return (
              <li
                key={m.id}
                data-testid="feedback-message"
                data-from={fromReporter ? 'reporter' : 'club'}
                className={`max-w-[92%] rounded-[11px] px-3 py-2 text-[14px] ${
                  fromReporter ? 'self-start bg-surface-sunk text-ink' : 'self-end bg-surface-mute text-ink'
                }`}
              >
                <p className="whitespace-pre-wrap">{m.body}</p>
                <p className="mt-0.5 text-[11px] text-ink-faint">
                  {fromReporter ? (mine ? 'You' : m.profiles?.full_name ?? 'The reporter') : mine ? 'You' : 'The club'}
                  {' · '}
                  <time dateTime={m.created_at}>{messageTime(m.created_at)}</time>
                </p>
              </li>
            )
          })}
        </ol>
      )}

      <label htmlFor={`feedback-draft-${report.id}`} className="sr-only">
        Message on {report.ref != null ? `report ${report.ref}` : 'this report'}
      </label>
      <textarea
        id={`feedback-draft-${report.id}`}
        value={draft}
        disabled={busy || sending}
        onChange={(e) => {
          setDraft(e.target.value)
          if (error) setError(null)
        }}
        rows={2}
        placeholder={placeholder}
        className="w-full rounded-[11px] border-[1.5px] border-line px-3 py-2 text-[15px] text-ink focus:border-brand focus:outline-none"
      />
      <div className="mt-1 flex items-center gap-2">
        <Button type="button" size="sm" variant="secondary" disabled={busy || sending} onClick={send}>
          {sendLabel}
        </Button>
        {error && (
          <span role="alert" className="text-[13px] font-semibold text-danger-ink">
            {error}
          </span>
        )}
      </div>
    </div>
  )
}
