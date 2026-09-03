import { useEffect, useState } from 'react'
import useRevealOnOpen from '../lib/useRevealOnOpen.js'
import { Link } from 'react-router-dom'
import Button from '../components/Button.jsx'
import { friendlyMessage } from '../lib/friendlyError.js'
import Card from '../components/Card.jsx'
import Empty from '../components/Empty.jsx'
import Spinner from '../components/Spinner.jsx'
import {
  listAllLeagueTeams,
  setLeagueTeamActive,
  upsertLeagueTeam,
} from '../data/leagueTeams.js'
import { listContactsForPlayers, listPlayers, restorePlayer } from '../data/players.js'
import {
  setTeamScoringKinds,
  setTeamRequiresContact,
  setTeamDefaultFormat,
  setTeamUsesJerseyNumbers,
  createTeam,
} from '../data/teams.js'
import { useMemberships } from '../lib/memberships.jsx'
import { SCORE_KINDS, SCORE_LABELS, scoringForBand, scoringForTeam } from '../lib/scoring.js'
import { ageBandFromTeamName } from '../lib/ageGroup.js'
import { formatLeftDate, isLeaver } from '../lib/leavers.js'
import { FORMATS, formatLabel } from '../lib/fixtureFormat.js'
import { isMinisTeam } from '../lib/minis.js'
import InviteForm from './InviteForm.jsx'
import Sheet from '../components/Sheet.jsx'
import StorageCard from '../components/StorageCard.jsx'
import useDiscardGuard from '../lib/useDiscardGuard.js'
import DiscardConfirm from '../components/DiscardConfirm.jsx'

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
          : 'border-line text-ink hover:border-brand hover:text-brand-ink',
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

// ══ SCORING ═══════════════════════════════════════════════════════════════
//
// Jay, 12 Aug 2026: scoring should be "a selectable option for scoring
// methods", set "in the area where teams are created". This is that area.
//
// ⚠️ THE OVERRIDE IS teams.scoring_kinds, A COLUMN — never the squad's name.
// Same rule as teams.is_senior and teams.self_registration_allowed: renaming a
// squad must not silently change what may be recorded against it. NULL means
// "use the age-band default", and every squad is null until somebody uses this
// panel.
//
// ⚠️ THIS DOES NOT EDIT THE POINTS. A try is five because that is rugby; what
// varies by age is which acts are AVAILABLE. See src/lib/scoring.js.

/** "Tries · Conversions" — the chip's short form. */
function kindsChipLabel(kinds) {
  return kinds.map((kind) => SCORE_LABELS[kind]).join(' · ')
}

function ScoringChip({ team, onSelect, busy }) {
  const kinds = scoringForTeam(team)
  const overridden = Array.isArray(team.scoring_kinds)
  const band = ageBandFromTeamName(team.name)

  return (
    <button
      type="button"
      data-testid={`scoring-chip-${team.id}`}
      disabled={busy}
      onClick={() => onSelect(team)}
      // ⚠️ SAID OUT LOUD. "Set for this squad" versus "the U12 default" is the
      // whole distinction this chip carries, and a dotted border says it to
      // nobody using a screen reader.
      aria-label={`Scoring for ${team.name}: ${kindsChipLabel(kinds)}${
        overridden ? ', set for this squad' : `, the default for ${band ? `U${band}` : 'its age group'}`
      }`}
      className={[
        CHIP,
        'inline-flex items-center gap-1.5',
        overridden
          ? 'border-brand text-brand-ink hover:border-brand-deep'
          : 'border-dashed border-line text-ink-faint hover:border-brand hover:text-brand-ink',
        busy ? 'opacity-60' : '',
      ].join(' ')}
    >
      <span aria-hidden="true" className="text-[11px] font-extrabold uppercase tracking-[.4px]">
        Scoring
      </span>
      <span aria-hidden="true">{kindsChipLabel(kinds)}</span>
    </button>
  )
}

