import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Button from '../components/Button.jsx'
import Card from '../components/Card.jsx'
import Empty from '../components/Empty.jsx'
import Sheet from '../components/Sheet.jsx'
import Spinner from '../components/Spinner.jsx'
import { BlockTitle } from '../components/Editorial.jsx'
import {
  importSeason,
  listCompetitions,
  setLeagueTeamCompetition,
  upsertCompetition,
} from '../data/competitions.js'
import { listAllLeagueTeams } from '../data/leagueTeams.js'
import { DIVISIONS, divisionLong } from '../lib/division.js'
import { parseRcmGrid } from '../lib/rcmGrid.js'
import { useMemberships } from '../lib/memberships.jsx'
import { isAdmin } from '../lib/scope.js'
import { clubDateTimeInputs } from '../lib/eventFormat.js'
import { friendlyMessage } from '../lib/friendlyError.js'

// Leagues: the club's divisions, their points rules, and the season import —
// claude/plans/2026-09-02-standings-and-results.md ("Division setup" and the
// import route Jay's 3 Sep 2026 answer added). Admin only: the screen is
// gated on isAdmin and every write behind it is RLS-gated on the same.
//
// ⚠️ POINTS RULES ARE A SETTING. RCM may not use 4/2/0 with both bonuses at
// every age; a junior division may use none. Changing them is an edit here,
// never a deploy, and the table recomputes on its next read.
//
// ⚠️ THE IMPORT READS THE GRID'S TEXT AND SHOWS WHAT IT READ BEFORE WRITING.
// src/lib/rcmGrid.js does the reading; this screen maps each division it found
// onto one of the club's competitions, asks which code is ours and which league
// team that is, and only then calls import_season — one atomic call per
// division. Re-importing the same grid changes nothing.

const INPUT =
  'w-full rounded-[11px] border-[1.5px] border-line bg-surface-card px-3 py-[9px] text-[16px] text-ink outline-none transition focus:border-brand'
const LABEL = 'mb-1 block text-[12.5px] font-bold uppercase tracking-[.4px] text-ink-muted'

// The grid's column names → the club's division codes (src/lib/division.js).
const GRID_TO_DIVISION = { WAP: 'WAP', PREM: 'WAP', DIV1: 'D1', DIV2: 'D2', W7S: 'W7s', WXV: 'WXV', A: 'A', B: 'B', C: 'C' }

function defaultSeason(today) {
  const year = Number(today.slice(0, 4))
  const month = Number(today.slice(5, 7))
  const start = month >= 7 ? year : year - 1
  return { season: `${start}-${String(start + 1).slice(2)}`, startYear: start }
}

const EMPTY = {
  name: '',
  season: '',
  division: '',
  is_senior: true,
  points_win: 4,
  points_draw: 2,
  points_loss: 0,
  bonus_try_threshold: 4,
  bonus_losing_margin: 7,
  results_url: '',
}

