// Harness stub replacing src/data/players.js via a Vite alias. Same public
// shape (listPlayers, getPlayerContact) as the real module, but returns fixed
// fixtures instead of querying Supabase. Deliberately includes a captain (so
// the "Capt" badge renders), single-word / hyphenated / apostrophed / accented
// names (so the initials tile is exercised on every awkward case), long names
// and long positions (so row truncation/wrapping gets exercised at 375px),
// and enough rows across three teams that both the age-group and the position
// grouping have something to show. No jersey numbers: the club doesn't use
// them, so nothing in the UI reads that column.
//
// getPlayerContact returns a row for most players and null for one, so the
// two PlayerDetail contact states — full contact block, and the safeguarding
// "no row means render nothing" case — can both be screenshotted.

const T1 = 't1' // U12 Boys
const T2 = 't2' // U14 Boys
// Third age group, added for the independent controller-side verification
// pass: the age-group grouping needs more than two groups on screen to be
// judged fairly, and a third pill exercises the pill row's overflow at 375px.
const T3 = 't3' // U16 Boys

const P = (id, team_id, full_name, position, is_captain = false) => ({
  id,
  team_id,
  full_name,
  position,
  is_captain,
})

export const PLAYERS = [
  // U12 Boys — covers Forwards, Backs and Other.
  P('p1', T1, 'Aaron Whitfield', 'Prop'),
  P('p2', T1, 'Bilal Haddad', 'Hooker'),
  P('p3', T1, 'Charlie Nguyen-Fitzgerald', 'Lock'),
  P('p4', T1, 'Dhruv Ramachandran', 'Flanker', true),
  P('p5', T1, 'Eoin O’Sullivan', 'Number 8'),
  P('p6', T1, 'Faisal Al Mansoori', 'Scrum-half'),
  P('p7', T1, 'Gabriel Santos', 'Fly-half'),
  P('p8', T1, 'Harry Blythe', 'Centre'),
  P('p9', T1, 'Ibrahim Kaddoura', 'Wing'),
  P('p10', T1, 'Jack Mortimer', 'Fullback'),
  P('p11', T1, 'Kwame Osei-Bonsu', 'Utility'),
  P('p12', T1, 'Ronaldinho', 'Utility'), // single-word name -> "RO"

  // U14 Boys.
  P('p13', T2, 'Mateo Fernández', 'Prop'),
  P('p14', T2, 'Nathan Cole', 'Prop'),
  P('p15', T2, 'Omar Al Blooshi', 'Lock', true),
  P('p16', T2, 'Patrick Donnelly', 'Flanker'),
  P('p17', T2, 'Quentin Marchand', 'Scrum-half'),
  P('p18', T2, 'Rohan Chatterjee', 'Wing'),
  P('p19', T2, 'Samuel Adeyemi-Johnson', 'Centre'),
  P('p20', T2, 'Tariq Hussein', 'Utility'),

  // U16 Boys — third age group. Includes a captain, a numberless player, and
  // a deliberately long name/position pair to stress the 375px row.
  P('p21', T3, 'Alexander Vandenberg-Whitmore', 'Hooker'),
  P('p22', T3, 'Yusuf Abdurrahman', 'Lock'),
  P('p23', T3, 'Zane Kowalczyk', 'Number 8', true),
  P('p24', T3, 'Christopher Oyelaran', 'Fly-half'),
  P('p25', T3, 'Devan Sivaraman', 'Wing'),
  P('p26', T3, 'Emre Yıldırım', 'Utility back / hooker cover'),
]

// Independent Task 16 verification addition: ?playersDelay=<ms> widens the
// window between a prop change (e.g. Schedule swapping which event's
// Availability sheet is open) and the roster fetch actually resolving, so a
// stale-state flash between two different events/teams is screenshot-able
// instead of resolving too fast for Playwright to ever observe it.
const PLAYERS_DELAY = Number(new URLSearchParams(window.location.search).get('playersDelay') || 0)

export async function listPlayers({ teamIds } = {}) {
  if (PLAYERS_DELAY > 0) {
    await new Promise((resolve) => setTimeout(resolve, PLAYERS_DELAY))
  }
  if (Array.isArray(teamIds) && teamIds.length === 0) return []
  const rows =
    Array.isArray(teamIds) && teamIds.length > 0
      ? PLAYERS.filter((player) => teamIds.includes(player.team_id))
      : PLAYERS
  return [...rows].sort((a, b) => a.full_name.localeCompare(b.full_name))
}

