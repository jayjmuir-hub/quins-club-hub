# Chat navigation — the list stops being a scroll

**Status: NOT SHIPPED — in progress on `claude/chat-round-5`.** Jay,
24 Aug 2026 (late night): "once there are lots of chats in people's list
they will have to scroll too far down to get to different sections, first
the different chat categories should appear in the left bar under Chats,
then give me ideas." From the ideas offered he took the recommended set;
pins and archive were offered and parked for a later round.

## The four pieces

1. **Sidebar categories (desktop)** — under Chat, the Squad Hub sub-item
   pattern: All chats · Unread · Your squads · Groups & DMs · Starred.
   The filters are `?filter=` deep-links the list consumes.
2. **Filter chips on the list (every screen size)** — the sidebar is
   desktop-only, and phones are where the parents are. A chip row under
   the search box: All · Unread (with its count) · Squads · Groups & DMs,
   driven by the same `?filter=` param so the two stay one mechanism.
3. **Collapsible sections, remembered per device** — the section titles
   fold their card shut; the fold persists in localStorage like
   chat-enter-sends. A folded section shows its row count.
4. **Unread first** — within each section, chats with unread messages sort
   above the rest, then by recency as before.

No migration — all client. Out of scope: pinned chats and archive (each
needs a small table; revisit when asked), per-category counts in the
sidebar (the chips carry the counts instead).

## Also settled in the same conversation

The "what is this at the bottom" question was the Welfare dashboard's
access-log block — the welfare log Jay asked for ALREADY EXISTS
(`welfare_access_log`, trigger-stamped, phase 3). Identified gaps (rows
don't NAME the conversation; only 20 show; dashboard views unlogged) were
offered and NOT taken up in this round — a drafted names-RPC was discarded
unbuilt when Jay clarified "do it" meant navigation only.
