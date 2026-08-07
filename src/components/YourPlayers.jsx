import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Card from './Card.jsx'
import PlayerAvatar from './PlayerAvatar.jsx'
import { listPlayers, listContactsForPlayers } from '../data/players.js'
import { listParentsForPlayers } from '../data/parents.js'
import { formatPhone } from '../lib/phone.js'

// "Your players" on the More screen: what the club actually holds about the
// child (or children) attached to this account.
//
// Jay, 6 Aug 2026: "we need people to see more than just privacy policy and
// delete your account in the more section, they should be able to see their
// info and any related player info too."
//
// ⚠️ THIS SHOWS. IT DOES NOT EDIT. A parent or player can already change the
// photo, the player's contact row and the parent rows — that self-service
// flow exists, is deliberately scoped so it cannot touch name, position, age
// group or captaincy, and is covered by tests/self-service.test.jsx.
// Rebuilding those forms here would mean two implementations of a write the
// database restricts on purpose, free to drift apart. So every row links to
// the existing screen instead.
//
// ⚠️ A MISSING CONTACT RENDERS NOTHING — NOT "hidden", NOT a lock icon.
// player_contacts is a separate table precisely so RLS can withhold it, and
// a note saying "contact details are hidden" would confirm to someone who
// cannot see the data that there is data to see. Same rule PlayerDetail
// already follows; see its header comment.

function Row({ label, value }) {
  if (!value) return null
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line py-2 last:border-b-0">
      <span className="text-[13px] font-semibold text-ink-muted">{label}</span>
      <span className="text-right text-[13.5px] font-bold text-ink">{value}</span>
    </div>
  )
}

export default function YourPlayers({ memberships = [], teams = [] }) {
  // The player ids this account is actually attached to. Not "every player in
  // a squad I can see" — a coach can see 30 players and none of them are
  // theirs. Only a membership row carrying a player_id makes a player yours.
  const playerIds = [...new Set(memberships.map((m) => m?.player_id).filter(Boolean))]
  const key = playerIds.join(',')

  const [players, setPlayers] = useState([])
  const [contacts, setContacts] = useState({})
  const [parents, setParents] = useState({})
  const [loaded, setLoaded] = useState(false)

  const teamIds = [...new Set(memberships.map((m) => m?.team_id).filter(Boolean))]
  const teamKey = teamIds.join(',')

  useEffect(() => {
    if (playerIds.length === 0) {
      setLoaded(true)
      return undefined
    }
    let active = true

    // Reuses the scoped list rather than adding a by-id query: the rows are
    // already reachable, and RLS decides either way.
    Promise.all([
      listPlayers({ teamIds }),
      listContactsForPlayers(playerIds),
      listParentsForPlayers(playerIds),
    ])
      .then(([allPlayers, contactRows, parentRows]) => {
        if (!active) return
        setPlayers((allPlayers ?? []).filter((p) => playerIds.includes(p.id)))
        setContacts(contactRows ?? {})
        setParents(parentRows ?? {})
      })
      .catch(() => {
        // Silent: this is a supplementary panel, not the reason the screen
        // exists. A failed read shows no players rather than an error card
        // sitting above the sign-out control.
        if (active) setPlayers([])
      })
      .finally(() => {
        if (active) setLoaded(true)
      })

    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, teamKey])

  // Nothing to say for a coach or an admin with no child at the club — and
  // an empty "Your players" card would imply something is missing.
  if (!loaded || playerIds.length === 0 || players.length === 0) return null

  return (
    <>
      {/* The heading lives INSIDE this component, not in More, so that a
          coach with no child at the club gets no orphaned "Your players"
          title sitting above nothing. */}
      <h3 className="mb-2.5 ml-0.5 mt-[18px] text-[13px] font-extrabold uppercase tracking-[.8px] text-ink-muted">
        {players.length === 1 ? 'Your player' : 'Your players'}
      </h3>
      {players.map((player) => {
        const team = teams.find((t) => t.id === player.team_id)
        const contact = contacts[player.id] ?? null
        const theirParents = parents[player.id] ?? []

        return (
          <Card key={player.id} className="mb-2.5 p-[14px]" data-testid="your-player">
            <div className="flex items-center gap-3">
              <PlayerAvatar
                player={player}
                size="sm"
                className="bg-[image:linear-gradient(135deg,theme(colors.brand.deep),theme(colors.brand.DEFAULT))] text-white"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-bold text-ink">{player.full_name}</p>
                <p className="text-[12.5px] font-semibold text-ink-muted">
                  {[team?.name, player.position].filter(Boolean).join(' · ') || 'No age group'}
                </p>
              </div>
            </div>

            <div className="mt-2.5">
              <Row label="Phone" value={contact?.phone ? formatPhone(contact.phone) : null} />
              <Row label="Email" value={contact?.email ?? null} />
              {theirParents.map((parent) => (
                <Row
                  key={parent.id}
                  label={parent.relationship || 'Parent'}
                  value={[parent.full_name, parent.phone ? formatPhone(parent.phone) : null]
                    .filter(Boolean)
                    .join(' · ')}
                />
              ))}
            </div>

            {/* Straight to the screen where editing already lives. */}
            <Link
              to="/roster"
              className="mt-3 flex items-center justify-center gap-2 rounded-btn border-[1.5px] border-line bg-surface-card px-4 py-2 text-[13px] font-bold text-brand transition hover:border-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
            >
              View or change these details
            </Link>
          </Card>
        )
      })}
    </>
  )
}
