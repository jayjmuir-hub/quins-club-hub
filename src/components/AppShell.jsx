import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from '../lib/auth.jsx'
import { useMemberships } from '../lib/memberships.jsx'
import { roleLabel } from '../lib/scope.js'
import Nav from './Nav.jsx'
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
          className="mb-3 rounded-[11px] bg-[#fbeae8] px-3 py-2 text-sm font-semibold text-quinsRedDark"
        >
          {error}
        </p>
      )}
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className="w-full rounded-[11px] border-[1.5px] border-[#e6e3e1] bg-white px-4 py-2.5 text-sm font-bold text-quinsRed transition hover:border-quinsRed disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-quinsRed focus-visible:ring-offset-2 desktop:w-auto"
      >
        {pending ? 'Signing out…' : 'Sign out'}
      </button>
    </div>
  )
}

function LoadingState() {
  return (
    <div role="status" className="flex flex-1 items-center justify-center py-20">
      <p className="text-sm font-semibold uppercase tracking-widest text-[#77726e]">Loading…</p>
    </div>
  )
}

function ErrorState({ error, reload }) {
  return (
    <div
      role="alert"
      className="mx-auto mt-6 max-w-[420px] rounded-2xl border border-[#e6e3e1] bg-white p-6 text-center shadow-[0_6px_24px_rgba(20,20,20,0.10)]"
    >
      <h2 className="text-lg font-extrabold text-quinsRedDark">Couldn&apos;t load your account</h2>
      <p data-testid="error-message" className="mt-2 text-sm leading-relaxed text-quinsRedDark">
        {error.message || 'Something went wrong. Try again.'}
      </p>
      <button
        type="button"
        onClick={reload}
        className="mt-4 rounded-[11px] bg-quinsRed px-4 py-2.5 text-sm font-bold text-white transition hover:bg-quinsRedDark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-quinsRed focus-visible:ring-offset-2"
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
    <div className="mx-auto mt-6 max-w-[420px] rounded-2xl border border-[#e6e3e1] bg-white p-6 text-center shadow-[0_6px_24px_rgba(20,20,20,0.10)]">
      <h2 className="text-lg font-extrabold text-[#221f1d]">You&apos;re signed in</h2>
      <p className="mt-2 text-sm leading-relaxed text-[#77726e]">
        Your account isn&apos;t linked to a squad yet. Ask a club admin to send
        you an invite for <strong className="text-[#221f1d]">{email}</strong>,
        then sign in again to get access.
      </p>
      <SignOutControl signOut={signOut} className="mt-5" />
    </div>
  )
}

export default function AppShell({ children }) {
  const { user, signOut } = useAuth()
  const { memberships, loading, error, reload } = useMemberships()
  const location = useLocation()

  const isMoreRoute = location.pathname === '/more'
  const ready = !loading && !error && memberships.length > 0
  const showRole = !loading && !error
  const currentRoleLabel = roleLabel(memberships)

  return (
    <div className="flex min-h-screen flex-col bg-[#f5f4f3] text-[#221f1d]">
      {/* Task 22: skip-to-content link — design-system.md §8's last
          remaining open gap. Must be the very first focusable element in
          the DOM (it is: nothing above this in AppShell, and AppShell wraps
          every routed screen, so this is the first thing any screen's Tab
          sequence reaches). sr-only by default, popped into view with the
          app's usual focus-visible treatment (quinsRed background, white
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
        className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded-[11px] focus:bg-quinsRed focus:px-4 focus:py-2.5 focus:text-sm focus:font-bold focus:text-white focus:no-underline focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-quinsRedDark"
      >
        Skip to content
      </a>

      {/* Task 22: the final quinsGreen stop is deliberately placed at 300%,
          not 100%. This header's gradient paints across the FULL viewport
          width (not just the centered mx-auto content column below), and
          the centered content column's right edge can land anywhere from
          ~98% of the viewport width (mobile/tablet-desktop widths just
          above the 820px breakpoint, where the column is edge-to-edge) down
          to ~50% (very wide monitors, where the column shrinks toward the
          centre as a fraction of viewport width) — verified empirically
          with Playwright across 820-3440px, see docs/accessibility.md.
          With a 100% stop, that whole range could land on or near pure
          quinsGreen, which measures ~1.9:1 for white text/pills — a real
          AA failure this project hadn't previously checked. Moving the
          stop to 300% means the interpolation from #B23A38 (62%) toward
          quinsGreen only reaches ~16% of the way there by 100% of the
          width, keeping every on-screen pixel within the red family
          (>=5.3:1 for white text at the worst measured position) while
          leaving the gradient definition itself (and its look at the red/
          crest end, which this task must not change) otherwise untouched. */}
      <header className="sticky top-0 z-40 bg-[image:linear-gradient(100deg,theme(colors.quinsRedDark)_0%,theme(colors.quinsRed)_42%,#B23A38_62%,theme(colors.quinsGreen)_300%)] text-white shadow-[0_2px_16px_rgba(20,20,20,0.28)]">
        <div className="mx-auto flex max-w-[1120px] items-center gap-3 px-4 py-3">
          {/* crest.png is 369x400 (portrait) — object-contain keeps its native
              aspect ratio inside the 46x46 badge box (matching the
              prototype's background:contain treatment) instead of the
              default object-fit:fill, which stretched it to fill the square
              and visually flattened the shield's pointed base. */}
          <img
            src={crest}
            alt="Abu Dhabi Harlequins crest"
            className="h-[46px] w-[46px] shrink-0 object-contain drop-shadow-[0_1px_3px_rgba(0,0,0,0.35)]"
          />
          <div className="min-w-0">
            <h1 className="text-base font-extrabold leading-[1.1] tracking-[0.2px]">
              Abu Dhabi Harlequins
            </h1>
            <p className="flex items-baseline gap-1 text-[11.5px] font-semibold uppercase tracking-[1.3px] text-white/[.82] desktop:text-[12px]">
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

          {/* Task 22: bg-black/[.22], not the visually-lighter bg-white/[.16]
              this used to be. Both are semi-transparent pills sitting on the
              header's gradient, but they push contrast in opposite
              directions against the WHITE text inside them: a white overlay
              lightens whatever gradient colour sits underneath (making a
              near-white text sit on a near-white pill — worse contrast), a
              black overlay darkens it (better contrast), regardless of
              which part of the gradient underlies it at a given viewport
              width. Measured with the real bg-white/[.16] version in a real
              browser: the pill's own composited background (not the raw
              gradient) landed at 4.34-4.56:1 against white text across
              820-3440px widths — under the 4.5:1 AA threshold at every width
              except the very widest tested. With bg-black/[.22]: 6.5-8:1 at
              the same measured underlying colours, comfortably clearing AA
              everywhere (see docs/accessibility.md). Nav.jsx's active-pill
              fill uses the identical class for the identical reason. */}
          {showRole && (
            <span
              data-testid="role-label-desktop"
              className="hidden shrink-0 rounded-full bg-black/[.22] px-3 py-1 text-xs font-bold uppercase tracking-wide desktop:inline-block"
            >
              {currentRoleLabel}
            </span>
          )}

          <Nav />
        </div>
      </header>

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
              <div className="mt-6 border-t border-[#e6e3e1] pt-6">
                <SignOutControl signOut={signOut} />
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}
