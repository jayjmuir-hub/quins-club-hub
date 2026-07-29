import { useEffect, useMemo, useState } from 'react'
import Badge from '../components/Badge.jsx'
import Card from '../components/Card.jsx'
import Empty from '../components/Empty.jsx'
import ScopeNote from '../components/ScopeNote.jsx'
import Spinner from '../components/Spinner.jsx'
import RosterTable from '../components/RosterTable.jsx'
import TeamPills, { ALL_TEAMS_ID } from '../components/TeamPills.jsx'
import PlayerDetail from './PlayerDetail.jsx'
import PlayerForm from './PlayerForm.jsx'
import PlayerImport from './PlayerImport.jsx'
import { listPlayers } from '../data/players.js'
import { useMemberships } from '../lib/memberships.jsx'
import { canEditTeam, isAdmin, roleLabel, visibleTeams } from '../lib/scope.js'
import { initials } from '../lib/playerFormat.js'
import { useMediaQuery, DESKTOP_QUERY } from '../lib/useMediaQuery.js'

// The team filter survives a reload. Without this, choosing club-wide as the
// desktop default (desktop-spec.md §10 decision 2) would make a coach who
// only runs one age group re-filter on every visit — the noise objection to
// that decision, and this is the mitigation for it.
const TEAM_FILTER_KEY = 'quins.roster.teamFilter'

function readStoredFilter() {
  try {
    return window.localStorage.getItem(TEAM_FILTER_KEY) || ALL_TEAMS_ID
  } catch {
    // Private browsing and some locked-down enterprise profiles throw on
    // access rather than returning null. A filter is a convenience; failing
    // to read one must never stop the roster rendering.
    return ALL_TEAMS_ID
  }
}

// Roster & members (design-system.md §5.3): scope note, section head, search
// bar, a team filter, then the grouped player list. Reads players once for
// the whole visible scope and filters/groups in memory — the scope is at
// most 15 squads' worth of players, so refetching on every keystroke or pill
// tap would add latency and flicker for nothing.
//
// Access control is not enforced here. RLS decides which rows come back;
// visibleTeams() only tells the UI which pills to draw and which team ids to
// ask for, so a mistake here can narrow what a user sees but can never widen
// it. In particular an empty teamIds array means "no teams, show nothing"
// (see src/data/players.js) — never "no filter, show everything".
//
// The helpers below stay local rather than moving to a src/lib module: only
// this screen needs them (PlayerDetail receives everything as props), and
// src/lib/eventFormat.js was extracted only because two screens genuinely
// shared it.

// Ported verbatim from the prototype's posGroup() (design-system.md §7), so
// the grouped-by-position view matches the approved design exactly.
const FORWARDS = ['Prop', 'Hooker', 'Lock', 'Flanker', 'Number 8']
const BACKS = ['Scrum-half', 'Fly-half', 'Centre', 'Wing', 'Fullback']
const POSITION_GROUP_ORDER = ['Forwards', 'Backs', 'Other']

// design-system.md's --muted (#77726e) is specified against a card, where it
// measures 4.755:1 on white and clears AA. The section head and the group
// headers sit OUTSIDE any card, on --paper (#f5f4f3), where the same pair
// measures 4.329:1 and fails the 4.5:1 threshold (both ratios recomputed for
// this change rather than taken on trust). Darkened here to #5c5854 —
// 6.417:1 on paper — which is already this project's answer wherever --muted
// lands on a light fill (Chip's and Badge's neutral variants use exactly this
// value), so it introduces no new colour. --muted inside a card is untouched:
// the player row's "Flanker · U10" meta line still uses it.
const MUTED_ON_PAPER = 'text-ink-muted'

function positionGroup(position) {
  if (FORWARDS.includes(position)) return 'Forwards'
  if (BACKS.includes(position)) return 'Backs'
  return 'Other'
}

