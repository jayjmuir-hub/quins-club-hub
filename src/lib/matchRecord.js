// All-matches W–D–L for a squad in the club season (1 Sep–31 Aug, Asia/Dubai).
//
// Not league standings. Counts every scored `events.type === 'match'` the
// squad played — league, tournament GAMES, friendlies — via resultOutcome.
// Tournament CONTAINERS (named tournament rows with no tournament_id) are
// excluded even if a score was parked on them. Unscored fixtures do not
// invent a result.
//
// Pure. Screens fetch enough of the season window and pass the rows in.

import { eventDate, hasResult, resultOutcome, clubWallTimeToUtc } from './eventFormat.js'
import { recordsScores } from './minis.js'
import { seasonLabelFor } from './season.js'

export function emptyLine() {
  return { wins: 0, draws: 0, losses: 0, played: 0 }
}

export function formatWdl({ wins = 0, draws = 0, losses = 0 } = {}) {
  return `${wins}–${draws}–${losses}`
}

/** Same test as isTournamentEvent in TournamentDetail — kept here so a lib
 * does not import a screen. A game under a tournament has tournament_id set. */
export function isTournamentContainer(event) {
  return (
    event?.type === 'match' &&
    event?.competition_type === 'tournament' &&
    !event?.tournament_id
  )
}

export function competitionBucket(event) {
  if (event?.competition_type === 'league') return 'league'
  if (event?.competition_type === 'tournament') return 'tournaments'
  return 'friendlies'
}

/** Inclusive ISO bounds of the club season containing `date`. */
export function seasonWindowFor(date = new Date()) {
  const label = seasonLabelFor(date)
  const startYear = Number(label.slice(0, 4))
  const from = clubWallTimeToUtc(`${startYear}-09-01`, '00:00')
  const to = clubWallTimeToUtc(`${startYear + 1}-08-31`, '23:59')
  return { from, to, label }
}

/** Widen an existing listEvents window so it cannot silently miss the season. */
export function windowCoveringSeason(current, date = new Date()) {
  const season = seasonWindowFor(date)
  const fromMs = Math.min(Date.parse(current.from), Date.parse(season.from))
  const toMs = Math.max(Date.parse(current.to), Date.parse(season.to))
  return { from: new Date(fromMs).toISOString(), to: new Date(toMs).toISOString() }
}

function tallyOutcome(line, outcome) {
  if (outcome === 'win') line.wins += 1
  else if (outcome === 'loss') line.losses += 1
  else if (outcome === 'draw') line.draws += 1
  else return
  line.played += 1
}

function emptyRecord(season) {
  return {
    wins: 0,
    draws: 0,
    losses: 0,
    played: 0,
    season,
    league: emptyLine(),
    tournaments: emptyLine(),
    friendlies: emptyLine(),
  }
}

/**
 * W–D–L for one squad from already-loaded events.
 * @param {object[]} events
 * @param {{ teamId: string, at?: Date }} opts
 */
export function squadMatchRecord(events, { teamId, at = new Date() } = {}) {
  const season = seasonLabelFor(at)
  const record = emptyRecord(season)
  if (!teamId || !Array.isArray(events)) return record

  for (const event of events) {
    if (event?.type !== 'match') continue
    if (event.team_id !== teamId) continue
    if (isTournamentContainer(event)) continue
    if (!hasResult(event)) continue
    const when = eventDate(event)
    if (!when) continue
    if (seasonLabelFor(when) !== season) continue
    const outcome = resultOutcome(event)
    tallyOutcome(record, outcome)
    const bucket = competitionBucket(event)
    tallyOutcome(record[bucket], outcome)
  }
  return record
}

/**
 * One row per squad that records scores. Never a club-wide rollup.
 * U6–U7 are omitted (recordsScores).
 */
export function scoringSquadRecords(events, teams, { at = new Date() } = {}) {
  if (!Array.isArray(teams)) return []
  return teams
    .filter((team) => recordsScores(team?.name))
    .map((team) => ({
      team,
      record: squadMatchRecord(events, { teamId: team.id, at }),
    }))
}
