import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { useAuth } from './auth.jsx'
import { supabase } from './supabase'
import { loadMyMemberships } from '../data/members.js'

// Membership/teams context: loads the current user's membership rows and the
// club's teams once a session exists, so the rest of the app can read "who
// is this person and what can they see" (via src/lib/scope.js's pure
// functions) without every screen re-querying. scope.js deliberately stays
// pure and provider-free (Task 7) — this is where that decision's provider
// lives. Meant to be mounted inside RequireAuth only, so a session is
// guaranteed whenever this actually queries; the no-session branch below is
// a defensive fallback, not the expected steady state.
//
// RLS already scopes both queries to what the calling user is allowed to
// see (admins get every row, coaches/parents/players get only their own) —
// there is no user id or team id argument to pass here.

const MembershipContext = createContext(undefined)

async function loadTeams() {
  const { data, error } = await supabase.from('teams').select('*')
  if (error) throw error
  return data ?? []
}

export function MembershipProvider({ children }) {
  const { session } = useAuth()
  const [memberships, setMemberships] = useState([])
  const [teams, setTeams] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    let mounted = true

    if (!session) {
      setMemberships([])
      setTeams([])
      setError(null)
      setLoading(false)
      return () => {
        mounted = false
      }
    }

    setLoading(true)
    setError(null)

    Promise.all([loadMyMemberships(), loadTeams()])
      .then(([membershipRows, teamRows]) => {
        if (!mounted) return
        setMemberships(membershipRows)
        setTeams(teamRows)
      })
      .catch((err) => {
        if (!mounted) return
        setError(err)
      })
      .finally(() => {
        if (mounted) setLoading(false)
      })

    return () => {
      mounted = false
    }
  }, [session, reloadToken])

  const reload = useCallback(() => setReloadToken((token) => token + 1), [])

  const value = { memberships, teams, loading, error, reload }

  return <MembershipContext.Provider value={value}>{children}</MembershipContext.Provider>
}

export function useMemberships() {
  const context = useContext(MembershipContext)
  if (context === undefined) {
    throw new Error('useMemberships must be used within a MembershipProvider')
  }
  return context
}
