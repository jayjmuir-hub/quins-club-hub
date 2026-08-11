// What to call a fixture: the SQUAD it was drawn from, or the LEAGUE TEAM that
// actually played it.
//
// ⚠️ ONE FORMATTER, FOUR CONSUMERS, AND THAT IS THE POINT. Schedule,
// EventDetail, the allocation grid and the calendar feed all render this. The
// feed is an EDGE FUNCTION that deploys separately from the bundle, so if the
// rule lived at each call site, drift there would stay invisible until a
// parent's subscribed calendar quietly disagreed with the app.
//
// ⚠️ NO LEAGUE TEAM MEANS NO LEAGUE DECORATION — AND THIS IS THE WHOLE RULE.
// A fixture IS a league match when it has a league team. Null means it is not
// one: no division, no round, no invented default. `round` is ignored entirely
// without a league team, because a round number left on a friendly is stale
// data, not a label.
//
// That is spelled out because this club has already paid for the opposite
// habit once. src/lib/ageGroup.js returns null for an unparseable squad name;
// `allowsOwnContact` read that null as "a senior side: adults"; and the app
// offered a twelve-year-old girls' squad the child's own email and phone
// fields. **The lesson recorded then was the null default, not the regex.**

/**
 * @param {{round?: number|null}|null|undefined} event
 * @param {{rcm_name: string, division?: string|null}|null|undefined} leagueTeam
 * @param {string} squadName  fallback when this is not a league fixture
 * @returns {string} e.g. "ADHQ2 · Div B · Round 4", or the squad name
 */
export function fixtureLabel(event, leagueTeam, squadName) {
  if (!leagueTeam) return squadName

  const parts = [leagueTeam.rcm_name]
  if (leagueTeam.division) parts.push(`Div ${leagueTeam.division}`)
  if (event?.round != null) parts.push(`Round ${event.round}`)

  return parts.join(' · ')
}
