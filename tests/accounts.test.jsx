import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// Unit tests for src/screens/Accounts.jsx (design spec 2026-08-03 §2).
// useMemberships, useAuth and src/data/members.js are all mocked, following
// tests/admin.test.jsx's style, so this exercises only the screen's own
// behaviour: the admin gate, grouping by person, the role/age-group writes,
// the last-admin guard and the revoke confirmation. No network is reachable
// from this file.

const useMembershipsMock = vi.fn()
const useAuthMock = vi.fn()
const listClubMembersMock = vi.fn()
const listPendingProfilesMock = vi.fn()
const grantMembershipsMock = vi.fn()
const listPlayersMock = vi.fn()
const listPlayerPrivateMock = vi.fn()
const upsertPlayerMock = vi.fn()
const listParentsForPlayersMock = vi.fn()
const listVouchesMock = vi.fn()
const setVouchMock = vi.fn()
const listAccessRequestsMock = vi.fn()
const dismissAccessRequestMock = vi.fn()
const restoreAccessRequestMock = vi.fn()
const updateMembershipRoleMock = vi.fn()
const deleteMembershipMock = vi.fn()
const updateProfileNameMock = vi.fn()
// ⚠️ NEW 9 Aug 2026. The sheet's details form writes first_name/last_name/phone
// through updateMemberProfile; updateProfileName (the legacy full_name writer)
// no longer has a control anywhere on this screen.
const updateMemberProfileMock = vi.fn()

vi.mock('../src/lib/memberships.jsx', () => ({
  useMemberships: () => useMembershipsMock(),
}))

vi.mock('../src/lib/auth.jsx', () => ({
  useAuth: () => useAuthMock(),
}))

vi.mock('../src/data/members.js', () => ({
  countAdminWaiting: () => Promise.resolve(0),
  listClubMembers: (...args) => listClubMembersMock(...args),
  listPendingProfiles: (...args) => listPendingProfilesMock(...args),
  grantMemberships: (...args) => grantMembershipsMock(...args),
  updateMembershipRole: (...args) => updateMembershipRoleMock(...args),
  deleteMembership: (...args) => deleteMembershipMock(...args),
  updateProfileName: (...args) => updateProfileNameMock(...args),
  updateMemberProfile: (...args) => updateMemberProfileMock(...args),
}))

// The child picker reads the WHOLE roster (listPlayers with no teamIds), so
// this screen now touches players.js too.
vi.mock('../src/data/players.js', () => ({
  listPlayers: (...args) => listPlayersMock(...args),
  // ⚠️ THE APPROVAL QUEUE READS player_private FOR ITS PENDING ROWS (17 Aug
  // 2026), to mark a child as playing up. An unmocked export is undefined and
  // calling it in an effect throws before the queue renders at all — which
  // shows up as every card in this file disappearing, not as a missing chip.
  listPlayerPrivate: (...args) => listPlayerPrivateMock(...args),
  // ⚠️ NOT MOCKED UNTIL 20 Aug 2026, WHICH IS WHY THE club_id BUG SHIPPED.
  // AccessBuilder calls this to create a player who is not on the roster yet.
  // An unmocked export is undefined, so no test could reach that path — and
  // none did. The insert it builds was missing a NOT NULL column the whole time.
  upsertPlayer: (...args) => upsertPlayerMock(...args),
}))

// The approval gate: who asked for access, and who has been dismissed.
// ⚠️ ADDED 17 Aug 2026 WITH THE COMPLETENESS CHIP. The approval queue now reads
// parent rows alongside player_private, in ONE Promise.all — so an unmocked
// export here does not fail loudly, it REJECTS the pair and silently clears BOTH
// chips, including the play-up one that has nothing to do with parents.
vi.mock('../src/data/vouches.js', () => ({
  listVouches: (...args) => listVouchesMock(...args),
  setVouch: (...args) => setVouchMock(...args),
  // ⚠️ NOT MOCKED AWAY: tallyVouches is a pure function and the screen's counts
  // are only as right as it is. Stubbing it would test the mock's arithmetic.
  tallyVouches: (rows, voucherId) => {
    const byMembership = new Map()
    for (const row of rows ?? []) {
      const t = byMembership.get(row.membership_id) ?? { known: 0, unknown: 0, mine: null }
      if (row.answer === 'known') t.known += 1
      if (row.answer === 'unknown') t.unknown += 1
      if (voucherId && row.voucher_id === voucherId) t.mine = row.answer
      byMembership.set(row.membership_id, t)
    }
    return byMembership
  },
}))

vi.mock('../src/data/parents.js', () => ({
  listParentsForPlayers: (...args) => listParentsForPlayersMock(...args),
}))

vi.mock('../src/data/accessRequests.js', () => ({
  listAccessRequests: (...args) => listAccessRequestsMock(...args),
  dismissAccessRequest: (...args) => dismissAccessRequestMock(...args),
  restoreAccessRequest: (...args) => restoreAccessRequestMock(...args),
}))

// Import after vi.mock so this binds to the mocked modules.
import Accounts from '../src/screens/Accounts.jsx'

const CLUB_ID = '00000000-0000-0000-0000-0000000000ad'

// ⚠️ `club_id` IS LOAD-BEARING, AND ITS ABSENCE SHIPPED A BUG — 20 Aug 2026.
// teams.club_id is NOT NULL, so a fixture without one was a row that cannot
// exist — the same defect the `status` note below records for memberships.
// AccessBuilder derives a new player's club_id from the chosen squad, and with
// club-less teams here every test passed while the live screen answered an
// admin mid-approval with: null value in column "club_id" of relation
// "players" violates not-null constraint.
const TEAM_U10 = { id: 'team-u10', name: 'U10', sort_order: 5, club_id: CLUB_ID }
const TEAM_U12 = { id: 'team-u12', name: 'U12 Boys', sort_order: 6, club_id: CLUB_ID }
const TEAMS = [TEAM_U12, TEAM_U10] // deliberately unsorted; the screen sorts

// ⚠️ `status` IS LOAD-BEARING HERE — 17 Aug 2026. memberships.status is NOT
// NULL in the database, so a fixture without one is a row that cannot exist.
// Every membership fixture in this suite lacked it, which is why nothing here
// could tell a PENDING staff request from granted access — the hole found in
// private.can_approve_team the same day.
const ADMIN = [{ id: 'm1', role: 'admin', status: 'active', team_id: null, club_id: CLUB_ID }]
const COACH = [{ id: 'm2', role: 'coach', team_id: 'team-u10', status: 'active' }]
const PARENT = [{ id: 'm3', role: 'parent', team_id: 'team-u10', player_id: 'p1', status: 'active' }]

const SELF_ID = 'profile-jay'

// The roster the child picker searches. Two siblings in DIFFERENT age groups
// (Zara in U10, Omar in U12) is the case the whole multi-access change exists
// for: one parent, two rows, two different derived teams.
const PLAYERS = [
  { id: 'player-omar', full_name: 'Omar Ali', team_id: 'team-u12' },
  { id: 'player-zara', full_name: 'Zara Ali', team_id: 'team-u10' },
  { id: 'player-noor', full_name: 'Noor Khan', team_id: 'team-u10' },
]

// Jay (the signed-in admin) plus two others. Sara holds TWO membership rows —
// memberships has no unique constraint, so this is legitimate data and the
// screen must group it into one block rather than printing her name twice.
const JAY_ADMIN = {
  id: 'mem-jay',
  profile_id: SELF_ID,
  role: 'admin',
  team_id: null,
  created_at: '2026-01-05T09:00:00Z',
  profiles: { full_name: 'Jay Muir', email: 'jay@example.com' },
  teams: null,
}
const SARA_COACH = {
  id: 'mem-sara-coach',
  profile_id: 'profile-sara',
  role: 'coach',
  team_id: 'team-u10',
  created_at: '2026-02-01T09:00:00Z',
  profiles: { full_name: 'Sara Coach', email: 'sara@example.com' },
  teams: { name: 'U10' },
}
const SARA_PARENT = {
  id: 'mem-sara-parent',
  profile_id: 'profile-sara',
  role: 'parent',
  team_id: 'team-u12',
  created_at: '2026-02-02T09:00:00Z',
  profiles: { full_name: 'Sara Coach', email: 'sara@example.com' },
  teams: { name: 'U12 Boys' },
}
// The only row here with a linked player. memberships.player_id is null for
// admin and coach rows by design (there is no player to point at), so this
// fixture set deliberately mixes the two: Ali's parent row carries a child,
// Jay's admin and Sara's coach/parent rows do not.
const ALI_PARENT = {
  id: 'mem-ali',
  profile_id: 'profile-ali',
  role: 'parent',
  team_id: 'team-u12',
  player_id: 'player-omar',
  created_at: '2026-03-01T09:00:00Z',
  profiles: { full_name: 'Ali Parent', email: 'ali@example.com' },
  teams: { name: 'U12 Boys' },
  players: { full_name: 'Omar Ali' },
}

const MEMBER_ROWS = [JAY_ADMIN, SARA_COACH, SARA_PARENT, ALI_PARENT]

// What listPendingProfiles ACTUALLY returns for an admin: their own profile,
// every profile with a membership in their club, AND the genuinely unattached
// signups — the union of three RLS policies, not a pending list. Only the last
// two rows here are waiting for access. Any test fixture that returns only the
// unattached rows would hide the exact bug this screen has to avoid.
const MARISA_PENDING = {
  id: 'profile-marisa',
  full_name: '',
  email: 'marisa@example.com',
  created_at: '2026-08-03T11:37:00Z',
}
const RAW_PENDING = {
  id: 'profile-raw',
  full_name: 'Raw Recruit',
  email: 'raw@example.com',
  created_at: '2026-08-02T08:00:00Z',
}
const PROFILE_ROWS = [
  MARISA_PENDING,
  RAW_PENDING,
  { id: SELF_ID, full_name: 'Jay Muir', email: 'jay@example.com', created_at: '2026-01-05T09:00:00Z' },
  { id: 'profile-sara', full_name: 'Sara Coach', email: 'sara@example.com', created_at: '2026-02-01T09:00:00Z' },
  { id: 'profile-ali', full_name: 'Ali Parent', email: 'ali@example.com', created_at: '2026-03-01T09:00:00Z' },
]

// ---------------------------------------------------------------------------
// The five-child parent fixture (Jay, 3 Aug 2026: "some parents have 3, 4 or
// even 5 children at the club, across different age groups").
//
// The roster here is 45 players — deliberately bigger than PlayerPicker's
// MAX_RESULTS = 25 — so the draw cap is genuinely active while these tests
// run. Two of the five Haddad children sit past index 25 and are therefore not
// even DRAWN until they are searched for, which is the only honest way to
// prove the cap limits what is shown and never what can be selected.
const TEAM_U8 = { id: 'team-u8', name: 'U8', sort_order: 3 }
const TEAM_U14 = { id: 'team-u14', name: 'U14', sort_order: 8 }
const TEAM_U16 = { id: 'team-u16', name: 'U16', sort_order: 10 }
const BIG_TEAMS = [TEAM_U14, TEAM_U8, TEAM_U16, TEAM_U12, TEAM_U10] // unsorted on purpose

// One family, five children, five different age groups. They share a surname
// (as a real family does), so each child is reached by a DIFFERENT search
// term — their first name — and each of those terms matches exactly one row.
// That matters: when the query is "layla", Yusuf is not in the result list at
// all, so his chip staying on screen proves the selection lives in the caller
// and survives a query that no longer matches him.
const HADDADS = [
  { id: 'player-yusuf', full_name: 'Yusuf Haddad', team_id: 'team-u8' },
  { id: 'player-layla', full_name: 'Layla Haddad', team_id: 'team-u10' },
  { id: 'player-ibrahim', full_name: 'Ibrahim Haddad', team_id: 'team-u12' },
  { id: 'player-noura', full_name: 'Noura Haddad', team_id: 'team-u14' },
  { id: 'player-zaid', full_name: 'Zaid Haddad', team_id: 'team-u16' },
]

// 40 other players. No filler name contains "haddad" or any Haddad first name
// as a substring, so every search below is unambiguous.
const FILLER_FIRST = [
  'Adam', 'Ben', 'Callum', 'Daniel', 'Ethan', 'Farhan', 'George', 'Hamza',
  'Isaac', 'Jack', 'Kareem', 'Liam', 'Mohsin', 'Nathan', 'Oscar', 'Patrick',
  'Quentin', 'Rashid', 'Samir', 'Tariq',
]
const FILLER_LAST = ['Brown', 'Carter']
const FILLER_TEAMS = ['team-u8', 'team-u10', 'team-u12', 'team-u14', 'team-u16']
const FILLER = FILLER_LAST.flatMap((last, lastIndex) =>
  FILLER_FIRST.map((first, firstIndex) => ({
    id: `filler-${lastIndex}-${firstIndex}`,
    full_name: `${first} ${last}`,
    team_id: FILLER_TEAMS[(lastIndex * FILLER_FIRST.length + firstIndex) % FILLER_TEAMS.length],
  })),
)

// Scattered, not clustered: indexes 3, 12, 26, 33 and 44 of 45. The last two
// are past the 25-row cap, so an unsearched picker cannot reach them.
const BIG_ROSTER = [
  ...FILLER.slice(0, 3),
  HADDADS[0],
  ...FILLER.slice(3, 11),
  HADDADS[1],
  ...FILLER.slice(11, 24),
  HADDADS[2],
  ...FILLER.slice(24, 30),
  HADDADS[3],
  ...FILLER.slice(30, 40),
  HADDADS[4],
]

