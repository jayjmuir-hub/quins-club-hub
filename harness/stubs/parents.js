// Harness stub for src/data/parents.js — see harness/vite.config.js. Gives
// the first stub player a realistic two-parent household so the detail
// sheet's Parents block can actually be looked at in a browser.
const ROWS = {
  p1: [
    {
      id: 'pp-1',
      player_id: 'p1',
      // The split columns as well as full_name, because the real table carries
      // all three (private.sync_person_name keeps them in step) and the editor
      // binds to the split pair. A stub with only full_name renders two empty
      // name boxes in the harness, which looks like a bug in the form.
      full_name: 'Sara Fletcher',
      first_name: 'Sara',
      last_name: 'Fletcher',
      relationship: 'Mother',
      email: 'sara.fletcher@example.com',
      phone: '+971502001000',
      is_primary: true,
      sort_order: 0,
      // Never invited: the Invite button's first state is the one worth seeing.
      invited_at: null,
    },
    {
      id: 'pp-2',
      player_id: 'p1',
      full_name: 'Mark Fletcher',
      first_name: 'Mark',
      last_name: 'Fletcher',
      relationship: 'Step-father',
      email: 'mark.fletcher@example.com',
      phone: '+971559887766',
      is_primary: false,
      sort_order: 1,
      invited_at: '2026-08-16T09:00:00Z',
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

/**
 * ⚠️ ZERO, NOT A NUMBER THAT LOOKS BUSY. The harness has no auth, so nothing
 * matches an address; returning a count would make the provider look as though
 * it had linked rows that are still unlinked on screen.
 */
export async function linkMyParentRows() {
  return 0
}

/**
 * ⚠️ NO NETWORK, AND NO REAL TOKEN. The harness runs against stubs, so this
 * hands back an invite shaped exactly like public.invite_parent's return value
 * — including `grant_status`, which is what the button's closing sentence is
 * read from. 'pending' is the more interesting of the two to look at.
 */
export async function inviteParent(parentRowId) {
  return {
    id: 'inv-stub',
    token: 'stub-token',
    email: 'sara.fletcher@example.com',
    role: 'parent',
    player_id: 'p1',
    grant_status: 'pending',
    parent_row: parentRowId,
  }
}

export async function listParentsForPlayers(playerIds = []) {
  return Object.fromEntries(playerIds.map((id) => [id, ROWS[id] ?? []]))
}
