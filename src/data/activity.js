import { supabase } from '../lib/supabase.js'

// The client half of "Last active"
// (claude/plans/2026-08-26-last-active-and-presence-dots.md).
//
// Fire-and-forget: nothing on screen depends on it, so nothing on screen may
// break because of it. The localStorage throttle only stops the app ASKING
// more than once a day; the server's 12-hour floor in touch_last_seen() is
// the rule that holds whatever a client does.
export const TOUCH_KEY = 'last-seen-touched'

export async function touchLastSeenOncePerDay() {
  const today = new Date().toISOString().slice(0, 10)
  try {
    // Private browsing can throw on READ as well as write; a throttle that
    // cannot be read just means one extra harmless call.
    if (localStorage.getItem(TOUCH_KEY) === today) return
  } catch {
    // fall through and touch
  }
  try {
    const { error } = await supabase.rpc('touch_last_seen')
    if (error) return // no stamp: tomorrow retries
    try {
      localStorage.setItem(TOUCH_KEY, today)
    } catch {
      // private mode: the server floor still throttles
    }
  } catch {
    // offline at the pitch: no stamp, tomorrow retries
  }
}
