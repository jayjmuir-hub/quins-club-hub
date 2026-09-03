// Division codes on a league team, and the words a reader sees for them.
//
// ⚠️ THE CODE IS WHAT IS STORED; THE LABEL IS DERIVED HERE AND NOWHERE ELSE.
// Juniors play lettered divisions (A, B, C — Jay, 11 Aug 2026), and for a
// letter the label is the letter, unchanged from before this file existed.
// Seniors play NAMED competitions (3 Sep 2026, the 2026–27 RCM men's grid and
// the senior women's poster): the West Asia Premiership, Division 1 and
// Division 2 for the men; a 7s league and a XVs league for the women. Those
// are stored as short codes so that fixtureLabel, the event form, the Club
// tab and the calendar feed all say the same thing about the same column.
//
// ⚠️ supabase/functions/calendar/index.ts CARRIES A COPY OF THIS TABLE. An
// edge function cannot import src/, so the feed has its own DIVISION_SHORT
// map and a comment pointing back here. Change both or the subscribed
// calendar drifts from the app — the exact failure fixtureLabel exists to
// prevent.
//
// ⚠️ A CODE THIS FILE DOES NOT KNOW STILL RENDERS — as "Div <code>", which is
// exactly what every renderer did before this file existed — so a code added
// to the database check before it is added here degrades to the old wording,
// never to nothing. db/migrations/20260904_senior_divisions.sql holds the
// database's list; keep the two in step.
//
// ⚠️ THE CODE IS ALSO THE FIXTURE'S TIER. A league fixture's `tier` is
// prefilled from its league team's division (EventForm), and the tier check
// admits the same codes. src/lib/tierEligibility.js ranks only A, B and C and
// stays silent on anything else, so a senior code never invents a grade
// warning — asserted in tests/division.test.js.

export const DIVISIONS = [
  { code: 'A', short: 'Div A', long: 'Division A', senior: false },
  { code: 'B', short: 'Div B', long: 'Division B', senior: false },
  { code: 'C', short: 'Div C', long: 'Division C', senior: false },
  { code: 'WAP', short: 'Premiership', long: 'West Asia Premiership', senior: true },
  { code: 'D1', short: 'Div 1', long: 'Division 1', senior: true },
  { code: 'D2', short: 'Div 2', long: 'Division 2', senior: true },
  { code: 'W7s', short: 'W7s', long: "Women's 7s", senior: true },
  { code: 'WXV', short: 'WXVs', long: "Women's XVs", senior: true },
]

export const DIVISION_CODES = DIVISIONS.map((division) => division.code)

/** The divisions to OFFER for a squad — lettered for juniors, named for seniors. */
export function divisionsFor({ senior = false } = {}) {
  return DIVISIONS.filter((division) => division.senior === (senior === true))
}

function find(code) {
  return DIVISIONS.find((division) => division.code === code) ?? null
}

/** "Div B", "Premiership" — the chip-sized label. '' for no division. */
export function divisionShort(code) {
  if (!code) return ''
  return find(code)?.short ?? `Div ${code}`
}

/** "Division B", "West Asia Premiership" — the spoken / select label. '' for none. */
export function divisionLong(code) {
  if (!code) return ''
  return find(code)?.long ?? `Division ${code}`
}
