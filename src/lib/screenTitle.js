// What each screen is called, from its path — the one place that knows.
//
// UX review item 7 (2 Sep 2026): the browser tab read "Abu Dhabi Harlequins"
// on every screen, so twelve open tabs were twelve identical tabs, the back
// list was a column of the same words, and a screen reader announced nothing
// on navigation because nothing changed. useScreenChrome() reads this on
// every route change and writes document.title, focuses <main> and resets
// the scroll.
//
// ⚠️ LONGEST PREFIX WINS, AND THE TABLE IS THE ONLY SOURCE. Screens do not
// set their own title: 55 screens each calling a hook is 55 places to forget,
// and the labels here are the same words the sidebar and the phone dock
// already use (src/components/Nav.jsx, src/components/Sidebar.jsx), so the
// tab, the nav and the heading agree. A path nobody listed falls back to the
// club name alone, which is what every tab said before.
//
// ⚠️ NO NAMES FROM DATA. A squad chat is "Squad chat", not "U12 Boys chat";
// a team sheet is "Team sheet", never "v Dubai Exiles". The title is written
// to the OS and shows in history, task switchers and screenshots long after
// the session, and none of those places carry the app's row-level security.

export const CLUB_NAME = 'Abu Dhabi Harlequins'

// Ordered so that a longer prefix appears before its parent; matched by
// "path equals or starts with prefix + '/'", so '/chat' never swallows
// '/chat/starred'.
const TITLES = [
  ['/admin/accounts', 'Accounts'],
  ['/admin/allocation', 'Pitch allocation'],
  ['/admin/club', 'Club settings'],
  ['/admin/icons', 'Profile icons'],
  ['/admin/needs-attention', 'Needs attention'],
  ['/admin/officers', 'Club officers'],
  ['/admin/pitches', 'Pitches'],
  ['/admin/rights-log', 'Rights log'],
  ['/admin/social/ideas', 'Social ideas'],
  ['/admin/social', 'Social'],
  ['/admin/staff', 'Staff'],
  ['/admin/training/publish', 'Publish training'],
  ['/admin/training/templates', 'Session templates'],
  ['/admin/training', 'Training'],
  ['/admin/welfare/reports', 'Welfare reports'],
  ['/admin/welfare', 'Welfare'],
  ['/admin/youth', 'Youth'],
  ['/admin', 'Admin'],
  ['/accounts', 'Accounts'],
  ['/approvals', 'Approvals'],
  ['/accept-invite', 'Accept invite'],
  ['/auth/confirm', 'Signing in'],
  ['/chat/starred', 'Starred'],
  ['/chat/dm', 'Direct messages'],
  ['/chat', 'Chat'],
  ['/delete-account', 'Delete account'],
  ['/documents', 'Documents'],
  ['/game-time', 'Game time'],
  ['/lineup', 'Team sheet'],
  ['/match-sheet', 'Match sheet'],
  ['/more', 'More'],
  ['/my-reports', 'My reports'],
  ['/notices', 'Notices'],
  ['/pitch-calendar', 'Pitch calendar'],
  ['/privacy', 'Privacy'],
  ['/reset-password', 'Reset password'],
  ['/roster', 'Roster'],
  ['/schedule', 'Schedule'],
  ['/settings', 'Settings'],
  ['/squad', 'Squad Hub'],
]

// Squad Hub sub-screens carry an id in the middle, so they are matched by
// shape rather than by prefix.
const SQUAD_SUB = [
  [/^\/squad\/[^/]+\/chat$/, 'Squad chat'],
  [/^\/squad\/[^/]+\/match-roster$/, 'Match roster'],
  [/^\/squad\/[^/]+\/training$/, 'Training'],
]

/** The screen's own name for a path, or null for a path nobody listed. */
export function screenName(pathname) {
  const path = String(pathname ?? '').replace(/\/+$/, '') || '/'
  if (path === '/') return 'Home'
  for (const [pattern, name] of SQUAD_SUB) if (pattern.test(path)) return name
  for (const [prefix, name] of TITLES) {
    if (path === prefix || path.startsWith(`${prefix}/`)) return name
  }
  return null
}

/** What the browser tab should say: "Roster · Abu Dhabi Harlequins". */
export function documentTitleFor(pathname) {
  const name = screenName(pathname)
  return name ? `${name} · ${CLUB_NAME}` : CLUB_NAME
}
