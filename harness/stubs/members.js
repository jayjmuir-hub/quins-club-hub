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

// Task 5 (Accounts) widened these rows to the full shape the real
// listClubMembers now returns: profile_id (what the screen groups by),
// team_id + created_at (the age-group select and the Joined column), the
// profiles email, and the players(full_name) embed behind the Linked player
// column. `mm4`/`mm5` carry a linked player, the admin and coach rows do not
// — which is the real distribution, and the reason the column needs a
// placeholder at all. `mm2`/`mm9` share one profile_id so the group-by-person
// path renders a block with two access rows, and `mm8` keeps a null name so
// the "Unnamed member" fallback stays screenshot-able.
const MEMBERS = [
  { id: 'mm1', profile_id: 'pr-jay', role: 'admin', team_id: null, player_id: null, created_at: '2026-01-05T09:00:00Z', profiles: { full_name: 'Jay Muir', email: 'jayjmuir@gmail.com' }, teams: null, players: null },
  { id: 'mm2', profile_id: 'pr-sam', role: 'coach', team_id: 't1', player_id: null, created_at: '2026-02-01T09:00:00Z', profiles: { full_name: 'Sam Carter', email: 'coach.sam@adhq.example' }, teams: { name: 'U12 Boys' }, players: null },
  { id: 'mm9', profile_id: 'pr-sam', role: 'coach', team_id: 't2', player_id: null, created_at: '2026-02-03T09:00:00Z', profiles: { full_name: 'Sam Carter', email: 'coach.sam@adhq.example' }, teams: { name: 'U14 Boys' }, players: null },
  { id: 'mm3', profile_id: 'pr-aisha', role: 'coach', team_id: 't2', player_id: null, created_at: '2026-02-10T09:00:00Z', profiles: { full_name: 'Aisha Al Marzooqi', email: 'aisha@adhq.example' }, teams: { name: 'U14 Boys' }, players: null },
  { id: 'mm4', profile_id: 'pr-priya', role: 'parent', team_id: 't1', player_id: 'p1', created_at: '2026-03-01T09:00:00Z', profiles: { full_name: 'Priya Nair', email: 'priya@adhq.example' }, teams: { name: 'U12 Boys' }, players: { full_name: 'Arjun Nair' } },
  { id: 'mm5', profile_id: 'pr-bilal', role: 'parent', team_id: 't2', player_id: 'p2', created_at: '2026-03-04T09:00:00Z', profiles: { full_name: 'Bilal Haddad Sr.', email: 'bilal@adhq.example' }, teams: { name: 'U14 Boys' }, players: { full_name: 'Bilal Haddad' } },
  { id: 'mm6', profile_id: 'pr-zane', role: 'player', team_id: 't3', player_id: 'p21', created_at: '2026-03-06T09:00:00Z', profiles: { full_name: 'Zane Kowalczyk', email: 'zane@adhq.example' }, teams: { name: 'U16 Boys' }, players: { full_name: 'Zane Kowalczyk' } },
  { id: 'mm7', profile_id: 'pr-ronaldinho', role: 'player', team_id: 't1', player_id: 'p3', created_at: '2026-03-07T09:00:00Z', profiles: { full_name: 'Ronaldinho', email: 'ronaldinho@adhq.example' }, teams: { name: 'U12 Boys' }, players: { full_name: 'Ronaldinho' } },
  { id: 'mm8', profile_id: 'pr-anon', role: 'parent', team_id: 't3', player_id: null, created_at: '2026-03-09T09:00:00Z', profiles: { full_name: null, email: 'no-name@adhq.example' }, teams: { name: 'U16 Boys' }, players: null },
]

// The real module exports this too (src/lib/memberships.jsx calls it). The
// harness aliases src/lib/memberships.jsx to its own stub so nothing here
// actually calls it — but a stub that is missing an export its real module
// has is exactly the drift that took down EVERY scenario once before
// (players.js/insertPlayers), so the mirror is kept complete on purpose.
export async function loadMyMemberships() {
  return MEMBERS.map(({ profiles, teams, players, ...row }) => row)
}

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

