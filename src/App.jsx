import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import RequireAuth from './components/RequireAuth.jsx'
import { MembershipProvider } from './lib/memberships.jsx'
import AppShell from './components/AppShell.jsx'
import Dashboard from './screens/Dashboard.jsx'
import Schedule from './screens/Schedule.jsx'
import Roster from './screens/Roster.jsx'
import Overview from './screens/Overview.jsx'
import Admin from './screens/Admin.jsx'
import Accounts from './screens/Accounts.jsx'
import AcceptInvite from './screens/AcceptInvite.jsx'

// "/more" now renders the real Admin screen (Task 17) rather than a stub.
// design-system.md §5.4 describes "More" as club info (everyone) + a
// "Manage" block (admin/coach only) — this task builds only the admin-only
// piece of that (Admin.jsx already gates itself on isAdmin() and shows a
// plain "not authorised" message otherwise), reusing the nav's existing
// "More" tab rather than adding a fifth nav item: Nav's four items
// (Home/Schedule/Roster/More) are asserted exactly by tests/nav.test.jsx, and
// there is no unused nav slot to add a dedicated admin route to. A later task
// can fold in the club-info/about content §5.4 also describes, for every
// role, without moving this route again. Schedule is real as of Task 11,
// Roster as of Task 12, "/" is the real Dashboard as of Task 13.
//
// /accept-invite/:token (Task 18) is deliberately NOT one of AppShell's
// wrapped routes below. AppShell only renders its `children` once
// memberships.length > 0 (its `ready` gate) — a brand-new invitee who just
// signed in via magic link has zero memberships until they accept, so
// nesting this route inside a single shared <AppShell> the way the other
// four routes are would make it permanently unreachable: AppShell would show
// NoMembershipState forever and never render the Routes block at all,
// regardless of the URL. Wrapping each of the other four routes in its own
// <AppShell> individually (rather than one <AppShell> around a single nested
// <Routes>) is what makes it possible for this one route to opt out of that
// gate entirely, without teaching AppShell itself about a specific path.
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
            <Route path="/overview" element={<AppShell><Overview /></AppShell>} />
            <Route path="/more" element={<AppShell><Admin /></AppShell>} />
            {/* Admin-only account management (design spec 2026-08-03 §2).
                Reachable at any width — only its NAV LINK is desktop-only —
                and Accounts.jsx gates itself on isAdmin(), so typing the URL
                as a coach gets the same "not authorised" card Admin shows. */}
            <Route path="/accounts" element={<AppShell><Accounts /></AppShell>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </MembershipProvider>
      </RequireAuth>
    </BrowserRouter>
  )
}
