import { useEffect, useMemo, useState } from 'react'
import Card from './Card.jsx'
import { listApprovalRecipients, setNotifyApprovals } from '../data/staff.js'
import { labelForRole } from '../lib/scope.js'
import { friendlyMessage } from '../lib/friendlyError.js'

// "Who is emailed when somebody is waiting to be approved" — the Club admin
// tab, 23 Aug 2026. Jay: the only lever he could find was the head-coach
// flag. This is the lever. Admins are told about every registration; a coach
// or manager about their squad's. The switch confers no authority.
//
// ⚠️ THE FLOOR. If nobody in scope is switched on, the edge function emails
// the super admins anyway, so a registration is never left unseen. The note
// under the list says so, because an admin switching everyone off would
// otherwise wonder why the email still arrives.

export default function ApprovalRecipients() {
  const [rows, setRows] = useState(null)
  const [error, setError] = useState(null)
  const [loadError, setLoadError] = useState(false)
  const [busy, setBusy] = useState(null)
  // Collapsed by default (Jay, 24 Aug 2026): this is a settings card on a
  // work screen — the count in the header says whether it needs opening.
  const [open, setOpen] = useState(false)

  useEffect(() => {
    let mounted = true
    listApprovalRecipients()
      .then((r) => mounted && setRows(r))
      // ⚠️ NOT role="alert". A load failure here is a quiet line, not an alert:
      // the Club tab's other panels assert on THEIR alerts in tests, and a
      // panel that cannot load is not an emergency on a screen about squads.
      .catch(() => mounted && setLoadError(true))
    return () => {
      mounted = false
    }
  }, [])

  const groups = useMemo(() => {
    const map = new Map()
    for (const r of rows ?? []) {
      const key = r.role === 'admin' ? 'Club admins · every registration' : r.team_name ?? 'Squad'
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(r)
    }
    return [...map.entries()]
  }, [rows])

  async function flip(row) {
    setBusy(row.membership_id)
    setError(null)
    try {
      const saved = await setNotifyApprovals({ membershipId: row.membership_id, notify: !row.notify })
      setRows((prev) => prev.map((r) => (r.membership_id === row.membership_id ? { ...r, notify: saved.notify_approvals } : r)))
    } catch (err) {
      setError(friendlyMessage(err, "That didn't save."))
    } finally {
      setBusy(null)
    }
  }

  const onCount = (rows ?? []).filter((r) => r.notify).length

  // Nothing until the list is here (or has failed): a settings card gets no
  // spinner of its own — on Accounts the screen's spinner already has
  // role="status", and two of those is what broke the screen's tests.
  if (rows === null && !loadError) return null

  return (
    <Card className="mb-5 mt-3.5 p-3.5" data-testid="approval-recipients">
      <button
        type="button"
        onClick={() => setOpen((was) => !was)}
        aria-expanded={open}
        className="-m-1 flex w-[calc(100%+8px)] items-center gap-2 rounded-[8px] p-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      >
        <span className="min-w-0 flex-1">
          <h3 className="text-[15px] font-bold text-ink">
            Approval emails
            {rows && (
              <span className="ml-2 text-[12.5px] font-semibold text-ink-muted">{onCount} switched on</span>
            )}
          </h3>
        </span>
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className={`shrink-0 text-ink-muted transition-transform ${open ? 'rotate-180' : ''}`}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {/* The load-failure line stays visible while collapsed — a card that
          hides its own failure behind a chevron reads as healthy. */}
      {loadError && <p className="mt-2 text-[12.5px] text-ink-muted">Could not load who is emailed just now.</p>}
      {open && (
        <>
      <p className="mt-1 text-[12.5px] text-ink-muted">
        Who is emailed when somebody is waiting to be approved. Admins hear about every registration; a coach or manager about their squad&rsquo;s.
      </p>
      {error && (
        <p role="alert" className="mt-2 text-[12.5px] font-semibold text-danger-ink">
          {error}
        </p>
      )}
      {groups.map(([group, people]) => (
        <div key={group} className="mt-3">
          <p className="text-[11px] font-extrabold uppercase tracking-[.5px] text-ink-muted">{group}</p>
          <ul className="mt-1 divide-y divide-line">
            {people.map((r) => (
              <li key={r.membership_id} className="flex items-center justify-between gap-3 py-1.5" data-testid="recipient-row">
                <span className="min-w-0">
                  <span className="block truncate text-[13.5px] font-semibold text-ink">{r.full_name}</span>
                  {r.role !== 'admin' && <span className="block text-[11.5px] text-ink-faint">{labelForRole(r.role) ?? r.role}</span>}
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={r.notify}
                  aria-label={`Email ${r.full_name} about approvals`}
                  disabled={busy === r.membership_id}
                  onClick={() => flip(r)}
                  className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${r.notify ? 'bg-brand' : 'bg-line'}`}
                >
                  <span
                    aria-hidden="true"
                    className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${r.notify ? 'left-0.5 translate-x-5' : 'left-0.5'}`}
                  />
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
      <p className="mt-3 text-[11.5px] text-ink-muted">
        If nobody is switched on for a squad, its registrations still reach the super admins — a request is never left unseen.
      </p>
        </>
      )}
    </Card>
  )
}
