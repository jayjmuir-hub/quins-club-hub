import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import Card from '../components/Card.jsx'
import Empty from '../components/Empty.jsx'
import Spinner from '../components/Spinner.jsx'
import { BlockTitle } from '../components/Editorial.jsx'
import SeasonStatsTable from '../components/SeasonStatsTable.jsx'
import { listEvents } from '../data/events.js'
import { listAvailabilityForEvents } from '../data/availability.js'
import { listPlayers } from '../data/players.js'
import { listAllLeagueTeams } from '../data/leagueTeams.js'
import { standings } from '../data/competitions.js'
import { seasonStats } from '../data/seasonStats.js'
import { scoringSquadRecords, windowCoveringSeason } from '../lib/matchRecord.js'
import { useMemberships } from '../lib/memberships.jsx'
import { adminTeamReach, canReadSeniorSections, isAdmin } from '../lib/scope.js'
import { seasonLabelFor } from '../lib/season.js'
import { SECTIONS, sectionLong, sectionsFor, teamsInSection } from '../lib/section.js'
import { clubDateTimeInputs, eventDate, eventTitle } from '../lib/eventFormat.js'
import { fixtureLabel } from '../lib/fixtureLabel.js'
import { divisionShort } from '../lib/division.js'
import { friendlyMessage } from '../lib/friendlyError.js'

// The senior section, in one place — claude/plans/2026-09-03-senior-section.md.
// Jay, 3 Sep 2026: "you can't see everyone and everything, you have to switch
// between them."
//
// ⚠️ THE DATABASE DECIDES WHAT COMES BACK. This screen asks for every squad in
// the section; RLS (db/migrations/20260905_senior_section.sql) returns the
// rosters and availability of the person's OWN section, and the fixtures of
// both. A foreign section therefore renders fixtures and an explanation, not
// an error — `sectionsFor` only decides which pills to draw.
//
// ⚠️ ONE QUERY PER KIND, NOT ONE PER SQUAD. Events, availability, players and
// league teams each come back for the whole section in one call; the season
// record is one standings call per DIVISION, which is at most a handful.

const PILL = 'rounded-full border-[1.5px] px-3 py-1 text-[13px] font-bold transition'
const PILL_ON = 'border-brand bg-brand text-white'
const PILL_OFF = 'border-line text-ink-muted hover:border-brand hover:text-brand-ink'

/** "1st XV" from "Senior Men - 1st XV"; the whole name when there is no dash. */
export function shortSquadName(name) {
  const parts = String(name ?? '').split(/\s[-–—]\s/)
  return parts.length > 1 ? parts[parts.length - 1] : name
}

function dayKey(event) {
  const date = eventDate(event)
  return date ? clubDateTimeInputs(date).date : null
}

