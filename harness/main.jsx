import React from 'react'
import ReactDOM from 'react-dom/client'
import { MemoryRouter, BrowserRouter, Routes, Route } from 'react-router-dom'
import AppShell from '../src/components/AppShell.jsx'
import Login from '../src/screens/Login.jsx'
import Schedule from '../src/screens/Schedule.jsx'
import Roster from '../src/screens/Roster.jsx'
import Dashboard from '../src/screens/Dashboard.jsx'
import PlayerForm from '../src/screens/PlayerForm.jsx'
import Availability from '../src/screens/Availability.jsx'
import Admin from '../src/screens/Admin.jsx'
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