function memberships(rows, teams = TEAMS) {
  return {
    memberships: rows,
    realMemberships: rows,
    viewAs: null,
    setViewAs: vi.fn(),
    teams,
    loading: false,
    error: null,
    reload: vi.fn(),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  useMembershipsMock.mockReturnValue(memberships(ADMIN))
  useAuthMock.mockReturnValue({ user: { id: SELF_ID, email: 'jay@example.com' } })
  listClubMembersMock.mockResolvedValue(MEMBER_ROWS)
  listPendingProfilesMock.mockResolvedValue(PROFILE_ROWS)
  listPlayersMock.mockResolvedValue(PLAYERS)
  // Nobody is playing up by default: the chip is the exception, and a fixture
  // that showed it everywhere would make its absence the thing to assert.
  listPlayerPrivateMock.mockResolvedValue([])
  listParentsForPlayersMock.mockResolvedValue([])
  listVouchesMock.mockResolvedValue([])
  setVouchMock.mockResolvedValue({ membership_id: 'mem-pending', answer: 'unknown' })
  // Default: nobody has asked and nobody has been dismissed, so the waiting
  // list behaves exactly as it did before this feature existed.
  listAccessRequestsMock.mockResolvedValue([])
  dismissAccessRequestMock.mockImplementation(async ({ profileId, decidedBy }) => ({
    id: `req-${profileId}`,
    profile_id: profileId,
    note: null,
    status: 'dismissed',
    decided_by: decidedBy,
  }))
  restoreAccessRequestMock.mockResolvedValue(undefined)
  // Mirrors grantMemberships: one returned row per requested row, with the
  // data layer's admin coercion (team_id null) applied.
  grantMembershipsMock.mockImplementation(async (rows) =>
    rows.map((row, index) => ({
      id: `mem-new-${row.profileId}-${index}`,
      profile_id: row.profileId,
      club_id: row.clubId,
      role: row.role,
      team_id: row.role === 'admin' ? null : row.teamId,
      player_id: row.playerId ?? null,
      created_at: '2026-08-03T12:00:00Z',
    })),
  )
  updateMembershipRoleMock.mockImplementation(async ({ membershipId, role, teamId }) => ({
    id: membershipId,
    role,
    team_id: role === 'admin' ? null : teamId,
  }))
  deleteMembershipMock.mockResolvedValue(undefined)
  updateProfileNameMock.mockImplementation(async ({ fullName }) => ({ full_name: fullName.trim() }))
  updateMemberProfileMock.mockImplementation(async ({ firstName, lastName, phone }) => ({
    first_name: firstName?.trim() ?? null,
    last_name: lastName?.trim() ?? null,
    full_name: [firstName, lastName].map((part) => part?.trim()).filter(Boolean).join(' '),
    phone: phone ?? null,
  }))
})

function setup() {
  const user = userEvent.setup()
  const utils = render(<Accounts />)
  return { user, ...utils }
}

// ⚠️ THE ACCESS CONTROLS MOVED INTO A SHEET on 9 Aug 2026 (Jay: "admins need
// the ability to click on account and change all details, except the email").
// Role, age group, linked player, Revoke and Add access are no longer on the
// list — the list is a summary, and opening a person is what reveals them.
//
// Every test below that touches those controls opens the sheet first through
// this helper. It deliberately does NOT weaken any assertion: the same testids
// and the same aria-labels are asserted, one click later.
async function openPerson(user, name) {
  const card = screen
    .getAllByTestId('account-person')
    .find((block) => within(block).queryByText(name))
  if (!card) throw new Error(`No account card for "${name}" — check the fixture.`)
  await user.click(within(card).getByRole('button', { name: `Edit ${name}` }))
  return screen.findByRole('dialog')
}

// Only ONE sheet can be open at a time, so any assertion that used to span two
// people is now open → assert → close → open the next. Sheet's own close
// control (its X); Escape works too.
async function closePerson(user) {
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Close' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
}

// Sums the membership rows across every person, one sheet at a time — the
// replacement for the old screen-wide getAllByTestId('account-membership').
async function countMembershipRows(user, names) {
  let total = 0
  for (const name of names) {
    const dialog = await openPerson(user, name)
    total += within(dialog).getAllByTestId('account-membership').length
    await closePerson(user)
  }
  return total
}

// Finds the rendered membership row whose role/age-group controls carry the
// given accessible-name fragment. Rows are keyed by "<name> (<team or
// club-wide>)", which is what makes one person's two rows addressable.
function roleSelect(label) {
  return screen.getByLabelText(`Role for ${label}`)
}

// Access-builder helpers. Several builders can be on screen at once (one per
// waiting person, one per person whose "Add access" is open), so everything is
// scoped to the builder whose role select carries this person's label.
function builderFor(label) {
  return screen.getByLabelText(`Role for ${label}`).closest('[data-testid="access-builder"]')
}

function chooseRole(user, label, role) {
  return user.selectOptions(screen.getByLabelText(`Role for ${label}`), role)
}

function tickAgeGroup(user, label, teamName) {
  return user.click(
    within(within(builderFor(label)).getByTestId('age-group-picker')).getByRole('checkbox', {
      name: teamName,
    }),
  )
}

// The player rows are labelled "<name> <age group>" — the age group is shown
// because it is what the access row's team_id is derived from.
function pickPlayer(user, label, playerName, type = 'checkbox') {
  const picker = within(builderFor(label)).getByTestId('player-picker')
  return user.click(within(picker).getByRole(type, { name: new RegExp(playerName) }))
}

function submitAccess(user, submitLabel, label) {
  return user.click(within(builderFor(label)).getByRole('button', { name: `${submitLabel} for ${label}` }))
}

describe('Accounts — authorisation gate', () => {
  it('renders the screen for an admin', async () => {
    setup()

    expect(await screen.findByRole('heading', { name: /accounts/i })).toBeInTheDocument()
  })

  // ⚠️ CHANGED 9 Aug 2026 (Jay: coaches and managers approve for their own age
  // groups). A coach used to be refused this screen outright. They now get the
  // approvals view — and NOTHING else on it.
  it('gives a coach the approvals view, not the accounts screen', async () => {
    useMembershipsMock.mockReturnValue(memberships(COACH))

    setup()

    expect(await screen.findByRole('heading', { name: /approvals/i })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).toBeNull()
    // The queue needs the pending rows, so the members read DOES happen now.
    expect(listClubMembersMock).toHaveBeenCalled()
  })

  // ⚠️ THE LIST THIS ASSERTS IS THE POINT OF THE WHOLE SEPARATE RETURN. Every
  // one of these is a club-administration control, and `memb manage` is still
  // admin-only in the database — so a leak here shows a coach a button that
  // fails rather than one that works, but it is still a lie about what they
  // may do.
  it('shows a coach none of the club-administration controls', async () => {
    useMembershipsMock.mockReturnValue(memberships(COACH))

    setup()
    await screen.findByRole('heading', { name: /approvals/i })

    expect(screen.queryByTestId('account-person')).toBeNull()
    expect(screen.queryByTestId('waiting-for-access')).toBeNull()
    expect(screen.queryByTestId('dismissed-requests')).toBeNull()
    expect(screen.queryByRole('button', { name: /revoke/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /add access/i })).toBeNull()
    expect(screen.queryByRole('combobox')).toBeNull()
    // ⚠️ AND NOT THE COUNTS. "n with access · n logins" is computed from rows
    // a coach cannot read, so it would render zeros and read as "this club has
    // no members" — a falsehood stated as a fact.
    expect(screen.queryByText(/with access/i)).toBeNull()
    expect(screen.queryByText(/logins?$/i)).toBeNull()
  })

  it('issues only the members read for a coach, not the two admin-only reads', async () => {
    useMembershipsMock.mockReturnValue(memberships(COACH))

    setup()
    await screen.findByRole('heading', { name: /approvals/i })

    // Both are gated on is_admin_anywhere in the database and would come back
    // empty — three round trips to learn nothing, on a screen with one section.
    expect(listPendingProfilesMock).not.toHaveBeenCalled()
    expect(listAccessRequestsMock).not.toHaveBeenCalled()
  })

  it('renders a not-authorised message for a parent, and issues no query', async () => {
    useMembershipsMock.mockReturnValue(memberships(PARENT))

    setup()

    expect(screen.getByRole('alert')).toHaveTextContent(/not authorised/i)
    expect(listClubMembersMock).not.toHaveBeenCalled()
  })

  // The view-as preview (spec §1) swaps the EFFECTIVE membership set for a
  // synthetic coach/parent row while realMemberships still says admin.
  // Accounts gates on the effective set on purpose, so previewing hides it.
  it('shows a previewing admin the COACH view, not the admin one', async () => {
    useMembershipsMock.mockReturnValue({
      ...memberships(ADMIN),
      // `status: 'active'` because the preview stands in for a REAL coach —
      // a synthetic row without one would be a shape the database cannot hold.
      memberships: [
        { id: 'view-as', role: 'coach', team_id: 'team-u10', player_id: null, status: 'active' },
      ],
      viewAs: { role: 'coach', teamId: 'team-u10' },
    })

    setup()

    // Gating on the EFFECTIVE set is what makes the preview honest: an admin
    // checking what a coach sees gets what a coach sees. Before 9 Aug that was
    // a not-authorised card, because that WAS what a coach saw.
    expect(await screen.findByRole('heading', { name: /approvals/i })).toBeInTheDocument()
    expect(screen.queryByTestId('account-person')).toBeNull()
  })
})

describe('Accounts — list', () => {
  it('renders each person with their name, email, role and age group', async () => {
    const { user } = setup()

    expect(await screen.findByText('Sara Coach')).toBeInTheDocument()
    expect(screen.getByText('sara@example.com')).toBeInTheDocument()
    expect(screen.getByText('Ali Parent')).toBeInTheDocument()
    expect(screen.getByText('ali@example.com')).toBeInTheDocument()

    await openPerson(user, 'Ali Parent')

    // Age group is an editable select holding the member's current team.
    expect(roleSelect('Ali Parent (U12 Boys)')).toHaveValue('parent')
    expect(screen.getByLabelText('Age group for Ali Parent (U12 Boys)')).toHaveValue('team-u12')
  })

  // Task 5: the "Linked player" column the spec's column list asks for
  // (Name · Email · Role · Age group · Linked player · Joined). It is fed by
  // listClubMembers' players(full_name) embed.
  // Ali's row and Jay's row belong to two different people, so they can no
  // longer be read in one pass: this opens Ali, asserts, closes, opens Jay.
  it('shows the linked player’s name, and a placeholder when there is none', async () => {
    const { user } = setup()

    await screen.findByText('Sara Coach')

    const aliDialog = await openPerson(user, 'Ali Parent')
    const aliRow = within(aliDialog)
      .getAllByTestId('account-membership')
      .find((row) => within(row).queryByLabelText('Role for Ali Parent (U12 Boys)'))
    expect(within(aliRow).getByTestId('account-linked-player')).toHaveTextContent('Omar Ali')
    await closePerson(user)

    // An admin row has no player to link to — that is normal, so it reads as
    // an em dash rather than anything that looks like missing data.
    const jayDialog = await openPerson(user, 'Jay Muir')
    const jayRow = within(jayDialog)
      .getAllByTestId('account-membership')
      .find((row) => within(row).queryByLabelText('Role for Jay Muir (club-wide)'))
    expect(within(jayRow).getByTestId('account-linked-player')).toHaveTextContent('—')
    expect(within(jayRow).getByText('No linked player')).toBeInTheDocument()
  })

  it('falls back to "Unknown player" when a linked row has no embedded name', async () => {
    // player_id set but the embed empty: not reachable for an admin under the
    // current policies, but a partial join or a deleted player would produce
    // it, and showing the raw uuid instead would mean nothing to anyone.
    listClubMembersMock.mockResolvedValue([{ ...ALI_PARENT, players: null }])
    const { user } = setup()

    await screen.findByText('Ali Parent')
    const dialog = await openPerson(user, 'Ali Parent')
    expect(within(dialog).getByTestId('account-linked-player')).toHaveTextContent('Unknown player')
  })

  // The four rows span three people and one sheet opens at a time, so the
  // total is summed sheet by sheet. Sara's card also no longer carries a
  // "2 access rows" label — her sheet holding exactly two rows says the same.
  it('groups a person with several membership rows into one block', async () => {
    const { user } = setup()

    await screen.findByText('Sara Coach')

    // Three people, four membership rows.
    expect(screen.getAllByTestId('account-person')).toHaveLength(3)
    expect(await countMembershipRows(user, ['Jay Muir', 'Sara Coach', 'Ali Parent'])).toBe(4)
    // Sara's name appears once, not once per row.
    expect(screen.getAllByText('Sara Coach')).toHaveLength(1)

    const saraDialog = await openPerson(user, 'Sara Coach')
    expect(within(saraDialog).getAllByTestId('account-membership')).toHaveLength(2)
  })

  it('shows the email as plain text, with a note that passwords are self-serve', async () => {
    setup()

    await screen.findByText('Sara Coach')

    expect(screen.queryByLabelText(/email/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /reset password/i })).not.toBeInTheDocument()
    expect(screen.getByText(/passwords are self-serve/i)).toBeInTheDocument()
  })

  it('shows a loading state, then an error with a retry', async () => {
    listClubMembersMock.mockReturnValue(new Promise(() => {}))
    const { unmount } = setup()
    expect(screen.getByRole('status')).toHaveAccessibleName(/loading/i)
    unmount()

    listClubMembersMock.mockRejectedValue(new Error('Network unreachable'))
    const { user } = setup()

    const alert = await screen.findByRole('alert')
    expect(within(alert).getByText(/network unreachable/i)).toBeInTheDocument()

    listClubMembersMock.mockResolvedValue(MEMBER_ROWS)
    await user.click(within(alert).getByRole('button', { name: /try again/i }))

    expect(await screen.findByText('Sara Coach')).toBeInTheDocument()
  })
})

