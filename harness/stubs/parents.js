// Harness stub for src/data/parents.js — see harness/vite.config.js. Gives
// the first stub player a realistic two-parent household so the detail
// sheet's Parents block can actually be looked at in a browser.
const ROWS = {
  p1: [
    {
      id: 'pp-1',
      player_id: 'p1',
      full_name: 'Sara Fletcher',
      relationship: 'Mother',
      email: 'sara.fletcher@example.com',
      phone: '+971502001000',
      is_primary: true,
      sort_order: 0,
    },
    {
      id: 'pp-2',
      player_id: 'p1',
      full_name: 'Mark Fletcher',
      relationship: 'Step-father',
      email: 'mark.fletcher@example.com',
      phone: '+971559887766',
      is_primary: false,
      sort_order: 1,
    },
  ],
}

export async function listParents(playerId) {
  return ROWS[playerId] ?? []
}

export async function saveParents() {
  return []
}

export async function deleteParent() {}

export async function listParentsForPlayers(playerIds = []) {
  return Object.fromEntries(playerIds.map((id) => [id, ROWS[id] ?? []]))
}
