import { supabase } from '../lib/supabase'
import { fetchByIds } from './limits.js'

// Data access for public.player_parents — the parent/carer rows behind a
// player. Same conventions as src/data/players.js: throws an Error rather
// than returning a {data, error} tuple, and returns [] not null for empty.
//
// SAFEGUARDING, and the reason this is not just another table: player_parents
// carries adults' names, emails and phone numbers attached to named children.
// Its two RLS policies are copied verbatim from player_contacts, and BOTH ARE
// `FOR ALL` — there is no separate read policy, because `parent read` was
// dropped on 6 Aug 2026 as redundant beside them:
//   parent edit own : is_own_player(player_id)
//   parent edit     : can_edit_team(player's team)
// — so a parent reads their own child's rows and nobody else's, and an empty
// result is the NORMAL outcome for a parent looking at a team-mate, not an
// error. Nothing in this module tries to interpret that: it reports what came
// back and lets the screen decide, which for PlayerDetail means rendering
// nothing at all rather than a "hidden" note.
//
// ⚠️ THIS HEADER SAID `edit : can_edit_team` ONLY UNTIL 17 Aug 2026, AND THAT
// WAS WRONG IN THE DIRECTION THAT MATTERS. `parent edit own` has existed since
// 4 Aug and is the reason a parent can add the other parent to their own child
// at all — the exact case public.invite_parent below is built for. A reader who
// believed the old line would have concluded the Invite button needed a new
// permission for parents, and given them one.
//
// Rows are ordered primary-first, then by sort_order, then name, so a
// player's main contact is always the first row on screen.

/** Lists one player's parent rows. [] is a legitimate answer, not a failure. */
export async function listParents(playerId) {
  if (!playerId) return []

  const { data, error } = await supabase
    .from('player_parents')
    .select('*')
    .eq('player_id', playerId)
    .order('is_primary', { ascending: false })
    .order('sort_order', { ascending: true })
    .order('full_name', { ascending: true })

  if (error) throw error
  return data ?? []
}

/**
 * Lists parent rows for many players in one query. Used to flag which players
 * in a squad have no parent on file — the "warn, never block" half of Jay's
 * ruling needs to know that across a whole roster without N round trips.
 *
 * Selects only the columns that answer that question. Emails and phone
 * numbers are not needed to count rows, and a bulk query that drags every
 * parent's contact details into a roster screen's memory is a wider blast
 * radius than the feature requires.
 */
export async function listParentsForPlayers(playerIds) {
  // ⚠️ CHUNKED SINCE 12 Aug 2026. PostgREST takes `.in()` as a query STRING —
  // ~37 bytes of URL per uuid — and this is fed a whole roster. Measured on
  // this project: 300 ids works, 400 makes the fetch THROW a connection error
  // rather than return a status, which reads as a bad network rather than a
  // request built wrong. A full club is ~375 players. See MAX_IN_LIST in
  // ./limits.js.
  return fetchByIds(playerIds, async (chunk) => {
    const { data, error } = await supabase
      .from('player_parents')
      .select('id, player_id, full_name, relationship, is_primary')
      .in('player_id', chunk)
    if (error) throw error
    return data ?? []
  })
}

const REFUSED_PARENT =
  "We couldn't save the parent details. You may not have permission to change them."
const REFUSED_PARENT_DELETE =
  "We couldn't remove that parent. You may not have permission to change them."

/**
 * Normalises one form row into a database row. Blank strings become null so
 * that "cleared the email box" and "never had an email" are the same state in
 * the database rather than one being '' and the other NULL — the app has no
 * use for the distinction and every query would have to handle both.
 */
function toRow(parent, playerId, index) {
  return {
    player_id: playerId,
    // ⚠️ ALL THREE NAME COLUMNS. private.sync_person_name takes its names-win
    // branch when first/last are present and recomputes full_name identically,
    // so `full_name` here is not a competing value — it is what keeps the
    // display name right for the thirty-odd readers of it if the trigger is
    // ever absent. Sending ONLY full_name would be the lossy direction: the
    // trigger takes the last word as the family name, so "Anna van der Berg"
    // would come back split as "Anna van der" / "Berg".
    full_name: String(parent.full_name ?? '').trim(),
    first_name: String(parent.first_name ?? '').trim() || null,
    last_name: String(parent.last_name ?? '').trim() || null,
    relationship: String(parent.relationship ?? '').trim() || null,
    email: String(parent.email ?? '').trim() || null,
    phone: String(parent.phone ?? '').trim() || null,
    is_primary: Boolean(parent.is_primary),
    sort_order: Number.isFinite(parent.sort_order) ? parent.sort_order : index,
  }
}

