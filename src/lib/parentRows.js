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
      // ⚠️ TWO NAME FIELDS SINCE 17 Aug 2026, AND NO `full_name` ON AN EDITOR
      // ROW AT ALL. Leaving it here would be a third value describing the same
      // thing, free to disagree with the two boxes the moment either is typed
      // in. toSaveRows rebuilds it on the way out, which is the only place it
      // is ever true.
      //
      // ⚠️ AND NO CLIENT-SIDE SPLIT OF full_name AS A FALLBACK. The rule (a
      // one-word name is a FIRST name) has been got backwards once already —
      // 20260808 sync_profile_name_single_word — and a second copy of it here
      // would be invisible until somebody sorted a list. The backfill filled
      // every row and its migration aborts if it did not, so a blank box means
      // a blank column.
      first_name: row?.first_name ?? '',
      last_name: row?.last_name ?? '',
      relationship: row?.relationship ?? '',
      email: row?.email ?? '',
      savedEmail: row?.email ?? '',
      // When public.invite_parent last created an invite for this row. Null for
      // a row nobody has ever invited, which is every row before 17 Aug 2026.
      invited_at: row?.invited_at ?? null,
      // ⚠️ WHICH ACCOUNT THIS ADULT IS, once their address matched at sign-in.
      // It is what turns the Invite button's middle state into JOINED, and it
      // grants nothing — see public.link_my_parent_rows. Carried through the
      // editor read-only: nothing on screen sets it, and toRow does not write it.
      profile_id: row?.profile_id ?? null,
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
    // ⚠️ REBUILT HERE, AND WRITTEN ALONGSIDE first_name/last_name RATHER THAN
    // INSTEAD OF THEM. private.sync_person_name takes the names-win branch and
    // recomputes this identically (`btrim(concat_ws(' ', fn, ln))`), so this is
    // not a second source of truth — it is what keeps the display name correct
    // for every existing reader of full_name if the trigger is ever absent.
    // ⚠️ FILTERED, NOT TEMPLATED: a missing family name must give "Kwame", never
    // "Kwame " — a trailing space makes the trigger's split produce an empty
    // last name rather than a null one.
    full_name: [row?.first_name, row?.last_name]
      .map((part) => String(part ?? '').trim())
      .filter(Boolean)
      .join(' '),
  }))
}

/**
 * The one rule about parent names, defined once because TWO screens save these
 * rows and a rule written twice is a rule that disagrees with itself.
 *
 * ⚠️ BOTH NAMES, AND THIS IS A BLOCK RATHER THAN A WARNING — which is the
 * opposite of the "at least one parent" rule in ParentsEditor, deliberately.
 * That one warns because ~159 existing players have no parent row at all and a
 * hard requirement would make every one of them unsaveable. This one blocks
 * because there is nothing to grandfather: every parent row in the live
 * database has both names (measured 16 Aug 2026). The two forms this rule
 * governs are still the only places a human TYPES a parent row. RPCs copy
 * the adult's profile when they insert a parent membership
 * (`private.memberships_write_parent_row`); the importer does not. So
 * requiring both names here closes the door on a half-typed row rather than
 * locking a coach out of a child with none.
 *
 * A row nobody has typed anything into is ignored: adding a parent and changing
 * your mind is not an error, and saveParents drops those rows anyway.
 *
 * Returns a sentence to show, or null when there is nothing wrong.
 */
export function parentNameProblem(rows) {
  if (!Array.isArray(rows)) return null

  const text = (value) => String(value ?? '').trim()

  for (const row of rows) {
    const first = text(row?.first_name)
    const last = text(row?.last_name)
    const started =
      first || last || text(row?.email) || text(row?.phoneNational) || text(row?.phone)
    if (!started) continue
    if (!first || !last) {
      return 'Give every parent a first name and a family name — a first name on its own is not enough for a coach to know who to call.'
    }
  }

  return null
}
