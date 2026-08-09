import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from './auth.jsx'
import { supabase } from './supabase'
import { claimRosterAccess, loadMyMemberships } from '../data/members.js'
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
  // ⚠️ THE EFFECT BELOW KEYS ON THIS, NOT ON `session`, AND THAT IS THE WHOLE
  // POINT OF THE LINE. AuthProvider calls setSession on every auth event, and
  // supabase-js hands it a NEW session object each time — including on the
  // routine token refresh that happens roughly hourly for as long as the app is
  // open. Depending on the object identity re-ran this entire load on every one
  // of those, and because the re-run sets `loading` back to true, AppShell's
  // `ready` gate went false and UNMOUNTED the routed screen underneath whoever
  // was using it: a coach part-way through the repeating-series EventForm lost
  // the sheet and everything in it, with no error and nothing on screen to
  // explain why. The uid is what this load actually depends on, and it does not
  // change when the token does.
  const userId = session?.user?.id ?? null
  const [memberships, setMemberships] = useState([])
  const [teams, setTeams] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [reloadToken, setReloadToken] = useState(0)
  const [viewAsState, setViewAsState] = useState(readStoredViewAs)
  // Which user id we have already offered roster auto-onboarding to. A ref,
  // not state, because changing it must not itself cause a render — and
  // because the ONLY thing it exists to prevent is calling the RPC twice for
  // the same person in one session. See the claim block in the effect below.
  const claimAttemptedFor = useRef(null)

  useEffect(() => {
    let mounted = true

    if (!userId) {
      // Sign-out must not leak a preview into the next person's login.
      setViewAsState(null)
      writeStoredViewAs(null)
      // ...nor a "we already tried to onboard this person" flag, or the next
      // person to sign in on a shared laptop would never be offered it.
      claimAttemptedFor.current = null
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

    // ⚠️ The signed-in uid, NOT "whatever RLS lets through". `memb read` is
    // (profile_id = auth.uid() OR is_admin(club_id)), so an unfiltered read
    // hands an ADMIN the whole club's memberships — and this provider's output
    // is what every screen treats as "mine". See loadMyMemberships.
    Promise.all([loadMyMemberships(userId), loadTeams()])
      .then(async ([membershipRows, teamRows]) => {
        if (!mounted) return

        // --- Roster auto-onboarding -------------------------------------
        // A signed-in person with NO access is the one case worth a second
        // round trip: the club roster may already list them against their
        // children, in which case they should never have to ask anyone.
        // See db/migrations/20260806_claim_roster_access.sql.
        //
        // Gated on zero memberships, so the overwhelmingly common path (an
        // existing member loading the app) costs nothing at all.
        if (membershipRows.length === 0 && claimAttemptedFor.current !== userId) {
          // Marked BEFORE awaiting, not after: two effect runs can overlap
          // (React 18 StrictMode double-invokes in development, and a token
          // refresh can retrigger this), and marking afterwards would let
          // both through.
          claimAttemptedFor.current = userId

          let claimed = []
          try {
            claimed = await claimRosterAccess()
          } catch {
            // Deliberately swallowed. A failed claim is not an error state:
            // it is indistinguishable, to this person, from not being on the
            // roster — and the honest outcome for both is the same
            // RequestAccess screen, which offers them a way forward. Turning
            // a transient network blip into a red error page would take that
            // away.
          }
          if (!mounted) return

          if (claimed.length > 0) {
            // Re-read rather than using what the RPC returned. It returns bare
            // membership rows; every screen here expects them joined to teams,
            // and `teams` itself was EMPTY a moment ago — RLS showed this
            // person no squads because they held no membership. Both have to
            // be fetched again now that they do.
            const [freshMemberships, freshTeams] = await Promise.all([
              loadMyMemberships(userId),
              loadTeams(),
            ])
            if (!mounted) return
            setMemberships(freshMemberships)
            setTeams(freshTeams)
            return
          }
        }

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
  }, [userId, reloadToken])

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
