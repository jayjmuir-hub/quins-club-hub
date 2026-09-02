import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import RequireAuth from './components/RequireAuth.jsx'
import { MembershipProvider } from './lib/memberships.jsx'
import { useNotificationRouting } from './lib/notificationRouting.js'
import useScreenChrome from './lib/useScreenChrome.js'
import AppShell from './components/AppShell.jsx'
import Dashboard from './screens/Dashboard.jsx'
import Schedule from './screens/Schedule.jsx'
import Roster from './screens/Roster.jsx'
import More from './screens/More.jsx'
import Notices from './screens/Notices.jsx'
import Documents from './screens/Documents.jsx'
import Chat from './screens/Chat.jsx'
import ChatList from './screens/ChatList.jsx'
import StarredMessages from './screens/StarredMessages.jsx'
import DirectMessages from './screens/DirectMessages.jsx'
import Welfare from './screens/Welfare.jsx'
import WelfareReports from './screens/WelfareReports.jsx'
import MyReports from './screens/MyReports.jsx'
import AdminDashboard from './screens/AdminDashboard.jsx'
import PortalChooser from './screens/PortalChooser.jsx'
import SocialWhatsOn from './screens/SocialWhatsOn.jsx'
import SocialIdeas from './screens/SocialIdeas.jsx'
import TrainingLibrary from './screens/TrainingLibrary.jsx'
import TrainingTemplates from './screens/TrainingTemplates.jsx'
import TrainingPublish from './screens/TrainingPublish.jsx'
import AdminClub from './screens/AdminClub.jsx'
import AdminNeedsAttention from './screens/AdminNeedsAttention.jsx'
import AdminIcons from './screens/AdminIcons.jsx'
import AdminRightsLog from './screens/AdminRightsLog.jsx'
import AdminOfficers from './screens/AdminOfficers.jsx'
import AdminStaff from './screens/AdminStaff.jsx'
import Accounts from './screens/Accounts.jsx'
import Pitches from './screens/Pitches.jsx'
import Allocation from './screens/Allocation.jsx'
import SquadHub from './screens/SquadHub.jsx'
import MatchRosterPicker from './screens/MatchRosterPicker.jsx'
import SquadTraining from './screens/SquadTraining.jsx'
import PitchGlance from './screens/PitchGlance.jsx'
import YouthDashboard from './screens/YouthDashboard.jsx'
import MatchSheet from './screens/MatchSheet.jsx'
import Lineup from './screens/Lineup.jsx'
import GameTime from './screens/GameTime.jsx'
import AcceptInvite from './screens/AcceptInvite.jsx'
import Privacy from './screens/Privacy.jsx'
import DeleteAccount from './screens/DeleteAccount.jsx'
import ResetPassword from './screens/ResetPassword.jsx'
import AuthConfirm from './screens/AuthConfirm.jsx'

// Routing (admin-dashboard plan, 2026-08-05).
//
// ⚠️ THERE ARE NOW TWO GROUPS: PUBLIC AND SIGNED-IN. Everything used to sit
// inside <RequireAuth>, which meant the app had no page a signed-out person
// could read at all. That became a blocker on 6 Aug 2026: Google Play requires
// a privacy policy and an account-deletion route that are reachable WITHOUT an
// account, because a Play reviewer opens both cold, and so does a parent who
// cannot remember which email they signed up with.
//
// The signed-in group is wrapped by a PATHLESS LAYOUT ROUTE (`<Route
// element={<Authed/>}>`). That is the react-router idiom for "apply this
// wrapper to these children", and it is used here specifically because it
// leaves every existing path string untouched — nesting a second <Routes>
// under a `path="*"` would have made all of them relative and rewritten the
// lot. The catch-all redirect stays INSIDE the group, so an unknown URL still
// lands a signed-out visitor on the login screen exactly as before.
//
// "/settings" (was "/more" until 29 Aug 2026) renders the settings page — for
// EVERY role, not just admins. It used to render Admin.jsx, which meant a
// parent, player or coach got a "not authorised" card. ⚠️ It must stay a real
// route: AppShell renders the app's only in-page sign-out control on this exact
// path, so redirecting it into /admin would leave every non-admin unable to
// sign out. Bare /more redirects here so old links and bookmarks keep working.
//
// "/admin" is the admin-only back-end dashboard, with its two tabs mounted
// as CHILD ROUTES so each is linkable and survives a refresh. Bare /admin
// redirects to the Accounts tab. The old "/accounts" URL redirects there too
// rather than 404ing through the catch-all — it was bookmarked.
//
// "/overview" is gone (its one working section moved to /admin/club) and now
// falls through to the "*" -> "/" redirect below.
//
// /accept-invite/:token is deliberately NOT one of AppShell's wrapped routes
// below. AppShell only renders its `children` once memberships.length > 0
// (its `ready` gate) — a brand-new invitee who just signed in via magic link
// has zero memberships until they accept, so nesting this route inside a
// single shared <AppShell> the way the other routes are would make it
// permanently unreachable: AppShell would show its no-membership state
// forever and never render the Routes block at all, regardless of the URL.
// Wrapping each of the other routes in its own <AppShell> individually
// (rather than one <AppShell> around a single nested <Routes>) is what makes
// it possible for this one route to opt out of that gate entirely, without
// teaching AppShell itself about a specific path.

