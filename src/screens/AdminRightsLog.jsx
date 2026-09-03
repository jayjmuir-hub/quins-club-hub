import { useCallback, useEffect, useMemo, useState } from 'react'
import Card from '../components/Card.jsx'
import Empty from '../components/Empty.jsx'
import PersonCard from '../components/PersonCard.jsx'
import PersonName from '../components/PersonName.jsx'
import Spinner from '../components/Spinner.jsx'
import { listAuditProfiles, listMembershipAudit } from '../data/audit.js'
import { useAuth } from '../lib/auth.jsx'
import { useMemberships } from '../lib/memberships.jsx'
import { isSuperAdmin } from '../lib/scope.js'
import { friendlyMessage } from '../lib/friendlyError.js'
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
      <h3 className="text-base font-extrabold text-danger-ink">Not authorised</h3>
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

// The local calendar day of a timestamp as YYYY-MM-DD — the key the date filter
// and the day grouping both compare on. LOCAL, not UTC, and deliberately: it
// lines up with <input type="date">, whose value is a zoneless local date, and
// it files a change at 00:30 under the day the reader would call it rather than
// under yesterday in UTC.
function dayKey(at) {
  const date = new Date(at)
  if (Number.isNaN(date.getTime())) return ''
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

// "17 August 2026" — the absolute form the rest of the screen already uses
// (see stamp), for a day heading.
function dayLabel(at) {
  const date = new Date(at)
  if (Number.isNaN(date.getTime())) return String(at ?? '')
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })
}

function Entry({ row, nameById, teamName, onOpenCard = null, selfId = null }) {
  const details = auditDetails(row)
  const elevated = isElevation(row)
  // The person card (claude/plans/2026-08-26-person-card.md): both names on an
  // entry are doors. "The system" has nobody behind it, and an account whose
  // name is GONE is deleted — both stay plain text via PersonName's null branch.
  const subjectId = nameById?.get(row.profile_id) ? row.profile_id : null
  const actorId =
    row.actor_kind === 'system' || !nameById?.get(row.actor_id) ? null : row.actor_id

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
        <p className="mt-0.5 text-sm text-ink">
          <PersonName profileId={subjectId} selfId={selfId} onOpen={onOpenCard}>
            {subjectName(row, nameById)}
          </PersonName>
        </p>
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
          {stamp(row.at)} · by{' '}
          <PersonName profileId={actorId} selfId={selfId} onOpen={onOpenCard}>
            {actorName(row, nameById)}
          </PersonName>
        </p>
      </div>
    </li>
  )
}

