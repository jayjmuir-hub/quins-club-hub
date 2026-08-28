import { supabase } from '../lib/supabase'
import { subscribeToTable, REALTIME_DEBOUNCE_MS } from './subscribeToTable.js'

// The noticeboard. Migration: db/migrations/20260814_announcements.sql.
// Plan: claude/plans/2026-08-14-notices.md (phase 1 — in-app only).
//
// ⚠️ NOTHING HERE SENDS EMAIL, AND ADDING IT IS NOT A SMALL CHANGE. The club
// went to Resend Pro on 13 Aug and the 100/day ceiling — a brake nobody
// designed — went with it. Notice email waits for `email_outbox` and a
// preferences/unsubscribe table so that the first feature able to mail the whole
// club is built after the thing that can stop it. A `.then(sendMail)` bolted on
// here would be exactly the runaway that cap used to catch.
//
// ⚠️ SCOPE IS `team_id`, AND NULL MEANS THE WHOLE CLUB. Never the squad's name.
//
// House conventions (RESTORE.md §Data access conventions): these functions
// THROW on error rather than returning {data, error}, return [] not null, and
// this module imports no React.

// ⚠️ `author:profiles!announcements_author_id_fkey(full_name)` NAMES THE
// CONSTRAINT, not the table. `announcements` has two uuid columns pointing at
// people-shaped tables and PostgREST cannot guess which relationship is meant —
// an unnamed embed either fails or silently picks one.
//
// ⚠️ THE AUTHOR'S TITLE IS NOT HERE AND CANNOT BE. `memberships.title` is on a
// row a member may not read (`memb read` is own-row or admin), so embedding it
// would return null for exactly the people the card is for. The title on the
// Home card comes from `my_squad_staff`, which is SECURITY DEFINER and already
// loaded for the squad-contacts block.
const SELECT = `
  id, club_id, team_id, group_id, author_id, title, body, pinned,
  expires_at, created_at, updated_at,
  author:profiles!announcements_author_id_fkey(full_name)
`

/**
 * Every notice the caller may see, newest first.
 *
 * ⚠️ RLS DECIDES THE ROWS, NOT THIS FUNCTION. A member gets their squads', an
 * admin gets the club's. There is deliberately no "am I an admin" branch here —
 * a client-side branch would be a second, weaker copy of the policy.
 *
 * ⚠️ EXPIRED NOTICES COME BACK. The policy returns them on purpose (the author
 * needs to see what was sent); `src/lib/notices.js` decides what a member is
 * shown. Do not add an `expires_at` filter here — the receipts screen reads
 * through this same function.
 */
export async function listNotices() {
  const { data, error } = await supabase
    .from('announcements')
    .select(SELECT)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data ?? []
}

/**
 * Which notices this person has already read.
 *
 * Returns a Set of announcement ids. ⚠️ RLS limits this to the caller's own
 * rows ("announcement read own reads"), so no filter is needed and adding one
 * would be a second copy of the policy.
 */
export async function listMyReads() {
  const { data, error } = await supabase
    .from('announcement_reads')
    .select('announcement_id')

  if (error) throw error
  return new Set((data ?? []).map((row) => row.announcement_id))
}

/**
 * Marks a notice read.
 *
 * ⚠️ AN UPSERT THAT IGNORES DUPLICATES, NOT AN INSERT. Opening the board again
 * re-marks everything on it, and the primary key is what deduplicates — so a
 * plain insert would throw 23505 on the second visit, on the most ordinary
 * action in the feature.
 *
 * ⚠️ `read_at` IS THEREFORE FIRST-READ, NOT LAST-READ, which is what the word
 * means. There is no UPDATE policy on the table, so a read cannot be un-read or
 * back-dated even by the person who owns it.
 *
 * ⚠️ IT DOES NOT THROW. Failing to record a read must never break the screen
 * that is showing the notice — the person has read it either way, and the only
 * casualty is a coach's count being one low. Every other function in this
 * module throws, and this one deliberately does not.
 */
export async function markNoticesRead(profileId, announcementIds) {
  if (!profileId || !announcementIds?.length) return

  const rows = announcementIds.map((id) => ({
    announcement_id: id,
    profile_id: profileId,
  }))

  const { error } = await supabase
    .from('announcement_reads')
    .upsert(rows, { onConflict: 'announcement_id,profile_id', ignoreDuplicates: true })

  if (error) {
    // Deliberately swallowed — see above. Logged so it is not invisible.
    console.warn('Could not record notices as read:', error.message)
  }
}