// The signed-in half of the app, as a layout. RequireAuth renders Login in
// place when there is no session, preserving the URL.
function Authed() {
  return (
    <RequireAuth>
      <MembershipProvider>
        <Outlet />
      </MembershipProvider>
    </RequireAuth>
  )
}

// ⚠️ THE OUTERMOST BOUNDARY, AND IT IS NOT THE SAME ONE AppShell HAS.
//
// AppShell's boundary wraps the routed SCREEN, so the nav survives a screen
// crash. This one wraps everything, because the things AppShell's cannot see
// are exactly the things whose failure is total: AppShell itself, RequireAuth,
// MembershipProvider, and the four PUBLIC routes below — /privacy,
// /delete-account, /reset-password and /auth/confirm — none of which render
// inside an AppShell at all.
//
// ⚠️ TWO OF THOSE PUBLIC ROUTES ARE LINKED FROM THE PLAY STORE LISTING and are
// opened cold by a reviewer. A white page there is a rejected app, not an
// inconvenience.
//
// ⚠️ IT IS INSIDE BrowserRouter, DELIBERATELY. Outside it, the fallback could
// not offer anything router-aware later, and a crash in BrowserRouter's own
// setup is not a thing this can catch anyway.
//
// ⚠️ NOT keyed on pathname here, unlike AppShell's. If the shell or a provider
// has thrown, navigating is not a recovery — the fallback's own "Try again"
// and "Clear saved data" are, and remounting on every route change would hide
// a persistent failure behind a flicker.
// Nothing to render — this exists only so the hook sits inside the router.
function NotificationRouting() {
  useNotificationRouting()
  return null
}

// Conversation screens are pinned to the BOTTOM by useStayPinnedToBottom and
// must not be scrolled to the top on arrival. The same three shapes AppShell
// treats as chrome-free; kept here as paths only, because this runs above
// the shell and cannot see view-as state.
function pinnedToBottom(pathname) {
  return (
    /^\/chat\/dm\/./.test(pathname) ||
    /^\/squad\/[^/]+\/chat$/.test(pathname) ||
    (/^\/chat\/[^/]+$/.test(pathname) && !/^\/chat\/(starred|dm)$/.test(pathname))
  )
}

// UX review item 7 (2 Sep 2026): tab title, focus and scroll on every
// navigation — src/lib/useScreenChrome.js. Renders nothing; inside
// BrowserRouter because it reads useLocation.
function ScreenChrome() {
  useScreenChrome({ pinnedToBottom })
  return null
}

