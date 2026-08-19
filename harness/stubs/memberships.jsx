import { createContext, useContext } from 'react'

// Harness stub replacing src/lib/memberships.jsx via a Vite alias. Same
// public shape (MembershipProvider, useMemberships) as the real module,
// except MembershipProvider takes an explicit `value` prop instead of
// querying Supabase, so screenshot scenarios can set exact fixture state.

const MembershipContext = createContext(undefined)

export function MembershipProvider({ value, children }) {
  // ⚠️ `realMemberships` DEFAULTS TO `memberships`, BECAUSE PRODUCTION ALWAYS
  // SETS IT AND MOST SCENARIOS IN main.jsx DO NOT. src/lib/memberships.jsx
  // builds its context value with `realMemberships: memberships` — it is never
  // absent in the real app — but the scenario helpers here pass only
  // `memberships`, so it arrived as undefined.
  //
  // That is not cosmetic. NamePrompt computes
  // `hasPlayer = (realMemberships ?? []).some((m) => m.player_id)`, so an
  // undefined value made EVERY parent scenario look like an account with no
  // child linked — and the first-login gate ("Do you have a player at the
  // club?") opened on top of Home, Roster, Schedule and the rest. Every
  // screenshot of a parent screen was taken through a modal that a real linked
  // parent never sees.
  //
  // ⚠️ A SCENARIO THAT SETS `realMemberships` ITSELF STILL WINS — 'name-prompt'
  // does exactly that, deliberately, and must keep being able to.
  const withReal =
    value && value.realMemberships === undefined
      ? { ...value, realMemberships: value.memberships }
      : value
  return <MembershipContext.Provider value={withReal}>{children}</MembershipContext.Provider>
}

export function useMemberships() {
  const context = useContext(MembershipContext)
  if (context === undefined) {
    throw new Error('useMemberships must be used within a MembershipProvider')
  }
  return context
}
