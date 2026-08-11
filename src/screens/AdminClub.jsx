import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Button from '../components/Button.jsx'
import Card from '../components/Card.jsx'
import Empty from '../components/Empty.jsx'
import Spinner from '../components/Spinner.jsx'
import {
  listAllLeagueTeams,
  setLeagueTeamActive,
  upsertLeagueTeam,
} from '../data/leagueTeams.js'
import { listContactsForPlayers, listPlayers } from '../data/players.js'
import { useMemberships } from '../lib/memberships.jsx'
import InviteForm from './InviteForm.jsx'

// The Club tab of /admin (admin-dashboard plan, 2026-08-05). Assembled from
// the parts of the old Admin.jsx worth keeping — age groups with player
// counts, the Invite entry point, links to Roster and Schedule — plus the
// one part of the deleted Overview.jsx worth keeping: the per-squad
// missing-contact count ("roster gaps").
//
// ⚠️ NO CLUB-MEMBERS LIST HERE, deliberately. The old /more listed every
// club member read-only while /accounts listed the same rows with write
// controls — the duplication logged in state-of-play.md. The Accounts tab is
// now the ONLY place club members are listed or edited.
//
// Mounted only under AdminDashboard, which has already checked isAdmin() on
// the effective membership set, so this file does not re-gate. Its queries
// are club-wide (listPlayers() with no teamIds): an admin sees every squad,
// and passing an empty array would mean "no teams" and return nothing (see
// src/data/players.js). RLS is what actually decides what comes back.

function SectionTitle({ children }) {
  return (
    <h3 className="mb-2.5 ml-0.5 mt-[18px] text-[13px] font-extrabold uppercase tracking-[.8px] text-ink-muted first:mt-0">
      {children}
    </h3>
  )
}

// ══ LEAGUE TEAMS ══════════════════════════════════════════════════════════
//
// ⚠️ A SQUAD IS NOT A LEAGUE TEAM, and this is the only screen where the
// difference is editable. `teams` is the training group ("U14B Contact");
// `league_teams` is what actually plays in a division ("ADHQ2"). One squad can
// enter three — Jay, 11 Aug 2026: "each age group has 3 divisions in the
// league, a, b, and c, clubs can have multiple teams at an age group".
//
// ⚠️ THE LETTER IN A SQUAD NAME IS GENDER, NOT DIVISION. "U14B Contact" is U14
// BOYS. The division is the `division` column below and is never parsed out of
// a name — private.squad_expects_gender parses exactly that suffix for a
// different purpose, and a division read from there would be the gender.
//
// It lives inside the Age groups list rather than in a section of its own so
// that a league team is entered against the squad it belongs to, in the same
// row. A separate section would have to repeat the squad list, which is the
// duplication the /more-vs-/accounts cleanup existed to remove.

// Nullable on purpose: a club can enter a team that is in no lettered division
// at all, and forcing a letter would invent data.
const DIVISIONS = ['A', 'B', 'C']

const CHIP =
  'rounded-[8px] border-[1.5px] px-2.5 py-1 text-[12.5px] font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2'

function LeagueTeamChip({ leagueTeam, onSelect, busy }) {
  const retired = !leagueTeam.is_active
  // ⚠️ SAID OUT LOUD, not merely drawn. The dashed outline and the division
  // suffix are both invisible to a screen reader, and "which are we still
  // entering, and in which division" is the question this section answers.
  const label = [
    leagueTeam.rcm_name,
    leagueTeam.division ? `Division ${leagueTeam.division}` : null,
    retired ? 'retired' : null,
  ]
    .filter(Boolean)
    .join(', ')

  return (
    <button
      type="button"
      data-testid="league-team-chip"
      disabled={busy}
      onClick={() => onSelect(leagueTeam)}
      aria-label={label}
      className={[
        CHIP,
        'inline-flex items-center gap-1.5',
        retired
          ? 'border-dashed border-line text-ink-faint'
          : 'border-line text-ink hover:border-brand hover:text-brand',
        busy ? 'opacity-60' : '',
      ].join(' ')}
    >
      <span>{leagueTeam.rcm_name}</span>
      {leagueTeam.division && (
        <span aria-hidden="true" className="text-[11px] font-extrabold text-ink-faint">
          {leagueTeam.division}
        </span>
      )}
    </button>
  )
}

