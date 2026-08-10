import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import AccessBuilder from '../components/AccessBuilder.jsx'
import Badge from '../components/Badge.jsx'
import Button from '../components/Button.jsx'
import AdminRightsEditor from '../components/AdminRightsEditor.jsx'
import Card from '../components/Card.jsx'
import Empty from '../components/Empty.jsx'
import PhoneInput from '../components/PhoneInput.jsx'
import Sheet from '../components/Sheet.jsx'
import Spinner from '../components/Spinner.jsx'
import {
  approveMembership,
  deleteMembership,
  grantMemberships,
  listClubMembers,
  listPendingProfiles,
  updateMembershipRole,
  updateMemberProfile,
} from '../data/members.js'
import {
  dismissAccessRequest,
  listAccessRequests,
  restoreAccessRequest,
} from '../data/accessRequests.js'
import { listPlayers } from '../data/players.js'
import { useAuth } from '../lib/auth.jsx'
import { useMemberships } from '../lib/memberships.jsx'
import { canApproveAnything, isAdmin, isSuperAdmin } from '../lib/scope.js'
import { initials } from '../lib/playerFormat.js'
import { joinPhone, splitPhone } from '../lib/phone.js'

// Admin Accounts screen (design spec 2026-08-03 §2): view and edit who has
// access to the club — display name, role, age group, and revoking access.
//
// Gated on the EFFECTIVE membership set from useMemberships(), exactly like
// every other screen, so an admin previewing as a coach ("view as", spec §1)
// correctly sees "not authorised" here. Only the view-as switcher itself
// gates on realMemberships; if this screen did too, the preview would be a
// lie. The gate is UI-only — RLS (`memb manage`, `profile update club admin`)
// is what actually decides whether the writes below succeed, so getting this
// wrong could hide the screen from an admin but could never grant anything.
//
// Three things this screen deliberately does NOT do (spec §2 "Not doing"):
//   - passwords: an admin cannot reset someone else's from the browser (that
//     needs the service-role key, which never touches this frontend), so the
//     screen says so rather than rendering a dead control;
//   - email: profiles.email mirrors auth.users.email; writing it here would
//     desync the address people actually sign in with. Read-only;
//   - creating accounts: that is the existing invite flow, untouched.

const MUTED_ON_PAPER = 'text-ink-muted'

// Order matches AccessBuilder's list and ROLE_PRECEDENCE in scope.js.
// 'manager' (Team Manager) and 'medic' grant exactly what 'coach' grants —
// see SQUAD_STAFF_ROLES — so switching a row between the three changes the
// label and nothing else about what that person can do.
const ROLE_OPTIONS = [
  { value: 'admin', label: 'Admin' },
  { value: 'coach', label: 'Coach' },
  { value: 'manager', label: 'Team Manager' },
  { value: 'medic', label: 'Medic' },
  { value: 'parent', label: 'Parent' },
  { value: 'player', label: 'Player' },
]

// Same borderless-until-hover treatment RosterTable uses for its in-place
// selects, so a dense list of accounts doesn't read as a wall of form fields.
const INLINE_CONTROL =
  'rounded-[8px] border border-transparent bg-transparent px-2 py-1 text-[14px] text-ink transition hover:border-line hover:bg-surface-card focus:border-brand focus:bg-surface-card focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60'

// The single guard with no database equivalent. `memberships` has no
// constraint keeping at least one admin row alive, and an admin who removes
// or demotes their own last admin membership locks the club out of this
// screen (and of /more) with no way back except raw SQL against Supabase.
// Checked against the full club-wide list, not just the rows on screen.
const LAST_ADMIN_REFUSAL =
  "You can't change your own last admin access — the club would be locked out of its own admin screens. Add another admin first, or ask a different admin to make this change."

// "Waiting for access" (plan 2026-08-03 §Task B). Signing up with a magic
// link creates an auth user and a profiles row but NO membership, and every
// other list on this screen is a list of memberships — so before this section
// existed a self-signed-up person was invisible to admins.
//
// Two things about this section are deliberate and easy to undo by accident:
//
//   1. listPendingProfiles() does NOT return only pending profiles. It
//      returns every profile the caller can read, which for an admin is the
//      union of three RLS policies: their own row, everyone with a membership
//      in their club, and everyone anywhere with zero memberships. The
//      subtraction below (against the profile_ids in the member list) is what
//      makes this the pending set. Drop it and every existing member reappears
//      here as if they were waiting.
//   2. There is no reject/dismiss control, on purpose. Nobody has asked for
//      anything — there is nothing to reject — and leaving a stranger with no
//      membership is already the correct outcome: they read zero rows from
//      every table. Deleting the underlying auth user needs the service-role
//      key, which never touches this frontend. The UI says that instead of
//      offering a button that could not do it.
//
// Choosing WHAT access to give is src/components/AccessBuilder.jsx's job, not
// this file's: a person's access is a set of rows (a parent of two children,
// a coach of two squads, a coach who is also a parent), and the same builder
// is used both here and on each existing person's block below.
const NO_CLUB_KNOWN =
  "We couldn't work out which club to add them to. Reload the page and try again."

// ══ THE THIRD CATEGORY: "waiting to be approved" ═══════════════════════════
// (parent self-registration, 8 Aug 2026. Spec:
// claude/decisions/2026-08-08-parent-self-registration.md)
//
// This screen already had two kinds of person and they came from two different
// tables:
//
//   HAS ACCESS      memberships rows          -> the blocks at the bottom
//   ASKED FOR ACCESS access_requests rows     -> "Waiting for access"
//
// A self-registered parent is NEITHER, and putting them in either list is
// wrong in a way that matters:
//
//   - they hold a REAL memberships row, so the "Waiting for access" section
//     will never show them. That section is driven by listPendingProfiles()
//     MINUS everyone with a membership, and this person has one. Nothing had
//     to change for that to be true — it is why they would otherwise have been
//     invisible;
//   - but their row is status='pending', which means they have essentially no
//     access: private.can_see_team requires 'active'. Listing them among the
//     people who "have access" would tell an admin the opposite of the truth,
//     and would put them under a Revoke button when what they need is Approve.
//
// So: their own section, ABOVE "Waiting for access", and the main list below
// is filtered to ACTIVE rows only. Above, because this queue is the more
// actionable of the two — a pending row is a named child in a named age group
// with a confirmed email behind it, whereas a "waiting for access" row can be
// a stranger who signed up and typed nothing.
//
// ⚠️ A PERSON CAN BE IN TWO PLACES AT ONCE, and that is correct. An approved
// parent who registers a second child has one active row and one pending row:
// they appear in the main list (with the access they really have) and in this
// queue (for the child still waiting). Filtering by ROW, not by person, is
// what makes that come out right.
//
// ⚠️ NO LONGER ADMIN ONLY — CHANGED 9 Aug 2026 (Jay: "coaches and managers
// should approve for their age groups only").
//
// The previous note here said the database disagreed with the spec, and it was
// right at the time: `memb manage` had no coach clause and `memb read` would
// not even show a coach someone else's pending row. Both were true, and the
// warning it ended with — do not add a coach entry point without changing the
// policies first — is exactly what was done.
//
// db/migrations/20260809_squad_staff_approval.sql adds THREE narrow things and
// deliberately does not widen `memb manage`, which is FOR ALL and would have
// handed every coach role changes and revocation along with approval:
//   * private.can_approve_team  — admin anywhere, or coach/manager of THAT
//     squad. ⚠️ NOT medic: approval is a shorter list than editing.
//   * two SELECT policies scoped to status = 'pending' — a coach sees the rows
//     and the names they are being asked to judge, and nothing else. The row
//     leaves their view once approved, which is correct.
//   * public.approve_membership() — SECURITY DEFINER, `status` a literal in
//     the SET list, so no parameter can reach any other column.
//
// Proven live in db/tests/rls-squad-staff-approval.sql, including that a
// parent cannot approve THEMSELVES.
const PENDING_APPROVAL_NOTE =
  'Parents add their own player and land here. Until you approve them they can see their own child and the squad’s fixtures — enough to set availability — and nothing else: not the squad roster, not other families’ contact details. Approving gives them the same view as everyone else in that age group.'