// Task 18 additions, following the same ?<name>Delay=/<name>Throw= knob
// convention as listClubMembers above.
//
// ?inviteDelay=<ms> widens the window before createInvite resolves, so the
// form's "Sending…" disabled-button state is screenshot-able. ?inviteThrow=1
// makes it reject with the same message InviteForm's doc comment says the
// real REFUSED_INVITE constant produces, so the role="alert" path is
// screenshot-able without needing a real RLS refusal.
export async function createInvite({ email, role, teamId } = {}) {
  const params = new URLSearchParams(window.location.search)
  const delay = Number(params.get('inviteDelay') || 0)
  const shouldThrow = params.get('inviteThrow') === '1'

  if (delay > 0) {
    await new Promise((resolve) => setTimeout(resolve, delay))
  }
  if (shouldThrow) {
    throw new Error("We couldn't send that invite. You may not have permission to invite members.")
  }
  return {
    id: 'inv-stub-1',
    email,
    role,
    team_id: teamId ?? null,
    token: 'stub-token-abcdef123456',
  }
}

// ?acceptDelay=<ms> (default 500) widens the window before acceptInvite
// resolves, so AcceptInvite's "Accepting your invite…" spinner state is
// screenshot-able instead of resolving before the first paint. ?acceptThrow=1
// makes it reject; ?acceptError=<text> (URL-encoded) picks the message, so
// the "already used"/"wrong email" wording the real RPC returns can be
// exercised verbatim without a live Supabase call.
export async function acceptInvite(token) {
  const params = new URLSearchParams(window.location.search)
  const delay = Number(params.get('acceptDelay') ?? 500)
  const shouldThrow = params.get('acceptThrow') === '1'
  const errorMessage = params.get('acceptError') || 'This invite has already been used.'

  if (delay > 0) {
    await new Promise((resolve) => setTimeout(resolve, delay))
  }
  if (shouldThrow) {
    throw new Error(errorMessage)
  }
  return { id: 'm-new', role: 'player', team_id: 't1', player_id: 'p1', token }
}

// Task 5 additions: the three writers the Accounts screen calls. Same
// ?<name>Delay=/<name>Throw= knob convention as everything above, so the
// in-flight disabled state and the inline refusal message are both
// screenshot-able without a live RLS refusal.
//
// These mirror src/data/members.js's exports one-for-one. That is not
// housekeeping: harness/main.jsx statically imports every screen, so a single
// missing export here is a module-resolution failure that blanks EVERY
// scenario, not just the new one (this happened with players.js/insertPlayers
// during the Overview build).
export async function updateMembershipRole({ membershipId, role, teamId } = {}) {
  const params = new URLSearchParams(window.location.search)
  const delay = Number(params.get('writeDelay') || 0)
  const shouldThrow = params.get('writeThrow') === '1'

  if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay))
  if (shouldThrow) {
    throw new Error(
      "We couldn't change that member's access. You may not have permission to manage members.",
    )
  }
  // Same admin-implies-no-team coercion the real function applies, so the
  // screen's "All age groups" branch is driven by the response, not by hope.
  return { id: membershipId, role, team_id: role === 'admin' ? null : teamId ?? null }
}

export async function deleteMembership(membershipId) {
  const params = new URLSearchParams(window.location.search)
  const delay = Number(params.get('writeDelay') || 0)
  const shouldThrow = params.get('writeThrow') === '1'

  if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay))
  if (shouldThrow) {
    throw new Error(
      "We couldn't remove that member's access. You may not have permission to manage members.",
    )
  }
  return undefined
}

// Mirrors the real getMyProfile (src/data/members.js), which AppShell's
// NamePrompt (plan Task C) calls on every load — a stub missing an export its
// real module has is exactly the drift that took down every scenario once
// before. ?blankName=1 returns a profile with no name, so the first-login
// name prompt is screenshot-able; by default the signed-in user is named and
// the prompt stays shut.
// ?unconfirmedName=1 opens the sign-in name GATE (name_confirmed_at null).
// It is deliberately separate from ?blankName=1: the gate's whole point is
// that a populated-but-unconfirmed name still has to be confirmed, so the two
// knobs together make the Google case (prefilled, confirmable) and the
// magic-link case (empty, typed) both screenshot-able.
export async function getMyProfile(userId) {
  if (!userId) throw new Error('getMyProfile needs a user id.')
  const params = new URLSearchParams(window.location.search)
  const blank = params.get('blankName') === '1'
  const unconfirmed = params.get('unconfirmedName') === '1'
  return {
    id: userId,
    full_name: blank ? '' : 'Jay Muir',
    first_name: blank ? '' : 'Jay',
    last_name: blank ? '' : 'Muir',
    name_confirmed_at: unconfirmed ? null : '2026-08-06T09:00:00Z',
    email: 'jayjmuir@gmail.com',
    created_at: '2026-01-05T09:00:00Z',
  }
}

