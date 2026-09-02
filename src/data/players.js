import { supabase } from '../lib/supabase'
import { upsertById } from './upsertById.js'
import { fetchAllPages, fetchByIds } from './limits.js'
import { deletePlayerPhoto } from './photos.js'
import { jerseyClashMessage, isJerseyNumber } from '../lib/jersey.js'
import { friendlyMessage } from '../lib/friendlyError.js'

// Data access for the players and player_contacts tables. RLS already
// restricts rows to what the calling user's memberships allow. player_contacts
// exists as a separate table precisely so RLS can hide it (safeguarding) —
// a parent's query legitimately returns zero rows, which is not an error.
// Follows the throw-on-error convention set by src/data/members.js: callers
// get a thrown Error, never a {data, error} tuple, and [] rather than null
// for empty results.

/**
 * Lists players, optionally scoped to a set of team ids, ordered by
 * full_name ascending.
 *
 * teamIds semantics matter: an empty array means "no teams" and returns []
 * without querying at all. undefined/omitted means "no team filter" and
 * queries normally, letting RLS decide what comes back — and in that shape
 * behaviour is UNCHANGED from before senior squads: no membership query
 * runs and no `guest_of` key is added to a row.
 *
 * ⚠️ WHEN teamIds IS A NON-EMPTY ARRAY, EACH ROW GAINS `guest_of`: `null` for
 * a player whose home `team_id` is one of the requested squads, or the first
 * REQUESTED team id (in `teamIds` order) the player holds an ACTIVE
 * `memberships` row against otherwise — a "guest" of that squad. A player
 * can hold several second-squad memberships; `guest_of` names only the first
 * one that was actually asked for, because that is the squad the caller is
 * rendering.
 *
 * ⚠️ TWO QUERIES, NOT A VIEW — RLS on both tables already decides what comes
 * back (`private.can_see_player` is what makes the guest row readable at
 * all); a view would need its own policy, and this module has no route to
 * add one.
 */
