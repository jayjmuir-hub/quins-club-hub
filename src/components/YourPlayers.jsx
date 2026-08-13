import { useEffect, useState } from 'react'
import Card from './Card.jsx'
import PlayerAvatar from './PlayerAvatar.jsx'
import PlayerRegistrationForm from './PlayerRegistrationForm.jsx'
import Sheet from './Sheet.jsx'
import MyPlayerForm from '../screens/MyPlayerForm.jsx'
import { listPlayers, listContactsForPlayers } from '../data/players.js'
import { listParentsForPlayers } from '../data/parents.js'
import { formatPhone } from '../lib/phone.js'
import Button from './Button.jsx'

// "Your players" on the More screen: what the club actually holds about the
// child (or children) attached to this account — and, since 13 Aug 2026, the
// only parent-facing way to add another one.
//
// Jay, 6 Aug 2026: "we need people to see more than just privacy policy and
// delete your account in the more section, they should be able to see their
// info and any related player info too."
//
// ⚠️ THIS SHOWS. IT DOES NOT EDIT — and that is still true of the CHILD's
// details. Editing opens MyPlayerForm, the SAME component the roster opens,
// rather than a second set of fields living here. Two implementations of a
// write the database restricts on purpose would be free to drift apart, and the
// one nobody is looking at would be the one that drifted. The add-a-player
// sheet below follows the identical rule: it is the same
// PlayerRegistrationForm the sign-up screen renders.
//
// ⚠️ CHANGED 9 Aug 2026 (Jay): this used to be `<Link to="/roster">`. It
// dumped a parent on the squad list with no player id and no state, and they
// then had to find their own child and click through two more steps to reach
// the form they had already asked for. The button now opens MyPlayerForm in
// place. It is the identical component with identical props — Roster passes
// `{ player, team, onClose, onSaved }` and so does this — so there is no
// second code path to keep in step, only a second place it can be opened
// from.
//
// ⚠️ A component importing a SCREEN inverts this repo's directory convention,
// and that is a deliberate call rather than an oversight. MyPlayerForm renders
// its own Sheet and loads its own contact and parent rows; it depends on
// nothing in Roster. Moving it to src/components/ would be the tidier fix and
// would touch Roster, PlayerDetail and four test files for no behaviour
// change, so it is left where it is and named here instead.
//
// ⚠️ A MISSING CONTACT RENDERS NOTHING — NOT "hidden", NOT a lock icon.
// player_contacts is a separate table precisely so RLS can withhold it, and
// a note saying "contact details are hidden" would confirm to someone who
// cannot see the data that there is data to see. Same rule PlayerDetail
// already follows; see its header comment.

// Group rows that carry a player_id into { [playerId]: rows }. Tolerates a
// map being passed in as well, so a future data-layer change to either
// function cannot silently blank this panel again.
function byPlayer(rows) {
  if (!rows) return {}
  if (!Array.isArray(rows)) return rows
  return rows.reduce((acc, row) => {
    if (!row?.player_id) return acc
    ;(acc[row.player_id] ||= []).push(row)
    return acc
  }, {})
}

function Row({ label, value }) {
  if (!value) return null
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line py-2 last:border-b-0">
      <span className="text-[13px] font-semibold text-ink-muted">{label}</span>
      <span className="text-right text-[13.5px] font-bold text-ink">{value}</span>
    </div>
  )
}

// ⚠️ WHO COUNTS AS SOMEBODY WHO MAY ADD A CHILD. Roles, not linked players —
// and the difference is a reported bug rather than a nicety. A membership
// granted by hand by an admin has `player_id = null`, so the list below is
// empty for that person; gating the add button on the list would keep it hidden
// from exactly the parent who has no child attached yet. It also catches a
// coach who is a parent too, whose coach rows say nothing about their own
// family.
//
// A coach or admin with no parent/player row sees none of this, which is
// correct: an empty "Your players" card would imply something is missing.
function canAddPlayers(memberships) {
  return memberships.some((m) => m?.role === 'parent' || m?.role === 'player')
}

