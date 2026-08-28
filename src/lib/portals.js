import { adminRightLabel, hasAdminRight, isSuperAdmin } from './scope.js'

// The admin portals — /admin is a chooser, and each job is its own space with
// its own tabs. Ruling: claude/decisions/2026-08-12-admin-portals.md.
//
// ⚠️ NAVIGATION ONLY. IT NARROWS NOTHING. An account holding Pitch Management
// or Social Media Management is a full admin and holds every child's name,
// photo and gender and every parent's email and phone, club-wide, with the
// power to edit or delete. A right can only be held by an admin at all —
// adminRights() skips any membership that is not role='admin' and active. This
// file draws a tidier front door on the same room, and describing it as
// anything else is the dangerous mistake.
//
// ⚠️ ONE LIST, READ BY BOTH THE CHOOSER AND THE TAB ROW. Two hand-maintained
// lists drift, and the drift here is a portal enterable from one place and
// invisible from the other. This is also the only place a tab's URL is written
// down.
//
// ⚠️ THE LABELS COME FROM adminRightLabel, NOT FROM STRINGS HERE. The job names
// are Jay's — three of them ruled on 12 Aug 2026, "Rugby Performance Director"
// on 20 Aug — and they already have a single home in src/lib/scope.js. Copying them would give the ruling two homes, and two
// copies of a fact are two copies that drift.
// claude/decisions/2026-08-12-jobs-not-people.md

export const PORTALS = [
  {
    key: 'club',
    // ⚠️ `clubadmin` SINCE 28 Aug 2026 (Phase 0a) — it was `right: null`, auto-
    // granted to every admin. It is now its own right, held by every admin
    // because they were backfilled (db/migrations/20260828_clubadmin_right.sql),
    // and a super holds it implicitly (adminRights() → isSuperAdmin short-
    // circuit). The flip makes this a REAL gate: an admin who does not hold
    // `clubadmin` sees this card greyed, which is the granularity the admin-
    // rights redesign needs (claude/plans/2026-08-28-admin-rights-migration.md).
    // ⚠️ ORDER IS LOAD-BEARING: the backfill had to land in production BEFORE
    // this flip deployed, or existing admins would lose the screen. It did.
    // ⚠️ STILL SCREEN-GATING, NOT DATA-GATING. `is_admin` is unchanged, so a
    // holder still sees every child (top-of-file warning). The narrowing of
    // actual data is the redesign's later phases, in RLS, not here.
    right: 'clubadmin',
    // ⚠️ NO LONGER RENDERED — portalLabel() reads adminRightLabel('clubadmin')
    // now that `right` is set. Kept as the documented fallback and so a future
    // reader sees what the card says without resolving the right. The two are
    // pinned equal by tests/admin-portals.test.jsx.
    label: 'Club Hub Admin',
    blurb: 'Accounts, access and the club’s squads.',
    tabs: [
      { to: '/admin/accounts', label: 'Accounts' },
      // ⚠️ "Club" UNTIL 12 Aug 2026, AND IT HID THE THING PEOPLE COME HERE FOR.
      // This tab is where a club's LEAGUE TEAM NAMES are created — the ADHQ1 /
      // ADHQ2 identities that RCM knows a side by, and that the match sheet's
      // TEAM box is stamped from. "Club" named the container rather than the
      // job, so the one screen that fixes an empty TEAM box was the one screen
      // nobody could find. Jay went looking for it and could not tell from the
      // word which tab it was under.
      { to: '/admin/club', label: 'Squads & league teams' },
      // ⚠️ ADDED LAST ON PURPOSE. Entering a portal lands on tabs[0], so putting
      // Staff anywhere earlier would silently change where every admin arrives.
      // Same trap the Allocation note below records, from the other direction.
      { to: '/admin/staff', label: 'Staff' },
      // The third surface of the completeness rule — where the club is actually
      // missing things. ⚠️ NO `superOnly`: this is a registrar's chase list, and
      // every admin is one. It carries no contact detail and not one date of
      // birth (see the screen's header), so it hands nobody anything they could
      // not already read on the Accounts screen.
      { to: '/admin/needs-attention', label: 'Needs attention' },
      // ⚠️ SUPER ADMINS ONLY, AND THIS IS THE FIRST TAB IN THE FILE THAT IS NOT
      // VISIBLE TO EVERY HOLDER OF ITS PORTAL. The portal gate is `right`, and
      // Club Hub Admin has none — every admin holds it. This log records what
      // ADMINS do, so its audience is one step narrower than its portal's, and
      // `right: null` cannot express that.
      //
      // ⚠️ IT STAYS IN THIS LIST RATHER THAN BEING ADDED CONDITIONALLY, so that
      // portalForPath still recognises /admin/rights-log as Club Hub Admin for an
      // ordinary admin who pastes the URL. They land inside the portal and the
      // screen tells them why it is not for them, which is the behaviour every
      // other admin route already has. visibleTabs is what keeps it out of the
      // row; RLS is what keeps the rows out of the response.
      { to: '/admin/rights-log', label: 'Rights log', superOnly: true },
      // The committee list — titles without rights, appointed by super
      // admins only (claude/plans/2026-08-26-club-officers.md).
      { to: '/admin/officers', label: 'Club officers', superOnly: true },
    ],
  },
  {
    key: 'pitches',
    right: 'pitches',
    blurb: 'Allocate pitches, answer requests, set the pitch list up.',
    // ⚠️ ALLOCATION FIRST, AND THE CARD MUST AGREE WITH THE TAB ORDER.
    // Allocating is the weekly job; setting the list up is done twice a season.
    // Entering the portal lands on tabs[0], so putting Pitches first here would
    // silently send somebody to the setup screen every week.
    tabs: [
      { to: '/admin/allocation', label: 'Allocation' },
      { to: '/admin/pitches', label: 'Pitches' },
    ],
  },
  {
    key: 'youth',
    right: 'youth',
    blurb: 'RCM result sheets for every match.',
    tabs: [{ to: '/admin/youth', label: 'Match sheets' }],
  },
  {
    key: 'media',
    right: 'media',
    blurb: 'What’s on, and post ideas sent in by members.',
    // ⚠️ THIS ARRAY WAS EMPTY FROM 12 Aug UNTIL LATER THE SAME DAY, and adding
    // these two entries is the ONLY change the chooser needed to open the card
    // — no edit to PortalChooser, no second list. That was the point of
    // isPortalOpen treating "no tabs" as closed rather than special-casing
    // this portal by name.
    tabs: [
      { to: '/admin/social', label: 'What’s on' },
      { to: '/admin/social/ideas', label: 'Ideas' },
    ],
  },
  {
    key: 'welfare',
    right: 'welfare',
    blurb: 'Every squad channel and every direct message, and the messages people have reported.',
    tabs: [
      { to: '/admin/welfare', label: 'Overview' },
      { to: '/admin/welfare/reports', label: 'Reports' },
    ],
  },
  {
    key: 'training',
    right: 'training',
    blurb: 'Drills, session templates, and publishing them to squads.',
    // ⚠️ NESTED LIKE `media`, AND THE SECOND PORTAL IN THE FILE THAT IS.
    // /admin/training/templates sits UNDER /admin/training, so the tab row's
    // NavLink must pass `end` or "Library" lights up on all three screens.
    // AdminDashboard already does; the pair of tests in
    // tests/admin-portals.test.jsx is what keeps it doing so.
    //
    // ⚠️ LIBRARY FIRST BECAUSE ENTERING THE PORTAL LANDS ON tabs[0] — the same
    // trap the Allocation note above records. Publishing is the end of the job,
    // not the start of it, so it must never be tabs[0].
    tabs: [
      { to: '/admin/training', label: 'Library' },
      { to: '/admin/training/templates', label: 'Templates' },
      { to: '/admin/training/publish', label: 'Publish' },
    ],
  },
]

