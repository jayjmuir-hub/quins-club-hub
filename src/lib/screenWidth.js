// Which screens get the whole desktop width, and which get a readable one.
//
// UX review item 8 (2 Sep 2026): 38 of 55 screens stretched edge to edge
// beside the sidebar. A settings page, a notice, a document list or a form
// at 1,600px wide is a line of text the eye loses on the way back — the
// readable limit is about 75 characters, and a card of them wants roughly
// 900-1,000px. So the shell's <main> now has a READABLE DEFAULT on desktop
// and the screens that genuinely use the width opt OUT of it here.
//
// ⚠️ THE OPT-OUTS ARE JAY'S 26 Aug 2026 RULING, NOT AN EXCEPTION TO IT: "why
// can't we have things fill the entire width of the screen?" was said about
// the schedule TABLE, which sat in a sea of empty surface at 820-1,279px.
// Every screen listed below is a table, a grid, a calendar or a thread —
// something whose columns or lanes get better with width. Nothing that is
// paragraphs and form fields is on the list, because for those the width is
// the problem the review named.
//
// ⚠️ DEFAULT READABLE, OPT OUT TO FULL — not the other way round. A new
// screen is far more often a form or a list of cards than a seven-column
// table, and the mistake that costs less is a table that is briefly narrower
// than it could be. Add a table here when you build one.
//
// Matched by "equals or starts with prefix + '/'", the same rule as
// src/lib/screenTitle.js, so '/chat' covers every conversation and
// '/roster' does not cover a hypothetical '/rosterx'.

const FULL_WIDTH = [
  '/',                 // dashboard: a grid of cards that reflows with width
  '/roster',           // the roster table
  '/schedule',         // the fixture table (the 26 Aug ruling)
  '/chat',             // chat list and every conversation thread
  '/pitch-calendar',   // a calendar grid
  '/lineup',           // the team sheet: pitch positions side by side
  '/game-time',        // game-time tables
  '/admin/accounts',   // the accounts table
  '/admin/allocation', // pitch allocation grid
  '/admin/pitches',    // pitch tables
  '/admin/staff',      // staff table
  '/admin/youth',      // youth squads table
  '/admin/rights-log', // an audit table
  '/accounts',         // the /accounts redirect target
  '/approvals',        // the approvals queue mounts Accounts
]

const FULL_WIDTH_SHAPES = [
  /^\/squad\/[^/]+\/chat$/,         // squad chat thread
  /^\/squad\/[^/]+\/match-roster$/, // the match roster table
]

/** True when this path's screen should fill the desktop width. */
export function isFullWidthPath(pathname) {
  const path = String(pathname ?? '').replace(/\/+$/, '') || '/'
  if (path === '/') return true
  for (const shape of FULL_WIDTH_SHAPES) if (shape.test(path)) return true
  return FULL_WIDTH.some((prefix) => prefix !== '/' && (path === prefix || path.startsWith(`${prefix}/`)))
}

// The readable cap. 960px holds a two-column card row and a full-width form
// comfortably; a 75-character paragraph at the app's 14-15px type runs about
// 620px, so a card at this width still reads in one pass.
export const READABLE_MAX_WIDTH_CLASS = 'desktop:max-w-[960px]'
export const FULL_WIDTH_CLASS = 'desktop:max-w-none wide:max-w-none'

/** The desktop width classes for <main> on this path. */
export function mainWidthClass(pathname) {
  return isFullWidthPath(pathname) ? FULL_WIDTH_CLASS : READABLE_MAX_WIDTH_CLASS
}
