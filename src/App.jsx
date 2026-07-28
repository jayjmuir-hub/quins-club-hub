import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import RequireAuth from './components/RequireAuth.jsx'
import { MembershipProvider } from './lib/memberships.jsx'
import AppShell from './components/AppShell.jsx'
import Dashboard from './screens/Dashboard.jsx'
import Schedule from './screens/Schedule.jsx'
import Roster from './screens/Roster.jsx'

// More is a route placeholder still — a later task replaces it. It lives here
// (not in src/screens/) so that task creates its screen file without fighting
// a stub of the same name. Schedule is real as of Task 11, Roster as of Task
// 12, and "/" is the real Dashboard as of Task 13.

function More() {
  return <h1>More</h1>
}

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
              <Route path="/more" element={<More />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </AppShell>
        </MembershipProvider>
      </RequireAuth>
    </BrowserRouter>
  )
}
