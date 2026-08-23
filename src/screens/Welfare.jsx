import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Card from '../components/Card.jsx'
import { AccentTitle, Kicker } from '../components/Editorial.jsx'
import Spinner from '../components/Spinner.jsx'
import { listWelfareAccessLog, welfareOverview } from '../data/messages.js'
import { useMemberships } from '../lib/memberships.jsx'
import { postedLabel } from '../lib/notices.js'
import { adminRightLabel, hasAdminRight } from '../lib/scope.js'

// The Welfare dashboard — squad chat phase 3.
//
// ⚠️ THE RIGHT GATES THE SCREEN, NOT THE DATA — the same sentence as
// TrainingGate, and the 23 Aug ruling made it literal here: any admin can
// read a DM by RLS; `welfare` decides who is shown THIS page, where every
// channel and every conversation sits in one list. The reviewer is reviewed:
// the access log at the bottom is every admin open of a DM.

export function WelfareGate({ children }) {
  const { memberships } = useMemberships()
  if (hasAdminRight(memberships, 'welfare')) return children
  const label = adminRightLabel('welfare')
  return (
    <Card role="alert" className="p-6 text-center">
      <h3 className="text-base font-extrabold text-ink">{label}</h3>
      <p className="mt-2 text-sm leading-relaxed text-ink-muted">
        {label} hasn&rsquo;t been added to your account. A super admin can add it on the Accounts screen.
      </p>
    </Card>
  )
}

function hrefFor(row) {
  switch (row.kind) {
    case 'squad':
      return `/chat/${row.id}`
    case 'staff':
      return `/chat/${row.id}?channel=staff`
    case 'club':
      return '/chat/club'
    case 'dm':
      return `/chat/dm/${row.id}`
    default:
      return '/chat'
  }
}

export default function Welfare() {
  return (
    <WelfareGate>
      <Overview />
    </WelfareGate>
  )
}

function Overview() {
  const [rows, setRows] = useState(null)
  const [log, setLog] = useState([])
  const [error, setError] = useState(null)

  useEffect(() => {
    let mounted = true
    Promise.all([welfareOverview(), listWelfareAccessLog({ limit: 20 }).catch(() => [])])
      .then(([overview, accessLog]) => {
        if (!mounted) return
        setRows(overview)
        setLog(accessLog)
      })
      .catch((err) => mounted && setError(err.message || 'We could not load the overview.'))
    return () => {
      mounted = false
    }
  }, [])

  const openReports = (rows ?? []).reduce((n, r) => n + Number(r.open_reports ?? 0), 0)

  return (
    <section className="px-1">
      <div className="mb-3.5 mt-1">
        <Kicker>Welfare</Kicker>
        <AccentTitle lead="Every channel," accent="one place." />
        <p className="mt-1 text-[13px] text-ink-muted">
          Read-only. Open any channel or conversation; remove a message from inside it. Every open of a private conversation is recorded below.
        </p>
      </div>

      {error && (
        <Card className="mb-3 px-4 py-3">
          <p role="alert" className="text-[13px] font-semibold text-danger-ink">
            {error}
          </p>
        </Card>
      )}

      {openReports > 0 && (
        <Link
          to="/admin/welfare/reports"
          data-testid="reports-banner"
          className="mb-3 block rounded-[10px] bg-danger-bg px-4 py-2.5 text-[13.5px] font-extrabold text-danger-ink hover:underline"
        >
          {openReports} reported {openReports === 1 ? 'message' : 'messages'} waiting · Review
        </Link>
      )}

      {rows === null && !error && (
        <div className="py-8">
          <Spinner />
        </div>
      )}

      {rows && (
        <Card className="overflow-hidden">
          <table className="w-full text-[13px]">
            <thead className="bg-surface-mute text-left text-[11px] font-extrabold uppercase tracking-[.5px] text-ink-muted">
              <tr>
                <th className="px-3 py-2">Channel</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2 text-right">People</th>
                <th className="px-3 py-2">Last post</th>
                <th className="px-3 py-2 text-right">Reports</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.kind}-${r.id}`} className="border-t border-line" data-testid="welfare-row" data-kind={r.kind}>
                  <td className="px-3 py-2 font-extrabold text-ink">
                    <Link to={hrefFor(r)} className="text-brand-ink underline-offset-2 hover:underline">
                      {r.label}
                    </Link>
                  </td>
                  <td className={`px-3 py-2 ${r.detail?.includes('minor') ? 'font-bold text-danger-ink' : 'text-ink-muted'}`}>{r.detail}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-ink-muted">{r.members}</td>
                  <td className="px-3 py-2 text-ink-muted">{r.last_at ? postedLabel(r.last_at) : '—'}</td>
                  <td className={`px-3 py-2 text-right tabular-nums ${Number(r.open_reports) > 0 ? 'font-extrabold text-danger-ink' : 'text-ink-faint'}`}>
                    {r.open_reports}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <h3 className="mb-1.5 mt-5 px-1 text-[11px] font-extrabold uppercase tracking-[.5px] text-ink-muted">Who has opened a private conversation</h3>
      {log.length === 0 ? (
        <p className="px-1 text-[13px] text-ink-muted">Nobody yet.</p>
      ) : (
        <Card className="divide-y divide-line">
          {log.map((entry) => (
            <div key={entry.id} className="flex items-center justify-between px-3.5 py-2 text-[13px]" data-testid="access-row">
              <span className="font-semibold text-ink">{entry.admin?.full_name ?? 'An admin'}</span>
              <Link to={`/chat/dm/${entry.conversation_id}`} className="text-brand-ink underline-offset-2 hover:underline">
                opened a conversation
              </Link>
              <span className="text-ink-faint">{postedLabel(entry.opened_at)}</span>
            </div>
          ))}
        </Card>
      )}
    </section>
  )
}
