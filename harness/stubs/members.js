// Harness stub replacing src/data/members.js via a Vite alias. Same public
// shape (listClubMembers) as the real module, but returns fixed fixtures
// instead of querying Supabase. Deliberately includes every role (admin,
// coach, parent, player), a member with no team (the admin row, team_id
// null -> teams: null), and enough rows to exercise the sort-by-name and the
// initials tile on awkward names, matching the convention of
// harness/stubs/players.js.
//
// ?membersDelay=<ms> widens the window before the members fetch resolves, so
// a first-load spinner is screenshot-able (same convention as players.js's
// ?playersDelay=<ms>). ?membersThrow=1 makes the fetch reject, so the
// role="alert" + retry path is screenshot-able and the retry can be proven to
// actually re-fetch (the resolved rows are read from the CURRENT query
// params each call, so clearing membersThrow via a real navigation, or
// simply letting retry succeed once membersThrow is dropped from the URL, is
// what the shoot script checks).

const MEMBERS = [
  { id: 'mm1', role: 'admin', profiles: { full_name: 'Jay Muir' }, teams: null },
  { id: 'mm2', role: 'coach', profiles: { full_name: 'Sam Carter' }, teams: { name: 'U12 Boys' } },
  { id: 'mm3', role: 'coach', profiles: { full_name: 'Aisha Al Marzooqi' }, teams: { name: 'U14 Boys' } },
  { id: 'mm4', role: 'parent', profiles: { full_name: 'Priya Nair' }, teams: { name: 'U12 Boys' } },
  { id: 'mm5', role: 'parent', profiles: { full_name: 'Bilal Haddad Sr.' }, teams: { name: 'U14 Boys' } },
  { id: 'mm6', role: 'player', profiles: { full_name: 'Zane Kowalczyk' }, teams: { name: 'U16 Boys' } },
  { id: 'mm7', role: 'player', profiles: { full_name: 'Ronaldinho' }, teams: { name: 'U12 Boys' } },
  { id: 'mm8', role: 'parent', profiles: { full_name: null }, teams: { name: 'U16 Boys' } },
]

export async function listClubMembers() {
  const params = new URLSearchParams(window.location.search)
  const delay = Number(params.get('membersDelay') || 0)
  const shouldThrow = params.get('membersThrow') === '1'

  if (delay > 0) {
    await new Promise((resolve) => setTimeout(resolve, delay))
  }
  if (shouldThrow) {
    throw new Error('permission denied for table memberships')
  }
  return [...MEMBERS]
}
