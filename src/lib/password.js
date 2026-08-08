// Password rules, as a pure module. No React, no supabase import — the same
// reasoning as src/lib/scope.js: this must be trivially testable with plain
// strings.
//
// ⚠️ THIS MIRRORS A SERVER SETTING. The real boundary is Supabase's own
// validation (Authentication → Sign In / Providers → Email). These rules exist
// so a parent sees a live checklist instead of a 422, NOT to enforce anything —
// a client-side check enforces nothing at all.
//
// Live values, read off the dashboard and verified by probing the signup
// endpoint on 8 Aug 2026:
//   Minimum password length   : 8
//   Password requirements     : "Lowercase, uppercase letters, digits and symbols"
//
// ⚠️ IF EITHER DASHBOARD VALUE CHANGES, CHANGE THIS FILE IN THE SAME BREATH.
// Drift in the lenient direction is the dangerous one: the checklist goes all
// green, the parent presses the button, and GoTrue rejects it with the raw
// message below. Drift the other way merely nags them for no reason.
//
// The exact text GoTrue returns when this is violated — measured, not guessed:
//
//   "Password should contain at least one character of each:
//    abcdefghijklmnopqrstuvwxyz, ABCDEFGHIJKLMNOPQRSTUVWXYZ, 0123456789,
//    !@#$%^&*()_+-=[]{};'\:"|<>?,./`~."
//
// It lists all four sets every time, even when only one is missing, which is
// why it must never be the primary way a person learns what is wrong.

export const MIN_PASSWORD_LENGTH = 8

// The symbol set GoTrue actually accepts, taken verbatim from the 422 above
// rather than from the docs. Kept as a character class in a RegExp built with
// `new RegExp` + an escaped string, because writing this inline as a literal
// is where the escaping goes wrong.
const SYMBOLS = '!@#$%^&*()_+\\-=\\[\\]{};\'\\\\:"|<>?,./`~'
const HAS_SYMBOL = new RegExp('[' + SYMBOLS + ']')

/**
 * The individual rules, in the order they should be shown to a person.
 * Each has a stable `id` (for test assertions and React keys) and a `label`
 * written as something a parent can act on, not as a spec.
 */
export const PASSWORD_RULES = [
  {
    id: 'length',
    label: `At least ${MIN_PASSWORD_LENGTH} characters`,
    test: (pw) => pw.length >= MIN_PASSWORD_LENGTH,
  },
  {
    id: 'lower',
    label: 'A lower-case letter',
    test: (pw) => /[a-z]/.test(pw),
  },
  {
    id: 'upper',
    label: 'A capital letter',
    test: (pw) => /[A-Z]/.test(pw),
  },
  {
    id: 'digit',
    label: 'A number',
    test: (pw) => /[0-9]/.test(pw),
  },
  {
    id: 'symbol',
    // Deliberately shows a handful of examples rather than the full set. The
    // full set is 30 characters of line noise; five examples tell a person
    // what to type. Anything in the real set still passes.
    label: 'A symbol, such as ! ? # @ or -',
    test: (pw) => HAS_SYMBOL.test(pw),
  },
]

/**
 * Evaluate every rule against a candidate password.
 * Returns the rules with a `met` boolean, plus an overall `valid`.
 *
 * Takes a non-string defensively — an uncontrolled input can hand this
 * `undefined` on first render, and a crash on the sign-up screen is a worse
 * outcome than an all-red checklist.
 */
export function checkPassword(password) {
  const pw = typeof password === 'string' ? password : ''
  const rules = PASSWORD_RULES.map((rule) => ({
    id: rule.id,
    label: rule.label,
    met: rule.test(pw),
  }))
  return { rules, valid: rules.every((r) => r.met) }
}

/** Convenience for the places that only need the boolean. */
export function isPasswordValid(password) {
  return checkPassword(password).valid
}
