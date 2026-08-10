import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../lib/auth.jsx'
import useMyProfile from '../lib/useMyProfile.js'
import { useMemberships } from '../lib/memberships.jsx'
import { isAdmin, isPendingOnly, roleLabel } from '../lib/scope.js'
import Nav from './Nav.jsx'
import NamePrompt from './NamePrompt.jsx'
import AddYourPlayer from './AddYourPlayer.jsx'
import RequestAccess from './RequestAccess.jsx'
// ViewAsBanner only — the switcher itself moved to the Admin screen on
// 7 Aug 2026. See the long note at its old call site below.
import { ViewAsBanner } from './ViewAsSwitcher.jsx'
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

// `children` is the sign-out control, passed in from below exactly as
// AddYourPlayer and RequestAccess take it — and for the same reason. See the
// note at the call site.
function ErrorState({ error, reload, children }) {
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
      {children}
    </div>
  )
}

// What a person WAITING FOR APPROVAL sees above the app — and it is above the
// app, not instead of it.
//
// ⚠️ DO NOT TURN THIS INTO A GATE. A pending member can genuinely use most of
// the app: `event read` is private.is_attached_to_team (any status), and
// `player read`/`avail read` both carry an is_own_player clause, so the
// database really does return their child, the squad's fixtures, and their own
// availability. Blocking the app behind a "please wait" card would throw all
// of that away and reduce the pending state to a slower version of no access —
// which is precisely what the design exists to avoid. See
// db/migrations/20260808_membership_pending_status.sql.
//
// The last sentence is load-bearing and unglamorous: NOBODY IS EMAILED when
// someone is waiting. That gap already existed for access requests and is
// worse here, because with no seeded roster every parent queues. Telling
// someone to sit tight when no notification will ever arrive is how a person
// waits a fortnight for a screen nobody is looking at.
function PendingApprovalBanner() {
  return (
    <div
      data-testid="pending-approval"
      role="status"
      className="mb-4 rounded-2xl border border-line bg-surface-card px-4 py-3.5 shadow-card"
    >
      <p className="text-[15px] font-extrabold text-ink">Waiting to be approved</p>
      <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">
        Your player is with the club. You can see their fixtures and set their
        availability now — the rest of the squad appears once a club admin has
        approved you. Nobody is emailed automatically, so if nothing has changed in
        a few days, mention it to your coach or team manager.
      </p>
    </div>
  )
}

// A signed-in user with zero membership rows reads zero rows from every
// RLS-scoped table, including teams — so with no explicit handling here the
// app would otherwise just look blank.
//
// This used to be a static "ask a club admin for an invite" card, which was a
// dead end: it told someone to go and find an admin through some channel the
// app knew nothing about, and every person who ever hit it stayed in the
// admin's waiting list forever with no way to be cleared. RequestAccess
// replaced it with the approval gate — see
// db/migrations/20260804_access_requests.sql — and since 8 Aug 2026
// AddYourPlayer sits in FRONT of it as the primary route (parent
// self-registration, spec claude/decisions/2026-08-08-parent-self-registration.md).
// Both are still mounted: registering a child is what most people are here to
// do, but a coach or a committee member has no child to register and must not
// be stranded on a form that does not describe them.

