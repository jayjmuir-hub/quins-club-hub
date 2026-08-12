import React, { useState } from 'react'
import ReactDOM from 'react-dom/client'
import { MemoryRouter, BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import AppShell from '../src/components/AppShell.jsx'
import Login from '../src/screens/Login.jsx'
import Schedule from '../src/screens/Schedule.jsx'
import Roster from '../src/screens/Roster.jsx'
import Dashboard from '../src/screens/Dashboard.jsx'
// ⚠️ REPOINTED, NOT DELETED (7 Aug 2026). src/screens/Overview.jsx was
// removed in 2e26d35 when its content folded into the single /admin
// dashboard — and this import was not updated, so the ENTIRE harness has
// failed to boot ever since with "Failed to resolve import
// ../src/screens/Overview.jsx". Every scenario in this file, not just the two
// overview ones. That is the whole browser-verification anchor dead, silently,
// because nothing in `npm test` or `npm run build` loads harness/main.jsx.
// Found while trying to measure the masthead for Jay's truncation report.
import AdminDashboard from '../src/screens/AdminDashboard.jsx'
import PlayerForm from '../src/screens/PlayerForm.jsx'
import Availability from '../src/screens/Availability.jsx'
import EventDetail from '../src/screens/EventDetail.jsx'
// ⚠️ Same rot as the line above: src/screens/Admin.jsx became AdminClub.jsx.
// Aliased back to `Admin` so the scenario bodies below don't need touching.
import Admin from '../src/screens/AdminClub.jsx'
import Accounts from '../src/screens/Accounts.jsx'
import AcceptInvite from '../src/screens/AcceptInvite.jsx'
import { PLAYERS } from './stubs/players.js'
import { AuthProvider } from './stubs/auth.jsx'
import { MembershipProvider } from './stubs/memberships.jsx'
import '../src/index.css'

// Throwaway visual-verification harness. Renders the REAL AppShell/Nav/Login
// components (imported straight from src/) with stubbed auth + membership
// context values selected via ?scenario=<name>, so Playwright can screenshot
// real Tailwind-rendered layout without a Supabase session or any network
// access. Not part of the app build; not committed.

// "/" renders the real Dashboard as of Task 13 (see src/App.jsx).
function Home() {
  return <Dashboard />
}

const noop = async () => {}

function baseAuth(email) {
  return {
    session: { user: { email } },
    user: { email },
    loading: false,
    signInWithEmail: noop,
    signInWithGoogle: noop,
    signOut: noop,
  }
}

const COACH_EMAIL = 'coach.sam@adhq.example'
const JAY_EMAIL = 'jayjmuir@gmail.com'

const COACH_MEMBERSHIPS = [
  { id: 'm1', role: 'coach', team_id: 't1', player_id: null },
  { id: 'm2', role: 'coach', team_id: 't2', player_id: null },
]
const CLUB_ID = '00000000-0000-0000-0000-0000000000ad'
const TEAMS = [
  { id: 't1', club_id: CLUB_ID, name: 'U12 Boys', sort_order: 4 },
  { id: 't2', club_id: CLUB_ID, name: 'U14 Boys', sort_order: 6 },
]

// Three-age-group variants, added for the independent controller-side
// verification pass. Two groups is the minimum that makes the age-group
// branch fire at all; three is what it actually looks like in the club, and
// it is what puts enough pills in the row to test the 375px overflow.
const COACH_THREE_MEMBERSHIPS = [
  { id: 'm1', role: 'coach', team_id: 't1', player_id: null },
  { id: 'm2', role: 'coach', team_id: 't2', player_id: null },
  { id: 'm3', role: 'coach', team_id: 't3', player_id: null },
]
const TEAMS_THREE = [...TEAMS, { id: 't3', club_id: CLUB_ID, name: 'U16 Boys', sort_order: 8 }]

function Shell({ authValue, membershipValue, route = '/', children }) {
  return (
    <MemoryRouter initialEntries={[route]}>
      <AuthProvider value={authValue}>
        <MembershipProvider value={membershipValue}>
          <AppShell>{children ?? <Home />}</AppShell>
        </MembershipProvider>
      </AuthProvider>
    </MemoryRouter>
  )
}

const ADMIN_MEMBERSHIPS = [{ id: 'm0', role: 'admin', team_id: null, player_id: null }]

function scheduleScenario(memberships, teams = TEAMS) {
  return () => (
    <Shell
      route="/schedule"
      authValue={baseAuth(COACH_EMAIL)}
      membershipValue={{ memberships, teams, loading: false, error: null, reload: noop }}
    >
      <Schedule />
    </Shell>
  )
}

// Independent Task 14 verification: the club really has 15 age groups, and
// the point of the form's squad <select> is that a coach of ONE of them sees
// exactly one option, not all 15. Two teams (TEAMS) cannot show that.
const TEAMS_15 = [
  'Senior Men 1st XV', 'Senior Men 2nd XV', 'Senior Women', 'U18 Boys', 'U16 Boys',
  'U15 Boys', 'U14 Boys', 'U13 Boys', 'U12 Boys', 'U11 Mixed',
  'U10 Mixed', 'U9 Mixed', 'U8 Mixed', 'U7 Mixed', 'U6 Mixed',
].map((name, i) => ({ id: i === 8 ? 't1' : `t${100 + i}`, club_id: CLUB_ID, name, sort_order: i }))

function rosterScenario(memberships, teams = TEAMS) {
  return () => (
    <Shell
      route="/roster"
      authValue={baseAuth(COACH_EMAIL)}
      membershipValue={{ memberships, teams, loading: false, error: null, reload: noop }}
    >
      <Roster />
    </Shell>
  )
}

// Task 13 Dashboard screens. The default Shell child is already the
// Dashboard, so these only vary the persona (which is what changes the scope
// note, the stat-tile labels and the quick-action gating).
function dashboardScenario(memberships, teams = TEAMS) {
  return () => (
    <Shell
      route="/"
      authValue={baseAuth(COACH_EMAIL)}
      membershipValue={{ memberships, teams, loading: false, error: null, reload: noop }}
    />
  )
}

const PARENT_MEMBERSHIPS = [{ id: 'm4', role: 'parent', team_id: 't1', player_id: 'p1' }]

// A coach of one squad: the team filter is hidden and the list groups by
// position. Task 12's grouping rule turns on team count, so this is the
// scenario that renders the Forwards/Backs/Other headings.
const COACH_ONE_TEAM = [{ id: 'm1', role: 'coach', team_id: 't1', player_id: null }]

const scenarios = {
  login: () => (
    <AuthProvider value={baseAuth('')}>
      <Login />
    </AuthProvider>
  ),

  'shell-coach': () => (
    <Shell
      authValue={baseAuth(COACH_EMAIL)}
      membershipValue={{
        memberships: COACH_MEMBERSHIPS,
        teams: TEAMS,
        loading: false,
        error: null,
        reload: noop,
      }}
    />
  ),

  'shell-no-membership': () => (
    <Shell
      authValue={baseAuth(JAY_EMAIL)}
      membershipValue={{ memberships: [], teams: [], loading: false, error: null, reload: noop }}
    />
  ),

  'shell-error': () => (
    <Shell
      authValue={baseAuth(JAY_EMAIL)}
      membershipValue={{
        memberships: [],
        teams: [],
        loading: false,
        error: new Error('Network request failed while loading your account.'),
        reload: noop,
      }}
    />
  ),

  // Task 11 Schedule screens. Sub-tab selection and sheet opening are real
  // component state, so Playwright drives them by clicking (see shoot.mjs).
  schedule: scheduleScenario(COACH_MEMBERSHIPS),
  'schedule-admin': scheduleScenario(ADMIN_MEMBERSHIPS),
  // Task 14: the read-only side of the new Add/Edit/Delete affordances.
  'schedule-parent': scheduleScenario(PARENT_MEMBERSHIPS),
  // Coach of exactly one squad, in a club of 15. Independent verification.
  'schedule-one-team': scheduleScenario(COACH_ONE_TEAM, TEAMS_15),
  'schedule-admin-15': scheduleScenario(ADMIN_MEMBERSHIPS, TEAMS_15),

  // Task 12 Roster screens. Search text, pill selection and the PlayerDetail
  // sheet are real component state, so Playwright drives them by typing and
  // clicking (see shoot-roster.mjs).
  roster: rosterScenario(COACH_MEMBERSHIPS),
  'roster-one-team': rosterScenario(COACH_ONE_TEAM),
  'roster-admin': rosterScenario(ADMIN_MEMBERSHIPS),
  // Task 15: the read-only side of the new Add/Edit/Delete affordances.
  'roster-parent': rosterScenario(PARENT_MEMBERSHIPS),

  // Independent verification pass: three age groups in scope.
  'roster-three': rosterScenario(COACH_THREE_MEMBERSHIPS, TEAMS_THREE),

  dashboard: dashboardScenario(COACH_MEMBERSHIPS),
  'dashboard-admin': dashboardScenario(ADMIN_MEMBERSHIPS),
  'dashboard-parent': dashboardScenario(PARENT_MEMBERSHIPS),

  // Task 5 (Overview screen) browser verification. Same Shell/membership
  // pattern as the dashboard scenarios above; renders the real Overview
  // screen instead of Dashboard. COACH_MEMBERSHIPS/ADMIN_MEMBERSHIPS/TEAMS
  // are the same fixtures every other scenario in this file already uses,
  // so upcoming fixtures (e6/e7, both within the 14-day window of the repo's
  // pinned "today") and roster gaps (p4 has no contact row, per players.js's
  // stub) render with real, reused fixture data rather than new ones.
  // Route is /admin now, not /overview. The coach variant is kept even though
  // AdminDashboard is admin-only in the real app: the point of the scenario is
  // to render the screen for a non-admin and see what it does, which is
  // exactly the case a route guard would hide.
  'overview-admin': () => (
    <Shell
      route="/admin"
      authValue={baseAuth(JAY_EMAIL)}
      membershipValue={{ memberships: ADMIN_MEMBERSHIPS, teams: TEAMS, loading: false, error: null, reload: noop }}
    >
      <AdminDashboard />
    </Shell>
  ),
  'overview-coach': () => (
    <Shell
      route="/admin"
      authValue={baseAuth(COACH_EMAIL)}
      membershipValue={{ memberships: COACH_MEMBERSHIPS, teams: TEAMS, loading: false, error: null, reload: noop }}
    >
      <AdminDashboard />
    </Shell>
  ),

  // Independent verification pass, Task 15: mount PlayerForm DIRECTLY so the
  // gated branches can be reached without Roster's own gating deciding first.
  // ?pf=add|edit|edit-null|edit-foreign|no-teams picks the case.
  //   edit          -> p1 (U12, coach can edit, contact row on file)
  //   edit-null     -> p4 (U12, coach can edit, NO contact row on file)
  //   edit-foreign  -> p21 (U16 — coach coaches U12/U14 only)
  //   no-teams      -> a parent, i.e. zero editable squads
  playerform: () => {
    const params = new URLSearchParams(window.location.search)
    const which = params.get('pf') || 'add'
    const byId = (id) => PLAYERS.find((p) => p.id === id)
    const player =
      which === 'edit' ? byId('p1')
      : which === 'edit-null' ? byId('p4')
      : which === 'edit-foreign' ? byId('p21')
      : which === 'no-teams' ? byId('p1')
      : null
    const memberships = which === 'no-teams' ? PARENT_MEMBERSHIPS : COACH_MEMBERSHIPS
    return (
      <Shell
        route="/roster"
        authValue={baseAuth(COACH_EMAIL)}
        membershipValue={{ memberships, teams: TEAMS_THREE, loading: false, error: null, reload: noop }}
      >
        <PlayerForm player={player} onClose={noop} onSaved={noop} />
      </Shell>
    )
  },

  // Independent Task 16 verification: mount Availability DIRECTLY (same
  // reasoning as the `playerform` scenario above) so its own per-row
  // `editable` computation can be exercised for every role/team combination
  // without Schedule's/EventDetail's own gating deciding which case is even
  // reachable first. ?who=coach|admin|coach-foreign|parent-own|parent-foreign
  // picks the membership; ?team=t1|t2 picks which squad's event is open.
  // e6/e7 match the harness availability stub's REAL_ROWS keys, so the
  // per-row status (not just the count-only MIX fixture) is real and
  // player-id-addressable.
  availability: () => {
    const params = new URLSearchParams(window.location.search)
    const who = params.get('who') || 'coach'
    const teamId = params.get('team') || 't1'
    const otherTeamId = teamId === 't1' ? 't2' : 't1'
    const event =
      teamId === 't1'
        ? {
            id: 'e6',
            team_id: 't1',
            type: 'training',
            title: 'U12 Squad Training',
            opponent: null,
            venue: 'Zayed Sports City',
            starts_at: '2026-07-28T15:30:00Z',
            result_us: null,
            result_them: null,
          }
        : {
            id: 'e7',
            team_id: 't2',
            type: 'training',
            title: 'U14 Contact & Conditioning',
            opponent: null,
            venue: 'Zayed Sports City — Pitch 3',
            starts_at: '2026-07-28T17:00:00Z',
            result_us: null,
            result_them: null,
          }
    const membershipsByWho = {
      coach: COACH_MEMBERSHIPS, // coaches both t1 and t2 -> canOverrideAll for either.
      admin: ADMIN_MEMBERSHIPS,
      // Coaches only the OTHER team -> zero override rights on this one.
      'coach-foreign': [{ id: 'mx', role: 'coach', team_id: otherTeamId, player_id: null }],
      // Child p1 is on t1's roster. Viewing t1 -> exactly one editable row.
      // Viewing t2 (via ?team=t2) -> p1 is not on t2's roster at all, so this
      // doubles as the "child NOT on this roster" case with no extra wiring.
      'parent-own': PARENT_MEMBERSHIPS,
      // A parent linked to THIS team, but to a player id that is not one of
      // its actual roster rows (a malformed/stale link) — the strictest
      // version of "child not on the roster": even same-team membership must
      // not grant a clickable row for a player id that isn't really there.
      'parent-foreign': [{ id: 'mx', role: 'parent', team_id: teamId, player_id: 'not-on-roster' }],
    }
    const memberships = membershipsByWho[who] ?? COACH_MEMBERSHIPS
    return (
      <Shell
        route="/schedule"
        authValue={baseAuth(COACH_EMAIL)}
        membershipValue={{ memberships, teams: TEAMS, loading: false, error: null, reload: noop }}
      >
        <Availability event={event} team={TEAMS.find((t) => t.id === teamId)} onClose={noop} />
      </Shell>
    )
  },

  // ⚠️ ADDED 12 Aug 2026 WITH THE DUPLICATE BUTTON. EventDetail's footer went
  // from two buttons to three — Edit | Duplicate | Delete — and no other
  // scenario opens this sheet (`schedule` and `dashboard` render the LIST), so
  // there was nowhere to look at the new row.
  //
  // ⚠️ IT IS FOR LOOKING AT AND MEASURING, NOT FOR THE OVERFLOW GATE, and that
  // is a correction to what this comment said when it was written. The gate
  // cannot see inside a sheet: Sheet is `position:fixed` and sets body
  // overflow hidden, so its contents are outside the document's scrollWidth.
  // Injecting a 900px `shrink-0` button here left the gate green. The row was
  // verified by measuring it in Chromium instead — 284px wide at 320px, the
  // three buttons 83 + 97 + 85 with 10px gaps, one line, nothing clipped.
  //
  // Mounted directly for the same reason `playerform` and `availability` above
  // are: so the gated branch is reachable without Schedule's own state
  // deciding first.
  //
  // ⚠️ THE LONGEST PLAUSIBLE LABELS ON PURPOSE — a venue and pitch a coach
  // would really type, and every optional block switched on — because a
  // cramped row is only cramped at its widest.
  'event-detail': () => (
    <Shell
      route="/schedule"
      authValue={baseAuth(COACH_EMAIL)}
      membershipValue={{
        memberships: COACH_MEMBERSHIPS,
        teams: TEAMS,
        loading: false,
        error: null,
        reload: noop,
      }}
    >
      <EventDetail
        event={{
          id: 'e6',
          team_id: 't1',
          type: 'training',
          title: 'U12 Contact & Conditioning',
          opponent: null,
          venue: 'Zayed Sports City, Abu Dhabi',
          pitch: 'Pitch TBD',
          notes: 'Meet at the gate 30 minutes before. Bring both kits.',
          starts_at: '2026-07-28T15:30:00Z',
          ends_at: '2026-07-28T17:00:00Z',
          series_id: null,
          result_us: null,
          result_them: null,
        }}
        team={TEAMS.find((t) => t.id === 't1')}
        canEdit
        onClose={noop}
        onEdit={noop}
        onDuplicate={noop}
        onDeleted={noop}
      />
    </Shell>
  ),

  // Independent Task 17 verification: mount Admin DIRECTLY (same reasoning
  // as the `playerform`/`availability` scenarios above) so its own isAdmin()
  // gate and data-fetch effect can be exercised for every role without
  // App.jsx's routing deciding which case is even reachable first.
  // ?who=admin|coach|parent|player picks the membership. Real 15-age-group
  // fixture (TEAMS_15) is used so "Age groups (15)" is genuine, not a
  // 2-3-team stand-in.
  admin: () => {
    const params = new URLSearchParams(window.location.search)
    const who = params.get('who') || 'admin'
    const membershipsByWho = {
      admin: ADMIN_MEMBERSHIPS,
      coach: COACH_MEMBERSHIPS,
      parent: PARENT_MEMBERSHIPS,
      player: [{ id: 'm5', role: 'player', team_id: 't1', player_id: 'p1' }],
    }
    const memberships = membershipsByWho[who] ?? ADMIN_MEMBERSHIPS
    return (
      <Shell
        route="/more"
        authValue={baseAuth(JAY_EMAIL)}
        membershipValue={{ memberships, teams: TEAMS_15, loading: false, error: null, reload: noop }}
      >
        <Admin />
      </Shell>
    )
  },

  // Independent Task 17 verification: a real BrowserRouter (not
  // MemoryRouter) with real Routes for /more, /schedule, /roster — same
  // shape as App.jsx's own <Routes> — so a click on Admin's "Manage" links
  // can be checked for what it ACTUALLY does in a real browser: a
  // client-routed SPA navigation (URL changes, JS context/state survives) vs
  // a hard full-page reload (which a plain <a href> triggers regardless of
  // which router wraps it). window.__navMarker is set once on load and
  // checked after the click — it survives a client-side route change but is
  // wiped by a real page load, which is how the two are told apart.
  'admin-nav': () => {
    window.__navMarker = 'harness-loaded'
    return (
      <BrowserRouter>
        <AuthProvider value={baseAuth(JAY_EMAIL)}>
          <MembershipProvider
            value={{ memberships: ADMIN_MEMBERSHIPS, teams: TEAMS_15, loading: false, error: null, reload: noop }}
          >
            <AppShell>
              <Routes>
                <Route path="/more" element={<Admin />} />
                <Route path="/schedule" element={<Schedule />} />
                <Route path="/roster" element={<Roster />} />
              </Routes>
            </AppShell>
          </MembershipProvider>
        </AuthProvider>
      </BrowserRouter>
    )
  },

  // Independent Task 18 verification. A faithful reproduction of App.jsx's
  // OWN route structure (per-route <AppShell> wrapping, /accept-invite/:token
  // as a sibling outside all of them) — not one screen mounted directly like
  // the scenarios above — because this task's top-priority risk (a possible
  // remount flash/jank on every route change, since each <Route> now owns its
  // own <AppShell> instead of one shared shell wrapping a nested <Routes>) can
  // only be observed by actually navigating a real router, not by rendering
  // one screen in isolation. RequireAuth is deliberately NOT reproduced here:
  // every scenario below assumes a session already exists (that's what
  // AuthProvider's stub value supplies), so RequireAuth would only ever take
  // its "render children" branch — reproducing it would add nothing to
  // observe. `memberships` is real React state (not a fixed prop) so
  // AcceptInvite's real reload()-then-navigate sequence can be exercised
  // end-to-end: reload() here flips a zero-membership account to a
  // one-membership account, the same effect the real reload() has after a
  // genuine accept_invite RPC call inserts a row.
  'full-app': () => {
    const params = new URLSearchParams(window.location.search)
    const startMemberships = params.get('start') === 'none' ? [] : ADMIN_MEMBERSHIPS
    const startTeams = params.get('start') === 'none' ? [] : TEAMS_15

    function FullApp() {
      const [memberships, setMemberships] = useState(startMemberships)
      const [teams] = useState(startTeams)

      function reload() {
        // Simulate what a genuine accept_invite RPC call achieves: the
        // invitee now has exactly one membership row that didn't exist
        // before.
        setMemberships([{ id: 'm-accepted', role: 'player', team_id: 't1', player_id: 'p1' }])
      }

      const membershipValue = { memberships, teams, loading: false, error: null, reload }

      return (
        <BrowserRouter>
          <AuthProvider value={baseAuth(JAY_EMAIL)}>
            <MembershipProvider value={membershipValue}>
              <Routes>
                <Route path="/accept-invite/:token" element={<AcceptInvite />} />
                <Route path="/" element={<AppShell><Dashboard /></AppShell>} />
                <Route path="/schedule" element={<AppShell><Schedule /></AppShell>} />
                <Route path="/roster" element={<AppShell><Roster /></AppShell>} />
                <Route path="/more" element={<AppShell><Admin /></AppShell>} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </MembershipProvider>
          </AuthProvider>
        </BrowserRouter>
      )
    }

    return <FullApp />
  },

  // Task 5 (view-as + Accounts) browser verification.
  //
  // Accounts mounted DIRECTLY, same reasoning as the admin/playerform
  // scenarios above: its own isAdmin() gate and fetch effect are what is
  // being checked, not App.jsx's routing. TEAMS_THREE (t1/t2/t3) is used
  // rather than TEAMS_15 because the members stub's rows point at exactly
  // those three team ids, so every age-group <select> holds a value that
  // really exists in its option list. The auth stub supplies an id matching
  // the fixture admin's profile_id (pr-jay), which is what makes the
  // last-admin guard reachable at all — with no id, ownAdminCount is 0 and
  // the guard can never fire. ?who=admin|coach picks the gate case.
  'accounts-admin': () => {
    const params = new URLSearchParams(window.location.search)
    const who = params.get('who') || 'admin'
    const memberships = who === 'coach' ? COACH_MEMBERSHIPS : ADMIN_MEMBERSHIPS
    const authValue = { ...baseAuth(JAY_EMAIL), user: { id: 'pr-jay', email: JAY_EMAIL } }
    return (
      <Shell
        route="/accounts"
        authValue={authValue}
        membershipValue={{
          memberships,
          realMemberships: memberships,
          viewAs: null,
          setViewAs: noop,
          teams: TEAMS_THREE,
          loading: false,
          error: null,
          reload: noop,
        }}
      >
        <Accounts />
      </Shell>
    )
  },

  // The view-as switcher needs membership context that actually CHANGES when
  // a persona is chosen — a fixed `value` prop (what every scenario above
  // passes) would render the sheet but never re-scope anything, which is the
  // whole behaviour under test. So this scenario holds viewAs in real React
  // state and derives the effective set exactly as
  // src/lib/memberships.jsx's syntheticMemberships does. That derivation is
  // duplicated here deliberately and is NOT the authority on it —
  // tests/memberships.test.jsx tests the real provider; this exists so the
  // real ViewAsSwitcher/ViewAsBanner/Roster can be driven in a real browser
  // without a Supabase session.
  //
  // Roster is the child screen because its age-group pills make re-scoping
  // visible at a glance: admin sees all three squads, a coach persona sees
  // one. ?who=non-admin flips the caller to a coach, which is how the
  // "switcher renders nothing for a non-admin" case is checked.
  'view-as': () => {
    const params = new URLSearchParams(window.location.search)
    const real = params.get('who') === 'non-admin' ? COACH_MEMBERSHIPS : ADMIN_MEMBERSHIPS

    function ViewAsHarness() {
      const [viewAs, setViewAsState] = useState(null)
      const effective = viewAs
        ? [{ id: 'view-as', role: viewAs.role, team_id: viewAs.teamId, player_id: null, club_id: CLUB_ID }]
        : real

      return (
        <Shell
          route="/roster"
          authValue={baseAuth(JAY_EMAIL)}
          membershipValue={{
            memberships: effective,
            realMemberships: real,
            viewAs,
            setViewAs: (next) => setViewAsState(next ? { role: next.role, teamId: next.teamId } : null),
            teams: TEAMS_THREE,
            loading: false,
            error: null,
            reload: noop,
          }}
        >
          <Roster />
        </Shell>
      )
    }

    return <ViewAsHarness />
  },

  // Task D (plan 2026-08-03-pending-access) verification: the "Waiting for
  // access" section on Accounts.
  //
  // The section's highest-risk bug is that listPendingProfiles() returns
  // EVERY profile the admin can read, not just the unattached ones — the
  // screen subtracts listClubMembers()'s profile_ids, and dropping that
  // subtraction lists every existing member as "waiting". So this scenario is
  // pointed at a members stub that deliberately returns both kinds of row
  // (the three unattached pn-* profiles AND the eight member profiles), which
  // is what makes the subtraction observable instead of vacuously true.
  //
  // The auth user id is `pr-jay` — a profile that IS in the member list — so
  // the belt-and-braces `profile.id !== user?.id` filter is exercised on a
  // real id rather than on undefined. TEAMS_THREE for the same reason
  // accounts-admin uses it: every age-group option in the grant select points
  // at a team id the fixture rows really use.
  //
  // Knobs (read by harness/stubs/members.js): ?pending=none for the empty
  // state, ?pendingThrow=1 to prove a failed profiles read costs only this
  // section, ?writeDelay/?writeThrow for the grant button's in-flight and
  // refusal states.
  'accounts-pending': () => (
    <Shell
      route="/accounts"
      authValue={{ ...baseAuth(JAY_EMAIL), user: { id: 'pr-jay', email: JAY_EMAIL } }}
      membershipValue={{
        memberships: ADMIN_MEMBERSHIPS.map((row) => ({ ...row, club_id: CLUB_ID })),
        realMemberships: ADMIN_MEMBERSHIPS,
        viewAs: null,
        setViewAs: noop,
        teams: TEAMS_THREE,
        loading: false,
        error: null,
        reload: noop,
      }}
    >
      <Accounts />
    </Shell>
  ),

  // Task C's first-login name prompt, in a real browser. It renders inside
  // AppShell's `ready` branch, so this is a plain signed-in shell — the only
  // thing that decides whether the Sheet opens is the profile the members
  // stub returns, driven by ?blankName=1. Without that knob the same scenario
  // is the control case: a named profile, no prompt.
  //
  // An auth user id is mandatory here and easy to miss: NamePrompt returns
  // early when user?.id is undefined, and baseAuth() alone supplies only an
  // email — so every other scenario in this file is silently immune to the
  // prompt. Skipping writes `quins.namePromptSkipped` = this id to
  // localStorage, which is what the "does not reappear" check clears between
  // runs.
  'name-prompt': () => (
    <Shell
      route="/"
      authValue={{ ...baseAuth(JAY_EMAIL), user: { id: 'pr-jay', email: JAY_EMAIL } }}
      membershipValue={{
        memberships: ADMIN_MEMBERSHIPS,
        realMemberships: ADMIN_MEMBERSHIPS,
        viewAs: null,
        setViewAs: noop,
        teams: TEAMS_THREE,
        loading: false,
        error: null,
        reload: noop,
      }}
    />
  ),

  'shell-loading': () => (
    <Shell
      authValue={baseAuth(JAY_EMAIL)}
      membershipValue={{ memberships: [], teams: [], loading: true, error: null, reload: noop }}
    />
  ),
}

const params = new URLSearchParams(window.location.search)
const scenario = params.get('scenario') || 'login'
const render = scenarios[scenario] || scenarios.login

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>{render()}</React.StrictMode>,
)
