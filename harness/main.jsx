import React from 'react'
import ReactDOM from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import AppShell from '../src/components/AppShell.jsx'
import Login from '../src/screens/Login.jsx'
import { AuthProvider } from './stubs/auth.jsx'
import { MembershipProvider } from './stubs/memberships.jsx'
import '../src/index.css'

// Throwaway visual-verification harness. Renders the REAL AppShell/Nav/Login
// components (imported straight from src/) with stubbed auth + membership
// context values selected via ?scenario=<name>, so Playwright can screenshot
// real Tailwind-rendered layout without a Supabase session or any network
// access. Not part of the app build; not committed.

function Home() {
  // Mirrors App.jsx's routed Home placeholder exactly (see src/App.jsx).
  return <h1>Home</h1>
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
const TEAMS = [
  { id: 't1', name: 'U12 Boys', sort_order: 4 },
  { id: 't2', name: 'U14 Boys', sort_order: 6 },
]

function Shell({ authValue, membershipValue }) {
  return (
    <MemoryRouter initialEntries={['/']}>
      <AuthProvider value={authValue}>
        <MembershipProvider value={membershipValue}>
          <AppShell>
            <Home />
          </AppShell>
        </MembershipProvider>
      </AuthProvider>
    </MemoryRouter>
  )
}

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
