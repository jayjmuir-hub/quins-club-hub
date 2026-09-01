// What to call a fixture: the SQUAD it was drawn from, or the LEAGUE TEAM that
// actually played it.
//
// ⚠️ ONE FORMATTER, FOUR CONSUMERS, AND THAT IS THE POINT. Schedule,
// EventDetail, the allocation grid and the calendar feed all render this. The
// feed is an EDGE FUNCTION that deploys separately from the bundle, so if the
// rule lived at each call site, drift there would stay invisible until a
// parent's subscribed calendar quietly disagreed with the app.
//
// ⚠️ NO LEAGUE TEAM MEANS NO LEAGUE DECORATION — UNLESS THE EVENT ITSELF SAYS
// IT IS A LEAGUE FIXTURE. The original rule ("null league team renders
// nothing") existed to keep a stale round off a friendly, and it still does:
// a friendly has no competition_type, so its leftover round stays invisible.
// But since 12 Aug 2026 the round hangs off competition_type, not off the
// league team, and a league fixture whose SIDE nobody has picked yet is a
// real state — Jay's 2026–27 placeholders (1 Sep 2026): the league publishes
// "Round 1, Saturday" months before it publishes who plays. Hiding the round
// there made a placeholder render as a bare squad name, indistinguishable
// from a friendly, which is a lie by omission. So: with no league team, the
// round shows exactly when the event is FILED as league — `U16B · Round 1`.
//
// The null-default lesson still applies and is why the gate is
// competition_type === 'league', never "round is present". This club has
// already paid for a loose null once: src/lib/ageGroup.js returned null for
// an unparseable squad name; `allowsOwnContact` read that null as "a senior
// side: adults"; and the app offered a twelve-year-old girls' squad the
// child's own email and phone fields. **The lesson recorded then was the
// null default, not the regex.**

/**
 * @param {{round?: number|null, competition_type?: string|null}|null|undefined} event
 * @param {{rcm_name: string, division?: string|null}|null|undefined} leagueTeam
 * @param {string} squadName  fallback when this is not a league fixture
 * @returns {string} e.g. "ADHQ2 · Div B · Round 4", or "U16B · Round 1" for a
 *   league placeholder with no side picked yet, or the squad name
 */
export function fixtureLabel(event, leagueTeam, squadName) {
  if (!leagueTeam) {
    if (event?.competition_type === 'league' && event?.round != null) {
      // A placeholder can be squad-less too (a club-wide oddity): "Round 1"
      // alone still beats an empty chip.
      return squadName ? `${squadName} · Round ${event.round}` : `Round ${event.round}`
    }
    return squadName
  }

  const parts = [leagueTeam.rcm_name]
  if (leagueTeam.division) parts.push(`Div ${leagueTeam.division}`)
  if (event?.round != null) parts.push(`Round ${event.round}`)

  return parts.join(' · ')
}
