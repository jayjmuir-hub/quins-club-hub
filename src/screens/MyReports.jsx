import { useEffect, useState } from 'react'
import Card from '../components/Card.jsx'
import MyReportsList from '../components/MyReportsList.jsx'
import { listFeedback, subscribeFeedback } from '../data/feedback.js'

// /my-reports — the things you have told the club about, and what they said
// back.
//
// ⚠️ THIS SCREEN EXISTS BECAUSE A NOTIFICATION NEEDS SOMEWHERE TO LAND. Until
// 19 Aug 2026 a member's reports lived only inside the `?` sheet, which has no
// URL, so "somebody replied to your report" could not deep-link anywhere and
// opened the app's root instead — Jay tapped the club's first real push
// notification and arrived on More -> Notifications.
// claude/plans/2026-08-19-notifications-v2.md.
//
// ⚠️ THE SHEET STAYS. This is not a replacement for "See what you've already
// reported" — that is where people already look, and the acknowledgement email
// names it. Both render MyReportsList, so there is one copy of the list.
//
// ⚠️ NO `submitted_by = me` FILTER, AND THAT IS NOT AN OVERSIGHT. `listFeedback`
// deliberately carries none: the `feedback read` policy is
// `submitted_by = auth.uid() or private.is_admin(club_id)`, so RLS is what
// makes this page yours. See the comment on listFeedback for why a filter here
// would be a second, weaker statement of the same rule.
//
// ⚠️ WHICH MEANS AN ADMIN SEES THE WHOLE CLUB'S REPORTS HERE. That is the
// policy working, not a leak — an admin can already read them all on
// /admin/needs-attention, which is the screen built for triaging them. This
// one is for reading replies, and an admin arriving from a notification about
// their OWN report will find it at the top, newest first.

export default function MyReports() {
  const [reports, setReports] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const rows = await listFeedback()
        if (!cancelled) {
          setReports(rows)
          setError(null)
        }
      } catch (err) {
        if (!cancelled) {
          setReports([])
          setError(err?.message || 'Could not load your reports.')
        }
      }
    }

    load()

    // ⚠️ LIVE, BECAUSE THE POINT OF ARRIVING HERE IS THAT SOMETHING JUST
    // CHANGED. A person tapping a notification lands on this screen at the
    // moment an admin replied; without this they would see the state from
    // whenever the page was last loaded.
    const unsubscribe = subscribeFeedback(load)
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  return (
    <>
      <h2 className="mb-2.5 ml-0.5 mt-[18px] text-[13px] font-extrabold uppercase tracking-[.8px] text-ink-muted first:mt-0">
        Your reports
      </h2>
      <Card className="p-4">
        <p className="mb-3 text-sm leading-relaxed text-ink-muted">
          Anything you’ve reported or suggested, and the club’s reply.
        </p>
        <MyReportsList reports={reports} error={error} />
      </Card>
    </>
  )
}
