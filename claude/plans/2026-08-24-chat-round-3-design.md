# Chat round 3 — the WhatsApp design pass, Jay's words, 24 Aug 2026 (night)

**Status: SHIPPED — merged as `34c9e1c` (#380), 24 Aug 2026 (night),
verified live from the deployed bundle** (four markers: the wallpaper
store, `accent-deep`, the day dividers, the nicknames calls). The
nicknames migration was applied and measured in production before the
merge, with an explicit anon revoke. Accepted residue: chat-LIST rows keep
real names — `my_chats` carries no `other_id` for a nickname to key on;
revisit only if it grates. ⚠️ No real member has used any of it yet.
Seven items
from Jay comparing the chat surfaces against a real WhatsApp group
screenshot, the same evening round 2 and the resizeable dock shipped.
Nothing here is invented; the phrasing is his. An item deleted from this
list is a finding that ceases to exist.

## The items, and the calls made with him

1. **"messages are too big vertical, in whatsapp the time stamp is not
   totally below the message"** — the stamp moves INTO the bubble's last
   line, bottom-right, WhatsApp style; the meta row shrinks. DM/group
   thread and the dock (the WhatsApp-shaped surfaces; channels keep their
   richer meta row).
2. **"the reaction icon sits either to the right or left of the message
   bubble, depending on if you sent it or someone else sent the message"**
   — the add-reaction trigger moves beside the bubble (left of yours,
   right of theirs); the tallies stay attached to the bubble.
3. **"at the top it previews who is in the chat under the name of the
   chat"** — a group's header subtitle becomes first names ("King, Kris,
   Matt, You"), count only when it overflows.
4. **"there are marks for messages Today, Yesterday, and then older get a
   date"** — day dividers in DM/group thread and dock.
5. **"we need chat backgrounds instead of just white or black"** — ruled
   with him: **user-choosable presets** (a default, a club doodle pattern,
   and two colour washes), picked from the thread menu, remembered per
   DEVICE like chat-enter-sends. No uploads — nothing a member posts can
   become someone else's wallpaper.
6. **"should be able to create nicknames for people, not sure how this
   would work"** — ruled with him: **private to you**, like renaming a
   contact in your phone. A `nicknames` table (owner → profile → label),
   RLS owner-only, applied wherever chat renders a name for you. No
   consent surface because nobody else ever sees your labels.
7. **"need a better color than black for the group name area and the
   messages sent by yourself"** — ruled with him: **quins green**, the
   WhatsApp-dark-green move in club colours. New `accent.deep` token
   (#16603a), white text ≈7.6:1; the chat header and own bubbles use it.
   ⚠️ The channels' staff-red rule keeps its meaning — red stays the staff
   signal, green is "mine".

## Out of scope, stated so it stays out

Custom background uploads, group-wide nicknames (a rename of a child
visible to others needs welfare thinking first — revisit only with a
ruling), channels' meta-row redesign.
