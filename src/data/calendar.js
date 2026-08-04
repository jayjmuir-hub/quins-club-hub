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
 * Built from VITE_SUPABASE_URL rather than hard-coded, so it follows the
 * project if it ever moves — unlike the service worker's runtimeCaching
 * pattern, which cannot (see vite.config.js).
 */
export function calendarFeedUrl(token) {
  if (!token) return null
  const base = import.meta.env.VITE_SUPABASE_URL
  return `${base}/functions/v1/calendar?token=${token}`
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