// Every group is ordered by name. The prototype sorted position groups by
// jersey number, but the club does not use numbers (see playerFormat.js), so
// that sort had nothing to sort on. Stated explicitly here rather than
// inherited from listPlayers' ORDER BY, so the ordering the user sees is a
// decision this screen makes and a change to the query can't silently
// scramble it.
function byName(a, b) {
  return a.full_name.localeCompare(b.full_name)
}

// Case-insensitive substring match across name, position and age group — the
// three things printed on a roster row, so anything a user can see, they can
// search for (design-system.md §4.9).
function matchesQuery(player, teamName, query) {
  if (!query) return true
  const haystack = [player.full_name, player.position, teamName]
    .filter((part) => part != null && part !== '')
    .join(' ')
    .toLowerCase()
  return haystack.includes(query)
}

function SearchIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  )
}

function ChevronRightIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="m9 5 7 7-7 7" />
    </svg>
  )
}

function PlayerRow({ player, teamName, onSelect }) {
  return (
    <button
      type="button"
      data-testid="player-row"
      onClick={() => onSelect(player.id)}
      // `flex` and `items-center` are load-bearing, not decorative:
      // Chromium's UA stylesheet centres a <button>'s content inside its box,
      // which would push this row's contents around once it is wider or
      // taller than its text. Setting the layout explicitly overrides that.
      className="flex w-full items-center gap-3 border-b border-line px-[14px] py-[11px] text-left transition last:border-b-0 hover:bg-surface-mute focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand"
    >
      {/* Initials tile (design-system.md §4.15 .pnum, which the prototype
          filled with a jersey number). aria-hidden because it restates the
          name rendered right beside it — without that, every row would
          announce itself as "T F Tom Fletcher". Always populated, so the
          flat no-number variant of this tile is gone with the numbers. */}
      <span
        className="grid h-10 w-10 shrink-0 place-items-center rounded-[11px] bg-[image:linear-gradient(135deg,theme(colors.brand.deep),theme(colors.brand.DEFAULT))] text-[13px] font-extrabold tracking-[.5px] text-white"
        aria-hidden="true"
      >
        {initials(player.full_name)}
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-1.5">
          <span data-testid="player-name" className="text-[15px] font-bold text-ink">
            {player.full_name}
          </span>
          {player.is_captain && <Badge tone="captain">Capt</Badge>}
        </span>
        <span className="mt-0.5 block text-[12.5px] text-ink-faint">
          {player.position || 'Position not set'} · {teamName}
        </span>
      </span>

      <ChevronRightIcon className="h-5 w-5 shrink-0 text-ink-faint" aria-hidden="true" />
    </button>
  )
}

function RosterGroup({ label, players, teamsById, onSelect }) {
  return (
    <div className="mb-4 last:mb-0">
      <h3 className={`mb-2 flex items-center gap-2 text-[12.5px] font-extrabold uppercase tracking-[.5px] ${MUTED_ON_PAPER}`}>
        <span data-testid="group-label">{label}</span>
        <span
          data-testid="group-count"
          className="rounded-[20px] bg-surface-sunk px-2 py-0.5 text-[11px] font-extrabold text-ink-muted"
        >
          {players.length}
        </span>
      </h3>
      <Card className="overflow-hidden">
        {players.map((player) => (
          <PlayerRow
            key={player.id}
            player={player}
            teamName={teamsById.get(player.team_id)?.name ?? 'No age group'}
            onSelect={onSelect}
          />
        ))}
      </Card>
    </div>
  )
}

