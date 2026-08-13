import { useCallback, useEffect, useState } from 'react'
import Card from '../components/Card.jsx'
import Empty from '../components/Empty.jsx'
import Spinner from '../components/Spinner.jsx'
import { listSquadStaff, setMembershipTitle } from '../data/staff.js'
import { STAFF_TITLES, labelForRole } from '../lib/scope.js'

// The Staff tab of /admin — every squad, and who looks after it.
//
// ⚠️ THIS SCREEN EXISTS BECAUSE OF A MEASUREMENT, NOT BECAUSE OF A FEATURE
// REQUEST. Jay asked for age groups to see their coaches on the Home screen.
// Measured first (13 Aug 2026): twelve of fifteen squads had no coach, manager
// or medic attached at all. So the member-facing card would have shipped EMPTY
// to 80% of the club, and there would have been no way to see why. This screen
// is the half that is useful while the data is still missing — and it stops
// being interesting the day the club is fully staffed, which is the point.
//
// ⚠️ THE EMPTY SQUADS ARE THE CONTENT. A directory that listed only squads WITH
// staff would hide exactly the rows somebody needs to act on, and would read as
// "all good". src/data/staff.js builds from `teams` outward for this reason.
//
// Mounted under AdminDashboard, which has already checked isAdmin(), so this
// file does not re-gate — the same arrangement AdminClub.jsx documents. RLS is
// what actually decides which rows come back.
//
// ⚠️ NOBODY IS ATTACHED TO A SQUAD FROM HERE, DELIBERATELY. Creating a
// membership is the grant flow in src/screens/Accounts.jsx, a 1,612-line file
// that claude/plans/2026-08-13-accounts-screen-redesign.md also wants to
// change. Pulling it in here would collide with that work and triple this
// change. This screen tells you WHERE the gaps are; Accounts is where you fill
// them.

function SectionTitle({ children }) {
  return (
    <h3 className="mb-2.5 ml-0.5 mt-[18px] text-[13px] font-extrabold uppercase tracking-[.8px] text-ink-muted first:mt-0">
      {children}
    </h3>
  )
}

/**
 * One person's row.
 *
 * ⚠️ THE TITLE SAVES ON BLUR, AND A FAILED SAVE MUST NOT LEAVE THE TYPED VALUE
 * ON SCREEN LOOKING SAVED. On failure the input is put back to what the
 * database last confirmed, and the reason is shown next to it — the same
 * principle as every write in src/data/: a refusal that renders as success is
 * worse than an error.
 */
function StaffRow({ member, onSaved }) {
  const [title, setTitle] = useState(member.title ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const roleLabel = labelForRole(member.role)

  async function save() {
    const next = title.trim()
    if (next === (member.title ?? '')) return
    setBusy(true)
    setError(null)
    try {
      const saved = await setMembershipTitle({ membershipId: member.membershipId, title: next })
      setTitle(saved.title ?? '')
      onSaved(member.membershipId, saved.title ?? null)
    } catch (err) {
      // Back to the last value the database confirmed, not to the typed one.
      setTitle(member.title ?? '')
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="border-t border-line px-4 py-3 first:border-t-0" data-testid="staff-row">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-[15px] font-bold text-ink">{member.name}</span>
        {roleLabel && (
          <span className="rounded-[8px] border border-line px-2 py-0.5 text-[12px] font-bold text-ink-muted">
            {roleLabel}
          </span>
        )}
      </div>

      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-[13px] text-ink-muted">
        {/* ⚠️ Said out loud rather than left as a gap: "no phone number" is a
            thing an admin has to chase, so it must be readable, not absent. */}
        <span>{member.email ?? 'No email'}</span>
        <span>{member.phone ?? 'No phone number'}</span>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <label className="text-[12.5px] font-bold text-ink-muted" htmlFor={`title-${member.membershipId}`}>
          Title
        </label>
        <input
          id={`title-${member.membershipId}`}
          list="staff-titles"
          value={title}
          disabled={busy}
          onChange={(event) => setTitle(event.target.value)}
          onBlur={save}
          placeholder="e.g. Head Coach"
          className="w-[190px] rounded-[8px] border border-line px-2.5 py-1 text-[13px] text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        />
        {busy && <span className="text-[12.5px] text-ink-faint">Saving…</span>}
        {error && (
          <span role="alert" className="text-[12.5px] font-bold text-brand">
            {error}
          </span>
        )}
      </div>
    </div>
  )
}

function SquadCard({ squad, onSaved }) {
  return (
    <Card className="mb-3" data-testid="squad-card">
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3">
        <h4 className="text-[15px] font-extrabold text-ink">{squad.name}</h4>
        <span className="text-[12.5px] text-ink-faint">
          {squad.staff.length === 0
            ? 'Nobody yet'
            : `${squad.staff.length} ${squad.staff.length === 1 ? 'person' : 'people'}`}
        </span>
      </div>

      {squad.staff.length === 0 ? (
        <div className="border-t border-line">
          <Empty message="No coach, team manager or medic yet. Add one from the Accounts tab." />
        </div>
      ) : (
        squad.staff.map((member) => (
          <StaffRow key={member.membershipId} member={member} onSaved={onSaved} />
        ))
      )}
    </Card>
  )
}

export default function AdminStaff() {
  const [squads, setSquads] = useState(null)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      setSquads(await listSquadStaff())
    } catch (err) {
      setError(err.message)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // ⚠️ PATCHED IN PLACE RATHER THAN REFETCHED. A full reload after every title
  // edit would move focus and re-order nothing, for one changed string — and on
  // a screen where somebody is typing several titles in a row it would fight
  // them.
  const onSaved = useCallback((membershipId, title) => {
    setSquads((current) =>
      (current ?? []).map((squad) => ({
        ...squad,
        staff: squad.staff.map((member) =>
          member.membershipId === membershipId ? { ...member, title } : member,
        ),
      })),
    )
  }, [])

  if (error) {
    return (
      <Card className="p-4">
        <p role="alert" className="text-sm text-ink">
          {error}
        </p>
        <button
          type="button"
          onClick={load}
          className="mt-2 text-sm font-bold text-brand underline"
        >
          Try again
        </button>
      </Card>
    )
  }

  if (!squads) return <Spinner />

  const unstaffed = squads.filter((squad) => squad.staff.length === 0).length

  return (
    <div>
      {/* One <datalist> for the whole screen — the suggestions are identical on
          every row, and one per row would put fifteen copies in the document. */}
      <datalist id="staff-titles">
        {STAFF_TITLES.map((title) => (
          <option key={title} value={title} />
        ))}
      </datalist>

      <SectionTitle>Squad staff</SectionTitle>

      {/* ⚠️ THE HEADLINE IS THE GAP COUNT, NOT THE STAFF COUNT. "30 staff" reads
          as a healthy club; "12 squads have nobody" is the fact that needs
          acting on, and it is the reason this screen was built first. */}
      <p className="mb-3 text-sm text-ink-muted" data-testid="staff-summary">
        {unstaffed === 0
          ? `Every squad has someone. ${squads.length} squads.`
          : `${unstaffed} of ${squads.length} squads have nobody attached yet.`}
      </p>

      {squads.length === 0 ? (
        <Empty message="This club has no squads yet." />
      ) : (
        squads.map((squad) => <SquadCard key={squad.id} squad={squad} onSaved={onSaved} />)
      )}
    </div>
  )
}
