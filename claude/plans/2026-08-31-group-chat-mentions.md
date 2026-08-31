# Group chat @ mentions

**Status: SHIPPED, 31 Aug 2026** — Jay's ruling on the fork: **no
punch-through**. Two deviations from the spec as written, both recorded here:

1. **No new RPC.** `useDmThread` already loads the group's members
   (`listGroupMembers`), so the picker eats that list minus the reader —
   `conversation_mentionables` was never needed.
2. **"Push — no change" was WRONG, and the harness proved it before the
   feature could.** `message_push_subscriptions`' mentions arm hard-coded
   `squad_chat` with no channel guard (written 24 Aug, when mentions existed
   only in channels), so the moment group mentions survived the trigger, a
   mentioned member's `direct_messages` opt-out was sailed past — accidental
   punch-through, the exact thing the ruling forbids.
   `db/migrations/20260831_group_mentions_no_punch_through.sql` adds the
   `channel <> 'dm'` guard; `db/tests/group-mentions.sql` check 4 pins it.

Requested by Jay, 31 Aug 2026, after finding that @ tagging exists in every
channel-shaped chat but not in groups.

## The question that prompted it, answered first

Jay: *"I've tried typing @ in different channels and it doesn't pop up
candidates to tag."* Correct, and by design: **tagging is a BUTTON, not a
typeahead.** `src/components/MentionPicker.jsx` opens with the ruling — typing
"@" for a popover is the WhatsApp habit and the first thing a phone keyboard
with autocorrect breaks. The @ button sits beside the composer in squad,
staff, club and role channels and in replies; tap it, tap a name, `@Full Name`
lands in the draft and the profile id rides along in `mentions`. Two
consequences worth keeping in mind:

- **The button vanishes when there is nobody to mention** (`!people?.length`
  returns null) — an empty or failed mentionables load looks like the feature
  not existing.
- This spec **keeps the button pattern**. If the button is too hidden, that is
  a discoverability problem shared with the channels and a separate decision —
  not a reason to build the autocomplete that was already examined and
  declined.

## What exists today (measured, 31 Aug 2026)

DMs and groups share `public.messages` with the channels. The insert trigger
(`db/migrations/20260824_group_chats.sql`) **hard-zeroes `mentions` on the
DM/group arm** — `new.mentions := '{}'` — and its keep-filter admits only the
squad and staff audiences. `sendDirectMessage` (`src/data/messages.js`) takes
no `mentions` option; the Conversation composer has no picker. So the gap is
end-to-end but narrow: UI affordance, one client parameter, one trigger arm,
one mentionables source.

Push today: a group message already notifies **every other member** under the
`direct_messages` category (`message_push_subscriptions`), respecting that
category's opt-out. There is no per-chat mute.

## Build

1. **`conversation_mentionables(_conversation uuid)`** — new RPC returning
   `{profile_id, full_name, role}` for the conversation's members minus the
   caller; refuses callers who are not members; groups only (a 1:1 DM returns
   empty — mentioning the only other person is noise). Same shape
   `listMentionables` already returns, so the picker needs no changes.
2. **Trigger arm** — on `kind = 'group'`, replace the zeroing with the same
   shape the squad arm uses: keep only ids that are conversation members,
   drop the author, dedupe. The 1:1 DM arm keeps `'{}'` — the database stays
   the enforcer and the picker stays the polite front.
3. **Client** — `sendDirectMessage` gains `mentions = []`;
   `useDmThread` carries draft mentions the way `useChannelThread` does
   (including the un-mention prune on send: an id whose `@Full Name` was
   deleted from the draft is dropped, exactly as `MessageRow.submitReply`
   does); the Conversation composer renders `MentionPicker` when the thread
   is a group.
4. **Push — no change.** Every member is already notified of every group
   message; a mention arm would add nothing but a second row the `union`
   dedupes away. The one real fork is below.

## Fork for Jay to rule on

**Should a mention reach someone who opted out of `direct_messages` pushes?**
WhatsApp's answer is yes (mentions punch through mutes). Ours today would be
no — the opt-out is category-wide and mentions in groups would inherit it.
Punch-through means a new arm in `message_push_subscriptions` that bypasses
the opt-out check for mentioned ids, which weakens the promise the opt-out
screen makes. **Recommendation: ship without punch-through**, see whether a
real member ever complains; the opt-out copy stays honest and the change is
additive later.

## Tests (each proven against an injected fault)

- db harness (`db/tests/`, rollback pattern): a member's mention survives the
  trigger; a non-member id is stripped; an author self-mention is stripped;
  a 1:1 DM mention is zeroed. Red first by asserting the wrong survivor.
- UI: picker present in a group composer, absent in a 1:1 DM and absent for
  an empty member list; the un-mention prune drops a deleted name.
- Push: `message_push_subscriptions` output unchanged for a group message
  with mentions (the no-punch-through ruling, pinned so a future arm is a
  decision and not a drift).

## Out of scope, on purpose

- Typing-@ autocomplete (ruled out above; reopening it is a design decision
  for all chats at once, not a rider on this).
- Rendering mentions as highlighted chips in message bodies — today
  `@Full Name` is plain text everywhere, channels included; changing that is
  a chat-wide design pass.
- Per-chat mute and mention-punch-through (no mute exists to punch through).