export default function AdminRightsLog() {
  const { memberships, teams } = useMemberships()
  const { user } = useAuth()
  const selfId = user?.id ?? null
  const viewerIsSuper = isSuperAdmin(memberships)

  const [rows, setRows] = useState(null)
  const [names, setNames] = useState(() => new Map())
  const [error, setError] = useState(null)
  // The tapped person's profile id, or null — one card for the whole screen.
  const [cardFor, setCardFor] = useState(null)

  // ⚠️ VIEW CONTROLS ONLY, AND NOTHING HERE TOUCHES THE DATABASE. The log is
  // append-only by design (see this file's header and audit.js) — these choose
  // what of the already-fetched window to SHOW, they never hide a row from
  // anyone else and they never remove one. The panel is collapsed and every
  // filter is empty by default, so the unfiltered screen is exactly what it was.
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [elevationsOnly, setElevationsOnly] = useState(false)
  const [personId, setPersonId] = useState('')
  const [fromDay, setFromDay] = useState('')
  const [toDay, setToDay] = useState('')
  // Grouping is a view choice, not a filter — kept out of the active-filter
  // count and the Clear control. On by default because a timeline is the
  // decluttered reading the panel exists to offer.
  const [groupByDay, setGroupByDay] = useState(true)

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
      setError(friendlyMessage(err, "We couldn't load the log. Try again."))
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

  // The people who appear anywhere in the loaded window, for the person filter.
  // Both roles — an actor on one entry is the subject of another — and only ids
  // we have a name for: "the system" has nobody to filter to, and a name we
  // could not resolve would be an option that reads as blank.
  const peopleOptions = useMemo(() => {
    const ids = new Set()
    for (const row of rows ?? []) {
      if (row.profile_id) ids.add(row.profile_id)
      if (row.actor_kind !== 'system' && row.actor_id) ids.add(row.actor_id)
    }
    const opts = []
    for (const id of ids) {
      const name = names.get(id)
      if (name) opts.push({ id, name })
    }
    opts.sort((a, b) => a.name.localeCompare(b.name))
    return opts
  }, [rows, names])

  const activeFilterCount =
    (elevationsOnly ? 1 : 0) + (personId ? 1 : 0) + (fromDay ? 1 : 0) + (toDay ? 1 : 0)

  // The window, narrowed to what the controls ask for. AND across the filters:
  // each one that is set removes rows, an empty one removes nothing.
  const visible = useMemo(() => {
    return (rows ?? []).filter((row) => {
      if (elevationsOnly && !isElevation(row)) return false
      if (personId && row.profile_id !== personId && row.actor_id !== personId) return false
      const key = dayKey(row.at)
      if (fromDay && key < fromDay) return false
      if (toDay && key > toDay) return false
      return true
    })
  }, [rows, elevationsOnly, personId, fromDay, toDay])

  // Consecutive-run grouping, which is correct because the rows arrive newest
  // first and the filter preserves that order — so every entry of one day is
  // contiguous. A Map keyed by day would lose that ordering.
  const dayGroups = useMemo(() => {
    const out = []
    let current = null
    for (const row of visible) {
      const key = dayKey(row.at)
      if (!current || current.key !== key) {
        current = { key, label: dayLabel(row.at), rows: [] }
        out.push(current)
      }
      current.rows.push(row)
    }
    return out
  }, [visible])

  const clearFilters = useCallback(() => {
    setElevationsOnly(false)
    setPersonId('')
    setFromDay('')
    setToDay('')
  }, [])

  if (!viewerIsSuper) return <NotForYou />

  if (error) {
    return (
      <Card className="p-4">
        <p role="alert" className="text-sm text-ink">
          {error}
        </p>
        <button type="button" onClick={load} className="mt-2 text-sm font-bold text-brand-ink underline">
          Try again
        </button>
      </Card>
    )
  }

  if (!rows) return <Spinner />

  const elevations = rows.filter(isElevation).length
  const filtersActive = activeFilterCount > 0
  const shownElevations = visible.filter(isElevation).length

  const renderEntry = (row) => (
    <Entry
      key={row.id}
      row={row}
      nameById={names}
      teamName={row.team_id ? teamNameById.get(row.team_id) : null}
      onOpenCard={setCardFor}
      selfId={selfId}
    />
  )

  return (
    <div>
      <h3 className="mb-1 text-base font-extrabold text-ink">Rights log</h3>

      {/* ⚠️ THE HEADLINE COUNTS THE ELEVATIONS, NOT THE ENTRIES. "213 changes"
          says a log exists; "9 of them handed somebody access to a squad" is the
          number a super admin opened this screen to find, and it is the one that
          should be wrong-looking when it is wrong. Same reasoning as the Staff
          tab's gap count.
          ⚠️ WHEN A FILTER IS ON, IT COUNTS WHAT IS SHOWN, and says so ("X of Y")
          — a count that ignored the filter would contradict the list beneath it. */}
      <p className="mb-3 text-sm text-ink-muted" data-testid="audit-summary">
        {rows.length === 0
          ? 'Nothing recorded yet.'
          : filtersActive
            ? `Showing ${visible.length} of ${rows.length} ${rows.length === 1 ? 'change' : 'changes'}, ${shownElevations} of which handed somebody access.`
            : `${rows.length} ${rows.length === 1 ? 'change' : 'changes'}, ${elevations} of which handed somebody access.`}
      </p>

      {/* The view controls. Collapsed by default so the screen opens on the log,
          not on its knobs; a badge on the toggle says when a filter is hiding
          rows, because a shortened list with no visible reason reads as loss. */}
      {rows.length > 0 && (
        <div className="mb-3" data-testid="audit-controls">
          <button
            type="button"
            onClick={() => setFiltersOpen((was) => !was)}
            aria-expanded={filtersOpen}
            data-testid="audit-filter-toggle"
            className="flex items-center gap-2 rounded-[8px] px-2 py-1.5 text-sm font-bold text-brand-ink hover:bg-surface-mute focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            <span>Filter &amp; group</span>
            {filtersActive && (
              <span
                className="rounded-full bg-brand px-2 py-0.5 text-[11px] font-extrabold text-white"
                data-testid="audit-filter-count"
              >
                {activeFilterCount} on
              </span>
            )}
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
              className={`transition-transform ${filtersOpen ? 'rotate-180' : ''}`}
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>

          {filtersOpen && (
            <Card className="mt-2 flex flex-col gap-3 p-3.5" data-testid="audit-filters">
              <label className="flex items-center gap-2 text-sm text-ink">
                <input
                  type="checkbox"
                  checked={elevationsOnly}
                  onChange={(e) => setElevationsOnly(e.target.checked)}
                  data-testid="filter-elevations"
                  className="h-4 w-4 accent-brand"
                />
                <span>Access grants only</span>
              </label>

              <label className="flex flex-col gap-1 text-sm text-ink">
                <span className="font-semibold">Person</span>
                <select
                  value={personId}
                  onChange={(e) => setPersonId(e.target.value)}
                  data-testid="filter-person"
                  className="rounded-[8px] border border-line bg-surface-card px-2 py-1.5 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                >
                  <option value="">Everyone</option>
                  {peopleOptions.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.name}
                    </option>
                  ))}
                </select>
              </label>

              <div className="flex flex-wrap gap-3">
                <label className="flex flex-col gap-1 text-sm text-ink">
                  <span className="font-semibold">From</span>
                  <input
                    type="date"
                    value={fromDay}
                    max={toDay || undefined}
                    onChange={(e) => setFromDay(e.target.value)}
                    data-testid="filter-from"
                    className="rounded-[8px] border border-line bg-surface-card px-2 py-1.5 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm text-ink">
                  <span className="font-semibold">To</span>
                  <input
                    type="date"
                    value={toDay}
                    min={fromDay || undefined}
                    onChange={(e) => setToDay(e.target.value)}
                    data-testid="filter-to"
                    className="rounded-[8px] border border-line bg-surface-card px-2 py-1.5 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                  />
                </label>
              </div>

              <label className="flex items-center gap-2 text-sm text-ink">
                <input
                  type="checkbox"
                  checked={groupByDay}
                  onChange={(e) => setGroupByDay(e.target.checked)}
                  data-testid="filter-group"
                  className="h-4 w-4 accent-brand"
                />
                <span>Group by day</span>
              </label>

              {filtersActive && (
                <button
                  type="button"
                  onClick={clearFilters}
                  data-testid="audit-clear-filters"
                  className="self-start text-sm font-bold text-brand-ink underline"
                >
                  Clear filters
                </button>
              )}
            </Card>
          )}
        </div>
      )}

      {rows.length === 0 ? (
        // ⚠️ THE EMPTY STATE SAYS WHEN RECORDING STARTED, because "nothing here"
        // and "nothing has happened" are different claims and only one of them
        // is true of a log younger than the club.
        <Empty message="No changes to anyone's access have been recorded since this log started on 17 August 2026." />
      ) : visible.length === 0 ? (
        // ⚠️ DIFFERENT FROM "nothing recorded". The log is not empty — these
        // filters are. Saying so, with a way out, keeps a narrowed-to-nothing
        // view from reading as a broken or wiped log.
        <Card className="p-4" data-testid="audit-no-match">
          <Empty message="No changes match these filters." />
          <button
            type="button"
            onClick={clearFilters}
            className="mx-auto mt-2 block text-sm font-bold text-brand-ink underline"
          >
            Clear filters
          </button>
        </Card>
      ) : groupByDay ? (
        <div className="flex flex-col gap-4">
          {dayGroups.map((group) => (
            <section key={group.key} data-testid="audit-day-group" data-day={group.key}>
              <h4 className="mb-1.5 text-[12.5px] font-extrabold uppercase tracking-[.5px] text-ink-muted">
                {group.label}
              </h4>
              <Card className="overflow-hidden">
                <ul>{group.rows.map(renderEntry)}</ul>
              </Card>
            </section>
          ))}
        </div>
      ) : (
        <Card className="overflow-hidden">
          <ul>{visible.map(renderEntry)}</ul>
        </Card>
      )}

      {/* ⚠️ SAYS THAT IT IS A WINDOW, rather than implying it is everything.
          listMembershipAudit caps at 200; a screen that quietly showed the most
          recent 200 of 4,000 would be read as the whole history. Counted on the
          fetched window, NOT the filtered view — the cap is the database's, and
          it is still true whatever the filter shows. */}
      <PersonCard profileId={cardFor} onClose={() => setCardFor(null)} />

      {rows.length >= 200 && (
        <p className="mt-3 text-[12.5px] text-ink-faint" data-testid="audit-truncated">
          Showing the most recent 200 changes. Older entries are kept but are not shown here
          yet.
        </p>
      )}
    </div>
  )
}
