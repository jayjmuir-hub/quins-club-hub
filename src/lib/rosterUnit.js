// Which bucket a player falls into: Forwards, Backs, or Other.
//
// ⚠️ EXTRACTED FROM src/screens/Roster.jsx ON 14 Aug 2026, unchanged. It moved
// because src/lib/rosterGrouping.js needs it, and a lib importing a SCREEN is
// backwards — the dependency would run the wrong way and drag React into a pure
// module. Roster.jsx now imports it from here.
//
// ⚠️ THIS IS A GROUPING RULE, NOT THE LIST OF CHOICES. src/lib/positions.js
// holds the positions a user may PICK; this buckets them, including values that
// are not on that list. The two were deliberately kept apart when POSITIONS was
// extracted and they stay apart — see the note at the top of positions.js.

// Ported verbatim from the prototype's posGroup() (design-system.md §7), so
// the grouped-by-position view matches the approved design exactly.
export const FORWARDS = ['Prop', 'Hooker', 'Lock', 'Flanker', 'Number 8']
export const BACKS = ['Scrum-half', 'Fly-half', 'Centre', 'Wing', 'Fullback']
export const POSITION_GROUP_ORDER = ['Forwards', 'Backs', 'Other']

// ⚠️ `player.unit` and `player.position` ARE DECORATED FIELDS SINCE 25 Aug
// 2026, not columns: both went staff-only (player_units / player_positions),
// and Roster stamps them onto the row for staff before grouping. For a parent
// they are absent and everything lands in 'Other' — which is why Roster no
// longer offers a parent the position grouping at all.
//
// ⚠️ TAKES THE PLAYER, NOT THE POSITION, SINCE 14 Aug 2026, and the change is
// the whole point of the unit field. It used to receive a position string and so
// could only bucket a player once somebody had named a specific position —
// which meant a nine-year-old who is plainly a forward sat in "Other" until
// prop-or-lock was decided.
//
// ⚠️ `unit` WINS WHERE THE TWO DISAGREE. Jay's explicit choice between deriving
// the unit from the position and keeping the unit authoritative: a player marked
// `back` whose position says "Flanker" is a DATA ERROR FOR A HUMAN TO FIX, and
// this function must not quietly paper over it by preferring the position.
// Deriving was rejected because it cannot express "forward, position not
// decided", which is the entire reason the column exists.
export function positionGroup(player) {
  if (player?.unit === 'forward') return 'Forwards'
  if (player?.unit === 'back') return 'Backs'
  // No unit set: fall back to the bucket the position implies, which is exactly
  // what this did for every player before the column existed.
  if (FORWARDS.includes(player?.position)) return 'Forwards'
  if (BACKS.includes(player?.position)) return 'Backs'
  return 'Other'
}
