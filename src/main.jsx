import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { AuthProvider } from './lib/auth.jsx'
import { installGlobalErrorReporting } from './lib/errorReporting.js'
import './index.css'
import './sw-register.js'
import { applyTheme, watchSystemTheme } from './lib/theme.js'

// Theme before render — index.html's inline script already themed the first
// paint; this re-asserts from the real module and keeps following the OS for
// as long as the app lives. Never unsubscribed on purpose: the subscription
// IS app-lifetime.
applyTheme()
watchSystemTheme()

// ⚠️ BEFORE `render`, SO A CRASH DURING THE FIRST RENDER IS STILL CAUGHT. It
// costs nothing to call early: this only registers two listeners, and the Sentry
// SDK itself is not loaded until something actually throws — see
// src/lib/errorReporting.js for why it is lazy.
//
// ⚠️ AND IT IS NOT REDUNDANT WITH `ErrorBoundary`. A boundary catches errors
// thrown during RENDER and nothing else; a rejected promise in a data module or
// a throwing event handler never reaches one, and in an app that is mostly
// Supabase calls that is where the failures are.
installGlobalErrorReporting()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </React.StrictMode>,
)