export default function AppShell({ children }) {
  const { user, signOut } = useAuth()
  const { firstName } = useMyProfile()
  const { memberships, teams, loading, error, reload } = useMemberships()
  const location = useLocation()
  // Which of the two zero-membership routes is showing. State, not a route:
  // both are dead ends by nature and a URL for either would be a page someone
  // could bookmark and return to after they had access. Resets on reload,
  // which is correct — the question "are you adding a player?" is asked fresh
  // every time somebody arrives with no access.
  const [askingForAccess, setAskingForAccess] = useState(false)

  const isMoreRoute = location.pathname === '/more'
  const ready = !loading && !error && memberships.length > 0
  // ⚠️ DO NOT gate this on `viewAs` to win masthead space. Tried, reverted
  // (7 Aug 2026). tests/view-as.test.jsx reads this pill to prove the
  // EFFECTIVE membership set really is the previewed one — the anti-soft-lock
  // check — and the View-as banner cannot stand in for it, because the banner
  // renders from the `viewAs` selection itself and would still say "Parent"
  // if the effective set had not actually changed. Hiding the pill during a
  // preview deletes the only observable that distinguishes those two.
  // The truncation it was meant to fix is handled in ViewAsSwitcher instead.
  const showRole = !loading && !error
  const currentRoleLabel = roleLabel(memberships)
  // Reads the EFFECTIVE membership set, like every other gate in this file, so
  // an admin previewing a squad is never told they are waiting for approval.
  // (isPendingOnly returns false for a synthetic preview row anyway — see its
  // note in scope.js — but gating on the same set as everything else means
  // that safety net is never the only thing holding it up.)
  const pendingOnly = ready && isPendingOnly(memberships)
  // The old admin-OR-coach `canManage` boolean is gone with /overview
  // (admin-dashboard plan, 2026-08-05). There is one management destination
  // now — /admin — and it is admin-only, so the nav gate is just isAdmin().

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
               Dhabi daylight. See claude/specs/design-system.md §2.
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
            {/* ⚠️ `overflow-hidden` is a TAP-TARGET guard, not a cosmetic one.
                Reported with the wrap above (8 Aug 2026): "tapping the initial
                only works from the home tab". The masthead is rendered
                identically on every route — nothing in this file is
                route-conditional except the sign-out block far below — so a
                genuinely route-dependent account button does not exist, and
                the working theory was that this block was painting over the
                account Link to its right and swallowing the taps.

                It was not, and the honest answer is written here so nobody
                re-derives it: this is a flex item with `min-w-0`, so it is
                sized by the flex algorithm and never wider than the space it
                is given; the wrap was the browser fitting the text INSIDE that
                width, not spilling out of it. What the wrap did do is make
                this block three lines tall next to a 36px circle, which is a
                mis-tap waiting to happen, and on /more the link points at the
                page you are already on and so does nothing visible at all.
                Those two together are the whole of the report.

                The clip stays anyway: it makes "this block cannot paint over
                the account button" a property of the container instead of
                something that holds only while both children happen to carry
                `truncate`. That is the class of bug jsdom cannot see, so it is
                worth making structural. */}
            <div className="relative min-w-0 overflow-hidden">
              <h1 className="truncate font-display text-[19px] uppercase leading-none tracking-[0.02em] desktop:text-[21px]">
                Abu Dhabi Harlequins
              </h1>
              {/* ⚠️ ONE LINE, AND IT MUST STAY ONE LINE. `truncate` here is
                  white-space:nowrap + overflow:hidden + ellipsis on the whole
                  subtitle, and the spans inside are plain inline text.

                  This was `flex items-baseline gap-1` with the wordmark in an
                  un-shrinkable span, and on 8 Aug 2026 a parent on a ~400px
                  Android phone got:

                      ABU DHABI HARLEQ…
                      QUINS CLUB      · PARE…
                      HUB

                  The reason is the flex line, not the widths: a flex line does
                  not wrap (`flex-wrap: nowrap`), so when the row squeezed this
                  block the only way the first span could give ground was to
                  BREAK ITS OWN TEXT — "Quins Club" / "Hub" — while the role
                  span, being `truncate`, could shrink to nothing and so
                  absorbed none of the squeeze. Inline text in a single
                  nowrap/ellipsis line cannot do that: it clips at the right
                  edge with an ellipsis, which is what the h1 above already
                  does and what a masthead is supposed to do.

                  jsdom applies no CSS and cannot see a wrap, so no test in
                  this repo could have caught the original — same blind spot as
                  the `wide:` vs `desktop:` note at the account link below. The
                  test that exists pins the class tokens instead. */}
              <p className="truncate font-condensed text-[13px] font-semibold uppercase tracking-[1.6px] text-white/70">
                <span>Quins Club Hub</span>
                {/* Mobile-only compact role indicator (decision 6: the role
                    label has no breakpoint qualifier, and mobile is the
                    primary case for a pitch-side club app). The desktop badge
                    below covers >=820px; this covers below it, so the role is
                    never CSS-hidden at any width.

                    ⚠️ The separator lives INSIDE this span, and the span is no
                    longer `truncate`. Both follow from the line above: a gap
                    needs a flex parent, and a nested overflow:hidden inside an
                    ellipsised line would clip its own text a second time. The
                    parent's ellipsis covers it. */}
                {showRole && (
                  <span data-testid="role-label-mobile" className="desktop:hidden">
                    {' · '}
                    {currentRoleLabel}
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

            {/* MY ACCOUNT (Jay, 6 Aug 2026). Before this, the only way to
                reach your own account was to know that "More" contained it —
                the delete-account control, the calendar link and sign-out were
                all behind a nav item named after nothing in particular.

                This is a LINK to /more, not a dropdown menu. A popover needs
                outside-click, Escape, focus return and a scrim that does not
                fight the sticky masthead's z-40, and none of that earns its
                keep while the destination is a single short screen. If /more
                grows, this becomes the menu.

                The initial, not a photo: `players.photo_path` holds head shots
                of PLAYERS, and the signed-in person is usually a parent or a
                coach who has no photo anywhere in the system. */}
            <Link
              to="/more"
              data-testid="account-button"
              aria-label={firstName ? `My account, ${firstName}` : 'My account'}
              className="ml-1 flex shrink-0 items-center gap-2 rounded-pill py-1 pl-1 pr-1 text-white/90 transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 wide:pr-3"
            >
              <span
                aria-hidden="true"
                className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white/15 text-[12px] font-extrabold"
              >
                {(firstName || user?.email || '?').trim().charAt(0).toUpperCase()}
              </span>
              {/* ⚠️ `wide` (1280px), NOT `desktop` (820px). Shipped as
                  desktop: first and it TRUNCATED THE CLUB NAME to "ABU DHABI
                  HARLE…" at ~1114px — caught on production, not in jsdom,
                  which applies no CSS and so cannot see a layout overflow.

                  The masthead row is crest + club name + role pill + this +
                  ViewAsSwitcher + five nav items, and Inter is wider than the
                  Barlow Condensed it replaced. There was no slack left to
                  spend. The initial alone is still a 28px tap target, so
                  below 1280px this loses only the name. */}
              {firstName && (
                <span className="hidden max-w-[9ch] truncate font-condensed text-[13px] font-bold uppercase tracking-[0.08em] wide:inline">
                  {firstName}
                </span>
              )}
            </Link>

            {/* ⚠️ ViewAsSwitcher USED TO BE HERE, AND MUST NOT COME BACK.
                Moved to the Admin screen on 7 Aug 2026 (Jay's call).

                The masthead row cannot fit an admin's full complement at its
                max-w-[1120px] cap. Measured in the harness, admin, not
                previewing, account name showing:

                  crest 46 | role pill 75 | account 77 | View-as 84 | nav 492
                  club wordmark gets 238px, needs 257 -> "ABU DHABI HARLE..."

                The admin nav is 492px against a coach's 395 — the ADMIN item
                is most of the difference — and the wordmark is the only item
                in this row without shrink-0, so it absorbs every overflow.

                ⚠️ A WIDER SCREEN CANNOT FIX IT: the row is capped, so every
                viewport at or above ~1152px has exactly this much space.

                Two cheaper-looking fixes were measured and REJECTED because
                they only fix today's screenshot: dropping the account name
                (41px) and shrinking the wordmark to 19px both leave 0px slack
                and break again the moment an admin previews a squad with a
                long name. Removing this control leaves 77px.

                It belongs on /admin anyway: it is an admin-only tool used
                occasionally, that screen is already desktop-only, and
                ViewAsBanner below still gives one-click Exit from anywhere,
                so nobody can get stranded in a preview. */}

            {/* Admin is admin-only, and gates on the EFFECTIVE membership
                set (the same one AdminDashboard itself reads), so an admin
                previewing as a coach loses the pill along with the screen. */}
            <Nav canManageClub={isAdmin(memberships)} />
          </div>
        </header>
      </div>

      <main
        id="main-content"
        tabIndex={-1}
        className="mx-auto w-full max-w-[1120px] flex-1 px-4 pb-[calc(100px+env(safe-area-inset-bottom))] pt-4 desktop:pb-16 focus:outline-none"
      >
        {loading && <LoadingState />}
        {!loading && error && (
          <ErrorState error={error} reload={reload}>
            {/* ⚠️ The app's only sign-out control renders on /more behind the
                `ready` gate, and `ready` is false whenever this branch is. So a
                membership load that fails and keeps failing — a bad account
                state rather than a blip — left somebody with no way out of the
                account at all: "Try again" loops, and no route reaches a
                sign-out because this shell wraps every one of them. The two
                zero-membership branches below already carry a sign-out for
                exactly this reason ("someone who cannot get in must always be
                able to get out"); this branch was the gap in that rule. */}
            <SignOutControl signOut={signOut} className="mt-5" />
          </ErrorState>
        )}
        {!loading && !error && memberships.length === 0 && !askingForAccess && (
          <AddYourPlayer
            teams={teams}
            // ⚠️ THE RELOAD IS NOT OPTIONAL. register_my_player creates the
            // membership server-side; this provider holds a snapshot taken
            // before it existed, and nothing pushes the new row to it. Without
            // this the parent submits successfully and stays on the form,
            // which reads as "it didn't work" — and the obvious response is to
            // submit again, which is how somebody reaches the five-pending
            // limit without ever meaning to.
            onRegistered={reload}
            onAskForAccess={() => setAskingForAccess(true)}
          >
            <SignOutControl signOut={signOut} className="mt-5" />
          </AddYourPlayer>
        )}
        {!loading && !error && memberships.length === 0 && askingForAccess && (
          <RequestAccess userId={user?.id} email={user?.email}>
            {/* A way back. Someone who opened this by mistake, or who read it
                and realised they do have a child to register, must not have to
                sign out and in again to reach the other route. */}
            <button
              type="button"
              onClick={() => setAskingForAccess(false)}
              className="mt-4 w-full rounded-[11px] border-[1.5px] border-line bg-surface-card px-4 py-2.5 text-sm font-bold text-brand transition hover:border-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
            >
              Add a player instead
            </button>
            <SignOutControl signOut={signOut} className="mt-5" />
          </RequestAccess>
        )}
        {ready && (
          <>
            {/* Above the routed screen, never in place of it — see the note on
                PendingApprovalBanner. */}
            {pendingOnly && <PendingApprovalBanner />}
            {/* First-login display-name prompt (plan Task C). Deliberately
                inside the `ready` branch: a signed-up user with zero
                memberships already gets NoMembershipState, and a name prompt
                stacked on top of "you have no access yet" is noise. It is
                skippable and never blocks what's below it — its own Sheet is
                z-50, so it also sits above the sticky view-as banner/masthead
                wrapper (z-40) rather than fighting it. */}
            <NamePrompt />
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
