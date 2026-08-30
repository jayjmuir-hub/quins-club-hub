import { AccentTitle, Kicker } from '../components/Editorial.jsx'
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import Badge from '../components/Badge.jsx'
import Button from '../components/Button.jsx'
import Card from '../components/Card.jsx'
import Empty from '../components/Empty.jsx'
import Spinner from '../components/Spinner.jsx'
import RosterTable from '../components/RosterTable.jsx'
import TeamFilter, { ALL_TEAMS_ID } from '../components/TeamFilter.jsx'
import { positionGroup, POSITION_GROUP_ORDER } from '../lib/rosterUnit.js'
import { buildRosterGroups, constantColumns, GROUP_BY } from '../lib/rosterGrouping.js'
import { isMinisTeam } from '../lib/minis.js'
import { listPlayerGrades, listPlayerPositions, listPlayerUnits, savePlayerPositions } from '../data/playerTiers.js'
import PlayerDetail from './PlayerDetail.jsx'
import PlayerForm from './PlayerForm.jsx'
import MyPlayerForm from './MyPlayerForm.jsx'
import PlayerImport from './PlayerImport.jsx'
import { listPlayers, listPlayerPrivate } from '../data/players.js'
// The club's own age function, so a number on the roster cannot drift from the
// one that decides which squad a child belongs in.
import { ageAt } from '../lib/ageGrade.js'
import { useMemberships } from '../lib/memberships.jsx'
import { canEditTeam, isActiveMembership, isAdmin, isOwnPlayer, isSquadStaffRole, visibleTeams } from '../lib/scope.js'
import { GENDERS, genderLabel } from '../lib/gender.js'
import PlayerAvatar from '../components/PlayerAvatar.jsx'
import { signPhotoUrls } from '../data/photos.js'
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

function PlayerRow({ player, teamName, photoUrl, age = null, showPosition = false, onSelect }) {
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
      {/* The player's head shot, falling back to the initials tile
          (design-system.md §4.15 .pnum, which the prototype filled with a
          jersey number) when there is no photo. Both variants are aria-hidden
          because they restate the name rendered right beside them — without
          that, every row would announce itself as "T F Tom Fletcher".
          The signed URL is passed IN, already batched by the screen: signing
          per row would fire one request per player on every roster load. */}
      <PlayerAvatar
        player={player}
        url={photoUrl}
        size="sm"
        className="bg-[image:linear-gradient(135deg,theme(colors.brand.deep),theme(colors.brand.DEFAULT))] text-[13px] text-white"
      />

      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-1.5">
          <span data-testid="player-name" className="text-[15px] font-bold text-ink">
            {player.full_name}
          </span>
          {player.is_captain && <Badge tone="captain">Capt</Badge>}
        </span>
        {/* Gender is appended, not given its own line, and is omitted
            entirely when not recorded — which is most players. A third line
            reading "Not recorded" on two thirds of a 53-player squad is
            noise, and a blank one is worse. */}
        {/* ⚠️ THE AGE IS APPENDED AND OMITTED WHEN UNKNOWN, exactly like gender
            beside it — for the same reason its comment gives. Most children had
            no birthday on file when this shipped, and "Age not set" on two
            thirds of a squad is noise while a blank is worse. It also appears
            only for staff: the screen does not read a birthday at all for a
            parent, so this is never half-filled. */}
        {/* ⚠️ THE POSITION APPEARS ONLY FOR STAFF (Jay, 25 Aug 2026) — it is
            decorated onto the row from a staff-only table, so for a parent it
            is always absent, and printing "Position not set" for them would
            state a gap they are not allowed to see filled. Staff still get
            "Position not set", which for them is an honest to-do. */}
        <span className="mt-0.5 block text-[12.5px] text-ink-faint">
          {showPosition ? `${player.position || 'Position not set'} · ` : ''}{teamName}
          {genderLabel(player.gender) ? ` · ${genderLabel(player.gender)}` : ''}
          {Number.isFinite(age) ? ` · ${age}` : ''}
        </span>
      </span>

      <ChevronRightIcon className="h-5 w-5 shrink-0 text-ink-faint" aria-hidden="true" />
    </button>
  )
}