export default function AdminClub() {
  const { teams } = useMemberships()

  const [players, setPlayers] = useState([])
  const [contacts, setContacts] = useState([])
  const [loading, setLoading] = useState(true)
  const [settled, setSettled] = useState(false)
  const [error, setError] = useState(null)
  const [reloadToken, setReloadToken] = useState(0)
  // Whether the invite Sheet is open. A plain boolean: InviteForm has no
  // "edit" mode and no row of its own to carry, only ever the "add" case.
  const [inviteOpen, setInviteOpen] = useState(false)

  // The club's league teams, and the one being edited or added. `editing` is a
  // row; `adding` is the SQUAD a new team is being entered against, so that the
  // new row cannot be filed under a squad other than the one whose "+" was
  // tapped. null in both means the panel is closed.
  const [leagueTeams, setLeagueTeams] = useState([])
  const [editing, setEditing] = useState(null)
  const [adding, setAdding] = useState(null)
  const [draftName, setDraftName] = useState('')
  const [draftDivision, setDraftDivision] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)

  useEffect(() => {
    let mounted = true
    setLoading(true)
    setError(null)

    listPlayers()
      .then((playerRows) => {
        if (!mounted) return null
        setPlayers(playerRows)
        // Same bulk contact-presence query Overview.jsx used, moved here
        // with it (src/data/players.js listContactsForPlayers) — one query
        // for the whole club rather than one per player.
        //
        // ⚠️ RETIRED LEAGUE TEAMS ARE INCLUDED, and this is the only screen
        // that asks for them: it is the only screen from which one can be
        // brought back. Hiding a retired team here would make it look deleted,
        // and it would then be re-added under a name that collides with
        // league_teams_team_id_rcm_name_key — which is scoped to the SQUAD, so
        // the collision is always with a team in this same age group.
        return Promise.all([
          listContactsForPlayers(playerRows.map((player) => player.id)),
          listAllLeagueTeams({ includeRetired: true }),
        ])
      })
      .then((rows) => {
        if (!mounted || !rows) return
        const [contactRows, leagueTeamRows] = rows
        setContacts(contactRows)
        setLeagueTeams(leagueTeamRows)
      })
      .catch((err) => {
        if (!mounted) return
        setError(err)
        setPlayers([])
        setContacts([])
        setLeagueTeams([])
      })
      .finally(() => {
        if (!mounted) return
        setLoading(false)
        setSettled(true)
      })

    return () => {
      mounted = false
    }
  }, [reloadToken])

  const isFirstLoad = loading && !settled

  const sortedTeams = [...teams].sort((a, b) => {
    const orderDiff = (a.sort_order ?? 0) - (b.sort_order ?? 0)
    if (orderDiff !== 0) return orderDiff
    return a.name.localeCompare(b.name)
  })

  const playersByTeam = new Map()
  players.forEach((player) => {
    if (!playersByTeam.has(player.team_id)) playersByTeam.set(player.team_id, [])
    playersByTeam.get(player.team_id).push(player)
  })

  // A player "has contact info" if listContactsForPlayers returned a row for
  // them. Anyone not in this set is a gap an admin can close.
  const contactedPlayerIds = new Set(contacts.map((row) => row.player_id))

  // ⚠️ GROUPED BY team_id, AND EACH SQUAD IS SHOWN ONLY ITS OWN. The read is
  // club-wide (one round trip rather than one per squad), so this grouping is
  // the thing standing between the screen and a club-wide list — which is what
  // would let somebody enter a U16 team against a U14 squad.
  const leagueTeamsByTeam = new Map()
  leagueTeams.forEach((leagueTeam) => {
    if (!leagueTeamsByTeam.has(leagueTeam.team_id)) leagueTeamsByTeam.set(leagueTeam.team_id, [])
    leagueTeamsByTeam.get(leagueTeam.team_id).push(leagueTeam)
  })

  function openEdit(leagueTeam) {
    setEditing(leagueTeam)
    setAdding(null)
    setDraftName(leagueTeam.rcm_name)
    setDraftDivision(leagueTeam.division ?? '')
    setSaveError(null)
  }

  function openAdd(team) {
    setAdding(team)
    setEditing(null)
    setDraftName('')
    setDraftDivision('')
    setSaveError(null)
  }

  function closePanel() {
    setEditing(null)
    setAdding(null)
    setDraftName('')
    setDraftDivision('')
    setSaveError(null)
  }

  async function run(work) {
    setSaving(true)
    setSaveError(null)
    try {
      await work()
      closePanel()
      setReloadToken((token) => token + 1)
    } catch (failure) {
      // ⚠️ LEFT OPEN, WITH THE TYPING INTACT. upsertLeagueTeam throws on the
      // RLS-filtered write that arrives as data === null with error === null;
      // closing here would present a refused save as a completed one.
      setSaveError(failure)
    } finally {
      setSaving(false)
    }
  }

  function saveLeagueTeam() {
    // ⚠️ NULL, NEVER ''. `division` carries a check constraint of ('A','B','C'),
    // so an empty string is not "no division" to Postgres — it is a violation,
    // and the save would fail on a field somebody deliberately left blank.
    const division = draftDivision === '' ? null : draftDivision
    const rcm_name = draftName.trim()

    return run(() =>
      editing
        ? upsertLeagueTeam({ id: editing.id, rcm_name, division })
        : upsertLeagueTeam({
            club_id: adding.club_id,
            team_id: adding.id,
            rcm_name,
            division,
          }),
    )
  }

  if (isFirstLoad) {
    return (
      <Card className="flex justify-center py-10">
        <Spinner label="Loading the club overview…" />
      </Card>
    )
  }

  if (error) {
    return (
      <Card role="alert" className="p-6 text-center">
        <h3 className="text-base font-extrabold text-brand-deep">We couldn&apos;t load the club overview</h3>
        <p className="mt-2 text-sm leading-relaxed text-brand-deep">
          {error.message || 'Something went wrong. Try again.'}
        </p>
        <Button
          onClick={() => setReloadToken((token) => token + 1)}
          className="mx-auto mt-4"
        >
          Try again
        </Button>
      </Card>
    )
  }

  return (
    <div>
      <SectionTitle>Manage</SectionTitle>
      <Card className="p-[14px]">
        <div className="flex flex-col gap-2.5 desktop:flex-row">
          {/* `as={Link}` rather than a hand-rolled class string: these sit in a
              row with the "Invite a member" button below and must match it. */}
          <Button as={Link} variant="secondary" to="/roster" className="flex-1">
            Manage roster &amp; players
          </Button>
          <Button as={Link} variant="secondary" to="/schedule" className="flex-1">
            Manage schedule &amp; fixtures
          </Button>
          <Button onClick={() => setInviteOpen(true)} className="flex-1">
            Invite a member
          </Button>
        </div>
      </Card>

      <SectionTitle>Age groups ({sortedTeams.length})</SectionTitle>
      {sortedTeams.length === 0 ? (
        <Card>
          <Empty message="No age groups yet." />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          {sortedTeams.map((team) => {
            const teamPlayers = playersByTeam.get(team.id) ?? []
            const missingContact = teamPlayers.filter(
              (player) => !contactedPlayerIds.has(player.id),
            ).length
            const squadLeagueTeams = leagueTeamsByTeam.get(team.id) ?? []
            return (
              <div
                key={team.id}
                data-testid={`team-row-${team.id}`}
                className="border-b border-line px-[14px] py-[11px] last:border-b-0"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[15px] font-bold text-ink">{team.name}</span>
                  <span className="text-[12.5px] font-semibold text-ink-muted">
                    {teamPlayers.length} {teamPlayers.length === 1 ? 'player' : 'players'}
                    {missingContact > 0 ? ` · ${missingContact} missing contact info` : ''}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-[6px]">
                  {squadLeagueTeams.map((leagueTeam) => (
                    <LeagueTeamChip
                      key={leagueTeam.id}
                      leagueTeam={leagueTeam}
                      onSelect={openEdit}
                      busy={saving}
                    />
                  ))}
                  <button
                    type="button"
                    aria-label={`Add league team to ${team.name}`}
                    disabled={saving}
                    onClick={() => openAdd(team)}
                    className={`${CHIP} border-dashed border-line text-ink-muted hover:border-brand hover:text-brand`}
                  >
                    +
                  </button>
                </div>
              </div>
            )
          })}
        </Card>
      )}

      {(editing || adding) && (
        <Card className="mt-3.5 p-3.5">
          <h3 className="mb-2.5 text-[12px] font-extrabold uppercase tracking-[.8px] text-ink-muted">
            {editing ? `Edit ${editing.rcm_name}` : `Add a league team to ${adding.name}`}
          </h3>

          <div className="flex flex-wrap items-end gap-2.5">
            <label className="min-w-0 flex-1">
              <span className="mb-1.5 block text-[12.5px] font-bold uppercase tracking-[.4px] text-ink-muted">
                Name
              </span>
              <input
                type="text"
                aria-label="League team name"
                value={draftName}
                disabled={saving}
                autoFocus
                onChange={(domEvent) => setDraftName(domEvent.target.value)}
                placeholder="ADHQ2"
                className="w-full rounded-[8px] border-[1.5px] border-line bg-surface-card px-3 py-2 text-[16px] text-ink outline-none transition focus:border-brand"
              />
            </label>

            <label className="min-w-0">
              <span className="mb-1.5 block text-[12.5px] font-bold uppercase tracking-[.4px] text-ink-muted">
                Division
              </span>
              <select
                aria-label="Division"
                value={draftDivision}
                disabled={saving}
                onChange={(domEvent) => setDraftDivision(domEvent.target.value)}
                className="rounded-[8px] border-[1.5px] border-line bg-surface-card px-3 py-2 text-[16px] text-ink outline-none transition focus:border-brand"
              >
                {/* "None" is a real answer, not a prompt to choose — a club can
                    enter a team that is in no lettered division. */}
                <option value="">None</option>
                {DIVISIONS.map((division) => (
                  <option key={division} value={division}>
                    {division}
                  </option>
                ))}
              </select>
            </label>

            <Button disabled={saving || !draftName.trim()} onClick={saveLeagueTeam}>
              {saving ? 'Saving…' : editing ? 'Save' : 'Add league team'}
            </Button>

            {editing && (
              <Button
                variant={editing.is_active ? 'dangerQuiet' : 'secondary'}
                disabled={saving}
                onClick={() => run(() => setLeagueTeamActive(editing.id, !editing.is_active))}
              >
                {editing.is_active ? 'Retire' : 'Bring back'}
              </Button>
            )}

            <Button variant="ghost" disabled={saving} onClick={closePanel}>
              Cancel
            </Button>
          </div>

          {/* ⚠️ THE OPPOSITE OF THE PITCH WARNING, and worth saying for the
              same reason — people arrive at this panel expecting Delete.
              `events.league_team_id` is a real foreign key, so a rename
              follows every fixture that points at it and retiring changes
              nothing already played. Deleting is the destructive one, which is
              why the screen does not offer it: ON DELETE SET NULL would strip
              the league identity off every fixture the team ever played, and
              afterwards those are indistinguishable from friendlies. */}
          {editing && (
            <p className="mt-2.5 text-[12.5px] leading-relaxed text-ink-muted">
              Renaming follows the fixtures — they will all say the new name. Retiring takes it
              out of the picker for new fixtures, and fixtures already played keep{' '}
              <strong className="font-bold text-ink">{editing.rcm_name}</strong>.
            </p>
          )}

          {saveError && (
            <p role="alert" className="mt-2.5 text-[12.5px] font-semibold text-brand-deep">
              {saveError.message || "That didn't save. Try again."}
            </p>
          )}
        </Card>
      )}

      {inviteOpen && <InviteForm onClose={() => setInviteOpen(false)} />}
    </div>
  )
}