/**
 * Posts a notice to one squad, several squads, or the whole club.
 *
 * ⚠️ `club_id` AND `author_id` ARE DELIBERATELY ABSENT FROM THE PAYLOAD. A
 * BEFORE INSERT trigger stamps both from the caller's own session. Adding them
 * here would not make them settable — the trigger overwrites — but it would
 * make this file look like they are, which is how the next person reintroduces
 * the hole.
 *
 * ⚠️ SEVERAL SQUADS IS A FAN-OUT: ONE ROW EACH, SHARING A `group_id`.
 * `team_id` is the security boundary — `announcement read` keys on it and so
 * does `private.notice_audience` — so a junction table would be a rewrite of
 * the read path AND the boundary. Same answer, same reasoning, as
 * `claude/decisions/2026-08-05-multi-squad-events-and-pitch.md` gave for events.
 *
 * ⚠️ AND IT MUST BE **ONE** `.insert([...])` CALL, NOT A LOOP. The push trigger
 * is STATEMENT-level with a transition table: it sends one notification per
 * group per statement. A loop would be N statements, which is N notifications,
 * which is the duplicate-buzz this whole arrangement exists to prevent —
 * measured 21 Aug 2026, seven people sit in two squads.
 *
 * `teamIds` empty (or a single null) posts to the whole club, which the policy
 * allows only to an admin. `teamId` is still accepted for the single-squad
 * callers that predate this.
 */
export async function createNotice({
  title,
  body,
  teamId = null,
  teamIds = null,
  pinned = false,
  expiresAt = null,
}) {
  const cleanTitle = (title ?? '').trim()
  const cleanBody = (body ?? '').trim()
  if (!cleanTitle) throw new Error('Give the notice a title.')
  if (!cleanBody) throw new Error('Write something in the notice.')

  // One list, however the caller expressed it. Falsy entries mean "whole club",
  // and a whole-club notice is a single row with no team — never a fan-out.
  const chosen = (Array.isArray(teamIds) ? teamIds : [teamId]).filter(Boolean)
  const clubWide = chosen.length === 0
  const unique = [...new Set(chosen)]

  const shared = {
    title: cleanTitle,
    body: cleanBody,
    pinned: Boolean(pinned),
    expires_at: expiresAt || null,
  }

  // ⚠️ `group_id` ONLY WHEN THERE IS ACTUALLY A GROUP. Stamping one on a
  // single-squad notice would be harmless today and a lie in every query that
  // later asks "was this sent to several squads".
  const groupId = unique.length > 1 ? crypto.randomUUID() : null
  const rows = clubWide
    ? [{ ...shared, team_id: null }]
    : unique.map((id) => ({ ...shared, team_id: id, group_id: groupId }))

  const { data, error } = await supabase.from('announcements').insert(rows).select(SELECT)

  if (error) throw error
  return rows.length === 1 ? data[0] : data
}

/**
 * Edits a notice.
 *
 * ⚠️ `team_id` IS NOT UPDATABLE AND MUST NOT BE OFFERED. `authenticated` holds
 * column privileges for exactly title, body, pinned and expires_at — a notice's
 * audience is fixed when it is posted, because widening a squad notice to the
 * whole club after thirty people have read it would leave the receipts counted
 * against an audience that never saw it. A form field for it would fail on save.
 *
 * ⚠️ ZERO ROWS IS A REFUSAL, NOT A SUCCESS. RLS filters an UPDATE rather than
 * failing it, so somebody without permission gets a cheerful 200 and no change.
 * The same trap `markIdea` and `withdrawRequest` both document.
 */
export async function updateNotice(id, { title, body, pinned, expiresAt }) {
  if (!id) throw new Error('updateNotice needs a notice id.')

  const patch = {}
  if (title !== undefined) {
    const clean = title.trim()
    if (!clean) throw new Error('Give the notice a title.')
    patch.title = clean
  }
  if (body !== undefined) {
    const clean = body.trim()
    if (!clean) throw new Error('Write something in the notice.')
    patch.body = clean
  }
  if (pinned !== undefined) patch.pinned = Boolean(pinned)
  if (expiresAt !== undefined) patch.expires_at = expiresAt || null

  const { data, error } = await supabase
    .from('announcements')
    .update(patch)
    .eq('id', id)
    .select('id')

  if (error) throw error
  if (!data || data.length === 0) {
    throw new Error('That notice could not be updated. You may not have permission.')
  }
  return data[0]
}

