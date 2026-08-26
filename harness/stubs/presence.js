// Presence stub — the real one opens a websocket via src/lib/supabase.js,
// which throws at IMPORT without env vars (the stubs/staff.js failure mode).
// One invented person online so a DM-thread shoot shows the green state.
export function usePresence() {
  return new Set(['hz-sam'])
}