function numberOrNull(value) {
  if (value === '' || value == null) return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

export default function AdminCompetitions() {
  const { memberships } = useMemberships()
  const admin = isAdmin(memberships)
  const clubId = memberships.find((m) => m.club_id)?.club_id ?? null
  // The club's calendar date as yyyy-mm-dd, comparable with played_on.
  const today = clubDateTimeInputs(new Date()).date
  const { season: thisSeason, startYear } = defaultSeason(today)

  const [competitions, setCompetitions] = useState([])
  const [leagueTeams, setLeagueTeams] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [reloadToken, setReloadToken] = useState(0)

  const [editing, setEditing] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)

  const [gridText, setGridText] = useState('')
  const [seasonStartYear, setSeasonStartYear] = useState(String(startYear))
  const [parsed, setParsed] = useState(null)
  const [mapping, setMapping] = useState({})
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState(null)
  const [report, setReport] = useState(null)

  useEffect(() => {
    if (!admin) {
      setLoading(false)
      return undefined
    }
    let mounted = true
    setLoading(true)
    Promise.all([listCompetitions(), listAllLeagueTeams()])
      .then(([comps, teams]) => {
        if (!mounted) return
        setCompetitions(comps)
        setLeagueTeams(teams)
      })
      .catch((err) => mounted && setError(err))
      .finally(() => mounted && setLoading(false))
    return () => {
      mounted = false
    }
  }, [admin, reloadToken])

  const bySeason = useMemo(() => {
    const groups = new Map()
    for (const c of competitions) {
      if (!groups.has(c.season)) groups.set(c.season, [])
      groups.get(c.season).push(c)
    }
    return [...groups.entries()]
  }, [competitions])

  function openNew() {
    setEditing({ ...EMPTY, season: thisSeason })
    setSaveError(null)
  }
  function openEdit(competition) {
    setEditing({
      ...competition,
      division: competition.division ?? '',
      results_url: competition.results_url ?? '',
      bonus_try_threshold: competition.bonus_try_threshold ?? '',
      bonus_losing_margin: competition.bonus_losing_margin ?? '',
    })
    setSaveError(null)
  }
  const set = (field) => (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value
    setEditing((current) => ({ ...current, [field]: value }))
  }

  async function save() {
    if (!editing.name.trim() || !editing.season.trim()) {
      setSaveError(new Error('A division needs a name and a season.'))
      return
    }
    setSaving(true)
    setSaveError(null)
    try {
      await upsertCompetition({
        ...(editing.id ? { id: editing.id } : null),
        club_id: editing.club_id ?? clubId,
        name: editing.name.trim(),
        season: editing.season.trim(),
        division: editing.division || null,
        is_senior: editing.is_senior === true,
        points_win: numberOrNull(editing.points_win) ?? 4,
        points_draw: numberOrNull(editing.points_draw) ?? 2,
        points_loss: numberOrNull(editing.points_loss) ?? 0,
        bonus_try_threshold: numberOrNull(editing.bonus_try_threshold),
        bonus_losing_margin: numberOrNull(editing.bonus_losing_margin),
        results_url: editing.results_url.trim() || null,
      })
      setEditing(null)
      setReloadToken((n) => n + 1)
    } catch (err) {
      setSaveError(err)
    } finally {
      setSaving(false)
    }
  }

  function readGrid() {
    const out = parseRcmGrid(gridText, { seasonStartYear: Number(seasonStartYear) })
    setParsed(out)
    setReport(null)
    setImportError(null)
    // Default mapping: the competition this season whose division matches
    // the grid column, our code if the legend names the club, the league
    // team in that division.
    const next = {}
    for (const division of out.divisions) {
      const code = GRID_TO_DIVISION[division.code.toUpperCase()] ?? null
      const competition = competitions.find((c) => c.season === thisSeason && c.division === code) ?? null
      const ours = division.sides.find((s) => /harlequin/i.test(out.legend[s] ?? '')) ?? (division.sides.includes('ADH') ? 'ADH' : '')
      const leagueTeam = leagueTeams.find((lt) => lt.division === code && lt.is_active) ?? null
      next[division.code] = { competitionId: competition?.id ?? '', ourCode: ours, leagueTeamId: leagueTeam?.id ?? '' }
    }
    setMapping(next)
  }

  async function runImport() {
    if (!parsed) return
    setImporting(true)
    setImportError(null)
    const lines = []
    try {
      for (const division of parsed.divisions) {
        const m = mapping[division.code]
        if (!m?.competitionId) {
          lines.push(`${division.code}: skipped — no competition chosen.`)
          continue
        }
        const sides = division.sides.map((code) => ({
          name: parsed.legend[code] ?? code,
          code,
          league_team_id: code === m.ourCode && m.leagueTeamId ? m.leagueTeamId : null,
        }))
        const fixtures = division.rounds.flatMap((round) =>
          round.fixtures.map((f) => ({ round: round.round, played_on: round.date, home: f.home, away: f.away })),
        )
        const counts = await importSeason(m.competitionId, { sides, fixtures })
        if (m.ourCode && m.leagueTeamId) await setLeagueTeamCompetition(m.leagueTeamId, m.competitionId)
        const name = competitions.find((c) => c.id === m.competitionId)?.name ?? division.code
        lines.push(
          `${name}: ${counts.sides_added} sides and ${counts.fixtures_added} fixtures added, ${counts.events_linked} of our games linked, ${counts.events_created} added to the schedule.`,
        )
      }
      setReport(lines)
      setReloadToken((n) => n + 1)
    } catch (err) {
      setImportError(err)
    } finally {
      setImporting(false)
    }
  }

  if (!admin) {
    return <Empty message="Leagues are an admin's job. Ask a club admin if you need a division set up." />
  }
  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner label="Loading divisions…" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h1 className="text-[22px] font-extrabold tracking-tight text-ink">Leagues</h1>
        <Button size="sm" onClick={openNew}>
          Add division
        </Button>
      </div>

      {error && (
        <p role="alert" className="mb-3 rounded-[11px] bg-danger-bg px-3 py-2 text-sm font-semibold text-danger-ink">
          {friendlyMessage(error, "We couldn't load the divisions.")}
        </p>
      )}

      {bySeason.length === 0 ? (
        <Empty message="No divisions yet. Add one, then import the season's grid below." />
      ) : (
        bySeason.map(([season, comps]) => (
          <section key={season} className="mb-5" data-testid={`season-${season}`}>
            <BlockTitle>{season}</BlockTitle>
            <Card className="overflow-hidden p-0">
              <ul className="divide-y divide-line">
                {comps.map((c) => (
                  <li key={c.id} data-testid="competition-row" className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-ink">
                        {c.name}
                        {c.division && <span className="ml-2 text-xs font-bold text-ink-muted">{divisionLong(c.division)}</span>}
                      </p>
                      <p className="text-xs text-ink-faint">
                        {c.is_senior ? 'Senior' : 'Junior'} · {c.points_win}/{c.points_draw}/{c.points_loss}
                        {c.bonus_try_threshold != null || c.bonus_losing_margin != null ? ' with bonus points' : ''}
                      </p>
                    </div>
                    <Link to={`/standings/${c.id}`} className="text-[13px] font-bold text-brand-ink underline-offset-2 hover:underline">
                      Table
                    </Link>
                    <button type="button" onClick={() => openEdit(c)} className="text-[13px] font-bold text-brand-ink underline-offset-2 hover:underline">
                      Edit
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          </section>
        ))
      )}

      <section className="mt-6" data-testid="season-import">
        <BlockTitle>Import a season</BlockTitle>
        <Card className="p-4">
          <p className="mb-3 text-sm text-ink-muted">
            Paste the text of the RCM fixtures grid. Every division it finds is shown before anything is written, and re-importing the same grid changes nothing.
          </p>
          <label className={LABEL} htmlFor="grid-text">Grid text</label>
          <textarea
            id="grid-text"
            rows={6}
            className={`${INPUT} font-mono text-[13px]`}
            value={gridText}
            onChange={(e) => setGridText(e.target.value)}
            placeholder={'WAP WAP DIV1 DIV1\n2-3 Oct RD1 RD1 RD1 RD1\nADH BYE ADH BYE\n…'}
          />
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <label className="w-32">
              <span className={LABEL}>Season starts</span>
              <input aria-label="Season start year" className={INPUT} inputMode="numeric" value={seasonStartYear} onChange={(e) => setSeasonStartYear(e.target.value.replace(/\D/g, ''))} />
            </label>
            <Button variant="secondary" onClick={readGrid} disabled={!gridText.trim()}>
              Read the grid
            </Button>
          </div>

          {parsed && (
            <div className="mt-4" data-testid="import-preview">
              {parsed.warnings.map((w) => (
                <p key={w} role="alert" className="mb-2 rounded-[9px] bg-warn-bg px-3 py-2 text-[12.5px] text-ink">{w}</p>
              ))}
              {parsed.divisions.length === 0 ? (
                <p className="text-sm text-ink-muted">Nothing readable in that text.</p>
              ) : (
                parsed.divisions.map((division) => {
                  const m = mapping[division.code] ?? {}
                  const games = division.rounds.reduce((n, r) => n + r.fixtures.length, 0)
                  return (
                    <div key={division.code} data-testid="import-division" className="mb-3 rounded-[11px] border-[1.5px] border-line p-3">
                      <p className="mb-2 text-sm font-bold text-ink">
                        {division.code} · {division.rounds.length} rounds · {games} games · {division.sides.length} sides
                      </p>
                      <div className="grid gap-3 sm:grid-cols-3">
                        <label>
                          <span className={LABEL}>Into</span>
                          <select aria-label={`${division.code} competition`} className={INPUT} value={m.competitionId ?? ''} onChange={(e) => setMapping((c) => ({ ...c, [division.code]: { ...m, competitionId: e.target.value } }))}>
                            <option value="">Skip this division</option>
                            {competitions.map((c) => (
                              <option key={c.id} value={c.id}>{c.name} {c.season}</option>
                            ))}
                          </select>
                        </label>
                        <label>
                          <span className={LABEL}>Our side</span>
                          <select aria-label={`${division.code} our side`} className={INPUT} value={m.ourCode ?? ''} onChange={(e) => setMapping((c) => ({ ...c, [division.code]: { ...m, ourCode: e.target.value } }))}>
                            <option value="">Not in this division</option>
                            {division.sides.map((s) => (
                              <option key={s} value={s}>{s} — {parsed.legend[s] ?? s}</option>
                            ))}
                          </select>
                        </label>
                        <label>
                          <span className={LABEL}>Our league team</span>
                          <select aria-label={`${division.code} league team`} className={INPUT} value={m.leagueTeamId ?? ''} onChange={(e) => setMapping((c) => ({ ...c, [division.code]: { ...m, leagueTeamId: e.target.value } }))}>
                            <option value="">None</option>
                            {leagueTeams.map((lt) => (
                              <option key={lt.id} value={lt.id}>{lt.rcm_name}{lt.division ? ` — ${divisionLong(lt.division)}` : ''}</option>
                            ))}
                          </select>
                        </label>
                      </div>
                    </div>
                  )
                })
              )}
              {parsed.divisions.length > 0 && (
                <Button onClick={runImport} disabled={importing}>
                  {importing ? 'Importing…' : 'Import'}
                </Button>
              )}
              {importError && (
                <p role="alert" className="mt-3 rounded-[11px] bg-danger-bg px-3 py-2 text-sm font-semibold text-danger-ink">
                  {friendlyMessage(importError, "The import didn't go through.")}
                </p>
              )}
              {report && (
                <ul data-testid="import-report" className="mt-3 rounded-[11px] bg-accent-bg px-3 py-2 text-sm text-accent-ink">
                  {report.map((line) => <li key={line}>{line}</li>)}
                </ul>
              )}
            </div>
          )}
        </Card>
      </section>

      {editing && (
        <Sheet open onClose={() => setEditing(null)} title={editing.id ? 'Edit division' : 'Add division'}>
          <div className="grid gap-3">
            <label>
              <span className={LABEL}>Name</span>
              <input aria-label="Division name" className={INPUT} value={editing.name} onChange={set('name')} placeholder="West Asia Premiership" />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label>
                <span className={LABEL}>Season</span>
                <input aria-label="Season" className={INPUT} value={editing.season} onChange={set('season')} />
              </label>
              <label>
                <span className={LABEL}>Division code</span>
                <select aria-label="Division code" className={INPUT} value={editing.division} onChange={set('division')}>
                  <option value="">None</option>
                  {DIVISIONS.map((d) => (
                    <option key={d.code} value={d.code}>{d.long}</option>
                  ))}
                </select>
              </label>
            </div>
            <label className="flex items-center gap-2 text-sm text-ink">
              <input type="checkbox" checked={editing.is_senior === true} onChange={set('is_senior')} />
              Senior division
            </label>
            <div className="grid grid-cols-3 gap-3">
              <label><span className={LABEL}>Win</span><input aria-label="Points for a win" className={INPUT} inputMode="numeric" value={editing.points_win} onChange={set('points_win')} /></label>
              <label><span className={LABEL}>Draw</span><input aria-label="Points for a draw" className={INPUT} inputMode="numeric" value={editing.points_draw} onChange={set('points_draw')} /></label>
              <label><span className={LABEL}>Loss</span><input aria-label="Points for a loss" className={INPUT} inputMode="numeric" value={editing.points_loss} onChange={set('points_loss')} /></label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label><span className={LABEL}>Try bonus at</span><input aria-label="Try bonus threshold" className={INPUT} inputMode="numeric" value={editing.bonus_try_threshold} onChange={set('bonus_try_threshold')} placeholder="none" /></label>
              <label><span className={LABEL}>Losing bonus within</span><input aria-label="Losing bonus margin" className={INPUT} inputMode="numeric" value={editing.bonus_losing_margin} onChange={set('bonus_losing_margin')} placeholder="none" /></label>
            </div>
            <label>
              <span className={LABEL}>Union results page</span>
              <input aria-label="Results URL" className={INPUT} value={editing.results_url} onChange={set('results_url')} placeholder="https://…" />
            </label>
            {saveError && (
              <p role="alert" className="rounded-[11px] bg-danger-bg px-3 py-2 text-sm font-semibold text-danger-ink">
                {friendlyMessage(saveError, "We couldn't save that division.")}
              </p>
            )}
            <Button full onClick={save} disabled={saving}>
              {saving ? 'Saving…' : 'Save division'}
            </Button>
          </div>
        </Sheet>
      )}
    </div>
  )
}
