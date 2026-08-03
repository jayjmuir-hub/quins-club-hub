import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from '../lib/auth.jsx'
import { useMemberships } from '../lib/memberships.jsx'
import { canEditTeam, isAdmin, roleLabel, visibleTeams } from '../lib/scope.js'
import Nav from './Nav.jsx'
import { ViewAsBanner, ViewAsSwitcher } from './ViewAsSwitcher.jsx'
import crest from '../assets/crest.png'

// The frame every screen lives inside: branded header (crest, name, tagline,
// role label, nav) plus the membership-loading gate that decides whether the
// routed content, a loading indicator, an error, or the zero-membership
// message is what actually shows below it. Task 9 owns shared UI primitives
// (Card/Chip/Sheet); Tasks 11-17 own the real screens — this file only wraps
// them, it does not build them (see App.jsx's Home/Schedule/Roster/More
// placeholders, still stubs until those tasks land).
//
// Sign-out lives here, not in the More placeholder: it renders in two
// places — the zero-membership message (decision 2) and, once memberships
// have loaded, alongside the routed content on the /more route (decision 7)
// — both driven by this component reading useLocation(), so the More screen
// itself doesn't need to know about auth at all yet.

function SignOutControl({ signOut, className = '' }) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState(null)

  async function handleClick() {
    setPending(true)
    setError(null)
    try {
      await signOut()
    } catch (err) {
      setError(err.message || 'Something went wrong signing out. Try again.')
    } finally {
      setPending(false)
    }
  }

  return (
    <div className={className}>
      {error && (
        <p
          role="alert"
          className="mb-3 rounded-[11px] bg-danger-bg px-3 py-2 text-sm font-semibold text-brand-deep"
        >
          {error}
        </p>
      )}
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className="w-full rounded-[11px] border-[1.5px] border-line bg-surface-card px-4 py-2.5 text-sm font-bold text-brand transition hover:border-brand disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 desktop:w-auto"
      >
        {pending ? 'Signing out…' : 'Sign out'}
      </button>
    </div>
  )
}

function LoadingState() {
  return (
    <div role="status" className="flex flex-1 items-center justify-center py-20">
      <p className="text-sm font-semibold uppercase tracking-widest text-ink-faint">Loading…</p>
    </div>
  )
}

function ErrorState({ error, reload }) {
  return (
    <div
      role="alert"
      className="mx-auto mt-6 max-w-[420px] rounded-2xl border border-line bg-surface-card p-6 text-center shadow-card"
    >
      <h2 className="text-lg font-extrabold text-brand-deep">Couldn&apos;t load your account</h2>
      <p data-testid="error-message" className="mt-2 text-sm leading-relaxed text-brand-deep">
        {error.message || 'Something went wrong. Try again.'}
      </p>
      <button
        type="button"
        onClick={reload}
        className="mt-4 rounded-[11px] bg-brand px-4 py-2.5 text-sm font-bold text-white transition hover:bg-brand-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
      >
        Try again
      </button>
    </div>
  )
}

// A signed-in user with zero membership rows reads zero rows from every
// RLS-scoped table, including teams — so with no explicit handling here the
// app would otherwise just look blank. This is the first thing Jay himself
// sees after his first sign-in, before the make-me-admin SQL runs, so the
// tone is "you're in, hang tight" rather than an error.
function NoMembershipState({ email, signOut }) {
  return (
    <div className="mx-auto mt-6 max-w-[420px] rounded-2xl border border-line bg-surface-card p-6 text-center shadow-card">
      <h2 className="text-lg font-extrabold text-ink">You&apos;re signed in</h2>
      <p className="mt-2 text-sm leading-relaxed text-ink-faint">
        Your account isn&apos;t linked to a squad yet. Ask a club admin to send
        you an invite for <strong className="text-ink">{email}</strong>,
        then sign in again to get access.
      </p>
      <SignOutControl signOut={signOut} className="mt-5" />
    </div>
  )
}