export default function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      {/* Routes the app when the service worker could not navigate the window
          itself — see src/lib/notificationRouting.js. Renders nothing; it has
          to live INSIDE BrowserRouter because it uses useNavigate. */}
      <NotificationRouting />
      <ScreenChrome />
      <ErrorBoundary>
      <Routes>
        {/* PUBLIC — no session required, and no MembershipProvider either.
            Both of these are linked from the Play Store listing and must
            render for someone who has never signed in. */}
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/delete-account" element={<DeleteAccount />} />

        {/* Where a password-reset link lands. PUBLIC on purpose, but not
            unauthenticated in practice: the emailed link carries a recovery
            session in the hash, which supabase-js consumes on load. It sits
            outside <Authed> for the same reason /accept-invite sits outside
            AppShell — a parent with no squad yet would otherwise be shown the
            request-access gate instead of the form they were sent here for. */}
        <Route path="/reset-password" element={<ResetPassword />} />

        {/* Where every emailed auth link now lands (9 Aug 2026). PUBLIC and
            genuinely unauthenticated — the whole point is that it runs BEFORE
            there is a session, redeems the token_hash, and only then decides
            where to send the person.

            ⚠️ It must sit outside <Authed>. Inside, the auth gate would bounce
            a not-yet-confirmed visitor to sign-in and the token would never be
            redeemed — which is the same class of mistake /reset-password and
            /accept-invite are both already positioned to avoid. */}
        <Route path="/auth/confirm" element={<AuthConfirm />} />

        {/* SIGNED-IN */}
        <Route element={<Authed />}>
          <Route path="/accept-invite/:token" element={<AcceptInvite />} />
          <Route path="/" element={<AppShell><Dashboard /></AppShell>} />
          <Route path="/schedule" element={<AppShell><Schedule /></AppShell>} />
          <Route path="/roster" element={<AppShell><Roster /></AppShell>} />
          <Route path="/settings" element={<AppShell><More /></AppShell>} />
          {/* Renamed /more → /settings on 29 Aug 2026 (Jay). Old links,
              bookmarks and notification deep-links keep working through this
              redirect. ⚠️ THE COMPONENT STAYS More.jsx ON PURPOSE: the changelog
              refers to `src/screens/More.jsx` by path, and docs-check fails the
              build on any documented path that no longer resolves — so the file
              keeps its name while the route and the page title are "Settings".
              The filename is internal; nobody sees it. */}
          <Route path="/more" element={<Navigate to="/settings" replace />} />

          {/* Where "somebody replied to your report" lands (19 Aug 2026).
              ⚠️ A ROUTE EXISTS AT ALL SO THE NOTIFICATION HAS A DESTINATION.
              The same list is still in the `?` sheet, which has no URL and so
              could never be deep-linked to.
              claude/plans/2026-08-19-notifications-v2.md. */}
          <Route path="/my-reports" element={<AppShell><MyReports /></AppShell>} />

          {/* THE NOTICEBOARD (Jay, 14 Aug 2026).
              ⚠️ DELIBERATELY NOT UNDER /admin, and it is the same reason that
              put /approvals and /match-sheet/:eventId outside it: the people
              who post SQUAD notices are coaches and team managers, and
              AdminDashboard gates on isAdmin() before rendering its <Outlet/>.
              Nesting this there would show every coach "not authorised" on the
              one screen written for them.
              ⚠️ NOT desktop-only either. Telling a squad where to meet on
              Friday is a thing done from a phone, at the pitch.
              The screen self-gates on who may POST; who may READ is decided by
              RLS, and the composer is offered only where the database would
              accept it. */}
          <Route path="/notices" element={<AppShell><Notices /></AppShell>} />

          {/* THE DOCUMENTS REPO (Task 6, claude/plans/2026-08-31-documents-repo.md).
              ⚠️ NOT under /admin — same reasoning as /notices directly above:
              the people who upload SQUAD documents are coaches and team
              managers, and AdminDashboard gates on isAdmin() before rendering
              its <Outlet/>. The screen self-gates on who may upload; who may
              read is decided by RLS. */}
          <Route path="/documents" element={<AppShell><Documents /></AppShell>} />

          {/* SQUAD CHAT (23 Aug 2026, phase 1) — a channel per squad.
              /chat picks (or redirects to the only squad); /chat/club is the
              club-wide channel; /squad/:teamId/chat is the SAME screen under
              the Squad Hub's sidebar section, so a coach's Chat item stays in
              the section that is lit. claude/plans/2026-08-23-squad-chat.md. */}
          <Route path="/chat" element={<AppShell><ChatList /></AppShell>} />
          {/* Direct messages (phase 3): the inbox and one thread. Before
              /chat/:teamId so "dm" is never read as a squad id. */}
          <Route path="/chat/starred" element={<AppShell><StarredMessages /></AppShell>} />
          <Route path="/chat/dm" element={<AppShell><DirectMessages /></AppShell>} />
          <Route path="/chat/dm/:conversationId" element={<AppShell><DirectMessages /></AppShell>} />
          <Route path="/chat/:teamId" element={<AppShell><Chat /></AppShell>} />
          <Route path="/squad/:teamId/chat" element={<AppShell><Chat /></AppShell>} />

          {/* THE SQUAD HUB (21 Aug 2026) — the coach/manager dashboard, one
              squad at a time. ⚠️ NOT under /admin, same reason as /notices:
              its audience is squad staff, and AdminDashboard's isAdmin() gate
              would turn every coach away at the door. The screen self-gates
              with canEditTeam ("not your squad", not security — RLS decides
              the data). Bare /squad lands a one-squad coach straight in
              their hub and offers everyone else the picker.
              claude/plans/2026-08-21-squad-hub.md. */}
          <Route path="/squad" element={<AppShell><SquadHub /></AppShell>} />
          <Route path="/squad/:teamId" element={<AppShell><SquadHub /></AppShell>} />
          {/* Build a Match Roster — the PICKER; the builder stays /lineup/:eventId.
              A child of the hub so the sidebar's Squad Hub section carries it and
              the squad context rides in the path (22 Aug 2026). */}
          <Route path="/squad/:teamId/match-roster" element={<AppShell><MatchRosterPicker /></AppShell>} />
          {/* Training plans, squad-level — the coach-facing read of what the
              performance director published. The per-event view stays inside
              EventDetail; this is the season-at-a-glance list (22 Aug 2026). */}
          <Route path="/squad/:teamId/training" element={<AppShell><SquadTraining /></AppShell>} />
          {/* The read-only pitch calendar for squad staff — outside /admin
              for the same reason /lineup and /game-time are: its audience is
              coaches and team managers, and AdminDashboard's isAdmin() gate
              would turn them away. The data is a redacted SECURITY DEFINER
              read (pitch_occupancy); allocation stays /admin/allocation. */}
          <Route path="/pitch-calendar" element={<AppShell><PitchGlance /></AppShell>} />

          {/* Admin-only, desktop-only. AdminDashboard gates on isAdmin()
              against the EFFECTIVE membership set and renders <Outlet/>,
              so both tabs below inherit the gate — typing
              /admin/accounts as a coach gets the same "not authorised"
              card as /admin itself. */}
          <Route path="/admin" element={<AppShell><AdminDashboard /></AppShell>}>
            {/* ⚠️ /admin IS THE CHOOSER, and until 12 Aug 2026 it redirected
                straight to Accounts. Every URL below is unchanged — only bare
                /admin behaves differently, so nothing bookmarked breaks.
                claude/decisions/2026-08-12-admin-portals.md */}
            <Route index element={<PortalChooser />} />
            <Route path="accounts" element={<Accounts />} />
            <Route path="club" element={<AdminClub />} />
            {/* Every squad and who looks after it. ⚠️ NO ADMIN RIGHT — it sits
                in the Club Hub Admin portal, which every admin holds. It reads
                profiles the Accounts screen has always read
                (`profile read club admin`), so it needed no policy change and
                grants nobody anything new. A MEMBER-facing version does need
                one: claude/plans/2026-08-13-squad-staff-on-home.md. */}
            <Route path="staff" element={<AdminStaff />} />
            {/* Where the club is missing a birthday, a parent or a gender —
                the third surface of src/lib/completeness.js. No admin right:
                every admin is a registrar, and the screen carries no contact
                detail and no dates. */}
            <Route path="needs-attention" element={<AdminNeedsAttention />} />
            {/* Who gave whom access, and when. ⚠️ THE ONLY ADMIN ROUTE WHOSE
                AUDIENCE IS NARROWER THAN AdminDashboard's isAdmin() GATE — it
                records what admins do, so an ordinary admin must not be its
                only reader. The screen repeats the super-admin check because a
                route is linkable and somebody will paste the URL, and
                membership_audit's read policy (`private.is_super_admin()`, and
                no other) is what actually decides. */}
            <Route path="rights-log" element={<AdminRightsLog />} />
            {/* The committee list — titles WITHOUT rights (Jay: "no special
                rights with those, just titles"). Super-only via the
                rights-log pattern: the tab hides, the screen re-checks, and
                club_officers' RLS actually decides. */}
            <Route path="officers" element={<AdminOfficers />} />
            {/* Recognition emoji, super admins only — same shape as officers:
                the door hides, the screen re-checks, profile_icons' RLS
                actually decides. */}
            <Route path="icons" element={<AdminIcons />} />
            {/* Pitch setup. The `pitches` admin right decides whether the TAB
                is shown; the screen itself repeats the check, because a route
                is linkable and somebody will paste the URL. Neither is
                security — every admin can already write `pitches` — it is a
                "you were not given this job" message. */}
            <Route path="pitches" element={<Pitches />} />
            {/* The allocation grid — the WEEKLY job, so it sits ahead of the
                setup screen in the tab order. Same `pitches` right. */}
            <Route path="allocation" element={<Allocation />} />
            {/* The Club Youth Manager's list of matches and their RCM sheets.
                Same `youth` admin right, same "not your job" wording — the
                right decides which dashboard somebody is SHOWN, never what
                the database will let them do. */}
            <Route path="youth" element={<YouthDashboard />} />
            {/* Social Media Management. ⚠️ NESTED, unlike every other admin
                tab — /admin/social/ideas sits under /admin/social. That is
                why the tab row now passes `end` to NavLink; without it the
                parent tab reads as current on the child route. */}
            <Route path="social" element={<SocialWhatsOn />} />
            <Route path="social/ideas" element={<SocialIdeas />} />
            {/* Rugby Performance Director. ⚠️ NESTED like /admin/social — the
                second portal in the app that is, and the tab row's `end` on
                NavLink is what keeps "Library" from lighting up on all three.
                Each screen wraps itself in TrainingGate rather than the route
                gating them, because a route is linkable and the `training`
                right gates the SCREEN, not the data — RLS on the training
                tables is what refuses a row. */}
            {/* Welfare (phase 3) — the SCREEN is gated on the `welfare`
                right inside each screen (WelfareGate); the DATA is admin-
                readable by RLS, the 23 Aug ruling. */}
            <Route path="welfare" element={<Welfare />} />
            <Route path="welfare/reports" element={<WelfareReports />} />
            <Route path="training" element={<TrainingLibrary />} />
            <Route path="training/templates" element={<TrainingTemplates />} />
            <Route path="training/publish" element={<TrainingPublish />} />
          </Route>

          {/* ⚠️ THE MATCH SHEET EDITOR IS DELIBERATELY OUTSIDE /admin, and the
              reason is the same one that put /approvals outside it: the people
              who fill these in are COACHES AND TEAM MANAGERS, and
              AdminDashboard gates on isAdmin() before rendering its <Outlet/>.
              Nesting this under /admin would show every coach "not authorised"
              on the one screen written for them.
              The screen re-checks canEditTeam itself, because a route is
              linkable and somebody will paste the URL — and RLS on
              match_sheets is what actually decides. */}
          <Route
            path="/match-sheet/:eventId"
            element={<AppShell><MatchSheet /></AppShell>}
          />

          {/* THE TEAM SHEET (Jay, 14 Aug 2026) — picking a lineup before a
              match, and sharing it to a WhatsApp group.
              ⚠️ OUTSIDE /admin for the same reason /match-sheet and /approvals
              are: AdminDashboard gates on isAdmin() before rendering its
              <Outlet/>, and the people who pick a team are COACHES AND TEAM
              MANAGERS. Nesting it there would show every coach "not authorised"
              on the one screen written for them.
              ⚠️ NOT desktop-only either. A team is picked on a phone.
              The screen re-checks canEditTeam itself because a route is linkable
              and somebody will paste the URL — and the `lineup manage` RLS policy
              is what actually decides. */}
          <Route path="/lineup/:eventId" element={<AppShell><Lineup /></AppShell>} />

          {/* WHO HAS NOT HAD A CHANCE TO PLAY (Jay, 14 Aug 2026). Outside /admin
              for the same reason /lineup and /match-sheet are: the people who
              need it are COACHES AND TEAM MANAGERS, and AdminDashboard gates on
              isAdmin(). Coach-only is enforced by RLS on lineup_players, not by
              this route. */}
          <Route path="/game-time" element={<AppShell><GameTime /></AppShell>} />

          {/* THE COACH / TEAM MANAGER APPROVALS ROUTE (Jay, 9 Aug 2026).
              Deliberately OUTSIDE /admin, and that is not a stylistic choice:
              AdminDashboard gates on isAdmin() and renders <Outlet/>, so a
              coach opening /admin/accounts would hit the parent's
              not-authorised card and never reach Accounts at all.

              ⚠️ NOT desktop-only, unlike /admin. Approving a registration is
              a two-second decision a coach makes on a phone, and the whole
              screen is a list of cards with one button each — the reason
              /admin is desktop-only (wide, table-heavy) does not apply.

              Accounts self-gates: an admin who lands here gets their full
              accounts screen, a coach or manager gets the approvals queue,
              and anyone else gets not-authorised. One component, one gate,
              rather than a second copy of the queue that could drift. */}
          <Route path="/approvals" element={<AppShell><Accounts /></AppShell>} />

          {/* Old bookmarked URL. A plain redirect, not a duplicate mount:
              Accounts must exist in exactly one place. */}
          <Route path="/accounts" element={<Navigate to="/admin/accounts" replace />} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
      </ErrorBoundary>
    </BrowserRouter>
  )
}
