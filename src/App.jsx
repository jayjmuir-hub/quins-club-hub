import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import RequireAuth from './components/RequireAuth.jsx'
import { MembershipProvider } from './lib/memberships.jsx'
import AppShell from './components/AppShell.jsx'
import Schedule from './screens/Schedule.jsx'

// Home/Roster/More are route placeholders still — Task 12 replaces Roster,
// Task 13 replaces Home, and a later task replaces More. They live here (not
// in src/screens/) so those tasks create their screen files without fighting
// a stub of the same name. Schedule is real as of Task 11.

function Home() {
  return <h1>Home</h1>
}

function Roster() {
  return <h1>Roster</h1>
}

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
              <Route path="/" element={<Home />} />
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