export default function YourPlayers({ memberships = [], teams = [], reload }) {
  // The player ids this account is actually attached to. Not "every player in
  // a squad I can see" — a coach can see 30 players and none of them are
  // theirs. Only a membership row carrying a player_id makes a player yours.
  const playerIds = [...new Set(memberships.map((m) => m?.player_id).filter(Boolean))]
  const key = playerIds.join(',')

  const [players, setPlayers] = useState([])
  const [contacts, setContacts] = useState({})
  const [parents, setParents] = useState({})
  const [loaded, setLoaded] = useState(false)
  // The player whose form is open, or null. Holds the ROW, not an id: the
  // form needs the whole player and this component already has it.
  const [editing, setEditing] = useState(null)
  // Whether the add-a-player sheet is open. Separate from `editing` because
  // they are different forms about different things, and one flag holding two
  // meanings is how a screen ends up opening the wrong one.
  const [adding, setAdding] = useState(false)
  // ⚠️ Bumped after a save so the effect below re-runs. Without it the panel
  // still shows the phone number the parent just changed, because the effect
  // is keyed only on which players and squads exist — neither of which a save
  // alters. The panel would look like it had ignored them.
  const [reloadToken, setReloadToken] = useState(0)

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
        // ⚠️ BOTH OF THESE RETURN ARRAYS, NOT MAPS. Shipped once assuming
        // `contacts[playerId]`, which on an array is silently `undefined` —
        // so the contact and parent rows rendered as nothing at all, in
        // production, while every test passed. The tests passed BECAUSE the
        // mocks returned the map shape I had assumed rather than the array
        // the real function returns. Mock the shape the code under test
        // actually receives.
        setContacts(byPlayer(contactRows))
        setParents(byPlayer(parentRows))
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
  }, [key, teamKey, reloadToken])

  // ⚠️ THE GATE IS THE ROLE, NOT THE LIST. See canAddPlayers above — this used
  // to be `playerIds.length === 0 || players.length === 0`, which is what hid
  // the panel from a hand-granted parent entirely.
  const mayAdd = canAddPlayers(memberships)
  if (!loaded || (players.length === 0 && !mayAdd)) return null

  // Which membership belongs to which child, so a card can say whether that
  // particular child is still waiting. ⚠️ Deliberately NOT isPendingOnly: that
  // helper answers "does this account have any access at all", which is a
  // different question and is what the big banner in AppShell is for. A parent
  // with one approved child and one waiting is a fully working member who needs
  // to know about one row, not a banner across their whole app.
  const statusByPlayer = new Map(
    memberships.filter((m) => m?.player_id).map((m) => [m.player_id, m.status]),
  )

  async function handleAdded() {
    setAdding(false)
    // Both halves are needed. The provider reload is what puts the new
    // membership into `memberships` — nothing pushes it there — and the token
    // bump is what re-runs the effect above so the new child's row is fetched.
    await reload?.()
    setReloadToken((n) => n + 1)
  }

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
        // player_contacts is one row per player, so take the first.
        const contact = (contacts[player.id] ?? [])[0] ?? null
        const theirParents = parents[player.id] ?? []
        const pending = statusByPlayer.get(player.id) === 'pending'

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
              {/* ⚠️ PER CHILD, NOT PER ACCOUNT. This is where a parent looks to
                  ask "did that work?" after adding a second child, and it is
                  the only place that can answer for one child without making a
                  claim about the others. Three children, three independent
                  states, three chips. */}
              {pending && (
                <span
                  data-testid="player-pending"
                  className="shrink-0 rounded-tab bg-warn-bg px-[9px] py-[3px] text-[11.5px] font-bold text-warn-ink"
                >
                  Waiting for approval
                </span>
              )}
            </div>

            <div className="mt-2.5">
              <Row label="Phone" value={contact?.phone ? formatPhone(contact.phone) : null} />
              <Row label="Email" value={contact?.email ?? null} />
              {/* ⚠️ NAME ONLY, NO PHONE. listParentsForPlayers selects
                  id/player_id/full_name/relationship/is_primary — it does NOT
                  return phone or email. Rendering parent.phone here printed
                  nothing and looked like a missing value rather than a field
                  that was never fetched. Widening that shared query to feed
                  this panel would pull more contact data into every caller
                  that uses it, so the panel shows what the query returns. */}
              {theirParents.map((parent) => (
                <Row
                  key={parent.id}
                  label={parent.relationship || 'Parent'}
                  value={parent.full_name}
                />
              ))}
            </div>

            {/* Opens the same form the roster opens, for THIS player, here. */}
            <Button
              variant="secondary"
              size="sm"
              full
              onClick={() => setEditing(player)}
              className="mt-3"
            >
              View or change these details
            </Button>
          </Card>
        )
      })}

      {/* ⚠️ THE WHOLE POINT OF THE 13 AUG 2026 CHANGE, and it renders even when
          the list above is empty — see canAddPlayers. Before this, self-
          registration was reachable only while an account had ZERO memberships,
          so a parent's second child could be added by nobody but an admin, on a
          desktop-only screen. The database never had that restriction. */}
      {mayAdd && (
        <Card className="mb-2.5 p-[14px]">
          <p className="text-[13px] leading-relaxed text-ink-muted">
            {players.length === 0
              ? 'Add your child and the club will connect you to their squad.'
              : 'Got another child at the club? Add them to this account — you don’t need a second login.'}
          </p>
          <Button
            variant="secondary"
            size="sm"
            full
            onClick={() => setAdding(true)}
            className="mt-3"
            data-testid="add-another-player"
          >
            {players.length === 0 ? 'Add your player' : 'Add another player'}
          </Button>
        </Card>
      )}

      {adding && (
        <Sheet open onClose={() => setAdding(false)} title="Add a player">
          <p className="text-sm leading-relaxed text-ink-faint">
            A coach or admin checks every new player, so they&apos;ll show as waiting
            for approval until someone has looked. That usually takes a day or two.
          </p>
          <PlayerRegistrationForm
            teams={teams}
            onDone={handleAdded}
            submitLabel="Add this player"
          />
        </Sheet>
      )}

      {/* ⚠️ ONE sheet for the whole list, outside the map. Rendering it inside
          would mount a MyPlayerForm per player — each running its own contact
          and parent queries on mount — for a panel where at most one can be
          open. The team is looked up the same way the card above does it;
          MyPlayerForm needs it to decide whether the player may hold their own
          contact details (the U13 rule) and whether a gender is required. */}
      {editing && (
        <MyPlayerForm
          player={editing}
          team={teams.find((t) => t.id === editing.team_id)}
          onClose={() => setEditing(null)}
          onSaved={() => setReloadToken((n) => n + 1)}
        />
      )}
    </>
  )
}