export default function Roster() {
  const { memberships, teams } = useMemberships()

  const scopedTeams = useMemo(() => visibleTeams(memberships, teams), [memberships, teams])
  const teamIds = useMemo(() => scopedTeams.map((team) => team.id), [scopedTeams])
  const teamsById = useMemo(() => new Map(scopedTeams.map((team) => [team.id, team])), [scopedTeams])

  const isDesktop = useMediaQuery(DESKTOP_QUERY)

  const [query, setQuery] = useState('')
  const [teamFilter, setTeamFilter] = useState(readStoredFilter)
  const [selectedPlayerId, setSelectedPlayerId] = useState(null)
  // null when the add/edit sheet is closed; { player } when open (player is
  // null for "add"). An object rather than a boolean so opening the form for
  // an existing player and opening it empty are the same state transition.
  const [formState, setFormState] = useState(null)
  const [importing, setImporting] = useState(false)

  const [players, setPlayers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    let mounted = true
    setLoading(true)
    setError(null)

    listPlayers({ teamIds })
      .then((rows) => {
        if (mounted) setPlayers(rows)
      })
      .catch((err) => {
        if (!mounted) return
        setError(err)
        setPlayers([])
      })
      .finally(() => {
        if (mounted) setLoading(false)
      })

    return () => {
      mounted = false
    }
  }, [teamIds, reloadToken])

  // Only a load with nothing on screen replaces the content with a spinner.
  // There is no realtime subscription on players today, so this and `loading`
  // currently coincide — but keeping the distinction means adding one later
  // can't silently reintroduce the "spinner flashes over already-rendered
  // content on every refresh" bug that Task 11 was sent back for.
  const isFirstLoad = loading && players.length === 0

  const admin = isAdmin(memberships)
  const canEditAnything = admin || memberships.some((membership) => membership.role === 'coach')
  const teamNames = scopedTeams.map((team) => team.name).join(', ')

  const normalisedQuery = query.trim().toLowerCase()

  // A stored team filter can outlive the team it names: memberships reload,
  // the user's scope shrinks, and `teamFilter` still points at a squad that
  // is no longer in it. Reconciling against the live scope on every render —
  // rather than trusting the stored value — is what stops that becoming a
  // dead end. It matters most in the worst sub-case: if the scope shrinks to
  // a single team the pill row is hidden entirely, so there would be no
  // "All" pill left to click and the list would stay empty until the user
  // navigated away and back. Schedule.jsx does the same, for the same reason.
  const activeFilter = teamIds.includes(teamFilter) ? teamFilter : ALL_TEAMS_ID

  // The search-only set. The pill counts have to answer "how many matches are
  // in each squad", which is a question about the search — not about whichever
  // pill happens to be selected. Deriving them from `visible` (team filter
  // already applied) made every unselected pill read "· 0" the moment any pill
  // was clicked, so the row asserted the rest of the club was empty, and "All"
  // misstated what clicking it would show.
  const matchingSearch = players.filter((player) =>
    matchesQuery(player, teamsById.get(player.team_id)?.name ?? '', normalisedQuery),
  )

  const visible =
    activeFilter === ALL_TEAMS_ID
      ? matchingSearch
      : matchingSearch.filter((player) => player.team_id === activeFilter)

  const pillCounts = new Map(scopedTeams.map((team) => [team.id, 0]))
  pillCounts.set(ALL_TEAMS_ID, matchingSearch.length)
  matchingSearch.forEach((player) => {
    if (pillCounts.has(player.team_id)) {
      pillCounts.set(player.team_id, pillCounts.get(player.team_id) + 1)
    }
  })

  // The grouping rule (design-system.md §5.3): one team in view — because a
  // pill is selected, or because the user only sees one — groups by position;
  // several teams group by age group. Zero visible teams falls to the
  // age-group branch, which then produces no groups at all and renders the
  // empty state; that is the right answer, since with no squad there are no
  // positions to organise and nothing to organise them from.
  const groupByPosition = activeFilter !== ALL_TEAMS_ID || scopedTeams.length === 1

  // Not memoised: `visible` is rebuilt on every render anyway (it depends on
  // the search box), so a useMemo here would never hit its cache and would
  // only advertise a saving it doesn't make. The whole scope is at most a few
  // hundred players.
  const bucket = new Map()
  visible.forEach((player) => {
    const key = groupByPosition ? positionGroup(player.position) : player.team_id
    if (!bucket.has(key)) bucket.set(key, [])
    bucket.get(key).push(player)
  })

  const groups = (groupByPosition ? POSITION_GROUP_ORDER : scopedTeams.map((team) => team.id))
    .filter((key) => bucket.has(key))
    .map((key) => ({
      key,
      label: groupByPosition ? key : (teamsById.get(key)?.name ?? 'No age group'),
      players: [...bucket.get(key)].sort(byName),
    }))

  // Derive the open player from the live list rather than storing the row
  // itself, so the sheet's contents stay in step with a reload and a removed
  // player closes it instead of stranding a stale copy on screen.
  const selectedPlayer = players.find((player) => player.id === selectedPlayerId) ?? null

  // Applies an inline edit to the loaded list without refetching. Used for
  // both halves of an optimistic write: the table calls it with the new value
  // before the request, and with the old one again if the write is refused.
  // Refetching instead would be a round trip for a field we already know, and
  // would reorder the table under the user's cursor mid-edit.
  const patchPlayer = (id, patch) => {
    setPlayers((rows) => rows.map((row) => (row.id === id ? { ...row, ...patch } : row)))
  }

  const persistFilter = (next) => {
    setTeamFilter(next)
    try {
      window.localStorage.setItem(TEAM_FILTER_KEY, next)
    } catch {
      // Same reasoning as readStoredFilter: a filter that can't be persisted
      // still has to work for this session.
    }
  }

  // Whether the signed-in user may write to the OPEN player's squad. Asked
  // per team through canEditTeam rather than inferred from the role, so its
  // deliberate refusal of a null/unresolvable team_id applies here too. RLS
  // is what actually enforces this; getting it wrong here can only hide a
  // control, never authorise a write.
  const canEditSelected = selectedPlayer ? canEditTeam(memberships, selectedPlayer.team_id) : false
  const refresh = () => setReloadToken((token) => token + 1)

  // One squad is more useful named than counted; several are more useful
  // counted than listed (an admin sees all 15).
  const scopeSummary = scopedTeams.length === 1 ? teamNames : `${scopedTeams.length} age groups`

  return (
    <section>
      {!admin && (
        <ScopeNote tone={canEditAnything ? 'coach' : 'parent'}>
          <b>
            {roleLabel(memberships)} view{canEditAnything ? '' : ' · read-only'}.
          </b>{' '}
          You&apos;re seeing {teamNames || 'no squads'} — every other age group is hidden.
        </ScopeNote>
      )}

      {/* design-system.md §5.3: the section head carries an "Add" button on
          the right for admin/coach. It is absent, not disabled, for everyone
          else — and it only exists at all now that Task 15's form does. */}
      <div className="mb-3.5 mt-1 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[21px] font-extrabold tracking-[-0.2px] text-ink">Roster &amp; members</h2>
          {/* Describes the scope, not the current filter — the per-group counts
              below already report what the search and pills leave. */}
          <p className={`text-[13px] font-medium ${MUTED_ON_PAPER}`}>
            {players.length} {players.length === 1 ? 'player' : 'players'} · {scopeSummary}
          </p>
        </div>
        {canEditAnything && (
          <div className="flex shrink-0 items-center gap-2">
            {/* Import is desktop-only and unapologetically so: it is a paste
                target, and pasting a spreadsheet into a phone is not a thing
                anyone does. Hidden rather than disabled on mobile — an
                always-greyed button just asks a question it can't answer. */}
            {isDesktop && (
              <button
                type="button"
                onClick={() => setImporting(true)}
                className="rounded-[11px] border-[1.5px] border-line bg-surface-card px-3.5 py-2 text-sm font-bold text-ink transition hover:border-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
              >
                Import
              </button>
            )}
            <button
              type="button"
              onClick={() => setFormState({ player: null })}
              className="rounded-[11px] bg-brand px-3.5 py-2 text-sm font-bold text-white transition hover:bg-brand-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
            >
              Add player
            </button>
          </div>
        )}
      </div>

      <div className="mb-3 flex items-center gap-2.5 rounded-[20px] bg-surface-card px-3.5 py-2.5 shadow-[inset_0_0_0_1.5px_theme(colors.line.DEFAULT),0_2px_8px_rgba(20,20,20,0.08)]">
        <SearchIcon className="h-[18px] w-[18px] shrink-0 text-ink-faint" aria-hidden="true" />
        {/* type="search" is what gives this the `searchbox` role. Its
            trade-off is Chromium's UA clear glyph, which paints itself
            #365A99 (measured in the browser check) — a blue with no business
            on a red/green brand page, and one that -webkit- pseudo-elements
            won't let us recolour. The design system's .search (§4.9) has no
            clear control at all, so the glyph is suppressed rather than
            restyled. */}
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label="Search players"
          placeholder="Search name, position, age group"
          className="w-full border-0 bg-transparent text-[15px] text-ink outline-none placeholder:text-ink-faint [&::-webkit-search-cancel-button]:appearance-none"
        />
      </div>

      {scopedTeams.length > 1 && (
        <div className="mb-4">
          {/* Live counts per pill (design-system.md §4.8, e.g. "U10 · 9"),
              computed from the search alone so the row reads as "where did my
              matches land" whichever pill is selected. */}
          <TeamPills
            teams={scopedTeams}
            counts={pillCounts}
            selected={activeFilter}
            onChange={persistFilter}
          />
        </div>
      )}

      {isFirstLoad && (
        <Card className="flex justify-center py-10">
          <Spinner />
        </Card>
      )}

      {!isFirstLoad && error && (
        <Card role="alert" className="p-6 text-center">
          <h3 className="text-base font-extrabold text-brand-deep">We couldn&apos;t load the roster</h3>
          <p className="mt-2 text-sm leading-relaxed text-brand-deep">
            {error.message || 'Something went wrong. Try again.'}
          </p>
          <button
            type="button"
            onClick={() => setReloadToken((token) => token + 1)}
            className="mt-4 rounded-[11px] bg-brand px-4 py-2.5 text-sm font-bold text-white transition hover:bg-brand-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
          >
            Try again
          </button>
        </Card>
      )}

      {!isFirstLoad && !error && groups.length === 0 && (
        <Card>
          <Empty
            message={
              players.length === 0
                ? 'No players yet. They show here once someone adds them.'
                : 'No players match. Try a different name, position or age group.'
            }
          />
        </Card>
      )}

      {/* Desktop gets the table, mobile keeps the grouped card list. One or
          the other renders, never both — the two would emit the same player
          names and make every by-text query ambiguous (see
          src/lib/useMediaQuery.js). The position/age-group grouping is
          deliberately dropped on desktop: sortable columns answer the same
          question better, and a table broken into group headings can't be
          sorted across. */}
      {!isFirstLoad && !error && groups.length > 0 && isDesktop && (
        <RosterTable
          players={visible}
          teams={scopedTeams}
          teamsById={teamsById}
          canEditTeam={(teamId) => canEditTeam(memberships, teamId)}
          onSelect={setSelectedPlayerId}
          onPatch={patchPlayer}
        />
      )}

      {!isFirstLoad &&
        !error &&
        !isDesktop &&
        groups.map((group) => (
          <RosterGroup
            key={group.key}
            label={group.label}
            players={group.players}
            teamsById={teamsById}
            onSelect={setSelectedPlayerId}
          />
        ))}

      {selectedPlayer && !formState && (
        <PlayerDetail
          player={selectedPlayer}
          team={teamsById.get(selectedPlayer.team_id)}
          onClose={() => setSelectedPlayerId(null)}
          canEdit={canEditSelected}
          onEdit={(player) => setFormState({ player })}
          onDeleted={() => {
            setSelectedPlayerId(null)
            refresh()
          }}
        />
      )}

      {/* One sheet at a time: opening the form closes the detail sheet above
          rather than stacking two dialogs. Closing the form drops back to the
          roster, not to the detail sheet, which is where a coach who just
          saved wants to be. */}
      {importing && (
        <PlayerImport
          onClose={() => setImporting(false)}
          onImported={refresh}
        />
      )}

      {formState && (
        <PlayerForm
          player={formState.player}
          onClose={() => {
            setFormState(null)
            setSelectedPlayerId(null)
          }}
          onSaved={refresh}
        />
      )}
    </section>
  )
}