describe('Accounts — changing access', () => {
  it('changes a role with the membership id, new role and current team', async () => {
    const { user } = setup()

    await screen.findByText('Sara Coach')
    await openPerson(user, 'Ali Parent')
    await user.selectOptions(roleSelect('Ali Parent (U12 Boys)'), 'coach')

    expect(updateMembershipRoleMock).toHaveBeenCalledWith({
      membershipId: 'mem-ali',
      role: 'coach',
      teamId: 'team-u12',
    })
  })

  it('reassigns an age group without changing the role', async () => {
    const { user } = setup()

    await screen.findByText('Sara Coach')
    await openPerson(user, 'Ali Parent')
    await user.selectOptions(screen.getByLabelText('Age group for Ali Parent (U12 Boys)'), 'team-u10')

    expect(updateMembershipRoleMock).toHaveBeenCalledWith({
      membershipId: 'mem-ali',
      role: 'parent',
      teamId: 'team-u10',
    })
  })

  it('promoting to admin drops the age group and shows "All age groups"', async () => {
    const { user } = setup()

    await screen.findByText('Sara Coach')
    await openPerson(user, 'Ali Parent')
    await user.selectOptions(roleSelect('Ali Parent (U12 Boys)'), 'admin')

    expect(updateMembershipRoleMock).toHaveBeenCalledWith({
      membershipId: 'mem-ali',
      role: 'admin',
      teamId: 'team-u12',
    })
    // The data layer coerces team_id to null for an admin row and returns it;
    // the screen must render that, not the stale U12 selection.
    const aliRow = await screen.findByLabelText('Role for Ali Parent (club-wide)')
    expect(aliRow).toHaveValue('admin')
    expect(screen.queryByLabelText('Age group for Ali Parent (club-wide)')).not.toBeInTheDocument()
  })

  it('reports a refused write inline on the row', async () => {
    updateMembershipRoleMock.mockRejectedValue(new Error('Choose an age group for this role.'))

    const { user } = setup()

    await screen.findByText('Sara Coach')
    await openPerson(user, 'Ali Parent')
    await user.selectOptions(roleSelect('Ali Parent (U12 Boys)'), 'coach')

    expect(await screen.findByRole('alert')).toHaveTextContent(/choose an age group/i)
  })

  // ⚠️ REWRITTEN, not just re-pointed. The inline "Edit name" control and its
  // single "Display name" field no longer exist anywhere: the sheet edits
  // first/family name and writes updateMemberProfile, not updateProfileName.
  it('edits a display name once for a person with several rows', async () => {
    const { user } = setup()

    await screen.findByText('Sara Coach')
    const dialog = await openPerson(user, 'Sara Coach')
    const firstName = within(dialog).getByLabelText('First name')
    const lastName = within(dialog).getByLabelText('Family name')
    await user.clear(firstName)
    await user.type(firstName, 'Sara')
    await user.clear(lastName)
    await user.type(lastName, 'Hughes')
    await user.click(within(dialog).getByRole('button', { name: /save details/i }))

    expect(updateMemberProfileMock).toHaveBeenCalledWith({
      profileId: 'profile-sara',
      firstName: 'Sara',
      lastName: 'Hughes',
      phone: null,
    })
    expect(await screen.findByText('Sara Hughes')).toBeInTheDocument()
    // Still one person, still two rows — the rename didn't split the block.
    expect(screen.getAllByTestId('account-person')).toHaveLength(3)
    expect(within(dialog).getAllByTestId('account-membership')).toHaveLength(2)
  })
})

describe('Accounts — revoking access', () => {
  it('asks for confirmation before deleting, and does nothing if cancelled', async () => {
    const { user } = setup()

    await screen.findByText('Sara Coach')
    await openPerson(user, 'Ali Parent')
    await user.click(screen.getByLabelText('Revoke access for Ali Parent (U12 Boys)'))

    expect(screen.getByText(/remove this access\?/i)).toBeInTheDocument()
    expect(deleteMembershipMock).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: /cancel/i }))
    expect(deleteMembershipMock).not.toHaveBeenCalled()
    expect(screen.queryByText(/remove this access\?/i)).not.toBeInTheDocument()
  })

  it('deletes the membership once confirmed and removes it from the list', async () => {
    const { user } = setup()

    await screen.findByText('Sara Coach')
    await openPerson(user, 'Ali Parent')
    await user.click(screen.getByLabelText('Revoke access for Ali Parent (U12 Boys)'))
    await user.click(screen.getByRole('button', { name: /yes, revoke ali parent/i }))

    expect(deleteMembershipMock).toHaveBeenCalledWith('mem-ali')
    // ⚠️ This asserted /2 people/i until 8 Aug 2026. The header now reads
    // "2 with access", because "people" was being read as "accounts" and it is
    // not — it counts people WITH ACCESS. Revoking Ali does not delete his
    // login; he drops out of this count and into "Waiting for access", and the
    // logins total below stays put. That distinction cost an hour of debugging
    // a confirmation email that was never going to be sent.
    expect(await screen.findByText(/2 with access/i)).toBeInTheDocument()
    expect(screen.getAllByTestId('account-person')).toHaveLength(2)

    // He was holding his ONLY membership, so revoking it leaves him with a
    // login and no access — which is exactly what "Waiting for access" means.
    // He therefore moves into that section rather than vanishing (a reload
    // would show the same thing). Not a bug: the alternative is an account
    // that exists and is listed nowhere, which is the problem Task B fixed.
    expect(
      within(screen.getByTestId('waiting-for-access')).getByText('Ali Parent'),
    ).toBeInTheDocument()
  })

  // ── The logins count, added 8 Aug 2026 ──────────────────────────────────
  //
  // WHY THIS EXISTS: on 8 Aug this screen showed "2 people" while five logins
  // existed — three of them revoked or dismissed. Jay read that as "there are
  // two accounts", signed up again with an address that already had a login,
  // and got no confirmation email, because GoTrue answers a repeat signup with
  // 200 and sends nothing. Nothing was broken; the count was just answering a
  // different question from the one being asked of it.
  //
  // The header now carries BOTH numbers so the gap between them is visible.
  it('counts logins separately from people with access, including dismissed ones', async () => {
    setup()

    await screen.findByText('Sara Coach')

    // The fixture has people with access plus unattached profiles (waiting and
    // dismissed). The logins total must include every one of them — a login
    // that has been revoked or dismissed still exists and can still sign in.
    const withAccess = screen.getAllByTestId('account-person').length
    expect(await screen.findByText(new RegExp(`${withAccess} with access`, 'i'))).toBeInTheDocument()

    const header = screen.getByText(/with access/i).textContent
    const loginsMatch = header.match(/(\d+)\s+logins?/i)
    expect(loginsMatch, `expected a logins count in "${header}"`).not.toBeNull()

    // The whole point: logins is GREATER than people-with-access whenever
    // anyone is waiting or dismissed. If these two ever match in this fixture
    // the count has stopped measuring what it claims to.
    expect(Number(loginsMatch[1])).toBeGreaterThan(withAccess)
  })

  // The "3 rows left" total is club-wide, so it is re-counted a sheet at a
  // time once Sara's own sheet has shown her surviving row.
  it('removes only the confirmed row of a person who holds several', async () => {
    const { user } = setup()

    await screen.findByText('Sara Coach')
    const dialog = await openPerson(user, 'Sara Coach')
    await user.click(within(dialog).getByLabelText('Revoke access for Sara Coach (U10)'))
    await user.click(within(dialog).getByRole('button', { name: /yes, revoke sara coach/i }))

    expect(deleteMembershipMock).toHaveBeenCalledWith('mem-sara-coach')
    expect(await screen.findByText('Sara Coach')).toBeInTheDocument()
    await waitFor(() =>
      expect(within(dialog).getAllByTestId('account-membership')).toHaveLength(1),
    )
    await closePerson(user)
    expect(await countMembershipRows(user, ['Jay Muir', 'Sara Coach', 'Ali Parent'])).toBe(3)
  })
})

describe('Accounts — last-admin guard', () => {
  it('refuses to revoke the signed-in admin’s only admin row, without calling the data layer', async () => {
    const { user } = setup()

    await screen.findByText('Sara Coach')
    await openPerson(user, 'Jay Muir')
    await user.click(screen.getByLabelText('Revoke access for Jay Muir (club-wide)'))
    await user.click(screen.getByRole('button', { name: /yes, revoke jay muir/i }))

    expect(deleteMembershipMock).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent(/locked out/i)
    expect(screen.getByText('Jay Muir')).toBeInTheDocument()
  })

  it('refuses to demote the signed-in admin’s only admin row', async () => {
    const { user } = setup()

    await screen.findByText('Sara Coach')
    await openPerson(user, 'Jay Muir')
    await user.selectOptions(roleSelect('Jay Muir (club-wide)'), 'coach')

    expect(updateMembershipRoleMock).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent(/locked out/i)
    expect(roleSelect('Jay Muir (club-wide)')).toHaveValue('admin')
  })

  it('allows demoting one of the signed-in admin’s two admin rows', async () => {
    listClubMembersMock.mockResolvedValue([
      ...MEMBER_ROWS,
      { ...JAY_ADMIN, id: 'mem-jay-dup', created_at: '2026-01-06T09:00:00Z' },
    ])

    const { user } = setup()

    await screen.findByText('Sara Coach')
    await openPerson(user, 'Jay Muir')
    const jayRows = screen.getAllByLabelText('Role for Jay Muir (club-wide)')
    expect(jayRows).toHaveLength(2)

    await user.selectOptions(jayRows[1], 'coach')

    expect(updateMembershipRoleMock).toHaveBeenCalledWith({
      membershipId: 'mem-jay-dup',
      role: 'coach',
      teamId: null,
    })
  })

  it('does not block removing someone else’s admin row', async () => {
    listClubMembersMock.mockResolvedValue([
      JAY_ADMIN,
      { ...ALI_PARENT, role: 'admin', status: 'active', team_id: null, teams: null },
    ])

    const { user } = setup()

    await screen.findByText('Ali Parent')
    await openPerson(user, 'Ali Parent')
    await user.click(screen.getByLabelText('Revoke access for Ali Parent (club-wide)'))
    await user.click(screen.getByRole('button', { name: /yes, revoke ali parent/i }))

    expect(deleteMembershipMock).toHaveBeenCalledWith('mem-ali')
  })
})