// Mirrors the real updateProfileNames: the person naming THEMSELVES in the
// sign-in gate, which is also the only writer of name_confirmed_at. Distinct
// from updateProfileName below, which is an admin renaming someone else.
export async function updateProfileNames({ profileId, firstName, lastName } = {}) {
  const params = new URLSearchParams(window.location.search)
  const delay = Number(params.get('writeDelay') || 0)

  if (!profileId) throw new Error('updateProfileNames needs a profileId.')
  const first = String(firstName ?? '').trim()
  const last = String(lastName ?? '').trim()
  if (!first) throw new Error('Enter your first name.')

  if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay))
  if (params.get('writeThrow') === '1') {
    throw new Error(
      "We couldn't save that name. You may not have permission to change this member's details.",
    )
  }

  return {
    id: profileId,
    first_name: first,
    last_name: last || null,
    // Mirrors the profiles_sync_name trigger, so anything reading full_name
    // back from this stub sees what the database would actually have stored.
    full_name: [first, last].filter(Boolean).join(' '),
    name_confirmed_at: '2026-08-06T12:00:00Z',
  }
}

// Mirrors the real claimRosterAccess. Takes no arguments, exactly like the
// real one — the RPC reads the caller's email server-side, and a stub that
// accepted an email here would quietly misrepresent the security property
// that makes the whole feature safe.
//
// Returns [] by default, which is the honest common case for the harness (the
// stub user already has memberships, so the real RPC would decline). ?claim=2
// returns two rows, the sibling-in-two-age-groups case.
export async function claimRosterAccess() {
  const params = new URLSearchParams(window.location.search)
  const delay = Number(params.get('claimDelay') || 0)

  if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay))
  if (params.get('claimThrow') === '1') {
    throw new Error('permission denied for function claim_roster_access')
  }
  if (params.get('claim') !== '2') return []

  return [
    { id: 'mm-claim-1', profile_id: 'pr-new', club_id: 'club-1', role: 'parent', team_id: 't1', player_id: 'p1', created_at: '2026-08-06T12:00:00Z' },
    { id: 'mm-claim-2', profile_id: 'pr-new', club_id: 'club-1', role: 'parent', team_id: 't2', player_id: 'p2', created_at: '2026-08-06T12:00:00Z' },
  ]
}

export async function updateProfileName({ profileId, fullName } = {}) {
  const params = new URLSearchParams(window.location.search)
  const delay = Number(params.get('writeDelay') || 0)
  const shouldThrow = params.get('writeThrow') === '1'

  if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay))
  if (shouldThrow) {
    throw new Error(
      "We couldn't save that name. You may not have permission to change this member's details.",
    )
  }
  return { id: profileId, full_name: String(fullName ?? '').trim() }
}

// Task D additions: the two exports the "Waiting for access" section on
// Accounts calls. Their absence blanked EVERY scenario for the whole of
// Task B/C — harness/main.jsx statically imports every screen, so an
// unresolved named import from this file is a module-resolution failure for
// the entire bundle, not just for Accounts. tests/harness-stubs.test.js now
// compares every stub's exports against the real module it is aliased to, so
// this cannot silently recur — it fails `npx vitest run` instead.

// The unattached signups: profiles rows with NO membership. `pn-janice`
// mirrors the real account that started this plan (signed up by magic link,
// no name collected, zero memberships), `pn-omar` has a name, and
// `pn-stranger` is the nobody-recognises-them case the UI copy is about.
const PENDING_PROFILES = [
  { id: 'pn-janice', full_name: '', email: 'janice.muir@yahoo.com', created_at: '2026-08-03T11:37:00Z' },
  { id: 'pn-omar', full_name: 'Omar Farooq', email: 'omar.farooq@adhq.example', created_at: '2026-07-30T08:12:00Z' },
  { id: 'pn-stranger', full_name: null, email: 'someone@example.com', created_at: '2026-07-21T19:04:00Z' },
]

