import { supabase } from '../lib/supabase'

// Chat polls — WhatsApp-style, on the message rails. Spec:
// claude/plans/2026-08-27-chat-polls.md. Ruling (open posting, votes visible to
// the whole chat): claude/decisions/2026-08-27-chat-polls-open-visible.md.
//
// A poll IS a message: its QUESTION is the message body, so previews,
// notifications and forwarding reuse it. These four functions are the whole
// data layer — creation, the per-thread read, the vote toggle, and the realtime
// hook — and they mirror the reactions layer in src/data/messages.js.

/**
 * Create a poll in the thread the composer was opened in. `channel` is 'squad'
 * or 'staff' and is ignored when `conversationId` is set (a DM/group poll). The
 * server (create_poll) re-checks the caller may post here, validates 2–12
 * options and the question, and returns the new message's id.
 */
export async function createPoll({
  teamId = null, channel = 'squad', conversationId = null, eventId = null,
  question, options, allowMultiple = false,
}) {
  const { data, error } = await supabase.rpc('create_poll', {
    _team: teamId,
    _channel: channel,
    _conversation: conversationId,
    _event: eventId,
    _question: question,
    _options: options,
    _allow_multiple: allowMultiple,
  })
  if (error) throw error
  return data
}

// The votes read policy defers to the message's own read policy, so this only
// ever returns polls in threads the caller can read — and the voters it lists
// are the parity ruling made visible. full_name comes straight off profiles;
// private nicknames are an author-name nicety and are not applied to a voter
// list, exactly as WhatsApp shows contact names in "View votes".
const POLL_SELECT = `
  message_id, allow_multiple,
  options:poll_options(
    id, position, label,
    votes:poll_votes(voter:profiles!poll_votes_voter_id_fkey(id, full_name))
  )
`

/**
 * Load every poll among a thread's message ids, shaped for the bubble:
 *   Map<message_id, {
 *     allowMultiple, totalVoters,
 *     options: [{ id, position, label, voters: [{ id, name }] }]  // by position
 *   }>
 * Loaded once per thread alongside reactions/receipts, never per message.
 */
export async function listPollsFor(messageIds) {
  const ids = [...new Set((messageIds ?? []).filter(Boolean))]
  const map = new Map()
  if (ids.length === 0) return map

  const { data, error } = await supabase.from('polls').select(POLL_SELECT).in('message_id', ids)
  if (error) throw error

  for (const row of data ?? []) {
    const voters = new Set()
    const options = (row.options ?? [])
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((o) => ({
        id: o.id,
        position: o.position,
        label: o.label,
        voters: (o.votes ?? [])
          .map((v) => v.voter)
          .filter(Boolean)
          .map((p) => {
            voters.add(p.id)
            return { id: p.id, name: p.full_name }
          }),
      }))
    map.set(row.message_id, {
      allowMultiple: row.allow_multiple,
      totalVoters: voters.size,
      options,
    })
  }
  return map
}

/**
 * Toggle my vote on one option. Insert lets the BEFORE INSERT trigger stamp my
 * id and the poll, and — for a single-choice poll — clear my earlier vote, so
 * the client need not. Delete is my own row only (RLS). A racing double-insert
 * (23505) is the state we wanted, exactly as toggleReaction treats it.
 */
export async function setPollVote(optionId, selfId, on) {
  if (on) {
    const { error } = await supabase.from('poll_votes').insert({ option_id: optionId })
    if (error && error.code !== '23505') throw error
  } else {
    const { error } = await supabase
      .from('poll_votes')
      .delete()
      .match({ option_id: optionId, voter_id: selfId })
    if (error) throw error
  }
}

let pollChannelSeq = 0
const POLL_REALTIME_DEBOUNCE_MS = 250

/** Same shape as subscribeReactions, for the poll_votes table. */
export function subscribePollVotes(callback, { debounceMs = POLL_REALTIME_DEBOUNCE_MS } = {}) {
  let timer = null
  function onChange() {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      callback()
    }, debounceMs)
  }
  const channel = supabase
    .channel(`poll-vote-changes-${++pollChannelSeq}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'poll_votes' }, onChange)
    .subscribe()
  let unsubscribed = false
  return () => {
    if (unsubscribed) return
    unsubscribed = true
    if (timer) clearTimeout(timer)
    supabase.removeChannel(channel)
  }
}