export default function AppShell({ children }) {
  const { user, signOut } = useAuth()
  const { memberships, teams, loading, error, reload } = useMemberships()
  const location = useLocation()

  const isMoreRoute = location.pathname === '/more'
  const ready = !loading && !error && memberships.length > 0
  const showRole = !loading && !error
  const currentRoleLabel = roleLabel(memberships)
  // Same "can manage anything" boolean Dashboard.jsx already computes for
  // its own canEdit gating (src/screens/Dashboard.jsx) — admins can manage
  // everything, coaches can manage whichever of their visible teams they're
  // assigned to. Drives whether the desktop-only Overview nav link (Task 4)
  // shows at all; Overview itself re-derives its own scoping independently.
  const scopedTeams = visibleTeams(memberships, teams)
  const canManage = isAdmin(memberships) || scopedTeams.some((team) => canEditTeam(memberships, team.id))

  return (
    <div className="flex min-h-screen flex-col bg-surface text-ink">
      {/* Task 22: skip-to-content link — design-system.md §8's last
          remaining open gap. Must be the very first focusable element in
          the DOM (it is: nothing above this in AppShell, and AppShell wraps
          every routed screen, so this is the first thing any screen's Tab
          sequence reaches). sr-only by default, popped into view with the
          app's usual focus-visible treatment (brand background, white
          text — the same red used for every other focus ring in the app)
          the instant it receives keyboard focus, hidden again on blur —
          the standard skip-link pattern. Points at <main>'s new
          `id="main-content"`; <main> also gets `tabIndex={-1}` (below)
          because jumping a same-page anchor link moves the *viewport* but
          not keyboard focus unless the target itself is focusable — without
          that, Tab immediately after activating this link would resume
          from the top of the page again, not from inside <main>. */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded-[11px] focus:bg-brand focus:px-4 focus:py-2.5 focus:text-sm focus:font-bold focus:text-white focus:no-underline focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-brand-deep"
      >
        Skip to content
      </a>

      {/* Banner + masthead stick together as ONE unit. The banner has to sit
          above the header and stay visible (spec §1: persistent, unmissable),
          but two separately-`sticky top-0` siblings would both pin to y=0 and
          the higher-z banner would paint over the masthead as soon as the
          page scrolled. Hoisting the sticky positioning to a shared wrapper
          keeps them stacked in document order at every scroll position, and
          costs nothing when no preview is active (the banner renders null).
          The Sheet's own scrim is z-50, so it still covers this. */}
      <div className="sticky top-0 z-40">
        <ViewAsBanner />

        {/* The masthead is DARK CHROME (#151517 -> #0c0c0e), not the red
            gradient it used to be. Two reasons, in order of importance:
          
            1. It is the core move of the "A+" theme — brand identity lives on
               the chrome (masthead + bottom tab bar) so the data surfaces
               underneath can stay light and stay readable on a phone in Abu
               Dhabi daylight. See docs/design-system.md §2.
            2. It retires a whole class of contrast problem. The old red->green
               gradient painted across the FULL viewport width while the content
               column is centred and max-1120px, so which gradient colour sat
               under the white text depended on the monitor. That needed the
               green stop pushed out to 300% to keep every on-screen pixel in
               the red family, and it was still only ~5.3:1 at its worst. Flat
               near-black is 19.54:1 at every width, on every monitor, with no
               empirical sweep required.
          
            The vivid green is not lost — it moves to the `brand-rule` hairline
            across the top edge, where it is decoration and carries no text, so
            full saturation is free there. `harlequin` adds the site's diagonal
            shapes bleeding off the right edge. */}
        <header className="bg-chrome-grad text-white shadow-masthead">
          <div className="brand-rule" />
          <div className="harlequin relative mx-auto flex max-w-[1120px] items-center gap-3 overflow-hidden px-4 py-3">
            {/* crest.png is 370x400 (portrait) — object-contain keeps its native
                aspect ratio inside the 46x46 badge box (matching the
                prototype's background:contain treatment) instead of the
                default object-fit:fill, which stretched it to fill the square
                and visually flattened the shield's pointed base. */}
            <img
              src={crest}
              alt="Abu Dhabi Harlequins crest"
              className="h-[46px] w-[46px] shrink-0 object-contain drop-shadow-[0_1px_3px_rgba(0,0,0,0.35)]"
            />
            {/* The club name is one of the few places Anton is allowed (see
                tailwind.config.js fontFamily): it is a masthead wordmark, not
                something anyone reads at speed. `truncate` because Anton is
                wide and the name is long — on a narrow phone it would
                otherwise push the nav off the row. */}
            <div className="relative min-w-0">
              <h1 className="truncate font-display text-[19px] uppercase leading-none tracking-[0.02em] desktop:text-[21px]">
                Abu Dhabi Harlequins
              </h1>
              <p className="flex items-baseline gap-1 font-condensed text-[13px] font-semibold uppercase tracking-[1.6px] text-white/70">
                <span>Quins Club Hub</span>
                {/* Mobile-only compact role indicator (decision 6: the role
                    label has no breakpoint qualifier, and mobile is the
                    primary case for a pitch-side club app). The desktop badge
                    below covers >=820px; this covers below it, so the role is
                    never CSS-hidden at any width. */}
                {showRole && (
                  <span data-testid="role-label-mobile" className="truncate desktop:hidden">
                    · {currentRoleLabel}
                  </span>
                )}
              </p>
            </div>

            <div className="flex-1" />

            {/* The old version of this pill was a semi-transparent overlay
                (bg-black/[.22]) because it sat on a gradient whose colour
                varied with viewport width — that whole problem is gone now the
                masthead is flat near-black. So this is an opaque red-tinted
                pill with a red hairline, which reads as brand rather than as
                "slightly darker patch". #ff8f8f on #0c0c0e composited with the
                20% red fill measures >8:1; the fill is opaque-over-flat, so it
                does not move with viewport width. */}
            {showRole && (
              <span
                data-testid="role-label-desktop"
                className="hidden shrink-0 rounded-pill bg-brand/20 px-3 py-1 font-condensed text-[13px] font-bold uppercase tracking-[0.08em] text-brand-onDark ring-1 ring-inset ring-brand/45 desktop:inline-block"
              >
                {currentRoleLabel}
              </span>
            )}

            {/* Gates on realMemberships inside the component itself, never on
                the effective `memberships` destructured above — see
                ViewAsSwitcher.jsx's header comment. */}
            <ViewAsSwitcher />

            {/* Accounts is admin-only, and gates on the EFFECTIVE membership
                set (the same one Accounts.jsx itself reads), so an admin
                previewing as a coach loses the link along with the screen. */}
            <Nav canManage={canManage} canManageAccounts={isAdmin(memberships)} />
          </div>
        </header>
      </div>

      <main
        id="main-content"
        tabIndex={-1}
        className="mx-auto w-full max-w-[1120px] flex-1 px-4 pb-[calc(100px+env(safe-area-inset-bottom))] pt-4 desktop:pb-16 focus:outline-none"
      >
        {loading && <LoadingState />}
        {!loading && error && <ErrorState error={error} reload={reload} />}
        {!loading && !error && memberships.length === 0 && (
          <NoMembershipState email={user?.email} signOut={signOut} />
        )}
        {ready && (
          <>
            {children}
            {isMoreRoute && (
              <div className="mt-6 border-t border-line pt-6">
                <SignOutControl signOut={signOut} />
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}
