import { supabase } from '../lib/supabase'

/**
 * Coalescing window for the debounced realtime subscribers.
 *
 * ⚠️ THE CALLBACK IS A FULL REFETCH, so a coach saving three fixtures in a row
 * would otherwise cost every connected client three of them. 400ms is long
 * enough to collapse a burst and short enough that nobody perceives it as lag on
 * a single change. This was three separate `= 400` constants (events, notices,
 * messages) whose own comments admitted they had to stay equal; it is now one.
 */
export const REALTIME_DEBOUNCE_MS = 400

// ⚠️ ONE CHANNEL PER TABLE (AND FILTER), SHARED BY EVERY SUBSCRIBER — 5 Sep
// 2026. Until then each subscriber opened its own channel, and one open tab
// could hold six on `messages` alone: the dock badge, the dock list, the chat
// list, and a thread's own three. Every change was then evaluated by the
// server once PER CHANNEL PER CLIENT, and each client answered with five to
// ten queries. At a full club that is a thundering herd on every message.
//
// The module holds one channel per key and fans each payload out to every
// listener, the same shape src/lib/presence.js uses for the online dot. The
// channel is opened by the first subscriber and removed by the last; a
// subscriber that arrives while another is still attached reuses the socket
// topic and costs the server nothing new. Each subscriber keeps its OWN
// debounce and its own `match`, so sharing the transport changes nothing about
// when any one callback fires.
//
// The topic still carries a sequence number: a channel removed and re-opened
// in the same tick must not collide with the one still being torn down.
const shared = new Map()
let channelSeq = 0

/**
 * Forget every shared channel without removing it. FOR TESTS ONLY — the
 * registry outlives a test file's `supabase.channel` mock, so a test that
 * subscribes without unsubscribing would hand the next test a channel object
 * from a previous mock. The tests call this in `beforeEach`.
 */
export function resetSharedChannelsForTests() {
  shared.clear()
}

/**
 * Subscribe to postgres_changes on one table. Returns an idempotent unsubscribe
 * to call from a useEffect cleanup; safe to call more than once. The five
 * hand-written subscribers in src/data delegated to this shape verbatim.
 *
 * @param table                the public table to watch
 * @param callback             invoked with NO arguments when a change (or, when
 *                             debounced, a settled burst) arrives — "something
 *                             changed, re-read". A coalesced burst has no single
 *                             meaningful payload, so none is forwarded.
 * @param [opts]
 * @param [opts.channelPrefix] topic stem, default `${table}-changes`; pass it
 *                             where the stem differs from the table (reactions)
 * @param [opts.debounceMs=0]  coalescing window; 0 fires on every change, which
 *                             is what feedback and availability want (no burst)
 * @param [opts.filter]        optional PostgREST row filter, e.g. `event_id=eq.X`
 * @param [opts.channelKey]    extra topic uniqueness, e.g. an event id
 * @param [opts.match]         optional predicate over the realtime payload
 *                             ({ eventType, new, old }); a change it returns
 *                             false for is ignored by THIS subscriber and never
 *                             reaches its debounce. Sharing means a thread hears
 *                             every squad's messages — this is how it listens
 *                             only to its own. ⚠️ Fail OPEN: a payload the
 *                             predicate cannot judge (a DELETE carries only the
 *                             id) must return true, or a change is missed.
 */
export function subscribeToTable(
  table,
  callback,
  { channelPrefix = `${table}-changes`, debounceMs = 0, filter, channelKey, match } = {},
) {
  let timer = null
  const onChange =
    debounceMs > 0
      ? () => {
          if (timer) clearTimeout(timer)
          timer = setTimeout(() => {
            timer = null
            callback()
          }, debounceMs)
        }
      : callback

  const key = `${channelPrefix}${channelKey != null ? `-${channelKey}` : ''}${filter ? `|${filter}` : ''}`
  let entry = shared.get(key)
  if (!entry) {
    const listeners = new Set()
    const binding = { event: '*', schema: 'public', table }
    if (filter) binding.filter = filter
    const topic = `${channelPrefix}-${channelKey != null ? `${channelKey}-` : ''}${++channelSeq}`
    const channel = supabase
      .channel(topic)
      .on('postgres_changes', binding, (payload) => {
        // Copy first: a listener may unsubscribe (and delete itself) mid-loop.
        for (const listener of [...listeners]) listener(payload)
      })
      .subscribe()
    entry = { channel, listeners }
    shared.set(key, entry)
  }

  const listener = (payload) => {
    if (match && !match(payload)) return
    onChange()
  }
  entry.listeners.add(listener)

  let unsubscribed = false
  return () => {
    if (unsubscribed) return
    unsubscribed = true
    // ⚠️ CANCEL THE PENDING FIRE. Without this a change arriving just before a
    // screen unmounts calls back afterwards, and the callback is a setState — so
    // an unmounted screen would refetch and store into a component that is gone.
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    entry.listeners.delete(listener)
    // The last one out closes the channel. `shared.get(key) === entry` guards
    // against a registry reset (tests) having already replaced it.
    if (entry.listeners.size === 0 && shared.get(key) === entry) {
      shared.delete(key)
      supabase.removeChannel(entry.channel)
    }
  }
}