// Mirrors the real listPendingProfiles, INCLUDING the part that misleads:
// it returns every profile the caller can read, NOT just the pending ones.
// For an admin that is the union of three RLS policies — own row, everyone
// with a membership in this club, everyone anywhere with none — and the
// screen is what subtracts listClubMembers()'s profile_ids. So this stub
// deliberately returns the member profiles TOO: a stub that returned only
// the unattached rows would make the screen's subtraction untestable and
// would hide the feature's highest-risk bug (every member listed as
// "waiting"). Newest first, matching the real .order('created_at', desc).
//
// ?pending=none returns only the member profiles, so the "Nobody is waiting
// for access" empty state is screenshot-able. ?pendingThrow=1 rejects, which
// under the screen's Promise.allSettled must cost only this section (the
// member list still renders). ?pendingDelay=<ms> follows the same convention
// as every other knob in this file.
export async function listPendingProfiles() {
  const params = new URLSearchParams(window.location.search)
  const delay = Number(params.get('pendingDelay') || 0)

  if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay))
  if (params.get('pendingThrow') === '1') {
    throw new Error('permission denied for table profiles')
  }

  const memberProfiles = []
  const seen = new Set()
  MEMBERS.forEach((member) => {
    if (seen.has(member.profile_id)) return
    seen.add(member.profile_id)
    memberProfiles.push({
      id: member.profile_id,
      full_name: member.profiles.full_name,
      email: member.profiles.email,
      created_at: member.created_at,
    })
  })

  const rows =
    params.get('pending') === 'none' ? memberProfiles : [...PENDING_PROFILES, ...memberProfiles]

  return rows.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
}

// Mirrors the real grantMembership, including both halves of its role/team
// rule (role 'admin' coerces team_id to null; any other role with no teamId
// throws BEFORE the network call), so the screen's inline refusal path is
// reachable from the harness without a live insert. Same ?writeDelay/
// ?writeThrow knobs as the other writers above.
export async function grantMembership({ profileId, clubId, role, teamId, playerId } = {}) {
  const params = new URLSearchParams(window.location.search)
  const delay = Number(params.get('writeDelay') || 0)

  if (!profileId) throw new Error('grantMembership needs a profileId.')
  if (!clubId) throw new Error('grantMembership needs a clubId.')
  if (role !== 'admin' && !teamId) throw new Error('Choose an age group for this role.')

  if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay))
  if (params.get('writeThrow') === '1') {
    throw new Error(
      "We couldn't give that person access. You may not have permission to manage members.",
    )
  }

  return {
    id: `mm-granted-${profileId}`,
    profile_id: profileId,
    club_id: clubId,
    role,
    team_id: role === 'admin' ? null : teamId ?? null,
    player_id: playerId ?? null,
    created_at: '2026-08-03T12:00:00Z',
  }
}

// Mirrors the real grantMemberships: the multi-access grant, one membership
// row per entry. Validates the WHOLE list before "writing" anything (a
// half-applied grant is the thing the real one makes impossible) and collapses
// identical rows, since memberships has no unique constraint to do it. Same
// ?writeDelay/?writeThrow knobs as every other writer here.
export async function grantMemberships(rows) {
  const params = new URLSearchParams(window.location.search)
  const delay = Number(params.get('writeDelay') || 0)

  if (!Array.isArray(rows) || rows.length === 0) return []

  const built = rows.map(({ profileId, clubId, role, teamId, playerId } = {}) => {
    if (!profileId) throw new Error('grantMemberships needs a profileId.')
    if (!clubId) throw new Error('grantMemberships needs a clubId.')
    if (role !== 'admin' && !teamId) throw new Error('Choose an age group for this role.')
    return {
      profile_id: profileId,
      club_id: clubId,
      role,
      team_id: role === 'admin' ? null : teamId ?? null,
      player_id: playerId ?? null,
    }
  })

  const seen = new Set()
  const unique = built.filter((row) => {
    const key = JSON.stringify([row.profile_id, row.club_id, row.role, row.team_id, row.player_id])
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay))
  if (params.get('writeThrow') === '1') {
    throw new Error(
      "We couldn't give that person access. You may not have permission to manage members.",
    )
  }

  return unique.map((row, index) => ({
    id: `mm-granted-${row.profile_id}-${index}`,
    ...row,
    created_at: '2026-08-03T12:00:00Z',
  }))
}
