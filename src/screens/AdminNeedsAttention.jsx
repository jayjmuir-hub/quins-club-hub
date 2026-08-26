import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Card from '../components/Card.jsx'
import Empty from '../components/Empty.jsx'
import Spinner from '../components/Spinner.jsx'
import { listPlayers, listPlayerPrivatePresence } from '../data/players.js'
import { listParentsForPlayers } from '../data/parents.js'
import { missingForPlayer } from '../lib/completeness.js'
import { useMemberships } from '../lib/memberships.jsx'
import FeedbackTriage from '../components/FeedbackTriage.jsx'

// /admin/needs-attention — the THIRD and last surface of the completeness rule
// (item 6 of claude/plans/2026-08-16-account-creation-redesign.md).
//
// The other two ask the person who can fix it, at the moment they are already
// looking: a card on the family's own screen, and a line on the approval queue.
// This one answers the club's question instead — "where are we actually
// missing things?" — which is the one a registrar opens deliberately.
//
// ⚠️ IT READS THE SAME RULE, IT DOES NOT RESTATE IT. src/lib/completeness.js is
// the single home for what counts as a gap, and the measurement that decided
// that list lives in its header. A second opinion here would be a second answer,
// and the wrong one would be the one nobody tested.
//
// ⚠️ IT CHASES NOBODY BY ITSELF, AND MUST NOT GROW A "REMIND THEM" BUTTON
// WITHOUT A DECISION. Every gap listed here is already being asked for on the
// family's own screen, once, quietly. A second channel that mails people about
// the same thing is how a club teaches its members to ignore both.
//
// ══ ⚠️ THE PRIVACY SHAPE OF THIS SCREEN ══════════════════════════════════
//
// It sweeps every child in the club, which is exactly the read the approval
// queue deliberately does NOT do (see the `pendingPlayerIds` note in
// Accounts.jsx — widening that one would pull the club's birthdays into a
// browser to answer a question about a handful of cards). Here the sweep IS the
// question, so instead the DATA is narrowed:
//
//   - birthdays: `listPlayerPrivatePresence` returns ids only. Not one date of
//     birth is fetched, because the question is whether a row exists.
//   - parents:   `listParentsForPlayers` already selects no email and no phone.
//
// ⚠️ SO NOTHING ON THIS SCREEN IS A CONTACT DETAIL, and that is a property to
// keep. The next person to add "and their phone number, so I can ring them"
// turns a gap report into a club-wide contact export.

// A squad with nothing missing is not listed. ⚠️ THE EMPTY SCREEN IS THE GOAL,
// and it has to be reachable — a list that always has rows is a list nobody
// finishes, which is the same contract the family's card is built on.
function SquadBlock({ squad }) {
  return (
    <div data-testid="attention-squad" className="border-b border-line last:border-0">
      <div className="flex items-baseline justify-between gap-3 bg-surface-mute px-4 py-2">
        <h4 className="text-[13px] font-extrabold text-ink">{squad.name}</h4>
        <span className="text-[12.5px] text-ink-muted">
          {squad.players.length} of {squad.total}
        </span>
      </div>
      <ul>
        {squad.players.map((entry) => (
          <li
            key={entry.player.id}
            data-testid="attention-player"
            className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-2.5"
          >
            {/* A door, not just a label (26 Aug 2026 — Jay: "i can't click on
                those names… why not?"). /roster?open= lands on the player's
                detail sheet, where the DOB and parents actually get edited.
                Navigation only: this screen still fetches no contact detail —
                the privacy note at the top keeps holding. */}
            <Link
              to={`/roster?open=${entry.player.id}`}
              className="text-sm font-bold text-ink underline-offset-2 hover:underline"
            >
              {entry.player.full_name || 'Unnamed player'}
            </Link>
            {/* ⚠️ THE GAP IDS, NOT THE FAMILY-FACING SENTENCES. completeness.js
                writes its labels in the parent's own words — "we don't have a
                birthday for Ada" — and its header says the admin surface should
                re-word from `id`. Repeating a plea addressed to somebody else,
                on a management screen, reads as the app talking to the wrong
                person. */}
            {entry.gaps.map((item) => (
              <span
                key={item.id}
                data-testid="attention-gap"
                className="rounded-full bg-surface-mute px-2 py-0.5 text-[12px] font-bold text-ink-muted"
              >
                {ADMIN_WORDS[item.id] ?? item.id}
              </span>
            ))}
          </li>
        ))}
      </ul>
    </div>
  )
}

// The same gaps, said to the person who manages the club rather than to the
// family. One home, keyed by the ids completeness.js already exports.
// Stands in for a date of birth this screen deliberately never fetches. See
// where it is used, and listPlayerPrivatePresence.
const ON_FILE = 'on file'

const ADMIN_WORDS = {
  dob: 'No date of birth',
  parent: 'No parent on file',
  gender: 'No gender',
}

