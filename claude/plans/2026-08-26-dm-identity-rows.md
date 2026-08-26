# DM identity rows — every hat, always visible

**Date:** 26 Aug 2026 · **STATUS: ships with the pull request that adds this file**

Jay, over a live DM with a club admin who is also assistant coach of two
squads: the header showed "CLUB HUB ADMIN · U16B, U18B" — the best-role
summary `member_contact_card` returns — when it should say **Club Hub
admin, U16B Assistant Coach, U18B Assistant Coach**. Also: "the badges and
titles… scroll off the screen in longer chats — they should always be
visible", and "we should see the parent or player badges for people too,
with the age groups… there can be multiple rights on accounts".

## The three decisions

1. **Identity is ROWS, not a summary.** New RPC `public.member_identity`
   returns one row per ACTIVE membership of the target — role, title,
   is_super, squad name, squad sort — to any caller holding an active
   membership in the same club. The client renders all of them:
   super-admin first, then squad staff by age-group order showing their
   REAL title, then parent (squads grouped), then player. Ordering and
   grouping live in a pure client function so they are unit-tested.
2. **A parent's or player's identity (role + squads) is visible to any DM
   counterpart.** This widens nothing in practice: the new-chat picker
   already shows every person with role and `via_team` before a word is
   exchanged. Contact details (phone/email) keep `member_contact_card`'s
   existing server-side gate untouched — this RPC returns no contact
   column at all, so it CANNOT leak one.
3. **The identity folds into a sticky header.** The DM screen wraps
   ChatHeader + badges in `sticky top-0` — the mirror of the composer's
   `sticky bottom-0` — so name and badges hold the top while messages
   scroll. The dock pins the same badge row at the top of its own scroll
   container. One shared component (`IdentityBadges`) serves both surfaces,
   per the shared-chat-thread no-drift rule.

**Replaces** the single-pill identity line #437 shipped hours earlier —
that line's `getPersonCard` fetch in the DM screen goes, and its tests
move to the rows shape. Channels' headers are unchanged (follow-up if
wanted); the group member-line stays as is.

## Order of work
Migration + rolled-back db harness (`db/tests/member-identity.sql`,
fault-injected) → apply to production → `src/lib/identity.js` (pure
ordering, red-first) → `IdentityBadges` component → DM screen sticky
header + dock top strip → full suite → PR.