const SHEET_LABEL = 'mb-1.5 block text-[12.5px] font-bold uppercase tracking-[.4px] text-ink-muted'
const SHEET_INPUT =
  'w-full rounded-[11px] border-[1.5px] border-line bg-surface-card px-3 py-[11px] text-[16px] text-ink outline-none transition focus:border-brand disabled:cursor-not-allowed disabled:opacity-60'

function NotAuthorised() {
  return (
    <section>
      <h2 className="sr-only">Accounts</h2>
      <Card role="alert" className="p-6 text-center">
        <h3 className="text-base font-extrabold text-brand-deep">Not authorised</h3>
        <p className="mt-2 text-sm leading-relaxed text-brand-deep">
          This page is for club admins, coaches and team managers. If you think you
          should have access, ask a current admin to check your account.
        </p>
      </Card>
    </section>
  )
}

/**
 * One block per PERSON, not per membership row. memberships has no unique
 * constraint on (profile_id, club_id, role) — a duplicate admin row has
 * already happened once in this database (RESTORE.md) — so the same person
 * legitimately appears on several rows. Rendering them ungrouped would show
 * the same name repeatedly and hide the duplicate rather than surface it.
 *
 * Rows with a null profile_id (not possible in the current schema, but a
 * partial/failed join would produce one) fall back to a per-row key so they
 * still render as their own block instead of all collapsing into one.
 */
function groupByProfile(members) {
  const groups = new Map()

  members.forEach((member) => {
    const key = member.profile_id ?? `membership:${member.id}`
    const existing = groups.get(key)
    if (existing) {
      existing.memberships.push(member)
      return
    }
    groups.set(key, {
      key,
      profileId: member.profile_id ?? null,
      name: member.profiles?.full_name ?? null,
      email: member.profiles?.email ?? null,
      memberships: [member],
    })
  })

  return [...groups.values()].sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''))
}

function formatJoined(value) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

/**
 * The approval queue. ONE component, rendered by both the admin screen and the
 * coach/manager screen, so the card a coach taps Approve on is byte-identical
 * to the one an admin taps.
 *
 * ⚠️ THE LIST IS NOT FILTERED HERE. `memb read squad staff pending` narrows it
 * in the database — a coach's query returns only pending rows on squads they
 * may approve. A client-side filter as well would be a second rule free to
 * disagree with the first, and the wrong one would be the one nobody tested.
 */
function PendingApprovals({ members, teamsById, rowState, onApprove }) {
  return (
    <section data-testid="pending-approvals" className="mb-5">
      <h3 className="text-[16px] font-extrabold tracking-[-0.2px] text-ink">
        Players waiting to be approved
      </h3>
      <p className={`mt-1 text-[12.5px] leading-relaxed ${MUTED_ON_PAPER}`}>
        {PENDING_APPROVAL_NOTE}
      </p>

      <div className="mt-2.5 flex flex-col gap-3">
        {members.map((member) => {
          const state = rowState[member.id] ?? {}
          const personName = member.profiles?.full_name?.trim() || 'No name yet'
          const playerName = member.players?.full_name ?? 'Unnamed player'
          const teamName = member.team_id
            ? teamsById.get(member.team_id)?.name ?? member.teams?.name ?? null
            : null
          const registered = formatJoined(member.created_at)

          return (
            <Card
              key={member.id}
              data-testid="pending-membership"
              className="flex flex-wrap items-center gap-x-3 gap-y-2 px-[14px] py-3"
            >
              <span
                className="grid h-9 w-9 shrink-0 place-items-center rounded-[11px] bg-surface-mute text-[12px] font-extrabold tracking-[.5px] text-ink-muted"
                aria-hidden="true"
              >
                {initials(playerName)}
              </span>

              <div className="min-w-0">
                {/* The CHILD leads, not the parent. This is the decision being
                    made — "is this a real U13 player?" — and the answer usually
                    comes from recognising the name on the team sheet. The adult
                    and their address are the corroboration, on the line below.
                    That is even more true for a coach than for an admin: the
                    coach is the one who knows the squad. */}
                <span className="block text-[15px] font-bold text-ink">
                  {playerName}
                  {teamName && (
                    <span className={`ml-2 text-[12.5px] font-semibold ${MUTED_ON_PAPER}`}>
                      {teamName}
                    </span>
                  )}
                </span>
                <span className={`block text-[12.5px] ${MUTED_ON_PAPER}`}>
                  Added by {personName}
                  {member.profiles?.email ? ` \u00b7 ${member.profiles.email}` : ''}
                  {registered ? ` \u00b7 ${registered}` : ''}
                </span>
              </div>

              <span className="flex-1" />

              <Button
                size="sm"
                aria-label={`Approve ${playerName} for ${personName}`}
                disabled={Boolean(state.saving)}
                onClick={() => onApprove(member)}
              >
                {state.saving ? 'Approving\u2026' : 'Approve'}
              </Button>

              {/* No "reject" button, deliberately, and for the same reason the
                  waiting list has no delete: revoking is what removing this
                  person means, and that control already exists on their row
                  once they are approved. A separate reject here would be a
                  second way to delete a membership, with its own confirm step
                  and its own bugs. ⚠️ It would also be the one control on this
                  card a coach must NOT have — `memb manage` is admin-only —
                  so adding it means gating it, not just building it. */}

              {state.error && (
                <span
                  role="alert"
                  className="basis-full text-[12.5px] font-semibold text-brand-deep"
                >
                  {state.error}
                </span>
              )}
            </Card>
          )
        })}
      </div>
    </section>
  )
}

/**
 * Name and phone for ONE person, as an admin sees them.
 *
 * ⚠️ EMAIL IS RENDERED AND NOT EDITABLE, and that is a database fact rather
 * than a UI preference. It is the login identity, and the column grants for
 * `authenticated` (db/migrations/20260808_profile_phone_and_column_grants.sql)
 * are an allow-list that excludes it — an update including `email` fails the
 * WHOLE statement, so a field for it would break saving the name as well.
 * That allow-list exists because RLS grants ROWS, not COLUMNS, and without it
 * anyone could rewrite profiles.email and desync it from the address they
 * actually sign in with. Which is the address an admin reads on this very
 * screen when deciding whether to approve a stranger.
 *
 * ⚠️ FIRST AND FAMILY NAME, NOT `full_name`. The screen used to edit the
 * legacy single column; full_name is rebuilt from these two by the
 * profiles_sync_name trigger. Editing the derived value directly is how the
 * two drift apart.
 */
