// @vitest-environment node
// Nothing in this file touches the DOM, and a jsdom costs ~1.3s to build. The
// measurement and the rule are in vite.config.js.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fixtureLabel } from '../src/lib/fixtureLabel.js'

// Task 8 of claude/plans/2026-08-11-league-teams-implementation.md — the
// calendar feed names the league team.
//
// ⚠️ THIS IS A ROT DETECTOR, NOT A BEHAVIOUR TEST, AND THE DIFFERENCE MATTERS.
// supabase/functions/calendar/index.ts is a Deno function with Deno.serve() at
// module scope: importing it would start a server, so the suite cannot execute
// it and nothing here proves the feed WORKS. What it can do is fail when the
// app's format changes and the feed's does not — which is the failure mode the
// duplication actually has, and which no other check in this repo would catch.
//
// ⚠️ THE REAL VERIFICATION IS FETCHING THE DEPLOYED FEED and reading the
// .ics — including the content-type, because the SPA catch-all answers any
// unknown path with index.html and HTTP 200, so a 200 is not proof the feed
// exists. See claude/runbooks and the navigateFallbackDenylist note in
// state-of-play.md.

// ⚠️ Resolved from the project root, NOT from import.meta.url — Vitest's
// transform does not hand this file a `file:` URL and fileURLToPath throws.
const readFromRoot = (relative) => readFileSync(resolve(process.cwd(), relative), 'utf8')

const FEED = readFromRoot('supabase/functions/calendar/index.ts')
const MIGRATION = readFromRoot('db/migrations/20260812_calendar_feed_league_team.sql')

describe('the calendar feed reads the league columns', () => {
  it('⚠️ reads all three, or the migration that adds them is pointless', () => {
    // The feed's columns come from calendar_events_for_token()'s RETURNS TABLE,
    // not from that file. Adding them to the function without reading them here
    // is exactly as broken as reading them here without the migration — the
    // pitch was missing from the feed for a day in Aug 2026 for the mirror of
    // this reason.
    expect(FEED).toContain('league_team_name')
    expect(FEED).toContain('league_division')
    expect(FEED).toContain('round')
  })

  it('⚠️ LEFT JOINs in the migration, so a non-league fixture is not dropped', () => {
    // An inner join would silently drop every fixture that is NOT a league
    // match — most of them, and all training. The feed would go quiet with a
    // 200 and a valid .ics and nothing would error anywhere.
    expect(MIGRATION).toMatch(/left join public\.league_teams/i)
    expect(MIGRATION).not.toMatch(/\n\s*join public\.league_teams/i)
  })

  it('⚠️ RE-GRANTS execute to anon, which the DROP takes away', () => {
    // calendar_events_for_token is executable by anon deliberately: it IS the
    // feed, and the token is the gate. RETURNS TABLE cannot be changed in
    // place, so the migration has to drop the function — and a drop takes the
    // grants with it. Without the re-grant every subscribed parent's calendar
    // fails, with nothing in the app to say why.
    expect(MIGRATION).toMatch(/grant execute on function public\.calendar_events_for_token/i)
    expect(MIGRATION).toMatch(/to anon/i)
  })
})

describe('the feed and the app agree about what a league fixture is called', () => {
  // ⚠️ THE SEPARATOR AND BOTH WORDS ARE PINNED. If src/lib/fixtureLabel.js ever
  // renders "Division B" or "R4" or joins with a dash, these fail and point at
  // the feed — which is the one place that cannot follow automatically, because
  // it deploys separately from the bundle and can be a version behind for as
  // long as nobody notices.
  const label = fixtureLabel(
    { round: 4 },
    { rcm_name: 'ADHQ2', division: 'B' },
    'U14B Contact',
  )

  it('the app renders the format the feed hard-codes', () => {
    expect(label).toBe('ADHQ2 · Div B · Round 4')
  })

  it('and the feed hard-codes exactly those tokens', () => {
    expect(FEED).toContain('Div ${')
    expect(FEED).toContain('Round ${')
    expect(FEED).toContain("' · '")
  })

  it('⚠️ the feed drops a STALE round when there is no league team, like the app', () => {
    // The rule a later "improvement" is most likely to break with a
    // friendly-looking default, in both places at once. Since the 1 Sep 2026
    // placeholders the gate is competition_type, not the team: a friendly
    // (no competition_type) still renders nothing, whatever its round holds.
    expect(fixtureLabel({ round: 4 }, null, 'U14B Contact')).toBe('U14B Contact')
    expect(FEED).toMatch(/if \(!event\.league_team_name\) \{/)
    expect(FEED).toMatch(/event\.competition_type === 'league'/)
  })

  it('⚠️ and shows the round for a league PLACEHOLDER, like the app (1 Sep 2026)', () => {
    // A league round whose side is not picked yet is a real state; its one
    // known fact must reach a subscribed calendar. Both sides of the mirror:
    expect(fixtureLabel({ competition_type: 'league', round: 1 }, null, 'U16B Contact')).toBe(
      'U16B Contact · Round 1',
    )
    // …and the feed titles the placeholder by its round rather than inventing
    // "v TBC" (summaryFor) and pushes "Round N" into DESCRIPTION (leagueLabel).
    expect(FEED).toContain('· Round ${event.round}`')
    expect(FEED).toContain('return `Round ${event.round}`')
  })

  it('⚠️ the feed never reads home:null as Away (1 Sep 2026)', () => {
    // `home` is tri-state now — null means "not decided yet". A truthiness
    // read would print Away into every subscribed parent's calendar for a
    // placeholder, an invented fact. Both call sites are pinned.
    expect(FEED).toMatch(/typeof event\.home === 'boolean'/)
    expect(FEED).toMatch(/event\.home === false \? `\$\{opponent\} v \$\{squad\}`/)
  })

  it('⚠️ the feed falls back to the SQUAD name, never to nothing', () => {
    // Until the migration is applied these columns arrive undefined. A feed
    // that emitted "undefined v Dubai Exiles" into a subscribed calendar would
    // be worse than one that had never shipped.
    expect(FEED).toMatch(/event\.league_team_name \?\? event\.team_name \?\? 'Quins'/)
  })
})
