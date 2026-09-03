import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import Button from '../components/Button.jsx'
import Card from '../components/Card.jsx'
import Empty from '../components/Empty.jsx'
import Spinner from '../components/Spinner.jsx'
import { BlockTitle } from '../components/Editorial.jsx'
import {
  getCompetition,
  listFixtures,
  listKeepers,
  listResults,
  listSides,
  recordResults,
  standings as loadStandings,
} from '../data/competitions.js'
import { useAuth } from '../lib/auth.jsx'
import { useMemberships } from '../lib/memberships.jsx'
import { isAdmin } from '../lib/scope.js'
import { clubDateTimeInputs } from '../lib/eventFormat.js'
import { friendlyMessage } from '../lib/friendlyError.js'

// The league table for one division, and the round's results under it —
// claude/plans/2026-09-02-standings-and-results.md ("Standings" and "Results
// entry", route 1). db/migrations/20260905_competitions_and_standings.sql.
//
// ⚠️ THE TABLE IS COMPUTED BY THE DATABASE (competition_standings). This screen
// never adds a point up; it renders rows. A corrected result changes the table
// on the next load because there is nothing here to get out of step.
//
// ⚠️ OUR OWN SCORE IS NOT TYPED HERE. It arrives from the match sheet as a
// `sheet` result, and the row shows it read-only with that tag. A keeper who
// disagrees corrects it on the sheet, where the components are.
//
// ⚠️ "N RESULTS MISSING" COUNTS FIXTURES THE GRID KNOWS ABOUT whose day has
// passed and which have no live result. It is exact because the season was
// imported (Jay, 3 Sep 2026: RCM publishes the list per division); a division
// with no fixtures imported shows no count rather than a wrong one.

const SOURCE_LABEL = { sheet: 'match sheet', typed: 'typed', read: 'read in', fetched: 'fetched' }

const INPUT =
  'w-12 rounded-[9px] border-[1.5px] border-line bg-surface-card px-1 py-1 text-center text-[16px] text-ink outline-none focus:border-brand'

function pointsRule(competition) {
  const parts = [`${competition.points_win} for a win`, `${competition.points_draw} a draw`]
  if (competition.points_loss) parts.push(`${competition.points_loss} a loss`)
  const bonus = []
  if (competition.bonus_try_threshold != null) bonus.push(`${competition.bonus_try_threshold} tries`)
  if (competition.bonus_losing_margin != null) bonus.push(`losing by ${competition.bonus_losing_margin} or fewer`)
  return bonus.length ? `${parts.join(', ')} · bonus for ${bonus.join(' or ')}` : parts.join(', ')
}

/** Live = confirmed and not superseded. One per fixture, or per side pair when there is no fixture. */
export function liveResults(results) {
  return results.filter((r) => r.confirmed_at && !r.superseded_at)
}

export function missingCount(fixtures, results, today) {
  const live = new Set(liveResults(results).map((r) => r.fixture_id).filter(Boolean))
  return fixtures.filter((f) => f.played_on && f.played_on < today && !live.has(f.id)).length
}

