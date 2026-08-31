// The profile-icon library (claude/plans/2026-08-31-profile-icons.md).
// Super admins pin these to a squad's staff or an individual; the emoji
// renders after the name in chat, the meaning is what a tap shows on the
// person card. Every entry MUST carry a name and a default meaning — a
// per-grant reason line overrides the meaning, never the name.
//
// Growing this list is a one-line change and needs no migration: the
// database stores only the key, and an unknown key renders as NOTHING
// (tests/profile-icons-lib.test.js pins that), so retiring an icon here
// silently undecorates its holders rather than breaking them.
//
// ⚰️ There is deliberately no "whistle": Unicode has no whistle emoji, and
// three custom SVG candidates were drawn and rejected by Jay on 31 Aug 2026
// — 📋 clipboard is the coach icon. Read the spec before re-opening that.

export const ICON_LIBRARY = [
  { key: 'crown', emoji: '👑', name: 'Crown', meaning: 'Best age group on Club Hub' },
  { key: 'trophy', emoji: '🏆', name: 'Trophy', meaning: 'Winners — a title, a tournament, a season' },
  { key: 'star', emoji: '⭐', name: 'Star', meaning: 'Star of the club — above and beyond' },
  { key: 'fire', emoji: '🔥', name: 'On fire', meaning: 'Hot streak — form worth shouting about' },
  { key: 'rocket', emoji: '🚀', name: 'Rocket', meaning: 'Fast riser — most improved' },
  { key: 'medal', emoji: '🎖️', name: 'Medal', meaning: 'Long service — years given to the club' },
  { key: 'shield', emoji: '🛡️', name: 'Shield', meaning: 'Guardian — the safe pair of hands' },
  { key: 'ball', emoji: '🏉', name: 'Ball', meaning: 'Rugby royalty — playing pedigree' },
  { key: 'lion', emoji: '🦁', name: 'Lion', meaning: 'Heart of a lion — courage' },
  { key: 'lightning', emoji: '⚡', name: 'Lightning', meaning: 'Quickest at the club — pace' },
  { key: 'bullseye', emoji: '🎯', name: 'Bullseye', meaning: 'Deadly accurate — the kicker' },
  { key: 'handshake', emoji: '🤝', name: 'Handshake', meaning: 'Spirit of rugby — sportsmanship' },
  { key: 'megaphone', emoji: '📣', name: 'Megaphone', meaning: 'Loudest supporters — the touchline award' },
  { key: 'rising_star', emoji: '🌟', name: 'Rising star', meaning: 'Junior one-to-watch' },
  { key: 'key', emoji: '🔑', name: 'Key', meaning: 'Holds the keys — trusted with the club' },
  { key: 'wizard', emoji: '🧙', name: 'Wizard', meaning: 'The fixer — makes problems disappear' },
  { key: 'hivis', emoji: '🦺', name: 'Hi-vis', meaning: 'First to arrive, last to leave — matchday setup' },
  { key: 'coffee', emoji: '☕', name: 'Coffee', meaning: 'Runs on caffeine — the early-morning volunteer' },
  { key: 'biscuit', emoji: '🍪', name: 'Biscuit', meaning: 'Bake sale legend — feeds the club' },
  { key: 'bus', emoji: '🚌', name: 'Bus', meaning: 'The taxi service — drives everyone, everywhere' },
  { key: 'camera', emoji: '📸', name: 'Camera', meaning: 'Club photographer — catches every try' },
  { key: 'scholar', emoji: '🎓', name: 'Scholar', meaning: 'The qualified one — newest badge or course' },
  { key: 'compass', emoji: '🧭', name: 'Compass', meaning: 'Founding spirit — here since the start' },
  { key: 'strength', emoji: '💪', name: 'Strength', meaning: 'The workhorse — turns up to everything' },
  { key: 'rainbow', emoji: '🌈', name: 'Rainbow', meaning: 'Sunshine on a wet Tuesday — lifts the mood' },
  { key: 'ice', emoji: '🧊', name: 'Ice', meaning: 'Cool head — unflappable under pressure' },
  { key: 'party', emoji: '🎉', name: 'Party', meaning: 'Social committee — makes the fun happen' },
  { key: 'seedling', emoji: '🌱', name: 'Seedling', meaning: 'Growing the game — brings in new families' },
  { key: 'hammer', emoji: '🔨', name: 'Hammer', meaning: 'The builder — fixes the clubhouse' },
  { key: 'gold', emoji: '🥇', name: 'Gold', meaning: 'First place — top of the table' },
  { key: 'clipboard', emoji: '📋', name: 'Clipboard', meaning: 'The gaffer — runs the session' },
]

const byKey = new Map(ICON_LIBRARY.map((e) => [e.key, e]))

/** The emoji for a key, or null for a key the library no longer knows. */
export function iconEmoji(key) {
  return byKey.get(key)?.emoji ?? null
}

/** The default meaning for a key, or null. A grant's own reason wins. */
export function iconMeaning(key) {
  return byKey.get(key)?.meaning ?? null
}
