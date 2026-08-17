import { joinPhone, splitPhone } from './phone.js'

// The two shape conversions every parent/carer editor needs, in ONE place.
//
// ══ THE BUG THIS EXISTS TO STOP HAPPENING AGAIN ═════════════════════════
// `player_parents` stores a phone as one E.164 string. ParentsEditor edits it
// as TWO fields — `phoneCountry` + `phoneNational` — because a half-typed
// number is not a valid E.164 string and joining on every keystroke throws
// away what the person is in the middle of typing (see PhoneInput).
//
// So every screen using ParentsEditor has to convert on the way in and on the
// way out. PlayerForm did, inline. MyPlayerForm did NEITHER — it passed raw
// database rows straight into the editor and editor rows straight back to
// saveParents. Two consequences, and the second is the serious one:
//
//   1. A stored phone rendered as BLANK for a parent, because the editor was
//      handed `phone` when it wanted `phoneCountry`/`phoneNational`.
//   2. ⚠️ SAVING WROTE `phone: null`. toRow() in src/data/parents.js reads
//      `parent.phone`, which on an editor row is undefined. So a parent
//      opening their own child's details and pressing Save DESTROYED the
//      phone number the club held for them — silently, with a success
//      message. Found 9 Aug 2026 when Jay added a parent phone, saved, and it
//      did not come back.
//
// Two screens, one of them with the logic and one without, is exactly the
// shape that produces this. There is now one implementation and neither screen
// is allowed its own.

/**
 * Database rows -> the shape ParentsEditor holds.
 *
 * Tolerates a null/absent phone (the common case) and nulls in every text
 * column: the editor binds these straight to inputs, and React logs a warning
 * and switches an input to uncontrolled the moment its value is null.
 *
 * ⚠️ `savedEmail` IS NOT A DUPLICATE OF `email`, AND IT IS WHAT STOPS AN INVITE
 * GOING TO THE WRONG ADDRESS. `email` is bound to an input and becomes whatever
 * the user is typing; `savedEmail` is what the database actually holds. The
 * Invite button reads NEITHER — public.invite_parent reads the address off the
 * row server-side — so the two differing means the button would email the OLD
 * address while the screen showed the new one. Keeping both lets the button
 * refuse and say "save first" instead. See InviteParentButton.
 */
export function toEditorRows(rows) {
  if (!Array.isArray(rows)) return []
  return rows.map((row) => {
    const { country, national } = splitPhone(row?.phone)
    return {
      id: row?.id,
      full_name: row?.full_name ?? '',
      relationship: row?.relationship ?? '',
      email: row?.email ?? '',
      savedEmail: row?.email ?? '',
      // When public.invite_parent last created an invite for this row. Null for
      // a row nobody has ever invited, which is every row before 17 Aug 2026.
      invited_at: row?.invited_at ?? null,
      phoneCountry: country,
      phoneNational: national,
      is_primary: Boolean(row?.is_primary),
    }
  })
}

/**
 * ParentsEditor rows -> the shape saveParents expects.
 *
 * ⚠️ THE SPREAD COMES FIRST AND `phone` IS WRITTEN LAST. Reversing them lets
 * an editor row that still carries a stale `phone` key — from a row read
 * before this module existed, or from a future change to the editor — win over
 * the freshly joined value, which is the original bug wearing a different hat.
 *
 * The spread also carries `savedEmail` and `invited_at` straight back out, and
 * that is harmless rather than sloppy: `toRow` in src/data/parents.js names
 * every column it writes, so a key it does not name never reaches the database.
 * ⚠️ IF THAT EVER BECOMES A BLIND `insert(row)`, THESE TWO BECOME A FAILED
 * INSERT ON AN UNKNOWN COLUMN — and `savedEmail` would be the one to delete,
 * never `email`.
 */
export function toSaveRows(rows) {
  if (!Array.isArray(rows)) return []
  return rows.map((row) => ({
    ...row,
    phone: joinPhone(row?.phoneCountry, row?.phoneNational),
  }))
}
