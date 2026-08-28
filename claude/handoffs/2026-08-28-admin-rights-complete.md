# Handoff — admin-rights security redesign: COMPLETE

*28 Aug 2026. A session record — history, not instruction. The code and
`claude/specs/2026-08-28-admin-rights-access-matrix-and-threat-model.md` win on
current state.*

## One-line status

**All six data boundaries are shipped, applied to production, and verified
live.** A narrowed Pitch/Training admin now has **names-read-only** access to
children. The redesign designed on the morning of 28 Aug was built the same day.

## ⚠️ THE ONE OUTSTANDING ACTION — DM review is OFF

Phase 4 was the **only** phase that changed current behaviour. At apply time
**0 admins held `welfare`**, so **nobody can review a child's or reported DM
until Jay ticks Welfare** for the club's safeguarding person on the **Accounts**
screen (a super-only, audited action). Jay chose "apply now, assign after". If
DM review looks broken, this is why — **grant welfare, do not revert the
migration.**

## What shipped

| Phase | Boundary | PR | Migration |
|---|---|---|---|
| 0a | `clubadmin` right + backfill | #486 (`c579d96`) | `20260828_clubadmin_right.sql` |
| 1 | Child DOB + parent contact (RLS) | #489 (`56e399a`) | `20260828_child_contacts_allowlist.sql` |
| 1b | Adult login email/phone (column revoke) | #493 (`48e247b`) | `20260828_member_contacts_fn.sql` + `20260828_profiles_contact_revoke.sql` |
| 2 | Player photos (storage RLS) | #494 (`193b7ea`) | `20260828_child_photos_allowlist.sql` |
| 3 | Roster write (edit/delete) | #496 (`5ba8da4`) | `20260828_child_write_allowlist.sql` |
| 4 | DM review → welfare + audit | #499 (`07367cc`) | `20260828_dm_review_welfare.sql` |

**0b (`can_dm` reach) was SKIPPED — moot under Shape α** (is_admin persists, so
reach is already preserved; the review/reach split is Phase 4's job). Recorded
in `claude/plans/2026-08-28-admin-rights-migration.md`.

Each phase has a `db/tests/*.sql` rollback harness proving **both directions**
(no legitimate holder loses access AND the narrowed right is refused), verified
against production data. `npm run db:check` runs them; the nightly does too.

## Design decisions locked in this session

- **The write allowlist is `{clubadmin, youth, media}`; read adds `welfare`.**
  Helpers are per-surface (`can_see_child_contacts/photos`,
  `can_edit_child_contacts/photos`, `can_write_child`) — currently equal in
  value, kept separate so a surface can diverge. `is_super` short-circuits them
  ALL **except `can_review_dm`**.
- **`can_review_dm` has NO `is_super` short-circuit** (spec §5.2 note ²) — a
  super must explicitly tick `welfare` to review a child's DM, and the tick is
  audited (`membership_audit`), the open is audited (`welfare_access_log`).
- **Audit-log read = super + welfare** (Jay's ruling on the §8 parked decision).
- **`member_contact_card`'s squad arm was a leak** — it keyed on `can_edit_team`
  (true for any admin); Phase 1b repointed it to `can_see_member_contact`.

## Traps met (so the next session need not re-meet them)

- **1b is the only DEPLOY-FIRST phase.** The `profiles.email/phone` column revoke
  breaks every direct read, so the rerouted frontend (6 data-layer reads through
  `member_contacts`, merged back so no UI changed shape) shipped BEFORE the
  revoke. Order: fn migration → frontend deploy → revoke.
- **⚠️ COLUMN-LIST TRAP NOW LIVE ON `profiles` SELECT.** A new `profiles` column
  is unreadable until added to the grant in `20260828_profiles_contact_revoke.sql`
  AND `db/schema/grants.sql`. Fail-closed, but reads as a bug.
- **The `scope.js` mirrors are tree-shaken** (`canSeeChildContacts` etc.) —
  exported, tested, but unused, so absent from the bundle. RLS is the boundary;
  wire a mirror into a screen only if that screen must hide an *offer*.
- **Phases 0a–3 changed nothing for current admins** (all hold `clubadmin`); only
  Phase 4 changed live behaviour. This is why "nobody lost access" held.

## Coordination note

This ran alongside ~6 other live sessions (chat, resilience, training UX, a
graft build). The `claude/changelog.md` one-behind chain held across ~9 merges by
strict "whoever merges second rebases + re-cites, docs-check confirms the SHA".
No collisions. See [[parallel-sessions-coordinate-live-steps]].

## Possible follow-ups (none blocking)

- Wire the tree-shaken `scope.js` mirrors into any contacts/photo screen that
  should hide (not just fail) an offer for a narrowed admin.
- Consolidate the three value-identical write helpers if they never diverge.
- Revisit `welfare` assignment periodically — it is now a real, named,
  least-privilege safeguarding role.
