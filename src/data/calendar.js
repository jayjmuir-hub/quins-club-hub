import { supabase } from '../lib/supabase'

// The calendar subscription link. See db/migrations/20260804_calendar_feed.sql
// and supabase/functions/calendar.
//
// The token is a BEARER CREDENTIAL: anyone holding the URL gets that person's
// fixture list, because a calendar client cannot sign in. That is why it is a
// random uuid rather than the profile id, why it is per person, and why
// resetting it is offered right next to it.

/** The caller's feed token, minted on first use. */
export async function myCalendarToken() {
  const { data, error } = await supabase.rpc('my_calendar_token')
  if (error) throw error
  return data ?? null
}

/** Revokes the current link and issues a new one. The old URL stops working. */
export async function resetMyCalendarToken() {
  const { data, error } = await supabase.rpc('reset_my_calendar_token')
  if (error) throw error
  return data ?? null
}

/**
 * The public origin the feed is advertised under.
 *
 * ⚠️ HARD-CODED ON PURPOSE, and NOT derived from window.location.origin.
 * Whatever hostname someone subscribes to is welded into their Google or Apple
 * account permanently — a subscribed calendar URL cannot be changed remotely.
 * Deriving it from the current origin would mint permanent links pointing at
 * `app.adhjrt.com` for anyone who happened to arrive on the old alias, which
 * is a domain we may delete, and at a deploy-preview URL from a preview build.
 * A link that outlives its hostname is the whole failure this constant exists
 * to prevent, so it names the canonical domain and nothing else.
 *
 * ⚠️ If the app's domain ever changes, changing this does NOT migrate anyone
 * already subscribed. It only fixes links minted afterwards. Keep the old
 * domain resolving.
 *
 * The path is served by a Netlify PROXY to the Supabase edge function — see
 * the /calendar.ics rule in netlify.toml, which is what keeps the Supabase
 * project reference out of the URL.
 */
const CALENDAR_ORIGIN = 'https://adhquins-clubhub.com'

export function calendarFeedUrl(token) {
  if (!token) return null
  return `${CALENDAR_ORIGIN}/calendar.ics?token=${token}`
}

/**
 * The same URL under the webcal: scheme. iOS and macOS Calendar treat it as
 * "subscribe", so it is one tap; on Google it does nothing useful, which is
 * why the https URL is still shown for copying.
 */
export function calendarWebcalUrl(token) {
  const url = calendarFeedUrl(token)
  return url ? url.replace(/^https?:/, 'webcal:') : null
}
