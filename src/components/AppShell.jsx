import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../lib/auth.jsx'
import useMyProfile from '../lib/useMyProfile.js'
import FloatingChatDock from './FloatingChatDock.jsx'
import useDockBadges from '../lib/useDockBadges.js'
import { useMemberships } from '../lib/memberships.jsx'
import useAutoHideOnScroll from '../lib/useAutoHideOnScroll.js'
import useSlowLoad from '../lib/useSlowLoad.js'
import { highestRole, isAdmin, isPendingOnly, isSquadStaffRole, roleLabel } from '../lib/scope.js'
import Nav from './Nav.jsx'
import NamePrompt from './NamePrompt.jsx'
import RollCall from './RollCall.jsx'
// ViewAsBanner only — the switcher itself moved to the Admin screen on
// 7 Aug 2026. See the long note at its old call site below.
import PaintDebug from './PaintDebug.jsx'
import Sidebar from './Sidebar.jsx'
import AccountMenu from './AccountMenu.jsx'
import { Badge } from './Badge.jsx'
import { ViewAsBanner } from './ViewAsSwitcher.jsx'
import crest from '../assets/crest.png'
import Button from './Button.jsx'
import InstallPrompt from './InstallPrompt.jsx'
import GetAppSheet from './AppButton.jsx'
import HelpSheet from './HelpSheet.jsx'
import ErrorBoundary from './ErrorBoundary.jsx'
import { touchLastSeenOncePerDay } from '../data/activity.js'

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

// The liquid lens's displacement map (see the <filter id="liquid-lens"> in
// AppShell below): R is the x-displacement gradient, G the y, screened into
// one image. INVERTED (bright left/top) so the glass magnifies; the uneven
// stops keep the centre calm and bend the rim.
const LENS_MAP = encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128"><defs>' +
    '<linearGradient id="r" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ff0000"/><stop offset="0.35" stop-color="#990000"/><stop offset="0.5" stop-color="#800000"/><stop offset="0.65" stop-color="#670000"/><stop offset="1" stop-color="#000000"/></linearGradient>' +
    '<linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#00ff00"/><stop offset="0.35" stop-color="#009900"/><stop offset="0.5" stop-color="#008000"/><stop offset="0.65" stop-color="#006700"/><stop offset="1" stop-color="#000000"/></linearGradient></defs>' +
    '<rect width="128" height="128" fill="url(#r)"/><rect width="128" height="128" fill="url(#g)" style="mix-blend-mode:screen"/></svg>',
)

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
          className="mb-3 rounded-[11px] bg-danger-bg px-3 py-2 text-sm font-semibold text-danger-ink"
        >
          {error}
        </p>
      )}
      {/* `full` plus a desktop override: full-width on a phone, shrink-to-fit
          from the desktop breakpoint up. */}
      <Button
        variant="secondary"
        full
        onClick={handleClick}
        disabled={pending}
        className="desktop:w-auto"
      >
        {pending ? 'Signing out…' : 'Sign out'}
      </Button>
    </div>
  )
}