export async function listPlayers({ teamIds, includeLeft = false } = {}) {
  if (Array.isArray(teamIds) && teamIds.length === 0) return []

  // ⚠️ PAGED, NOT CAPPED, SINCE 12 Aug 2026 — the same move listEvents made on
  // 10 Aug, and for the same reason. The flat cap was right in principle (a
  // short list that looks complete is worse than an error) but it turns into a
  // broken screen rather than a fixed one: `Accounts.jsx`, `AdminClub.jsx` and
  // `InviteForm.jsx` call this with NO teamIds on purpose, so they ask for
  // every player in the club, and there is no action a person can take on
  // "too many players" short of not using the screen.
  //
  // ⚠️ A FRESH BUILDER PER PAGE. A PostgREST query builder is single-use once
  // awaited; handing the same one back would re-send page one forever.
  const buildQuery = () => {
    let query = supabase.from('players').select('*')
    if (Array.isArray(teamIds) && teamIds.length > 0) {
      query = query.in('team_id', teamIds)
    }
    // ⚠️ LEAVERS ARE HIDDEN BY DEFAULT, HERE, FOR EVERY CALLER. Twelve screens
    // load players through this function; hiding at the query means none of
    // them can forget. History screens (MatchSheet, GameTime) and the roster's
    // staff-only "Left the squad" group pass includeLeft: true and tag the
    // name. Spec: claude/specs/2026-09-02-player-leavers-design.md §4.
    if (!includeLeft) query = query.is('left_at', null)
    return query
  }

  // ⚠️ `id` IS THE TIEBREAK AND IT IS LOAD-BEARING, NOT TIDINESS. `.range()` is
  // OFFSET/LIMIT, and `full_name` is NOT unique — a club with two Sam Ahmeds is
  // ordinary, and this app deliberately holds no squad numbers to tell them
  // apart. With `full_name` alone the sort is under-specified, so Postgres may
  // order those rows differently between two requests: one player returned
  // twice and another dropped, with no error anywhere. Exactly the trap
  // listEvents documents for two fixtures sharing a kick-off.
  const homeRows = await fetchAllPages(
    buildQuery,
    [
      ['full_name', { ascending: true }],
      ['id', { ascending: true }],
    ],
    'players',
    'Scope the query to a squad by passing `teamIds`.',
  )

  // No team filter: the pre-senior-squads shape, byte for byte. No
  // membership query, no `guest_of`.
  if (!Array.isArray(teamIds) || teamIds.length === 0) return homeRows

  const homeWithFlag = homeRows.map((row) => ({ ...row, guest_of: null }))
  const homeIds = new Set(homeWithFlag.map((row) => row.id))

  // ⚠️ ACTIVE ONLY, AND player_id NOT NULL. A membership row can carry a
  // parent-only role with no player_id yet (the invite exists before the
  // child does), and a 'left' status is exactly the case the CONTROL in
  // tests/players-list-membership.test.js proves stays invisible — dropping
  // this .eq is the fault that test is built to catch.
  const { data: memberships, error: membershipError } = await supabase
    .from('memberships')
    .select('player_id, team_id')
    .in('team_id', teamIds)
    .eq('status', 'active')
  if (membershipError) throw membershipError

  // playerId -> Set of requested team ids they hold an active membership in.
  // Home players are skipped here on purpose: their `guest_of` is already
  // decided (null), and a redundant membership row in their own home squad
  // must never turn them into a guest of themselves.
  const membershipMap = new Map()
  for (const row of memberships ?? []) {
    if (!row.player_id || homeIds.has(row.player_id)) continue
    if (!membershipMap.has(row.player_id)) membershipMap.set(row.player_id, new Set())
    membershipMap.get(row.player_id).add(row.team_id)
  }

  const guestIds = [...membershipMap.keys()]
  const guestRows =
    guestIds.length === 0
      ? []
      : await fetchByIds(guestIds, async (chunk) => {
          let query = supabase.from('players').select('*').in('id', chunk)
          // Same left_at rule as the home fetch above, so a guest who has
          // left is hidden exactly as a home leaver would be.
          if (!includeLeft) query = query.is('left_at', null)
          const { data, error } = await query
          if (error) throw error
          return data ?? []
        })

  const guestWithFlag = guestRows.map((row) => {
    const heldTeams = membershipMap.get(row.id)
    // The FIRST requested team, in `teamIds` order, that this player is
    // actually a guest of — not just any of them.
    const guestOf = teamIds.find((teamId) => heldTeams?.has(teamId)) ?? null
    return { ...row, guest_of: guestOf }
  })

  // Merge and re-sort in JS with the same comparator the database used, so
  // the order contract (full_name, then id) holds across the merge of two
  // separate queries.
  return [...homeWithFlag, ...guestWithFlag].sort((a, b) => {
    const byName = (a.full_name ?? '').localeCompare(b.full_name ?? '')
    if (byName !== 0) return byName
    return (a.id ?? '').localeCompare(b.id ?? '')
  })
}

/**
 * Which squads (beyond a player's home squad) each player is an ACTIVE
 * member of — the "from U18B" mark on a guest row.
 *
 * Returns a Map<playerId, teamId[]>, excluding the player's home `team_id`:
 * a redundant membership row in a player's own squad is not a second squad
 * to show. `[]` input returns an empty Map without querying, matching the
 * convention `listPlayers({teamIds})`/`listContactsForPlayers` already use.
 */
export async function listPlayerSquads(playerIds) {
  const ids = [...new Set((playerIds ?? []).filter(Boolean))]
  if (ids.length === 0) return new Map()

  const [players, memberships] = await Promise.all([
    fetchByIds(ids, async (chunk) => {
      const { data, error } = await supabase.from('players').select('id, team_id').in('id', chunk)
      if (error) throw error
      return data ?? []
    }),
    fetchByIds(ids, async (chunk) => {
      const { data, error } = await supabase
        .from('memberships')
        .select('player_id, team_id')
        .in('player_id', chunk)
        .eq('status', 'active')
      if (error) throw error
      return data ?? []
    }),
  ])

  const homeByPlayer = new Map(players.map((row) => [row.id, row.team_id]))
  const map = new Map()
  for (const row of memberships) {
    if (!row.player_id || !row.team_id) continue
    if (homeByPlayer.get(row.player_id) === row.team_id) continue
    if (!map.has(row.player_id)) map.set(row.player_id, [])
    const list = map.get(row.player_id)
    if (!list.includes(row.team_id)) list.push(row.team_id)
  }
  return map
}

