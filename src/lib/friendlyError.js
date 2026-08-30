// What an error is allowed to SAY to a parent (Grok item 17, 30 Aug 2026).
//
// ⚠️ THE PROBLEM THIS SOLVES: `setError(err.message)` renders whatever string
// the failure carried. For an error THIS APP threw, that is honest copy
// written for the person pressing the button ("The conversation was not
// deleted — you may not have the right to"). For a raw PostgREST, network or
// schema-cache failure it is jargon at best — and technically
// server-influenced text on the club's origin at worst. The screens could not
// tell the two apart, so they showed everything.
//
// The rule, lifted from src/data/parents.js's invite path:
//   - an error with NO code is one this app constructed — its message was
//     written for the user, show it;
//   - an error WITH a code is the database/PostgREST talking — show its
//     message only for the codes whose raises are hand-written sentences
//     (the SECURITY DEFINER refusals), and the screen's own fallback for
//     everything else;
//   - network noise ("Failed to fetch") is never copy, whatever carried it.
//
// ⚠️ DELIBERATELY NOT A MESSAGE MAP — the same decision parents.js records.
// The trusted raises each NAME WHAT TO DO; a generic entry per code would
// replace exactly the half that explains the refusal.

// The codes this project's SECURITY DEFINER functions raise WITH a sentence
// written for the person: permission (42501), invalid input (22023), duplicate
// (42710), missing prerequisite (22004), and business-rule refusals (P0001,
// e.g. the last-admin guard's "Make someone else an admin first").
const TRUSTED_CODES = new Set(['42501', '22023', '42710', '22004', 'P0001'])

const NETWORK_NOISE = /failed to fetch|networkerror|load failed|fetch failed/i

/**
 * The message a screen may show for `err`, or `fallback` when the message was
 * not written for a person.
 */
export function friendlyMessage(err, fallback) {
  const message = typeof err?.message === 'string' ? err.message.trim() : ''
  if (!message || NETWORK_NOISE.test(message)) return fallback
  const code = err?.code
  if (code !== undefined && code !== null && !TRUSTED_CODES.has(String(code))) return fallback
  return message
}