function LoadingState({ slow = false, reload }) {
  return (
    <div role="status" className="flex flex-1 items-center justify-center py-20">
      <div className="text-center">
        <p className="text-sm font-semibold uppercase tracking-widest text-ink-faint">Loading…</p>
        {/* An honest word when a load is riding out a slow moment, rather than a
            spinner that looks frozen — claude/plans/2026-08-28-provider-resilience.md §3. */}
        {slow && (
          <>
            <p data-testid="slow-load" className="mt-3 text-sm text-ink-muted">
              This is taking longer than usual — hang on.
            </p>
            {reload && (
              <Button onClick={reload} className="mt-3">
                Try again
              </Button>
            )}
          </>
        )}
      </div>
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
      <h2 className="text-lg font-extrabold text-danger-ink">Couldn&apos;t load your account</h2>
      <p data-testid="error-message" className="mt-2 text-sm leading-relaxed text-danger-ink">
        {error.message || 'Something went wrong. Try again.'}
      </p>
      <Button onClick={reload} className="mt-4">
        Try again
      </Button>
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
// ⚠️ THIS COMMENT AND THE BANNER BELOW BOTH SAID "NOBODY IS EMAILED" UNTIL
// 13 Aug 2026, AND IT HAD BEEN FALSE SINCE 9 AUG. That was true when written,
// and `db/migrations/20260809_notify_pending_membership.sql` made it untrue
// four days later: a trigger on the membership row emails every coach, team
// manager and admin for that squad the moment a registration lands, via the
// `notify-approval` edge function. Confirmed ACTIVE on the live project, and
// confirmed by Jay receiving one — along with the U18 team manager — on 13 Aug.
//
// ⚠️ THE USER-FACING HALF WAS THE ACTUAL BUG. The banner told a waiting parent
// that nobody had been notified and that they should go and chase a coach. The
// coach had already been emailed. Sending people to chase a club that has
// already been told is worse than saying nothing.
//
// ⚠️ IT STILL FAILS CLOSED AND SILENTLY. The trigger needs two Vault secrets
// and a matching Edge Function secret; without them the function answers 503
// and no mail is sent, deliberately, so that a misconfiguration can never fail
// a registration. So the wording below stops short of promising delivery — the
// SCREEN is the source of truth and the email is a prompt to go and look at it,
// which is the migration's own phrasing.
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
        availability now — the rest of the squad appears once a coach or admin has
        approved you. Your squad&apos;s coaches and the club admins were emailed when
        you registered, so somebody knows you&apos;re here. If nothing has changed
        after a few days, it&apos;s worth a nudge.
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
// db/migrations/20260804_access_requests.sql — and from 8 Aug 2026
// AddYourPlayer sat in FRONT of it as the primary route (parent
// self-registration, spec claude/decisions/2026-08-08-parent-self-registration.md).
//
// ❌ THOSE TWO WERE MUTUALLY EXCLUSIVE, AND THAT WAS THE BUG. Whichever door a
// person picked decided what the club knew about them: the parent route never
// asked whether they also coach, and the staff route never asked whether they
// have children here. Jay, 16 Aug 2026: "i have coaches signing up without
// adding their kids, its chaotic right now". Since 17 Aug there is ONE route —
// RollCall — which asks both, and everything else, at the same time. Both
// components survive as SECTIONS of it.

export default function AppShell({ children }) {
  const { user, signOut } = useAuth()
  const { firstName } = useMyProfile()
  const { memberships, teams, loading, error, reload, viewAs } = useMemberships()

  // The masthead slides away with the dock on a phone — same hook, same
  // numbers, one gesture (claude/plans/2026-08-24-topbar-autohide-liquid-glass.md).
  // ⚠️ DISABLED WHILE PREVIEWING: the View-as banner lives in the masthead's
  // sticky wrapper and is contractually persistent and unmissable — an admin
  // forgetting they are in a preview is the failure it exists to prevent.
  const mastheadHidden = useAutoHideOnScroll({ disabled: Boolean(viewAs) })

  // "Last active" for admins: one fire-and-forget stamp per day
  // (claude/plans/2026-08-26-last-active-and-presence-dots.md). Nothing on
  // screen depends on it, so a failure changes nothing visible.
  useEffect(() => {
    if (user) touchLastSeenOncePerDay()
  }, [user])
  const location = useLocation()
  // ❌ `askingForAccess` IS GONE — 17 Aug 2026. It held which of TWO mutually
  // exclusive zero-membership routes was showing, and that fork is the bug the
  // account-creation plan opens with: the branch a person picked in their first
  // ten seconds decided what the club knew about them from then on, and neither
  // side ever asked about the other. RollCall asks once and takes every answer
  // that is true. Still state and still not a route, for the reason this note
  // gave before: it is a dead end by nature, and a URL for it would be a page
  // somebody could bookmark and return to after they had access.

  // The "Report a problem" sheet. State lives HERE, not in HelpSheet, because
  // the trigger (AccountMenu, in the masthead) and the sheet (below <Nav>) are
  // different subtrees — this is the join. The floating `?` that used to own
  // this state is gone: claude/plans/2026-08-24-help-into-account-menu.md.
  const [helpOpen, setHelpOpen] = useState(false)
  // The "Get the app" install sheet — same join, same reason: its trigger is
  // an account-menu row and the menu panel unmounts on close.
  const [getAppOpen, setGetAppOpen] = useState(false)

  const isMoreRoute = location.pathname === '/more'
  // WhatsApp-style chrome-free conversations (Jay, 25 Aug 2026: "lets try
  // the no bottom menu inside a conversation"). Inside a THREAD the phone
  // shows no tab bar and no masthead island — the chat header's ← and the
  // system back gesture are the way out — so the composer can sit on the
  // bottom edge instead of floating 74px above it. The chat LIST and
  // /chat/starred keep the chrome; on desktop the sidebar stays but the
  // top-right island also leaves a thread since 26 Aug 2026 — it sat exactly
  // on the pinned ChatHeader's ⋯ menu (see the masthead wrapper). View-as
  // keeps everything: the banner is the way OUT of the preview, and an
  // admin forgetting they are previewing is the failure it exists to
  // prevent — same contract as the auto-hide's disabled flag above.
  const conversationScreen =
    !viewAs &&
    (/^\/chat\/dm\/./.test(location.pathname) ||
      /^\/squad\/[^/]+\/chat$/.test(location.pathname) ||
      (/^\/chat\/[^/]+$/.test(location.pathname) &&
        !['dm', 'starred'].includes(location.pathname.split('/')[2])))
  const ready = !loading && !error && memberships.length > 0
  // After a few seconds the load gate admits it is slow and offers a retry —
  // claude/plans/2026-08-28-provider-resilience.md §3.
  const slowLoading = useSlowLoad(loading)
  // ⚠️ DO NOT gate this on `viewAs` to win masthead space. Tried, reverted
  // (7 Aug 2026). tests/view-as.test.jsx reads this pill to prove the
  // EFFECTIVE membership set really is the previewed one — the anti-soft-lock
  // check — and the View-as banner cannot stand in for it, because the banner
  // renders from the `viewAs` selection itself and would still say "Parent"
  // if the effective set had not actually changed. Hiding the pill during a
  // preview deletes the only observable that distinguishes those two.
  // The truncation it was meant to fix is handled in ViewAsSwitcher instead.
  const showRole = !loading && !error
  // The dock's status dots — see src/lib/useDockBadges.js. Off until the
  // membership set is known, so a pending parent is never shown a dot for a
  // chat they cannot open.
  const dockBadges = useDockBadges({ userId: user?.id ?? null, admin: isAdmin(memberships), enabled: ready })
  const currentRoleLabel = roleLabel(memberships)
  // The KEY, for the Badge tone — the same design-system role tag the
  // Accounts screen uses (claude/specs/design-system.md §4.20). Until 23 Aug
  // 2026 the masthead drew its own translucent red ring for every role, which
  // matched nothing else in the app.
  const currentRole = highestRole(memberships)
  // Reads the EFFECTIVE membership set, like every other gate in this file, so
  // an admin previewing a squad is never told they are waiting for approval.
  // (isPendingOnly returns false for a synthetic preview row anyway — see its
  // note in scope.js — but gating on the same set as everything else means
  // that safety net is never the only thing holding it up.)
  const pendingOnly = ready && isPendingOnly(memberships)
  // The old admin-OR-coach `canManage` boolean is gone with /overview
  // (admin-dashboard plan, 2026-08-05). There is one management destination
  // now — /admin — and it is admin-only, so the nav gate is just isAdmin().

  // Squad staff (and admins, who can open every squad) get the Squad Hub
  // entry in the desktop sidebar; parents and players have nothing behind it.
  const showSquadHub =
    isAdmin(memberships) ||
    (memberships ?? []).some((m) => isSquadStaffRole(m.role) && m.team_id)

  return (
    // desktop:pl-64 clears the fixed 256px sidebar (phase 2 of the 2.0
    // retheme). Padding on this root moves header, main and tab bar together;
    // the sidebar itself is `fixed`, so the padding cannot double-shift it.
    <div className="flex min-h-app flex-col bg-surface text-ink desktop:pl-64">
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

      {/* AFTER the skip link on purpose — the skip link must stay the first
          focusable element on every screen (the a11y test enforces it), and
          the sidebar is a fixed element whose DOM position does not affect
          its paint. */}
      <Sidebar showSquadHub={showSquadHub} showAdmin={isAdmin(memberships)} />
      {/* Diagnostic overlay, flag-gated — see its header. Mounted in the
          shell so it renders on EVERY screen once armed. */}
      <PaintDebug />

      {/* The liquid-lens filter the glass bars sample their backdrop through
          (src/index.css, the clear-glass block). It must exist in the DOM
          for `backdrop-filter: url(#liquid-lens)` to resolve, and the shell
          is the one component under every screen. Chromium-only by design:
          Safari cannot take url() in backdrop-filter, drops that
          declaration, and keeps the plain blur/saturate declared before it
          — iPhones get the undistorted glass, silently and correctly.

          ⚠️ A LENS, NOT NOISE — Jay, on the first (turbulence) version:
          "the distortion makes what's behind it smaller, but ios makes it
          bigger and bends it … like looking through a prism almost". So:
          the displacement map is a smooth gradient pair (R drives x, G
          drives y) whose slope is shallow mid-pane and steep at the edges
          — mild magnification in the middle, hard bend at the rim — and
          the map is INVERTED (bright at the left/top) so edges sample
          toward the centre, which is what magnifies. The prism half is the
          three displacement passes at slightly different strengths, one
          per colour channel, screened back together: colours split a few
          pixels exactly where the bend is strongest. Tuned live in the
          harness: 52/40/28 was rainbow soup; 32/30/28 read as barely-there, then Jay asked for more twice, saw 52/36/20 on the right preview, and called it too much then "dial back the color also": 32/30/28 with saturation at 1.45 is the approved setting — with the map centred, even this near-zero split stays visible, which it did not before the alignment fix. ⚠️ The feImage MUST cover the full -10%..120% filter region: pinned to the element box, the map's neutral line sat at the top edge and the lens only worked at the bottom (Jay's scroll observation, and he was right). The
          map is blurred (stdDeviation 2) before use — unsmoothed, its
          raster steps showed as confetti speckles along the top edge. */}
      <svg width="0" height="0" aria-hidden="true" className="absolute">
        <filter id="liquid-lens" x="-10%" y="-10%" width="120%" height="120%" colorInterpolationFilters="sRGB">
          <feImage
            href={`data:image/svg+xml,${LENS_MAP}`}
            x="-10%" y="-10%" width="120%" height="120%"
            preserveAspectRatio="none"
            result="rawmap"
          />
          <feGaussianBlur in="rawmap" stdDeviation="2" result="map" />
          <feDisplacementMap in="SourceGraphic" in2="map" scale="32" xChannelSelector="R" yChannelSelector="G" result="dR" />
          <feDisplacementMap in="SourceGraphic" in2="map" scale="30" xChannelSelector="R" yChannelSelector="G" result="dG" />
          <feDisplacementMap in="SourceGraphic" in2="map" scale="28" xChannelSelector="R" yChannelSelector="G" result="dB" />
          <feColorMatrix in="dR" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="cR" />
          <feColorMatrix in="dG" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="cG" />
          <feColorMatrix in="dB" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="cB" />
          <feBlend in="cR" in2="cG" mode="screen" result="rg" />
          <feBlend in="rg" in2="cB" mode="screen" result="rgb" />
          {/* The lens replaces the WHOLE backdrop-filter chain in Chromium,
              so the glass's frost and saturation are re-supplied here. */}
          <feGaussianBlur in="rgb" stdDeviation="2" />
          <feColorMatrix type="saturate" values="1.45" />
        </filter>
      </svg>

      {/* Banner + masthead stick together as ONE unit. The banner has to sit
          above the header and stay visible (spec §1: persistent, unmissable),
          but two separately-`sticky top-0` siblings would both pin to y=0 and
          the higher-z banner would paint over the masthead as soon as the
          page scrolled. Hoisting the sticky positioning to a shared wrapper
          keeps them stacked in document order at every scroll position, and
          costs nothing when no preview is active (the banner renders null).
          The Sheet's own scrim is z-50, so it still covers this. */}
      {/* ⚠️ pt-[env(safe-area-inset-top)] + bg-chrome — THE iPHONE STATUS
          BAR FIX (Jay, 21 Aug 2026: "the top bar is up under the time,
          battery, etc, so nothing up there can be clicked"). index.html
          sets viewport-fit=cover, so an INSTALLED app draws underneath the
          status bar; every safe-area inset in this codebase handled the
          BOTTOM (tab bar, sheets, FAB) and nothing ever padded the top.
          The padding lives on this sticky wrapper so the ViewAs banner and
          the masthead both clear the clock, and the wrapper carries the
          chrome colour so the padded strip reads as the masthead extending
          behind the status bar, not a black gap. Desktop and un-installed
          browsers get env() = 0 and nothing changes. */}
      {/* `glass-chrome`, not `bg-chrome`, since 23 Aug 2026 — the iOS bar
          material, see src/index.css. The wrapper carries it (not the
          <header>) so the status-bar strip above and the View-as banner are
          the same sheet of glass as the masthead. */}
      {/* ══ THE TOP IS AN ISLAND NOW, LIKE THE DOCK — Jay, 23 Aug 2026: "can we
          do a similar style for the top?" The sticky wrapper is TRANSPARENT
          and only positions; the masthead <header> inside it is the glass
          island, inset from the edges with rounded corners, a highlight edge
          and a shadow (`.glass-island` in src/index.css), so content scrolls
          visibly beneath AND around it.

          ⚠️ THE STATUS-BAR STRIP IS ITS OWN ELEMENT. The iPhone fix of 21 Aug
          padded this wrapper by env(safe-area-inset-top) and painted it chrome
          so the clock sat on something dark. With a transparent wrapper that
          paint is gone, so the strip below — fixed, exactly the inset tall,
          dark glass — does the job instead; on desktop and un-installed
          browsers the inset is 0 and it renders as nothing. */}
      <div
        aria-hidden="true"
        className="glass-chrome pointer-events-none fixed inset-x-0 top-0 z-40 h-[env(safe-area-inset-top)]"
      />
      {/* ⚠️ ON DESKTOP THE ISLAND SHRINK-WRAPS TO THE TOP-RIGHT. The sidebar
          carries the crest and the name there, so a full-width island held
          only a badge, the App link and an initial on the right — "something
          is missing from that top menu bar" (Jay, 23 Aug 2026). Nothing was
          missing; the bar was too big for what it holds. */}
      {/* ⚠️ pointer-events-none ON THE WRAPPER, auto ON ITS CONTENT (24 Aug
          2026). The wrapper is a TRANSPARENT full-width sticky band at z-40;
          anything sticky beneath it (a thread's ChatHeader pins at top-0,
          z-10) slides UNDER the band, and the invisible band ate its clicks —
          "back button when in a chat doesn't work". The banner and the
          masthead island re-enable pointer events on themselves. */}
      {/* ⚠️ THE HIDE IS PHONE-ONLY BY CLASS, NOT BY LOGIC. The hook always
          runs; `desktop:translate-y-0 desktop:opacity-100` neutralises the
          hidden state at >=820px, where the island is a small top-right
          element on a screen with no vertical shortage — and where hiding it
          would hide the account menu. data-hidden is what the tests read,
          jsdom seeing no CSS. */}
      <div
        data-testid="masthead-wrapper"
        data-hidden={mastheadHidden ? 'true' : undefined}
        className={[
          'pointer-events-none sticky top-0 z-40 px-3 pb-2 pt-[calc(env(safe-area-inset-top)+8px)] desktop:px-4',
          // Chrome-free conversations: the island leaves the phone AND the
          // desktop. Until 26 Aug 2026 this restored it on desktop ("a
          // top-right island that never crosses a thread") — measured false
          // that day: the thread's ChatHeader pins at top-0 z-10, slides
          // under the z-40 island, and the island sat exactly on the ⋯ menu
          // (Jay: "scrolls up and out of view"). Inside a thread the ← and
          // the sidebar remain; the account menu is one tap back on the
          // list. The view-as case never reaches here — conversationScreen
          // is false while previewing, so the banner never hides.
          conversationScreen ? 'hidden' : 'desktop:flex desktop:flex-col desktop:items-end',
          'transition-[transform,opacity] duration-300 ease-out motion-reduce:transition-none',
          mastheadHidden
            ? '-translate-y-[calc(100%+24px)] opacity-0 desktop:translate-y-0 desktop:opacity-100'
            : 'translate-y-0 opacity-100',
        ].join(' ')}
      >
        <div className="pointer-events-auto w-full">
          <ViewAsBanner />
        </div>

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
        {/* text-ink, not text-white, since the clear-glass pass (24 Aug 2026):
            the island is transparent, so its content reads in the theme's ink
            — near-black over a light page, near-white in dark mode. Elements
            with their own opaque fills (the initial's disc, the badges, the
            dock's active pill) keep their own explicit colors. */}
        <header className="glass-island pointer-events-auto overflow-hidden rounded-[22px] text-ink desktop:w-auto">
          <div className="brand-rule" />
          <div className="harlequin relative mx-auto flex max-w-[1120px] items-center gap-2.5 overflow-hidden px-3 py-2.5 desktop:mx-0 desktop:max-w-none wide:max-w-none">
            {/* crest.png is 370x400 (portrait) — object-contain keeps its native
                aspect ratio inside the 46x46 badge box (matching the
                prototype's background:contain treatment) instead of the
                default object-fit:fill, which stretched it to fill the square
                and visually flattened the shield's pointed base. */}
            {/* Phase 2: on desktop the SIDEBAR carries the crest and the
                app's name, so the masthead becomes a utility bar and hides
                both. Mobile is untouched. */}
            {/* ⚠️ A LINK HOME, AND A SCROLL TO THE TOP — Jay, 23 Aug 2026:
                "shouldn't clicking on the quins logo always take you to the
                top of the screen?". Two cases: from another screen it is a
                plain link to /; from Home itself a Link to the current route
                does nothing visible, so it scrolls the window to the top
                instead. One handler does both — the scroll is harmless on the
                navigation case. */}
            <Link
              to="/"
              aria-label="Abu Dhabi Harlequins — back to the top"
              data-testid="crest-home"
              onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
              className="shrink-0 rounded-[10px] outline-none focus-visible:ring-2 focus-visible:ring-white/70 desktop:hidden"
            >
              <img
                src={crest}
                alt="Abu Dhabi Harlequins crest"
                className="h-[36px] w-[36px] object-contain drop-shadow-[0_1px_3px_rgba(0,0,0,0.35)]"
              />
            </Link>
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
            <div className="relative min-w-0 overflow-hidden desktop:hidden">
              {/* ⚠️ PAINTED ONLY WHERE IT FITS — `sr-only` until `wide`.
                  FIXED 10 Aug 2026. The note below records that this
                  truncated to "ABU DHABI HARLE…" at ~1114px. It was worse
                  than that: at the `desktop` breakpoint itself (820px, where
                  the top nav replaces the bottom tab bar) it rendered "ABU…",
                  on every screen, for every role.

                  The cause is structural rather than a width being slightly
                  wrong. Every other item in this row is shrink-0 — crest,
                  role pill, account, five nav items — so the wordmark is the
                  only thing that can give, and it gives everything. Measured
                  at 840px: the row needs ~690px before the wordmark starts,
                  leaving ~150px for something that wants 257. There is no
                  width setting that fixes that; the row is simply over-full
                  between 820 and 1280.

                  So the club name is shown at `wide` and hidden below it,
                  where "QUINS CLUB HUB" on the line beneath carries the
                  identity instead — that line is 13px condensed and fits.
                  ⚠️ `sr-only`, NOT `hidden`: the page keeps exactly one h1 at
                  every width, so the heading order a screen reader walks does
                  not change with the viewport.

                  ⚠️ REJECTED: shortening the name to "Harlequins" or "ADH
                  Quins" below `wide`. Both invent a wordmark the club does
                  not use, and this file is not the place to coin one. */}
              <h1 className="sr-only truncate font-display text-[19px] uppercase leading-none tracking-[0.02em] wide:not-sr-only wide:block desktop:text-[21px]">
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
              <p className="truncate font-condensed text-[13px] font-semibold uppercase tracking-[1.2px] text-ink/80">
                Quins Club Hub
              </p>
              {/* ⚠️ THE ROLE IS ON ITS OWN LINE NOW, 23 Aug 2026. It used to
                  be " · Admin" inside the wordmark line above, and on a phone
                  the ellipsis ate it — "QUINS CLUB HUB · …" in Jay's
                  screenshot — because the wordmark and the role were sharing
                  one nowrap line with a crest, an initial and two icon
                  buttons. The two no longer share a line: the wordmark gets
                  the full width of this block and the role sits under it,
                  in the same pill the desktop row uses.

                  Mobile-only (decision 6: the role label has no breakpoint
                  qualifier, and mobile is the primary case for a pitch-side
                  club app). The desktop badge below covers >=820px; this
                  covers below it, so the role is never CSS-hidden at any
                  width. `truncate` so a long role still cannot widen the
                  block — the worst case is an ellipsised ROLE, never an
                  ellipsised wordmark. */}
              {showRole && (
                <Badge
                  tone={currentRole}
                  data-testid="role-label-mobile"
                  className="mt-1 max-w-full truncate desktop:hidden"
                >
                  {currentRoleLabel}
                </Badge>
              )}
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
              <Badge
                tone={currentRole}
                data-testid="role-label-desktop"
                className="hidden shrink-0 desktop:inline-flex"
              >
                {currentRoleLabel}
              </Badge>
            )}

            {/* The "App" pill lived here 12–25 Aug 2026 and was the last
                fixed-width item left in the row. On Jay's zoomed Samsung
                (~320 CSS px) it squeezed the wordmark to "QUINS CLUB H…" and
                he chose the move over compacting it — the install route is
                now "Get the app" in the account menu (GetAppMenuItem, still
                AppButton.jsx), and its sheet is GetAppSheet below, beside
                HelpSheet. The rule two comments down finally applies to the
                control that predated it. */}

            {/* THE ACCOUNT MENU (Jay, 23 Aug 2026): the person's initial, and
                behind it My account, View as, Dark mode and Sign out.

                ══ WHAT THIS REPLACED, AND WHY THE ROW STOPPED BREAKING ════════

                Until 23 Aug this row held, after the role pill: the App button,
                an account LINK (initial + first name at `wide`), the theme
                toggle, and the View-as eye button — each `shrink-0`, each
                measured into a budget the 12 Aug probe put at ~66px, and each
                re-measured whenever the next one arrived. The wordmark, the
                only item without `shrink-0`, absorbed every overflow: on a
                phone it read "QUINS CLUB HUB · …" with the role eaten (Jay's
                screenshot), and on desktop it had truncated to "ABU DHABI
                HARLE…" more than once. Three of those four controls are now
                inside the menu, so the row carries ONE 36px trigger after the
                pill and the budget stops mattering.

                ⚠️ THE NEXT CONTROL GOES IN AccountMenu.jsx, NOT HERE. That is
                the whole point of it.

                The initial, not a photo: `players.photo_path` holds head shots
                of PLAYERS, and the signed-in person is usually a parent or a
                coach who has no photo anywhere in the system. The link to /more
                that this used to be is now the menu's first item. */}
            <AccountMenu
              firstName={firstName}
              email={user?.email}
              roleLabel={showRole ? currentRoleLabel : null}
              signOut={signOut}
              onReportProblem={() => setHelpOpen(true)}
              onGetApp={() => setGetAppOpen(true)}
            />

          </div>
        </header>
      </div>

      {/* Chrome-free conversations: the 108px band exists to clear the tab
          bar, and with the bar gone it would be a dead strip pinned under
          the composer at full scroll. */}
      <main
        id="main-content"
        tabIndex={-1}
        // ⚠️ CONVERSATION SCREENS ARE A FLEX COLUMN so the thread can push its
        // composer to the BOTTOM of main's slack. Without this, a chat with
        // three messages leaves the shell's min-h-app surplus BELOW the
        // composer — and when the phone keyboard opens, the pin hook scrolls
        // to the document's true bottom, which is that empty surplus: Jay's
        // 25 Aug screenshots show the composer marooned mid-screen over a
        // void. Bottom-anchoring the thread means "document bottom" and "the
        // composer" are the same place, however few messages there are.
        // ⚠️ desktop:pb-16 LIVES IN THE NON-CONVERSATION BRANCH, NOT THE SHARED
        // TAIL (26 Aug 2026). Applied to a thread it opened 64px of slack
        // under the sticky composer, so the composer pinned to the viewport
        // edge mid-scroll and then came to rest 64px HIGHER at full scroll —
        // Jay: the input box "moves up and down depending on where i scroll".
        // No pb AT ALL on a conversation: the composer carries its own bottom
        // padding (safe-area included), and any padding under it here is the
        // same jitter at a smaller size — pinned flush mid-scroll, resting
        // N px higher at the end.
        className={`mx-auto w-full max-w-[1120px] flex-1 px-4 ${conversationScreen ? 'flex flex-col' : 'pb-[calc(108px+env(safe-area-inset-bottom))] desktop:pb-16'} pt-4 desktop:mx-0 desktop:max-w-none desktop:px-6 wide:max-w-none focus:outline-none`}
      >
        {/* ⚠️ ABOVE THE loading/error/ready SPLIT, DELIBERATELY. Installing is
            not gated on having a membership: a parent who has just signed up
            and is waiting a day or two for a coach to approve them is exactly
            the person who should put this on their home screen, and inside the
            `ready` branch they would never see it. It renders nothing at all
            unless there is an install route to offer — see InstallPrompt. */}
        <InstallPrompt />
        {loading && <LoadingState slow={slowLoading} reload={reload} />}
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
        {!loading && !error && memberships.length === 0 && (
          <RollCall
            teams={teams}
            userId={user?.id}
            email={user?.email}
            // ⚠️ THE RELOAD IS NOT OPTIONAL, AND IT BELONGS TO THE ROLL-CALL
            // RATHER THAN TO ANY ONE SECTION OF IT. register_my_player and
            // request_staff_role create rows server-side; this provider holds a
            // snapshot taken before they existed, and nothing pushes the new row
            // to it. Without a reload the person submits successfully and stays
            // on the form, which reads as "it didn't work" — and the obvious
            // response is to submit again, which is how somebody reaches the
            // five-pending limit without ever meaning to.
            //
            // ⚠️ AND WIRING IT TO A SECTION IS THE OTHER FAILURE, WHICH IS
            // SILENT. This whole branch is gated on `memberships.length === 0`,
            // so reloading after the FIRST answer unmounts the screen with every
            // remaining question still unasked. RollCall calls this once, at the
            // end. See rule 1 in its header.
            onDone={reload}
          >
            <SignOutControl signOut={signOut} className="mt-5" />
          </RollCall>
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
            {/* ⚠️ THE BOUNDARY GOES HERE, AROUND THE ROUTED SCREEN ONLY, AND
                THE PLACEMENT IS THE WHOLE POINT. Everything above it — the
                masthead, the nav, the sign-out control — stays rendered when a
                screen throws, so a parent whose Roster crashes can still reach
                Schedule. Wrapping the whole shell instead would take the
                navigation down with the screen and leave them stranded.

                ⚠️ KEYED ON pathname, AND WITHOUT THIS THE FIX IS HALF A BUG.
                A boundary holds its error state until something clears it, so
                a crashed Roster would STAY on the fallback while the person
                taps Schedule — nav working, content permanently broken, which
                is worse than the blank page because it looks deliberate.
                Changing the key remounts the boundary on every navigation.

                ⚠️ There is a SECOND boundary in src/App.jsx, outside all of
                this. It is not redundant: AppShell itself, MembershipProvider
                and RequireAuth can throw, and none of that is inside this one. */}
            <ErrorBoundary key={location.pathname}>{children}</ErrorBoundary>
            {isMoreRoute && (
              <div className="mt-6 border-t border-line pt-6">
                <SignOutControl signOut={signOut} />
              </div>
            )}
          </>
        )}
      </main>

      {/* The mobile tab bar (desktop nav is the Sidebar since phase 2; the old
          Admin pill gate rode there with it, still reading the EFFECTIVE
          membership set so an admin previewing as a coach loses the item along
          with the screen).

          ══ ⚠️ OUTSIDE THE MASTHEAD, AND THAT IS NOT TIDINESS ═══════════════
          It rendered INSIDE the masthead row until 23 Aug 2026, and that was
          fine while the masthead was opaque. The moment the sticky wrapper
          took `backdrop-filter` (#330, the glass), the tab bar — `position:
          fixed; bottom: 12px` — appeared AT THE TOP of every phone, iOS and
          Android, sitting on the masthead. `backdrop-filter` on an ancestor
          makes that ancestor the CONTAINING BLOCK for fixed descendants, the
          same way `transform`, `filter` and `perspective` do (the caveat
          ViewAsSwitcher and Sheet already carry names three of the four).
          So "12px from the bottom" meant 12px from the bottom of the
          masthead.

          ⚠️ AND THE HARNESS SHOWED IT FIRST, AND WAS DISBELIEVED. The dock
          screenshot had the bar at the top and it was written off as a
          harness quirk; Jay's phones said otherwise an hour later. A fixed
          element drawn somewhere surprising is a containing-block question
          before it is a renderer question.

          Anything `fixed` must live OUTSIDE `.glass-chrome`. The help button
          and the sheets already do; the account menu is portalled to <body>. */}
      {/* Chrome-free conversations: no tab bar inside a thread. Nav is the
          phone dock only (desktop:hidden throughout), so skipping it costs
          desktop nothing — the Sidebar above is desktop's navigation. */}
      {!conversationScreen && <Nav showSquadHub={showSquadHub} badges={dockBadges} />}

      {/* The floating chat dock — desktop only, never on /chat. Lives here
          (not per screen) so an open panel and its half-written draft
          survive navigation. claude/plans/2026-08-24-floating-chat-dock.md */}
      {ready && <FloatingChatDock badge={dockBadges.chat} />}

      {/* ⚠️ OUTSIDE <main>, AND OUTSIDE THE loading/error/ready SPLIT — for the
          same reason InstallPrompt sits above that split. The moments this is
          most wanted are the broken ones: a screen that failed to load is
          precisely when somebody wants to say so, and inside the `ready`
          branch it would vanish exactly then. The trigger is the account
          menu's "Report a problem" item, which also lives outside that split. */}
      <HelpSheet open={helpOpen} onClose={() => setHelpOpen(false)} />
      <GetAppSheet open={getAppOpen} onClose={() => setGetAppOpen(false)} />
    </div>
  )
}
