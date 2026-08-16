// Stubbed lineups for the visual harness. See harness/vite.config.js.
//
// ⚠️ THIS EXISTS SO THE HARNESS KEEPS ITS "NO NETWORK" PROMISE. MatchSheet.jsx
// started reading lineups on 16 Aug 2026 to seed its 22 boxes; without the alias
// the harness would import the real module, which imports src/lib/supabase.js at
// module scope — the exact failure the staff.js alias comment describes.
//
// ⚠️ THE SCENARIO SHIP WITH NAMES IN THEM, DELIBERATELY. The match-sheet
// scenario is what `harness/check-overflow.mjs` measures, and 22 empty boxes
// measure a narrower form than 22 full ones — the widest thing on this screen is
// a long name in the TEAM NAME column. Made-up names, as every file in this repo
// must use.
import { PLAYERS } from './players.js'

// ⚠️ t2's PLAYERS, NOT THE FIRST 22 IN THE FILE. The `match-sheet` scenario is
// on e2, which is a t2 ("U14 Boys") fixture, and the screen looks each name up
// in the squad it loaded for THAT team — a lineup naming t1 players resolves to
// nothing at all and the boxes stay empty, which reads as the seeding being
// broken rather than as the stub being wrong. It also carries the longest name
// on that squad, which is what the overflow gate needs to measure.
const SQUAD = PLAYERS.filter((player) => player.team_id === 't2')
const STARTERS = SQUAD.slice(0, 6)
const REPLACEMENTS = SQUAD.slice(6)

export async function listLineups(eventId) {
  if (!eventId) return []
  return [
    {
      id: 'ln-1',
      event_id: eventId,
      label: null,
      players_per_side: 15,
      squad_size: STARTERS.length + REPLACEMENTS.length,
      notes: null,
      lineup_players: [
        ...STARTERS.map((player, index) => ({
          id: `lp-s-${index}`,
          player_id: player.id,
          role: 'starter',
          position: null,
          sort_order: index,
        })),
        ...REPLACEMENTS.map((player, index) => ({
          id: `lp-r-${index}`,
          player_id: player.id,
          role: 'replacement',
          position: null,
          sort_order: index,
        })),
      ],
    },
  ]
}

export async function createLineup() {
  throw new Error('The harness does not write.')
}
export async function updateLineup() {
  throw new Error('The harness does not write.')
}
export async function saveLineupPlayers() {
  throw new Error('The harness does not write.')
}
export async function deleteLineup() {
  throw new Error('The harness does not write.')
}
