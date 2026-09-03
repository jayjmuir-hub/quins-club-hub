import { supabase } from '../lib/supabase.js'
import { wrapDbError } from '../lib/dbError.js'

// Channel seats (claude/plans/2026-09-03-channel-seats-and-committee.md):
// a SUPER seats a person in a role channel with a reason. Additive to the
// derived membership — private.in_role_channel answers "in or out", and a
// seat is one more way to be in. Who may seat is RLS's call
// (`seats write super` / `seats delete super`); any active member may READ
// the seats, because the member sheet explains every row.

/** Every seat in one channel for the caller's club: [{ id, profile_id, reason }]. */
export async function listChannelSeats(channel) {
  const { data, error } = await supabase
    .from('channel_seats')
    .select('id, club_id, profile_id, channel, reason, granted_by, created_at')
    .eq('channel', channel)
  if (error) throw wrapDbError(error, 'We could not load the seats just now.')
  return data ?? []
}

/** Seat one person. Refused by RLS for anyone but a super. */
export async function seatInChannel({ clubId, profileId, channel, reason }) {
  const text = reason?.trim() ?? ''
  if (!text) throw new Error('Say why they are being seated.')
  const { data, error } = await supabase
    .from('channel_seats')
    .insert({ club_id: clubId, profile_id: profileId, channel, reason: text })
    .select('id')
    .single()
  if (error) throw wrapDbError(error, 'Could not seat them.')
  return data
}

/** Remove one seat by id. Refused by RLS for anyone but a super. */
export async function unseatFromChannel(seatId) {
  const { error } = await supabase.from('channel_seats').delete().eq('id', seatId)
  if (error) throw wrapDbError(error, 'Could not remove that seat.')
}