/**
 * Takes a notice down.
 *
 * ⚠️ Zero rows is a refusal here too. The author or an admin may delete;
 * `announcement_reads` goes with it by cascade, which is correct — a receipt
 * for a notice that no longer exists is not evidence of anything.
 */
export async function deleteNotice(id) {
  if (!id) throw new Error('deleteNotice needs a notice id.')

  const { data, error } = await supabase
    .from('announcements')
    .delete()
    .eq('id', id)
    .select('id')

  if (error) throw error
  if (!data || data.length === 0) {
    throw new Error('That notice could not be removed. You may not have permission.')
  }
  return true
}

/**
 * Audience and seen counts for every notice the caller authored, plus every
 * notice in the club if they are an admin.
 *
 * Returns a Map keyed by announcement id. ⚠️ ONE CALL FOR THE WHOLE LIST, not
 * one per notice — the function is SECURITY DEFINER and its own WHERE clause is
 * the gate, so a per-notice call would repeat that gate check for every row on
 * screen.
 *
 * ⚠️ AN EMPTY MAP IS THE NORMAL ANSWER FOR AN ORDINARY MEMBER, not an error.
 * The screen must render the board without counts rather than showing a failure.
 */
export async function noticeStats() {
  const { data, error } = await supabase.rpc('announcement_stats')
  if (error) throw error

  const byId = new Map()
  for (const row of data ?? []) byId.set(row.announcement_id, row)
  return byId
}

/**
 * Who a notice went to, and when each of them read it. Unread first.
 *
 * ⚠️ NAME ONLY — NO EMAIL, NO PHONE, NO ROLE. That is enforced by the function's
 * RETURNS TABLE in the migration, not by this file, and it is deliberately
 * narrower than `my_squad_staff`: staff opt in to being contactable when they
 * accept the position (Jay, 13 Aug 2026) and a parent opted into nothing of the
 * kind. "Who has not read my notice" is not a reason to hand a coach thirty
 * families' phone numbers.
 */
export async function noticeAudience(id) {
  if (!id) throw new Error('noticeAudience needs a notice id.')
  const { data, error } = await supabase.rpc('announcement_audience', { _announcement: id })
  if (error) throw error
  return data ?? []
}

// ── Realtime ────────────────────────────────────────────────────────────────

/**
 * Subscribes to realtime changes on `announcements`. Returns an unsubscribe
 * function — call it from a useEffect cleanup.
 *
 * ⚠️ THE PUBLICATION IS THE OTHER HALF, AND WITHOUT IT THIS DOES NOTHING.
 * Jay, 16 Aug 2026: "notices are not appearing instantly on home screen, they
 * only show up when i click refresh". `announcements` was not in
 * `supabase_realtime` — measured, one table in it, `events` — so Postgres
 * emitted no changes at all. See
 * db/migrations/20260816_realtime_publication_announcements.sql. This is the
 * exact bug `subscribeEvents` documents having shipped once already: correct
 * client code, silent socket, no error anywhere.
 *
 * ⚠️ NO `filter`, DELIBERATELY, AND THE OBVIOUS OPTIMISATION IS A BUG. Filtering
 * on `team_id` would break DELETEs: `announcements` is replica identity DEFAULT,
 * so a delete payload carries the primary key only, `team_id` is absent, the
 * filter matches nothing, and a notice taken down stays on everybody else's
 * screen. RLS already scopes delivery per subscriber, so a filter buys nothing
 * and costs that.
 *
 * ⚠️ THE PAYLOAD IS NOT PASSED ON. Callers get "something changed, re-read",
 * which is the only thing that stays correct once a burst is coalesced — a
 * debounced group of changes has no single meaningful payload.
 *
 * @param callback   invoked with NO arguments, at most once per debounce window
 * @param debounceMs injectable purely so tests need not wait in real time
 */
export function subscribeNotices(callback, { debounceMs = REALTIME_DEBOUNCE_MS } = {}) {
  return subscribeToTable('announcements', callback, { debounceMs })
}
