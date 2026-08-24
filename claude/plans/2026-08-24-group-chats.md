# Group chats — pick the people, name the chat

**Status: BUILT 24 Aug 2026, NOT MERGED.** The migration is APPLIED to the
live database (harness green before and after); the app code sits on branch
`claude/chat-feature-ee511a` awaiting Jay's merge. Live verification —
a real three-person group, a rename, a push on a phone that is not the
actor's — happens after deploy and is the thing that closes this plan.

Design mockup: the "New group flow" artboard on the Chat Dashboard canvas
(session artifact, 24 Aug 2026). The rulings below are Jay's, same day; the
arguments against them are recorded in
`claude/decisions/2026-08-24-groups-open-no-warnings.md` — read it before
re-opening any of this.

## Why

Jay, 24 Aug 2026: members need to create group chats themselves with only the
people they choose in them, and to name those chats. Neither exists: a DM is a
strict two-person pair (`conversations.profile_a`/`profile_b`), every group
channel is system-made from a squad, and no chat anywhere has an editable name.
The motivating example is a parents' carpool group for one squad's Saturday
matches.

## The rulings (Jay, 24 Aug 2026)

1. **Groups are open.** Anyone visible in your picker can be added — minors
   included. No `staff_dm_opt_in` gate, no welfare notices, **no safeguarding
   language anywhere in the group UI**. The 23 Aug DM rules
   (`private.can_dm`) are UNCHANGED for two-person chats.
2. **A group is three or more people, counting the creator.** Two people IS a
   DM and takes the DM path with its existing rules. This floor is what stops
   a "group" of two being a DM with the safeguards filed off.
3. **Welfare may read a group containing a minor once a message in it is
   reported.** Enforced in the database, surfaced nowhere: no banner, no
   notice line. Until a report exists, participants only.

## Data model

Extend `public.conversations` rather than invent a parallel table — messages,
clears and deletes already hang off `conversation_id` and keep working:

- `conversations.kind text not null default 'dm' check (kind in ('dm','group'))`.
- `conversations.title text` — required for groups, null for DMs. Rename is an
  update to this column.
- `profile_a`/`profile_b` and their `check`/`unique` constraints become
  DM-only (`kind = 'dm'`); null for groups.
- New `public.conversation_members (conversation_id, profile_id, is_owner,
  joined_at)` — rows for groups only. The creator is the owner. DMs stay on
  the pair columns; do not backfill members rows for them.
- `messages` is untouched: `channel = 'dm'` with a `conversation_id` already
  covers groups' storage shape. Whether groups reuse `channel = 'dm'` or get
  `channel = 'group'` is the implementer's call — pick whichever keeps the
  `messages_dm_shape` check honest, and say which in the migration header.

## Rules, in the database as always

- **Create**: any active club member; at least two others picked, so the
  member floor (ruling 2) holds at birth. A database `check` or trigger
  enforces it — not the UI.
- **Who can be picked**: the same audience rule DMs use — people you share a
  squad with, their squad's staff, admins (`can_dm` rule 2). The minor gates
  (`can_dm` rule 3) are NOT consulted for groups. Blocks (`dm_blocks`) are
  respected: you cannot add someone who blocked you.
- **Members floor**: a group never drops below 3. Leaving a 3-person group
  deletes the group for everyone or is refused — implementer proposes, spec
  leans "the leaver goes, and when 2 remain the group is closed", stated
  plainly in the confirm dialog.
- **Rename / add people / remove people**: owner only, v1. Anyone may leave.
- **Read**: members; plus the `welfare` right when the group involves a minor
  AND a message in it has been reported (ruling 3). "Involves a minor" uses
  the same definition as `conversation_involves_minor` — unknown date of
  birth is a minor.
- **Messages**: same behaviour as DMs today — author may delete their own any
  time, reported messages survive deletion
  (`claude/decisions/2026-08-24-delete-for-good-except-reported.md`), reports
  go through the existing `message_reports` flow.
- **Delete for yourself**: `conversation_clears` already keys on
  `conversation_id` and should work unchanged; the harness proves it.
- **Delete for everyone**: owner only, reported messages retained.
- **Push**: a group message pushes to every other member through the existing
  `squad_push` machinery; the actor never receives their own push.

## UI

- **Pencil** (`src/components/NewChatPicker.jsx` grows a sibling or a mode):
  "New chat" / "New group". Group flow per the mockup — name field first,
  multi-select picker grouped by shared squad, selected people as removable
  chips, "Create group · N people" button.
- **Chats list** (`src/screens/ChatList.jsx`, `public.my_chats()`): groups
  appear as rows with their title, member count and the usual preview line.
- **Thread header** (`src/components/ChatHeader.jsx`): title, "N people"
  (tap for the member list), ⋯ menu with Rename / Add people / Leave (owner
  additionally: Remove someone, Delete group). The "who reads it" line says
  "N people" and nothing else — ruling 1.

## Testing

- `db/tests/` harness (rolled back, per `claude/runbooks/db-harnesses.md`):
  creates a group, proves a non-member cannot read it, proves the 3-person
  floor refuses a 2-person group, proves welfare CANNOT read it un-reported
  and CAN once a message is reported (the discriminating pair), proves rename
  is refused for a non-owner.
- Vitest for the picker (multi-select, floor disabled below 2 picks) and the
  list rows.

## Out of scope, deliberately

Photos in groups (Phase 4 of squad chat governs), email digests, guardian
visibility of a child's group memberships (argued, overruled — see the
decision file), transferring ownership, group avatars.
