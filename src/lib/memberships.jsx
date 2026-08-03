import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useAuth } from './auth.jsx'
import { supabase } from './supabase'
import { loadMyMemberships } from '../data/members.js'
import { isAdmin } from './scope.js'

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

// --- "View as" preview (design spec 2026-08-03 §1) ---------------------------
// A real admin can preview the app as a coach/parent of one age group. This is
// COSMETIC ONLY: row-level security still returns club-wide rows for an admin's
// real auth.uid(); the app simply declines to display them. Never present it as
// a security boundary.
//
// The preview works by swapping the *effective* membership set every screen
// reads (`memberships`) for a synthetic one, while `realMemberships` keeps the
// truth. The switcher/banner UI must gate on `realMemberships` — gating on the
// effective set would soft-lock an admin previewing as a parent, with no way
// back.

const VIEW_AS_KEY = 'quins.viewAs'

function readStoredViewAs() {
  // Same try/catch convention as readStoredFilter in Schedule.jsx — Safari
  // private mode and some locked-down browsers throw on localStorage access.
  try {
    const raw = window.localStorage.getItem(VIEW_AS_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    if (!parsed.role || !parsed.teamId) return null
    return { role: parsed.role, teamId: parsed.teamId }
  } catch {
    return null
  }
}

function writeStoredViewAs(viewAs) {
  try {
    if (viewAs) window.localStorage.setItem(VIEW_AS_KEY, JSON.stringify(viewAs))
    else window.localStorage.removeItem(VIEW_AS_KEY)
  } catch {
    // A preview that can't be persisted still has to work for this session.
  }
}

/**
 * The membership set screens should act on. Normally the real rows; while
 * previewing, a single synthetic row whose shape matches the fields scope.js
 * reads (role, team_id, player_id) plus club_id for anything that needs it.
 */
function syntheticMemberships(viewAs, realMemberships) {
  if (!viewAs) return realMemberships
  const clubId = realMemberships[0]?.club_id ?? null
  return [
    {
      id: 'view-as',
      role: viewAs.role,
      team_id: viewAs.teamId,
      player_id: null,
      club_id: clubId,
    },
  ]
}

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
  const [viewAsState, setViewAsState] = useState(readStoredViewAs)

  useEffect(() => {
    let mounted = true

    if (!session) {
      // Sign-out must not leak a preview into the next person's login.
      setViewAsState(null)
      writeStoredViewAs(null)
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

  // Only a real admin may preview, and only into a team that actually exists.
  // Both checks are applied when *deriving* the effective preview so a stale or
  // forged localStorage value can never take effect for even one render — the
  // effect below then tidies up the stored value.
  const previewAllowed = isAdmin(memberships)
  const previewTeamExists = viewAsState ? teams.some((team) => team.id === viewAsState.teamId) : false
  const viewAs = viewAsState && previewAllowed && previewTeamExists ? viewAsState : null

  useEffect(() => {
    // Self-heal, but only once the load has settled: while loading, memberships
    // and teams are still empty and every preview would look invalid. Dropping
    // it then would erase a legitimate stored preview on every page refresh.
    if (loading || error || !viewAsState) return
    if (previewAllowed && previewTeamExists) return
    setViewAsState(null)
    writeStoredViewAs(null)
  }, [loading, error, viewAsState, previewAllowed, previewTeamExists])

  const setViewAs = useCallback((next) => {
    const value = next ? { role: next.role, teamId: next.teamId } : null
    setViewAsState(value)
    writeStoredViewAs(value)
  }, [])

  const effectiveMemberships = useMemo(
    () => syntheticMemberships(viewAs, memberships),
    [viewAs, memberships],
  )

  const value = {
    memberships: effectiveMemberships,
    realMemberships: memberships,
    viewAs,
    setViewAs,
    teams,
    loading,
    error,
    reload,
  }

  return <MembershipContext.Provider value={value}>{children}</MembershipContext.Provider>
}

export function useMemberships() {
  const context = useContext(MembershipContext)
  if (context === undefined) {
    throw new Error('useMemberships must be used within a MembershipProvider')
  }
  return context
}
