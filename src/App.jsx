import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom'
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
import Privacy from './screens/Privacy.jsx'
import DeleteAccount from './screens/DeleteAccount.jsx'

// Routing (admin-dashboard plan, 2026-08-05).
//
// ⚠️ THERE ARE NOW TWO GROUPS: PUBLIC AND SIGNED-IN. Everything used to sit
// inside <RequireAuth>, which meant the app had no page a signed-out person
// could read at all. That became a blocker on 6 Aug 2026: Google Play requires
// a privacy policy and an account-deletion route that are reachable WITHOUT an
// account, because a Play reviewer opens both cold, and so does a parent who
// cannot remember which email they signed up with.
//
// The signed-in group is wrapped by a PATHLESS LAYOUT ROUTE (`<Route
// element={<Authed/>}>`). That is the react-router idiom for "apply this
// wrapper to these children", and it is used here specifically because it
// leaves every existing path string untouched — nesting a second <Routes>
// under a `path="*"` would have made all of them relative and rewritten the
// lot. The catch-all redirect stays INSIDE the group, so an unknown URL still
// lands a signed-out visitor on the login screen exactly as before.
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

// The signed-in half of the app, as a layout. RequireAuth renders Login in
// place when there is no session, preserving the URL.
function Authed() {
  return (
    <RequireAuth>
      <MembershipProvider>
        <Outlet />
      </MembershipProvider>
    </RequireAuth>
  )
}

export default function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        {/* PUBLIC — no session required, and no MembershipProvider either.
            Both of these are linked from the Play Store listing and must
            render for someone who has never signed in. */}
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/delete-account" element={<DeleteAccount />} />

        {/* SIGNED-IN */}
        <Route element={<Authed />}>
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
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
