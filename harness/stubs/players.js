// Harness stub replacing src/data/players.js via a Vite alias. Same public
// shape (listPlayers, getPlayerContact) as the real module, but returns fixed
// fixtures instead of querying Supabase. Deliberately includes numberless
// players (so the flat "–" jersey tile renders), a captain (so the "Capt"
// badge renders), long names and long positions (so row truncation/wrapping
// gets exercised at 375px), and enough rows across two teams that both the
// age-group and the position grouping have something to show.
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

const P = (id, team_id, full_name, jersey_num, position, is_captain = false) => ({
  id,
  team_id,
  full_name,
  jersey_num,
  position,
  is_captain,
})

export const PLAYERS = [
  // U12 Boys — covers Forwards, Backs and Other.
  P('p1', T1, 'Aaron Whitfield', 1, 'Prop'),
  P('p2', T1, 'Bilal Haddad', 2, 'Hooker'),
  P('p3', T1, 'Charlie Nguyen-Fitzgerald', 4, 'Lock'),
  P('p4', T1, 'Dhruv Ramachandran', 6, 'Flanker', true),
  P('p5', T1, 'Eoin O’Sullivan', 8, 'Number 8'),
  P('p6', T1, 'Faisal Al Mansoori', 9, 'Scrum-half'),
  P('p7', T1, 'Gabriel Santos', 10, 'Fly-half'),
  P('p8', T1, 'Harry Blythe', 12, 'Centre'),
  P('p9', T1, 'Ibrahim Kaddoura', 14, 'Wing'),
  P('p10', T1, 'Jack Mortimer', 15, 'Fullback'),
  P('p11', T1, 'Kwame Osei-Bonsu', null, 'Utility'),
  P('p12', T1, 'Liam Fitzpatrick', null, 'Utility'),

  // U14 Boys.
  P('p13', T2, 'Mateo Fernández', 1, 'Prop'),
  P('p14', T2, 'Nathan Cole', 3, 'Prop'),
  P('p15', T2, 'Omar Al Blooshi', 5, 'Lock', true),
  P('p16', T2, 'Patrick Donnelly', 7, 'Flanker'),
  P('p17', T2, 'Quentin Marchand', 9, 'Scrum-half'),
  P('p18', T2, 'Rohan Chatterjee', 11, 'Wing'),
  P('p19', T2, 'Samuel Adeyemi-Johnson', 13, 'Centre'),
  P('p20', T2, 'Tariq Hussein', null, 'Utility'),

  // U16 Boys — third age group. Includes a captain, a numberless player, and
  // a deliberately long name/position pair to stress the 375px row.
  P('p21', T3, 'Alexander Vandenberg-Whitmore', 2, 'Hooker'),
  P('p22', T3, 'Yusuf Abdurrahman', 4, 'Lock'),
  P('p23', T3, 'Zane Kowalczyk', 8, 'Number 8', true),
  P('p24', T3, 'Christopher Oyelaran', 10, 'Fly-half'),
  P('p25', T3, 'Devan Sivaraman', 14, 'Wing'),
  P('p26', T3, 'Emre Yıldırım', null, 'Utility back / hooker cover'),
]

export async function listPlayers({ teamIds } = {}) {
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

export async function getPlayerContact(playerId) {
  if (CONTACT_DELAY > 0) {
    await new Promise((resolve) => setTimeout(resolve, CONTACT_DELAY))
  }
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
