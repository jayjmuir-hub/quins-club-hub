import React from 'react'
import ReactDOM from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import AppShell from '../src/components/AppShell.jsx'
import Login from '../src/screens/Login.jsx'
import Schedule from '../src/screens/Schedule.jsx'
import Roster from '../src/screens/Roster.jsx'
import Dashboard from '../src/screens/Dashboard.jsx'
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

  // Independent verification pass: three age groups in scope.
  'roster-three': rosterScenario(COACH_THREE_MEMBERSHIPS, TEAMS_THREE),

  dashboard: dashboardScenario(COACH_MEMBERSHIPS),
  'dashboard-admin': dashboardScenario(ADMIN_MEMBERSHIPS),
  'dashboard-parent': dashboardScenario(PARENT_MEMBERSHIPS),

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