export default function AdminNeedsAttention() {
  const { teams } = useMemberships()
  const [squads, setSquads] = useState(null)
  const [error, setError] = useState(null)

  const teamsById = useMemo(() => {
    const map = new Map()
    for (const team of teams ?? []) map.set(team.id, team)
    return map
  }, [teams])

  const load = useCallback(async () => {
    setError(null)
    try {
      const players = await listPlayers()
      const ids = players.map((player) => player.id)
      // ⚠️ PRESENCE, NOT DATES. See the header, and this reader's own.
      const [withDob, parentRows] = await Promise.all([
        listPlayerPrivatePresence(ids),
        listParentsForPlayers(ids),
      ])

      const parentCounts = new Map()
      for (const row of parentRows ?? []) {
        parentCounts.set(row.player_id, (parentCounts.get(row.player_id) ?? 0) + 1)
      }

      const bySquad = new Map()
      for (const player of players) {
        const team = player.team_id ? teamsById.get(player.team_id) ?? null : null
        const gaps = missingForPlayer({
          player,
          team,
          // ⚠️ `null`, NEVER `undefined`, AND THE DIFFERENCE IS THE WHOLE RULE.
          // An admin's read is authoritative: they are entitled to every child's
          // private row, so a child absent from the set genuinely has no
          // birthday on file. `undefined` would mean "we did not look" and this
          // screen would report nothing at all — silently, and looking healthy.
          //
          // ⚠️ AND `ON_FILE` IS A SENTINEL, NOT A DATE, BECAUSE THIS SCREEN
          // NEVER LEARNS ONE. completeness.js only asks whether the value is
          // null, so the presence set answers it in full — and the moment
          // somebody needs the real date here, the reader has to change and the
          // privacy note at the top of this file has to be re-argued rather than
          // quietly bypassed.
          dateOfBirth: withDob.has(player.id) ? ON_FILE : null,
          parentCount: parentCounts.get(player.id) ?? 0,
        })

        // ⚠️ COUNTED WHETHER OR NOT IT HAS GAPS — the denominator is what makes
        // "4 of 22" mean something. A squad block showing only the incomplete
        // rows and no total says how much work there is and not how bad it is.
        const key = team?.id ?? 'none'
        const bucket = bySquad.get(key) ?? {
          id: key,
          name: team?.name ?? 'No squad',
          sort: team?.sort_order ?? Number.MAX_SAFE_INTEGER,
          total: 0,
          players: [],
        }
        bucket.total += 1
        if (gaps.length > 0) bucket.players.push({ player, gaps })
        bySquad.set(key, bucket)
      }

      setSquads(
        [...bySquad.values()]
          .filter((squad) => squad.players.length > 0)
          .sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name)),
      )
    } catch (err) {
      setError(err.message)
    }
  }, [teamsById])

  useEffect(() => {
    load()
  }, [load])

  if (error) {
    return (
      <Card className="p-4">
        <p role="alert" className="text-sm text-ink">
          {error}
        </p>
        <button type="button" onClick={load} className="mt-2 text-sm font-bold text-brand-ink underline">
          Try again
        </button>
      </Card>
    )
  }

  if (!squads) return <Spinner />

  const players = squads.reduce((n, squad) => n + squad.players.length, 0)

  return (
    <div>
      {/* ⚠️ ABOVE the completeness list, and that ordering is the argument.
          A missing date of birth is a slow, known gap that the family is
          already being asked about. A report is somebody saying the app is
          wrong RIGHT NOW, and it is the only item on this screen with a person
          waiting at the other end of it. */}
      <FeedbackTriage />

      <h3 className="mb-1 text-base font-extrabold text-ink">Records needing attention</h3>

      {/* ⚠️ SAYS WHO IS ALREADY BEING ASKED, because the useful next action is
          usually NOTHING. Every gap here is on the family's own screen too, and
          a registrar who does not know that will ring people the app is already
          politely asking. */}
      <p className="mb-3 text-sm text-ink-muted" data-testid="attention-summary">
        {players === 0
          ? 'Nothing missing.'
          : `${players} ${players === 1 ? 'player has' : 'players have'} something missing, across ${squads.length} ${squads.length === 1 ? 'squad' : 'squads'}. Each family is already being asked on their own screen.`}
      </p>

      {squads.length === 0 ? (
        <Empty message="Every player has a date of birth, a parent on file, and a gender where their squad needs one." />
      ) : (
        <Card className="overflow-hidden">
          {squads.map((squad) => (
            <SquadBlock key={squad.id} squad={squad} />
          ))}
        </Card>
      )}

      {/* ⚠️ POSITION IS NOT HERE, AND THAT IS NOT AN OVERSIGHT. 23 of 26 players
          have none; it is a coach's judgement rather than a record to chase, and
          listing it would bury the three things somebody can actually act on.
          The measurement is in src/lib/completeness.js's header. */}
    </div>
  )
}