/**
 * Writes one player's season jersey number, or clears it with null.
 *
 * ⚠️ REFUSES BEFORE THE REQUEST when the number is out of range — the same
 * "ask before the network" shape setTeamDefaultFormat uses for tournament
 * format, so a bad value never round-trips to the database at all.
 *
 * ⚠️ A UNIQUE VIOLATION (23505) IS TRANSLATED, NOT REPEATED. The database's
 * `players_team_jersey_unique` index is what actually enforces "no two
 * players share a number in one squad" — this function's job is to turn
 * that constraint name into a sentence a coach can act on, by looking up who
 * holds the number in the same squad and naming them via
 * jerseyClashMessage(). Two lookups (the player's own team_id, then the
 * holder) rather than one, because the failed update told us nothing about
 * which squad the clash happened in.
 *
 * ⚠️ `data === null && error === null` IS AN RLS REFUSAL, not success — the
 * same "perfectly successful nothing" every other writer in this module
 * documents.
 */
export async function setPlayerJerseyNumber(playerId, number) {
  if (!playerId) throw new Error('We could not save that number.')
  if (number !== null && !isJerseyNumber(number)) {
    throw new Error('A jersey number is 1 to 99, or blank to clear it.')
  }

  const { data, error } = await supabase
    .from('players')
    .update({ jersey_num: number })
    .eq('id', playerId)
    .select('id, team_id')
    .maybeSingle()

  if (error?.code === '23505') {
    // ⚠️ NAME THE HOLDER. A constraint name is not a sentence a coach can
    // act on.
    const { data: me } = await supabase.from('players').select('team_id').eq('id', playerId).maybeSingle()
    const { data: holder } = await supabase
      .from('players')
      .select('full_name')
      .eq('team_id', me?.team_id)
      .eq('jersey_num', number)
      .maybeSingle()
    throw new Error(jerseyClashMessage(number, holder?.full_name ?? 'another player'))
  }
  if (error) throw new Error(friendlyMessage(error, 'We could not save that number.'))
  if (!data) throw new Error("We couldn't save that. Only squad staff can change a jersey number.")
  return data
}

/**
 * Loads one player's contact row, or null when RLS returns nothing (the
 * expected outcome for a parent who isn't a coach/admin of that player's
 * team and isn't the player themselves — not an error). Uses maybeSingle()
 * rather than single(), which would throw on zero rows.
 */
export async function getPlayerContact(playerId) {
  const { data, error } = await supabase
    .from('player_contacts')
    .select('*')
    .eq('player_id', playerId)
    .maybeSingle()
  if (error) throw error
  return data ?? null
}

/**
 * Lists contact rows for many players in one query — used by the Overview
 * screen to compute, per team, how many players have no contact record at
 * all (a player id with no row in the returned set). Selects only the three
 * columns the caller needs (not '*') since this is an aggregate-presence
 * check, not a form load — src/screens/PlayerForm.jsx's per-player load via
 * getPlayerContact still uses '*' for its own different purpose.
 *
 * An empty playerIds array returns [] without querying, matching the same
 * convention as listPlayers({teamIds})/listEvents({teamIds}).
 */
export async function listContactsForPlayers(playerIds) {
  // ⚠️ CHUNKED SINCE 12 Aug 2026, AND THIS BREAKS BEFORE listPlayers DOES.
  // PostgREST takes `.in()` as a query STRING, so every uuid costs ~37 bytes of
  // URL. Measured against this project: 300 ids is an 11KB URL and works, 400
  // is 15KB and the fetch THROWS — not a clean status, a connection failure
  // that reads as a bad network rather than a request built wrong. A full club
  // (fifteen squads, ~25 players each) is ~375, which lands on that cliff.
  // See MAX_IN_LIST in ./limits.js for the measurements.
  return fetchByIds(playerIds, async (chunk) => {
    const { data, error } = await supabase
      .from('player_contacts')
      .select('player_id, phone, email')
      .in('player_id', chunk)
    if (error) throw error
    return data ?? []
  })
}

