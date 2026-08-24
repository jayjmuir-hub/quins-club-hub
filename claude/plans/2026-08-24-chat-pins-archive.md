# Chat round 6 — pinned chats and archive

**Status: SHIPPED — merged as `dcd0196` (#391), 24 Aug 2026 (late night),
verified live alongside the app-icon badge (`382f5da` #390) by three
markers in one bundle. The chat_prefs migration was applied and measured
in production on Jay's standing go-ahead.** The two
ideas offered with the navigation round and parked "for a later round"
(`claude/plans/2026-08-24-chat-navigation.md`); Jay's "keep going" picked
them up the same night. Both are PRIVATE, per-person shapes of YOUR list —
no rulings needed, the nicknames pattern throughout.

## The pieces

1. **`chat_prefs`** (`db/migrations/20260824_chat_prefs.sql`): one row per
   (owner, chat) with `pinned` and `archived` booleans, owner-only RLS.
   The key is the client's own row key ('<kind>-<id>') — a preference is
   not worth two nullable FKs, and an orphaned pref for a deleted chat is
   a no-op row only its owner can see.
2. **Pin** — the row's ⋯ menu; a pinned chat sorts above everything in its
   section (pinned → unread → recency) and wears a 📌.
3. **Archive** — same menu; an archived chat leaves its section AND the
   unread arithmetic (you asked to stop hearing about it — WhatsApp's own
   rule), and lives in a default-folded "Archived" section at the bottom.
   Search still finds it; unarchive from the same menu.

## Accepted residue

The dock and the sidebar counts don't consult prefs — an archived chat
still appears in the dock's list. Revisit if it grates; the dock is
deliberately thin.
