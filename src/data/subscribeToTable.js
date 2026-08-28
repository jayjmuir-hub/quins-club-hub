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

// Distinct topic per subscription: two mounts sharing a channel name silently
// get one channel between them. A single monotonic counter for the whole app is
// enough — the topic already carries the table/prefix, so uniqueness never
// depended on the counter being per-module.
let channelSeq = 0

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
 */
export function subscribeToTable(
  table,
  callback,
  { channelPrefix = `${table}-changes`, debounceMs = 0, filter, channelKey } = {},
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

  const topic = `${channelPrefix}-${channelKey != null ? `${channelKey}-` : ''}${++channelSeq}`
  const binding = { event: '*', schema: 'public', table }
  if (filter) binding.filter = filter

  const channel = supabase.channel(topic).on('postgres_changes', binding, onChange).subscribe()

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
    supabase.removeChannel(channel)
  }
}
