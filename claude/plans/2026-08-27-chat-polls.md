# Chat polls — WhatsApp-style, on the existing message rails

**STATUS: Not shipped — in build (2026-08-27).** Driven end-to-end at Jay's
"A, drive it until it's live" (27 Aug 2026). Approach A of three (poll = a
message, backed by real tables) was chosen as the one closest to WhatsApp.

Rulings that gate this are in
`claude/decisions/2026-08-27-chat-polls-open-visible.md`. Read that first.

## What we are building

A WhatsApp poll: a question with 2–12 options, single- or multiple-choice, that
appears as a message in any chat the author can already write in (squad channel,
staff channel, club channel, DM, group). Everyone who can read the message can
vote, see live counts, and see **who** voted for what. The author can delete it
like any message.

Deliberately WhatsApp-faithful, per Jay's "look and work exactly like WhatsApp":
- poll IS a message — it forwards (as its question text), it deletes, it carries
  reactions/receipts/reply exactly as a text message does;
- votes are **not** secret — "View votes" lists names, the 27 Aug ruling;
- anyone who can write can post one — no staff gate, matching the photos/groups
  openness rulings.

## Why approach A

A poll modelled as a message + normalised tables reuses every rail chat already
has (threading, realtime, delete-cascade, the report→welfare loop, unread
counts, previews) instead of inventing parallel machinery. The two rejected
shapes each forced a compromise: a JSON blob on the message makes "who voted"
and "unvote" fragile and the RLS hard to reason about; a poll living on the
conversation falls outside the thread and would have to re-implement ordering,
forwarding and deletion. See the chat this decision came out of.

## Data model (migration `db/migrations/20260827_chat_polls.sql`)

The question lives in `messages.body` (the column is `not null`, 1–2000 chars),
so notifications, chat-list previews and forwarding all reuse it with no new
plumbing. Three tables hang off the message:

```
polls          message_id PK → messages(id) on delete cascade
               allow_multiple boolean not null default false
               created_at

poll_options   id PK
               message_id → polls(message_id) on delete cascade
               position int, label text (1–100 chars)
               unique (message_id, position)

poll_votes     option_id → poll_options(id) on delete cascade
               voter_id  → profiles(id)      on delete cascade
               message_id → polls(message_id) on delete cascade  (denormalised,
                            so single-choice replacement and per-poll reads are
                            one predicate, not a join)
               created_at
               primary key (option_id, voter_id)   -- no double-vote of an option
```

Deleting the poll message cascades all three away. A poll only ever attaches to
a fresh message the poll RPC creates — never retrofitted onto an existing one.

### RLS — the safety-critical half

