import React, { useState } from 'react'
import ReactDOM from 'react-dom/client'
import { MemoryRouter, BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import AppShell from '../src/components/AppShell.jsx'
import SquadHub from '../src/screens/SquadHub.jsx'
import MatchRosterPicker from '../src/screens/MatchRosterPicker.jsx'
import { Routes as RRoutes, Route as RRoute } from 'react-router-dom'
import NoticeBoard from '../src/components/NoticeBoard.jsx'
import { applyTheme, watchSystemTheme } from '../src/lib/theme.js'
import Login from '../src/screens/Login.jsx'
import Schedule from '../src/screens/Schedule.jsx'
import Roster from '../src/screens/Roster.jsx'
import Dashboard from '../src/screens/Dashboard.jsx'
// ⚠️ REPOINTED, NOT DELETED (7 Aug 2026). src/screens/Overview.jsx was
// removed in 2e26d35 when its content folded into the single /admin
// dashboard — and this import was not updated, so the ENTIRE harness has
// failed to boot ever since with "Failed to resolve import
// ../src/screens/Overview.jsx". Every scenario in this file, not just the two
// overview ones. That is the whole browser-verification anchor dead, silently,
// because nothing in `npm test` or `npm run build` loads harness/main.jsx.
// Found while trying to measure the masthead for Jay's truncation report.
import AdminDashboard from '../src/screens/AdminDashboard.jsx'
import PortalChooser from '../src/screens/PortalChooser.jsx'
import PlayerForm from '../src/screens/PlayerForm.jsx'
import Availability from '../src/screens/Availability.jsx'
import EventDetail from '../src/screens/EventDetail.jsx'
// ⚠️ Same rot as the line above: src/screens/Admin.jsx became AdminClub.jsx.
// Aliased back to `Admin` so the scenario bodies below don't need touching.
import Admin from '../src/screens/AdminClub.jsx'
import More from '../src/screens/More.jsx'
import Accounts from '../src/screens/Accounts.jsx'
import AcceptInvite from '../src/screens/AcceptInvite.jsx'
import MatchSheet from '../src/screens/MatchSheet.jsx'
import Allocation from '../src/screens/Allocation.jsx'
import PhotoPositioner, {
  PhotoDropZone,
  DEFAULT_FOCUS,
} from '../src/components/PhotoPositioner.jsx'
import NoticeRowScenario from './notice-row.jsx'
import { PLAYERS } from './stubs/players.js'
import { AuthProvider } from './stubs/auth.jsx'
import { MembershipProvider } from './stubs/memberships.jsx'
import '../src/index.css'

// Throwaway visual-verification harness. Renders the REAL AppShell/Nav/Login
// components (imported straight from src/) with stubbed auth + membership
// context values selected via ?scenario=<name>, so Playwright can screenshot
// real Tailwind-rendered layout without a Supabase session or any network
// access. Not part of the app build; not committed.

// "/" renders the real Dashboard as of Task 13 (see src/App.jsx).
function Home() {
  return <Dashboard />
}

const noop = async () => {}

/**
 * The photo picker, standing alone. Starts on the drop zone; choosing or
 * dropping a file moves it to the stage, exactly as the real fields will.
 *
 * ⚠️ THE OBJECT URL IS REVOKED WHEN THE FILE CHANGES. A harness is still code
 * somebody reads and copies, and leaking one per selection is the habit that
 * ends up in the real field.
 */
function PhotoPositionerScenario() {
  const [url, setUrl] = React.useState(null)
  const [focus, setFocus] = React.useState(DEFAULT_FOCUS)

  const take = (file) => {
    setUrl((old) => {
      if (old) URL.revokeObjectURL(old)
      return URL.createObjectURL(file)
    })
    setFocus(DEFAULT_FOCUS)
  }

  return (
    <div style={{ maxWidth: 390, margin: '0 auto', padding: 16 }}>
      <h2 className="mb-2 font-display text-[17px] uppercase text-ink">Your photo</h2>
      {url ? (
        <>
          <PhotoPositioner url={url} focus={focus} onFocusChange={setFocus} />
          <p className="mt-3 text-[12px] text-ink-faint">
            focus = {focus.x}% {focus.y}%
          </p>
          <button
            type="button"
            className="mt-2 text-[13px] font-semibold text-brand underline"
            onClick={() => {
              URL.revokeObjectURL(url)
              setUrl(null)
            }}
          >
            Choose a different photo
          </button>
        </>
      ) : (
        <PhotoDropZone onFile={take} />
      )}
    </div>
  )
}

// ⚠️ `id` ADDED 14 Aug 2026, AND ITS ABSENCE WAS HIDING A WHOLE BLOCK OF UI.
// useMyProfile bails when `user.id` is missing, so `profile` stayed null in
// every scenario, `needsName` was therefore always false, and
// PlayerRegistrationForm's "About you" fieldset — the fix for the nameless
// approval-queue race — COULD NOT RENDER HERE AT ALL. The `?unconfirmedName=1`
// knob in harness/stubs/members.js was equally inert for the same reason.
//
// A real session always carries an id, so this makes the fixture more like
// production rather than less. It cannot switch anything on by surprise:
// getMyProfile still returns a CONFIRMED name by default, so every existing
// scenario sees `needsName === false`, exactly as before.
function baseAuth(email) {
  return {
    session: { user: { id: 'harness-user', email } },
    user: { id: 'harness-user', email },
    loading: false,
    signInWithEmail: noop,
    signInWithGoogle: noop,
    signOut: noop,
  }
}

const COACH_EMAIL = 'coach.sam@adhq.example'
// ⚠️ INVENTED, AND IT MUST STAY INVENTED. This was a real personal inbox until
// 20 Aug 2026. The harness is not just a dev toy: `scripts/shoot-*.mjs` renders
// these screens to PNG, and those PNGs became the two parent-facing guides. A
// real address here is a real address published to the whole club. Every stub
// address in this repo uses the reserved `adhq.example` / `example.com`
// domains, and `npm run docs:check` now fails on a consumer-inbox domain
// anywhere in src/, tests/, harness/, scripts/ or db/schema/.
const JAY_EMAIL = 'jay.muir@adhq.example'

const COACH_MEMBERSHIPS = [
  { id: 'm1', status: 'active', role: 'coach', team_id: 't1', player_id: null },
  { id: 'm2', status: 'active', role: 'coach', team_id: 't2', player_id: null },
]
const CLUB_ID = '00000000-0000-0000-0000-0000000000ad'
const TEAMS = [
  { id: 't1', club_id: CLUB_ID, name: 'U12 Boys', sort_order: 4 },
  { id: 't2', club_id: CLUB_ID, name: 'U14 Boys', sort_order: 6 },
]

// Three-age-group variants, added for the independent controller-side
// verification pass. Two groups is the minimum that makes the age-group
// branch fire at all; three is what it actually looks like in the club, and
// it is what puts enough pills in the row to test the 375px overflow.
const COACH_THREE_MEMBERSHIPS = [
  { id: 'm1', status: 'active', role: 'coach', team_id: 't1', player_id: null },
  { id: 'm2', status: 'active', role: 'coach', team_id: 't2', player_id: null },
  { id: 'm3', status: 'active', role: 'coach', team_id: 't3', player_id: null },
]
const TEAMS_THREE = [...TEAMS, { id: 't3', club_id: CLUB_ID, name: 'U16 Boys', sort_order: 8 }]

function Shell({ authValue, membershipValue, route = '/', children }) {
  return (
    <MemoryRouter initialEntries={[route]}>
      <AuthProvider value={authValue}>
        <MembershipProvider value={membershipValue}>
          <AppShell>{children ?? <Home />}</AppShell>
        </MembershipProvider>
      </AuthProvider>
    </MemoryRouter>
  )
}

const ADMIN_MEMBERSHIPS = [{ id: 'm0', status: 'active', role: 'admin', team_id: null, player_id: null }]

function scheduleScenario(memberships, teams = TEAMS) {
  return () => (
    <Shell
      route="/schedule"
      authValue={baseAuth(COACH_EMAIL)}
      membershipValue={{ memberships, teams, loading: false, error: null, reload: noop }}
    >
      <Schedule />
    </Shell>
  )
}

// Independent Task 14 verification: the club really has 15 age groups, and
// the point of the form's squad <select> is that a coach of ONE of them sees
// exactly one option, not all 15. Two teams (TEAMS) cannot show that.
const TEAMS_15 = [
  'Senior Men 1st XV', 'Senior Men 2nd XV', 'Senior Women', 'U18 Boys', 'U16 Boys',
  'U15 Boys', 'U14 Boys', 'U13 Boys', 'U12 Boys', 'U11 Mixed',
  'U10 Mixed', 'U9 Mixed', 'U8 Mixed', 'U7 Mixed', 'U6 Mixed',
].map((name, i) => ({ id: i === 8 ? 't1' : `t${100 + i}`, club_id: CLUB_ID, name, sort_order: i }))

function rosterScenario(memberships, teams = TEAMS) {
  return () => (
    <Shell
      route="/roster"
      authValue={baseAuth(COACH_EMAIL)}
      membershipValue={{ memberships, teams, loading: false, error: null, reload: noop }}
    >
      <Roster />
    </Shell>
  )
}

// Task 13 Dashboard screens. The default Shell child is already the
// Dashboard, so these only vary the persona (which is what changes the scope
// note, the stat-tile labels and the quick-action gating).
function dashboardScenario(memberships, teams = TEAMS) {
  return () => (
    <Shell
      route="/"
      authValue={baseAuth(COACH_EMAIL)}
      membershipValue={{ memberships, teams, loading: false, error: null, reload: noop }}
    />
  )
}

const PARENT_MEMBERSHIPS = [{ id: 'm4', status: 'active', role: 'parent', team_id: 't1', player_id: 'p1' }]

// ⚠️ THE MINIS — U10 and below (15 Aug 2026). ALL FIVE of the club's minis
// squads, and the count is the point rather than thoroughness for its own sake.
//
// Jay, the day this shipped: "we have some parents who could have up to 5 age
// groups worth of players". The "How your season works" block groups by FORMAT
// rather than by squad, so five squads must render TWO cards — and the WIDEST
// line the block can ever produce is the three squad names on the Mighty Minis
// card. That line is what a narrow phone would clip, and jsdom cannot see a
// clip because it computes no CSS. Three squads would have measured a case that
// cannot happen; five measures the worst one that can.
//
// ⚠️ THE NAMES ARE THE CLUB'S REAL ONES, measured against the live `teams` table
// on 15 Aug 2026. `U6 Tag` ENDS IN A "g" and `U12G QR` puts a letter straight
// after the digits — the two suffix traps this repo has already paid for, in
// the fixture rather than beside it (src/lib/ageGroup.js, src/lib/gender.js).
const MINIS_TEAMS = [
  { id: 't-u6', club_id: CLUB_ID, name: 'U6 Tag', sort_order: 1 },
  { id: 't-u7', club_id: CLUB_ID, name: 'U7 Tag', sort_order: 2 },
  { id: 't-u8', club_id: CLUB_ID, name: 'U8 Tag', sort_order: 3 },
  { id: 't-u9', club_id: CLUB_ID, name: 'U9 Mixed Contact', sort_order: 4 },
  { id: 't-u10', club_id: CLUB_ID, name: 'U10 Mixed Contact', sort_order: 5 },
]
const MINIS_PARENT = MINIS_TEAMS.map((team, index) => ({
  id: `m-minis-${index}`,
  role: 'parent',
  team_id: team.id,
  player_id: `p${index + 1}`,
}))

// A coach of one squad: the team filter is hidden and the list groups by
// position. Task 12's grouping rule turns on team count, so this is the
// scenario that renders the Forwards/Backs/Other headings.
const COACH_ONE_TEAM = [{ id: 'm1', status: 'active', role: 'coach', team_id: 't1', player_id: null }]

const scenarios = {
  login: () => (
    <AuthProvider value={baseAuth('')}>
      <Login />
    </AuthProvider>
  ),

  'shell-coach': () => (
    <Shell
      authValue={baseAuth(COACH_EMAIL)}
      membershipValue={{
        memberships: COACH_MEMBERSHIPS,
        teams: TEAMS,
        loading: false,
        error: null,
        reload: noop,
      }}
    />
  ),

  'shell-no-membership': () => (
    <Shell
      authValue={baseAuth(JAY_EMAIL)}
      membershipValue={{ memberships: [], teams: [], loading: false, error: null, reload: noop }}
    />
  ),

  // ⚠️ SIGN-UP, WITH SQUADS. `shell-no-membership` above passes `teams: []`,
  // which lands on AddYourPlayer's "we couldn't load the club's age groups"
  // fallback — a branch that is now UNREACHABLE in production and was the only
  // sign-up state this harness could render.
  //
  // `team read` was widened to `auth.uid() IS NOT NULL` by
  // 20260808_teams_readable_before_registration.sql. ⚠️ THAT MIGRATION IS
  // APPLIED — measured live 14 Aug 2026 — and the comment in
  // src/components/AddYourPlayer.jsx saying it was "written but NOT applied" is
  // stale. So a brand-new account DOES see every squad, and this scenario is
  // what a real parent actually meets.
  //
  // ⚠️ THE SQUAD NAMES ARE THE REAL CLUB'S, and that matters more than it
  // looks: squadRequiresGender() parses the NAME, so "U14B" asks for gender and
  // "U13 Mixed" does not. Inventing tidy fixture names would show a form no
  // parent ever meets. All three of these permit self-registration, exactly as
  // production does (measured 14 Aug 2026).
  //
  //   U11 Mixed Contact  below U13: NEITHER extra control — name + age group
  //   U13 Mixed Contact  self-registration only — "Who are you registering?"
  //   U14B Contact       BOTH — self-registration AND required gender, which is
  //                      what the real U14B parent sees
  //
  // ?registerThrow=42710 / 42809 drives the two duplicate guards through
  // harness/stubs/members.js, which is the only way to see the confirm tick.
  signup: () => (
    <Shell
      authValue={baseAuth(JAY_EMAIL)}
      membershipValue={{
        memberships: [],
        teams: [
          { id: 't-plain', club_id: CLUB_ID, name: 'U11 Mixed Contact', sort_order: 6 },
          {
            id: 't-self',
            club_id: CLUB_ID,
            name: 'U13 Mixed Contact',
            sort_order: 9,
            self_registration_allowed: true,
          },
          {
            id: 't-both',
            club_id: CLUB_ID,
            name: 'U14B Contact',
            sort_order: 10,
            self_registration_allowed: true,
          },
        ],
        loading: false,
        error: null,
        reload: noop,
      }}
    />
  ),

  'shell-error': () => (
    <Shell
      authValue={baseAuth(JAY_EMAIL)}
      membershipValue={{
        memberships: [],
        teams: [],
        loading: false,
        error: new Error('Network request failed while loading your account.'),
        reload: noop,
      }}
    />
  ),

  // Task 11 Schedule screens. Sub-tab selection and sheet opening are real
  // component state, so Playwright drives them by clicking (see shoot.mjs).
  schedule: scheduleScenario(COACH_MEMBERSHIPS),
  'schedule-admin': scheduleScenario(ADMIN_MEMBERSHIPS),
  // Task 14: the read-only side of the new Add/Edit/Delete affordances.
  'schedule-parent': scheduleScenario(PARENT_MEMBERSHIPS),
  // Coach of exactly one squad, in a club of 15. Independent verification.
  'schedule-one-team': scheduleScenario(COACH_ONE_TEAM, TEAMS_15),
  'schedule-admin-15': scheduleScenario(ADMIN_MEMBERSHIPS, TEAMS_15),

  // Task 12 Roster screens. Search text, pill selection and the PlayerDetail
  // sheet are real component state, so Playwright drives them by typing and
  // clicking (see shoot-roster.mjs).
  roster: rosterScenario(COACH_MEMBERSHIPS),
  'roster-one-team': rosterScenario(COACH_ONE_TEAM),
  'roster-admin': rosterScenario(ADMIN_MEMBERSHIPS),
  // Task 15: the read-only side of the new Add/Edit/Delete affordances.
  'roster-parent': rosterScenario(PARENT_MEMBERSHIPS),

  // Independent verification pass: three age groups in scope.
  'roster-three': rosterScenario(COACH_THREE_MEMBERSHIPS, TEAMS_THREE),

  // The Home noticeboard card (14 Aug 2026). NoticeBoard is a PURE PROPS
  // component, like SquadStaffCard, so this scenario needs no data stub at all
  // — the fixtures below are the props. That is the only reason it is here:
  // the /notices SCREEN reads three tables and is NOT represented in this file,
  // so do not read a green harness as covering the screen.
  //
  // ⚠️ THE LONG-TITLE ROW IS THE MEASUREMENT, not decoration. A notice title is
  // free text somebody typed on a phone, and this card sits at the top of the
  // dashboard where an overflow pushes the whole page wide. Check it at 320px.
  notices: () => (
    <MemoryRouter>
      <div className="mx-auto max-w-[720px] bg-surface p-3">
        <NoticeBoard
          teamsById={new Map([['t1', { id: 't1', name: 'U16B Contact' }]])}
          readIds={new Set(['read-one'])}
          notices={[
            {
              id: 'unread-one',
              team_id: null,
              title: 'Zayed Sports City closed Saturday',
              body: 'All Saturday sessions move to Al Bateen. Kick-off times are unchanged.',
              pinned: true,
              expires_at: null,
              created_at: new Date().toISOString(),
              author: { full_name: 'Jay Muir' },
            },
            {
              id: 'read-one',
              team_id: 't1',
              title: 'Kit for Friday’s fixture',
              body: 'Away strip. Meet at the clubhouse 14:30, not at the pitch.\nKick-off is 16:00.',
              pinned: true,
              expires_at: null,
              created_at: new Date().toISOString(),
              author: { full_name: 'Sarah Nolan', title: 'Head Coach' },
            },
            {
              id: 'long',
              team_id: 't1',
              title:
                'Registration paperwork for the interclub tournament must be returned before Thursday',
              body: 'Forms are with the team manager.',
              pinned: true,
              expires_at: null,
              created_at: new Date().toISOString(),
              author: { full_name: 'A Volunteer With A Long Name', title: 'Assistant Coach' },
            },
          ]}
        />
      </div>
    </MemoryRouter>
  ),

  dashboard: dashboardScenario(COACH_MEMBERSHIPS),
  'dashboard-admin': dashboardScenario(ADMIN_MEMBERSHIPS),
  'dashboard-parent': dashboardScenario(PARENT_MEMBERSHIPS),
  // A parent with three children in the minis. Renders "How your season works"
  // — two cards for three squads. See MINIS_TEAMS above.
  'dashboard-minis': dashboardScenario(MINIS_PARENT, MINIS_TEAMS),

  // Task 5 (Overview screen) browser verification. Same Shell/membership
  // pattern as the dashboard scenarios above; renders the real Overview
  // screen instead of Dashboard. COACH_MEMBERSHIPS/ADMIN_MEMBERSHIPS/TEAMS
  // are the same fixtures every other scenario in this file already uses,
  // so upcoming fixtures (e6/e7, both within the 14-day window of the repo's
  // pinned "today") and roster gaps (p4 has no contact row, per players.js's
  // stub) render with real, reused fixture data rather than new ones.
  // Route is /admin now, not /overview. The coach variant is kept even though
  // AdminDashboard is admin-only in the real app: the point of the scenario is
  // to render the screen for a non-admin and see what it does, which is
  // exactly the case a route guard would hide.
  'overview-admin': () => (
    <Shell
      route="/admin"
      authValue={baseAuth(JAY_EMAIL)}
      membershipValue={{ memberships: ADMIN_MEMBERSHIPS, teams: TEAMS, loading: false, error: null, reload: noop }}
    >
      <AdminDashboard />
    </Shell>
  ),
  'overview-coach': () => (
    <Shell
      route="/admin"
      authValue={baseAuth(COACH_EMAIL)}
      membershipValue={{ memberships: COACH_MEMBERSHIPS, teams: TEAMS, loading: false, error: null, reload: noop }}
    >
      <AdminDashboard />
    </Shell>
  ),

  // Independent verification pass, Task 15: mount PlayerForm DIRECTLY so the
  // gated branches can be reached without Roster's own gating deciding first.
  // ?pf=add|edit|edit-null|edit-foreign|no-teams picks the case.
  //   edit          -> p1 (U12, coach can edit, contact row on file)
  //   edit-null     -> p4 (U12, coach can edit, NO contact row on file)
  //   edit-foreign  -> p21 (U16 — coach coaches U12/U14 only)
  //   no-teams      -> a parent, i.e. zero editable squads
  playerform: () => {
    const params = new URLSearchParams(window.location.search)
    const which = params.get('pf') || 'add'
    const byId = (id) => PLAYERS.find((p) => p.id === id)
    const player =
      which === 'edit' ? byId('p1')
      : which === 'edit-null' ? byId('p4')
      : which === 'edit-foreign' ? byId('p21')
      : which === 'no-teams' ? byId('p1')
      : null
    const memberships = which === 'no-teams' ? PARENT_MEMBERSHIPS : COACH_MEMBERSHIPS
    return (
      <Shell
        route="/roster"
        authValue={baseAuth(COACH_EMAIL)}
        membershipValue={{ memberships, teams: TEAMS_THREE, loading: false, error: null, reload: noop }}
      >
        <PlayerForm player={player} onClose={noop} onSaved={noop} />
      </Shell>
    )
  },

  // Independent Task 16 verification: mount Availability DIRECTLY (same
  // reasoning as the `playerform` scenario above) so its own per-row
  // `editable` computation can be exercised for every role/team combination
  // without Schedule's/EventDetail's own gating deciding which case is even
  // reachable first. ?who=coach|admin|coach-foreign|parent-own|parent-foreign
  // picks the membership; ?team=t1|t2 picks which squad's event is open.
  // e6/e7 match the harness availability stub's REAL_ROWS keys, so the
  // per-row status (not just the count-only MIX fixture) is real and
  // player-id-addressable.
  availability: () => {
    const params = new URLSearchParams(window.location.search)
    const who = params.get('who') || 'coach'
    const teamId = params.get('team') || 't1'
    const otherTeamId = teamId === 't1' ? 't2' : 't1'
    const event =
      teamId === 't1'
        ? {
            id: 'e6',
            team_id: 't1',
            type: 'training',
            title: 'U12 Squad Training',
            opponent: null,
            venue: 'Zayed Sports City',
            starts_at: '2026-07-28T15:30:00Z',
            result_us: null,
            result_them: null,
          }
        : {
            id: 'e7',
            team_id: 't2',
            type: 'training',
            title: 'U14 Contact & Conditioning',
            opponent: null,
            venue: 'Zayed Sports City — Pitch 3',
            starts_at: '2026-07-28T17:00:00Z',
            result_us: null,
            result_them: null,
          }
    const membershipsByWho = {
      coach: COACH_MEMBERSHIPS, // coaches both t1 and t2 -> canOverrideAll for either.
      admin: ADMIN_MEMBERSHIPS,
      // Coaches only the OTHER team -> zero override rights on this one.
      'coach-foreign': [{ id: 'mx', role: 'coach', team_id: otherTeamId, player_id: null }],
      // Child p1 is on t1's roster. Viewing t1 -> exactly one editable row.
      // Viewing t2 (via ?team=t2) -> p1 is not on t2's roster at all, so this
      // doubles as the "child NOT on this roster" case with no extra wiring.
      'parent-own': PARENT_MEMBERSHIPS,
      // A parent linked to THIS team, but to a player id that is not one of
      // its actual roster rows (a malformed/stale link) — the strictest
      // version of "child not on the roster": even same-team membership must
      // not grant a clickable row for a player id that isn't really there.
      'parent-foreign': [{ id: 'mx', role: 'parent', team_id: teamId, player_id: 'not-on-roster' }],
    }
    const memberships = membershipsByWho[who] ?? COACH_MEMBERSHIPS
    return (
      <Shell
        route="/schedule"
        authValue={baseAuth(COACH_EMAIL)}
        membershipValue={{ memberships, teams: TEAMS, loading: false, error: null, reload: noop }}
      >
        <Availability event={event} team={TEAMS.find((t) => t.id === teamId)} onClose={noop} />
      </Shell>
    )
  },

  // ⚠️ ADDED 12 Aug 2026 WITH THE DUPLICATE BUTTON. EventDetail's footer went
  // from two buttons to three — Edit | Duplicate | Delete — and no other
  // scenario opens this sheet (`schedule` and `dashboard` render the LIST), so
  // there was nowhere to look at the new row.
  //
  // ⚠️ IT IS FOR LOOKING AT AND MEASURING, NOT FOR THE OVERFLOW GATE, and that
  // is a correction to what this comment said when it was written. The gate
  // cannot see inside a sheet: Sheet is `position:fixed` and sets body
  // overflow hidden, so its contents are outside the document's scrollWidth.
  // Injecting a 900px `shrink-0` button here left the gate green. The row was
  // verified by measuring it in Chromium instead — 284px wide at 320px, the
  // three buttons 83 + 97 + 85 with 10px gaps, one line, nothing clipped.
  //
  // Mounted directly for the same reason `playerform` and `availability` above
  // are: so the gated branch is reachable without Schedule's own state
  // deciding first.
  //
  // ⚠️ THE LONGEST PLAUSIBLE LABELS ON PURPOSE — a venue and pitch a coach
  // would really type, and every optional block switched on — because a
  // cramped row is only cramped at its widest.
  // ⚠️ `?who=parent` GIVES THE PARENT'S EVENT DETAIL, and the difference is
  // not cosmetic: a coach sees Edit / Duplicate / Delete and "Request a pitch"
  // on this sheet and a parent sees none of them. Hard-coding COACH_MEMBERSHIPS
  // meant the only screenshot this scenario could produce was one no parent
  // ever sees. Same knob name and default as `availability` above.
  'event-detail': () => (
    <Shell
      route="/schedule"
      authValue={baseAuth(COACH_EMAIL)}
      membershipValue={{
        memberships:
          new URLSearchParams(window.location.search).get('who') === 'parent'
            ? PARENT_MEMBERSHIPS
            : COACH_MEMBERSHIPS,
        teams: TEAMS,
        loading: false,
        error: null,
        reload: noop,
      }}
    >
      <EventDetail
        event={{
          id: 'e6',
          team_id: 't1',
          type: 'training',
          title: 'U12 Contact & Conditioning',
          opponent: null,
          venue: 'Zayed Sports City, Abu Dhabi',
          pitch: 'Pitch TBD',
          notes: 'Meet at the gate 30 minutes before. Bring both kits.',
          starts_at: '2026-07-28T15:30:00Z',
          ends_at: '2026-07-28T17:00:00Z',
          series_id: null,
          result_us: null,
          result_them: null,
        }}
        team={TEAMS.find((t) => t.id === 't1')}
        canEdit={new URLSearchParams(window.location.search).get('who') !== 'parent'}
        onClose={noop}
        onEdit={noop}
        onDuplicate={noop}
        onDeleted={noop}
      />
    </Shell>
  ),

  // ⚠️ A MINIS MATCH (15 Aug 2026). The same sheet as `event-detail` above, on a
  // U8 squad and as a MATCH rather than a training session, which is what makes
  // the "Mighty Minis" note render at all.
  //
  // Two things only a browser can settle. The note is a tinted block inside a
  // Sheet, and Sheet is `position: fixed` with `body { overflow: hidden }` — so
  // its contents sit outside the document's scrollWidth entirely and
  // harness/check-overflow.mjs cannot see them (the same property EventDetail's
  // own footer comment spells out). And `onOpenMatchSheet` IS passed here, so
  // the absence of the RCM button is the age rule doing its job rather than a
  // caller that forgot the handler — the exact confusion that let a dead
  // availability button ship on the Dashboard for weeks.
  'event-detail-minis': () => (
    <Shell
      route="/schedule"
      authValue={baseAuth(COACH_EMAIL)}
      membershipValue={{
        memberships: [{ id: 'm-u8', role: 'coach', team_id: 't-u8', player_id: null }],
        teams: MINIS_TEAMS,
        loading: false,
        error: null,
        reload: noop,
      }}
    >
      <EventDetail
        event={{
          id: 'e-minis',
          team_id: 't-u8',
          type: 'match',
          title: null,
          opponent: 'Dubai Exiles',
          home: true,
          venue: 'Abu Dhabi Cricket Stadium',
          pitch: null,
          notes: null,
          starts_at: '2026-09-12T05:00:00Z',
          ends_at: '2026-09-12T06:30:00Z',
          series_id: null,
          result_us: null,
          result_them: null,
        }}
        team={MINIS_TEAMS.find((t) => t.id === 't-u8')}
        canEdit
        onClose={noop}
        onEdit={noop}
        onDuplicate={noop}
        onDeleted={noop}
        onOpenMatchSheet={noop}
        onOpenLineup={noop}
      />
    </Shell>
  ),

  // Independent Task 17 verification: mount Admin DIRECTLY (same reasoning
  // as the `playerform`/`availability` scenarios above) so its own isAdmin()
  // gate and data-fetch effect can be exercised for every role without
  // App.jsx's routing deciding which case is even reachable first.
  // ?who=admin|coach|parent|player picks the membership. Real 15-age-group
  // fixture (TEAMS_15) is used so "Age groups (15)" is genuine, not a
  // 2-3-team stand-in.
  // The real More screen, added 18 Aug 2026 to see PushNotificationsToggle
  // rendered against a real Chromium browser rather than only jsdom — the
  // one thing a unit test cannot show is whether a real click reaches a real
  // permission prompt. `?who=` reuses the same shape as the `admin` scenario
  // below.
  more: () => {
    const params = new URLSearchParams(window.location.search)
    const who = params.get('who') || 'parent'
    const membershipsByWho = {
      admin: ADMIN_MEMBERSHIPS,
      coach: COACH_MEMBERSHIPS,
      parent: PARENT_MEMBERSHIPS,
    }
    const memberships = membershipsByWho[who] ?? PARENT_MEMBERSHIPS
    return (
      <Shell
        route="/more"
        authValue={baseAuth(JAY_EMAIL)}
        membershipValue={{ memberships, teams: TEAMS_15, loading: false, error: null, reload: noop }}
      >
        <More />
      </Shell>
    )
  },

  admin: () => {
    const params = new URLSearchParams(window.location.search)
    const who = params.get('who') || 'admin'
    const membershipsByWho = {
      admin: ADMIN_MEMBERSHIPS,
      coach: COACH_MEMBERSHIPS,
      parent: PARENT_MEMBERSHIPS,
      player: [{ id: 'm5', status: 'active', role: 'player', team_id: 't1', player_id: 'p1' }],
    }
    const memberships = membershipsByWho[who] ?? ADMIN_MEMBERSHIPS
    return (
      <Shell
        route="/more"
        authValue={baseAuth(JAY_EMAIL)}
        membershipValue={{ memberships, teams: TEAMS_15, loading: false, error: null, reload: noop }}
      >
        <Admin />
      </Shell>
    )
  },

  // Independent Task 17 verification: a real BrowserRouter (not
  // MemoryRouter) with real Routes for /more, /schedule, /roster — same
  // shape as App.jsx's own <Routes> — so a click on Admin's "Manage" links
  // can be checked for what it ACTUALLY does in a real browser: a
  // client-routed SPA navigation (URL changes, JS context/state survives) vs
  // a hard full-page reload (which a plain <a href> triggers regardless of
  // which router wraps it). window.__navMarker is set once on load and
  // checked after the click — it survives a client-side route change but is
  // wiped by a real page load, which is how the two are told apart.
  'admin-nav': () => {
    window.__navMarker = 'harness-loaded'
    return (
      <BrowserRouter>
        <AuthProvider value={baseAuth(JAY_EMAIL)}>
          <MembershipProvider
            value={{ memberships: ADMIN_MEMBERSHIPS, teams: TEAMS_15, loading: false, error: null, reload: noop }}
          >
            <AppShell>
              <Routes>
                <Route path="/more" element={<Admin />} />
                <Route path="/schedule" element={<Schedule />} />
                <Route path="/roster" element={<Roster />} />
              </Routes>
            </AppShell>
          </MembershipProvider>
        </AuthProvider>
      </BrowserRouter>
    )
  },

  // The /admin portal chooser (12 Aug 2026,
  // claude/decisions/2026-08-12-admin-portals.md). Reproduces App.jsx's real
  // nesting — AdminDashboard as the parent with PortalChooser as its index
  // child — because the chooser reaches the screen through <Outlet/> and
  // mounting it alone would not prove that wiring.
  //
  // The membership holds `pitches` ONLY, deliberately, so all three card
  // states are on screen at once: two open (Club Admin, Pitch Management), one
  // grey for want of the job (Club Youth Manager) and one grey for want of a
  // screen (Social Media Management).
  //
  // ⚠️ THE OVERFLOW GATE SEES THIS SCREEN SINCE 21 Aug 2026. Until retheme
  // phase 4 the whole /admin tree lived inside `hidden desktop:block`, so at
  // the gate's 320-414px widths what rendered was a "Needs a bigger screen"
  // card and nothing else, and this note warned against reading the listing
  // as coverage. The width gate is gone: the chooser now renders its card
  // grid at every width and the phone measurement is real. Opening it in a
  // real browser is still the only check of how it LOOKS.
  'portal-chooser': () => {
    const PITCH_ADMIN = [
      { id: 'm0', role: 'admin', status: 'active', team_id: null, player_id: null, admin_rights: ['pitches'] },
    ]
    return (
      <MemoryRouter initialEntries={['/admin']}>
        <AuthProvider value={baseAuth(JAY_EMAIL)}>
          <MembershipProvider
            value={{ memberships: PITCH_ADMIN, teams: TEAMS_15, loading: false, error: null, reload: noop }}
          >
            <AppShell>
              <Routes>
                <Route path="/admin" element={<AdminDashboard />}>
                  <Route index element={<PortalChooser />} />
                </Route>
              </Routes>
            </AppShell>
          </MembershipProvider>
        </AuthProvider>
      </MemoryRouter>
    )
  },

  // Independent Task 18 verification. A faithful reproduction of App.jsx's
  // OWN route structure (per-route <AppShell> wrapping, /accept-invite/:token
  // as a sibling outside all of them) — not one screen mounted directly like
  // the scenarios above — because this task's top-priority risk (a possible
  // remount flash/jank on every route change, since each <Route> now owns its
  // own <AppShell> instead of one shared shell wrapping a nested <Routes>) can
  // only be observed by actually navigating a real router, not by rendering
  // one screen in isolation. RequireAuth is deliberately NOT reproduced here:
  // every scenario below assumes a session already exists (that's what
  // AuthProvider's stub value supplies), so RequireAuth would only ever take
  // its "render children" branch — reproducing it would add nothing to
  // observe. `memberships` is real React state (not a fixed prop) so
  // AcceptInvite's real reload()-then-navigate sequence can be exercised
  // end-to-end: reload() here flips a zero-membership account to a
  // one-membership account, the same effect the real reload() has after a
  // genuine accept_invite RPC call inserts a row.
  'full-app': () => {
    const params = new URLSearchParams(window.location.search)
    const startMemberships = params.get('start') === 'none' ? [] : ADMIN_MEMBERSHIPS
    const startTeams = params.get('start') === 'none' ? [] : TEAMS_15

    function FullApp() {
      const [memberships, setMemberships] = useState(startMemberships)
      const [teams] = useState(startTeams)

      function reload() {
        // Simulate what a genuine accept_invite RPC call achieves: the
        // invitee now has exactly one membership row that didn't exist
        // before.
        setMemberships([{ id: 'm-accepted', role: 'player', team_id: 't1', player_id: 'p1' }])
      }

      const membershipValue = { memberships, teams, loading: false, error: null, reload }

      return (
        <BrowserRouter>
          <AuthProvider value={baseAuth(JAY_EMAIL)}>
            <MembershipProvider value={membershipValue}>
              <Routes>
                <Route path="/accept-invite/:token" element={<AcceptInvite />} />
                <Route path="/" element={<AppShell><Dashboard /></AppShell>} />
                <Route path="/schedule" element={<AppShell><Schedule /></AppShell>} />
                <Route path="/roster" element={<AppShell><Roster /></AppShell>} />
                <Route path="/more" element={<AppShell><Admin /></AppShell>} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </MembershipProvider>
          </AuthProvider>
        </BrowserRouter>
      )
    }

    return <FullApp />
  },

  // Task 5 (view-as + Accounts) browser verification.
  //
  // Accounts mounted DIRECTLY, same reasoning as the admin/playerform
  // scenarios above: its own isAdmin() gate and fetch effect are what is
  // being checked, not App.jsx's routing. TEAMS_THREE (t1/t2/t3) is used
  // rather than TEAMS_15 because the members stub's rows point at exactly
  // those three team ids, so every age-group <select> holds a value that
  // really exists in its option list. The auth stub supplies an id matching
  // the fixture admin's profile_id (pr-jay), which is what makes the
  // last-admin guard reachable at all — with no id, ownAdminCount is 0 and
  // the guard can never fire. ?who=admin|coach picks the gate case.
  'accounts-admin': () => {
    const params = new URLSearchParams(window.location.search)
    const who = params.get('who') || 'admin'
    const memberships = who === 'coach' ? COACH_MEMBERSHIPS : ADMIN_MEMBERSHIPS
    const authValue = { ...baseAuth(JAY_EMAIL), user: { id: 'pr-jay', email: JAY_EMAIL } }
    return (
      <Shell
        route="/accounts"
        authValue={authValue}
        membershipValue={{
          memberships,
          realMemberships: memberships,
          viewAs: null,
          setViewAs: noop,
          teams: TEAMS_THREE,
          loading: false,
          error: null,
          reload: noop,
        }}
      >
        <Accounts />
      </Shell>
    )
  },

  // The view-as switcher needs membership context that actually CHANGES when
  // a persona is chosen — a fixed `value` prop (what every scenario above
  // passes) would render the sheet but never re-scope anything, which is the
  // whole behaviour under test. So this scenario holds viewAs in real React
  // state and derives the effective set exactly as
  // src/lib/memberships.jsx's syntheticMemberships does. That derivation is
  // duplicated here deliberately and is NOT the authority on it —
  // tests/memberships.test.jsx tests the real provider; this exists so the
  // real ViewAsSwitcher/ViewAsBanner/Roster can be driven in a real browser
  // without a Supabase session.
  //
  // Roster is the child screen because its age-group pills make re-scoping
  // visible at a glance: admin sees all three squads, a coach persona sees
  // one. ?who=non-admin flips the caller to a coach, which is how the
  // "switcher renders nothing for a non-admin" case is checked.
  'view-as': () => {
    const params = new URLSearchParams(window.location.search)
    const real = params.get('who') === 'non-admin' ? COACH_MEMBERSHIPS : ADMIN_MEMBERSHIPS

    function ViewAsHarness() {
      const [viewAs, setViewAsState] = useState(null)
      const effective = viewAs
        ? [{ id: 'view-as', role: viewAs.role, team_id: viewAs.teamId, player_id: null, club_id: CLUB_ID }]
        : real

      return (
        <Shell
          route="/roster"
          authValue={baseAuth(JAY_EMAIL)}
          membershipValue={{
            memberships: effective,
            realMemberships: real,
            viewAs,
            setViewAs: (next) => setViewAsState(next ? { role: next.role, teamId: next.teamId } : null),
            teams: TEAMS_THREE,
            loading: false,
            error: null,
            reload: noop,
          }}
        >
          <Roster />
        </Shell>
      )
    }

    return <ViewAsHarness />
  },

  // Task D (plan 2026-08-03-pending-access) verification: the "Waiting for
  // access" section on Accounts.
  //
  // The section's highest-risk bug is that listPendingProfiles() returns
  // EVERY profile the admin can read, not just the unattached ones — the
  // screen subtracts listClubMembers()'s profile_ids, and dropping that
  // subtraction lists every existing member as "waiting". So this scenario is
  // pointed at a members stub that deliberately returns both kinds of row
  // (the three unattached pn-* profiles AND the eight member profiles), which
  // is what makes the subtraction observable instead of vacuously true.
  //
  // The auth user id is `pr-jay` — a profile that IS in the member list — so
  // the belt-and-braces `profile.id !== user?.id` filter is exercised on a
  // real id rather than on undefined. TEAMS_THREE for the same reason
  // accounts-admin uses it: every age-group option in the grant select points
  // at a team id the fixture rows really use.
  //
  // Knobs (read by harness/stubs/members.js): ?pending=none for the empty
  // state, ?pendingThrow=1 to prove a failed profiles read costs only this
  // section, ?writeDelay/?writeThrow for the grant button's in-flight and
  // refusal states.
  'accounts-pending': () => (
    <Shell
      route="/accounts"
      authValue={{ ...baseAuth(JAY_EMAIL), user: { id: 'pr-jay', email: JAY_EMAIL } }}
      membershipValue={{
        memberships: ADMIN_MEMBERSHIPS.map((row) => ({ ...row, club_id: CLUB_ID })),
        realMemberships: ADMIN_MEMBERSHIPS,
        viewAs: null,
        setViewAs: noop,
        teams: TEAMS_THREE,
        loading: false,
        error: null,
        reload: noop,
      }}
    >
      <Accounts />
    </Shell>
  ),

  // Task C's first-login name prompt, in a real browser. It renders inside
  // AppShell's `ready` branch, so this is a plain signed-in shell — the only
  // thing that decides whether the Sheet opens is the profile the members
  // stub returns, driven by ?blankName=1. Without that knob the same scenario
  // is the control case: a named profile, no prompt.
  //
  // ⚠️ THIS COMMENT SAID EVERY OTHER SCENARIO WAS "SILENTLY IMMUNE TO THE
  // PROMPT" BECAUSE baseAuth() SUPPLIED ONLY AN EMAIL. IT SUPPLIES A USER ID —
  // see baseAuth above — so nothing was immune, and once the gate grew its
  // player, role and birthday steps it opened over Home, Roster, Schedule,
  // Availability and this file's own name-prompt CONTROL case.
  // ⚠️ WHAT KEEPS THE GATE SHUT IS NOW THE STUB DEFAULTS, NOT THE AUTH SHAPE:
  // stubs/members.js answers the player and role questions and
  // stubs/players.js gives every child a birthday, unless `?firstLogin=1` says
  // otherwise. To SEE the gate, pass that knob (or `?blankName=1` for the name
  // step alone, which is what shoot-pending.mjs drives).
  'name-prompt': () => (
    <Shell
      route="/"
      authValue={{ ...baseAuth(JAY_EMAIL), user: { id: 'pr-jay', email: JAY_EMAIL } }}
      membershipValue={{
        memberships: ADMIN_MEMBERSHIPS,
        realMemberships: ADMIN_MEMBERSHIPS,
        viewAs: null,
        setViewAs: noop,
        teams: TEAMS_THREE,
        loading: false,
        error: null,
        reload: noop,
      }}
    />
  ),

  // ⚠️ THE MATCH SHEET HAD NO REAL-BROWSER SCENARIO AT ALL until 12 Aug 2026,
  // and it is the widest thing in the app: an eight-column facsimile of a
  // governing body's paper form, plus a three-column score grid, on a phone at
  // the side of a pitch. Every other wide screen in this file is here because
  // something on it overflowed; this one is here before it does.
  //
  // ⚠️ NOT INSIDE A SHEET, so unlike `availability`, `playerform` and
  // `event-detail`, the overflow gate genuinely measures this one. MatchSheet
  // is a routed screen and its contents are in the document's scrollWidth.
  //
  // ⚠️ ROUTES, NOT JUST A ROUTE STRING. MatchSheet reads useParams(), and
  // outside a matched <Route> that returns {} — the screen then renders "That
  // fixture could not be found" and the scenario measures an error card while
  // reporting the match sheet clean.
  //
  // e2 is deliberate on both counts: it is on t2 ("U14 Boys"), the band that
  // scores all FOUR kinds and therefore draws the tallest, widest score grid;
  // and it is `home: false`, so the positional HOME/AWAY mapping is exercised
  // rather than assumed.
  'match-sheet': () => (
    <Shell
      route="/match-sheet/e2"
      authValue={{ ...baseAuth(COACH_EMAIL), user: { id: 'pr-jay', email: COACH_EMAIL } }}
      membershipValue={{
        memberships: COACH_MEMBERSHIPS,
        teams: TEAMS,
        loading: false,
        error: null,
        reload: noop,
      }}
    >
      <Routes>
        <Route path="/match-sheet/:eventId" element={<MatchSheet />} />
      </Routes>
    </Shell>
  ),

  // ⚠️ THE PITCH CALENDAR — Day, Week and Month (12 Aug 2026). The month grid
  // is the widest NON-SHEET thing in the app after the match sheet, and it is
  // seven columns at 320px, so it is exactly the shape the overflow gate can
  // measure for real.
  //
  // ⚠️ ADMIN WITH THE `pitches` RIGHT, because Allocation returns a refusal
  // card without it — a scenario without the right would render the "Pitch
  // Management hasn't been added to your account" message and pass every check
  // while showing none of the screen.
  //
  // ?view=week|month picks the view; the screen itself opens on Day.
  'allocation': () => (
    <Shell
      route="/admin/allocation"
      authValue={{ ...baseAuth(JAY_EMAIL), user: { id: 'pr-jay', email: JAY_EMAIL } }}
      membershipValue={{
        memberships: [
          // ⚠️ `status: 'active'` IS MANDATORY AND IS EASY TO MISS.
          // adminRights() skips any membership that is not active, so without
          // it this scenario renders the "Pitch Management hasn't been added to
          // your account" refusal card and passes every check while showing
          // none of the screen. It did exactly that first time.
          {
            id: 'm0',
            role: 'admin',
            status: 'active',
            team_id: null,
            player_id: null,
            club_id: CLUB_ID,
            admin_rights: ['pitches'],
          },
        ],
        teams: TEAMS,
        loading: false,
        error: null,
        reload: noop,
      }}
    >
      <Allocation />
    </Shell>
  ),

  'shell-loading': () => (
    <Shell
      authValue={baseAuth(JAY_EMAIL)}
      membershipValue={{ memberships: [], teams: [], loading: true, error: null, reload: noop }}
    />
  ),

  // The photo picker (15 Aug 2026). ⚠️ IT EXISTS BECAUSE jsdom CANNOT TEST THE
  // FEATURE. Every element in jsdom has a zero-sized box, so
  // `getBoundingClientRect()` returns all zeros and every pointer position
  // collapses to the same answer — the drag maths is exactly the part the unit
  // tests cannot reach. Drag it here instead.
  'photo-positioner': () => <PhotoPositionerScenario />,

  // ⚠️ THE /notices SCREEN ITSELF IS STILL NOT HERE — it reads three tables.
  // This is its CARD, extracted to src/components/NoticeRow.jsx on 16 Aug 2026
  // precisely so the thing Jay looks at can be looked at. See the `notices`
  // scenario above for the Home card, which is a different component.
  'notice-row': () => <NoticeRowScenario />,
}

const params = new URLSearchParams(window.location.search)
const scenario = params.get('scenario') || 'login'
// The Squad Hub, at its real route so useParams resolves — added 21 Aug
// 2026 to reproduce the dark-mode player-history sheet on a REAL renderer.
scenarios.squadhub = () => (
  <Shell
    route="/squad/t1"
    authValue={baseAuth(COACH_EMAIL)}
    membershipValue={{ memberships: COACH_MEMBERSHIPS, teams: TEAMS, loading: false, error: null, reload: noop }}
  >
    <RRoutes>
      <RRoute path="/squad/:teamId" element={<SquadHub />} />
      {/* The picker rides along so the sidebar's Build a Match Roster
          sub-item goes somewhere real in the harness too (22 Aug 2026). */}
      <RRoute path="/squad/:teamId/match-roster" element={<MatchRosterPicker />} />
    </RRoutes>
  </Shell>
)

// The ADMIN squad hub — fifteen squads, which is what makes the header's
// switcher row an overflow risk at all (found on Jay's phone, 22 Aug 2026:
// shrink-0 held it at ~1127px and the document blew out). This scenario is
// in the overflow gate's list; a one-squad coach cannot reproduce it.
scenarios['squadhub-admin'] = () => (
  <Shell
    route="/squad/t1"
    authValue={baseAuth(COACH_EMAIL)}
    membershipValue={{ memberships: ADMIN_MEMBERSHIPS, teams: TEAMS_15, loading: false, error: null, reload: noop }}
  >
    <RRoutes>
      <RRoute path="/squad/:teamId" element={<SquadHub />} />
    </RRoutes>
  </Shell>
)

const render = scenarios[scenario] || scenarios.login

// Theme parity with the real app: index.html's inline no-flash script does
// this in production, and the shoot scripts flip the class to photograph
// dark mode. Without it the harness is stuck light and every dark-mode
// screenshot lies.
applyTheme()
watchSystemTheme()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>{render()}</React.StrictMode>,
)
