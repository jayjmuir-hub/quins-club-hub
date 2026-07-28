import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import RequireAuth from './components/RequireAuth.jsx'
import { MembershipProvider } from './lib/memberships.jsx'
import AppShell from './components/AppShell.jsx'
import Dashboard from './screens/Dashboard.jsx'
import Schedule from './screens/Schedule.jsx'
import Roster from './screens/Roster.jsx'
import Admin from './screens/Admin.jsx'

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

export default function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <RequireAuth>
        <MembershipProvider>
          <AppShell>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/schedule" element={<Schedule />} />
              <Route path="/roster" element={<Roster />} />
              <Route path="/more" element={<Admin />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </AppShell>
        </MembershipProvider>
      </RequireAuth>
    </BrowserRouter>
  )
}