// A write the database refused is not an error as far as PostgREST is
// concerned: RLS filters the row out, the statement affects zero rows, and
// the response is a perfectly successful "nothing". Every writer below asks
// for the affected row back and treats "no row" as a refusal, so the form
// shows a real message instead of a false "Saved" — the same mechanism
// src/data/events.js uses, and for the same reason. It is a *reporting*
// mechanism, not access control: the players table's "player edit" policy
// and player_contacts' "contact edit" policy (both ALL, USING and WITH CHECK
// `can_edit_team(...)`) are what actually decide, server-side.
//
// The two messages are deliberately different. players and player_contacts
// are separate tables behind separate policies, and the whole reason this
// module keeps them separate is that a contact refusal must never be
// reported as — or silently folded into — a player save.
const REFUSED_PLAYER =
  "We couldn't save that player. You may not have permission to change this squad."
const REFUSED_PLAYER_DELETE =
  "We couldn't delete that player. You may not have permission to change this squad."
// Says nothing about the player write: this module does not know whether one
// happened. Framing the failure ("the player saved, the contact didn't") is
// PlayerForm's job, because only the form knows what it did first.
const REFUSED_CONTACT =
  "We couldn't save the contact details. You may not have permission to change them."

/**
 * Creates or updates one player. Inserts when `player` has no id, updates the
 * matching row when it has one — the id is used only as the filter and is
 * never sent as a column either way. Returns the saved row, which is how a
 * caller learns a newly-inserted player's id (upsertContact needs it).
 *
 * There is deliberately no jersey_num here: the club does not use squad
 * numbers (see src/lib/playerFormat.js). The column stays in the schema and
 * nothing writes it.
 *
 * PLAYER_INSERT_NO_PARENT_ROW — this insert, and insertPlayers below, create
 * a child without a parent membership. Needs Attention counts
 * public.player_parents, so a coach saving with an empty parents editor, or
 * a paste of names, still tags the child. That is the truth. A parent-role
 * membership is what writes the row: private.memberships_write_parent_row.
 */
export async function upsertPlayer(player) {
  return upsertById('players', player, { refusedMessage: REFUSED_PLAYER })
}

/**
 * Records a gender against a player the CALLER OWNS (their own child, or
 * themselves), via the set_own_player_gender RPC.
 *
 * ⚠️ NOT `upsertPlayer({ id, gender })`. A parent holds no write on
 * public.players at all — the only write policy is `player edit`, gated on
 * can_edit_team — so that call would come back with zero rows and surface as
 * REFUSED_PLAYER. Adding an owner-update policy to fix that is the trap:
 * RLS grants access to ROWS, not COLUMNS, so it would hand the parent
 * team_id as well and make "move my child into another squad" a legitimate
 * write. The RPC has a hard-coded column list, so gender is the only thing
 * it can touch whatever this function sends. Exactly the same shape and
 * reasoning as setOwnPlayerPhoto in src/data/photos.js.
 *
 * Coaches and admins never come through here: they have a normal row-level
 * update and use upsertPlayer.
 */
export async function setOwnPlayerGender(playerId, gender) {
  if (!playerId) throw new Error('setOwnPlayerGender needs a player_id.')

  const { data, error } = await supabase.rpc('set_own_player_gender', {
    _player: playerId,
    _gender: gender ?? null,
  })

  if (error) throw error
  return data ?? null
}

const REFUSED_BULK =
  "We couldn't add those players. You may not have permission to change one of those squads."

/**
 * Inserts many players in one statement and returns the inserted rows.
 *
 * This is NOT upsertPlayer in a loop, and the difference is worth stating
 * because it changes what failure means. PostgREST sends a multi-row insert as
 * a single statement, so an RLS WITH CHECK violation on ANY row aborts the
 * whole thing — Postgres raises, rather than filtering the offending row out
 * the way a SELECT policy would. There is therefore no such thing as a partial
 * success here: either every row lands or none do.
 *
 * That is the honest behaviour to build on, so the caller's job is to make
 * refusals impossible before calling — src/lib/playerImport.js checks every
 * pasted row's team against canEditTeam and marks the bad ones invalid in the
 * preview. This message is the backstop for the case that check missed, and it
 * says "nothing was added" rather than implying some players got through.
 *
 * A row-at-a-time loop would give genuinely per-row outcomes, at the cost of N
 * round trips and a half-imported squad to reconcile when the tenth of forty
 * fails. Rejected deliberately: a clean all-or-nothing failure the user can
 * retry after fixing the preview is easier to reason about than a partial
 * write they have to diff by hand.
 */