// Task B (plan 2026-08-03 §Task B). Signing up creates a profile but no
// membership, so these people are invisible everywhere else on this screen.
describe('Accounts — waiting for access', () => {
  function waitingSection() {
    return screen.getByTestId('waiting-for-access')
  }

  // The single most important test in this file. listPendingProfiles returns
  // EVERY profile the admin can read — their own, every member of their club,
  // and the unattached signups — so the screen has to subtract the profile ids
  // already in the member list. Skip that and every existing member is shown
  // as if they had no access.
  it('lists only the profiles with no membership, never existing members', async () => {
    setup()

    await screen.findByText('Sara Coach')
    const section = waitingSection()

    expect(within(section).getAllByTestId('waiting-person')).toHaveLength(2)
    expect(within(section).getByText(/marisa@example\.com/)).toBeInTheDocument()
    expect(within(section).getByText('Raw Recruit')).toBeInTheDocument()

    // Members, and the signed-in admin, are all in the readable profile list
    // and must NOT be here.
    expect(within(section).queryByText('Sara Coach')).not.toBeInTheDocument()
    expect(within(section).queryByText(/sara@example\.com/)).not.toBeInTheDocument()
    expect(within(section).queryByText('Ali Parent')).not.toBeInTheDocument()
    expect(within(section).queryByText(/ali@example\.com/)).not.toBeInTheDocument()
    expect(within(section).queryByText('Jay Muir')).not.toBeInTheDocument()
    expect(within(section).queryByText(/jay@example\.com/)).not.toBeInTheDocument()
  })

  it('shows the signup date, a blank-name fallback, and explains what the list is', async () => {
    setup()

    await screen.findByText('Sara Coach')
    const section = waitingSection()

    expect(within(section).getByRole('heading', { name: /waiting for access/i })).toBeInTheDocument()
    expect(within(section).getByText(/see nothing at all in the app/i)).toBeInTheDocument()
    // Not "requests" — nobody asked for anything.
    expect(within(section).queryByText(/request/i)).not.toBeInTheDocument()

    // ⚠️ CHANGED 13 Aug 2026: the fallback is the EMAIL, not "No name yet".
    // This asserted the placeholder, which is what an admin was left holding
    // when somebody signed up and completed neither onboarding form — a label
    // that identifies nobody, sitting where the only identifying fact should
    // be. MARISA_PENDING has `full_name: ''` and an address, so her card is
    // headed by that address now.
    expect(within(section).queryByText('No name yet')).not.toBeInTheDocument()
    expect(within(section).getByText('marisa@example.com')).toBeInTheDocument()
    // ⚠️ ONCE, not twice — the address used to be repeated on the line below
    // the heading, and promoting it without suppressing that would print it
    // twice, a line apart.
    expect(within(section).getAllByText('marisa@example.com')).toHaveLength(1)
    expect(within(section).getByText(/signed up 3 Aug 2026/)).toBeInTheDocument()
  })

  it('offers a dismiss control per person, and says it is reversible', async () => {
    setup()

    await screen.findByText('Sara Coach')
    const section = waitingSection()

    // One per waiting person, not one for the section.
    expect(within(section).getAllByRole('button', { name: /^dismiss$/i })).toHaveLength(
      within(section).getAllByTestId('waiting-person').length,
    )
    expect(within(section).getByText(/does not delete their login/i)).toBeInTheDocument()
  })

  it('dismisses a person, passing the acting admin, and drops them off the list', async () => {
    const user = userEvent.setup()
    setup()

    await screen.findByText('Sara Coach')
    expect(within(waitingSection()).getAllByTestId('waiting-person')).toHaveLength(2)

    const marisa = within(waitingSection())
      .getAllByTestId('waiting-person')
      .find((card) => within(card).queryByText(/marisa@example\.com/))
    await user.click(within(marisa).getByRole('button', { name: /^dismiss$/i }))

    await waitFor(() =>
      expect(dismissAccessRequestMock).toHaveBeenCalledWith({
        profileId: 'profile-marisa',
        decidedBy: SELF_ID,
      }),
    )
    await waitFor(() =>
      expect(within(waitingSection()).getAllByTestId('waiting-person')).toHaveLength(1),
    )
    expect(screen.queryByText(/marisa@example\.com/)).not.toBeInTheDocument()
  })

  it('surfaces a failed dismiss inline and keeps the person on the list', async () => {
    const user = userEvent.setup()
    dismissAccessRequestMock.mockRejectedValue(new Error('Network is down'))
    setup()

    await screen.findByText('Sara Coach')
    const before = within(waitingSection()).getAllByTestId('waiting-person').length

    await user.click(within(waitingSection()).getAllByRole('button', { name: /^dismiss$/i })[0])

    expect(await screen.findByText('Network is down')).toBeInTheDocument()
    expect(within(waitingSection()).getAllByTestId('waiting-person')).toHaveLength(before)
  })

  it('shows what someone said about themselves, badges them, and lists them first', async () => {
    // The raw signup asked; Marisa did not. listPendingProfiles hands them
    // over newest-first, which puts Marisa (3 Aug) ahead of Raw (2 Aug), so
    // Raw rendering first can only be because asking outranks merely having
    // signed in.
    listAccessRequestsMock.mockResolvedValue([
      {
        id: 'req-raw',
        profile_id: 'profile-raw',
        note: 'Parent of Sam Muir, U10',
        status: 'pending',
        created_at: '2026-08-04T09:00:00Z',
      },
    ])

    setup()

    await screen.findByText('Sara Coach')
    const cards = within(waitingSection()).getAllByTestId('waiting-person')

    expect(within(cards[0]).getByText('Raw Recruit')).toBeInTheDocument()
    expect(within(cards[0]).getByTestId('asked-badge')).toBeInTheDocument()
    expect(within(cards[0]).getByTestId('request-note')).toHaveTextContent(
      'Parent of Sam Muir, U10',
    )
    // The people who never asked carry neither.
    expect(within(cards[1]).queryByTestId('asked-badge')).toBeNull()
    expect(within(cards[1]).queryByTestId('request-note')).toBeNull()
  })

  it('hides dismissed people from the waiting list and can restore them', async () => {
    const user = userEvent.setup()
    listAccessRequestsMock.mockResolvedValue([
      {
        id: 'req-marisa',
        profile_id: 'profile-marisa',
        note: null,
        status: 'dismissed',
        created_at: '2026-08-04T09:00:00Z',
      },
    ])

    setup()

    await screen.findByText('Sara Coach')
    expect(screen.queryByText(/marisa@example\.com/)).not.toBeInTheDocument()

    // Collapsed by default — dismissing is meant to clear the list.
    await user.click(screen.getByRole('button', { name: /show dismissed \(1\)/i }))
    const dismissedSection = screen.getByTestId('dismissed-requests')
    expect(within(dismissedSection).getByText(/marisa@example\.com/)).toBeInTheDocument()

    await user.click(within(dismissedSection).getByRole('button', { name: /^restore$/i }))

    await waitFor(() =>
      expect(restoreAccessRequestMock).toHaveBeenCalledWith({ profileId: 'profile-marisa' }),
    )
    // Back in the waiting list, and the dismissed section is gone with it.
    await waitFor(() => expect(screen.getByText(/marisa@example\.com/)).toBeInTheDocument())
    expect(screen.queryByTestId('dismissed-requests')).toBeNull()
  })

  it('still shows everyone waiting when the requests read fails', async () => {
    // Fails OPEN on purpose: losing the notes is an inconvenience, hiding a
    // person who is genuinely waiting is not.
    listAccessRequestsMock.mockRejectedValue(new Error('nope'))

    setup()

    await screen.findByText('Sara Coach')
    expect(within(waitingSection()).getAllByTestId('waiting-person')).toHaveLength(2)
    expect(screen.queryByTestId('dismissed-requests')).toBeNull()
  })

  it('renders an empty state, not a bare heading, when nobody is waiting', async () => {
    // Only members and the admin readable — the normal steady state.
    listPendingProfilesMock.mockResolvedValue(PROFILE_ROWS.filter((row) => row.id.startsWith('profile-') && row.id !== 'profile-marisa' && row.id !== 'profile-raw'))

    setup()

    await screen.findByText('Sara Coach')
    const section = waitingSection()

    expect(within(section).queryAllByTestId('waiting-person')).toHaveLength(0)
    expect(within(section).getByText(/nobody is waiting for access/i)).toBeInTheDocument()
  })

  it('grants access with the club, role and age group, and moves the person into the list', async () => {
    const { user } = setup()

    await screen.findByText('Sara Coach')
    await chooseRole(user, 'raw@example.com', 'coach')
    await tickAgeGroup(user, 'raw@example.com', 'U10')
    await submitAccess(user, 'Give access', 'raw@example.com')

    expect(grantMembershipsMock).toHaveBeenCalledWith([
      { profileId: 'profile-raw', clubId: CLUB_ID, role: 'coach', teamId: 'team-u10', playerId: null },
    ])

    // Moved, not duplicated: gone from the waiting list, present in the main
    // one, with no reload. The granted row's controls are in his sheet now, so
    // the list assertions run first and the row is checked after opening him.
    expect(await screen.findByText('Raw Recruit')).toBeInTheDocument()
    expect(within(waitingSection()).getAllByTestId('waiting-person')).toHaveLength(1)
    expect(screen.getAllByTestId('account-person')).toHaveLength(4)
    expect(listClubMembersMock).toHaveBeenCalledTimes(1)
    const dialog = await openPerson(user, 'Raw Recruit')
    expect(within(dialog).getByLabelText('Role for Raw Recruit (U10)')).toHaveValue('coach')
  })

  it('grants an admin with no age group control at all', async () => {
    const { user } = setup()

    await screen.findByText('Sara Coach')
    await chooseRole(user, 'raw@example.com', 'admin')

    expect(within(builderFor('raw@example.com')).queryByTestId('age-group-picker')).toBeNull()
    expect(within(builderFor('raw@example.com')).queryByTestId('player-picker')).toBeNull()
    await submitAccess(user, 'Give access', 'raw@example.com')

    expect(grantMembershipsMock).toHaveBeenCalledWith([
      { profileId: 'profile-raw', clubId: CLUB_ID, role: 'admin', teamId: null, playerId: null },
    ])
    expect(await screen.findByText('Raw Recruit')).toBeInTheDocument()
    const dialog = await openPerson(user, 'Raw Recruit')
    expect(within(dialog).getByLabelText('Role for Raw Recruit (club-wide)')).toHaveValue('admin')
  })

  it('refuses to grant without a role, before any network call', async () => {
    const { user } = setup()

    await screen.findByText('Sara Coach')
    await submitAccess(user, 'Give access', 'raw@example.com')

    expect(grantMembershipsMock).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent(/choose a role/i)
  })

  it('refuses a coach grant with no age group, before any network call', async () => {
    const { user } = setup()

    await screen.findByText('Sara Coach')
    await chooseRole(user, 'raw@example.com', 'coach')
    await submitAccess(user, 'Give access', 'raw@example.com')

    expect(grantMembershipsMock).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent(/at least one age group/i)
  })

  it('reports a refused grant inline and keeps the person on the list', async () => {
    grantMembershipsMock.mockRejectedValue(
      new Error("We couldn't give that person access. You may not have permission to manage members."),
    )

    const { user } = setup()

    await screen.findByText('Sara Coach')
    await chooseRole(user, 'raw@example.com', 'coach')
    await tickAgeGroup(user, 'raw@example.com', 'U10')
    await submitAccess(user, 'Give access', 'raw@example.com')

    expect(await screen.findByRole('alert')).toHaveTextContent(/may not have permission/i)
    expect(within(waitingSection()).getAllByTestId('waiting-person')).toHaveLength(2)
  })

  // Without the member list there is nothing to subtract against, so showing
  // the section would show every member as waiting.
  it('hides the section entirely when the member list failed to load', async () => {
    listClubMembersMock.mockRejectedValue(new Error('Network unreachable'))

    setup()

    await screen.findByText(/network unreachable/i)
    expect(screen.queryByTestId('waiting-for-access')).not.toBeInTheDocument()
  })

  // The reverse failure is survivable: the accounts an admin came to manage
  // still render, and the section honestly shows nobody.
  it('still renders the accounts when the profile read failed', async () => {
    listPendingProfilesMock.mockRejectedValue(new Error('permission denied'))

    setup()

    expect(await screen.findByText('Sara Coach')).toBeInTheDocument()
    expect(within(waitingSection()).getByText(/nobody is waiting for access/i)).toBeInTheDocument()
  })

  it('issues no profile query for a non-admin', async () => {
    useMembershipsMock.mockReturnValue(memberships(COACH))

    setup()

    expect(listPendingProfilesMock).not.toHaveBeenCalled()
    expect(screen.queryByTestId('waiting-for-access')).not.toBeInTheDocument()
  })
})