/**
 * Replaces a player's whole set of parent rows with the given list.
 *
 * WHY A WHOLE-SET REPLACE AND NOT PER-ROW SAVES: the form edits a list — a
 * coach adds a step-father, fixes a typo in a mother's number and deletes a
 * stale row in one sitting, then presses Save once. Emitting those as three
 * independent calls means three independent failure modes and a form that can
 * end up half-saved with no coherent thing to tell the user.
 *
 * ⚠️ ONE RPC SINCE 18 Aug 2026, AND IT IS NOW GENUINELY ATOMIC.
 * `public.save_player_parents` does the delete, the updates and the inserts in
 * one statement, so the child's list either ends up exactly as submitted or is
 * untouched. There is no third outcome.
 *
 * This used to be up to N+2 separate PostgREST requests — one DELETE, one
 * UPDATE per existing row, one INSERT — each landing on its own because
 * PostgREST has no client-side transaction. ⚠️ **BE PRECISE ABOUT WHAT THAT
 * COST**, because the open item overstated it and an overstated bug is one
 * nobody believes: a plain edit was always safe, since every kept row carries
 * an id and the DELETE removed nothing. The damage needed a row to be REMOVED
 * in the same sitting — then the removal applied, the edits did not, and the
 * screen said the save had failed. The record left behind was one nobody
 * chose, and the user had been told it did not exist.
 *
 * Measured on production before the change, in a rolled-back transaction:
 * replaying that sequence left 1 of 2 rows. db/tests/save-player-parents.sql
 * keeps that replay as the self-test, because "the row count did not change"
 * is an assertion that would pass against a table nothing ever touches.
 *
 * ⚠️ THE FUNCTION IS SECURITY INVOKER, so the two policies on
 * `public.player_parents` still decide who may write and this call has exactly
 * the permissions the old four did. Nothing here is trusted that was not
 * trusted before.
 *
 * Rows arriving with an `id` are existing rows and are updated in place, so a
 * parent's row keeps its identity — and its `created_at`, `invited_at` and
 * `profile_id`, which the function never writes. The last two are the link to
 * a parent's actual account; an UPDATE naming every column would un-invite a
 * parent every time somebody fixed a typo in their phone number.
 */
export async function saveParents(playerId, parents) {
  if (!playerId) throw new Error('saveParents needs a player_id.')
  const list = Array.isArray(parents) ? parents : []

  // A row whose name is blank is a row the user started and abandoned; the
  // CHECK constraint would reject it anyway, with a far worse message.
  //
  // ⚠️ THE FUNCTION DROPS THESE TOO, and the duplication is deliberate rather
  // than forgotten. This filter also decides `toRow`'s `index`, which becomes
  // sort_order — so removing it here would number the abandoned rows and leave
  // gaps in the order the form shows.
  const kept = list.filter((p) => String(p?.full_name ?? '').trim() !== '')

  const { data, error } = await supabase.rpc('save_player_parents', {
    _player: playerId,
    // toRow already names exactly the columns that may be written, so keys the
    // editor carries around — `savedEmail`, `invited_at` — never reach the
    // database. The `id` is added back because the function needs it to tell
    // an edit from an insert; toRow deliberately does not include it.
    _rows: kept.map((parent, index) => ({
      ...toRow(parent, playerId, index),
      id: parent.id ?? null,
    })),
  })

  if (error) {
    // ⚠️ 42501 IS THE FUNCTION REFUSING, NOT POSTGREST. It raises that when the
    // number of rows it updated does not match the number of ids it was given
    // — an id belonging to another child, or to one this person may not edit.
    // Mapped to the same sentence the per-row `maybeSingle()` check used to
    // produce, so the screen reads identically for the same situation.
    if (error.code === '42501') throw new Error(REFUSED_PARENT)
    throw error
  }

  return data ?? []
}