export async function insertPlayers(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return []

  const { data, error } = await supabase.from('players').insert(rows).select()
  if (error) throw error
  if (!data || data.length === 0) throw new Error(REFUSED_BULK)
  return data
}

/**
 * Deletes one player by id. Resolves with nothing on success and throws when
 * the delete failed or removed nothing.
 *
 * Only the players row is deleted: player_contacts.player_id is a foreign key
 * declared ON DELETE CASCADE, so the contact row goes with it, atomically and
 * server-side. Issuing a second client-side delete would add a failure mode
 * the database does not have (contact deleted, player left behind).
 *
 * ⚠️ THE PHOTO IS NOT A CASCADE AND CANNOT BE ONE, WHICH IS WHY IT IS DONE HERE
 * BY HAND. A storage object is not a row with a foreign key to this one — and
 * `storage.objects` refuses direct SQL deletion outright (`protect_delete`,
 * 42501), so no trigger, cascade or database function can reach it. The Storage
 * API is the only route, which means a CLIENT has to do it. See RESTORE.md.
 *
 * ⚠️ UNTIL 16 Aug 2026 IT WAS SIMPLY NOT DONE, and a deleted child's photograph
 * outlived their record indefinitely, in a private bucket, with nothing pointing
 * at it. That is a safeguarding problem rather than an untidy one.
 *
 * ⚠️ ROW FIRST, OBJECT SECOND — the ordering `AdminStaff` settled for the same
 * reason. If the row delete is refused there is nothing to clean up and the
 * photo must survive; if the object delete fails afterwards the result is an
 * orphan, which is recoverable and which the nightly scan reports. The reverse
 * order risks a live row pointing at a file that no longer exists, which is a
 * broken face on a screen rather than a tidy-up job.
 */
export async function deletePlayer(id) {
  const { data, error } = await supabase.from('players').delete().eq('id', id).select()
  if (error) throw error
  if (!data || data.length === 0) throw new Error(REFUSED_PLAYER_DELETE)

  // ⚠️ BEST-EFFORT, AND DELIBERATELY NOT AWAITED INTO THE CALLER'S ERROR PATH.
  // `deletePlayerPhoto` swallows its own failures by design: the player IS
  // deleted by this point, so reporting "could not delete" would tell a coach
  // the removal failed when it did not.
  const photoPath = data[0]?.photo_path
  if (photoPath) await deletePlayerPhoto(photoPath)
}

/**
 * Marks a player as LEFT — the club's answer to "the child quit". Never a
 * delete: attendance, selection and grades keep pointing at a real name.
 * The database (mark_player_left) decides who may do this — squad staff or a
 * child-write admin — and also flips this child's parent/player memberships
 * to 'left', which every access check treats as no access.
 *
 * ⚠️ ROW FIRST, OBJECT SECOND, exactly as deletePlayer: the RPC clears the
 * row's photo columns and hands back the old path; the storage object is
 * then removed best-effort. A refused RPC touches nothing.
 */
export async function markPlayerLeft(id) {
  const { data, error } = await supabase.rpc('mark_player_left', { p_player_id: id })
  if (error) throw error
  const photoPath = Array.isArray(data) ? data[0]?.photo_path : data?.photo_path
  if (photoPath) await deletePlayerPhoto(photoPath)
}

/** Undoes markPlayerLeft: clears left_at and reactivates the family's memberships. */
export async function restorePlayer(id) {
  const { data, error } = await supabase.rpc('restore_player', { p_player_id: id })
  if (error) throw error
  return data
}

