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
      <p className="mt-2 text-sm leading-relaxed text-[#77726e]">
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

  return (
    <div className="flex min-h-screen flex-col bg-[#f5f4f3] text-[#221f1d]">
      <header className="sticky top-0 z-40 bg-[image:linear-gradient(100deg,theme(colors.quinsRedDark)_0%,theme(colors.quinsRed)_42%,#B23A38_62%,theme(colors.quinsGreen)_100%)] text-white shadow-[0_2px_16px_rgba(20,20,20,0.28)]">
        <div className="mx-auto flex max-w-[1120px] items-center gap-3 px-4 py-3">
          <img
            src={crest}
            alt="Abu Dhabi Harlequins crest"
            className="h-[46px] w-[46px] shrink-0 drop-shadow-[0_1px_3px_rgba(0,0,0,0.35)]"
          />
          <div>
            <h1 className="text-base font-extrabold leading-[1.1] tracking-[0.2px]">
              Abu Dhabi Harlequins
            </h1>
            <p className="text-[11.5px] font-semibold uppercase tracking-[1.3px] text-white/[.82]">
              Quins Club Hub
            </p>
          </div>

          <div className="flex-1" />

          {!loading && !error && (
            <span className="hidden shrink-0 rounded-full bg-white/[.16] px-3 py-1 text-xs font-bold uppercase tracking-wide desktop:inline-block">
              {roleLabel(memberships)}
            </span>
          )}

          <Nav />
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1120px] flex-1 px-4 pb-[calc(100px+env(safe-area-inset-bottom))] pt-4 desktop:pb-16">
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
