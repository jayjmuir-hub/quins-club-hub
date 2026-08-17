import { supabase } from '../lib/supabase'
import { fetchByIds } from './limits.js'

// Data access for public.membership_vouches — "do you know this person?",
// answered by the people already being asked to approve them.
//
// Item 8 of claude/plans/2026-08-16-account-creation-redesign.md.
//
// ⚠️ "I DON'T KNOW THEM" IS THE VALUABLE ANSWER, AND IT REJECTS NOBODY. It
// blocks no approval and hides no row. What it does is make an unrecognised
// adult asking to reach a children's squad visible AS unrecognised, instead of
// identical to everyone else in the queue. Nothing in this module should ever
// grow a way to turn it into a refusal — the refusal is a human's to make, on
// the same screen, with the Approve button they already have.
//
// ⚠️ ANSWERED IN THE APP, NEVER FROM AN EMAIL LINK. A one-click link acting on
// somebody's behalf without a session needs a token, and a token in an email is
// a credential in an email — forwarded, quoted in a reply, or in a mailbox
// somebody else opens. The migration's header has the full reasoning. There is
// no cost to requiring a session: the coach must sign in to approve anyway.
//
// RLS: readable and writable by exactly `private.can_approve_team` — admins plus
// the coaches and managers of that squad, the same set the notification emails.
// ⚠️ A MEDIC IS OUTSIDE IT, matching invite_parent: a medic cannot approve, so a
// medic's opinion must not sit in the queue looking like one that counts.

const REFUSED =
  "We couldn't save that. You may not be able to answer for this squad."

/**
 * Records the caller's answer about one pending request.
 *
 * ⚠️ AN UPSERT ON (membership, voucher), SO CHANGING YOUR MIND REPLACES RATHER
 * THAN ADDS. Two rows from one coach would count one opinion twice, and "I
 * thought I recognised the name, I don't" is a correction rather than a second
 * vote.
 *
 * ⚠️ `voucher_id` IS SENT AND IS ALSO PINNED BY THE POLICY. Sending it is what
 * makes the upsert's conflict target work; the `with check` on `vouch write own`
 * is what stops it being anybody else's id. Do not remove either — the first
 * would break the correction, the second would let a coach attribute an opinion
 * to a colleague.
 */
export async function setVouch({ membershipId, voucherId, clubId, teamId, answer } = {}) {
  if (!membershipId) throw new Error('setVouch needs a membership id.')
  if (!voucherId) throw new Error('setVouch needs a voucher id.')
  if (answer !== 'known' && answer !== 'unknown') {
    throw new Error('setVouch needs an answer of "known" or "unknown".')
  }

  const { data, error } = await supabase
    .from('membership_vouches')
    .upsert(
      {
        membership_id: membershipId,
        voucher_id: voucherId,
        club_id: clubId,
        team_id: teamId ?? null,
        answer,
        at: new Date().toISOString(),
      },
      { onConflict: 'membership_id,voucher_id' },
    )
    .select()
    .maybeSingle()

  if (error) throw error
  // A refused write comes back as a successful empty response, the same
  // silent-refusal shape every other writer in src/data handles.
  if (!data) throw new Error(REFUSED)
  return data
}

/**
 * Every answer for a set of pending requests. Returns ROWS, like the other
 * `*ForPlayers` readers — the caller indexes them.
 *
 * ⚠️ AN EMPTY RESULT IS THE NORMAL ANSWER for a request nobody has looked at
 * yet, and for a squad the caller cannot approve. Nothing here interprets that.
 */
export async function listVouches(membershipIds) {
  return fetchByIds(membershipIds, async (chunk) => {
    const { data, error } = await supabase
      .from('membership_vouches')
      .select('membership_id, voucher_id, answer, at')
      .in('membership_id', chunk)
    if (error) throw error
    return data ?? []
  })
}

/**
 * Rows -> { [membershipId]: { known, unknown, mine } }.
 *
 * ⚠️ `mine` IS THE CALLER'S OWN ANSWER, AND IT IS WHY THIS TAKES A voucherId.
 * Without it the buttons cannot show which one the coach already chose, and a
 * control that does not show its own state reads as one that did not save.
 */
export function tallyVouches(rows, voucherId) {
  const byMembership = new Map()
  for (const row of rows ?? []) {
    const tally = byMembership.get(row.membership_id) ?? { known: 0, unknown: 0, mine: null }
    if (row.answer === 'known') tally.known += 1
    if (row.answer === 'unknown') tally.unknown += 1
    if (voucherId && row.voucher_id === voucherId) tally.mine = row.answer
    byMembership.set(row.membership_id, tally)
  }
  return byMembership
}