// ── invite_parent: turning a contact row into an offer of an account ───────
//
// The codes public.invite_parent raises, and what each one covers:
//
//   42501  two raises: not signed in, and "you cannot invite that person" —
//          the caller is neither is_own_player nor can_edit_team. The first is
//          unreachable from this app (every screen holding this button renders
//          behind RequireAuth).
//   22023  four raises: the row is gone, it points at no player, it has no
//          email on file, or the address has no @ in it.
//   42710  one raise: that address already has an account.
//
// ⚠️ THERE IS DELIBERATELY NO MESSAGE MAP HERE, AND THE ABSENCE IS THE SAME
// DECISION src/data/members.js MAKES FOR 22004. Every one of those raises was
// written as a sentence for the person pressing the button, and each one NAMES
// WHAT TO DO — "Add one first", "Ask an admin to connect them instead". A
// generic entry per code would replace exactly the half that explains the
// refusal.
//
// ⚠️ BUT ONLY THOSE CODES ARE TRUSTED, AND THAT IS WHY THIS IS KEYED ON
// `error.code` RATHER THAN SIMPLY PASSING `error.message` THROUGH. A dropped
// connection, a 401 from an expired session or a PostgREST schema-cache miss
// also arrive as an `error` with a `message`, and none of those sentences were
// written for a coach standing on a pitch.
const INVITE_CODES = new Set(['42501', '22023', '42710'])

const INVITE_FALLBACK = "We couldn't send that invite. Try again in a moment."

/**
 * Offers an account to the adult on one `player_parents` row, via the
 * `public.invite_parent` SECURITY DEFINER RPC. Returns the `invites` row.
 *
 * ⚠️ ONE ARGUMENT, AND THE EMAIL IS NOT ONE OF THEM. The address is read off
 * the row inside the function — the property that makes `claim_roster_access`
 * safe. Passing it would turn "invite this row" into "invite anybody, and
 * attach them to this row's child", so do not add a parameter for it here
 * however convenient it looks at a call site.
 *
 * ⚠️ WHAT COMES BACK MAY BE AN INVITE THAT ALREADY EXISTED. The function is
 * idempotent on (email, player, not yet accepted): a second press returns the
 * outstanding invite rather than minting a second live token. So a caller must
 * not read a returned row as proof that an email was just created — only that
 * one is outstanding.
 *
 * ⚠️ AND `grant_status` ON THE RETURNED ROW IS WORTH SHOWING THE PRESSER. It is
 * 'active' only when the caller could already approve that squad; a parent's
 * and a medic's invites come back 'pending'. The button says which, because
 * "sent" alone would let a parent believe they had just granted access.
 */
export async function inviteParent(parentRowId) {
  if (!parentRowId) throw new Error('inviteParent needs a parent row id.')

  const { data, error } = await supabase.rpc('invite_parent', { p_parent_row: parentRowId })

  if (error) {
    const thrown = new Error(
      INVITE_CODES.has(String(error.code)) && error.message ? error.message : INVITE_FALLBACK,
    )
    // Preserved so a caller can branch on the reason without going anywhere
    // near the wording, matching registerMyPlayer.
    thrown.code = error.code
    throw thrown
  }

  // A function returning a composite type gives PostgREST one object; an array
  // would mean the signature changed underneath us, and taking [0] silently
  // would hide that.
  if (!data || Array.isArray(data)) throw new Error(INVITE_FALLBACK)
  return data
}

/**
 * Links the caller's account to any `player_parents` row carrying their address,
 * via `public.link_my_parent_rows`. Returns how many rows were linked.
 *
 * ⚠️ IT LINKS, IT DOES NOT GRANT, AND THE DISTINCTION IS THE WHOLE SAFETY
 * ARGUMENT. `claim_roster_access` — the function this generalises — matches an
 * email and CREATES A MEMBERSHIP, which is safe there because the address lives
 * on `player_contacts` and only staff can write it. `player_parents.email` is an
 * address a PARENT can type for their own child. A claim that granted access on
 * that basis would mean: type an address into the contacts box, sign in as it,
 * and hold a membership on that squad — the exact hole `invite_parent` exists to
 * avoid. The function sets one column and creates nothing, and its migration
 * has a guard that ABORTS if it ever mentions `memberships`.
 *
 * ⚠️ IT RETURNS A COUNT, NOT THE ROWS. "You were linked to 2 records" tells the
 * caller nothing about anybody else; returning the rows would hand them
 * children's names.
 */
export async function linkMyParentRows() {
  const { data, error } = await supabase.rpc('link_my_parent_rows')
  if (error) throw error
  return typeof data === 'number' ? data : 0
}

/** Deletes one parent row by id. Throws when the database removed nothing. */
export async function deleteParent(id) {
  if (!id) throw new Error('deleteParent needs an id.')

  const { data, error } = await supabase
    .from('player_parents')
    .delete()
    .eq('id', id)
    .select()

  if (error) throw error
  if (!data || data.length === 0) throw new Error(REFUSED_PARENT_DELETE)
}
