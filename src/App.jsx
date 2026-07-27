import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import RequireAuth from './components/RequireAuth.jsx'

// Route placeholders only. Task 8 replaces these with the real app shell and
// navigation; Tasks 11-17 replace them again with the real screens. They live
// here (not in src/screens/) so those later tasks create their screen files
// without fighting a stub of the same name.

function Home() {
  return <h1>Home</h1>
}

function Schedule() {
  return <h1>Schedule</h1>
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
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/schedule" element={<Schedule />} />
          <Route path="/roster" element={<Roster />} />
          <Route path="/more" element={<More />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </RequireAuth>
    </BrowserRouter>
  )
}
