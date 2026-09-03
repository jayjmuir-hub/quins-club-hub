// The one way the data layer wraps a Supabase / PostgREST failure.
//
// ⚠️ THE GAP THIS CLOSES (data-layer half of the friendly-error sweep, 3 Sep
// 2026). Wrapping as a plain Error built from the message, with a constant
// as the fallback, kept the database's words but DROPPED ITS CODE.
// (The old shape is not spelled out here on purpose — the sweep in
// tests/friendly-error-sweep.test.js greps for it.) friendlyMessage() in src/lib/friendlyError.js
// reads "no code" as "this app wrote that sentence for a person" and shows
// it as-is — so a raw PostgREST string ("JSON object requested, multiple (or
// no) rows returned") reached the screen through exactly the mapper that
// exists to stop it. src/data/members.js registerMyPlayer already did the
// right thing (`friendly.code = error.code`); this makes that the rule.
//
// What comes back: an Error whose message is the database's (or the
// fallback when it had none) AND whose `code` is the database's. The screen's
// friendlyMessage() then decides: a trusted code (a SECURITY DEFINER raise
// written for the person, 42501 / 22023 / 42710 / 22004 / P0001) shows the
// message; any other code shows the screen's own fallback. No code at all —
// a network failure, or an app-constructed error passed through — is left
// exactly as friendlyMessage() already treats it.
//
// ⚠️ NOT A MESSAGE MAP, and not a place to put copy. The fallback is the
// caller's own sentence, used only when the failure carried no message.

/**
 * Wrap a Supabase error for throwing, keeping its message AND its code.
 *
 * @param {{ message?: string, code?: string|number } | null | undefined} error
 * @param {string} fallback  the caller's sentence, used when `error` has no message
 * @returns {Error}
 */
export function wrapDbError(error, fallback) {
  const message = typeof error?.message === 'string' && error.message.trim() !== '' ? error.message : fallback
  const wrapped = new Error(message)
  if (error?.code !== undefined && error?.code !== null) wrapped.code = error.code
  return wrapped
}
