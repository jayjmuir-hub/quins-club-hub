import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import RequireAuth from './components/RequireAuth.jsx'
import { MembershipProvider } from './lib/memberships.jsx'
import AppShell from './components/AppShell.jsx'
import Dashboard from './screens/Dashboard.jsx'
import Schedule from './screens/Schedule.jsx'
import Roster from './screens/Roster.jsx'
import More from './screens/More.jsx'
import AdminDashboard from './screens/AdminDashboard.jsx'
import AdminClub from './screens/AdminClub.jsx'
import Accounts from './screens/Accounts.jsx'
import AcceptInvite from './screens/AcceptInvite.jsx'

// Routing (admin-dashboard plan, 2026-08-05).
//
// "/more" renders the real More screen — for EVERY role, not just admins.
// It used to render Admin.jsx, which meant a parent, player or coach opening
// the More tab got a "not authorised" card. ⚠️ /more must stay a real route:
// AppShell renders the app's only sign-out control on this exact path, so
// redirecting it into /admin would leave every non-admin unable to sign out.
//
// "/admin" is the admin-only back-end dashboard, with its two tabs mounted
// as CHILD ROUTES so each is linkable and survives a refresh. Bare /admin
// redirects to the Accounts tab. The old "/accounts" URL redirects there too
// rather than 404ing through the catch-all — it was bookmarked.
//
// "/overview" is gone (its one working section moved to /admin/club) and now
// falls through to the "*" -> "/" redirect below.
//
// /accept-invite/:token is deliberately NOT one of AppShell's wrapped routes
// below. AppShell only renders its `children` once memberships.length > 0
// (its `ready` gate) — a brand-new invitee who just signed in via magic link
// has zero memberships until they accept, so nesting this route inside a
// single shared <AppShell> the way the other routes are would make it
// permanently unreachable: AppShell would show its no-membership state
// forever and never render the Routes block at all, regardless of the URL.
// Wrapping each of the other routes in its own <AppShell> individually
// (rather than one <AppShell> around a single nested <Routes>) is what makes
// it possible for this one route to opt out of that gate entirely, without
// teaching AppShell itself about a specific path.
export default function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <RequireAuth>
        <MembershipProvider>
          <Routes>
            <Route path="/accept-invite/:token" element={<AcceptInvite />} />
            <Route path="/" element={<AppShell><Dashboard /></AppShell>} />
            <Route path="/schedule" element={<AppShell><Schedule /></AppShell>} />
            <Route path="/roster" element={<AppShell><Roster /></AppShell>} />
            <Route path="/more" element={<AppShell><More /></AppShell>} />

            {/* Admin-only, desktop-only. AdminDashboard gates on isAdmin()
                against the EFFECTIVE membership set and renders <Outlet/>,
                so both tabs below inherit the gate — typing
                /admin/accounts as a coach gets the same "not authorised"
                card as /admin itself. */}
            <Route path="/admin" element={<AppShell><AdminDashboard /></AppShell>}>
              <Route index element={<Navigate to="/admin/accounts" replace />} />
              <Route path="accounts" element={<Accounts />} />
              <Route path="club" element={<AdminClub />} />
            </Route>

            {/* Old bookmarked URL. A plain redirect, not a duplicate mount:
                Accounts must exist in exactly one place. */}
            <Route path="/accounts" element={<Navigate to="/admin/accounts" replace />} />

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </MembershipProvider>
      </RequireAuth>
    </BrowserRouter>
  )
}
