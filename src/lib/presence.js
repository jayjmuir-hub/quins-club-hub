import { useEffect, useState } from 'react'
import { supabase } from './supabase.js'

// Online status for chat (26 Aug 2026 — Jay: "we need an online status in
// chat, possible?"). Supabase Realtime PRESENCE, deliberately with NO table
// behind it: the fact is ephemeral by nature, and storing a last_seen would
// retain a when-was-this-person-here record forever for a dot that only
// matters while it is green. When the tab closes, presence evaporates
// server-side — there is nothing to clean up and nothing to leak.
//
// ⚠️ ONE CHANNEL PER TAB, SHARED BY EVERY HOOK CALLER. Each subscription is
// a live websocket topic; a channel per component would multiply sockets and
// make "online" flap as screens mount and unmount. The module holds the
// channel; the hook counts references and tears it down when the last caller
// leaves.
//
// The presence KEY is the profile id, so two tabs from one person collapse
// into one presence entry rather than showing them "more online".

let channel = null
let refs = 0
let current = new Set()
const listeners = new Set()

function broadcast() {
  for (const listener of listeners) listener(new Set(current))
}

function handleSync() {
  const state = channel?.presenceState?.() ?? {}
  current = new Set(
    Object.values(state)
      .flat()
      .map((entry) => entry.profile_id)
      .filter(Boolean),
  )
  broadcast()
}

function join(selfId) {
  channel = supabase
    .channel('presence:online', { config: { presence: { key: selfId } } })
    .on('presence', { event: 'sync' }, handleSync)
    .on('presence', { event: 'join' }, handleSync)
    .on('presence', { event: 'leave' }, handleSync)
  channel.subscribe((status) => {
    // Track only once the socket is up: a track() before SUBSCRIBED is
    // silently dropped by the client and the person never shows online.
    if (status === 'SUBSCRIBED') channel.track({ profile_id: selfId })
  })
}

function leave() {
  if (!channel) return
  supabase.removeChannel(channel)
  channel = null
  current = new Set()
  broadcast()
}

/**
 * The set of profile ids currently online. Empty until presence syncs, and
 * empty for a signed-out caller — a dot that cannot be shown is the honest
 * default in both cases.
 */
export function usePresence(selfId) {
  const [online, setOnline] = useState(() => new Set(current))

  useEffect(() => {
    if (!selfId) return undefined
    refs += 1
    if (!channel) join(selfId)
    const listener = (next) => setOnline(next)
    listeners.add(listener)
    // A caller mounting after sync still needs the current answer.
    listener(new Set(current))
    return () => {
      listeners.delete(listener)
      refs -= 1
      if (refs === 0) leave()
    }
  }, [selfId])

  return online
}