// The multi-access builder (design spec 2026-08-03, "Grant UI"). One access
// row = one memberships row = (role, team_id, player_id); a person's access is
// the SET of their rows. Everything below is about producing that set
// correctly — and about never producing a row they already hold, since the
// database has no unique constraint to stop it.
describe('Accounts — access builder', () => {
  it('parent + two children creates two rows, each with that child’s own age group', async () => {
    const { user } = setup()

    await screen.findByText('Sara Coach')
    await chooseRole(user, 'raw@example.com', 'parent')
    await screen.findByRole('checkbox', { name: /Zara Ali/ })
    await pickPlayer(user, 'raw@example.com', 'Zara Ali')
    await pickPlayer(user, 'raw@example.com', 'Omar Ali')
    await submitAccess(user, 'Give access', 'raw@example.com')

    // Two rows, each carrying its own child and that child's team — Zara is
    // U10, Omar is U12. One row per child is what makes a two-child parent see
    // both children (scope.js's childPlayerIds).
    expect(grantMembershipsMock).toHaveBeenCalledWith([
      {
        profileId: 'profile-raw',
        clubId: CLUB_ID,
        role: 'parent',
        teamId: 'team-u10',
        playerId: 'player-zara',
      },
      {
        profileId: 'profile-raw',
        clubId: CLUB_ID,
        role: 'parent',
        teamId: 'team-u12',
        playerId: 'player-omar',
      },
    ])

    // Both rows land in the list, with the linked-player column populated from
    // the roster already in hand rather than a re-query. The card's old
    // "2 access rows" label is gone — his sheet holding two rows says it.
    expect(await screen.findByText('Raw Recruit')).toBeInTheDocument()
    expect(listClubMembersMock).toHaveBeenCalledTimes(1)
    const rawSheet = await openPerson(user, 'Raw Recruit')
    expect(within(rawSheet).getByLabelText('Role for Raw Recruit (U10)')).toHaveValue('parent')
    expect(within(rawSheet).getByLabelText('Role for Raw Recruit (U12 Boys)')).toHaveValue('parent')
    expect(within(rawSheet).getAllByTestId('account-membership')).toHaveLength(2)
    expect(within(rawSheet).getByText('Zara Ali')).toBeInTheDocument()
    expect(within(rawSheet).getByText('Omar Ali')).toBeInTheDocument()
  })

  // The age group is DERIVED from the child. Asking for it as well would let
  // an admin produce a parent row pointing at an U10 child while carrying an
  // U14 team_id — a contradiction scope.js would resolve in favour of U14.
  it('never asks for an age group in child mode', async () => {
    const { user } = setup()

    await screen.findByText('Sara Coach')
    await chooseRole(user, 'raw@example.com', 'parent')

    const builder = builderFor('raw@example.com')
    expect(within(builder).getByTestId('player-picker')).toBeInTheDocument()
    expect(within(builder).queryByTestId('age-group-picker')).toBeNull()
    expect(screen.queryByLabelText('Age group for raw@example.com')).toBeNull()
  })

  it('loads the whole roster once, unscoped, and only when a picker needs it', async () => {
    const { user } = setup()

    await screen.findByText('Sara Coach')
    // A coach grant never opens a player picker, so nothing is fetched.
    await chooseRole(user, 'raw@example.com', 'coach')
    expect(listPlayersMock).not.toHaveBeenCalled()

    await chooseRole(user, 'raw@example.com', 'parent')
    await screen.findByRole('checkbox', { name: /Zara Ali/ })
    // No teamIds argument: an admin linking a child needs the whole club, and
    // RLS is what narrows it for anyone else.
    expect(listPlayersMock).toHaveBeenCalledWith()

    // A second builder reuses the same list rather than fetching again.
    await chooseRole(user, 'marisa@example.com', 'parent')
    expect(listPlayersMock).toHaveBeenCalledTimes(1)
  })

  it('searches the roster by name rather than listing every player', async () => {
    const { user } = setup()

    await screen.findByText('Sara Coach')
    await chooseRole(user, 'raw@example.com', 'parent')
    const picker = within(builderFor('raw@example.com')).getByTestId('player-picker')
    await within(picker).findByRole('checkbox', { name: /Zara Ali/ })

    await user.type(within(picker).getByLabelText(/search players/i), 'noor')

    expect(within(picker).getByRole('checkbox', { name: /Noor Khan/ })).toBeInTheDocument()
    expect(within(picker).queryByRole('checkbox', { name: /Zara Ali/ })).toBeNull()
  })

  // Jay asked for this explicitly: without it, a parent whose children have
  // not been imported yet cannot be granted anything at all.
  // ⚠️ THIS TEST PINNED A PATH THAT COULD NEVER WORK — rewritten 20 Aug 2026.
  // It asserted age-group rows with playerId: null for a parent, and the
  // database refuses exactly that: memberships_family_role_needs_player, CHECK
  // (role not in ('parent','player') OR player_id IS NOT NULL). It stayed green
  // because grantMemberships is mocked here, so the guard in src/data/members.js
  // never ran — which is precisely how the broken control reached production and
  // answered an admin with a message from a layer they cannot see.
  it('adds the child and links the parent to the id the database returned', async () => {
    upsertPlayerMock.mockResolvedValue({ id: 'player-new', team_id: 'team-u12' })
    const { user } = setup()

    await screen.findByText('Sara Coach')
    await chooseRole(user, 'raw@example.com', 'parent')
    await user.click(
      within(builderFor('raw@example.com')).getByRole('checkbox', { name: /on the roster yet/i }),
    )

    const builder = builderFor('raw@example.com')
    // The child picker gives way to the add-a-child form, exactly as it does
    // for a player who is not on the roster.
    expect(within(builder).queryByTestId('player-picker')).toBeNull()
    await user.type(within(builder).getByLabelText(/name of the new child/i), 'Rowan Adeyemi')
    await user.selectOptions(
      within(builder).getByLabelText(/age group for the new child/i),
      TEAM_U12.id,
    )
    await submitAccess(user, 'Give access', 'raw@example.com')

    expect(upsertPlayerMock).toHaveBeenCalledWith({
      full_name: 'Rowan Adeyemi',
      team_id: TEAM_U12.id,
      club_id: CLUB_ID,
    })
    expect(grantMembershipsMock).toHaveBeenCalledWith([
      {
        profileId: 'profile-raw',
        clubId: CLUB_ID,
        role: 'parent',
        teamId: TEAM_U12.id,
        playerId: 'player-new',
      },
    ])
  })

  it('coach + two age groups creates two rows with no linked player', async () => {
    const { user } = setup()

    await screen.findByText('Sara Coach')
    await chooseRole(user, 'raw@example.com', 'coach')
    await tickAgeGroup(user, 'raw@example.com', 'U10')
    await tickAgeGroup(user, 'raw@example.com', 'U12 Boys')
    await submitAccess(user, 'Give access', 'raw@example.com')

    expect(grantMembershipsMock).toHaveBeenCalledWith([
      { profileId: 'profile-raw', clubId: CLUB_ID, role: 'coach', teamId: 'team-u10', playerId: null },
      { profileId: 'profile-raw', clubId: CLUB_ID, role: 'coach', teamId: 'team-u12', playerId: null },
    ])
    expect(await screen.findByText('Raw Recruit')).toBeInTheDocument()
    const dialog = await openPerson(user, 'Raw Recruit')
    expect(within(dialog).getByLabelText('Role for Raw Recruit (U10)')).toHaveValue('coach')
    expect(within(dialog).getByLabelText('Role for Raw Recruit (U12 Boys)')).toHaveValue('coach')
  })

  it('player is a single choice, with the age group taken from the player', async () => {
    const { user } = setup()

    await screen.findByText('Sara Coach')
    await chooseRole(user, 'raw@example.com', 'player')
    await screen.findByRole('radio', { name: /Omar Ali/ })
    await pickPlayer(user, 'raw@example.com', 'Zara Ali', 'radio')
    await pickPlayer(user, 'raw@example.com', 'Omar Ali', 'radio')
    await submitAccess(user, 'Give access', 'raw@example.com')

    // The second choice replaced the first — a person is one player.
    expect(grantMembershipsMock).toHaveBeenCalledWith([
      {
        profileId: 'profile-raw',
        clubId: CLUB_ID,
        role: 'player',
        teamId: 'team-u12',
        playerId: 'player-omar',
      },
    ])
  })

  it('refuses a parent grant with no child chosen, before any network call', async () => {
    const { user } = setup()

    await screen.findByText('Sara Coach')
    await chooseRole(user, 'raw@example.com', 'parent')
    await submitAccess(user, 'Give access', 'raw@example.com')

    expect(grantMembershipsMock).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent(/at least one child/i)
  })

  // "Add access" is inside Sara's sheet now. Her old "3 access rows" label is
  // gone (three rows in her sheet says it), and the club-wide 5-row total is
  // summed a sheet at a time.
  it('adds a second access row to an existing person without revoking the first', async () => {
    const { user } = setup()

    await screen.findByText('Sara Coach')
    // Sara already coaches U10. She also has a child in U10 — a mixed-role
    // person, which the database has always allowed and the UI never offered.
    const dialog = await openPerson(user, 'Sara Coach')
    await user.click(within(dialog).getByRole('button', { name: /add access for sara coach/i }))
    await chooseRole(user, 'Sara Coach', 'parent')
    await screen.findByRole('checkbox', { name: /Zara Ali/ })
    await pickPlayer(user, 'Sara Coach', 'Zara Ali')
    await submitAccess(user, 'Add access', 'Sara Coach')

    expect(grantMembershipsMock).toHaveBeenCalledWith([
      {
        profileId: 'profile-sara',
        clubId: CLUB_ID,
        role: 'parent',
        teamId: 'team-u10',
        playerId: 'player-zara',
      },
    ])

    // Her existing two rows are untouched; the new one joins them in the same
    // block, and the builder closes.
    await waitFor(() =>
      expect(within(dialog).getAllByTestId('account-membership')).toHaveLength(3),
    )
    expect(deleteMembershipMock).not.toHaveBeenCalled()
    expect(screen.queryByTestId('add-access')).toBeNull()
    await closePerson(user)
    expect(await countMembershipRows(user, ['Jay Muir', 'Sara Coach', 'Ali Parent'])).toBe(5)
  })

  it('refuses to add a row the person already holds', async () => {
    const { user } = setup()

    await screen.findByText('Sara Coach')
    const dialog = await openPerson(user, 'Sara Coach')
    await user.click(within(dialog).getByRole('button', { name: /add access for sara coach/i }))
    await chooseRole(user, 'Sara Coach', 'coach')
    // She is already coach of U10 — same role, same team, same (null) player.
    await tickAgeGroup(user, 'Sara Coach', 'U10')
    await submitAccess(user, 'Add access', 'Sara Coach')

    expect(grantMembershipsMock).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent(/already have that access/i)

    // The same age group is grantable to someone who does NOT hold it.
    await tickAgeGroup(user, 'Sara Coach', 'U12 Boys')
    await tickAgeGroup(user, 'Sara Coach', 'U10')
    await submitAccess(user, 'Add access', 'Sara Coach')

    expect(grantMembershipsMock).toHaveBeenCalledWith([
      { profileId: 'profile-sara', clubId: CLUB_ID, role: 'coach', teamId: 'team-u12', playerId: null },
    ])
  })

  // The duplicate that has actually happened in this database (RESTORE.md): a
  // second, identical admin row. Both rows are (admin, null, null), so nothing
  // but this guard distinguishes them.
  it('refuses a duplicate admin row', async () => {
    const { user } = setup()

    await screen.findByText('Sara Coach')
    const dialog = await openPerson(user, 'Jay Muir')
    await user.click(within(dialog).getByRole('button', { name: /add access for jay muir/i }))
    await chooseRole(user, 'Jay Muir', 'admin')
    await submitAccess(user, 'Add access', 'Jay Muir')

    expect(grantMembershipsMock).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent(/already have that access/i)
  })

  it('closes the add-access builder on cancel without writing anything', async () => {
    const { user } = setup()

    await screen.findByText('Sara Coach')
    const dialog = await openPerson(user, 'Ali Parent')
    await user.click(within(dialog).getByRole('button', { name: /add access for ali parent/i }))
    expect(within(dialog).getByTestId('add-access')).toBeInTheDocument()

    await user.click(within(screen.getByTestId('add-access')).getByRole('button', { name: /cancel/i }))

    expect(screen.queryByTestId('add-access')).toBeNull()
    expect(grantMembershipsMock).not.toHaveBeenCalled()
  })

  // Jay, 3 Aug 2026: some parents have three, four or five children at the
  // club, across different age groups. Five rows in one save, each carrying
  // its own child and that child's own team — driven through the REAL picker
  // search, because "select a child, change the search, select another" is the
  // only way an admin can actually do this and the only thing that can break.
  it('parent + FIVE children in five different age groups creates five correct rows', async () => {
    useMembershipsMock.mockReturnValue(memberships(ADMIN, BIG_TEAMS))
    listPlayersMock.mockResolvedValue(BIG_ROSTER)

    const { user } = setup()
    await screen.findByText('Sara Coach')
    await chooseRole(user, 'raw@example.com', 'parent')

    const picker = within(builderFor('raw@example.com')).getByTestId('player-picker')
    await within(picker).findByRole('checkbox', { name: /Yusuf Haddad/ })
    const search = within(picker).getByLabelText(/search players/i)

    // The cap is genuinely active: 45 on the roster, 25 drawn, and the two
    // children past index 25 are not reachable without typing.
    expect(within(picker).getAllByRole('checkbox')).toHaveLength(25)
    expect(within(picker).getByText(/Showing 25 of 45/)).toBeInTheDocument()
    expect(within(picker).queryByRole('checkbox', { name: /Noura Haddad/ })).toBeNull()
    expect(within(picker).queryByRole('checkbox', { name: /Zaid Haddad/ })).toBeNull()

    const chosen = []
    for (const [term, child] of [
      ['yusuf', 'Yusuf Haddad'],
      ['layla', 'Layla Haddad'],
      ['ibrahim', 'Ibrahim Haddad'],
      ['noura', 'Noura Haddad'],
      ['zaid', 'Zaid Haddad'],
    ]) {
      await user.clear(search)
      await user.type(search, term)

      // Each term narrows to exactly one row, so the previously chosen
      // children are NOT in the result list at this point.
      const results = within(picker).getAllByRole('checkbox')
      expect(results).toHaveLength(1)
      expect(results[0]).toHaveAccessibleName(new RegExp(child))

      await user.click(results[0])
      chosen.push(child)

      // Everything chosen so far is still pinned above the results, even
      // though the current query matches none of the earlier children.
      const pinned = within(picker).getByTestId('player-picker-selected')
      expect(within(pinned).getAllByRole('button').map((chip) => chip.textContent)).toEqual(
        chosen.map((name) => `${name}×`),
      )
    }

    // A query matching nobody at all leaves all five selections standing.
    await user.clear(search)
    await user.type(search, 'zzzzz')
    expect(within(picker).queryAllByRole('checkbox')).toHaveLength(0)
    expect(
      within(within(picker).getByTestId('player-picker-selected')).getAllByRole('button'),
    ).toHaveLength(5)

    await submitAccess(user, 'Give access', 'raw@example.com')

    // Exactly five rows, in selection order, each (team_id, player_id) pair
    // stated explicitly — a fifth child is not a rounding error.
    expect(grantMembershipsMock).toHaveBeenCalledTimes(1)
    expect(grantMembershipsMock).toHaveBeenCalledWith([
      { profileId: 'profile-raw', clubId: CLUB_ID, role: 'parent', teamId: 'team-u8', playerId: 'player-yusuf' },
      { profileId: 'profile-raw', clubId: CLUB_ID, role: 'parent', teamId: 'team-u10', playerId: 'player-layla' },
      { profileId: 'profile-raw', clubId: CLUB_ID, role: 'parent', teamId: 'team-u12', playerId: 'player-ibrahim' },
      { profileId: 'profile-raw', clubId: CLUB_ID, role: 'parent', teamId: 'team-u14', playerId: 'player-noura' },
      { profileId: 'profile-raw', clubId: CLUB_ID, role: 'parent', teamId: 'team-u16', playerId: 'player-zaid' },
    ])

    // And all five land in the list as one person with five access rows —
    // read in his sheet, since the card's "5 access rows" label is gone.
    await screen.findByText('Raw Recruit')
    const rawSheet = await openPerson(user, 'Raw Recruit')
    expect(within(rawSheet).getAllByTestId('account-membership')).toHaveLength(5)
    for (const child of HADDADS) {
      expect(within(rawSheet).getByText(child.full_name)).toBeInTheDocument()
    }
    for (const team of ['U8', 'U10', 'U12 Boys', 'U14', 'U16']) {
      expect(within(rawSheet).getByLabelText(`Role for Raw Recruit (${team})`)).toHaveValue('parent')
    }
  })

  it('reports a refused add-access inline and leaves the existing rows alone', async () => {
    grantMembershipsMock.mockRejectedValue(
      new Error("We couldn't give that person access. You may not have permission to manage members."),
    )

    const { user } = setup()

    await screen.findByText('Sara Coach')
    const dialog = await openPerson(user, 'Sara Coach')
    await user.click(within(dialog).getByRole('button', { name: /add access for sara coach/i }))
    await chooseRole(user, 'Sara Coach', 'coach')
    await tickAgeGroup(user, 'Sara Coach', 'U12 Boys')
    await submitAccess(user, 'Add access', 'Sara Coach')

    expect(await screen.findByRole('alert')).toHaveTextContent(/may not have permission/i)
    expect(within(dialog).getByTestId('add-access')).toBeInTheDocument()
    // The club-wide "still 4 rows" total has to be counted a sheet at a time,
    // so it is checked after the open builder has been asserted on.
    expect(within(dialog).getAllByTestId('account-membership')).toHaveLength(2)
    await closePerson(user)
    expect(await countMembershipRows(user, ['Jay Muir', 'Sara Coach', 'Ali Parent'])).toBe(4)
  })
})

