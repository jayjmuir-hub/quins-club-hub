import { useEffect, useMemo, useState } from 'react'
import Card from '../components/Card.jsx'
import Spinner from '../components/Spinner.jsx'
import { listPlayers } from '../data/players.js'
import { listAppearances } from '../data/appearances.js'
import { leaverName } from '../lib/leavers.js'
import { useMemberships } from '../lib/memberships.jsx'
import { canEditTeam, visibleTeams } from '../lib/scope.js'
import { friendlyMessage } from '../lib/friendlyError.js'

// "Who hasn't had a chance to play?" — phase 1 of
// claude/plans/2026-08-14-tiers-and-game-time.md. Jay, 14 Aug 2026:
// "tracking which players haven't had a chance to play in matches or
// tournaments".
//
// ⚠️ ORDERED FEWEST-FIRST, AND THAT IS THE WHOLE FEATURE. A roster sorted
// alphabetically answers "who is in this squad", which the Roster screen already
// does. The only question this screen exists for is "who am I overlooking", and
// the answer has to be the first thing on it — not something a coach finds by
// reading to the bottom.
//
// ⚠️ COACH-ONLY. `lineup_players` is gated by private.can_edit_team, so a parent
// reads zero rows and would see every player on nought. The squad picker below
// only offers squads this person can edit, so that state is unreachable rather
// than merely unlikely.

/** Fewest appearances first; ties broken by name so the order is stable. */
function byNeed(a, b) {
  if (a.total !== b.total) return a.total - b.total
  if (a.starts !== b.starts) return a.starts - b.starts
  return a.player.full_name.localeCompare(b.player.full_name)
}