Modelled on `db/migrations/20260824_message_reactions.sql` (read defers to the
message's own read policy) and on group chats' RPC-only writes:

- **Read** on all three tables: `exists (select 1 from messages x where x.id =
  message_id)`. The subquery runs as the caller, so the messages read policy —
  squad visibility, staff rights, DM/group membership, admin review — decides.
  This is what makes votes visible to exactly the people in the chat (parity).
- **Writes are RPC-only.** No insert/update/delete policies on any of the three
  (same posture as `conversation_members`). All mutation goes through two
  security-definer RPCs:
  - `create_poll(_team, _channel, _conversation, _event, _question, _options[],
    _allow_multiple)` — inserts the message (the `set_message_provenance`
    trigger fills author/club/role/channel exactly as for a normal post), then
    the poll + options. Atomic. Returns the message id. Validates: 2–12
    non-blank options, question 1–2000, caller may write the target (the trigger
    already raises 42501 otherwise).
  - `toggle_poll_vote(_option)` — the tap. Resolves the poll from the option;
    refuses if the caller cannot read the message or it is deleted. Single-
    choice: clears my other votes in this poll, then sets this one (tapping my
    current choice clears it — WhatsApp). Multiple-choice: toggles just this
    option. Idempotent under double-tap.
- Grants: `select` on the three tables to `authenticated`; `execute` on the two
  RPCs to `authenticated`; both RPCs `revoke … from public, anon`.

`db/schema/grants.sql` gains the three table grants (docs:check enforces this).

## Data layer (`src/data/polls.js`)

- `createPoll({ teamId, channel, conversationId, eventId, question, options,
  allowMultiple })` → `rpc('create_poll', …)`, returns the new message id.
- `listPollsFor(messageIds)` → one batched select of polls+options+votes for the
  ids in a thread, shaped to `Map<message_id, { allowMultiple, totalVoters,
  options: [{ id, label, position, voters: [profileId…] }] }>`. Loaded per
  thread alongside reactions/receipts, not per message.
- `togglePollVote(optionId)` → `rpc('toggle_poll_vote', …)`.
- `subscribePollVotes(callback)` → realtime on `poll_votes` (mirrors
  `subscribeReactions` in `src/data/messages.js`), so counts move live.

## UI

Four surfaces, all WhatsApp-shaped:

1. **Entry point** — a "Poll" item in the composer's attach/"+" menu, beside the
   existing photo attach. Opens the composer. Present wherever a composer is
   (channel threads and DM/group threads).
2. **PollComposer** (`src/components/PollComposer.jsx`) — question field; 2–12
   option fields that grow as you fill the last one and can be removed; an
   "Allow multiple answers" toggle; a Send that calls `createPoll` for the
   thread it was opened in. Mirrors WhatsApp's create-poll sheet.
3. **PollBubble** (`src/components/PollBubble.jsx`) — inside the message bubble:
   the question, a "Select one" / "Select one or more" subtitle, each option as a
   tappable row (radio when single, check when multiple) with a proportional bar
   and count, the running total, and a "View votes" affordance. Tapping toggles
   via `togglePollVote`; the bar and your selection update live. Wired into both
   the channel message row and the DM/group message row.
4. **PollVotes** (`src/components/PollVotes.jsx`) — the "View votes" sheet: per
   option, the names who picked it. Everyone sees it (parity + ruling).

## Realtime

`subscribeMessages` already reloads a thread on message changes but watches only
the messages table. Votes touch `poll_votes`, so each thread hook that renders
polls also subscribes to `subscribePollVotes` and refetches the affected poll —
exactly the pattern reactions use. Debounced like the message channel.

## Testing

- **DB harness** `db/tests/chat-polls.sql` (run by `npm run db:check`, a
  transaction that rolls back against production — `claude/runbooks/db-harnesses.md`):
  prove, against injected faults, that a reader outside the chat sees neither the
  poll nor its votes; that a member can read votes (parity); that
  `toggle_poll_vote` refuses an out-of-scope or deleted message; that
  single-choice replaces and multiple-choice accumulates; that a non-member
  cannot write a vote directly (RPC-only); that deleting the message cascades
  options and votes away. Each assertion carries a control so it discriminates.
- **Vitest**: `src/data/polls.js` shaping and the two components (compose
  validation, bar proportions, single vs multiple toggle, view-votes list).
  `tests/chat-polls.test.jsx` / `tests/polls-data.test.js`.

## Sequencing to live (order matters)

1. Migration applied to **production** first (Supabase MCP `apply_migration`),
   because the deployed frontend calls these tables/RPCs the instant it ships.
2. `npm test` + `npm run db:check` green.
3. PR, diff shown to Jay (hard rule — `main` is production), merge → Netlify
   deploy (15 credits).
4. Verify live on https://adhquins-clubhub.com: post a poll, vote from a second
   identity, confirm live counts and "View votes".

## Known limitations (v1, YAGNI)

- Forwarding a poll forwards its **question as text**, not a live poll — WhatsApp
  is effectively the same, and re-creating a live poll on forward is out of scope.
- No "add option after posting", no closing/expiry — delete the poll message to
  end it. Retention of vote rows follows the message (cascade), nothing extra.
- Editing a poll's question/options after posting is not offered; the 15-minute
  body edit that text messages get does not extend to poll structure.