// ── The Edit person sheet (Jay, 9 Aug 2026) ────────────────────────────
//
// "admins need the ability to click on account and change all details, except
// the email, i don't see any ability to do this in the accounts section" — and
// he was right. The screen wrote the LEGACY `full_name` column and had no
// phone control at all, though the column grants from 8 Aug have permitted
// first_name, last_name and phone since the day they landed. The permission
// existed; the fields did not.
describe('Accounts — the edit person sheet', () => {
  it('opens from the row itself, not only from the Edit button', async () => {
    const { user } = setup()
    await screen.findByText('Sara Coach')

    const card = screen
      .getAllByTestId('account-person')
      .find((block) => within(block).queryByText('Sara Coach'))
    await user.click(within(card).getByText('Sara Coach'))

    expect(await screen.findByRole('dialog')).toHaveTextContent(/Edit Sara Coach/i)
  })

  // ⚠️ THE CRASH THIS PINS. The access rows carry aria-labels built from the
  // person's name. While they lived on the list card that name came from a
  // `const displayName = …` inside the groups.map callback; moving them into
  // the sheet moved them OUT of that closure, and nothing declared it there.
  // React threw ReferenceError and unmounted the whole screen — clicking any
  // account blanked the page. It shipped in the first draft and was caught
  // here, not by reading the code back.
  it('renders the access rows without crashing the screen', async () => {
    const { user } = setup()
    await screen.findByText('Sara Coach')
    const dialog = await openPerson(user, 'Sara Coach')

    expect(within(dialog).getAllByTestId('account-membership')).toHaveLength(2)
    expect(within(dialog).getByLabelText('Role for Sara Coach (U10)')).toBeInTheDocument()
    // The screen is still there. A ReferenceError inside render takes the
    // whole tree with it, so this is the assertion that actually caught it.
    expect(screen.getAllByTestId('account-person')).toHaveLength(3)
  })

  // The whole point of the change: a control that did not exist anywhere.
  it('saves a phone number, which the screen previously could not set at all', async () => {
    const { user } = setup()
    await screen.findByText('Sara Coach')
    const dialog = await openPerson(user, 'Sara Coach')

    // ⚠️ EXACT LABEL. PhoneInput renders a "Phone country" select as well, so
    // /phone/i matches two controls and the typing lands nowhere useful.
    await user.type(within(dialog).getByLabelText('Phone'), '501234567')
    await user.click(within(dialog).getByRole('button', { name: /save details/i }))

    await waitFor(() =>
      expect(updateMemberProfileMock).toHaveBeenCalledWith(
        expect.objectContaining({ profileId: 'profile-sara', phone: '+971501234567' }),
      ),
    )
  })

  // ⚠️ NOT A UI PREFERENCE — A DATABASE FACT. `email` is the login identity and
  // the column grants for `authenticated` are an allow-list that excludes it,
  // so an update including it fails the WHOLE statement. A field for it would
  // break saving the name as well.
  it('shows the email and offers no way to edit it', async () => {
    const { user } = setup()
    await screen.findByText('Sara Coach')
    const dialog = await openPerson(user, 'Sara Coach')

    expect(within(dialog).getByTestId('sheet-email')).toHaveTextContent('sara@example.com')
    expect(within(dialog).queryByLabelText(/email/i)).toBeNull()
  })

  it('refuses a blank first name rather than writing one', async () => {
    const { user } = setup()
    await screen.findByText('Sara Coach')
    const dialog = await openPerson(user, 'Sara Coach')

    await user.clear(within(dialog).getByLabelText('First name'))
    await user.click(within(dialog).getByRole('button', { name: /save details/i }))

    // full_name is rebuilt from these two by the profiles_sync_name trigger, so
    // a blank first name renders as an account with no name anywhere in the app
    // — including in the approval queue, where "No name yet" is what a coach is
    // asked to judge a stranger by.
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(/first name/i)
    // Refused before the request, like every other form in this app.
    expect(updateMemberProfileMock).not.toHaveBeenCalled()
  })

  it('surfaces a refused save and leaves the sheet open on the typed values', async () => {
    const { user } = setup()
    updateMemberProfileMock.mockRejectedValue(new Error('Network is down'))
    await screen.findByText('Sara Coach')
    const dialog = await openPerson(user, 'Sara Coach')

    await user.clear(within(dialog).getByLabelText('First name'))
    await user.type(within(dialog).getByLabelText('First name'), 'Saeeda')
    await user.click(within(dialog).getByRole('button', { name: /save details/i }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Network is down')
    // Sending them back to retype it is how a network blip becomes lost work.
    expect(within(dialog).getByLabelText('First name')).toHaveValue('Saeeda')
  })

  // ⚠️ THE ONE THAT WOULD OTHERWISE ROT SILENTLY. updateMyProfile also writes
  // `name_confirmed_at`, which records THE PERSON STATING THEIR OWN NAME and is
  // what stops NamePrompt asking them again on next sign-in. An admin typing a
  // name into an admin screen is not that, so this must not write it.
  it('does not record an admin-typed name as the person confirming it', async () => {
    const { user } = setup()
    await screen.findByText('Sara Coach')
    const dialog = await openPerson(user, 'Sara Coach')

    await user.click(within(dialog).getByRole('button', { name: /save details/i }))

    await waitFor(() => expect(updateMemberProfileMock).toHaveBeenCalled())
    const payload = updateMemberProfileMock.mock.calls[0][0]
    expect(payload).not.toHaveProperty('name_confirmed_at')
  })

  it('keeps what an admin typed if they close the sheet and reopen it', async () => {
    const { user } = setup()
    await screen.findByText('Sara Coach')
    let dialog = await openPerson(user, 'Sara Coach')

    await user.clear(within(dialog).getByLabelText('First name'))
    await user.type(within(dialog).getByLabelText('First name'), 'Saeeda')
    await closePerson(user)

    dialog = await openPerson(user, 'Sara Coach')
    // Re-seeding on every open would silently discard a half-finished edit.
    expect(within(dialog).getByLabelText('First name')).toHaveValue('Saeeda')
  })
})

/* ══════════════════════════════════════════════════════════════════════════
   Viewing accounts by type — 16 Aug 2026
   ══════════════════════════════════════════════════════════════════════════

   Jay: "in the Accounts section, we need to be able to view accounts by type,
   Parent/Player, Coach, Manager, etc".

   ⚠️ THE FIXTURES ARE WHY THESE TESTS ARE WORTH HAVING. Sara holds a coach row
   AND a parent row — legitimate data, memberships has no unique constraint —
   so the four MEMBER_ROWS are only three PEOPLE. Everything below turns on that
   distinction, because a chip counting rows would promise a number the list it
   filters could never show.
   ══════════════════════════════════════════════════════════════════════════ */

describe('Accounts — viewing by type', () => {
  const showFilter = async () => {
    useMembershipsMock.mockReturnValue(memberships(ADMIN))
    setup()
    return screen.findByTestId('account-type-filter')
  }

  it('offers one chip per kind of account actually held, in a stable order', async () => {
    const row = await showFilter()
    const labels = [...row.querySelectorAll('button')].map((b) => b.textContent.trim())

    // ⚠️ COUNTS ARE PEOPLE. Four membership rows, three people: Jay (admin),
    // Sara (coach AND parent), Ali (parent). So Parent is 2 and not 3.
    expect(labels).toEqual(['Everyone 3', 'Admin 1', 'Coach 1', 'Parent 2'])

    // ⚠️ AND NO CHIP FOR A ROLE NOBODY HOLDS. Six chips on a club with three
    // kinds of account is three dead controls, and a control that never does
    // anything teaches people the row is decorative.
    expect(labels.join(' ')).not.toMatch(/medic|player|team manager/i)
  })

  // ⚠️ THE CASE THE DE-DUPLICATION EXISTS FOR, AND IT WAS MISSING. The fixtures
  // above have nobody holding two rows of the SAME role, so counting rows and
  // counting people give identical numbers and the test could not fail. Proved
  // by injecting exactly that fault, 16 Aug 2026: all 71 passed.
  //
  // A coach of two squads is ONE coach. `memberships` has no unique constraint,
  // and coaching two age groups is ordinary — twelve of the club's fifteen
  // squads shared staff in August 2026.
  it('⚠️ counts a two-squad coach once, not twice', async () => {
    listClubMembersMock.mockResolvedValue([
      JAY_ADMIN,
      SARA_COACH,
      { ...SARA_COACH, id: 'mem-sara-coach-2', team_id: 'team-u12', teams: { name: 'U12 Boys' } },
    ])
    useMembershipsMock.mockReturnValue(memberships(ADMIN))
    setup()

    const row = await screen.findByTestId('account-type-filter')
    const labels = [...row.querySelectorAll('button')].map((b) => b.textContent.trim())
    // Three membership rows, two people, and Sara is one coach.
    expect(labels).toEqual(['Everyone 2', 'Admin 1', 'Coach 1'])

    await userEvent.setup().click(
      [...row.querySelectorAll('button')].find((b) => b.textContent.startsWith('Coach')),
    )
    expect(screen.getAllByTestId('account-person')).toHaveLength(1)
  })

  it('narrows the list to that kind, and the chip count is what appears', async () => {
    const user = userEvent.setup()
    const row = await showFilter()
    expect(await screen.findAllByTestId('account-person')).toHaveLength(3)

    await user.click([...row.querySelectorAll('button')].find((b) => b.textContent.startsWith('Coach')))
    expect(screen.getAllByTestId('account-person')).toHaveLength(1)
    expect(screen.getByText('Sara Coach')).toBeInTheDocument()
    expect(screen.queryByText('Ali Parent')).toBeNull()
  })

  // ⚠️ THE SAME PERSON UNDER TWO CHIPS IS CORRECT, NOT A DUPLICATE. Sara really
  // is both, and a filter that showed her under only the first role found would
  // hide a coach from the coach list.
  it('⚠️ shows somebody holding two roles under both of them', async () => {
    const user = userEvent.setup()
    const row = await showFilter()
    const chip = (name) => [...row.querySelectorAll('button')].find((b) => b.textContent.startsWith(name))

    await user.click(chip('Coach'))
    expect(screen.getByText('Sara Coach')).toBeInTheDocument()

    await user.click(chip('Parent'))
    expect(screen.getByText('Sara Coach')).toBeInTheDocument()
    expect(screen.getByText('Ali Parent')).toBeInTheDocument()
    expect(screen.getAllByTestId('account-person')).toHaveLength(2)
  })

  // ⚠️ THE HEADER IS A FACT ABOUT THE CLUB, NOT ABOUT THE FILTER. A count that
  // moved every time somebody tapped a chip is a counter people stop believing.
  it('⚠️ leaves the "with access" count alone while the list narrows', async () => {
    const user = userEvent.setup()
    const row = await showFilter()
    expect(screen.getByText(/3 with access/)).toBeInTheDocument()

    await user.click([...row.querySelectorAll('button')].find((b) => b.textContent.startsWith('Admin')))
    expect(screen.getAllByTestId('account-person')).toHaveLength(1)
    expect(screen.getByText(/3 with access/)).toBeInTheDocument()
  })

  // ⚠️ THE APPROVAL QUEUE IS NOT FILTERED, DELIBERATELY. Somebody asking who
  // the coaches are is not asking to be shown fewer people waiting to be let
  // in, and a pending request hidden behind a filter is how one sits unnoticed
  // for a week.
  it('⚠️ never hides the approval queue behind the filter', async () => {
    const user = userEvent.setup()
    const row = await showFilter()
    const queueBefore = screen.queryByTestId('pending-approvals')

    await user.click([...row.querySelectorAll('button')].find((b) => b.textContent.startsWith('Admin')))
    expect(screen.queryByTestId('pending-approvals')).toEqual(queueBefore)
  })

  it('goes back to everyone', async () => {
    const user = userEvent.setup()
    const row = await showFilter()
    const btns = () => [...row.querySelectorAll('button')]

    await user.click(btns().find((b) => b.textContent.startsWith('Admin')))
    expect(screen.getAllByTestId('account-person')).toHaveLength(1)

    await user.click(btns().find((b) => b.textContent.startsWith('Everyone')))
    expect(screen.getAllByTestId('account-person')).toHaveLength(3)
  })

  // ⚠️ ONE KIND OF ACCOUNT MEANS NO ROW AT ALL — the rule Schedule, Roster and
  // Notices all follow. A single pill that cannot change anything is furniture.
  it('⚠️ hides the whole row when there is only one kind to choose', async () => {
    listClubMembersMock.mockResolvedValue([JAY_ADMIN])
    useMembershipsMock.mockReturnValue(memberships(ADMIN))
    setup()

    await screen.findByTestId('account-person')
    expect(screen.queryByTestId('account-type-filter')).toBeNull()
  })
})

/* ══════════════════════════════════════════════════════════════════════════
   "Waiting for access" — showing what we already know, 16 Aug 2026
   ══════════════════════════════════════════════════════════════════════════

   Jay, of a card carrying nothing but an email address: "still getting these
   with no idea who they are or what they are requesting".

   ⚠️ THE APP KNEW. Measured on production: that person held TWO PENDING
   MEMBERSHIP ROWS — parent, U10 Mixed, with a child; parent, U12 Mixed, with a
   child — written by self-registration, and this card rendered none of it.
   Pending rows are excluded from the access list below (a pending row is not
   access), and "excluded from the list" had quietly come to mean "excluded from
   the screen".

   ⚠️ AND IT IS NOT ALWAYS THE WHOLE TRUTH. That person was in fact the U12
   coach — self-registration files everyone as a parent, because that is the form
   they came through. The wording is "registered as" for exactly that reason:
   it reports what was RECORDED, which is what lets an admin recognise somebody
   and then correct it.
   ══════════════════════════════════════════════════════════════════════════ */

describe('Accounts — a waiting person carries what they asked for', () => {
  const SELF_REGISTERED = {
    id: 'profile-newcomer',
    full_name: '',
    email: 'newcomer@example.com',
    created_at: '2026-08-16T15:40:00Z',
  }

  const waitingRow = () =>
    within(screen.getByTestId('waiting-for-access'))
      .getAllByTestId('waiting-person')
      .find((r) => r.textContent.includes('newcomer@example.com'))

  it('shows the role and squad the request form was told', async () => {
    listPendingProfilesMock.mockResolvedValue([...PROFILE_ROWS, SELF_REGISTERED])
    listAccessRequestsMock.mockResolvedValue([
      {
        id: 'req-new',
        profile_id: 'profile-newcomer',
        status: 'pending',
        note: null,
        requested_role: 'coach',
        requested_team_id: 'team-u10',
        created_at: '2026-08-16T15:40:00Z',
      },
    ])
    setup()

    await screen.findByText('Sara Coach')
    const asked = within(waitingRow()).getByTestId('requested-as')
    expect(asked).toHaveTextContent(/Asked as/i)
    expect(asked).toHaveTextContent('Coach')
    expect(asked).toHaveTextContent('U10')
  })

  // ── Playing up an age group (Jay, 17 Aug 2026) ────────────────────────
  //
  // "the ability for players to play up one age group with a notification". THIS
  // IS THE NOTIFICATION, and it is on the row rather than in an email on
  // purpose: the person who has to ACT is the coach reading this queue, and an
  // email is only a prompt to come and look at exactly this card. It also needs
  // no Vault secret, no edge-function deploy, and no THIRD copy of the UAERF age
  // model — a Deno function cannot import src/lib/ageGrade.js.
  // A registration waiting to be approved: the only rows this queue renders.
  const PENDING_REGISTRATION = {
    id: 'mem-pending',
    profile_id: 'profile-newcomer',
    role: 'parent',
    status: 'pending',
    team_id: 'team-u12',
    player_id: 'player-chidi',
    created_at: '2026-08-17T08:00:00Z',
    profiles: { full_name: 'Nadia Farrow', email: 'nadia@example.com' },
    teams: { name: 'U12 Mixed' },
    // ⚠️ `gender` IS PART OF THE EMBED (players(full_name, gender)) AND THE
    // FIXTURE CARRIES IT. Its absence is what made the first version of the
    // "still missing" chip report a gender gap for every pending player in a
    // single-gender squad — the queue could not tell "none recorded" from "never
    // asked". team-u12 is "U12 Boys" in this file, which is single-gender.
    players: { full_name: 'Chidi Farrow', gender: 'male' },
  }

  it('marks a pending player who is playing up', async () => {
    listClubMembersMock.mockResolvedValue([...MEMBER_ROWS, PENDING_REGISTRATION])
    listPlayerPrivateMock.mockResolvedValue([
      {
        player_id: 'player-chidi',
        date_of_birth: '2015-03-04',
        plays_up_confirmed_at: '2026-08-17T09:00:00Z',
      },
    ])
    setup()

    const row = await screen.findByTestId('pending-membership')
    expect(within(row).getByTestId('playing-up')).toHaveTextContent(/playing up/i)
  })

  // ── What the record is still missing, at the moment of approval ───────
  //
  // The SECOND surface of the shared rule in src/lib/completeness.js (the
  // family's own card is the first). This is the one place a coach is already
  // looking at the record and deciding about it — a gap named here is a gap
  // somebody acts on, where the same gap on a list nobody opens is a gap nobody
  // fixes.
  it('names what is still missing about a pending player', async () => {
    listClubMembersMock.mockResolvedValue([...MEMBER_ROWS, PENDING_REGISTRATION])
    // No birthday row at all, and no parent rows.
    listPlayerPrivateMock.mockResolvedValue([])
    listParentsForPlayersMock.mockResolvedValue([])
  listVouchesMock.mockResolvedValue([])
  setVouchMock.mockResolvedValue({ membership_id: 'mem-pending', answer: 'unknown' })
    setup()

    const row = await screen.findByTestId('pending-membership')
    const missing = await within(row).findByTestId('missing-details')
    expect(missing).toHaveTextContent(/date of birth/i)
    expect(missing).toHaveTextContent(/parent or carer/i)
  })

  // ⚠️ IT MUST NOT BLOCK APPROVAL. A missing birthday is a record to chase, not
  // a reason to leave a real family waiting.
  it('still lets the coach approve while something is missing', async () => {
    listClubMembersMock.mockResolvedValue([...MEMBER_ROWS, PENDING_REGISTRATION])
    setup()

    const row = await screen.findByTestId('pending-membership')
    await within(row).findByTestId('missing-details')
    expect(within(row).getByRole('button', { name: /approve/i })).toBeEnabled()
  })

  it('says nothing when the record is complete', async () => {
    listClubMembersMock.mockResolvedValue([...MEMBER_ROWS, PENDING_REGISTRATION])
    listPlayerPrivateMock.mockResolvedValue([
      { player_id: 'player-chidi', date_of_birth: '2015-03-04', plays_up_confirmed_at: null },
    ])
    listParentsForPlayersMock.mockResolvedValue([
      { id: 'pp-1', player_id: 'player-chidi', full_name: 'Nadia Farrow' },
    ])
    setup()

    const row = await screen.findByTestId('pending-membership')
    await within(row).findByRole('button', { name: /approve/i })
    expect(within(row).queryByTestId('missing-details')).toBeNull()
  })

  // ⚠️ THE BUG THIS CHIP SHIPPED WITH FOR TEN MINUTES, AND THE RULE IT BROKE.
  // The queue's embed was `players(full_name)`, so the gender was UNDEFINED —
  // not absent — and every pending player in a single-gender squad was reported
  // as missing one. completeness.js's whole rule is that an unknown is not a
  // gap; the wiring has to supply the field for that rule to hold.
  it('does not invent a missing gender it was never told about', async () => {
    listClubMembersMock.mockResolvedValue([
      ...MEMBER_ROWS,
      // team-u12 is "U12 Boys" here — single-gender, so the rule DOES apply.
      { ...PENDING_REGISTRATION, players: { full_name: 'Chidi Farrow', gender: 'male' } },
    ])
    listPlayerPrivateMock.mockResolvedValue([
      { player_id: 'player-chidi', date_of_birth: '2015-03-04', plays_up_confirmed_at: null },
    ])
    listParentsForPlayersMock.mockResolvedValue([
      { id: 'pp-1', player_id: 'player-chidi', full_name: 'Nadia Farrow' },
    ])
    setup()

    const row = await screen.findByTestId('pending-membership')
    await within(row).findByRole('button', { name: /approve/i })
    expect(within(row).queryByTestId('missing-details')).toBeNull()
  })

  // …and it DOES ask when the squad requires one and none is recorded.
  it('asks for a gender when the squad is single-gender and none is on file', async () => {
    listClubMembersMock.mockResolvedValue([
      ...MEMBER_ROWS,
      { ...PENDING_REGISTRATION, players: { full_name: 'Chidi Farrow', gender: null } },
    ])
    listPlayerPrivateMock.mockResolvedValue([
      { player_id: 'player-chidi', date_of_birth: '2015-03-04', plays_up_confirmed_at: null },
    ])
    listParentsForPlayersMock.mockResolvedValue([
      { id: 'pp-1', player_id: 'player-chidi', full_name: 'Nadia Farrow' },
    ])
    setup()

    const row = await screen.findByTestId('pending-membership')
    expect(await within(row).findByTestId('missing-details')).toHaveTextContent(/boys’ or girls’/i)
  })

  // ── "Do you know them?" — item 8, 17 Aug 2026 ─────────────────────────
  //
  // ⚠️ "I DON'T" IS THE VALUABLE ANSWER AND THE ONE NOBODY COULD GIVE BEFORE.
  // It rejects nobody and blocks nothing — it makes an unrecognised adult
  // asking to reach a children's squad visible AS unrecognised, instead of
  // identical to everyone else in the queue.
  it('offers both answers, and neither of them is a rejection', async () => {
    listClubMembersMock.mockResolvedValue([...MEMBER_ROWS, PENDING_REGISTRATION])
    setup()

    const row = await screen.findByTestId('pending-membership')
    expect(within(row).getByRole('button', { name: /i know them/i })).toBeInTheDocument()
    expect(within(row).getByRole('button', { name: /i don’t/i })).toBeInTheDocument()
    // ⚠️ THE WORDING MATTERS AS MUCH AS THE BUTTON. Nothing here may read as a
    // refusal — the Approve button is the only verdict on this card.
    expect(within(row).queryByRole('button', { name: /reject|deny|refuse/i })).toBeNull()
  })

  it('records the answer against the signed-in person', async () => {
    const user = userEvent.setup()
    listClubMembersMock.mockResolvedValue([...MEMBER_ROWS, PENDING_REGISTRATION])
    setup()

    const row = await screen.findByTestId('pending-membership')
    await user.click(within(row).getByRole('button', { name: /i don’t/i }))

    await waitFor(() => expect(setVouchMock).toHaveBeenCalled())
    expect(setVouchMock.mock.calls[0][0]).toMatchObject({
      membershipId: 'mem-pending',
      voucherId: SELF_ID,
      answer: 'unknown',
    })
  })

  // ⚠️ IT MUST NOT BLOCK APPROVAL. The whole design is that this is information,
  // not a gate — the refusal is a human's to make with the button beside it.
  it('leaves Approve working whatever the answer', async () => {
    const user = userEvent.setup()
    listClubMembersMock.mockResolvedValue([...MEMBER_ROWS, PENDING_REGISTRATION])
    setup()

    const row = await screen.findByTestId('pending-membership')
    await user.click(within(row).getByRole('button', { name: /i don’t/i }))
    await waitFor(() => expect(setVouchMock).toHaveBeenCalled())

    expect(within(row).getByRole('button', { name: /approve/i })).toBeEnabled()
  })

  it('shows the caller’s own answer as pressed', async () => {
    listClubMembersMock.mockResolvedValue([...MEMBER_ROWS, PENDING_REGISTRATION])
    listVouchesMock.mockResolvedValue([
      { membership_id: 'mem-pending', voucher_id: SELF_ID, answer: 'known', at: '2026-08-17T09:00:00Z' },
    ])
    setup()

    const row = await screen.findByTestId('pending-membership')
    await waitFor(() =>
      expect(within(row).getByRole('button', { name: /i know them/i })).toHaveAttribute(
        'aria-pressed',
        'true',
      ),
    )
  })

  // ⚠️ NO STANDING "0 KNOW THEM" ON A FRESH REQUEST. A tally on a person nobody
  // has looked at yet reads as a verdict rather than an absence of one.
  it('says nothing at all until somebody has answered', async () => {
    listClubMembersMock.mockResolvedValue([...MEMBER_ROWS, PENDING_REGISTRATION])
    listVouchesMock.mockResolvedValue([])
    setup()

    const row = await screen.findByTestId('pending-membership')
    await within(row).findByRole('button', { name: /i know them/i })
    expect(within(row).queryByTestId('vouch-tally')).toBeNull()
  })

  it('counts what the squad has said', async () => {
    listClubMembersMock.mockResolvedValue([...MEMBER_ROWS, PENDING_REGISTRATION])
    listVouchesMock.mockResolvedValue([
      { membership_id: 'mem-pending', voucher_id: 'coach-a', answer: 'known' },
      { membership_id: 'mem-pending', voucher_id: 'coach-b', answer: 'unknown' },
      { membership_id: 'mem-pending', voucher_id: 'coach-c', answer: 'unknown' },
    ])
    setup()

    const row = await screen.findByTestId('pending-membership')
    const tally = await within(row).findByTestId('vouch-tally')
    expect(tally).toHaveTextContent('1 know them')
    expect(tally).toHaveTextContent('2 don’t')
  })

  // ⚠️ AND IT ASKS ONLY ABOUT THE ROWS IN THE QUEUE. player_private holds
  // children's BIRTHDAYS; reading it for the whole roster to label a handful of
  // pending cards would pull the club's birthday list into an admin's browser.
  // RLS would permit that, which is exactly why the narrowing has to be
  // deliberate — and asserted.
  it('asks only about the players in the queue', async () => {
    listClubMembersMock.mockResolvedValue([...MEMBER_ROWS, PENDING_REGISTRATION])
    setup()

    await screen.findByTestId('pending-membership')
    expect(listPlayerPrivateMock).toHaveBeenCalledWith(['player-chidi'])
  })

  // ⚠️ IT READS THE STORED DECISION, NEVER RE-DERIVES ONE. A birthday on file
  // with no confirmation beside it means the family never agreed to anything —
  // showing "playing up" there would put a claim on a child's record that nobody
  // made.
  it('says nothing for a child with a birthday but no confirmation', async () => {
    listClubMembersMock.mockResolvedValue([...MEMBER_ROWS, PENDING_REGISTRATION])
    listPlayerPrivateMock.mockResolvedValue([
      { player_id: 'player-chidi', date_of_birth: '2015-03-04', plays_up_confirmed_at: null },
    ])
    setup()

    const row = await screen.findByTestId('pending-membership')
    expect(within(row).queryByTestId('playing-up')).toBeNull()
  })

  // ⚠️ A FAILED READ MUST NOT TAKE THE QUEUE DOWN. This is one extra label on a
  // card that is already complete without it, and the queue is how anybody gets
  // approved at all.
  it('still renders the queue when the private read fails', async () => {
    listClubMembersMock.mockResolvedValue([...MEMBER_ROWS, PENDING_REGISTRATION])
    listPlayerPrivateMock.mockRejectedValue(new Error('offline'))
    setup()

    const row = await screen.findByTestId('pending-membership')
    expect(within(row).getByRole('button', { name: /approve/i })).toBeInTheDocument()
    expect(within(row).queryByTestId('playing-up')).toBeNull()
  })

  // ⚠️ 'volunteer' IS CLAIMABLE AND NOT GRANTABLE, so it is NOT in ROLE_OPTIONS
  // — the grantable list this line used to be labelled from. Without its own
  // entry it falls through to the raw column value and an admin reads a
  // lowercase stray word in the middle of a sentence.
  it('labels a claimed role that nobody can be granted', async () => {
    listPendingProfilesMock.mockResolvedValue([...PROFILE_ROWS, SELF_REGISTERED])
    listAccessRequestsMock.mockResolvedValue([
      {
        id: 'req-vol',
        profile_id: 'profile-newcomer',
        status: 'pending',
        note: null,
        requested_role: 'volunteer',
        requested_team_id: 'team-u10',
        created_at: '2026-08-17T09:00:00Z',
      },
    ])
    setup()

    await screen.findByText('Sara Coach')
    const asked = within(waitingRow()).getByTestId('requested-as')
    expect(asked).toHaveTextContent('Committee or volunteer')
    expect(asked).not.toHaveTextContent(/asked as volunteer/i)
  })

  // ⚠️ THE SEVEN REQUESTS THAT PREDATE THE ROLE COLUMNS MUST NOT RENDER AN
  // EMPTY LINE. A bare "Asked as" with nothing after it reads as a rendering
  // fault, which is worse than the silence it replaced.
  it('⚠️ says nothing rather than something blank for a request made before the change', async () => {
    listPendingProfilesMock.mockResolvedValue([...PROFILE_ROWS, SELF_REGISTERED])
    listAccessRequestsMock.mockResolvedValue([
      {
        id: 'req-old',
        profile_id: 'profile-newcomer',
        status: 'pending',
        note: 'Parent of someone, somewhere',
        requested_role: null,
        requested_team_id: null,
        created_at: '2026-08-13T09:00:00Z',
      },
    ])
    setup()

    await screen.findByText('Sara Coach')
    const row = waitingRow()
    expect(within(row).queryByTestId('requested-as')).toBeNull()
    expect(within(row).getByTestId('request-note')).toHaveTextContent('Parent of someone')
  })

  // ⚠️ A TOMBSTONE FOR AN ATTEMPT THAT COULD NOT WORK. The first version of
  // this block tried to show a self-registered parent's squads and children on
  // the waiting card, on the strength of production data showing exactly that
  // on their PENDING membership rows. It can never render: `unattached` in
  // Accounts.jsx subtracts every profile holding ANY membership row, pending
  // included, so such a person is not in this list at all — they are in Pending
  // approvals, which already names the child, the squad and the adult.
  //
  // Kept as a test because the mistake is an easy one to repeat, and because
  // the pending-row fixture below is what proves the exclusion is real.
  it('⚠️ is not even listed once they hold a pending membership row', async () => {
    listPendingProfilesMock.mockResolvedValue([...PROFILE_ROWS, SELF_REGISTERED])
    listClubMembersMock.mockResolvedValue([
      ...MEMBER_ROWS,
      {
        id: 'm-new-1',
        profile_id: 'profile-newcomer',
        role: 'parent',
        status: 'pending',
        team_id: 'team-u10',
        player_id: 'player-omar',
        created_at: '2026-08-16T15:40:00Z',
        profiles: { full_name: '', email: 'newcomer@example.com' },
        teams: { name: 'U10 Mixed' },
        players: { full_name: 'Omar Haddad' },
      },
    ])
    setup()

    await screen.findByText('Sara Coach')
    expect(waitingRow()).toBeUndefined()
    // ...and the information is on the approvals card instead, where the child
    // leads because that is the decision being made.
    expect(within(screen.getByTestId('pending-approvals')).getByText('Omar Haddad')).toBeInTheDocument()
  })
})

// ══════════════════════════════════════════════════════════════════════════
//  STAFF ASKING FOR ACCESS — a separate queue, 17 Aug 2026
//
//  ⚠️ THE BUG THIS REPLACES WAS LIVE AND JAY SAW IT. `request_staff_role`
//  (16 Aug) inserts a coach membership with NO player_id. The players queue
//  splits on `status` alone, so the request landed there and rendered as
//  "Unnamed player" — an adult asking to reach a children's squad, shown as a
//  child, under a heading telling the approver they were admitting a player.
//
//  ⚠️ THE FIXTURES BELOW DIFFER BY ONE FIELD — player_id — BECAUSE THAT IS THE
//  ONLY THING THAT DISTINGUISHES THEM ON THE ROW. Same status, same squad. A
//  split that keyed on `role` instead would still get these two right and would
//  be wrong about a parent registering a second child.
// ══════════════════════════════════════════════════════════════════════════
describe('Accounts — staff asking for access', () => {
  const STAFF_REQUEST = {
    id: 'mem-staff-req',
    profile_id: 'profile-newcoach',
    role: 'coach',
    status: 'pending',
    team_id: 'team-u10',
    player_id: null, // the whole difference
    created_at: '2026-08-17T10:41:00Z',
    profiles: { full_name: 'Marek Osgoode', email: 'marek@example.invalid' },
    teams: { name: 'U10' },
  }

  const PLAYER_REQUEST = {
    id: 'mem-player-req',
    profile_id: 'profile-newparent',
    role: 'parent',
    status: 'pending',
    team_id: 'team-u10',
    player_id: 'player-rory',
    created_at: '2026-08-17T08:00:00Z',
    profiles: { full_name: 'Priya Aldenbrook', email: 'priya@example.invalid' },
    teams: { name: 'U10' },
    players: { full_name: 'Rory Aldenbrook', gender: 'male' },
  }

  it('puts a staff request in its own section, never the players queue', async () => {
    listClubMembersMock.mockResolvedValue([...MEMBER_ROWS, STAFF_REQUEST])
    setup()

    const staff = await screen.findByTestId('pending-staff')
    expect(within(staff).getByText('Marek Osgoode')).toBeInTheDocument()
    // The players queue must not render at all for a staff-only backlog.
    expect(screen.queryByTestId('pending-approvals')).toBeNull()
  })

  // ⚠️ THE ORIGINAL SYMPTOM, PINNED. If this string comes back, the partition
  // has been undone.
  it('never calls a staff request an unnamed player', async () => {
    listClubMembersMock.mockResolvedValue([...MEMBER_ROWS, STAFF_REQUEST])
    setup()

    await screen.findByTestId('pending-staff')
    expect(screen.queryByText(/unnamed player/i)).toBeNull()
  })

  it('says which role and squad is being granted', async () => {
    listClubMembersMock.mockResolvedValue([...MEMBER_ROWS, STAFF_REQUEST])
    setup()

    const staff = await screen.findByTestId('pending-staff')
    expect(within(staff).getByTestId('staff-asking')).toHaveTextContent(/Coach/)
    expect(within(staff).getByTestId('staff-asking')).toHaveTextContent(/U10/)
  })

  // ⚠️ THE ROLE IS IN THE BUTTON'S ACCESSIBLE NAME, not only in body text. A
  // button reading "Approve" beside a card headed "Players waiting to be
  // approved" is exactly how this got mistaken for a child's registration.
  it('names the role on the approve button itself', async () => {
    listClubMembersMock.mockResolvedValue([...MEMBER_ROWS, STAFF_REQUEST])
    setup()

    const staff = await screen.findByTestId('pending-staff')
    expect(
      within(staff).getByRole('button', { name: /approve marek osgoode as coach/i }),
    ).toBeInTheDocument()
  })

  // ⚠️ THE CONTROL, AND IT IS NOT PADDING. Without it, a "fix" that routed
  // EVERY pending row into the staff section would pass every test above while
  // breaking the queue the club actually uses each day.
  it('still sends a real player registration to the players queue', async () => {
    listClubMembersMock.mockResolvedValue([...MEMBER_ROWS, PLAYER_REQUEST])
    setup()

    const queue = await screen.findByTestId('pending-approvals')
    expect(within(queue).getByText('Rory Aldenbrook')).toBeInTheDocument()
    expect(screen.queryByTestId('pending-staff')).toBeNull()
  })

  // Both at once: the partition must lose neither, which is the property that
  // makes this a split rather than the client-side filter PendingApprovals'
  // header forbids.
  it('shows both queues when both kinds are waiting, and drops nothing', async () => {
    listClubMembersMock.mockResolvedValue([...MEMBER_ROWS, STAFF_REQUEST, PLAYER_REQUEST])
    setup()

    const staff = await screen.findByTestId('pending-staff')
    const queue = await screen.findByTestId('pending-approvals')
    expect(within(staff).getByText('Marek Osgoode')).toBeInTheDocument()
    expect(within(queue).getByText('Rory Aldenbrook')).toBeInTheDocument()
    expect(screen.getAllByTestId('pending-staff-request')).toHaveLength(1)
    expect(screen.getAllByTestId('pending-membership')).toHaveLength(1)
  })
})

describe('Accounts — the email-confirmed badge', () => {
  // ⚠️ WHY THIS BADGE EXISTS. Two very different people land in "Waiting for
  // access" and their cards were identical: somebody who confirmed, signed in
  // and is genuinely waiting for an admin, and somebody who created a login and
  // never opened the confirmation email — who cannot sign in at all, so granting
  // them access achieves nothing. Measured on production 20 Aug 2026: of five
  // accounts with no active membership, one was in the second state.

  function waiting() {
    return screen.getByTestId('waiting-for-access')
  }

  function pendingWith(extra) {
    // Only the two genuinely-unattached rows carry the override; the member
    // rows stay as they are, so this cannot accidentally test the member list.
    listPendingProfilesMock.mockResolvedValue(
      PROFILE_ROWS.map((row) =>
        row.id === MARISA_PENDING.id || row.id === RAW_PENDING.id ? { ...row, ...extra } : row,
      ),
    )
  }

  it('says "not yet confirmed" when the login has never been confirmed', async () => {
    pendingWith({ email_confirmed_at: null })
    setup()
    await screen.findByText('Sara Coach')

    const badges = within(waiting()).getAllByTestId('email-confirmed-badge')
    expect(badges).toHaveLength(2)
    badges.forEach((b) => expect(b).toHaveTextContent(/email not yet confirmed/i))
    // ⚠️ COLOUR IS PART OF THE MESSAGE HERE, not decoration: this is the state
    // that changes what an admin should do, so it must not render as the quiet
    // one. Asserting the token means a later restyle has to be deliberate.
    expect(badges[0].className).toMatch(/bg-warn-bg/)
  })

  it('says "confirmed" when the login has been confirmed', async () => {
    pendingWith({ email_confirmed_at: '2026-08-20T09:00:00Z' })
    setup()
    await screen.findByText('Sara Coach')

    const badges = within(waiting()).getAllByTestId('email-confirmed-badge')
    expect(badges).toHaveLength(2)
    badges.forEach((b) => expect(b).toHaveTextContent(/^email confirmed$/i))
    // The normal state stays quiet. A list where every card shouts is a list
    // nobody reads, and the warn colour would then mean nothing.
    expect(badges[0].className).not.toMatch(/bg-warn-bg/)
  })

  it('⚠️ says NOTHING when the column is absent, rather than guessing', async () => {
    // The third state, and the reason this is not a plain boolean. An older
    // cached response — or this code reaching a database where the migration
    // has not been applied — returns rows with no such key. Treating that as
    // "not yet confirmed" would state as fact something we do not know, about
    // real families, on the screen an admin acts from.
    pendingWith({})
    setup()
    await screen.findByText('Sara Coach')

    expect(within(waiting()).getAllByTestId('waiting-person')).toHaveLength(2)
    expect(within(waiting()).queryAllByTestId('email-confirmed-badge')).toHaveLength(0)
  })
})

describe('Accounts — the "hasn\'t said what they need" badge', () => {
  // ⚠️ WHY. Everyone who creates a login appears in this list, asked or not,
  // and the "Asked" badge only shows for those who filled the form in. Its
  // ABSENCE carried the useful fact and was invisible. Measured on production
  // 20 Aug 2026: three people waiting, all signed in, none with a request row —
  // two of them had even given their name, because the sign-up flow saves the
  // name before it asks what you need.

  function waiting() {
    return screen.getByTestId('waiting-for-access')
  }

  it('marks a signup that never left a request', async () => {
    listAccessRequestsMock.mockResolvedValue([])
    setup()
    await screen.findByText('Sara Coach')

    const badges = within(waiting()).getAllByTestId('no-request-badge')
    expect(badges).toHaveLength(2)
    expect(badges[0]).toHaveTextContent(/hasn.t said what they need/i)
  })

  it('does NOT mark somebody who did ask — they get the Asked badge instead', async () => {
    listAccessRequestsMock.mockResolvedValue([
      {
        id: 'req-1',
        profile_id: MARISA_PENDING.id,
        status: 'open',
        note: 'Parent of a U10 player',
        requested_role: 'parent',
        requested_team_id: null,
        created_at: '2026-08-03T12:00:00Z',
      },
    ])
    setup()
    await screen.findByText('Sara Coach')

    // One asked, one did not: exactly one badge of each.
    expect(within(waiting()).getAllByTestId('no-request-badge')).toHaveLength(1)
    expect(within(waiting()).getAllByTestId('asked-badge')).toHaveLength(1)
  })

  it('⚠️ says NOTHING when the requests read FAILED, rather than blaming everyone', async () => {
    // The read fails open to an empty array so that nobody waiting is hidden.
    // That is right for the list and wrong for this label: without the
    // requestsLoaded guard, one dropped connection would tell an admin that
    // every person in the queue had said nothing.
    listAccessRequestsMock.mockRejectedValue(new Error('network'))
    setup()
    await screen.findByText('Sara Coach')

    expect(within(waiting()).getAllByTestId('waiting-person')).toHaveLength(2)
    expect(within(waiting()).queryAllByTestId('no-request-badge')).toHaveLength(0)
  })
})

describe('Accounts — adding a player who is not on the roster yet', () => {
  // ⚠️ THIS PATH HAD NO TEST AT ALL, and it is the one that broke in front of
  // an admin on 20 Aug 2026: "null value in column club_id of relation players
  // violates not-null constraint", shown raw on the Accounts screen mid-approval.
  // src/screens/PlayerForm.jsx has always sent club_id; AccessBuilder built
  // { full_name, team_id } and nothing else, so the same action worked from the
  // roster and failed from here.

  it('sends club_id with the new player, taken from the chosen squad', async () => {
    upsertPlayerMock.mockResolvedValue({ id: 'player-new', full_name: 'New Player' })
    const { user } = setup()

    await screen.findByText('Sara Coach')
    await chooseRole(user, 'raw@example.com', 'player')
    await user.click(
      within(builderFor('raw@example.com')).getByRole('checkbox', { name: /on the roster yet/i }),
    )

    const builder = builderFor('raw@example.com')
    await user.type(within(builder).getByRole('textbox'), 'New Player')
    await user.selectOptions(
      within(builder).getAllByRole('combobox').at(-1),
      TEAM_U12.id,
    )
    await user.click(within(builder).getByRole('button', { name: /give access/i }))

    await waitFor(() => expect(upsertPlayerMock).toHaveBeenCalled())
    const sent = upsertPlayerMock.mock.calls[0][0]
    // The assertion that would have caught it: the column the database demands.
    expect(sent.club_id).toBe(CLUB_ID)
    expect(sent.team_id).toBe(TEAM_U12.id)
    expect(sent.full_name).toBe('New Player')
  })
})

describe('Accounts — a request naming several squads', () => {
  // ⚠️ MULTI-SELECT, ON JAY'S INSTRUCTION 20 Aug 2026. A parent with children
  // in three age groups is the ordinary case here, and one squad per request
  // could not express it. requested_team_ids carries the list;
  // requested_team_id keeps the first, because the INSERT policy requires it.

  function waiting() {
    return screen.getByTestId('waiting-for-access')
  }

  it('lists every squad the person named', async () => {
    listAccessRequestsMock.mockResolvedValue([
      {
        id: 'req-1',
        profile_id: MARISA_PENDING.id,
        status: 'open',
        note: null,
        requested_role: 'parent',
        requested_team_id: TEAM_U12.id,
        requested_team_ids: [TEAM_U12.id, TEAM_U10.id],
        created_at: '2026-08-20T12:00:00Z',
      },
    ])
    setup()
    await screen.findByText('Sara Coach')

    const asked = within(waiting()).getByTestId('requested-as')
    expect(asked).toHaveTextContent(TEAM_U12.name)
    expect(asked).toHaveTextContent(TEAM_U10.name)
  })

  it('⚠️ falls back to the single column for rows written before the array existed', async () => {
    // No backfill was run, deliberately: a one-element array would make "asked
    // for one squad" indistinguishable from "asked before the column existed".
    listAccessRequestsMock.mockResolvedValue([
      {
        id: 'req-2',
        profile_id: MARISA_PENDING.id,
        status: 'open',
        note: null,
        requested_role: 'parent',
        requested_team_id: TEAM_U10.id,
        requested_team_ids: null,
        created_at: '2026-08-10T12:00:00Z',
      },
    ])
    setup()
    await screen.findByText('Sara Coach')

    expect(within(waiting()).getByTestId('requested-as')).toHaveTextContent(TEAM_U10.name)
  })
})