export default function Standings() {
  const { competitionId } = useParams()
  const { user } = useAuth()
  const { memberships } = useMemberships()

  const [competition, setCompetition] = useState(null)
  const [sides, setSides] = useState([])
  const [fixtures, setFixtures] = useState([])
  const [results, setResults] = useState([])
  const [table, setTable] = useState([])
  const [keepers, setKeepers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [reloadToken, setReloadToken] = useState(0)

  const [round, setRound] = useState(null)
  const [draft, setDraft] = useState({})
  const [correcting, setCorrecting] = useState({})
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)

  useEffect(() => {
    let mounted = true
    setLoading(true)
    setError(null)
    Promise.all([
      getCompetition(competitionId),
      listSides(competitionId),
      listFixtures(competitionId),
      listResults(competitionId),
      loadStandings(competitionId),
      listKeepers(competitionId),
    ])
      .then(([comp, sideRows, fixtureRows, resultRows, tableRows, keeperRows]) => {
        if (!mounted) return
        setCompetition(comp)
        setSides(sideRows)
        setFixtures(fixtureRows)
        setResults(resultRows)
        setTable(tableRows)
        setKeepers(keeperRows)
      })
      .catch((err) => mounted && setError(err))
      .finally(() => mounted && setLoading(false))
    return () => {
      mounted = false
    }
  }, [competitionId, reloadToken])

  const sidesById = useMemo(() => new Map(sides.map((s) => [s.id, s])), [sides])
  const live = useMemo(() => liveResults(results), [results])
  const liveByFixture = useMemo(
    () => new Map(live.filter((r) => r.fixture_id).map((r) => [r.fixture_id, r])),
    [live],
  )
  // The club's calendar date as yyyy-mm-dd, comparable with played_on.
  const today = clubDateTimeInputs(new Date()).date
  const missing = fixtures.length ? missingCount(fixtures, results, today) : null
  const updated = live.reduce((latest, r) => (r.confirmed_at > latest ? r.confirmed_at : latest), '')
  const mayKeep = isAdmin(memberships) || keepers.some((k) => k.profile_id === user?.id)

  const rounds = useMemo(() => {
    const set = new Set([...fixtures, ...results].map((r) => r.round).filter((r) => r != null))
    return [...set].sort((a, b) => a - b)
  }, [fixtures, results])
  // Default to the latest round whose day has passed — the one a keeper is
  // most likely here to fill in.
  useEffect(() => {
    if (round != null || rounds.length === 0) return
    const past = fixtures.filter((f) => f.played_on && f.played_on <= today).map((f) => f.round)
    setRound(past.length ? Math.max(...past) : rounds[0])
  }, [rounds, fixtures, today, round])

  const roundFixtures = fixtures.filter((f) => f.round === round)
  const roundLoose = live.filter((r) => r.round === round && !r.fixture_id)

  function setScore(fixtureId, field, value) {
    setDraft((current) => ({ ...current, [fixtureId]: { ...(current[fixtureId] ?? {}), [field]: value } }))
  }

  async function saveRound() {
    const rows = []
    for (const fixture of roundFixtures) {
      const d = draft[fixture.id]
      if (!d || d.home === '' || d.away === '' || d.home == null || d.away == null) continue
      const current = liveByFixture.get(fixture.id)
      if (current && !correcting[fixture.id]) continue
      rows.push({
        fixture_id: fixture.id,
        round: fixture.round,
        played_on: fixture.played_on,
        home_side_id: fixture.home_side_id,
        away_side_id: fixture.away_side_id,
        home_score: d.home,
        away_score: d.away,
        home_tries: d.homeTries,
        away_tries: d.awayTries,
        supersedes: current?.id ?? null,
        source_note: current ? d.note || 'Corrected by the keeper' : null,
      })
    }
    if (rows.length === 0) return
    setSaving(true)
    setSaveError(null)
    try {
      await recordResults(competitionId, rows, { profileId: user?.id })
      setDraft({})
      setCorrecting({})
      setReloadToken((n) => n + 1)
    } catch (err) {
      setSaveError(err)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner label="Loading the table…" />
      </div>
    )
  }
  if (error || !competition) {
    return (
      <p role="alert" className="rounded-[11px] bg-danger-bg px-4 py-3 text-sm font-semibold text-danger-ink">
        {friendlyMessage(error, "We couldn't load this division.")}
      </p>
    )
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h1 className="text-[22px] font-extrabold tracking-tight text-ink">
          {competition.name} <span className="font-semibold text-ink-muted">{competition.season}</span>
        </h1>
        <p className="text-xs text-ink-muted" data-testid="standings-status">
          {updated ? `Updated ${new Date(updated).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}` : 'No results yet'}
          {missing != null && missing > 0 && (
            <>
              {' · '}
              <span className="font-bold text-warn-ink">{missing} result{missing === 1 ? '' : 's'} missing</span>
            </>
          )}
        </p>
      </div>

      <Card className="overflow-x-auto p-0">
        {table.length === 0 ? (
          <Empty message="No sides in this division yet. An admin can import the season on the Leagues screen." />
        ) : (
          <table className="w-full border-collapse text-sm" data-testid="standings-table">
            <caption className="sr-only">League table for {competition.name}</caption>
            <thead>
              <tr className="text-[11px] font-extrabold uppercase tracking-[.5px] text-ink-muted">
                <th scope="col" className="px-3 py-2 text-left">Side</th>
                <th scope="col" className="px-1.5 py-2 text-right">P</th>
                <th scope="col" className="px-1.5 py-2 text-right">W</th>
                <th scope="col" className="hidden px-1.5 py-2 text-right sm:table-cell">D</th>
                <th scope="col" className="hidden px-1.5 py-2 text-right sm:table-cell">L</th>
                <th scope="col" className="hidden px-1.5 py-2 text-right sm:table-cell">PF</th>
                <th scope="col" className="hidden px-1.5 py-2 text-right sm:table-cell">PA</th>
                <th scope="col" className="px-1.5 py-2 text-right">+/−</th>
                <th scope="col" className="hidden px-1.5 py-2 text-right sm:table-cell">BP</th>
                <th scope="col" className="px-3 py-2 text-right">Pts</th>
              </tr>
            </thead>
            <tbody>
              {table.map((row) => (
                <tr
                  key={row.side_id}
                  data-testid="standings-row"
                  className={row.is_ours ? 'bg-brand/10 font-extrabold text-brand-ink' : 'border-t border-line'}
                >
                  <td className="px-3 py-2 text-left">
                    <span className="mr-2 text-ink-faint">{row.pos}</span>
                    {row.side}
                  </td>
                  <td className="px-1.5 py-2 text-right tabular-nums">{row.played}</td>
                  <td className="px-1.5 py-2 text-right tabular-nums">{row.won}</td>
                  <td className="hidden px-1.5 py-2 text-right tabular-nums sm:table-cell">{row.drawn}</td>
                  <td className="hidden px-1.5 py-2 text-right tabular-nums sm:table-cell">{row.lost}</td>
                  <td className="hidden px-1.5 py-2 text-right tabular-nums sm:table-cell">{row.points_for}</td>
                  <td className="hidden px-1.5 py-2 text-right tabular-nums sm:table-cell">{row.points_against}</td>
                  <td className="px-1.5 py-2 text-right tabular-nums">{row.difference > 0 ? `+${row.difference}` : row.difference}</td>
                  <td className="hidden px-1.5 py-2 text-right tabular-nums sm:table-cell">{row.bonus}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{row.points}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="px-3 py-2 text-xs text-ink-faint">
          {pointsRule(competition)}
          {competition.results_url && (
            <>
              {' · '}
              <a href={competition.results_url} target="_blank" rel="noreferrer" className="font-bold text-brand-ink underline-offset-2 hover:underline">
                Union results page
              </a>
            </>
          )}
        </p>
      </Card>

      {rounds.length > 0 && (
        <section className="mt-6">
          <div className="mb-2 flex items-center justify-between gap-3">
            <BlockTitle>Results</BlockTitle>
            <label className="text-xs font-bold text-ink-muted">
              Round{' '}
              <select
                aria-label="Round"
                value={round ?? ''}
                onChange={(e) => {
                  setRound(Number(e.target.value))
                  setDraft({})
                  setCorrecting({})
                }}
                className="rounded-[9px] border-[1.5px] border-line bg-surface-card px-2 py-1 text-[14px] text-ink"
              >
                {rounds.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <Card className="p-0">
            {roundFixtures.length === 0 && roundLoose.length === 0 ? (
              <Empty message="No games in this round." />
            ) : (
              <ul className="divide-y divide-line">
                {roundFixtures.map((fixture) => {
                  const home = sidesById.get(fixture.home_side_id)
                  const away = sidesById.get(fixture.away_side_id)
                  const result = liveByFixture.get(fixture.id)
                  const editing = mayKeep && (!result || correcting[fixture.id]) && result?.source !== 'sheet'
                  const d = draft[fixture.id] ?? {}
                  return (
                    <li key={fixture.id} data-testid="result-row" className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5 text-sm">
                      <span className="min-w-0 flex-1 font-bold text-ink">
                        {home?.name} <span className="text-ink-faint">v</span> {away?.name}
                      </span>
                      {editing ? (
                        <span className="flex items-center gap-1.5" role="group" aria-label={`Score ${home?.name} v ${away?.name}`}>
                          <input aria-label={`${home?.name} score`} inputMode="numeric" className={INPUT} value={d.home ?? ''} onChange={(e) => setScore(fixture.id, 'home', e.target.value.replace(/\D/g, ''))} />
                          <span className="text-ink-faint">–</span>
                          <input aria-label={`${away?.name} score`} inputMode="numeric" className={INPUT} value={d.away ?? ''} onChange={(e) => setScore(fixture.id, 'away', e.target.value.replace(/\D/g, ''))} />
                          {competition.bonus_try_threshold != null && (
                            <>
                              <span className="ml-2 text-[11px] text-ink-faint">tries</span>
                              <input aria-label={`${home?.name} tries`} inputMode="numeric" className={INPUT} value={d.homeTries ?? ''} onChange={(e) => setScore(fixture.id, 'homeTries', e.target.value.replace(/\D/g, ''))} />
                              <input aria-label={`${away?.name} tries`} inputMode="numeric" className={INPUT} value={d.awayTries ?? ''} onChange={(e) => setScore(fixture.id, 'awayTries', e.target.value.replace(/\D/g, ''))} />
                            </>
                          )}
                        </span>
                      ) : result ? (
                        <span className="flex items-center gap-2">
                          <span className="tabular-nums font-extrabold text-ink">
                            {result.home_score} – {result.away_score}
                          </span>
                          <span className="rounded-[7px] bg-surface-mute px-1.5 py-0.5 text-[11px] font-bold text-ink-muted">
                            {SOURCE_LABEL[result.source] ?? result.source}
                          </span>
                          {mayKeep && result.source !== 'sheet' && (
                            <button
                              type="button"
                              className="text-[12px] font-bold text-brand-ink underline-offset-2 hover:underline"
                              onClick={() => {
                                setCorrecting((c) => ({ ...c, [fixture.id]: true }))
                                setDraft((c) => ({ ...c, [fixture.id]: { home: String(result.home_score), away: String(result.away_score) } }))
                              }}
                            >
                              Correct
                            </button>
                          )}
                        </span>
                      ) : (
                        <span className="rounded-[7px] bg-warn-bg px-1.5 py-0.5 text-[11px] font-bold text-warn-ink">
                          {fixture.played_on && fixture.played_on < today ? 'missing' : fixture.played_on ?? 'date TBC'}
                        </span>
                      )}
                    </li>
                  )
                })}
                {roundLoose.map((result) => (
                  <li key={result.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                    <span className="min-w-0 flex-1 font-bold text-ink">
                      {sidesById.get(result.home_side_id)?.name} <span className="text-ink-faint">v</span> {sidesById.get(result.away_side_id)?.name}
                    </span>
                    <span className="tabular-nums font-extrabold text-ink">{result.home_score} – {result.away_score}</span>
                    <span className="rounded-[7px] bg-surface-mute px-1.5 py-0.5 text-[11px] font-bold text-ink-muted">{SOURCE_LABEL[result.source] ?? result.source}</span>
                  </li>
                ))}
              </ul>
            )}
            {mayKeep && roundFixtures.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-3 py-2.5">
                <p className="text-xs text-ink-faint">Scores you type are saved as confirmed, in your name.</p>
                <Button size="sm" onClick={saveRound} disabled={saving}>
                  {saving ? 'Saving…' : 'Save round'}
                </Button>
              </div>
            )}
            {saveError && (
              <p role="alert" className="m-3 rounded-[11px] bg-danger-bg px-3 py-2 text-sm font-semibold text-danger-ink">
                {friendlyMessage(saveError, "We couldn't save those results.")}
              </p>
            )}
          </Card>
        </section>
      )}

      {isAdmin(memberships) && (
        <p className="mt-4 text-xs text-ink-faint">
          Division settings and the season import are on{' '}
          <Link to="/admin/competitions" className="font-bold text-brand-ink underline-offset-2 hover:underline">
            Leagues
          </Link>
          .
        </p>
      )}
    </div>
  )
}