function PersonDetailsForm({ group, state, onChange, onSave }) {
  const draft = state ?? {}

  return (
    <div>
      <label className={SHEET_LABEL} htmlFor="person-first-name">
        First name
      </label>
      <input
        id="person-first-name"
        type="text"
        value={draft.firstName ?? ''}
        disabled={Boolean(draft.saving)}
        onChange={(event) => onChange({ firstName: event.target.value, saved: false })}
        className={SHEET_INPUT}
      />

      <label className={`${SHEET_LABEL} mt-3.5`} htmlFor="person-last-name">
        Family name
      </label>
      <input
        id="person-last-name"
        type="text"
        value={draft.lastName ?? ''}
        disabled={Boolean(draft.saving)}
        onChange={(event) => onChange({ lastName: event.target.value, saved: false })}
        className={SHEET_INPUT}
      />

      <div className="mt-3.5">
        {/* The same split control the rest of the app uses, so an admin typing
            a number here produces the identical E.164 string a parent typing it
            on /more would — and PhoneInput's own "that doesn't look right"
            warning comes with it, free. It renders its own label; a second one
            here would be announced twice. */}
        <PhoneInput
          id="person-phone"
          country={draft.phoneCountry ?? splitPhone('').country}
          national={draft.phoneNational ?? ''}
          disabled={Boolean(draft.saving)}
          onCountryChange={(value) => onChange({ phoneCountry: value, saved: false })}
          onNationalChange={(value) => onChange({ phoneNational: value, saved: false })}
        />
      </div>

      <div className="mt-3.5">
        <span className={SHEET_LABEL}>Email</span>
        <p data-testid="sheet-email" className="text-[14px] font-semibold text-ink">
          {group.email ?? 'No email on file'}
        </p>
        <p className={`mt-1 text-[12px] leading-relaxed ${MUTED_ON_PAPER}`}>
          This is the address they sign in with. It can&apos;t be changed here — they
          change it themselves, or an admin does it in Supabase.
        </p>
      </div>

      {draft.error && (
        <p role="alert" className="mt-3 text-[12.5px] font-semibold text-brand-deep">
          {draft.error}
        </p>
      )}

      <div className="mt-4 flex items-center gap-3">
        <Button size="sm" disabled={Boolean(draft.saving)} onClick={onSave}>
          {draft.saving ? 'Saving\u2026' : 'Save details'}
        </Button>
        {/* Said out loud, because the sheet stays open after a save and
            otherwise nothing on screen changes to confirm it worked. */}
        {draft.saved && !draft.saving && (
          <span role="status" className={`text-[12.5px] font-semibold ${MUTED_ON_PAPER}`}>
            Saved
          </span>
        )}
      </div>
    </div>
  )
}