/**
 * Creates or updates one player's contact row. Returns the saved row.
 *
 * player_id is player_contacts' PRIMARY KEY, so this is a genuine ON CONFLICT
 * upsert rather than the id-present/id-absent branch upsertPlayer uses: a
 * single statement, with no select-then-insert-or-update window in which two
 * coaches editing the same player could both decide "no row exists" and race
 * to insert. The conflict target is named explicitly rather than left to
 * PostgREST's primary-key inference, so this keeps updating in place if the
 * table ever gains a second unique constraint.
 *
 * Nulls are written through, not skipped — clearing a wrong phone number has
 * to actually clear it. Deciding whether there is anything worth writing at
 * all is the caller's job (see src/screens/PlayerForm.jsx), not this
 * function's.
 */
export async function upsertContact(contact) {
  const { player_id: playerId, phone = null, email = null } = contact ?? {}
  // Without a key this would insert an orphan row (or fail obscurely at the
  // NOT NULL constraint); refuse before touching the network.
  if (!playerId) throw new Error('upsertContact needs a player_id.')

  const { data, error } = await supabase
    .from('player_contacts')
    .upsert({ player_id: playerId, phone, email }, { onConflict: 'player_id' })
    .select()
    .maybeSingle()

  if (error) throw error
  if (!data) throw new Error(REFUSED_CONTACT)
  return data
}

// ── public.player_private ──────────────────────────────────────────────────
//
// ⚠️ A SEPARATE TABLE, AND THE SEPARATION IS THE SAFEGUARDING PROPERTY RATHER
// THAN TIDINESS. `player read` is squad-wide, and RLS grants ROWS not COLUMNS,
// so a date_of_birth column on `players` would be readable by every parent in
// the squad — a directory of every child's birthday. Its policies are the pair
// `player_parents` runs: staff for that squad, or the child's own family.
// See db/migrations/20260816_player_private_dob.sql.
//
// ⚠️ AN EMPTY RESULT IS THE NORMAL OUTCOME FOR SOMEBODY LOOKING AT A TEAM-MATE,
// not an error. Nothing here interprets that — the screen decides.

/**
 * Writes one child's date of birth, and — when the family agreed to it — that
 * they are playing up an age group. Upserts, because the row is keyed on the
 * player and a correction is the common case.
 *
 * `dob` is an ISO date string (YYYY-MM-DD) or null. Null CLEARS it rather than
 * being ignored: a birthday entered wrongly must be removable by the family who
 * entered it.
 *
 * ⚠️ `playsUp` IS A DECISION BEING RECORDED, NOT A FACT BEING DERIVED. The
 * birthday and the squad say a play-up is POSSIBLE; this says a parent ticked
 * the box. Working it out from the two columns instead would record a consent
 * nobody gave — and the column exists precisely so the club can show somebody
 * agreed. See db/migrations/20260817_player_private_plays_up.sql.
 *
 * ⚠️ FALSE CLEARS IT, for the same reason a null date does: a tick given by
 * mistake, or a birthday corrected so the play-up no longer applies, must be
 * removable by the people who entered it. A stale "playing up" on a child who is
 * not is worse than none, because it is the flag a coach acts on.
 */
export async function setPlayerDob(playerId, dob, { playsUp = false } = {}) {
  if (!playerId) throw new Error('setPlayerDob needs a player.')

  const { data, error } = await supabase
    .from('player_private')
    .upsert(
      {
        player_id: playerId,
        date_of_birth: dob || null,
        plays_up_confirmed_at: playsUp ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'player_id' },
    )
    .select('player_id, date_of_birth, plays_up_confirmed_at')
    .maybeSingle()

  if (error) throw error
  return data ?? null
}

/**
 * The private rows for many children at once. Returns ROWS, like every other
 * `*ForPlayers` reader here — the caller indexes them.
 *
 * Used by the approval queue to mark a pending registration as playing up: the
 * coach who has to act on it is the person who needs to know.
 *
 * ⚠️ A MISSING ROW IS THE NORMAL ANSWER, NOT AN ERROR. RLS gives staff their own
 * squads and a family their own child, so a list spanning squads legitimately
 * comes back partial — and a child with no birthday on file has no row at all.
 * Nothing here interprets that; the screen decides.
 */
export async function listPlayerPrivate(playerIds) {
  return fetchByIds(playerIds, async (chunk) => {
    const { data, error } = await supabase
      .from('player_private')
      .select('player_id, date_of_birth, plays_up_confirmed_at')
      .in('player_id', chunk)
    if (error) throw error
    return data ?? []
  })
}

