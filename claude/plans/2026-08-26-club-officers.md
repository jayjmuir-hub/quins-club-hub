# Club officers — titles without rights

**Date:** 26 Aug 2026 · **STATUS: ships with the pull request that adds this file**

Jay: a super admin must be able to tag people with **Club President, Vice
Chairman, Rugby Junior Manager, Club Secretary, Treasurer, Membership
Secretary, Director of Rugby, Rugby Performance Director** — "no special
rights with those, just titles" — appearing everywhere titles appear, and
"those people should see their own titles too".

## The rulings (Jay, same conversation)

1. **Titles carry NO permissions.** They cannot live on `memberships`
   (a membership row IS a grant), so they get their own table:
   `public.club_officers` (club, profile, title) — the eight titles as a
   CHECK constraint, in Jay's stated order as the dignity order. RLS:
   any active member of the club may READ; only a super admin
   (`private.is_super_admin()`) may write. Several titles per person
   (small clubs double-hat); unique per (club, profile, title).
2. **They ride the existing identity pipeline.** `member_identity` gains
   officer rows (`role='officer'`, the title, no squad), so the DM
   header, the dock strip and anything else on `IdentityBadges` shows
   them with zero new surface code. Badge order: **officers first** (in
   dignity order), then Club Hub admin, then per-squad staff titles,
   then parent, then player — Jay's pick from the offered options.
3. **The tagging UI is a NEW Admin section** (Jay's pick): Club Admin
   portal tab "Club officers", `superOnly: true` (the rights-log
   pattern — the tab hides, the screen re-checks, RLS actually decides).
   Eight title blocks, each listing holders with remove, and an
   add-picker over `listClubMembers()`.
4. **"Everywhere titles appear" + "see their own":** `IdentityBadges`
   is added to the person card (under the name) and to the More screen's
   You card (own profile id). Squad-staff cards stay squad-scoped —
   officers are club furniture, not squad furniture.

Proof chain: rolled-back harness `db/tests/club-officers.sql` (write
refused for a plain admin — the discriminator for "no special rights";
member reads; cross-club zero; identity rows include the title), applied
to production before the PR; ordering in pure `src/lib/identity.js`
red-first; screen test for the super gate and the add/remove flow.
