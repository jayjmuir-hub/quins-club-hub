import { adminRightLabel, hasAdminRight } from './scope.js'

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
// ⚠️ THE LABELS COME FROM adminRightLabel, NOT FROM STRINGS HERE. The three job
// names are Jay's ruling of 12 Aug 2026 and they already have a single home in
// src/lib/scope.js. Copying them would give the ruling two homes, and two
// copies of a fact are two copies that drift.
// claude/decisions/2026-08-12-jobs-not-people.md

export const PORTALS = [
  {
    key: 'club',
    // ⚠️ NO RIGHT. Every admin holds this one — it is what `admin` already
    // means, and Accounts is where a super admin hands the other three out.
    // Its label is a string because it is not one of the three JOBS; there is
    // no right whose label it could borrow.
    right: null,
    label: 'Club Admin',
    blurb: 'Accounts, access and the club’s squads.',
    tabs: [
      { to: '/admin/accounts', label: 'Accounts' },
      { to: '/admin/club', label: 'Club' },
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
    blurb: 'Nothing here yet.',
    // ⚠️ EMPTY ON PURPOSE, AND THIS IS WHAT KEEPS THE CARD HONEST. No
    // social-media screen exists. A portal with no tabs is greyed regardless of
    // the right (see isPortalOpen), so the day a screen is added to this array
    // the card opens by itself — no second edit, nothing to forget.
    tabs: [],
  },
]

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
