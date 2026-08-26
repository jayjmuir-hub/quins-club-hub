// Presence stub — the real one opens a websocket via src/lib/supabase.js,
// which throws at IMPORT without env vars (the stubs/staff.js failure mode).
// One invented person online and one away, so a shoot can show the green
// AND yellow dots; everyone else reads offline (grey).
export function usePresence() {
  return new Map([
    ['hz-sam', 'online'],
    ['hz-rosa', 'away'],
  ])
}

// The pure halves, mirrored verbatim from src/lib/presence.js — a stub that
// reshaped the answer would make the shoots lie about the real screens.
export function computePresence(state) {
  const map = new Map()
  for (const entries of Object.values(state ?? {})) {
    for (const entry of entries ?? []) {
      if (!entry?.profile_id) continue
      const next = entry.state === 'away' ? 'away' : 'online'
      if (next === 'online' || !map.has(entry.profile_id)) map.set(entry.profile_id, next)
    }
  }
  return map
}

export function dotState(map, profileId) {
  return (profileId && map?.get?.(profileId)) || 'offline'
}
