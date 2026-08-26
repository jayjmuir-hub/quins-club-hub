import { useEffect, useState } from 'react'
import { supabase } from './supabase.js'

// Presence for chat (26 Aug 2026 — Jay: "we need an online status in chat",
// then "green dot for online, yellow dot for away … use the grey dot").
// Supabase Realtime PRESENCE, deliberately with NO table behind it: the fact
// is ephemeral by nature, and storing a last_seen would retain a
// when-was-this-person-here record forever for a dot that only matters while
// it is lit. When the tab closes, presence evaporates server-side.
// (profiles.last_seen_at is the deliberate, ADMIN-facing, day-level
// exception — src/data/activity.js — and is a different fact on purpose.)
//
// ⚠️ ONE CHANNEL PER TAB, SHARED BY EVERY HOOK CALLER. Each subscription is
// a live websocket topic; a channel per component would multiply sockets and
// make the dot flap as screens mount and unmount. The module holds the
// channel; the hook counts references and tears it down when the last caller
// leaves.
//
// The presence KEY is the profile id, so two tabs from one person collapse
// into one presence entry rather than showing them "more online".
//
// ── The states ──────────────────────────────────────────────────────────────
// Each tab tracks { profile_id, state: 'online' | 'away' }:
//   online  the app is open AND in front (tab visible), touched recently
//   away    still running but hidden (visibilitychange) or untouched for
//           5+ minutes — the tablet left on the kitchen counter
// Not connected at all = absent from the map = 'offline' (the grey dot —
// Jay chose an explicit grey over no-dot, so "offline" and "broken" stop
// looking identical).

const IDLE_MS = 5 * 60 * 1000

let channel = null
let refs = 0
let current = new Map()
const listeners = new Set()

// This tab's own state, re-tracked on every change.
let myState = 'online'
let idleTimer = null
let cleanupActivity = null

/**
 * Channel presence state → Map(profile_id → 'online' | 'away').
 * ⚠️ ONLINE WINS across a person's tabs: the phone in a pocket is away, the
 * laptop being typed on is online, and the person is at the laptop. A legacy
 * payload with no state field (a tab still on the 25 Aug bundle mid-deploy)
 * counts as online rather than vanishing.
 */
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

/** The dot for one person: 'online' | 'away' | 'offline'. */
export function dotState(map, profileId) {
  return (profileId && map?.get?.(profileId)) || 'offline'
}

function broadcast() {
  for (const listener of listeners) listener(new Map(current))
}

function handleSync() {
  current = computePresence(channel?.presenceState?.() ?? {})
  broadcast()
}

function track(selfId) {
  channel?.track({ profile_id: selfId, state: myState })
}

function setMyState(selfId, next) {
  if (next === myState) return
  myState = next
  track(selfId)
}

function armIdle(selfId) {
  if (idleTimer) clearTimeout(idleTimer)
  idleTimer = setTimeout(() => setMyState(selfId, 'away'), IDLE_MS)
}

function watchActivity(selfId) {
  function onVisibility() {
    if (document.hidden) setMyState(selfId, 'away')
    else {
      setMyState(selfId, 'online')
      armIdle(selfId)
    }
  }
  function onActivity() {
    if (!document.hidden) setMyState(selfId, 'online')
    armIdle(selfId)
  }
  document.addEventListener('visibilitychange', onVisibility)
  window.addEventListener('pointerdown', onActivity, { passive: true })
  window.addEventListener('keydown', onActivity, { passive: true })
  window.addEventListener('scroll', onActivity, { passive: true })
  armIdle(selfId)
  return () => {
    document.removeEventListener('visibilitychange', onVisibility)
    window.removeEventListener('pointerdown', onActivity)
    window.removeEventListener('keydown', onActivity)
    window.removeEventListener('scroll', onActivity)
    if (idleTimer) clearTimeout(idleTimer)
    idleTimer = null
  }
}

function join(selfId) {
  myState = typeof document !== 'undefined' && document.hidden ? 'away' : 'online'
  channel = supabase
    .channel('presence:online', { config: { presence: { key: selfId } } })
    .on('presence', { event: 'sync' }, handleSync)
    .on('presence', { event: 'join' }, handleSync)
    .on('presence', { event: 'leave' }, handleSync)
  channel.subscribe((status) => {
    // Track only once the socket is up: a track() before SUBSCRIBED is
    // silently dropped by the client and the person never shows online.
    if (status === 'SUBSCRIBED') track(selfId)
  })
  cleanupActivity = watchActivity(selfId)
}

function leave() {
  if (!channel) return
  cleanupActivity?.()
  cleanupActivity = null
  supabase.removeChannel(channel)
  channel = null
  current = new Map()
  broadcast()
}

/**
 * Map of profile id → 'online' | 'away' for everyone currently connected.
 * Empty until presence syncs, and empty for a signed-out caller — a dot that
 * cannot be shown is grey, the honest default in both cases. Read it with
 * `dotState(map, id)`.
 */
export function usePresence(selfId) {
  const [presence, setPresence] = useState(() => new Map(current))

  useEffect(() => {
    if (!selfId) return undefined
    refs += 1
    if (!channel) join(selfId)
    const listener = (next) => setPresence(next)
    listeners.add(listener)
    // A caller mounting after sync still needs the current answer.
    listener(new Map(current))
    return () => {
      listeners.delete(listener)
      refs -= 1
      if (refs === 0) leave()
    }
  }, [selfId])

  return presence
}