// Real Supabase latency (UAE -> ap-northeast-1 Tokyo) is a few hundred ms;
// the stub resolving on a microtask hides whatever the loading leg renders.
// ?contactDelay=<ms> makes that leg screenshot-able — which is how the
// "contact block announces itself and then collapses" defect was confirmed
// fixed rather than only asserted in jsdom.
const CONTACT_DELAY = Number(new URLSearchParams(window.location.search).get('contactDelay') || 0)

// Independent verification addition: ?contactThrow=1 makes the contact READ
// reject (not resolve null). Different failure from contactFail (which
// rejects the WRITE), and the only one that could destroy data.
const CONTACT_THROW = new URLSearchParams(window.location.search).get('contactThrow') === '1'

export async function getPlayerContact(playerId) {
  window.__reads = window.__reads || []
  window.__reads.push({ table: 'player_contacts', playerId })
  if (CONTACT_DELAY > 0) {
    await new Promise((resolve) => setTimeout(resolve, CONTACT_DELAY))
  }
  if (CONTACT_THROW) throw new Error('permission denied for table player_contacts')
  // p4 stands in for the RLS-withheld case: a parent asking about a player
  // they aren't linked to gets no row back, and the sheet must show nothing
  // at all about contact details.
  if (playerId === 'p4') return null
  return {
    player_id: playerId,
    phone: '+971 50 200 1000',
    email: `${playerId}.guardian@example.com`,
  }
}

// Harness addition for Task 5 (Overview screen verification): the real
// src/data/players.js's listContactsForPlayers, which bulk-fetches contact
// rows for many players at once. Mirrors getPlayerContact's own fixture
// rule above (a row for everyone except p4, the deliberate "no contact on
// file" case) rather than inventing new fixture data, so Overview's roster-
// gap count for p4's team reflects the same "missing contact info" case the
// PlayerDetail sheet already exercises.
export async function listContactsForPlayers(playerIds) {
  if (!Array.isArray(playerIds) || playerIds.length === 0) return []
  return playerIds
    .filter((id) => id !== 'p4')
    .map((id) => ({
      player_id: id,
      phone: '+971 50 200 1000',
      email: `${id}.guardian@example.com`,
    }))
}

// Task 15 writes. No network and no Supabase: each call records its payload
// on window so the browser check can assert what the form ACTUALLY built —
// in particular that the player write and the contact write are two separate
// statements, and that a blank-both contact is skipped rather than written as
// an empty row. ?contactFail=1 makes the contact write reject, so the
// partial-failure path (player saved, contact not) is screenshot-able.
const CONTACT_FAIL = new URLSearchParams(window.location.search).get('contactFail') === '1'

export async function upsertPlayer(player) {
  window.__writes = window.__writes || []
  window.__writes.push({ op: player?.id ? 'update' : 'insert', table: 'players', payload: player })
  return { id: player?.id ?? 'p-new', ...player }
}

export async function deletePlayer(id) {
  window.__writes = window.__writes || []
  window.__writes.push({ op: 'delete', table: 'players', id })
}

// Harness gap found (and fixed) while verifying Task 5: src/screens/
// PlayerImport.jsx imports insertPlayers from src/data/players.js, and
// Roster.jsx imports PlayerImport.jsx, so main.jsx's static import of
// Roster.jsx pulls this into every scenario's module graph — not just
// PlayerImport's own. Vite/ESM resolves named exports eagerly, so a missing
// export here broke every scenario in this file (verified: even
// ?scenario=roster threw the same "does not provide an export named
// 'insertPlayers'" pageerror before this was added), not just the new
// overview-admin/overview-coach ones. Mirrors upsertPlayer's write-recording
// shape above; no scenario currently drives PlayerImport's bulk-add flow, so
// this only needs to satisfy the import, not simulate a real bulk insert.
export async function insertPlayers(rows) {
  window.__writes = window.__writes || []
  window.__writes.push({ op: 'insert', table: 'players', payload: rows })
  return (rows ?? []).map((row, i) => ({ id: `p-new-${i}`, ...row }))
}

export async function upsertContact(contact) {
  window.__writes = window.__writes || []
  window.__writes.push({ op: 'upsert', table: 'player_contacts', payload: contact })
  if (CONTACT_FAIL) {
    throw new Error("We couldn't save the contact details. You may not have permission to change them.")
  }
  return { ...contact }
}