/**
 * The tabs this person should be OFFERED.
 *
 * ⚠️ THIS NARROWS THE ROW, NOT THE ACCESS — the same warning at the top of this
 * file, and it matters more here than anywhere else in it. A tab hidden from a
 * navigation bar is not a permission; `/admin/rights-log` stays typeable, the
 * screen repeats its own check, and `membership_audit`'s read policy is the
 * only thing that decides whether a row comes back.
 *
 * ⚠️ NOT MERGED INTO isPortalOpen. That answers "can this card be entered",
 * which is about the portal; this answers "which of its screens are yours",
 * which is about the tabs inside one. Collapsing them would mean a super-only
 * tab could close a portal every admin is supposed to hold.
 */
export function visibleTabs(portal, memberships) {
  const superAdmin = isSuperAdmin(memberships)
  return portal.tabs.filter((tab) => !tab.superOnly || superAdmin)
}

/** The words on the card and above the tabs. One home, in scope.js. */
export function portalLabel(portal) {
  return portal.right ? adminRightLabel(portal.right) : portal.label
}

/**
 * Where entering a portal lands. Null when it has no screens.
 *
 * ⚠️ tabs[0], never a hard-coded path — see the Allocation note above.
 */
export function portalHome(portal) {
  return portal.tabs[0]?.to ?? null
}

/**
 * True when this portal can be entered.
 *
 * ⚠️ TWO SEPARATE REASONS A CARD IS GREY, and they must stay distinguishable
 * because the fix for each is different: "you have not been given this job"
 * is answered by a super admin on the Accounts screen, and "no screen exists
 * yet" is answered by somebody building one. closedReason() is what the
 * chooser renders, and it is words rather than colour
 * (claude/specs/accessibility.md).
 *
 * ⚠️ hasAdminRight RETURNS TRUE FOR A SUPER ADMIN without the right being
 * listed, deliberately. So a super admin sees three open cards and one grey —
 * correct, because the grey one has no screen, not a missing right.
 */
export function isPortalOpen(portal, memberships) {
  if (portal.tabs.length === 0) return false
  if (!portal.right) return true
  return hasAdminRight(memberships, portal.right)
}

/** Why a card is grey, or null when it is not. */
export function closedReason(portal, memberships) {
  if (isPortalOpen(portal, memberships)) return null
  if (portal.tabs.length === 0) return 'no-screen'
  return 'no-right'
}

/**
 * Which portal a pathname belongs to, or null for the chooser itself.
 *
 * ⚠️ MATCHED ON THE TAB URLS, not on a path prefix. The portals do not each own
 * a URL segment — /admin/accounts and /admin/allocation are siblings — so a
 * prefix rule would need every path listed twice anyway, in a second place that
 * could disagree with the first.
 */
export function portalForPath(pathname) {
  return (
    PORTALS.find((portal) => portal.tabs.some((tab) => pathname.startsWith(tab.to))) ?? null
  )
}
