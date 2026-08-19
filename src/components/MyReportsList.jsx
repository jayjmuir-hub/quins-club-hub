import { FEEDBACK_STATUS_LABELS, feedbackRef } from '../data/feedback.js'

// One member's own reports, and the club's replies to them.
//
// ⚠️ EXTRACTED 19 Aug 2026 SO THERE IS ONE COPY, NOT TWO. This renders in the
// `?` sheet (HelpButton, "See what you've already reported") AND on /my-reports,
// which is where a push notification now lands. Two copies of a list showing an
// admin's reply would drift, and the drift would be invisible: nobody ever has
// both open at once to notice that one of them stopped rendering `admin_note`.
//
// ⚠️ THE REPLY IS THE WHOLE POINT OF THIS COMPONENT. Jay, 18 Aug 2026, chose
// in-app over a second email, so `admin_note` is the ONLY channel an answer
// travels down. If this stops rendering it, an admin can type a reply that
// nobody ever reads and nothing anywhere would say so.

export default function MyReportsList({ reports, error, emptyText }) {
  return (
    <>
      {reports === null && !error && <p className="text-[13px] text-ink-muted">Loading…</p>}

      {error && (
        <p
          role="alert"
          className="mb-3 rounded-[11px] bg-danger-bg px-3 py-2 text-[13px] font-semibold text-brand-deep"
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
        reports.map((row) => (
          <div key={row.id} className="border-b border-line py-3 last:border-b-0">
            <div className="mb-1 flex items-center gap-2">
              <span className="rounded-pill bg-surface-sunk px-2 py-0.5 text-[13px] font-semibold text-ink">
                {FEEDBACK_STATUS_LABELS[row.status] ?? row.status}
              </span>
              <span className="text-[13px] text-ink-faint">{feedbackRef(row.ref)}</span>
            </div>
            <p className="text-[15px] text-ink">{row.body}</p>

            {row.admin_note && (
              <p className="mt-2 rounded-[11px] bg-surface-sunk p-3 text-[13px] text-ink">
                <span className="font-semibold">From the club: </span>
                {row.admin_note}
              </p>
            )}
          </div>
        ))}
    </>
  )
}
