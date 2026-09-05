import { useEffect, useState } from 'react'
import {
  FEEDBACK_STATUS_LABELS,
  feedbackRef,
  listFeedbackMessages,
  sendFeedbackMessage,
  subscribeFeedbackMessages,
} from '../data/feedback.js'
import FeedbackThread from './FeedbackThread.jsx'

// One member's own reports, and the conversation with the club on each.
//
// ⚠️ EXTRACTED 19 Aug 2026 SO THERE IS ONE COPY, NOT TWO. This renders in the
// help sheet (HelpSheet, "See what you've already reported") AND on /my-reports,
// which is where a push notification now lands. Two copies of a list showing an
// admin's reply would drift, and the drift would be invisible: nobody ever has
// both open at once to notice that one of them stopped rendering the reply.
//
// ⚠️ THE REPLY IS THE WHOLE POINT OF THIS COMPONENT. Jay, 18 Aug 2026, chose
// in-app over a second email, so this is the ONLY channel an answer travels
// down. Since 4 Sep 2026 it is a THREAD — every message from either side, and
// a box for the reporter to answer (db/migrations/20260915_feedback_thread.sql).
// `admin_note` is kept as the fallback for when the thread cannot be read, so
// an older client or a refused read still shows the latest reply.
//
// `viewerId` is optional: it only decides whether a line says "You".

export default function MyReportsList({ reports, error, emptyText, viewerId = null }) {
  const [messages, setMessages] = useState(null)
  const ids = (reports ?? []).map((r) => r.id).join(',')

  useEffect(() => {
    if (!ids) {
      setMessages(null)
      return undefined
    }
    let mounted = true
    const load = async () => {
      try {
        const rows = await listFeedbackMessages(ids.split(','))
        if (mounted) setMessages(rows)
      } catch {
        // No thread to show — the admin_note fallback below still renders.
        if (mounted) setMessages(null)
      }
    }
    load()
    let unsubscribe
    try {
      unsubscribe = subscribeFeedbackMessages(load)
    } catch {
      unsubscribe = undefined
    }
    return () => {
      mounted = false
      unsubscribe?.()
    }
  }, [ids])

  return (
    <>
      {reports === null && !error && <p className="text-[13px] text-ink-muted">Loading…</p>}

      {error && (
        <p
          role="alert"
          className="mb-3 rounded-[11px] bg-danger-bg px-3 py-2 text-[13px] font-semibold text-danger-ink"
        >
          {error}
        </p>
      )}

      {reports !== null && reports.length === 0 && !error && (
        <p className="mb-4 text-[13px] text-ink-muted">
          {emptyText || 'You haven’t reported anything yet.'}
        </p>
      )}

      {reports !== null &&
        reports.map((row) => {
          const thread = Array.isArray(messages) ? messages.filter((m) => m.feedback_id === row.id) : null
          return (
            <div key={row.id} className="border-b border-line py-3 last:border-b-0" data-testid="my-report">
              <div className="mb-1 flex items-center gap-2">
                <span className="rounded-pill bg-surface-sunk px-2 py-0.5 text-[13px] font-semibold text-ink">
                  {FEEDBACK_STATUS_LABELS[row.status] ?? row.status}
                </span>
                <span className="text-[13px] text-ink-faint">{feedbackRef(row.ref)}</span>
              </div>
              <p className="text-[15px] text-ink">{row.body}</p>

              {/* The latest reply as one line when there is no thread to show —
                  a refused read, or a reply written before the thread existed
                  and not backfilled. Never both. */}
              {(!thread || thread.length === 0) && row.admin_note && (
                <p className="mt-2 rounded-[11px] bg-surface-sunk p-3 text-[13px] text-ink">
                  <span className="font-semibold">From the club: </span>
                  {row.admin_note}
                </p>
              )}
              {thread && (
                <div className="mt-2">
                  <FeedbackThread
                    report={row}
                    messages={thread}
                    viewerId={viewerId ?? row.submitted_by ?? null}
                    placeholder="Reply to the club…"
                    sendLabel="Send"
                    onSend={async (text) => {
                      const saved = await sendFeedbackMessage(row.id, text, {
                        authorId: viewerId ?? row.submitted_by,
                        clubId: row.club_id,
                      })
                      setMessages((current) => [...(current ?? []), saved])
                    }}
                  />
                </div>
              )}
            </div>
          )
        })}
    </>
  )
}