function fmtDay(key) {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(undefined, { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' })
}

export default function SeniorSection() {
  const { memberships, teams } = useMemberships()
  const admin = isAdmin(memberships)
  const [params, setParams] = useSearchParams()
  const { mine, all } = useMemo(() => sectionsFor(memberships, teams, { admin }), [memberships, teams, admin])
  const requested = params.get('section')
  const section = all.includes(requested) ? requested : (mine[0] ?? all[0] ?? null)
  // A section is "foreign" when RLS will hand back its fixtures and nothing
  // else: not the person's own section, and no admin hat that reaches it —
  // the seniors right (4 Sep 2026) or a squad-reaching right. Until 4 Sep any
  // admin was treated as home, and a Pitch-only admin saw empty tables with
  // no explanation.
  const reaches = canReadSeniorSections(memberships) || adminTeamReach(memberships, 'see')
  const foreign = !reaches && !mine.includes(section)
  const sectionTeams = useMemo(() => teamsInSection(teams, section), [teams, section])
  const teamIds = useMemo(() => sectionTeams.map((t) => t.id), [sectionTeams])

  const [events, setEvents] = useState([])
  const [availability, setAvailability] = useState([])
  const [players, setPlayers] = useState([])
  const [leagueTeams, setLeagueTeams] = useState([])
  const [records, setRecords] = useState(new Map())
  const [stats, setStats] = useState(new Map())
  const [openStats, setOpenStats] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [openSquads, setOpenSquads] = useState({})
  const season = seasonLabelFor()

  const today = clubDateTimeInputs(new Date()).date

  useEffect(() => {
    if (!section || teamIds.length === 0) {
      setLoading(false)
      return undefined
    }
    let mounted = true
    setLoading(true)
    setError(null)
    // A section switch must not leave the previous section's tables on screen
    // while the new fetch is in flight, or after it fails.
    setStats(new Map())
    // ⚠️ ISO STRINGS, NOT Date OBJECTS. listEvents hands these to PostgREST
    // as-is; a Date stringifies to "… GMT+0400 (Gulf Standard Time)" and
    // Postgres answers 'time zone "gmt+0400" not recognized' — Jay's
    // screenshot, 3 Sep 2026, the first time the page was opened on a phone.
    // ⚠️ THIS SCREEN'S LOOKBACK WAS 7 DAYS, not defaultEventWindow (12 months).
    // Widen only this unique window so all-matches W–D–L cannot silently
    // under-count; Schedule / Home / Hub keep defaultEventWindow unchanged.
    const lookback = {
      from: new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString(),
      to: new Date(Date.now() + 200 * 24 * 3600 * 1000).toISOString(),
    }
    const { from, to } = windowCoveringSeason(lookback, new Date(Date.now()))
    Promise.all([
      listEvents({ teamIds, from, to }),
      foreign ? Promise.resolve([]) : listPlayers({ teamIds }),
      listAllLeagueTeams(),
    ])
      .then(async ([eventRows, playerRows, leagueRows]) => {
        if (!mounted) return
        setEvents(eventRows)
        setPlayers(playerRows)
        const ours = leagueRows.filter((lt) => teamIds.includes(lt.team_id))
        setLeagueTeams(ours)
        const upcoming = eventRows.filter((e) => e.type === 'match' && dayKey(e) && dayKey(e) >= today)
        const avail = foreign || upcoming.length === 0 ? [] : await listAvailabilityForEvents(upcoming.map((e) => e.id))
        const competitionIds = [...new Set(ours.map((lt) => lt.competition_id).filter(Boolean))]
        const tables = await Promise.all(competitionIds.map((id) => standings(id).then((rows) => [id, rows]).catch(() => [id, []])))
        if (!mounted) return
        setAvailability(avail)
        setRecords(new Map(tables))
        // Stats are for the section's OWN members; a foreign section reads none.
        const statRows = foreign
          ? []
          : await Promise.all(teamIds.map((id) => seasonStats(id, season).then((rows) => [id, rows]).catch(() => [id, []])))
        if (!mounted) return
        setStats(new Map(statRows))
      })
      .catch((err) => mounted && setError(err))
      .finally(() => mounted && setLoading(false))
    return () => {
      mounted = false
    }
  }, [section, teamIds, foreign, today, season])

  const teamsById = useMemo(() => new Map(sectionTeams.map((t) => [t.id, t])), [sectionTeams])
  const leagueTeamsById = useMemo(() => new Map(leagueTeams.map((lt) => [lt.id, lt])), [leagueTeams])
  const squadSize = useMemo(() => {
    const counts = new Map()
    for (const p of players) counts.set(p.team_id, (counts.get(p.team_id) ?? 0) + 1)
    return counts
  }, [players])

  const matches = useMemo(
    () => events.filter((e) => e.type === 'match' && dayKey(e) && dayKey(e) >= today).sort((a, b) => eventDate(a) - eventDate(b)),
    [events, today],
  )
  const allMatchRows = useMemo(
    () =>
      scoringSquadRecords(events, sectionTeams, { at: new Date(Date.now()) }).map((row) => ({
        ...row,
        team: { ...row.team, name: shortSquadName(row.team.name) },
      })),
    [events, sectionTeams],
  )
  // "This weekend": the nearest match day, and every match within three days of it.
  const weekend = useMemo(() => {
    if (matches.length === 0) return []
    const first = dayKey(matches[0])
    const limit = new Date(first)
    limit.setUTCDate(limit.getUTCDate() + 3)
    const limitKey = limit.toISOString().slice(0, 10)
    return matches.filter((e) => dayKey(e) <= limitKey)
  }, [matches])
  const availByEvent = useMemo(() => {
    const map = new Map()
    for (const row of availability) {
      if (!map.has(row.event_id)) map.set(row.event_id, { in: 0, out: 0, maybe: 0 })
      const bucket = map.get(row.event_id)
      if (bucket[row.status] != null) bucket[row.status] += 1
    }
    return map
  }, [availability])

  const pool = useMemo(() => {
    const groups = new Map()
    for (const team of sectionTeams) groups.set(team.id, [])
    for (const p of players) {
      if (groups.has(p.team_id)) groups.get(p.team_id).push(p)
    }
    for (const list of groups.values()) {
      list.sort((a, b) => (a.jersey_num ?? 999) - (b.jersey_num ?? 999) || a.full_name.localeCompare(b.full_name))
    }
    return groups
  }, [players, sectionTeams])

  if (!section) {
    return <Empty message="No senior section is set up yet. An admin sets a squad's section on the Club tab." />
  }

  // The weekend's matches leave the fixtures list, so nothing is drawn twice
  // (Jay, 4 Sep 2026: "things don't line up … other issues"). Six is the cap;
  // "Full schedule" carries the section so the Schedule opens on it.
  const weekendIds = new Set(weekend.map((e) => e.id))
  const upcoming = matches.filter((e) => !weekendIds.has(e.id))
  const allTimesTbd = weekend.length > 0 && weekend.every((e) => e.time_tbd)
  // A squad with no scored match yet says so, rather than wearing 0–0–0.
  const allMatchByTeam = new Map(
    allMatchRows
      .filter(({ record }) => record.wins + record.draws + record.losses > 0)
      .map((row) => [row.team.id, row.record]),
  )

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="text-[22px] font-extrabold tracking-tight text-ink">{sectionLong(section)}</h1>
        {all.length > 1 && (
          <div className="flex gap-1.5" role="group" aria-label="Section">
            {SECTIONS.filter((s) => all.includes(s.code)).map((s) => (
              <button
                key={s.code}
                type="button"
                aria-pressed={s.code === section}
                onClick={() => setParams({ section: s.code })}
                className={`${PILL} ${s.code === section ? PILL_ON : PILL_OFF}`}
              >
                {s.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {foreign && (
        <p data-testid="foreign-section-note" className="mb-3 text-xs text-ink-faint">
          Fixtures and results only. The roster and availability stay with the {sectionLong(section).toLowerCase()} section.
        </p>
      )}

      {error && (
        <p role="alert" className="mb-3 rounded-[11px] bg-danger-bg px-3 py-2 text-sm font-semibold text-danger-ink">
          {friendlyMessage(error, "We couldn't load the section.")}
        </p>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <Spinner label="Loading the section…" />
        </div>
      ) : (
        <>
          {/* ⚠️ ONE COLUMN, FOUR ROWS, ONE CARD PER SQUAD IN EACH. The page was
              two columns with different rhythms, so nothing lined up with
              anything (Jay, 4 Sep 2026). Every row below is the same grid, so
              squads line up vertically down the page, and an empty squad
              still gets its card. */}
          <section className="mb-6" data-testid="this-weekend">
            <SectionHead
              title="This weekend"
              meta={weekend.length ? `${fmtDay(dayKey(weekend[0]))}${allTimesTbd ? ' · times TBD' : ''}` : ''}
            />
            {weekend.length === 0 ? (
              <Card><Empty message="No matches coming up." /></Card>
            ) : (
              <div className={GRID}>
                {weekend.map((event) => {
                  const team = teamsById.get(event.team_id)
                  const counts = availByEvent.get(event.id)
                  const size = squadSize.get(event.team_id) ?? 0
                  const answered = counts ? counts.in + counts.out + counts.maybe : 0
                  const short = counts && counts.in < 15
                  return (
                    <Card key={event.id} data-testid="weekend-row" className={`p-3 ${short && !foreign ? 'bg-warn-bg' : ''}`}>
                      <SquadTag name={team?.name} />
                      <p className="mt-1.5 text-sm font-bold text-ink">{eventTitle(event)}</p>
                      <p className="text-xs text-ink-muted">
                        {fixtureLabel(event, leagueTeamsById.get(event.league_team_id), '')}
                        {event.home === true ? ' · Home' : event.home === false ? ' · Away' : ''}
                        {event.time_tbd && !allTimesTbd ? ' · Time TBD' : ''}
                        {dayKey(event) !== dayKey(weekend[0]) ? ` · ${fmtDay(dayKey(event))}` : ''}
                      </p>
                      {!foreign && (
                        <p className="mt-2 text-xs tabular-nums text-ink-muted" data-testid="weekend-availability">
                          {size === 0 ? (
                            <span className="text-ink-faint">No players yet</span>
                          ) : (
                            <>
                              <span className={answered < size ? 'font-bold text-warn-ink' : 'font-bold text-accent-ink'}>
                                {answered} of {size}
                              </span>{' '}
                              answered
                              {answered > 0 && (
                                <>
                                  {' · '}
                                  <span className="text-accent-ink">{counts.in} in</span>
                                  {' · '}
                                  <span className="text-danger-ink">{counts.out} out</span>
                                </>
                              )}
                            </>
                          )}
                        </p>
                      )}
                    </Card>
                  )
                })}
              </div>
            )}
          </section>

          {!foreign && (
            <section className="mb-6" data-testid="pool">
              <SectionHead title="The pool" meta={`${players.length} player${players.length === 1 ? '' : 's'}`} />
              <div className={GRID}>
                {sectionTeams.map((team) => {
                  const list = pool.get(team.id) ?? []
                  const open = openSquads[team.id] === true
                  const shown = open ? list : list.slice(0, 8)
                  return (
                    <Card key={team.id} data-testid="pool-squad" className="p-3">
                      <p className="text-xs font-bold uppercase tracking-[.4px] text-ink-muted">
                        {shortSquadName(team.name)} · {list.length}
                      </p>
                      {list.length === 0 ? (
                        <p className="mt-2 text-xs text-ink-faint">Nobody assigned yet.</p>
                      ) : (
                        <ul className="mt-1.5 divide-y divide-line">
                          {shown.map((p) => (
                            <li key={p.id} className="flex items-center gap-2.5 py-1.5 text-sm">
                              <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-sunk text-[11px] font-extrabold text-ink-muted">
                                {p.jersey_num ?? '·'}
                              </span>
                              <span className="min-w-0 flex-1 truncate font-bold text-ink">{p.full_name}</span>
                              {p.guest_of && (
                                <span className="rounded-[7px] bg-surface-mute px-1.5 py-0.5 text-[11px] font-bold text-ink-muted">
                                  home {shortSquadName(teamsById.get(p.guest_of)?.name ?? teams?.find((t) => t.id === p.guest_of)?.name)}
                                </span>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                      {list.length > 8 && (
                        <button
                          type="button"
                          onClick={() => setOpenSquads((c) => ({ ...c, [team.id]: !open }))}
                          className="mt-1.5 text-[12.5px] font-bold text-brand-ink underline-offset-2 hover:underline"
                        >
                          {open ? 'Show fewer' : `Show all ${list.length}`}
                        </button>
                      )}
                    </Card>
                  )
                })}
              </div>
            </section>
          )}

          {/* One season card per squad: the all-matches record, the league
              line with its table, and the scorers. Three blocks of the same
              three squads became one. */}
          <section className="mb-6" data-testid="season">
            <SectionHead title={`Season ${season}`} meta="league · tournaments · friendlies" />
            <div className={GRID}>
              {sectionTeams.map((team) => {
                const lt = leagueTeams.find((row) => row.team_id === team.id && row.competition_id)
                const row = lt ? (records.get(lt.competition_id) ?? []).find((r) => r.is_ours) : null
                const record = allMatchByTeam.get(team.id)
                const rows = stats.get(team.id) ?? []
                const open = Boolean(openStats[team.id])
                return (
                  <Card key={team.id} data-testid="season-card" className="p-3">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="text-xs font-bold uppercase tracking-[.4px] text-ink-muted">{shortSquadName(team.name)}</p>
                      {lt?.division && <p className="text-xs text-ink-muted">{divisionShort(lt.division)}</p>}
                    </div>
                    <div data-testid="all-matches-record" className="mt-1.5">
                      {record ? (
                        <>
                          <p className="text-[22px] font-extrabold tabular-nums leading-tight text-ink" data-testid="season-record-wdl">
                            <span data-testid="stat-won">{record.wins}</span>–<span data-testid="stat-drawn">{record.draws}</span>–<span data-testid="stat-lost">{record.losses}</span>
                          </p>
                          <p className="text-[11px] text-ink-muted">W · D · L, all matches</p>
                        </>
                      ) : (
                        <p className="text-xs text-ink-faint">No scored matches yet.</p>
                      )}
                    </div>
                    <div data-testid="record-card" className="mt-2 flex items-center justify-between gap-2 border-t border-line pt-2 text-xs">
                      {row ? (
                        <>
                          <span className="text-ink-muted">
                            League: {row.won}-{row.drawn}-{row.lost} · {row.pos}{['st', 'nd', 'rd'][row.pos - 1] ?? 'th'} · {row.points} pts
                          </span>
                          <Link to={`/standings/${lt.competition_id}`} className="shrink-0 font-bold text-brand-ink underline-offset-2 hover:underline">Table</Link>
                        </>
                      ) : (
                        <span className="text-ink-faint">No league table yet.</span>
                      )}
                    </div>
                    {!foreign && (
                      <div data-testid="season-stats-squad" className="mt-2 border-t border-line pt-2">
                        <SeasonStatsTable rows={rows} limit={open ? undefined : 5} />
                        {rows.length > 5 && (
                          <button
                            type="button"
                            onClick={() => setOpenStats((c) => ({ ...c, [team.id]: !open }))}
                            className="mt-1.5 text-[12.5px] font-bold text-brand-ink underline-offset-2 hover:underline"
                          >
                            {open ? 'Show fewer' : `Show all ${rows.length}`}
                          </button>
                        )}
                      </div>
                    )}
                  </Card>
                )
              })}
            </div>
          </section>

          <section className="mb-6" data-testid="fixtures">
            <SectionHead
              title="Upcoming fixtures"
              meta={upcoming.length > FIXTURE_CAP ? `next ${FIXTURE_CAP}` : ''}
              action={
                <Link to={`/schedule?team=section:${section}`} className="text-[13px] font-bold text-brand-ink underline-offset-2 hover:underline">
                  Full schedule
                </Link>
              }
            />
            <Card className="p-0">
              {upcoming.length === 0 ? (
                <Empty message="No more fixtures in the window." />
              ) : (
                <ul className="divide-y divide-line">
                  {/* ⚠️ A GRID WITH FIXED COLUMNS, NOT FLEX. "1st", "2nd" and
                      "3rd" are different widths, so a tag sized to its text
                      shifted the match name a few pixels per row. */}
                  {upcoming.slice(0, FIXTURE_CAP).map((event) => (
                    <li key={event.id} data-testid="fixture-row" className="grid grid-cols-[84px_64px_minmax(0,1fr)_20px] items-center gap-2.5 px-3 py-2 text-sm">
                      <span className="text-xs text-ink-muted">{fmtDay(dayKey(event))}</span>
                      <SquadTag name={teamsById.get(event.team_id)?.name} block />
                      <span className="min-w-0 truncate font-bold text-ink">{eventTitle(event)}</span>
                      <span className="text-right text-xs text-ink-faint">{event.home === true ? 'H' : event.home === false ? 'A' : ''}</span>
                    </li>
                  ))}
                </ul>
              )}
              {upcoming.length > FIXTURE_CAP && (
                <p className="border-t border-line px-3 py-2 text-center text-xs text-ink-faint">{upcoming.length - FIXTURE_CAP} more on the schedule.</p>
              )}
            </Card>
          </section>
        </>
      )}
    </div>
  )
}

const GRID = 'grid grid-cols-1 gap-3 sm:grid-cols-3'
const FIXTURE_CAP = 6

function SectionHead({ title, meta, action }) {
  return (
    <div className="mb-2 flex items-baseline gap-2">
      <BlockTitle>{title}</BlockTitle>
      {meta && <span className="text-xs text-ink-muted">{meta}</span>}
      {action && <span className="ml-auto">{action}</span>}
    </div>
  )
}

/** The squad's short name in a tag; `block` fills a grid column so tags line up. */
function SquadTag({ name, block = false }) {
  return (
    <span className={`rounded-[7px] bg-surface-mute px-1.5 py-0.5 text-[11px] font-bold text-ink-muted ${block ? 'block text-center' : 'inline-block'}`}>
      {shortSquadName(name)}
    </span>
  )
}