export default function Accounts() {
  const { memberships, teams } = useMemberships()
  // ⚠️ Drawn from the EFFECTIVE membership set, like every other gate on this
  // screen — so "View as" does not leave a super admin holding controls the
  // persona they are previewing would never see.
  const viewerIsSuper = isSuperAdmin(memberships)
  const { user } = useAuth()
  const admin = isAdmin(memberships)
  // ⚠️ TWO GATES NOW, AND THEY ARE NOT THE SAME QUESTION.
  //   admin    — the whole screen: the member list, roles, squads, invites,
  //              revocation, the waiting-for-access list.
  //   approver — the approval queue ONLY. A coach or team manager sees that
  //              section and nothing else on this page.
  // Everything below that is admin-only must keep testing `admin`, not
  // `approver`. The database refuses a coach either way — every admin-only
  // write here is behind `memb manage`, which is still is_admin(club_id) — so
  // a slip shows a coach a control that fails rather than one that works.
  const approver = canApproveAnything(memberships)

  const [members, setMembers] = useState([])
  // Every profile the admin can read (see the "Waiting for access" block
  // above) —
  // NOT the pending set. `waiting` below is the pending set.
  const [profiles, setProfiles] = useState([])
  // access_requests rows: both the people who actively ASKED for access and
  // the dismissals an admin has already made (including dismissals of people
  // who never asked). One row per profile - see src/data/accessRequests.js.
  const [requests, setRequests] = useState([])
  // Per-profile dismiss/restore state, keyed by profile id.
  const [triageState, setTriageState] = useState({})
  const [showDismissed, setShowDismissed] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [reloadToken, setReloadToken] = useState(0)

  // Per-membership-row UI state, keyed by membership id: whether a write is
  // in flight, the last refusal to show inline, and whether the row is in its
  // "really revoke?" confirm step. The confirm is an inline state rather than
  // window.confirm — this project does not trigger browser modal dialogs.
  const [rowState, setRowState] = useState({})
  // ⚠️ THE INLINE NAME EDITOR IS GONE, and so is its state and its writer.
  // It wrote the LEGACY `full_name` column directly; the sheet writes
  // first_name and last_name, and full_name is rebuilt from those two by the
  // profiles_sync_name trigger. Keeping both would have left two ways to set a
  // name, one of them editing the derived value — which is exactly how the two
  // drift apart. `updateProfileName` still exists in src/data/members.js with
  // its own tests; nothing in the app calls it any more.
  //
  // An earlier draft of this change kept saveName "in case", with a comment
  // claiming it was still exercised. It was not: a review found no control
  // that could reach it.
  // Which person's Edit sheet is open, keyed the same way groups are.
  const [editingKey, setEditingKey] = useState(null)
  // Draft first name / family name / phone per person, keyed by group key.
  // Seeded when the sheet opens, not on mount: seeding all of them would build
  // a draft for every member of the club on every render of this screen.
  const [profileEdit, setProfileEdit] = useState({})
  // Per-grant-form state, keyed by profile id for a waiting person and by
  // `add:<profile id>` for the "Add access" builder on an existing person:
  // whether the insert is in flight, and the last refusal. WHAT is being
  // granted lives inside AccessBuilder — the screen only learns it on submit.
  const [grantState, setGrantState] = useState({})
  // Which existing people have their "Add access" builder open.
  const [adding, setAdding] = useState({})

  // The roster, loaded ONCE and only when a builder actually needs it (a
  // parent's children or a player's own record). ~315 rows that most grants
  // never look at, so loading it with the member list would put a third query
  // on every visit to this screen to serve a minority of them. listPlayers()
  // with no teamIds is deliberate: an admin picking a child needs the whole
  // club, not the teams they happen to be scoped to, and RLS is what narrows
  // it for anyone else.
  const [players, setPlayers] = useState([])
  const [playersLoading, setPlayersLoading] = useState(false)
  const [playersError, setPlayersError] = useState(null)
  const playersRequested = useRef(false)

  // Stable across renders: AccessBuilder calls this from an effect, so a new
  // identity every render would re-fire it every render.
  const loadPlayers = useCallback(() => {
    if (playersRequested.current) return
    playersRequested.current = true
    setPlayersLoading(true)
    listPlayers()
      .then((rows) => {
        setPlayers(rows)
        setPlayersError(null)
      })
      .catch((err) => {
        setPlayersError(err)
        // Re-loadable: a failed roster read must not permanently disable the
        // child picker for the rest of the session.
        playersRequested.current = false
      })
      .finally(() => setPlayersLoading(false))
  }, [])

  useEffect(() => {
    // Nobody who can neither administer nor approve issues a query at all —
    // same shape as Admin.jsx's effect.
    if (!admin && !approver) return undefined

    let mounted = true
    setLoading(true)
    setError(null)

    // allSettled, not all: the member list is the screen, the profile list is
    // one section of it. A failed profiles read must not blank the accounts an
    // admin came here to manage — it just costs the "waiting for access"
    // section, which then correctly shows nobody rather than a wrong list. The
    // reverse is not true: without the member list there is nothing to
    // subtract, so a failed member read hides the waiting section entirely
    // (handled at the render site) rather than showing every member as
    // "waiting".
    // ⚠️ A COACH ISSUES ONE READ, NOT THREE. listPendingProfiles and
    // listAccessRequests are gated on is_admin_anywhere in the database, so a
    // coach would get empty arrays — correct, but three round trips to learn
    // it, on a screen that for them has exactly one section. The `admin`
    // branch is what keeps those two reads honest rather than defensive.
    Promise.allSettled([
      listClubMembers(),
      admin ? listPendingProfiles() : Promise.resolve([]),
      admin ? listAccessRequests() : Promise.resolve([]),
    ])
      .then(([membersResult, profilesResult, requestsResult]) => {
        if (!mounted) return
        if (membersResult.status === 'fulfilled') {
          setMembers(membersResult.value)
        } else {
          setError(membersResult.reason)
          setMembers([])
        }
        setProfiles(profilesResult.status === 'fulfilled' ? profilesResult.value : [])
        // Same reasoning as the profiles read: a failed requests read costs
        // the notes and the dismissals, not the screen. It fails OPEN, which
        // is the safe direction here - everyone reappears in the waiting
        // list, which is noisier but never hides someone genuinely waiting.
        setRequests(requestsResult.status === 'fulfilled' ? requestsResult.value : [])
      })
      .finally(() => {
        if (mounted) setLoading(false)
      })

    return () => {
      mounted = false
    }
  }, [admin, approver, reloadToken])

  const sortedTeams = useMemo(
    () =>
      [...teams].sort((a, b) => {
        const orderDiff = (a.sort_order ?? 0) - (b.sort_order ?? 0)
        if (orderDiff !== 0) return orderDiff
        return a.name.localeCompare(b.name)
      }),
    [teams],
  )
  const teamsById = useMemo(() => new Map(teams.map((team) => [team.id, team])), [teams])

  // The club to grant into. There is no club context in this app — every
  // screen that needs a club id digs it out of data it already holds
  // (InviteForm reads teams[0]?.club_id, PlayerImport reads it off the
  // caller's own memberships). Both are read here, memberships first: the
  // admin's own membership row names the club they actually administer,
  // whereas teams[0] is only right because this database has exactly one
  // club. It is opportunistic either way — see the report note.
  const clubId = useMemo(
    () =>
      memberships.find((row) => row.club_id)?.club_id ??
      teams.find((team) => team.club_id)?.club_id ??
      null,
    [memberships, teams],
  )

  if (!admin && !approver) return <NotAuthorised />

  // Split by ROW, not by person — see THE THIRD CATEGORY above. `status` is
  // compared against 'pending' rather than 'active' so a row from before the
  // column existed, or one that somehow came back without it, is treated as
  // real access rather than being quietly hidden from the main list.
  const activeMembers = members.filter((member) => member.status !== 'pending')
  const pendingMembers = members.filter((member) => member.status === 'pending')

  const groups = groupByProfile(activeMembers)
  const isFirstLoad = loading && members.length === 0

  // ⚠️ LOOKED UP FROM `groups` EVERY RENDER RATHER THAN HELD IN STATE. The
  // sheet must show what the list shows: saveProfileDetails patches `members`,
  // groups is derived from it, and a snapshot taken when the sheet opened would
  // keep displaying the name that was there before the save.
  const editingGroup = editingKey ? groups.find((g) => g.key === editingKey) ?? null : null
  // ⚠️ ITS OWN BINDING, and the reason is a crash that shipped in the first
  // draft of the sheet. The access rows carry aria-labels built from
  // `displayName`, and when they lived on the list card that name came from
  // `const displayName = group.name ?? …` INSIDE the groups.map callback.
  // Moving the rows into the sheet moved them out of that closure, where
  // nothing declared it — React threw ReferenceError and unmounted the whole
  // screen, so clicking any account blanked the page. Caught by a test, not by
  // reading it back.
  const editingName = editingGroup?.name ?? 'Unnamed member'

  /**
   * Opens the sheet AND seeds the draft from the row.
   *
   * ⚠️ SEEDED HERE, NOT IN AN EFFECT AND NOT ON MOUNT. An effect keyed on
   * editingKey would run after the first paint, so the fields would flash
   * empty and then fill — which on a slow phone reads as "the club has no
   * phone number for this person". Seeding every group on mount would instead
   * build a draft for every member of the club on every render of this screen.
   *
   * The existing draft is kept if there is one, so re-opening a sheet the
   * admin closed mid-edit does not silently discard what they typed.
   */
  function openEditor(group) {
    setProfileEdit((prev) => {
      if (prev[group.key]) return prev
      const profile = group.memberships[0]?.profiles ?? {}
      const split = splitPhone(profile.phone ?? '')
      return {
        ...prev,
        [group.key]: {
          // Falls back to splitting full_name only when first_name is empty —
          // the rows that predate the first/last columns. Everything after
          // that reads the real columns.
          firstName: profile.first_name ?? (group.name ?? '').split(' ')[0] ?? '',
          lastName:
            profile.last_name ?? (group.name ?? '').split(' ').slice(1).join(' ') ?? '',
          phoneCountry: split.country,
          phoneNational: split.national,
          saving: false,
          error: null,
          saved: false,
        },
      }
    })
    setEditingKey(group.key)
  }

  // THE subtraction. listPendingProfiles() returns everyone the admin can
  // read; only the ids with no membership row are actually waiting. The
  // caller's own id is excluded belt-and-braces — an admin always has a
  // membership, so the first filter already removes them, but not if the
  // member list came back short.
  const memberProfileIds = new Set(members.map((member) => member.profile_id).filter(Boolean))
  const unattached = profiles.filter(
    (profile) => !memberProfileIds.has(profile.id) && profile.id !== user?.id,
  )

  // The triage layer on top of that subtraction. `access_requests` holds one
  // row per profile and answers two different questions from the same table:
  // who ASKED (status 'pending', with their note), and who this admin has
  // already waved away (status 'dismissed') - including strangers who never
  // asked at all, which is the case the old screen had no answer for.
  const requestByProfile = new Map(requests.map((row) => [row.profile_id, row]))
  const dismissedIds = new Set(
    requests.filter((row) => row.status === 'dismissed').map((row) => row.profile_id),
  )

  // Someone who asked outranks someone who merely signed in: the first is a
  // person standing there waiting, the second might be nobody at all. Array
  // sort is stable, so newest-first survives inside each group.
  const waiting = unattached
    .filter((profile) => !dismissedIds.has(profile.id))
    .sort(
      (a, b) =>
        Number(Boolean(requestByProfile.get(b.id))) - Number(Boolean(requestByProfile.get(a.id))),
    )
  const dismissed = unattached.filter((profile) => dismissedIds.has(profile.id))

  // People whose ONLY rows are pending. They own a login and are not in
  // `waiting` (they have a membership, so the subtraction above removed them),
  // so without this the login count at the top of the screen would not count
  // them at all — and that count has already been believed and acted on once
  // when it was wrong (see the note beside it).
  const activeProfileIds = new Set(activeMembers.map((member) => member.profile_id).filter(Boolean))
  const pendingOnlyCount = new Set(
    pendingMembers
      .map((member) => member.profile_id)
      .filter((id) => Boolean(id) && !activeProfileIds.has(id)),
  ).size
  const loginCount = groups.length + pendingOnlyCount + waiting.length + dismissed.length

  // Counted from the full club-wide list, so the guard holds even if the
  // caller's other admin row is rendered in some block further down.
  const ownAdminCount = members.filter(
    (member) => member.profile_id === user?.id && member.role === 'admin',
  ).length

  function isOwnLastAdmin(member) {
    return member.profile_id === user?.id && member.role === 'admin' && ownAdminCount <= 1
  }

  function patchTriage(profileId, patch) {
    setTriageState((prev) => ({ ...prev, [profileId]: { ...prev[profileId], ...patch } }))
  }

  // Dismiss and restore both write access_requests and then patch local state
  // rather than refetching: the waiting list is derived from three lists, and
  // a full reload to move one card would flash the whole screen.
  async function dismiss(profile) {
    patchTriage(profile.id, { saving: true, error: null })
    try {
      const row = await dismissAccessRequest({ profileId: profile.id, decidedBy: user?.id })
      // A null row means the write succeeded but the read-back didn't come
      // through. Falling back to a synthetic row keeps the screen honest
      // about what the database now says, instead of leaving the person
      // sitting in the list as though nothing happened.
      const next = row ?? {
        id: `pending:${profile.id}`,
        profile_id: profile.id,
        status: 'dismissed',
        note: requestByProfile.get(profile.id)?.note ?? null,
        created_at: requestByProfile.get(profile.id)?.created_at ?? null,
      }
      setRequests((prev) => [next, ...prev.filter((item) => item.profile_id !== profile.id)])
      patchTriage(profile.id, { saving: false, error: null })
    } catch (err) {
      patchTriage(profile.id, {
        saving: false,
        error: err.message || "Couldn't dismiss this person. Try again.",
      })
    }
  }

  async function restore(profile) {
    patchTriage(profile.id, { saving: true, error: null })
    try {
      await restoreAccessRequest({ profileId: profile.id })
      setRequests((prev) => prev.filter((item) => item.profile_id !== profile.id))
      patchTriage(profile.id, { saving: false, error: null })
    } catch (err) {
      patchTriage(profile.id, {
        saving: false,
        error: err.message || "Couldn't restore this person. Try again.",
      })
    }
  }

  function patchRow(id, patch) {
    setRowState((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }))
  }

  function patchMember(id, patch) {
    setMembers((prev) => prev.map((member) => (member.id === id ? { ...member, ...patch } : member)))
  }

  async function saveMembership(member, { role, teamId }) {
    if ((role === 'admin' ? null : teamId) === (member.role === 'admin' ? null : member.team_id) &&
      role === member.role) {
      return
    }

    if (isOwnLastAdmin(member) && role !== 'admin') {
      patchRow(member.id, { error: LAST_ADMIN_REFUSAL, confirming: false })
      return
    }

    patchRow(member.id, { saving: true, error: null })
    try {
      const updated = await updateMembershipRole({ membershipId: member.id, role, teamId })
      patchMember(member.id, {
        role: updated.role,
        team_id: updated.team_id,
        teams: updated.team_id ? teamsById.get(updated.team_id) ?? null : null,
      })
    } catch (err) {
      patchRow(member.id, { error: err?.message || "We couldn't save that change." })
    } finally {
      patchRow(member.id, { saving: false })
    }
  }

  async function revoke(member) {
    if (isOwnLastAdmin(member)) {
      patchRow(member.id, { error: LAST_ADMIN_REFUSAL, confirming: false })
      return
    }

    patchRow(member.id, { saving: true, error: null })
    try {
      await deleteMembership(member.id)
      setMembers((prev) => prev.filter((row) => row.id !== member.id))
      setRowState((prev) => {
        const next = { ...prev }
        delete next[member.id]
        return next
      })
    } catch (err) {
      patchRow(member.id, {
        error: err?.message || "We couldn't remove that access.",
        saving: false,
        confirming: false,
      })
    }
  }

  /**
   * Approves one self-registered parent: `status` pending -> active. That one
   * column is the whole grant, because private.can_see_team requires 'active'.
   *
   * Patches the row in place rather than refetching. The updated row then
   * fails the `status === 'pending'` filter above, so it leaves the approval
   * queue and appears in that person's block in the main list on the same
   * render — which is exactly what an admin expects to see happen, and costs
   * no round trip. Shares rowState with the main list's rows: a membership is
   * in one section or the other, never both, so the keys cannot collide.
   */
  async function approve(member) {
    patchRow(member.id, { saving: true, error: null })
    try {
      const updated = await approveMembership(member.id)
      patchMember(member.id, { status: updated.status })
      patchRow(member.id, { saving: false })
    } catch (err) {
      patchRow(member.id, {
        saving: false,
        error: err?.message || "We couldn't approve that person.",
      })
    }
  }

  function patchGrant(profileId, patch) {
    setGrantState((prev) => ({ ...prev, [profileId]: { ...prev[profileId], ...patch } }))
  }

  /**
   * Rebuilds the embeds listClubMembers would have supplied for a freshly
   * inserted membership row, so a new row renders identically to every other
   * one without re-querying. The profile, the team and (for a parent/player
   * row) the linked player are all already in hand.
   */
  function decorate(row, profileEmbed) {
    return {
      ...row,
      profiles: profileEmbed,
      teams: row.team_id ? teamsById.get(row.team_id) ?? null : null,
      players: row.player_id
        ? { full_name: players.find((player) => player.id === row.player_id)?.full_name ?? null }
        : null,
    }
  }

  /**
   * Saves a set of access rows for one person, in ONE call — a parent of two
   * children is two rows and must be two rows, not two round trips that can
   * half-fail. grantMemberships validates the whole array before touching the
   * network, so one bad row means nothing is written.
   *
   * `key` scopes the in-flight/error state: a waiting person's builder is
   * keyed by their profile id, an existing person's "Add access" builder by
   * `add:<profile id>`, so the two can never overwrite each other's message.
   */
  async function saveAccess({ key, profileId, clubId: rowClubId, rows, profileEmbed, onDone }) {
    const club = rowClubId ?? clubId
    if (!club) {
      patchGrant(key, { error: NO_CLUB_KNOWN })
      return
    }

    patchGrant(key, { saving: true, error: null })
    try {
      const created = await grantMemberships(
        rows.map((row) => ({
          profileId,
          clubId: club,
          role: row.role,
          teamId: row.teamId ?? null,
          playerId: row.playerId ?? null,
        })),
      )

      setMembers((prev) => [...prev, ...created.map((row) => decorate(row, profileEmbed))])
      setGrantState((prev) => {
        const next = { ...prev }
        delete next[key]
        return next
      })
      onDone?.()
    } catch (err) {
      patchGrant(key, {
        saving: false,
        error: err?.message || "We couldn't give that person access.",
      })
    }
  }

  // A waiting person: the new rows move them out of the waiting list and into
  // the main one in place. A blank full_name becomes null, not '', because the
  // list falls back on nullish only — an empty string would render as a
  // nameless block that looks like a bug.
  function grant(profile, rows) {
    return saveAccess({
      key: profile.id,
      profileId: profile.id,
      rows,
      profileEmbed: {
        full_name: profile.full_name?.trim() ? profile.full_name : null,
        email: profile.email ?? null,
      },
      onDone: () => setProfiles((prev) => prev.filter((row) => row.id !== profile.id)),
    })
  }

  // An existing person: their club id comes off a row they already hold, which
  // is better evidence than the screen-wide guess.
  function addAccess(group, rows) {
    return saveAccess({
      key: `add:${group.key}`,
      profileId: group.profileId,
      clubId: group.memberships.find((member) => member.club_id)?.club_id ?? null,
      rows,
      profileEmbed: { full_name: group.name, email: group.email },
      onDone: () =>
        setAdding((prev) => {
          const next = { ...prev }
          delete next[group.key]
          return next
        }),
    })
  }

  /**
   * Saves the three things an admin may change about someone else.
   *
   * ⚠️ updateMemberProfile, NOT updateMyProfile. The difference is one column:
   * updateMyProfile also writes `name_confirmed_at`, which records THE PERSON
   * STATING THEIR OWN NAME and is what stops NamePrompt asking them again. An
   * admin typing a name here is not that, and writing it would silence a
   * question that should still be asked.
   */
  async function saveProfileDetails(group) {
    const draft = profileEdit[group.key]
    if (!draft || !group.profileId) return

    // ⚠️ CHECKED HERE AS WELL AS IN updateMemberProfile, and not as belt and
    // braces. `full_name` is rebuilt from first + last by the
    // profiles_sync_name trigger, so a blank first name renders as an account
    // with no name ANYWHERE in the app — including in the approval queue, where
    // "No name yet" is what a coach is asked to judge a stranger by.
    //
    // Client-side because every other form in this app refuses the obvious
    // mistake without spending a round trip on it, and because the data layer's
    // message ("Enter a first name.") is the one shown either way.
    if (!String(draft.firstName ?? '').trim()) {
      setProfileEdit((prev) => ({
        ...prev,
        [group.key]: { ...prev[group.key], saving: false, saved: false, error: 'Enter a first name.' },
      }))
      return
    }

    setProfileEdit((prev) => ({
      ...prev,
      [group.key]: { ...draft, saving: true, error: null, saved: false },
    }))

    try {
      const updated = await updateMemberProfile({
        profileId: group.profileId,
        firstName: draft.firstName,
        lastName: draft.lastName,
        phone: joinPhone(draft.phoneCountry, draft.phoneNational),
      })

      // One profile, potentially several membership rows — the new details
      // have to land on every one of them, which is exactly why they live on
      // profiles rather than on memberships. Every membership row for this profile carries the same embedded profile object, so all of them are patched.
      setMembers((prev) =>
        prev.map((member) =>
          member.profile_id === group.profileId
            ? {
                ...member,
                profiles: {
                  ...member.profiles,
                  full_name: updated.full_name,
                  first_name: updated.first_name,
                  last_name: updated.last_name,
                  phone: updated.phone,
                },
              }
            : member,
        ),
      )
      setProfileEdit((prev) => ({
        ...prev,
        [group.key]: { ...prev[group.key], saving: false, error: null, saved: true },
      }))
    } catch (err) {
      setProfileEdit((prev) => ({
        ...prev,
        [group.key]: {
          ...prev[group.key],
          saving: false,
          saved: false,
          error: err?.message || "We couldn't save those details.",
        },
      }))
    }
  }


  // ── THE COACH / TEAM MANAGER VIEW ──────────────────────────────────────
  //
  // A separate, earlier return rather than a dozen `{admin && ...}` guards
  // sprinkled through the admin screen below. Two reasons, and the second is
  // the one that matters:
  //
  //   1. Every count in the header — "n with access", "n access rows",
  //      "n logins" — is computed from rows a coach cannot read. They would
  //      render as zero and read as "the club has no members", which is a
  //      falsehood presented as a fact. The whole point of the note beside
  //      those counts is that a wrong number here has already cost an hour.
  //   2. A missed guard in a long JSX tree is invisible. Here, anything a
  //      coach must not see is simply not in this return.
  //
  // The database refuses them either way — every write below is behind
  // `memb manage`, still is_admin(club_id) — so a slip would show a control
  // that fails rather than one that works. This is the readable belt to that
  // braces.
  if (!admin) {
    return (
      <section>
        <div className="mb-3.5 mt-1">
          <h2 className="text-[21px] font-extrabold tracking-[-0.2px] text-ink">Approvals</h2>
          <p className={`text-[13px] font-medium ${MUTED_ON_PAPER}`}>
            {pendingMembers.length === 0
              ? 'Nobody is waiting for your age groups.'
              : `${pendingMembers.length} waiting for your age groups`}
          </p>
        </div>

        {isFirstLoad && (
          <Card className="flex justify-center py-10">
            <Spinner label="Loading approvals…" />
          </Card>
        )}

        {!isFirstLoad && error && (
          <Card role="alert" className="p-4 text-[13px] font-semibold text-brand-deep">
            We couldn&apos;t load the approvals. Try again in a moment.
          </Card>
        )}

        {!isFirstLoad && !error && pendingMembers.length === 0 && (
          <Card className="p-6 text-center">
            <p className={`text-sm leading-relaxed ${MUTED_ON_PAPER}`}>
              When a parent registers a player in one of your age groups, they appear
              here for you to approve.
            </p>
          </Card>
        )}

        {/* ⚠️ NO CLIENT-SIDE FILTER ON teamsById OR ON THE CALLER'S SQUADS.
            The list is already exactly their squads' pending rows — the
            "memb read squad staff pending" policy is what narrows it, in the
            database, and a second filter here would be a place for the two to
            disagree. If this list ever shows a squad they do not coach, the
            policy is wrong and that is what needs fixing. */}
        {!isFirstLoad && !error && pendingMembers.length > 0 && (
          <PendingApprovals
            members={pendingMembers}
            teamsById={teamsById}
            rowState={rowState}
            onApprove={approve}
          />
        )}
      </section>
    )
  }

  return (
    <section>
      <div className="mb-3.5 mt-1">
        <h2 className="text-[21px] font-extrabold tracking-[-0.2px] text-ink">Accounts</h2>
        {/* ⚠️ SHOWS BOTH NUMBERS ON PURPOSE, and the second one is the point.
            This read "{n} people · {n} access rows", which everybody — including
            Jay, who built the thing — took to mean "there are n accounts". It
            does not. It counts people WITH ACCESS. On 8 Aug 2026 the screen said
            "2 people" while five logins existed, three of them revoked or
            dismissed; the consequence was an hour spent debugging a
            confirmation email that was never going to be sent, because signing
            up again on a surviving login is a no-op that sends nothing.
            REVOKING ACCESS DOES NOT DELETE A LOGIN, and nothing in this app
            can — see the note under "Waiting for access". */}
        {/* ⚠️ "with access" and "access rows" both count ACTIVE rows only. A
            pending row is not access — private.can_see_team refuses it — and
            counting it here would restate exactly the confusion the note above
            is about, in the same sentence that admits to it. The login count
            still includes people whose only rows are pending: they do have a
            login, they just cannot use it yet. */}
        <p className={`text-[13px] font-medium ${MUTED_ON_PAPER}`}>
          {groups.length} with access · {activeMembers.length}{' '}
          {activeMembers.length === 1 ? 'access row' : 'access rows'} · {loginCount}{' '}
          {loginCount === 1 ? 'login' : 'logins'}
        </p>
      </div>

      {/* Stated once, near the top, instead of a "reset password" button that
          could not work from the browser. */}
      <p className={`mb-3.5 text-[12.5px] leading-relaxed ${MUTED_ON_PAPER}`}>
        Email addresses come from each person&apos;s login and can&apos;t be changed here.
        Passwords are self-serve — members reset their own from the sign-in screen.
      </p>

      {isFirstLoad && (
        <Card className="flex justify-center py-10">
          <Spinner label="Loading accounts…" />
        </Card>
      )}

      {/* The third category — see THE THIRD CATEGORY at the top of this file.
          Rendered ABOVE "Waiting for access" because a pending row is the more
          actionable of the two: a named child, in a named age group, behind a
          confirmed email address.

          Shown only when there is something in it. The other two sections
          always render because their empty state carries a fact an admin needs
          ("anyone who signs up will appear here"); this one would only be
          telling them that the thing that has not happened has not happened. */}
      {!isFirstLoad && !error && pendingMembers.length > 0 && (
        <PendingApprovals
          members={pendingMembers}
          teamsById={teamsById}
          rowState={rowState}
          onApprove={approve}
        />
      )}

      {/* Hidden while the member list is missing: without it there is nothing
          to subtract, and every existing member would show up as "waiting". */}
      {!isFirstLoad && !error && (
        <section data-testid="waiting-for-access" className="mb-5">
          <h3 className="text-[16px] font-extrabold tracking-[-0.2px] text-ink">
            Waiting for access
          </h3>
          <p className={`mt-1 text-[12.5px] leading-relaxed ${MUTED_ON_PAPER}`}>
            Anyone can create a login with their email address, but they see nothing at all in
            the app until an admin gives them access. People who asked for access are listed
            first, with whatever they said about themselves. Anyone you don&apos;t recognise can
            be dismissed — that only clears them off this list, it doesn&apos;t delete their
            login, and you can undo it below.
          </p>
          {/* Added 8 Aug 2026. The sentence above already said dismissing does
              not delete a login, and it still was not enough — the count at the
              top of the screen said "2 people" and that is what got believed.
              This spells out the consequence rather than the mechanism, because
              the consequence is the bit that bites: a surviving login cannot
              sign up again, so the person gets no email and no error. */}
          <p className={`mt-1 text-[12.5px] leading-relaxed ${MUTED_ON_PAPER}`}>
            <strong className="font-bold">Revoking access doesn&apos;t delete a login
            either</strong>, and nothing in this app can — only the Supabase dashboard.
            Someone whose access you revoked can still sign in; they just see nothing.
            If they try to register again they get no email and no error, because the
            login already exists.
          </p>

          {waiting.length === 0 ? (
            <Card className="mt-2.5">
              <Empty message="Nobody is waiting for access. Anyone who signs up without an invite will appear here." />
            </Card>
          ) : (
            <>
              <div className="mt-2.5 flex flex-col gap-3">
                {waiting.map((profile) => {
                  const state = grantState[profile.id] ?? {}
                  const triage = triageState[profile.id] ?? {}
                  const request = requestByProfile.get(profile.id)
                  const displayName = profile.full_name?.trim() || 'No name yet'
                  const label = profile.email || displayName
                  const signedUp = formatJoined(profile.created_at)

                  return (
                    <Card
                      key={profile.id}
                      data-testid="waiting-person"
                      className="flex flex-wrap items-center gap-x-3 gap-y-2 px-[14px] py-3"
                    >
                      <span
                        className="grid h-9 w-9 shrink-0 place-items-center rounded-[11px] bg-surface-mute text-[12px] font-extrabold tracking-[.5px] text-ink-muted"
                        aria-hidden="true"
                      >
                        {initials(profile.full_name?.trim() || profile.email || '?')}
                      </span>

                      <div className="min-w-0">
                        <span className="block text-[15px] font-bold text-ink">
                          {displayName}
                          {request && (
                            <span
                              data-testid="asked-badge"
                              className="ml-2 rounded-pill bg-brand/10 px-2 py-0.5 align-middle text-[11px] font-bold uppercase tracking-[0.06em] text-brand-deep"
                            >
                              Asked
                            </span>
                          )}
                        </span>
                        <span className={`block text-[12.5px] ${MUTED_ON_PAPER}`}>
                          {profile.email ?? 'No email on file'}
                          {signedUp ? ` · signed up ${signedUp}` : ''}
                        </span>
                        {/* Their own words. This is the whole reason the
                            request row exists: "Parent of Sam Muir, U10" is
                            what makes an unknown email actionable. */}
                        {request?.note && (
                          <span
                            data-testid="request-note"
                            className={`mt-1 block text-[12.5px] italic leading-relaxed ${MUTED_ON_PAPER}`}
                          >
                            “{request.note}”
                          </span>
                        )}
                      </div>

                      <span className="flex-1" />

                      {/* One builder per waiting person. A person waiting for
                          access can legitimately need several rows on the way
                          in — a parent of two children is the ordinary case,
                          not an edge one — so this is the same component the
                          existing-person blocks use, with no existing rows to
                          guard against. */}
                      <AccessBuilder
                        label={label}
                        teams={sortedTeams}
                        players={players}
                        playersLoading={playersLoading}
                        playersError={playersError}
                        onNeedPlayers={loadPlayers}
                        saving={Boolean(state.saving)}
                        error={state.error}
                        submitLabel="Give access"
                        onSubmit={(rows) => grant(profile, rows)}
                      />

                      <div className="flex flex-col items-end gap-1">
                        {triage.error && (
                          <span
                            role="alert"
                            className="text-[12px] font-semibold text-brand-deep"
                          >
                            {triage.error}
                          </span>
                        )}
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => dismiss(profile)}
                          disabled={Boolean(triage.saving)}
                        >
                          {triage.saving ? 'Dismissing…' : 'Dismiss'}
                        </Button>
                      </div>
                    </Card>
                  )
                })}
              </div>

              <p className={`mt-2 text-[12.5px] leading-relaxed ${MUTED_ON_PAPER}`}>
                Dismissing someone is safe and reversible: with no access they could already see
                nothing, and dismissing only takes them off this list. It does not delete their
                login — closing an account itself isn&apos;t something this screen can do.
              </p>
            </>
          )}
        </section>
      )}

      {/* Dismissed people. Collapsed by default and hidden entirely when the
          list is empty: the point of dismissing is to get someone out of the
          way. But "out of the way" must not mean "unrecoverable" — an admin
          who dismisses the wrong person needs a route back, and no other
          screen lists these people at all. Restoring DELETES the dismissal
          rather than marking it pending, so nobody is credited with a request
          they never made (see src/data/accessRequests.js). */}
      {!isFirstLoad && !error && dismissed.length > 0 && (
        <section data-testid="dismissed-requests" className="mb-5">
          <button
            type="button"
            onClick={() => setShowDismissed((open) => !open)}
            aria-expanded={showDismissed}
            className={`text-[12.5px] font-bold underline decoration-line underline-offset-4 transition hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 ${MUTED_ON_PAPER}`}
          >
            {showDismissed ? 'Hide' : 'Show'} dismissed ({dismissed.length})
          </button>

          {showDismissed && (
            <div className="mt-2.5 flex flex-col gap-3">
              {dismissed.map((profile) => {
                const triage = triageState[profile.id] ?? {}
                const request = requestByProfile.get(profile.id)
                const displayName = profile.full_name?.trim() || 'No name yet'

                return (
                  <Card
                    key={profile.id}
                    data-testid="dismissed-person"
                    className="flex flex-wrap items-center gap-x-3 gap-y-2 px-[14px] py-3 opacity-80"
                  >
                    <div className="min-w-0">
                      <span className="block text-[15px] font-bold text-ink">{displayName}</span>
                      <span className={`block text-[12.5px] ${MUTED_ON_PAPER}`}>
                        {profile.email ?? 'No email on file'}
                      </span>
                      {request?.note && (
                        <span
                          className={`mt-1 block text-[12.5px] italic leading-relaxed ${MUTED_ON_PAPER}`}
                        >
                          “{request.note}”
                        </span>
                      )}
                    </div>

                    <span className="flex-1" />

                    <div className="flex flex-col items-end gap-1">
                      {triage.error && (
                        <span role="alert" className="text-[12px] font-semibold text-brand-deep">
                          {triage.error}
                        </span>
                      )}
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => restore(profile)}
                        disabled={Boolean(triage.saving)}
                      >
                        {triage.saving ? 'Restoring…' : 'Restore'}
                      </Button>
                    </div>
                  </Card>
                )
              })}
            </div>
          )}
        </section>
      )}

      {!isFirstLoad && error && (
        <Card role="alert" className="p-6 text-center">
          <h3 className="text-base font-extrabold text-brand-deep">We couldn&apos;t load accounts</h3>
          <p className="mt-2 text-sm leading-relaxed text-brand-deep">
            {error.message || 'Something went wrong. Try again.'}
          </p>
          <Button onClick={() => setReloadToken((token) => token + 1)} className="mt-4">
            Try again
          </Button>
        </Card>
      )}

      {!isFirstLoad && !error && groups.length === 0 && (
        <Card>
          <Empty message="Nobody has access yet. Accounts appear here once someone accepts an invite." />
        </Card>
      )}

      {!isFirstLoad && !error && groups.length > 0 && (
        <div className="flex flex-col gap-3">
          {groups.map((group) => {
            const displayName = group.name ?? 'Unnamed member'
            // One line summarising the access rows, so the list still answers
            // "what is this person?" without opening anything.
            const summary = group.memberships
              .map((member) => {
                const label = ROLE_OPTIONS.find((option) => option.value === member.role)?.label ?? member.role
                const team = member.team_id ? teamsById.get(member.team_id)?.name : null
                return team ? `${label} · ${team}` : label
              })
              .join(' · ')

            return (
              <Card key={group.key} data-testid="account-person" className="overflow-hidden">
                {/* ⚠️ THE WHOLE ROW OPENS THE EDITOR, and there is still a real
                    focusable button inside it. Same reasoning as the schedule
                    table: the row is a mouse convenience, the button is the
                    keyboard and screen-reader path. */}
                <div
                  onClick={() => openEditor(group)}
                  className="flex cursor-pointer flex-wrap items-center gap-3 px-[14px] py-3 hover:bg-surface-mute"
                >
                  <span
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-[11px] bg-[image:linear-gradient(135deg,theme(colors.brand.deep),theme(colors.brand.DEFAULT))] text-[12px] font-extrabold tracking-[.5px] text-white"
                    aria-hidden="true"
                  >
                    {initials(displayName)}
                  </span>

                  <div className="min-w-0 flex-1">
                    <span data-testid="account-name" className="block text-[15px] font-bold text-ink">
                      {displayName}
                    </span>
                    <span data-testid="account-email" className={`block text-[12.5px] ${MUTED_ON_PAPER}`}>
                      {group.email ?? 'No email on file'}
                    </span>
                    {summary && (
                      <span data-testid="account-summary" className={`block text-[12.5px] ${MUTED_ON_PAPER}`}>
                        {summary}
                      </span>
                    )}
                  </div>

                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Edit ${displayName}`}
                    onClick={(clickEvent) => {
                      // Without this the row handler fires too and the sheet is
                      // opened twice for one click — harmless while it only
                      // assigns state, and a double submit the moment it does
                      // anything else.
                      clickEvent.stopPropagation()
                      openEditor(group)
                    }}
                  >
                    Edit
                  </Button>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {/* ── THE EDIT PERSON SHEET (Jay, 9 Aug 2026) ──────────────────────
          "admins need the ability to click on account and change all details,
          except the email, i don't see any ability to do this in the accounts
          section" — and he was right: the screen wrote the legacy `full_name`
          and had no phone control at all, though the column grants from 8 Aug
          have permitted first_name, last_name and phone since the day they
          landed. The permission existed; the fields did not.

          Everything about a person is in one place now: their name, their
          phone, every access row with its role and squad, and Add access.
          Email is shown and NOT editable — it is the login identity, and the
          column grants for `authenticated` exclude it, so a form field for it
          would fail the whole update rather than quietly succeeding. */}
      {editingGroup && (
        <Sheet
          open
          onClose={() => setEditingKey(null)}
          title={`Edit ${editingGroup.name ?? 'member'}`}
        >
          <PersonDetailsForm
            group={editingGroup}
            state={profileEdit[editingGroup.key]}
            onChange={(patch) =>
              setProfileEdit((prev) => ({
                ...prev,
                [editingGroup.key]: { ...prev[editingGroup.key], ...patch },
              }))
            }
            onSave={() => saveProfileDetails(editingGroup)}
          />

          <div className="mt-5">
            <h4 className="mb-2 text-[12.5px] font-extrabold uppercase tracking-[.4px] text-ink-muted">
              Access
            </h4>

                {/* The avatar, the inline name editor and the email that used
                    to live here are gone: PersonDetailsForm above is all three,
                    editable, in one place. Only Add access survives from this
                    header — it belongs with the access rows it adds to. */}
                <div className="mb-2 flex justify-end">
                  {editingGroup.profileId && !adding[editingGroup.key] && (
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Add access for ${editingName}`}
                      onClick={() => setAdding((prev) => ({ ...prev, [editingGroup.key]: true }))}
                    >
                      Add access
                    </Button>
                  )}
                </div>

                {adding[editingGroup.key] && (
                  <div
                    data-testid="add-access"
                    className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line bg-surface-mute px-[14px] py-2.5"
                  >
                    {/* `existing` is what makes the duplicate guard possible:
                        the rows this person already holds.

                        ⚠️ ACTIVE **AND** PENDING. The group itself is
                        active-only (see THE THIRD CATEGORY at the top of this
                        file), but memberships_unique_grant does not include
                        `status` — so a grant identical to a row still awaiting
                        approval is refused by the database with a 23505 the
                        admin cannot interpret. Passing the pending rows in
                        turns that into the builder's own "they already have
                        this" message, before any network call. */}
                    <AccessBuilder
                      label={editingName}
                      teams={sortedTeams}
                      players={players}
                      playersLoading={playersLoading}
                      playersError={playersError}
                      onNeedPlayers={loadPlayers}
                      existing={[
                        ...editingGroup.memberships,
                        ...pendingMembers.filter(
                          (member) => member.profile_id === editingGroup.profileId,
                        ),
                      ]}
                      saving={Boolean(grantState[`add:${editingGroup.key}`]?.saving)}
                      error={grantState[`add:${editingGroup.key}`]?.error}
                      submitLabel="Add access"
                      onSubmit={(rows) => addAccess(editingGroup, rows)}
                      onCancel={() =>
                        setAdding((prev) => {
                          const next = { ...prev }
                          delete next[editingGroup.key]
                          return next
                        })
                      }
                    />
                  </div>
                )}

                {editingGroup.memberships.map((member) => {
                  const state = rowState[member.id] ?? {}
                  const teamName = member.team_id
                    ? teamsById.get(member.team_id)?.name ?? member.teams?.name ?? null
                    : null
                  const rowLabel = `${editingName} (${teamName ?? 'club-wide'})`
                  const joined = formatJoined(member.created_at)

                  return (
                    <div
                      key={member.id}
                      data-testid="account-membership"
                      className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line px-[14px] py-2.5 last:border-b-0"
                    >
                      <Badge tone={member.role}>{member.role}</Badge>

                      <select
                        className={INLINE_CONTROL}
                        aria-label={`Role for ${rowLabel}`}
                        value={member.role}
                        disabled={Boolean(state.saving)}
                        onChange={(event) =>
                          saveMembership(member, { role: event.target.value, teamId: member.team_id })
                        }
                      >
                        {ROLE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>

                      {member.role === 'admin' ? (
                        <span className={`px-2 text-[13px] ${MUTED_ON_PAPER}`}>All age groups</span>
                      ) : (
                        <select
                          className={INLINE_CONTROL}
                          aria-label={`Age group for ${rowLabel}`}
                          value={member.team_id ?? ''}
                          disabled={Boolean(state.saving)}
                          onChange={(event) =>
                            saveMembership(member, { role: member.role, teamId: event.target.value })
                          }
                        >
                          <option value="">No age group</option>
                          {sortedTeams.map((team) => (
                            <option key={team.id} value={team.id}>
                              {team.name}
                            </option>
                          ))}
                        </select>
                      )}

                      {/* Linked player (spec §2's column list). A membership
                          points at a players row only for the roles where it
                          means something — a parent's child, or a player's own
                          record — so a null player_id is the NORMAL case for
                          admin and coach rows, not missing data. Hence a plain
                          "—" placeholder rather than a warning: the column has
                          to stay legible at a glance for a club whose admins
                          and coaches will never have one. The name comes from
                          listClubMembers' players(full_name) embed; the raw
                          uuid is never shown, since it would mean nothing to
                          anyone reading this screen. */}
                      <span
                        data-testid="account-linked-player"
                        className={`text-[12.5px] ${MUTED_ON_PAPER}`}
                      >
                        {member.player_id ? (
                          <>
                            <span className="sr-only">Linked player: </span>
                            {member.players?.full_name ?? 'Unknown player'}
                          </>
                        ) : (
                          <>
                            <span className="sr-only">No linked player</span>
                            <span aria-hidden="true">—</span>
                          </>
                        )}
                      </span>

                      {joined && (
                        <span className={`text-[12.5px] ${MUTED_ON_PAPER}`}>Joined {joined}</span>
                      )}

                      <span className="flex-1" />

                      {state.confirming ? (
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="text-[12.5px] font-semibold text-brand-deep">
                            Remove this access?
                          </span>
                          <Button
                            variant="danger"
                            size="sm"
                            disabled={Boolean(state.saving)}
                            onClick={() => revoke(member)}
                          >
                            {state.saving ? 'Removing…' : `Yes, revoke ${editingName}`}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={Boolean(state.saving)}
                            onClick={() => patchRow(member.id, { confirming: false })}
                          >
                            Cancel
                          </Button>
                        </span>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={`Revoke access for ${rowLabel}`}
                          disabled={Boolean(state.saving)}
                          onClick={() => patchRow(member.id, { confirming: true, error: null })}
                        >
                          Revoke access
                        </Button>
                      )}

                      {state.error && (
                        <span
                          role="alert"
                          className="basis-full text-[12.5px] font-semibold text-brand-deep"
                        >
                          {state.error}
                        </span>
                      )}

                      {/* ⚠️ SUPER ADMIN ONLY, AND HIDING IT IS NOT THE
                          ENFORCEMENT. The column grant on `memberships` and
                          the set_admin_rights RPC are what actually refuse an
                          ordinary admin — see AdminRightsEditor's header and
                          db/tests/rls-super-admin.sql. This gate exists so an
                          ordinary admin is not shown a control that would only
                          fail. */}
                      {member.role === 'admin' && viewerIsSuper && (
                        <AdminRightsEditor
                          membership={member}
                          label={rowLabel}
                          onChanged={() => setReloadToken((token) => token + 1)}
                        />
                      )}
                    </div>
                  )
                })}
          </div>
        </Sheet>
      )}
    </section>
  )
}