export default function GameTime() {
  const { memberships, teams } = useMemberships()

  // Only squads this person may actually edit — see the header. visibleTeams
  // hands an admin the whole club, so canEditTeam narrows it the same way the
  // event form does.
  const editable = useMemo(
    () => visibleTeams(memberships, teams).filter((team) => canEditTeam(memberships, team.id)),
    [memberships, teams],
  )

  // ⚠️ REMEMBERED, like the roster's filter (2 Sep 2026 UX review, Low):
  // a reload used to snap back to the first squad. Same key discipline as
  // Roster — read once, written on change, a missing store is a session.
  const [teamId, setTeamIdState] = useState(() => {
    try {
      return window.localStorage.getItem('game-time:team') || null
    } catch {
      return null
    }
  })
  const setTeamId = (next) => {
    setTeamIdState(next)
    try {
      if (next) window.localStorage.setItem('game-time:team', next)
      else window.localStorage.removeItem('game-time:team')
    } catch {
      // Private mode: the choice lasts the session.
    }
  }
  const chosen = editable.some((team) => team.id === teamId) ? teamId : editable[0]?.id ?? null

  const [players, setPlayers] = useState([])
  const [counts, setCounts] = useState(() => new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!chosen) {
      setLoading(false)
      return undefined
    }
    let mounted = true
    setLoading(true)
    setError(null)
    // includeLeft: a past appearance must still name the child who has since
    // left. Spec §4.
    Promise.all([
      listPlayers({ teamIds: [chosen], includeLeft: true }),
      listAppearances({ teamId: chosen }),
    ])
      .then(([playerRows, appearances]) => {
        if (!mounted) return
        setPlayers(playerRows)
        setCounts(appearances)
      })
      .catch((failure) => {
        if (mounted) setError(failure)
      })
      .finally(() => {
        if (mounted) setLoading(false)
      })
    return () => {
      mounted = false
    }
  }, [chosen])

  const rows = useMemo(
    () =>
      players
        .map((player) => ({
          player,
          ...(counts.get(player.id) ?? { starts: 0, bench: 0, total: 0 }),
        }))
        .sort(byNeed),
    [players, counts],
  )

  const neverPicked = rows.filter((row) => row.total === 0)

  if (editable.length === 0) {
    return (
      <section>
        <h2 className="mb-3.5 mt-1 font-display text-[24px] font-extrabold tracking-[-0.02em] text-ink desktop:text-[26px]">
          Game time
        </h2>
        <Card className="p-6">
          <p role="alert" className="text-sm text-ink">
            You don&apos;t have a squad you can pick teams for, so there&apos;s no game time to
            show. Ask a club admin if that looks wrong.
          </p>
        </Card>
      </section>
    )
  }

  return (
    <section>
      <div className="mb-3.5 mt-1 flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="font-display text-[24px] font-extrabold tracking-[-0.02em] text-ink desktop:text-[26px]">Game time</h2>
      </div>

      {/* ⚠️ A PLAIN SELECT, NOT <TeamFilter>. That component always offers an
          "All age groups" option, and an all-squads view is meaningless here —
          it would rank a U10 against a U18 by appearance count. Fighting the
          component to suppress its own option would be worse than not using it. */}
      <label className="block">
        <span className="mb-1.5 block text-[12.5px] font-bold uppercase tracking-[.4px] text-ink-muted">
          Age group
        </span>
        <select
          value={chosen ?? ''}
          onChange={(domEvent) => setTeamId(domEvent.target.value)}
          className="w-full rounded-[11px] border-[1.5px] border-line bg-surface-card px-3 py-2.5 text-[16px] text-ink outline-none focus:border-brand"
        >
          {editable.map((team) => (
            <option key={team.id} value={team.id}>
              {team.name}
            </option>
          ))}
        </select>
      </label>

      {/* ⚠️ SAID ON SCREEN, NOT ONLY IN THE CODE. Team sheets are days old, so a
          0 here means "not picked since the club started using them", NOT "has
          never played for the club". A bare zero beside a long-serving player is
          a lie of omission, and a coach acting on it would be acting on nothing. */}
      <p className="mb-3 mt-3 rounded-[11px] bg-surface-mute px-3 py-2.5 text-[12.5px] leading-relaxed text-ink-muted">
        Counted from team sheets, so this only goes back to when the club started
        picking teams in the app. A player on 0 has not been picked <em>since then</em>.
      </p>

      {error && (
        <p
          role="alert"
          className="mb-3 rounded-[11px] bg-danger-bg px-3 py-2.5 text-sm font-semibold text-danger-ink"
        >
          {friendlyMessage(error, "We couldn't load game time. Try again.")}
        </p>
      )}

      {loading ? (
        <Card className="flex justify-center py-10">
          <Spinner label="Counting appearances…" />
        </Card>
      ) : rows.length === 0 ? (
        <Card className="p-6">
          <p className="text-[13px] text-ink-muted">There are no players in this squad yet.</p>
        </Card>
      ) : (
        <>
          {neverPicked.length > 0 && (
            <p className="mb-2 text-[13px] font-bold text-warn-ink">
              {neverPicked.length === 1
                ? '1 player has not been picked at all'
                : `${neverPicked.length} players have not been picked at all`}
            </p>
          )}
          <Card className="overflow-hidden">
            <ul>
              {rows.map((row) => (
                <li
                  key={row.player.id}
                  className="flex items-center gap-3 border-b border-line px-[14px] py-2.5 last:border-b-0"
                >
                  <span className="min-w-0 flex-1 truncate text-[14.5px] font-bold text-ink">
                    {leaverName(row.player)}
                  </span>
                  {/* Starts and bench separately, because "always a replacement"
                      is a different problem from "never picked" and the total
                      alone hides it. */}
                  <span className="shrink-0 text-[12.5px] text-ink-muted">
                    {row.starts} start{row.starts === 1 ? '' : 's'} · {row.bench} bench
                  </span>
                  <span
                    className={`w-8 shrink-0 text-right text-[15px] font-extrabold ${
                      row.total === 0 ? 'text-warn-ink' : 'text-ink'
                    }`}
                  >
                    {row.total}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}
    </section>
  )
}