export default function AdminClub() {
  // ⚠️ `reload` IS LOAD-BEARING HERE, not defensive. `teams` is loaded once per
  // session by the memberships context, so a scoring change saved on this
  // screen would sit in the database and not on screen — and the chip would
  // keep showing the old set — until a full page reload. Nothing else on this
  // screen writes to `teams`, which is why no other panel needs it.
  const { teams, reload: reloadTeams } = useMemberships()

  const [players, setPlayers] = useState([])
  // Players with a non-null left_at — kept out of `players` so every existing
  // count on this screen (squad sizes, missing-contact counts) stays a count
  // of the CURRENT roster, not a mix of current and departed.
  const [leavers, setLeavers] = useState([])
  const [restoring, setRestoring] = useState(null)
  const [restoreError, setRestoreError] = useState(null)
  const [contacts, setContacts] = useState([])
  const [loading, setLoading] = useState(true)
  const [settled, setSettled] = useState(false)
  const [error, setError] = useState(null)
  const [reloadToken, setReloadToken] = useState(0)
  // Whether the invite Sheet is open. A plain boolean: InviteForm has no
  // "edit" mode and no row of its own to carry, only ever the "add" case.
  const [inviteOpen, setInviteOpen] = useState(false)

  // ⚠️ THE FIRST TIME THE APP CREATES A SQUAD. Until 3 Sep 2026 every squad
  // this club fielded was inserted by a migration — there was no "add a
  // squad" button anywhere, which is why this is a plain boolean with a
  // fresh draft each time rather than an "edit" mode like the league-team
  // panel above: there is no existing row to seed it from.
  const [addSquadOpen, setAddSquadOpen] = useState(false)
  const [draftSquadName, setDraftSquadName] = useState('')
  // ⚠️ "Jersey numbers" is a column, never derived from Senior — a touch
  // side is senior without numbers (same rule setTeamUsesJerseyNumbers
  // carries in src/data/teams.js). The three switches are independent on
  // purpose, and every one defaults OFF — the same fail-safe default
  // requires_contact already uses (a squad this form creates should never
  // silently claim a flag nobody asked for).
  const [draftIsSenior, setDraftIsSenior] = useState(false)
  const [draftUsesJerseyNumbers, setDraftUsesJerseyNumbers] = useState(false)
  const [draftSelfRegistration, setDraftSelfRegistration] = useState(false)
  const [addSquadSaving, setAddSquadSaving] = useState(false)
  const [addSquadError, setAddSquadError] = useState(null)

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

  // The squad whose scoring is being edited, and the ticked kinds. A separate
  // panel from the league-team one above: they answer different questions about
  // the same row, and one panel doing both would have to explain which.
  //
  // ⚠️ THE ID, NOT THE ROW. Holding the row itself would freeze a SNAPSHOT
  // taken when the panel opened, so `reloadTeams()` could refresh the context
  // underneath and this panel would carry on drawing the values it captured.
  // That is fatal for the contact switch below, whose entire job is to show
  // the squad's current state and flip it in place. Deriving the row from
  // `teams` by id costs a find() per render and makes a reload redraw the panel.
  const [scoringTeamId, setScoringTeamId] = useState(null)
  const scoringPanelRef = useRevealOnOpen(scoringTeamId)
  const leagueTeamPanelRef = useRevealOnOpen(editing?.id ?? null)
  const scoringTeam = teams.find((team) => team.id === scoringTeamId) ?? null
  const [draftKinds, setDraftKinds] = useState([])

  useEffect(() => {
    let mounted = true
    setLoading(true)
    setError(null)

    listPlayers({ includeLeft: true })
      .then((playerRows) => {
        if (!mounted) return null
        const current = playerRows.filter((p) => !isLeaver(p))
        setPlayers(current)
        setLeavers(playerRows.filter(isLeaver))
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
          // ⚠️ `current`, NOT `playerRows`. This is the ONE screen that loads
          // leavers, and every count on it is deliberately a count of the
          // current roster (see the useState above). Asking for contacts on
          // the unsplit list put departed children back into the
          // missing-contact nag — the only place in the app that chases a
          // parent for a phone number. Fixed by the leavers review, 2 Sep 2026.
          listContactsForPlayers(current.map((player) => player.id)),
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
        setLeavers([])
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

  function openScoring(team) {
    setScoringTeamId(team.id)
    setEditing(null)
    setAdding(null)
    // ⚠️ SEEDED FROM scoringForTeam, NOT FROM THE RAW COLUMN. The column is null
    // on a squad that has never been touched, and seeding [] would present every
    // untouched squad as "scores nothing" — then saving would write that.
    setDraftKinds(scoringForTeam(team))
    setSaveError(null)
  }

  function closePanel() {
    setEditing(null)
    setAdding(null)
    setScoringTeamId(null)
    setDraftName('')
    setDraftDivision('')
    setDraftKinds([])
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

  /**
   * Saves the squad's scoring set, or clears it back to the age-band default.
   *
   * ⚠️ `reloadTeams()` IS INSIDE THE WORK, NOT AFTER IT. `run` only reaches
   * closePanel on success, so a refused write leaves the panel open with the
   * ticks intact — and refreshing the context on a write that never landed
   * would redraw the chip as though nothing had been attempted.
   */
  function saveScoring(kinds) {
    const id = scoringTeamId
    return run(async () => {
      await setTeamScoringKinds(id, kinds)
      await reloadTeams()
    })
  }

  /**
   * Flips the squad between contact and tag, IN PLACE.
   *
   * ⚠️ THIS DELIBERATELY DOES NOT GO THROUGH `run`, AND THE DIFFERENCE IS THE
   * WHOLE POINT OF A SWITCH. `run` closes the panel on success, which is right
   * for the Save button below: pressing Save FINISHES a task, and a panel with
   * nothing left to say should get out of the way. A switch is not a task — it
   * REPORTS a state and changes it, so it has to still be on screen afterwards
   * showing the new one. Closing the panel out from under the tap would take
   * away the only answer to "did that land?" at the moment it arrived.
   * Everything else `run` does — the saving flag, clearing the last error,
   * catching a refusal — is reproduced here on purpose rather than shared.
   *
   * ⚠️ `reloadTeams()` IS WHAT MOVES THE SWITCH. The panel derives its row
   * from `teams` by id, so refreshing the memberships context is the only thing
   * that can change what `aria-checked` reads. On a refused write nothing is
   * reloaded and nothing moves, which is the honest picture: the switch keeps
   * showing what the database actually holds, with the error beneath it.
   */
  async function saveRequiresContact(next) {
    const id = scoringTeamId
    setSaving(true)
    setSaveError(null)
    try {
      await setTeamRequiresContact(id, next)
      await reloadTeams()
    } catch (failure) {
      setSaveError(failure)
    } finally {
      setSaving(false)
    }
  }

  /** Same shape as saveRequiresContact: the select shows what the reload brings back. */
  async function saveDefaultFormat(next) {
    const id = scoringTeamId
    setSaving(true)
    setSaveError(null)
    try {
      await setTeamDefaultFormat(id, next === '' ? null : Number(next))
      await reloadTeams()
    } catch (failure) {
      setSaveError(failure)
    } finally {
      setSaving(false)
    }
  }

  /**
   * Flips whether this squad carries season jersey numbers, IN PLACE.
   *
   * ⚠️ MIRRORS saveRequiresContact EXACTLY, and for the same reason: this is
   * a switch, not a task, so it does NOT go through `run` — the panel stays
   * open and redraws with whatever the reload brings back, on both success
   * and refusal. See saveRequiresContact above for the full reasoning; it
   * applies here unchanged.
   */
  async function saveUsesJerseyNumbers(next) {
    const id = scoringTeamId
    setSaving(true)
    setSaveError(null)
    try {
      await setTeamUsesJerseyNumbers(id, next)
      await reloadTeams()
    } catch (failure) {
      setSaveError(failure)
    } finally {
      setSaving(false)
    }
  }

  function openAddSquad() {
    setAddSquadOpen(true)
    setDraftSquadName('')
    setDraftIsSenior(false)
    setDraftUsesJerseyNumbers(false)
    setDraftSelfRegistration(false)
    setAddSquadError(null)
  }

  function closeAddSquad() {
    setAddSquadOpen(false)
    setAddSquadError(null)
  }
  // A mis-tap on the backdrop must not throw a typed squad name away (Jay,
  // 3 Sep 2026). The three switches alone are not typing.
  const addSquadGuard = useDiscardGuard({
    dirty: addSquadOpen && draftSquadName.trim() !== '',
    saving: addSquadSaving,
    onClose: closeAddSquad,
  })

  /**
   * Creates the squad via the create_team RPC (src/data/teams.js), then
   * reloads so it appears in the Age groups list below.
   *
   * ⚠️ THE BLANK-NAME CHECK IS CLIENT-SIDE TOO, and deliberately duplicates
   * what create_team itself refuses (errcode 22023): a trip to the server to
   * be told what an empty input already says is a worse experience, not a
   * more correct one, and the RPC's own refusal stays as the real boundary.
   */
  async function saveNewSquad() {
    const name = draftSquadName.trim()
    if (!name) {
      setAddSquadError(new Error('A squad needs a name.'))
      return
    }
    setAddSquadSaving(true)
    setAddSquadError(null)
    try {
      await createTeam({
        name,
        isSenior: draftIsSenior,
        usesJerseyNumbers: draftUsesJerseyNumbers,
        selfRegistrationAllowed: draftSelfRegistration,
      })
      await reloadTeams()
      setAddSquadOpen(false)
    } catch (failure) {
      setAddSquadError(failure)
    } finally {
      setAddSquadSaving(false)
    }
  }

  function toggleKind(kind) {
    setDraftKinds((current) =>
      current.includes(kind)
        ? current.filter((existing) => existing !== kind)
        : // ⚠️ REBUILT IN SCORE_KINDS ORDER, never appended. The order these are
          // stored in is the order the match sheet renders its boxes, and a row
          // that reorders itself between two squads is how a coach types a
          // conversion into the penalties box.
          SCORE_KINDS.filter((candidate) => current.includes(candidate) || candidate === kind),
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
        <h3 className="text-base font-extrabold text-danger-ink">We couldn&apos;t load the club overview</h3>
        <p className="mt-2 text-sm leading-relaxed text-danger-ink">
          {friendlyMessage(error, 'Something went wrong. Try again.')}
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

      <div className="flex items-center justify-between gap-3">
        <SectionTitle>Age groups ({sortedTeams.length})</SectionTitle>
        <Button variant="secondary" onClick={openAddSquad}>
          Add squad
        </Button>
      </div>
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
                    className={`${CHIP} border-dashed border-line text-ink-muted hover:border-brand hover:text-brand-ink`}
                  >
                    +
                  </button>
                  {/* ⚠️ IN THE SAME ROW AS THE LEAGUE TEAMS, for the reason the
                      league-team chips are here at all: both are facts about
                      THIS squad, and a section of their own would have to
                      repeat the squad list. */}
                  <ScoringChip team={team} onSelect={openScoring} busy={saving} />
                </div>
              </div>
            )
          })}
        </Card>
      )}

      {(editing || adding) && (
        <Card ref={leagueTeamPanelRef} className="mt-3.5 p-3.5">
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
            <p role="alert" className="mt-2.5 text-[12.5px] font-semibold text-danger-ink">
              {friendlyMessage(saveError, "That didn't save. Try again.")}
            </p>
          )}
        </Card>
      )}

      {scoringTeam && (
        <Card className="mt-3.5 p-3.5" data-testid="scoring-panel" ref={scoringPanelRef}>
          <h3 className="mb-2.5 text-[12px] font-extrabold uppercase tracking-[.8px] text-ink-muted">
            Scoring for {scoringTeam.name}
          </h3>

          <p className="mb-2.5 text-[12.5px] leading-relaxed text-ink-muted">
            What a coach can record against this squad&rsquo;s fixtures, and whether it plays
            contact. The points are the laws of
            the game and are not editable — what changes by age is which of them apply.
          </p>

          <div className="flex flex-wrap gap-[6px]">
            {SCORE_KINDS.map((kind) => {
              const on = draftKinds.includes(kind)
              return (
                <button
                  key={kind}
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  disabled={saving}
                  onClick={() => toggleKind(kind)}
                  className={[
                    CHIP,
                    on
                      ? 'border-brand bg-brand text-white'
                      : 'border-line text-ink hover:border-brand hover:text-brand-ink',
                    saving ? 'opacity-60' : '',
                  ].join(' ')}
                >
                  {SCORE_LABELS[kind]}
                </button>
              )
            })}
          </div>

          {/* ⚠️ CONTACT OR TAG IS A FACT ABOUT THE SQUAD, and it is set here
              beside the scoring for the reason the scoring is here: this is the
              panel for "what applies to this squad". A section of its own would
              have to repeat the whole squad list to say the same thing.

              ⚠️ IT COMES FROM THE COLUMN, NOT THE NAME AND NOT THE AGE. This
              club runs tag sides above the age at which contact begins, and
              several squad names say nothing either way — so the flag decides
              which drills may be PUBLISHED to this squad, and a tackling drill
              never reaches a tag squad. The default (false) fails safe: a
              contact drill can never reach a squad nobody has marked.
              Reasoning: claude/specs/2026-08-21-training-plans-dashboard-design.md.

              ⚠️ SAVES ON THE CLICK, with no Save button. There is one bit to
              change, so a draft state would only be a second chance to forget
              to press Save.

              ⚠️ AND IT FLIPS WHERE IT STANDS. saveRequiresContact does NOT go
              through `run`, so the panel stays open and this switch redraws
              itself with the value the reload brought back. That is the
              opposite of what the Save button does, deliberately — the
              reasoning is on saveRequiresContact. */}
          <div className="mt-3 flex items-center justify-between gap-3">
            <span className="text-[13px] font-bold text-ink">Contact rugby</span>
            <button
              type="button"
              role="switch"
              aria-label="Contact rugby"
              aria-checked={scoringTeam.requires_contact === true}
              disabled={saving}
              onClick={() => saveRequiresContact(scoringTeam.requires_contact !== true)}
              className={[
                CHIP,
                scoringTeam.requires_contact === true
                  ? 'border-brand bg-brand text-white'
                  : 'border-line text-ink hover:border-brand hover:text-brand-ink',
                saving ? 'opacity-60' : '',
              ].join(' ')}
            >
              {scoringTeam.requires_contact === true ? 'Contact' : 'Tag'}
            </button>
          </div>

          {/* ⚠️ "Jersey numbers" IS A COLUMN, NEVER DERIVED FROM SENIOR — a
              touch side is senior without numbers, exactly as a squad's name
              says nothing reliable about contact above. Same shape as the
              Contact rugby switch: saves on the click with no Save button,
              flips where it stands via saveUsesJerseyNumbers (which mirrors
              saveRequiresContact and does not go through `run`), and reads
              straight off the column so a reload is what moves it.
              claude/plans/2026-09-02-senior-squads-2a-implementation.md. */}
          <div className="mt-3 flex items-center justify-between gap-3">
            <span className="text-[13px] font-bold text-ink">Jersey numbers</span>
            <button
              type="button"
              role="switch"
              aria-label="Jersey numbers"
              aria-checked={scoringTeam.uses_jersey_numbers === true}
              disabled={saving}
              onClick={() => saveUsesJerseyNumbers(scoringTeam.uses_jersey_numbers !== true)}
              className={[
                CHIP,
                scoringTeam.uses_jersey_numbers === true
                  ? 'border-brand bg-brand text-white'
                  : 'border-line text-ink hover:border-brand hover:text-brand-ink',
                saving ? 'opacity-60' : '',
              ].join(' ')}
            >
              {scoringTeam.uses_jersey_numbers === true ? 'On' : 'Off'}
            </button>
          </div>

          {/* ⚠️ A DEFAULT, NOT A RULE. What a NEW tournament or friendly for
              this squad pre-selects; every fixture still asks. A league match
              is always 15 and never reads this. Minis squads have their own
              formats and no sheet, so the control is hidden for them.
              claude/plans/2026-09-02-fixture-format.md. */}
          {!isMinisTeam(scoringTeam.name) && (
            <label className="mt-3 block">
              <span className="text-[13px] font-bold text-ink">Usual tournament format</span>
              <select
                value={scoringTeam.default_format == null ? '' : String(scoringTeam.default_format)}
                disabled={saving}
                onChange={(domEvent) => saveDefaultFormat(domEvent.target.value)}
                className="mt-1 w-full rounded-[11px] border-[1.5px] border-line bg-surface-card px-3 py-2.5 text-[16px] text-ink outline-none focus:border-brand"
              >
                <option value="">15s (default)</option>
                {FORMATS.filter((format) => format !== 15).map((format) => (
                  <option key={format} value={String(format)}>
                    {formatLabel(format)}
                  </option>
                ))}
              </select>
            </label>
          )}

          <div className="mt-3 flex flex-wrap gap-2.5">
            {/* ⚠️ REFUSED WHEN NOTHING IS TICKED, rather than silently saved as
                "tries only". cleanScoringKinds falls back to tries on an empty
                array so that a half-finished edit can never make a score
                impossible to enter — but that fallback is a SAFETY NET for data
                already in the database, not a way to interpret a button press.
                Saving nothing and getting tries is the app deciding what
                somebody meant. */}
            <Button disabled={saving || draftKinds.length === 0} onClick={() => saveScoring(draftKinds)}>
              {saving ? 'Saving…' : 'Save'}
            </Button>

            {/* ⚠️ NULL, NOT THE BAND'S LIST. Writing the default's values would
                freeze this squad at today's rules — the point of null is that a
                squad following the age-grade laws keeps following them when the
                laws, or this app's reading of them, are corrected. */}
            {Array.isArray(scoringTeam.scoring_kinds) && (
              <Button variant="secondary" disabled={saving} onClick={() => saveScoring(null)}>
                Use the age-group default
              </Button>
            )}

            <Button variant="ghost" disabled={saving} onClick={closePanel}>
              Cancel
            </Button>
          </div>

          <p className="mt-2.5 text-[12.5px] leading-relaxed text-ink-muted">
            {Array.isArray(scoringTeam.scoring_kinds)
              ? 'This squad has its own scoring set.'
              : `Following the ${
                  ageBandFromTeamName(scoringTeam.name)
                    ? `U${ageBandFromTeamName(scoringTeam.name)}`
                    : 'age-group'
                } default: ${kindsChipLabel(scoringForBand(ageBandFromTeamName(scoringTeam.name)))}.`}{' '}
            Changing it does not touch scores already recorded.
          </p>

          {saveError && (
            <p role="alert" className="mt-2.5 text-[12.5px] font-semibold text-danger-ink">
              {friendlyMessage(saveError, "That didn't save. Try again.")}
            </p>
          )}
        </Card>
      )}

      {leavers.length > 0 && (
        <Card as="section" aria-label="Left this season" className="mt-3.5 p-3.5">
          <h3 className="mb-2.5 text-[12px] font-extrabold uppercase tracking-[.8px] text-ink-muted">
            Left this season
          </h3>
          <ul className="divide-y divide-line">
            {leavers.map((player) => (
              <li key={player.id} className="flex items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-ink">{player.full_name}</p>
                  <p className="text-[12.5px] text-ink-muted">
                    {teams.find((team) => team.id === player.team_id)?.name ?? 'Unknown squad'} · left{' '}
                    {formatLeftDate(player.left_at)}
                  </p>
                </div>
                <Button
                  variant="secondary"
                  disabled={restoring === player.id}
                  onClick={() => {
                    setRestoring(player.id)
                    setRestoreError(null)
                    restorePlayer(player.id)
                      .then(() => setReloadToken((token) => token + 1))
                      .catch((err) => setRestoreError(err))
                      .finally(() => setRestoring(null))
                  }}
                >
                  {restoring === player.id ? 'Restoring…' : 'Restore'}
                </Button>
              </li>
            ))}
          </ul>
          {restoreError && (
            <p role="alert" className="mt-2 text-sm font-semibold text-danger-ink">
              {friendlyMessage(restoreError, "We couldn't restore that player. Try again.")}
            </p>
          )}
        </Card>
      )}

      <StorageCard />

      {inviteOpen && <InviteForm onClose={() => setInviteOpen(false)} />}

      {addSquadOpen && (
        <Sheet open onClose={addSquadGuard.requestClose} title="Add a squad">
          {addSquadGuard.confirming && <DiscardConfirm id="squad-discard" onDiscard={addSquadGuard.discard} onKeep={addSquadGuard.keep} />}
          <label className="mb-3.5 block">
            <span className="mb-1.5 block text-[12.5px] font-bold uppercase tracking-[.4px] text-ink-muted">
              Name
            </span>
            <input
              type="text"
              aria-label="Squad name"
              value={draftSquadName}
              disabled={addSquadSaving}
              autoFocus
              onChange={(domEvent) => setDraftSquadName(domEvent.target.value)}
              placeholder="1st XV"
              className="w-full rounded-[11px] border-[1.5px] border-line bg-surface-card px-3 py-[11px] text-[16px] text-ink outline-none transition placeholder:text-ink-faint focus:border-brand"
            />
          </label>

          <div className="mt-3 flex items-center justify-between gap-3">
            <span className="text-[13px] font-bold text-ink">Senior squad</span>
            <button
              type="button"
              role="switch"
              aria-label="Senior squad"
              aria-checked={draftIsSenior}
              disabled={addSquadSaving}
              onClick={() => setDraftIsSenior((current) => !current)}
              className={[
                CHIP,
                draftIsSenior
                  ? 'border-brand bg-brand text-white'
                  : 'border-line text-ink hover:border-brand hover:text-brand-ink',
                addSquadSaving ? 'opacity-60' : '',
              ].join(' ')}
            >
              {draftIsSenior ? 'On' : 'Off'}
            </button>
          </div>

          {/* ⚠️ INDEPENDENT OF Senior squad, ABOVE — never derived from it. A
              touch side is senior without numbers. */}
          <div className="mt-3 flex items-center justify-between gap-3">
            <span className="text-[13px] font-bold text-ink">Jersey numbers</span>
            <button
              type="button"
              role="switch"
              aria-label="Jersey numbers"
              aria-checked={draftUsesJerseyNumbers}
              disabled={addSquadSaving}
              onClick={() => setDraftUsesJerseyNumbers((current) => !current)}
              className={[
                CHIP,
                draftUsesJerseyNumbers
                  ? 'border-brand bg-brand text-white'
                  : 'border-line text-ink hover:border-brand hover:text-brand-ink',
                addSquadSaving ? 'opacity-60' : '',
              ].join(' ')}
            >
              {draftUsesJerseyNumbers ? 'On' : 'Off'}
            </button>
          </div>

          <div className="mt-3 flex items-center justify-between gap-3">
            <span className="text-[13px] font-bold text-ink">Players may register themselves</span>
            <button
              type="button"
              role="switch"
              aria-label="Players may register themselves"
              aria-checked={draftSelfRegistration}
              disabled={addSquadSaving}
              onClick={() => setDraftSelfRegistration((current) => !current)}
              className={[
                CHIP,
                draftSelfRegistration
                  ? 'border-brand bg-brand text-white'
                  : 'border-line text-ink hover:border-brand hover:text-brand-ink',
                addSquadSaving ? 'opacity-60' : '',
              ].join(' ')}
            >
              {draftSelfRegistration ? 'On' : 'Off'}
            </button>
          </div>

          <div className="mt-3.5 flex flex-wrap gap-2.5">
            <Button disabled={addSquadSaving} onClick={saveNewSquad}>
              {addSquadSaving ? 'Saving…' : 'Save'}
            </Button>
            <Button variant="ghost" disabled={addSquadSaving} onClick={addSquadGuard.requestClose}>
              Cancel
            </Button>
          </div>

          {addSquadError && (
            <p role="alert" className="mt-2.5 text-[12.5px] font-semibold text-danger-ink">
              {friendlyMessage(addSquadError, "That didn't save. Try again.")}
            </p>
          )}
        </Sheet>
      )}
    </div>
  )
}