function RosterGroup({ label, players, teamsById, photoUrls, ageByPlayer, showPosition = false, onSelect }) {
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
            photoUrl={player.photo_path ? photoUrls?.[player.photo_path] : undefined}
            age={ageByPlayer?.get(player.id) ?? null}
            showPosition={showPosition}
            onSelect={onSelect}
          />
        ))}
      </Card>
    </div>
  )
}

export default function Roster() {
  const { memberships, teams, loading: membershipsLoading } = useMemberships()

  const scopedTeams = useMemo(() => visibleTeams(memberships, teams), [memberships, teams])
  const teamIds = useMemo(() => scopedTeams.map((team) => team.id), [scopedTeams])
  const teamsById = useMemo(() => new Map(scopedTeams.map((team) => [team.id, team])), [scopedTeams])

  const isDesktop = useMediaQuery(DESKTOP_QUERY)

  const [query, setQuery] = useState('')
  const [teamFilter, setTeamFilter] = useState(readStoredFilter)
  // 'all' | 'male' | 'female'. Deliberately NOT persisted to localStorage the
  // way the team filter is. The team filter is persisted because a coach's
  // squad is a standing preference; a gender filter is a one-off question
  // ("who are the girls in this group") and a sticky one would leave someone
  // convinced players had gone missing on their next visit.
  const [genderFilter, setGenderFilter] = useState('all')
  // ⚠️ TIER BY DEFAULT — Jay, 15 Aug 2026: "i want it to land default on Tier,
  // then forwards and backs view instead of nothing view". This overrides the
  // original choice of 'none', which was mine and was argued from the risk that
  // a club-wide view of players nobody has graded yet shows one heading reading
  // "Not graded" over everything. That is still true and he has seen it stated;
  // a coach opening their own squad is the case this screen is for.
  const [groupBy, setGroupBy] = useState(GROUP_BY.TIER)
  // Coach-only data, loaded alongside the players. Empty maps for a parent:
  // player_grades is refused by RLS for them, so this is belt and braces over
  // a policy that already says no.
  const [tierByPlayer, setTierByPlayer] = useState(new Map())
  const [positionsByPlayer, setPositionsByPlayer] = useState(new Map())
  const [unitsByPlayer, setUnitsByPlayer] = useState(new Map())
  const [selectedPlayerId, setSelectedPlayerId] = useState(null)
  // null when the add/edit sheet is closed; { player } when open (player is
  // null for "add"). An object rather than a boolean so opening the form for
  // an existing player and opening it empty are the same state transition.
  const [formState, setFormState] = useState(null)
  const [importing, setImporting] = useState(false)

  const [players, setPlayers] = useState([])
  // path -> signed URL for every photo in the loaded squad(s). Signed in ONE
  // call rather than per row: a 30-player squad would otherwise issue 30
  // sequential signing requests before the first face appeared.
  const [photoUrls, setPhotoUrls] = useState({})
  // player id -> whole years old today, for the squads in view. Empty for
  // anybody who is not staff — see the effect below.
  const [ageByPlayer, setAgeByPlayer] = useState(() => new Map())

  // Sign every head shot in the loaded set in one call. Keyed on the joined
  // path list rather than on `players` so a re-render that produces an
  // equivalent array does not re-sign; signPhotoUrls caches anyway, so a
  // revisit is usually a no-op.
  const photoPaths = players.map((row) => row.photo_path).filter(Boolean)
  const photoPathKey = photoPaths.join(',')

  useEffect(() => {
    if (photoPaths.length === 0) {
      setPhotoUrls({})
      return undefined
    }
    let mounted = true
    signPhotoUrls(photoPaths).then((urls) => {
      if (mounted) setPhotoUrls(urls)
    })
    return () => {
      mounted = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photoPathKey])

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
  // Squad staff, not just coaches: team managers and medics hold the same
  // rights (SQUAD_STAFF_ROLES in src/lib/scope.js, mirrored by
  // private.can_edit_team). Asking the helper rather than testing the string
  // is what stops the next role needing an edit here.
  // ⚠️ ACTIVE staff only (Grok item 4) — a pending coach request must not
  // surface Add player / Import controls whose writes all fail at RLS. Note
  // this gate is deliberately not team-scoped: any active squad staff may
  // open the add sheet; which squads they may write to is canEditTeam's call.
  const canEditAnything =
    admin || memberships.some((membership) => isActiveMembership(membership) && isSquadStaffRole(membership.role))

  // The sidebar's Roster sub-menu deep-links: /roster?open=add-player and
  // /roster?open=import (22 Aug 2026). Same consume-and-clear contract as
  // Schedule's ?open= — an effect because clicking a sub-item while already
  // on /roster changes only the search string, cleared so refresh/share
  // cannot reopen a closed sheet, and not judged until memberships load.
  // Import additionally waits for isDesktop: the importer is a paste target
  // and Roster hides its button on mobile for the same reason.
  const [searchParams, setSearchParams] = useSearchParams()
  const openParam = searchParams.get('open')
  useEffect(() => {
    if (!openParam) return
    if (membershipsLoading) return
    if (openParam === 'add-player' && canEditAnything) {
      setFormState({ player: null })
    } else if (openParam === 'import' && canEditAnything && isDesktop) {
      setImporting(true)
    } else if (openParam !== 'add-player' && openParam !== 'import') {
      // A player id: the Needs Attention names deep-link here (26 Aug 2026).
      // ⚠️ WAIT FOR THE ROSTER — `players` starts [] (not null), so `loading`
      // is the only honest signal; clearing the param before the list arrives
      // would eat the link on a slow load. An id the loaded list does not
      // hold (deleted player, mistyped URL) just falls through to the roster.
      if (loading) return
      if (players.some((p) => p.id === openParam)) setSelectedPlayerId(openParam)
    }
    setSearchParams({}, { replace: true })
  }, [openParam, canEditAnything, membershipsLoading, isDesktop, setSearchParams, players, loading])

  // ⚠️ STAFF ONLY, AND THE READ IS NOT ISSUED AT ALL OTHERWISE — the same rule
  // the Tier column follows below, for the same reason. RLS on `player_private`
  // is squad staff OR the child's own family, so a parent would get null for
  // every team-mate and a roster of blanks. Not issuing the query is better
  // than issuing one that is refused: one fewer request, and "who may see a
  // birthday" stays a single decision rather than two that could disagree.
  //
  // ⚠️ SCOPED TO THE PLAYERS IN VIEW, never club-wide. This is the VALUE read,
  // not the presence read — listPlayerPrivatePresence's header warns against
  // hoovering up birthdays to answer a question that only needed a count. Here
  // the values are the answer, so the narrowing comes from the id list instead.
  //
  // ⚠️ DECLARED AFTER canEditAnything ON PURPOSE. It read it from above at
  // first, which is a temporal dead zone error — the screen would have thrown
  // on mount for everybody.
  const agePlayerIds = canEditAnything ? players.map((row) => row.id) : []
  const agePlayerKey = agePlayerIds.join(',')

  useEffect(() => {
    if (agePlayerIds.length === 0) {
      setAgeByPlayer(new Map())
      return undefined
    }
    let mounted = true
    const today = new Date()
    listPlayerPrivate(agePlayerIds)
      .then((rows) => {
        if (!mounted) return
        setAgeByPlayer(
          new Map(
            (rows ?? [])
              .map((row) => [row.player_id, ageAt(row.date_of_birth, today)])
              // A row with no birthday, or an unparseable one, contributes
              // nothing rather than an entry every row would have to test.
              .filter(([, age]) => Number.isFinite(age)),
          ),
        )
      })
      // Swallowed: an age is decoration on a screen whose job is the roster. A
      // failed read shows no ages, exactly like a squad with none recorded.
      .catch(() => {
        if (mounted) setAgeByPlayer(new Map())
      })
    return () => {
      mounted = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the ids, not the
    // rows: `players` is rebuilt on every render and would restart this forever.
  }, [agePlayerKey])

  // ⚠️ COACH-ONLY, AND GATED HERE AS WELL AS BY RLS. The roster is a screen a
  // PARENT sees; RLS refuses player_grades to them, but a refusal that arrives
  // as an error in the console is not a design — not asking is. The same reason
  // the Tier column is passed only when canEditAnything.
  //
  // Keyed on the id list rather than on `players`, which is a new array on every
  // reload and would re-fetch grades each time the photos resolved.
  const playerIdKey = players.map((player) => player.id).sort().join(',')
  useEffect(() => {
    if (!canEditAnything || playerIdKey === '') {
      setTierByPlayer(new Map())
      setPositionsByPlayer(new Map())
      setUnitsByPlayer(new Map())
      return undefined
    }
    let mounted = true
    const ids = playerIdKey.split(',')
    Promise.all([listPlayerGrades(ids), listPlayerPositions(ids), listPlayerUnits(ids)])
      .then(([grades, positions, units]) => {
        if (!mounted) return
        // listPlayerGrades hands back the whole row; the table only wants the
        // letter.
        setTierByPlayer(new Map([...grades].map(([id, row]) => [id, row.tier])))
        setPositionsByPlayer(positions)
        setUnitsByPlayer(units)
      })
      .catch(() => {
        // A failure here must not take the roster down with it: the names, the
        // photos and the age groups are the screen's job, and tier is a
        // decoration on top of them.
        if (mounted) {
          setTierByPlayer(new Map())
          setPositionsByPlayer(new Map())
          setUnitsByPlayer(new Map())
        }
      })
    return () => {
      mounted = false
    }
    // ⚠️ reloadToken IS IN THE KEY since 25 Aug 2026: a PlayerForm save calls
    // refresh(), and with players.position gone these maps are the ONLY source
    // of what the form just changed — same ids, so playerIdKey alone would
    // leave the table showing the old positions until a remount.
  }, [canEditAnything, playerIdKey, reloadToken])
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
  //
  // The gender filter is folded in HERE, alongside the search, rather than
  // applied later with the team pill. Both narrow the set the user is asking
  // about; the pill selects within it. Applying gender after the pill counts
  // were computed would make the counts describe a set the list no longer
  // shows.
  // ⚠️ THE DECORATION, and it is what keeps this change small. position and
  // unit moved off the players row into staff-only tables (25 Aug 2026 —
  // parents must not see them, and RLS grants rows, not columns). Stamping
  // them back onto the row HERE, for staff only, means every downstream
  // reader — search, grouping, sorting, the table cell, the detail sheet —
  // keeps reading player.position/player.unit exactly as before. For a
  // parent both stay absent, which is the point.
  const scopedPlayers = canEditAnything
    ? players.map((player) => ({
        ...player,
        position: positionsByPlayer.get(player.id)?.[0] ?? null,
        unit: unitsByPlayer.get(player.id) ?? null,
      }))
    : players

  const matchingSearch = scopedPlayers.filter(
    (player) =>
      matchesQuery(player, teamsById.get(player.team_id)?.name ?? '', normalisedQuery) &&
      // ⚠️ 'unrecorded' IS NOT ON THE RADIO ROW. It is reachable only by
      // clicking the nudge below, which is the point of the nudge: a coach who
      // is told "9 players have no gender recorded" can then see WHICH nine
      // without hunting for them.
      (genderFilter === 'all'
        || (genderFilter === 'unrecorded' ? !player.gender : player.gender === genderFilter)),
  )

  // How many players the gender filter is currently hiding BECAUSE THEY HAVE
  // NO VALUE, as opposed to because they are the other gender. Reported below
  // the pills whenever it is non-zero.
  //
  // ⚠️ This is the honest half of the feature and is not optional. Almost
  // every player has gender null today, so "Female" on a 53-player squad may
  // legitimately show 2 rows — and without this line that reads as "this
  // squad has 2 girls", not "this squad has 2 recorded girls and 49 players
  // nobody has answered for". Those are very different statements to put in
  // front of a coach picking a team.
  const hiddenUnrecorded =
    genderFilter === 'all' || genderFilter === 'unrecorded'
      ? 0
      : players.filter(
          (player) =>
            !player.gender &&
            matchesQuery(player, teamsById.get(player.team_id)?.name ?? '', normalisedQuery),
        ).length

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

  // ══ U10 AND BELOW ═══════════════════════════════════════════════════════
  //
  // Grades and forwards/backs are the machinery of picking a competitive team,
  // and U10 and below do not have one to pick — no league, no tiers, and tag
  // rugby has no positions to sort anybody into. Confirmed by the club's youth
  // section, 15 Aug 2026; the rule lives in src/lib/minis.js.
  //
  // ⚠️ DERIVED FROM THE SQUADS ON SCREEN, NOT FROM THE PLAYERS. A search box
  // that happened to match only U8 children must not silently change what the
  // roster's controls are — that is a filter, not a change of squad. Reading the
  // pill answers "which roster am I looking at", which is the actual question.
  //
  // ⚠️ AND NOT FROM `scopedTeams` ALONE EITHER. A coach who runs both U8 and
  // U14 gets the full set on "All", and gets the simplified one the moment they
  // pick the U8 pill — which is the whole reason the pill exists.
  //
  // ⚠️ FAILS OPEN, like everything else keyed on a squad name: with no squads in
  // view at all this is false and nothing is hidden. `every` on an empty array
  // is true, which would quietly strip the roster's controls at the exact moment
  // somebody is wondering why the list is empty.
  const shownTeams =
    activeFilter === ALL_TEAMS_ID
      ? scopedTeams
      : scopedTeams.filter((team) => team.id === activeFilter)
  const minisOnly = shownTeams.length > 0 && shownTeams.every((team) => isMinisTeam(team.name))

  // The grouping rule (design-system.md §5.3): one team in view — because a
  // pill is selected, or because the user only sees one — groups by position;
  // several teams group by age group. Zero visible teams falls to the
  // age-group branch, which then produces no groups at all and renders the
  // empty state; that is the right answer, since with no squad there are no
  // positions to organise and nothing to organise them from.
  //
  // ⚠️ EXCEPT FOR THE MINIS, where the position branch produced a single
  // heading reading "Other" over the whole squad — every child unbucketed,
  // because nobody has told the app whether a seven-year-old is a prop. The
  // age-group branch gives one heading carrying the squad's name instead, which
  // says something true.
  // ⚠️ AND NEVER FOR A PARENT, since positions went staff-only (25 Aug 2026):
  // their rows carry no unit and no position, so this branch would file every
  // child under one heading reading "Other" — the same degenerate heading the
  // minis exception below already guards against, for the same reason.
  const groupByPosition =
    canEditAnything && !minisOnly && (activeFilter !== ALL_TEAMS_ID || scopedTeams.length === 1)

  // Not memoised: `visible` is rebuilt on every render anyway (it depends on
  // the search box), so a useMemo here would never hit its cache and would
  // only advertise a saving it doesn't make. The whole scope is at most a few
  // hundred players.
  const bucket = new Map()
  visible.forEach((player) => {
    const key = groupByPosition ? positionGroup(player) : player.team_id
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

  // ⚠️ THE DESKTOP TABLE'S COLUMNS AND GROUPING, which are NOT the mobile
  // `groups` above. The mobile list has always grouped; the table has not, and
  // Jay asked for both a tidier column set and a grouping he can choose.
  //
  // ⚠️ HIDING THE AGE GROUP COLUMN TAKES ITS INLINE EDITOR WITH IT. That is the
  // real cost of this and it is accepted deliberately: when the roster is
  // filtered to one squad the column reads "U16B Contact" on every row, and
  // moving a player to another age group still works from the player sheet.
  // Widen the filter and the column — and the editor — come back.
  const hiddenColumns = constantColumns(visible, {
    gender: (player) => player.gender ?? null,
    team: (player) => player.team_id ?? null,
  })

  // ⚠️ NEVER GROUPED FOR A PARENT, and this became load-bearing the moment
  // grouping went on by default. A parent cannot see grades — RLS refuses
  // player_grades and the screen does not ask — so `tierByPlayer` is empty for
  // them, and grouping by tier would put a single heading reading "Not graded"
  // across every child on the roster. That is a statement about the club's
  // record-keeping made to exactly the audience with no way to act on it.
  //
  // ⚠️ AND NEVER GROUPED FOR A MINIS ROSTER, whatever the dropdown last held.
  // `groupBy` defaults to TIER and is remembered across pill changes, so without
  // this a coach who looked at U14 and then clicked U8 would get their minis
  // squad filed under one heading reading "Not graded". The dropdown drops those
  // two options below; this is what makes the state they may already be in
  // harmless. Same reconciliation-against-live-scope rule the team pill itself
  // follows — a stored choice can outlive what produced it.
  const tableGroupBy = minisOnly && groupBy !== GROUP_BY.TEAM ? 'none' : groupBy
  const tableGroups =
    !canEditAnything || tableGroupBy === 'none'
      ? null
      : buildRosterGroups(visible, { groupBy: tableGroupBy, tierByPlayer, teamsById })

  // How many of the players on screen have no gender recorded. Distinct from
  // hiddenUnrecorded above, which counts the ones a gender FILTER is hiding;
  // this one is about the gap itself and shows while the filter is off.
  const missingGender = visible.filter((player) => !player.gender).length

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

  // The table's position write (25 Aug 2026: player_positions replaced
  // players.position). The map is what decorates player.position, so THIS is
  // where the optimism lives — updated before the request, put back if the
  // write is refused, and the throw lets the table put its refusal message in
  // the row that caused it.
  const savePositionsFor = async (playerId, positions) => {
    const previous = positionsByPlayer.get(playerId)
    const stamp = (list) =>
      setPositionsByPlayer((current) => {
        const next = new Map(current)
        if (list?.length) next.set(playerId, list)
        else next.delete(playerId)
        return next
      })
    stamp(positions)
    try {
      await savePlayerPositions(playerId, positions)
    } catch (err) {
      stamp(previous)
      throw err
    }
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
  // A parent/player of THIS player, who is not already a coach of the squad.
  // Gates only whether the self-service form is offered; RLS and
  // set_own_player_photo() are what permit the writes.
  const canEditOwnSelected = selectedPlayer
    ? isOwnPlayer(memberships, selectedPlayer.id)
    : false
  const refresh = () => setReloadToken((token) => token + 1)

  // One squad is more useful named than counted; several are more useful
  // counted than listed (an admin sees all 15).
  const scopeSummary = scopedTeams.length === 1 ? teamNames : `${scopedTeams.length} age groups`

  return (
    <section>
      {/* design-system.md §5.3: the section head carries an "Add" button on
          the right for admin/coach. It is absent, not disabled, for everyone
          else — and it only exists at all now that Task 15's form does. */}
      {/* `flex-wrap` and `min-w-0` for the reason spelled out in Schedule.jsx:
          the action group is `shrink-0`, so without them a title too long for
          the remaining space pushes the row past the viewport and every
          viewport-sized element on the page is clipped with it. This title is
          the longest of any screen. */}
      <div className="mb-3.5 mt-1 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div>
            <Kicker>The club</Kicker>
            <AccentTitle lead="Roster &" accent="members." />
          </div>
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
              <Button variant="secondary" onClick={() => setImporting(true)}>
                Import
              </Button>
            )}
            <Button onClick={() => setFormState({ player: null })}>Add player</Button>
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
          {/* Live counts on each option (design-system.md §4.8 specifies them
              on pills, e.g. "U10 · 9"; the row became a select on 10 Aug and
              they moved into the option labels rather than being dropped),
              computed from the search alone so the row reads as "where did my
              matches land" whichever pill is selected. */}
          <TeamFilter
            teams={scopedTeams}
            counts={pillCounts}
            selected={activeFilter}
            onChange={persistFilter}
          />
        </div>
      )}

      {/* Gender filter. A radio group, not a row of buttons: the three
          options are mutually exclusive and a screen reader should announce
          it as one control with a current selection, which aria-pressed
          buttons do not. Rendered unconditionally — unlike the team pills,
          which hide when there is only one squad — because a single squad is
          exactly where "show me the girls" is most useful. */}
      <fieldset className="mb-3">
        <legend className="sr-only">Filter by gender</legend>
        <div className="flex gap-2">
          {[{ value: 'all', label: 'All' }, ...GENDERS].map((option) => (
            <label key={option.value}>
              <input
                type="radio"
                name="roster-gender-filter"
                value={option.value}
                checked={genderFilter === option.value}
                onChange={() => setGenderFilter(option.value)}
                className="peer sr-only"
              />
              <span
                className={[
                  // ⚠️ `rounded-tab` (12px), was `rounded-pill` — Jay, 11 Aug
                  // 2026. A horizontal row of filters, white with a hairline
                  // until chosen and filled red when it is, which is how
                  // adhjrt.com draws its age-group buttons.
                  //
                  // ⚠️ THIS IS THE GENDER FILTER (All / Male / Female), NOT
                  // the age-group one. The commit that made this change and
                  // its pull request both call it "the squad filters" and "the
                  // closest analogue to adhjrt.com's age-group buttons" — it
                  // is neither. AGE GROUP on this screen is a pill dropdown
                  // (was a `<select>` until the Schedule filter-bar pass),
                  // still not this row, so no age-group control was touched.
                  // live after deploying: the three `.rounded-tab` elements on
                  // /roster read All, Male and Female. Recorded here because a
                  // merged commit message cannot be edited and the code is the
                  // higher authority.
                  'block cursor-pointer select-none rounded-tab border-[1.5px] px-3.5 py-1.5 text-[13px] transition peer-focus-visible:ring-2 peer-focus-visible:ring-brand peer-focus-visible:ring-offset-2',
                  genderFilter === option.value
                    ? 'border-brand bg-surface-mute font-bold text-danger-ink'
                    : 'border-line bg-surface-card font-semibold text-ink',
                ].join(' ')}
              >
                {option.label}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {/* ⚠️ CLICKABLE — Jay's explicit choice ("nudge should be clickable").
          A count on its own tells a coach there is a gap and then leaves them to
          find it by eye down a list of fifty; this jumps straight to the rows
          that need answering. It is a button rather than a link because it
          changes what this screen is showing, not where you are.

          Only while the filter is off: with Male or Female selected the
          hiddenUnrecorded line below is already saying the more precise thing. */}
      {/* ⚠️ STAFF ONLY — 23 Aug 2026. A parent on the U16B squad saw "2
          players have no gender recorded — Show them" in red on her phone.
          This is a data-quality nudge for the people who can FIX the record;
          a parent cannot, and should not be prompted to go looking at other
          families' gaps. Same gate as the grouping control below: anyone who
          can edit anything on this screen. */}
      {canEditAnything && genderFilter === 'all' && missingGender > 0 && (
        <button
          type="button"
          onClick={() => setGenderFilter('unrecorded')}
          className="mb-3 block w-full rounded-[12px] border border-line bg-surface-sunk px-3 py-2 text-left text-[13px] font-semibold text-ink-muted transition hover:border-brand hover:text-danger-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          {missingGender === 1
            ? '1 player has no gender recorded.'
            : `${missingGender} players have no gender recorded.`}
          <span className="ml-1 underline underline-offset-[3px]">Show them</span>
        </button>
      )}

      {genderFilter === 'unrecorded' && (
        <div className="mb-3 flex items-center justify-between gap-3 rounded-[12px] border border-brand bg-surface-mute px-3 py-2 text-[13px] font-semibold text-danger-ink">
          <span>Showing players with no gender recorded.</span>
          <Button variant="ghost" size="sm" onClick={() => setGenderFilter('all')}>
            Show all
          </Button>
        </div>
      )}

      {/* Grouping is a coach's tool: it exists to answer "who are my tier B
          forwards", which is not a question a parent asks of a roster.
          ⚠️ NOR IS IT A QUESTION A MINIS COACH ASKS. Both tier options go for
          U10 and below (15 Aug 2026) — there are no grades and no units down
          there, so each would have produced a single heading over the whole
          squad reading "Not graded" or "Other". The select is rendered with
          `tableGroupBy` rather than `groupBy` so a remembered TIER choice shows
          as "Nothing" here instead of as a value with no matching option, which
          renders as a blank box. */}
      {canEditAnything && isDesktop && (
        <div className="mb-3 flex items-center gap-2">
          <label htmlFor="roster-group-by" className="text-[13px] font-semibold text-ink-muted">
            Group by
          </label>
          <select
            id="roster-group-by"
            value={tableGroupBy}
            onChange={(event) => setGroupBy(event.target.value)}
            className="rounded-[10px] border-[1.5px] border-line bg-surface-card px-2.5 py-1.5 text-[13px] font-semibold text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            <option value="none">Nothing</option>
            {!minisOnly && (
              <>
                <option value={GROUP_BY.TIER}>Tier, then forwards and backs</option>
                <option value={GROUP_BY.UNIT}>Forwards and backs</option>
              </>
            )}
            <option value={GROUP_BY.TEAM}>Age group</option>
          </select>
        </div>
      )}

      {/* See hiddenUnrecorded above. This line is what stops a filtered count
          being read as a fact about the squad. */}
      {hiddenUnrecorded > 0 && (
        <p data-testid="gender-unrecorded-note" className={`mb-3 text-[12.5px] ${MUTED_ON_PAPER}`}>
          {hiddenUnrecorded} {hiddenUnrecorded === 1 ? 'player has' : 'players have'} no gender
          recorded and {hiddenUnrecorded === 1 ? 'is' : 'are'} not shown.
        </p>
      )}

      {isFirstLoad && (
        <Card className="flex justify-center py-10">
          <Spinner />
        </Card>
      )}

      {!isFirstLoad && error && (
        <Card role="alert" className="p-6 text-center">
          <h3 className="text-base font-extrabold text-danger-ink">We couldn&apos;t load the roster</h3>
          <p className="mt-2 text-sm leading-relaxed text-danger-ink">
            {error.message || 'Something went wrong. Try again.'}
          </p>
          <Button onClick={() => setReloadToken((token) => token + 1)} className="mt-4">
            Try again
          </Button>
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
          photoUrls={photoUrls}
          groups={tableGroups}
          hiddenColumns={hiddenColumns}
          // ⚠️ PASSED ONLY FOR A COACH, so the Tier column does not exist in a
          // parent's DOM at all. RLS already refuses the underlying rows; this
          // is the second lock, on the screen a parent actually opens.
          // ⚠️ AND NOT FOR A MINIS ROSTER (15 Aug 2026) — two columns that would
          // read "—" on every row. Nothing is being HIDDEN from anybody here:
          // these squads have no grades and no positions to show, and a coach
          // who moves a child up to U11 gets both columns back with the pill.
          tierByPlayer={canEditAnything && !minisOnly ? tierByPlayer : null}
          // ⚠️ SINCE 25 Aug 2026 THIS ALSO CONTROLS THE POSITION COLUMN'S
          // EXISTENCE — positions are staff-only, and a parent's table must
          // not carry the column at all.
          positionsByPlayer={canEditAnything && !minisOnly ? positionsByPlayer : null}
          onSavePositions={savePositionsFor}
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
            photoUrls={photoUrls}
            ageByPlayer={ageByPlayer}
            showPosition={canEditAnything && !minisOnly}
            onSelect={setSelectedPlayerId}
          />
        ))}

      {selectedPlayer && !formState && (
        <PlayerDetail
          player={selectedPlayer}
          team={teamsById.get(selectedPlayer.team_id)}
          onClose={() => setSelectedPlayerId(null)}
          canEdit={canEditSelected}
          canEditOwn={canEditOwnSelected}
          onEdit={(player) => setFormState({ player })}
          onEditOwn={(player) => setFormState({ player, own: true })}
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
          // The loaded roster, so a re-pasted sheet skips the players it
          // already holds instead of doubling the squad.
          existingPlayers={players}
        />
      )}

      {formState && !formState.own && (
        <PlayerForm
          player={formState.player}
          onClose={() => {
            setFormState(null)
            setSelectedPlayerId(null)
          }}
          onSaved={refresh}
        />
      )}

      {formState?.own && (
        <MyPlayerForm
          player={formState.player}
          team={teamsById.get(formState.player.team_id)}
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
