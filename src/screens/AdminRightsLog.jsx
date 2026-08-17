import { useCallback, useEffect, useMemo, useState } from 'react'
import Card from '../components/Card.jsx'
import Empty from '../components/Empty.jsx'
import Spinner from '../components/Spinner.jsx'
import { listAuditProfiles, listMembershipAudit } from '../data/audit.js'
import { useMemberships } from '../lib/memberships.jsx'
import { isSuperAdmin } from '../lib/scope.js'
import {
  actorName,
  auditDetails,
  auditHeadline,
  isElevation,
  subjectName,
} from '../lib/auditFormat.js'

// The Rights log — who gave whom access, and when.
//
// Jay, 17 Aug 2026: "we need a change log for changes to rights", then "the log
// should only be visible by super admins".
//
// ⚠️ THE TABLE HAD BEEN RECORDING FOR A DAY WITH NOTHING TO READ IT, and that is
// the state this screen ends. A log nobody can open is not accountability; it is
// a table that looks like accountability in the schema and answers nothing at
// the moment somebody asks who made a stranger an admin.
//
// ⚠️ THE GATE HERE IS `isSuperAdmin`, AND IT IS NOT THE SECURITY. Every other
// admin screen mounted under AdminDashboard inherits its isAdmin() check and
// does not re-gate; this one must, because AdminDashboard's gate is one step
// wider than this screen's audience. RLS is what actually decides: the read
// policy on membership_audit is `private.is_super_admin()` and there is no
// other, so an ordinary admin who pastes the URL gets an empty list from the
// database whatever this file does. The check below exists so that they get an
// explanation instead of a screen that looks broken.
//
// ⚠️ NOTHING ON THIS SCREEN WRITES. There are no controls, no filters that hide
// rows, and no way to remove an entry — the table has a SELECT policy and
// deliberately no others, and an audit log you can edit is not an audit log.

function NotForYou() {
  return (
    <Card role="alert" className="p-6 text-center">
      <h3 className="text-base font-extrabold text-brand-deep">Not authorised</h3>
      <p className="mx-auto mt-2 max-w-[52ch] text-sm leading-relaxed text-ink-muted">
        The rights log is for super admins only. It records what admins do, so the people
        it records are not the people who read it.
      </p>
    </Card>
  )
}

// ⚠️ ABSOLUTE, NEVER "3 days ago". A log is read to answer "when exactly", and a
// relative stamp forces the reader to work out what day that was — on the one
// screen where the answer needs to be quotable to somebody else.
function stamp(at) {
  const date = new Date(at)
  if (Number.isNaN(date.getTime())) return String(at ?? '')
  return date.toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function Entry({ row, nameById, teamName }) {
  const details = auditDetails(row)
  const elevated = isElevation(row)

  return (
    <li
      data-testid="audit-entry"
      data-elevation={elevated ? 'yes' : 'no'}
      className="flex gap-3 border-b border-line px-4 py-3 last:border-0"
    >
      {/* Decorative — "Access" is written in words on every elevated row, so the
          bar carries no information of its own (claude/specs/accessibility.md). */}
      <span
        aria-hidden="true"
        className={`mt-1 w-1 shrink-0 rounded-full ${elevated ? 'bg-brand' : 'bg-line'}`}
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-ink">
          {auditHeadline(row)}
          {teamName ? <span className="font-normal text-ink-muted"> · {teamName}</span> : null}
          {elevated ? (
            <span className="ml-2 rounded-full bg-brand px-2 py-0.5 text-[11px] font-extrabold text-white">
              Access
            </span>
          ) : null}
        </p>
        <p className="mt-0.5 text-sm text-ink">{subjectName(row, nameById)}</p>
        {details.length > 0 && (
          <ul className="mt-1 space-y-0.5">
            {details.map((line) => (
              <li key={line} className="text-[13px] text-ink-muted">
                {line}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-1 text-[12.5px] text-ink-faint">
          {stamp(row.at)} · by {actorName(row, nameById)}
        </p>
      </div>
    </li>
  )
}

export default function AdminRightsLog() {
  const { memberships, teams } = useMemberships()
  const viewerIsSuper = isSuperAdmin(memberships)

  const [rows, setRows] = useState(null)
  const [names, setNames] = useState(() => new Map())
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const entries = await listMembershipAudit()
      // ⚠️ BOTH IDS, IN ONE QUERY. The actor of one entry is the subject of
      // another often enough that two lists would fetch the same profiles
      // twice; the set is what makes it one round trip.
      const profiles = await listAuditProfiles(
        entries.flatMap((row) => [row.profile_id, row.actor_id]),
      )
      const byId = new Map()
      for (const profile of profiles) {
        // Email is the fallback, not the display: somebody who has never
        // confirmed a name still has to be identifiable in a safeguarding log.
        byId.set(profile.id, profile.full_name || profile.email || '')
      }
      setNames(byId)
      setRows(entries)
    } catch (err) {
      setError(err.message)
    }
  }, [])

  useEffect(() => {
    if (viewerIsSuper) load()
  }, [load, viewerIsSuper])

  const teamNameById = useMemo(() => {
    const map = new Map()
    for (const team of teams ?? []) map.set(team.id, team.name)
    return map
  }, [teams])

  if (!viewerIsSuper) return <NotForYou />

  if (error) {
    return (
      <Card className="p-4">
        <p role="alert" className="text-sm text-ink">
          {error}
        </p>
        <button type="button" onClick={load} className="mt-2 text-sm font-bold text-brand underline">
          Try again
        </button>
      </Card>
    )
  }

  if (!rows) return <Spinner />

  const elevations = rows.filter(isElevation).length

  return (
    <div>
      <h3 className="mb-1 text-base font-extrabold text-ink">Rights log</h3>

      {/* ⚠️ THE HEADLINE COUNTS THE ELEVATIONS, NOT THE ENTRIES. "213 changes"
          says a log exists; "9 of them handed somebody access to a squad" is the
          number a super admin opened this screen to find, and it is the one that
          should be wrong-looking when it is wrong. Same reasoning as the Staff
          tab's gap count. */}
      <p className="mb-3 text-sm text-ink-muted" data-testid="audit-summary">
        {rows.length === 0
          ? 'Nothing recorded yet.'
          : `${rows.length} ${rows.length === 1 ? 'change' : 'changes'}, ${elevations} of which handed somebody access.`}
      </p>

      {rows.length === 0 ? (
        // ⚠️ THE EMPTY STATE SAYS WHEN RECORDING STARTED, because "nothing here"
        // and "nothing has happened" are different claims and only one of them
        // is true of a log younger than the club.
        <Empty message="No changes to anyone's access have been recorded since this log started on 17 August 2026." />
      ) : (
        <Card className="overflow-hidden">
          <ul>
            {rows.map((row) => (
              <Entry
                key={row.id}
                row={row}
                nameById={names}
                teamName={row.team_id ? teamNameById.get(row.team_id) : null}
              />
            ))}
          </ul>
        </Card>
      )}

      {/* ⚠️ SAYS THAT IT IS A WINDOW, rather than implying it is everything.
          listMembershipAudit caps at 200; a screen that quietly showed the most
          recent 200 of 4,000 would be read as the whole history. */}
      {rows.length >= 200 && (
        <p className="mt-3 text-[12.5px] text-ink-faint" data-testid="audit-truncated">
          Showing the most recent 200 changes. Older entries are kept but are not shown here
          yet.
        </p>
      )}
    </div>
  )
}