/**
 * Writes ONE child's date of birth and nothing else — the writer every EDIT
 * surface uses.
 *
 * ⚠️ IT EXISTS BECAUSE setPlayerDob ABOVE CLEARS THE PLAY-UP AGREEMENT, AND THAT
 * IS CORRECT THERE AND WRONG HERE. That function takes `playsUp` and writes
 * `plays_up_confirmed_at: playsUp ? now : null` — so calling it to fix a typo in
 * a birthday silently erases a parent's recorded consent. Right for the
 * registration form, which always supplies both answers together; wrong for a
 * coach correcting a date, who is not being asked about consent at all and must
 * not be able to withdraw it by accident.
 *
 * ⚠️ MEASURED, NOT ASSUMED — 17 Aug 2026, against production inside a
 * rolled-back transaction, on an invented child with an agreement on file:
 *
 *   setPlayerDob(id, dob) as it stands ....... birthday updated, agreement ERASED
 *   this function .......................... birthday updated, agreement KEPT
 *   this function, no row yet (control) ..... row inserted correctly
 *
 * The control matters: omitting a column from an upsert leaves it alone on
 * CONFLICT, and takes its default on INSERT. Both paths were checked, because a
 * writer that only worked for existing rows would fail for exactly the 26
 * children who have none.
 *
 * `dob` may be null, which CLEARS the birthday — same rule as setPlayerDob: a
 * date entered wrongly must be removable by the people who entered it.
 */
export async function updatePlayerDob(playerId, dob) {
  if (!playerId) throw new Error('updatePlayerDob needs a player.')

  const { data, error } = await supabase
    .from('player_private')
    .upsert(
      {
        player_id: playerId,
        date_of_birth: dob || null,
        updated_at: new Date().toISOString(),
        // ⚠️ plays_up_confirmed_at IS DELIBERATELY ABSENT. Adding it here — even
        // as null, even "to be explicit" — reintroduces the exact bug this
        // function exists to avoid.
      },
      { onConflict: 'player_id' },
    )
    .select('player_id, date_of_birth, plays_up_confirmed_at')
    .maybeSingle()

  if (error) throw error
  return data ?? null
}

/**
 * WHICH children have a private row at all — the ids, and nothing else.
 *
 * ⚠️ THIS EXISTS SO THAT THE ADMIN GAP LIST NEVER PULLS A SINGLE BIRTHDAY. That
 * screen asks one question of every child in the club — "is there a date of
 * birth on file?" — and `listPlayerPrivate` would answer it by fetching every
 * date of birth the reader is entitled to, into a browser, to be discarded. The
 * answer needs the presence of the row, not its contents.
 *
 * The whole point of `player_private` being a separate table is that a
 * team-mate's parent cannot read a birthday (see its migration). A club-wide
 * sweep that hoovers up the lot on behalf of an admin who only wanted a count is
 * the same mistake from the other end — permitted by RLS, and still more data in
 * more places than the question required.
 *
 * ⚠️ RETURNS A Set OF player_id, DELIBERATELY, so that there is nothing on the
 * object for a later caller to start reading. A row list would grow a column the
 * first time somebody wanted one.
 */
export async function listPlayerPrivatePresence(playerIds) {
  const rows = await fetchByIds(playerIds, async (chunk) => {
    const { data, error } = await supabase
      .from('player_private')
      .select('player_id')
      .in('player_id', chunk)
    if (error) throw error
    return data ?? []
  })
  return new Set(rows.map((row) => row.player_id))
}

/**
 * One child's date of birth, or null.
 *
 * ⚠️ NULL MEANS "we cannot see it OR it is not set", and the caller must not
 * distinguish them. A parent reading a team-mate gets null from RLS and a child
 * with no birthday on file gets null from the column; treating the first as an
 * error would show a parent a failure every time they opened a squad list.
 */
export async function getPlayerDob(playerId) {
  if (!playerId) return null

  const { data, error } = await supabase
    .from('player_private')
    .select('player_id, date_of_birth')
    .eq('player_id', playerId)
    .maybeSingle()

  if (error) throw error
  return data?.date_of_birth ?? null
}
