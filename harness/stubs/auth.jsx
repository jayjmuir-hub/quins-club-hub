import { createContext, useContext } from 'react'

// Harness stub replacing src/lib/auth.jsx via a Vite alias. Same public
// shape (AuthProvider, useAuth) as the real module, except AuthProvider
// takes an explicit `value` prop instead of computing one from a real
// Supabase session, so screenshot scenarios can set exact fixture state.

const AuthContext = createContext(undefined)

export function AuthProvider({ value, children }) {
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
