import { createContext, useContext } from 'react'

// Harness stub replacing src/lib/memberships.jsx via a Vite alias. Same
// public shape (MembershipProvider, useMemberships) as the real module,
// except MembershipProvider takes an explicit `value` prop instead of
// querying Supabase, so screenshot scenarios can set exact fixture state.

const MembershipContext = createContext(undefined)

export function MembershipProvider({ value, children }) {
  return <MembershipContext.Provider value={value}>{children}</MembershipContext.Provider>
}

export function useMemberships() {
  const context = useContext(MembershipContext)
  if (context === undefined) {
    throw new Error('useMemberships must be used within a MembershipProvider')
  }
  return context
}
