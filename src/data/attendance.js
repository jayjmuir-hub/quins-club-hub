import { supabase } from '../lib/supabase'
import { fetchByIds, withCap, unwrapCapped } from './limits.js'

// Data access for the attendance table — who actually turned up.
//
// ⚠️ THIS IS NOT src/data/availability.js AND MUST NOT BECOME IT. Availability
// is RSVP: intent, collected before the event, set by the player or their
// parent. Attendance is the fact, recorded afterwards, and only a coach may
// write it. They share a grain — (event, player) — and nothing else. The
// reasoning for keeping them apart is in
// db/migrations/20260810_attendance.sql; the short version is that one row
// with two different write authorities is a column-grant problem, and this
// session spent an afternoon on how invisible those are.
//
// RLS decides everything here: `attendance read` is
// can_edit_team(...) OR is_own_player(...), and the three write policies are
// can_edit_team only. Nothing in this file filters for permission, and nothing
// in it could widen what comes back.
//
// Follows the throw-on-error convention of the rest of src/data/: callers get
// a thrown Error, never a {data, error} tuple, and [] rather than null.

export const ATTENDANCE_STATUSES = ['present', 'absent', 'excused']

/**
 * The register for one event: every attendance row the caller may see.
 *
 * ⚠️ A COACH GETS THE SQUAD, A PARENT GETS ONE ROW, and neither is an error.
 * A parent legitimately reads a single row here — the same shape as
 * getPlayerContact returning null for someone who may not see it. A caller
 * that treats "fewer rows than players" as a failure will be wrong for every
 * parent in the club.
 */
export async function listAttendance(eventId) {
  if (!eventId) return []

  const query = supabase
    .from('attendance')
    .select('id, event_id, player_id, status, recorded_by, recorded_at')
    .eq('event_id', eventId)

  const { data, error } = await withCap(query)
  if (error) throw error
  return unwrapCapped(
    data,
    'attendance records',
    'This is one event’s register, so hitting the cap means a squad larger than the limit.',
  )
}

/**
 * One player's attendance history, newest first — the basis for every
 * "attendance percentage" question.
 *
 * ⚠️ THE PERCENTAGE IS present / (present + absent). `excused` is deliberately
 * excluded from BOTH sides rather than counted as an absence: a player away
 * injured or on holiday did not choose to miss it, and a ranked "lowest
 * attendance" list that counts them would put the recently injured at the
 * bottom and call it commitment. Whoever computes that ratio should read this
 * comment first — the column exists precisely so the sum can be honest.
 */
export async function listAttendanceForPlayer(playerId) {
  if (!playerId) return []

  const query = supabase
    .from('attendance')
    .select('id, event_id, player_id, status, recorded_at')
    .eq('player_id', playerId)
    .order('recorded_at', { ascending: false })

  const { data, error } = await withCap(query)
  if (error) throw error
  return unwrapCapped(
    data,
    'attendance records',
    'Narrow it to a season before reading a whole career.',
  )
}

/**
 * Attendance across many events in one query — the Squad Hub's tracking grid,
 * which needs the register for a whole season of one squad, not one event at
 * a time the way listAttendance(eventId) does.
 *
 * ⚠️ CHUNKED WITH fetchByIds, exactly like listAvailabilityForEvents and for
 * the measured reason recorded there: PostgREST takes `.in()` as a query
 * STRING, ~37 bytes of URL per uuid — 300 ids works, 400 makes the fetch
 * THROW a connection error. An empty eventIds array returns [] without
 * querying; empty input must never be read as "no filter, return everything".
 *
 * RLS still decides everything: a coach gets their squad's rows, anyone else
 * gets whatever `attendance read` allows, and fewer rows than expected is a
 * normal answer, not an error.
 */
export async function listAttendanceForEvents(eventIds) {
  return fetchByIds(eventIds, async (chunk) => {
    const { data, error } = await supabase
      .from('attendance')
      .select('id, event_id, player_id, status, recorded_at')
      .in('event_id', chunk)
    if (error) throw error
    return data ?? []
  })
}

// A write the database refused is not an error as far as PostgREST is
// concerned: RLS filters the row out, the statement affects zero rows, and the
// response is a perfectly successful "nothing". So the writer below asks for
// the row back and treats "no row" as a refusal — the same mechanism
// src/data/events.js and src/data/players.js use, and for the same reason.
//
// It is a REPORTING mechanism, not access control: the three `attendance
// write ...` policies are what actually decide, server-side, and nothing here
// can widen them.
const REFUSED =
  "We couldn't save that register. You may not have permission to record attendance for this squad."

/**
 * Records or corrects one player's attendance for one event.
 *
 * ⚠️ AN UPSERT ON (event_id, player_id), WHICH THE UNIQUE CONSTRAINT MAKES
 * SAFE. Taking the register twice must CORRECT the first answer, not append a
 * second one — a coach who miscounts and re-runs it would otherwise create two
 * contradictory rows for the same child and no way to tell which is current.
 */
export async function setAttendance(eventId, playerId, status) {
  if (!eventId || !playerId) throw new Error('setAttendance needs an event and a player.')
  if (!ATTENDANCE_STATUSES.includes(status)) {
    // Caught here rather than at the CHECK constraint so the message names the
    // allowed values instead of surfacing a Postgres 23514.
    throw new Error(`Attendance status must be one of ${ATTENDANCE_STATUSES.join(', ')}.`)
  }

  const { data, error } = await supabase
    .from('attendance')
    .upsert(
      { event_id: eventId, player_id: playerId, status },
      { onConflict: 'event_id,player_id' },
    )
    .select()
    .maybeSingle()

  if (error) throw error
  if (!data) throw new Error(REFUSED)
  return data
}

/**
 * Removes an attendance record, so "recorded by mistake" is distinguishable
 * from "recorded as absent". Those are different facts and the register must
 * be able to say so.
 */
export async function clearAttendance(eventId, playerId) {
  const { data, error } = await supabase
    .from('attendance')
    .delete()
    .eq('event_id', eventId)
    .eq('player_id', playerId)
    .select()

  if (error) throw error
  // Deleting a row that was never there is not a refusal — it is the
  // already-desired state. Only a refusal on an EXISTING row would return []
  // here too, which is why this does not throw: the register re-reads after
  // every write, so a refused delete shows up as the row still being there.
  return data ?? []
}
