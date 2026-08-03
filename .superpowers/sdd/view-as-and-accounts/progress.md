# View-as switcher + admin Accounts — build ledger

Spec: docs/superpowers/specs/2026-08-03-view-as-and-accounts-design.md
Plan: docs/superpowers/plans/2026-08-03-view-as-and-accounts.md

Raised by Jay on 3 Aug 2026 as four desktop requests. Two were label/CSS fixes shipped
without a spec (`e4fd7da`); the other two are this build. All 5 tasks complete.

Run as two parallel tracks — A (1→2, view-as) and B (3→4, Accounts) — because they touch
disjoint files. Task 5 verified both. One fresh subagent per task, each explicitly told to
verify the plan against the real codebase first; the controller re-ran the full suite and
build independently after each.

**Migration applied before any code**: `profiles_email_and_admin_access`. Scoping the
Accounts screen surfaced a live bug — `profiles` RLS was own-row-only with no admin
policy, so the existing Admin member list had been showing "Unnamed member" for every
person except the caller, disguised by a `?? 'Unnamed member'` fallback. Fixed in the
database, not the app. See RESTORE.md for the full migration detail.

**Task 1 (provider view-as state)**: one real plan gap found. The plan said "if the stored
teamId is not in the loaded `teams`, drop the preview" — implemented literally, that drops
every preview on every page refresh, because `teams`/`memberships` are empty *during* load
so the check fails transiently. Implemented instead as a derive-time validity check (a
forged or stale localStorage value never takes effect for even one render) plus a
persistent self-heal gated on `loading === false && !error`. Commit `e719278`, 647 tests.

**Task 3 (membership/profile writes)**: two discrepancies. (1) The plan sent member
data-layer tests to `tests/data.test.js`, but `members.js` was *already* partly tested in
`tests/scope.test.js` using ad-hoc mocks that cannot express an
`update().eq().select().maybeSingle()` chain. Followed the plan (data.test.js) and flagged
that members coverage is now split across two files. (2) The brief said `updateMembershipRole`
should *throw* when role is admin and teamId is non-null; the implementer coerced to null
instead, arguing a promote-to-admin form legitimately still holds the old team selection
and `null` is the only valid value so coercion cannot corrupt. A missing teamId on a
non-admin role still throws before the network call. Accepted. Commit `5caac17`, 669 tests.

**Task 2 (switcher UI + banner)**: three discrepancies, one of them a genuine layout bug
the plan did not anticipate. (1) The spec's `#8E1526` no longer exists — the repo was
rethemed for contrast (`brand.deep: #b3141a`, ratios documented inline in
`tailwind.config.js`) and `tests/theme.test.js` fails the build on any raw hex in a class
name. Used the token. The project brief's colour list is stale on this point. (2) Stale
line numbers for the role badge; anchored on content instead. (3) `<header>` was already
`sticky top-0 z-40`; a separately-sticky banner would pin to the same y=0 and paint over
the masthead when scrolled — fixed by hoisting the sticky positioning to a shared wrapper.
Commit `7011035`, 23 new tests including the anti-soft-lock case.

**Task 4 (Accounts screen)**: two discrepancies. (1) The plan warned `tests/nav.test.jsx`
asserts a fixed nav-item count and would need deliberate updating — it didn't: `NAV_ITEMS`
is only the four tab-bar items, and Overview was already a conditional extra rendered
outside that array, so Accounts followed the same pattern and the four-item assertion held
unmodified. Useful signal that the plan was over-cautious, not wrong. (2) The spec's
"Linked player" column was omitted because `listClubMembers()` embedded no player name and
the column could only have shown a raw uuid — correctly flagged rather than faked, and
closed in Task 5. Commit `e361cf4`, 715 tests.

**Task 5 (linked player + harness + browser verification)**: audited all four data stubs
against their real modules rather than only the one touched — the known landmine is that
`harness/main.jsx` statically imports the screens, so a single missing stub export breaks
*every* scenario (this happened with `insertPlayers` during the Overview build). Only
`members.js` had drifted. Verified `players.full_name` exists and that
`memberships_player_id_fkey` is the sole FK to `players` (so `players(full_name)` needs no
`!fkey` disambiguation) before adding the embed.

Real measured browser output at 1280×900, not just "the script ran": previewing as **Coach
of U14 Boys** re-scoped the roster from **26 players / 3 age groups to 8 players / U14
Boys**, the banner rendered the exact specified wording, and **Exit preview** restored all
26 and cleared the banner. Non-admin: no trigger, no banner. Coach hitting `/accounts`: not
authorised, zero rows, no query issued. Pre-existing `roster-admin` and `schedule-admin`
scenarios re-run as regression checks — both clean. Zero console and page errors on all six
pages, after chasing down one `404` that turned out to be a pre-existing missing favicon in
`harness/index.html` (reproduced on an untouched scenario, so filtered with a comment rather
than hidden). Commit `19e0065`, 718 tests.

**Independent controller review** (not a subagent): confirmed `ViewAsSwitcher.jsx` never
destructures the effective `memberships` at all — only `realMemberships` — which is the
property the anti-soft-lock rule actually depends on; confirmed the banner sits inside the
shared sticky wrapper above the masthead; confirmed the last-admin guard counts
`ownAdminCount` from the full club-wide list and blocks both demote and revoke. Verified
the theme claim against `tailwind.config.js` directly rather than taking the subagent's
word for it. Clean on first review.

**Known gap, deliberate**: an audit trail of who changed whose access is genuinely wanted
here and is the strongest argument yet for building the Phase 2 audit-log table that the
Overview activity feed also needs. Still deferred.
