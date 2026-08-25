import { supabase } from '../lib/supabase'
import { SQUAD_STAFF_ROLES } from '../lib/scope.js'
import { compareSquadStaff } from '../lib/squadStaff.js'
import { unwrapCapped, withCap } from './limits.js'
import { signStaffPhotoUrls } from './photos.js'

// Squad staff — who coaches, manages and doctors each age group.
//
// Read by /admin/staff (src/screens/AdminStaff.jsx), which exists to answer one
// question a club-level person cannot answer anywhere else today: WHICH SQUADS
// HAVE NOBODY. Measured 13 Aug 2026, the answer was twelve of fifteen.
//
// ⚠️ EVERY SQUAD COMES BACK, INCLUDING THE EMPTY ONES, AND THAT IS THE FEATURE.
// A list built from memberships outward would show only the squads that already
// have staff — hiding precisely the rows somebody needs to act on. So `teams` is
// the base and staff are attached to it, never the other way round.
//
// ⚠️ NO RLS CHANGE WAS NEEDED FOR ANY OF THIS. `profile read club admin`
// (`private.shares_admin_club(id)`) has let an admin read every profile in the
// club since 3 Aug — it is what the Accounts screen has always used. A
// member-facing version of this screen is a different matter and needs its own
// policy; see claude/plans/2026-08-13-squad-staff-on-home.md.

/**
 * ⚠️ TWO QUERIES AND A CLIENT-SIDE JOIN, NOT ONE EMBEDDED READ, AND THAT IS A
 * DELIBERATE RETREAT FROM THE FIRST DESIGN.
 *
 * The tidy version is one read from `teams` embedding filtered memberships. It
 * depends on PostgREST returning a parent row with an EMPTY array when an
 * embedded filter matches nothing — rather than dropping the parent. If that
 * behaviour is not what we assumed, the twelve empty squads vanish from the
 * screen, which is the one thing this screen exists to show, and it would look
 * like "no gaps" rather than like a bug.
 *
 * Two queries cannot fail that way. At fifteen squads the extra round trip is
 * not measurable, and the join is four lines. Cleverness here buys nothing and
 * risks the whole point of the feature.
 */
export async function listSquadStaff() {
  const [teams, staff] = await Promise.all([
    (async () => {
      const { data, error } = await withCap(
        supabase.from('teams').select('id, name, sort_order'),
      )
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true })
      if (error) throw error
      return unwrapCapped(data, 'squads', 'This club has more squads than this screen can show.')
    })(),
    (async () => {
      // ⚠️ ACTIVE ONLY. A pending coach has not been approved, and listing them
      // would make a squad read as staffed when nobody has agreed to it yet —
      // the opposite of what this screen is for.
      const { data, error } = await withCap(
        supabase
          .from('memberships')
          .select('id, profile_id, team_id, role, title, is_head_coach, profiles(full_name, email, phone, photo_path, photo_focus_x, photo_focus_y)')
          .in('role', SQUAD_STAFF_ROLES)
          .eq('status', 'active')
          .not('team_id', 'is', null),
      )
      if (error) throw error
      return unwrapCapped(data, 'staff', 'Narrow this down before showing it all at once.')
    })(),
  ])

  // ⚠️ SIGNED IN ONE BATCH, NOT PER ROW. `staff-photos` is a private bucket, so
  // every face needs a signed URL — and this screen lists the WHOLE club, so a
  // signature per row would be one request per staff member. The member-facing
  // listMySquadStaff already does it this way; this is the same call.
  const urls = await signStaffPhotoUrls(staff.map((row) => row.profiles?.photo_path))

  const byTeam = new Map()
  for (const row of staff) {
    const list = byTeam.get(row.team_id) ?? []
    list.push({
      ...toStaffMember(row),
      photoUrl: urls[row.profiles?.photo_path] ?? null,
    })
    byTeam.set(row.team_id, list)
  }

  return teams.map((team) => ({
    id: team.id,
    name: team.name,
    // Jay, 25 Aug 2026: reverse the old "name only" ruling. Home (and this
    // admin directory, which shares compareSquadStaff) lists Head Coach, then
    // Team Manager(s), then Assistant Coaches, then Medics. Same role: name
    // order. The comparator lives in src/lib/squadStaff.js so a mocked data
    // module cannot drop it.
    staff: (byTeam.get(team.id) ?? []).sort(compareSquadStaff),
  }))
}

/**
 * One staff row, flattened for rendering.
 *
 * ⚠️ THE NAME FALLBACK CHECKS FOR BLANK, NOT JUST NULL, AND THIS REPO HAS
 * ALREADY SHIPPED THE OTHER VERSION. `full_name ?? 'Unnamed'` looks right and
 * lets an EMPTY STRING through, producing a nameless row that reads as a
 * rendering bug — fixed at two sites on 13 Aug (`02e9a05`) after a first pass
 * missed them. `src/data/members.js` refuses to WRITE a blank name for the same
 * reason; this is the read side of the same rule.
 *
 * Email is the fallback rather than a placeholder because it identifies the
 * person, which "Unnamed member" does not — and an admin looking at a gap needs
 * to know who to chase.
 */
export function toStaffMember(row) {
  const name = String(row.profiles?.full_name ?? '').trim()
  const email = String(row.profiles?.email ?? '').trim()
  return {
    membershipId: row.id,
    // ⚠️ THE PROFILE ID, NOT ONLY THE MEMBERSHIP ID. A photo key is built from
    // the PROFILE (`<profile-id>/<timestamp>.jpg`) and `set_staff_photo` keys
    // off it too, so a shape carrying only the membership id cannot upload.
    profileId: row.profile_id ?? null,
    role: row.role,
    title: String(row.title ?? '').trim() || null,
    // ⚠️ THE FLAG, NOT THE TITLE, AND THEY ARE NOT THE SAME QUESTION. `title`
    // is a label an admin types and it grants nothing; `is_head_coach` is what
    // the approval e-mails read to decide who hears about a registration. A
    // squad can say "Head Coach" and not carry the flag — that is exactly the
    // drift the flag exists to end, and the screen shows both so it is visible.
    isHeadCoach: row.is_head_coach === true,
    name: name || email || 'No name yet',
    email: email || null,
    phone: String(row.profiles?.phone ?? '').trim() || null,
    // The storage KEY, never a URL — a private bucket has no durable URL, and
    // a stored one is a stored thing that stops working. The Home card carries
    // a signed `photoUrl` alongside this; the admin directory does not select
    // the column at all and gets null, which renders as initials.
    photoPath: row.profiles?.photo_path ?? null,
    // ⚠️ MAPPED HERE RATHER THAN AT EACH CALL SITE, AND IT USED TO BE THE OTHER
    // WAY. `listSquadStaff` built this itself and `listMySquadStaff` — the Home
    // card, the surface the whole positioning feature exists to control —
    // simply did not, so a repositioned photo moved on /admin/staff and stayed
    // stubbornly centred on Home. One mapping cannot be half-applied.
    //
    // ⚠️ NULL RATHER THAN `{x: 50, y: 50}` FOR "never positioned". The renderers
    // already default a null through `focusToObjectPosition`, and a synthetic
    // centre here would make "nobody has touched this" indistinguishable from
    // "somebody chose the middle" for anything that later wants to tell them
    // apart — the picker's own reset among them.
    focus: toFocus(row.profiles),
  }
}

/**
 * The two focal-point columns as one point, or null.
 *
 * ⚠️ BOTH NULL MEANS NULL, BUT ONE NULL DOES NOT. The columns are written
 * together by every write path, so a half-set pair is not a state this app
 * creates — but a smallint of 0 is a perfectly legitimate focal point (the very
 * top or the far left of a photo), and `photo_focus_x || null` would throw it
 * away. Compare against null explicitly.
 */
function toFocus(profile) {
  const x = profile?.photo_focus_x
  const y = profile?.photo_focus_y
  if (x == null && y == null) return null
  return { x, y }
}

/**
 * The staff of the squads the SIGNED-IN PERSON is attached to, for the Home
 * card. Phase 3 of claude/plans/2026-08-13-squad-staff-on-home.md.
 *
 * ⚠️ AN RPC, NOT A TABLE READ, AND THAT IS THE SECURITY DESIGN RATHER THAN A
 * STYLE CHOICE. A parent cannot read another member's `profiles` row at all —
 * the four SELECT policies on that table are own / club-admin / two pending
 * cases, and none of them covers "a coach on my child's squad". The obvious fix
 * is a fifth policy, and it is WRONG: **RLS authorises ROWS, not COLUMNS**, so a
 * policy wide enough to show a coach's name is wide enough to hand over their
 * `email` and `phone` too, whatever this screen chooses to draw.
 *
 * `public.my_squad_staff()` is a SECURITY DEFINER function with a fixed seven-
 * column result, so `is_super`, `admin_rights` and everything else on those two
 * tables are structurally unreachable. See
 * db/migrations/20260813_my_squad_staff.sql.
 *
 * ⚠️ CONTACT DETAILS ARE DELIBERATE. Jay, 13 Aug 2026: "the staff automatically
 * opts in when accepting the position". Do not narrow this to name-and-title on
 * the strength of the plan document — the plan recommended an opt-in toggle and
 * was overruled.
 *
 * ⚠️ NO `team_id` ARGUMENT, AND DO NOT ADD ONE. The function decides scope from
 * `auth.uid()` via `private.can_see_team`. A team id parameter would be a value
 * the client picks, which is the shape of every "filter in the client" bug this
 * repo has already written up — and it would buy nothing, since the result is
 * bounded by the club's staff count, not its membership.
 */
export async function listMySquadStaff() {
  const { data, error } = await supabase.rpc('my_squad_staff')
  if (error) throw error

  const rows = data ?? []

  // ⚠️ SIGNED ONCE, IN A BATCH, BEFORE ANYTHING RENDERS. `staff-photos` is a
  // PRIVATE bucket, so there is no durable URL — `photo_path` is an object key
  // and a viewable URL has to be signed and expires. Signing per card would be
  // one sequential round trip per person before the first face appeared; a
  // parent in two squads with three staff each would wait for six.
  //
  // ⚠️ A FAILURE HERE IS NOT AN ERROR. Keys that will not sign are simply
  // absent from the result, so `photoUrl` comes out undefined and the card
  // falls back to initials — which is what somebody with no photo already
  // looks like, and today that is everybody. An error box where a face should
  // be is worse than a monogram in every one of those cases.
  let urls = {}
  try {
    urls = await signStaffPhotoUrls(rows.map((row) => row.photo_path))
  } catch {
    urls = {}
  }

  const byTeam = new Map()
  for (const row of rows) {
    const list = byTeam.get(row.team_id) ?? []
    // ⚠️ SHAPED BY THE SAME `toStaffMember` THE ADMIN DIRECTORY USES, so the
    // blank-name rule ("" is not a name) holds on both screens from one place.
    // The RPC returns flat columns where PostgREST returns a nested `profiles`
    // object, so the row is re-nested rather than the helper being duplicated.
    list.push({
      ...toStaffMember({
        id: row.membership_id,
        role: row.role,
        title: row.title,
        profiles: {
          full_name: row.full_name,
          email: row.email,
          phone: row.phone,
          photo_path: row.photo_path,
          // ⚠️ THESE TWO REACH HERE ONLY BECAUSE `my_squad_staff()` NAMES THEM.
          // The function is SECURITY DEFINER with a fixed column list precisely
          // so a parent cannot read a `profiles` row, so there is no client-side
          // route to the focal point — a missing column here is not a `select`
          // to widen, it is a migration
          // (db/migrations/20260815_my_squad_staff_focus.sql).
          photo_focus_x: row.photo_focus_x,
          photo_focus_y: row.photo_focus_y,
        },
      }),
      photoUrl: urls[row.photo_path] ?? null,
    })
    byTeam.set(row.team_id, list)
  }

  for (const list of byTeam.values()) {
    list.sort(compareSquadStaff)
  }

  return byTeam
}

const REFUSED_TITLE =
  "We couldn't save that title — you may not have permission to change this squad's staff."

/**
 * Sets (or clears) one membership's job title.
 *
 * ⚠️ A BLANK TITLE IS WRITTEN AS NULL, NEVER AS ''. Two values meaning "no
 * title" is how a screen ends up rendering an empty chip that cannot be clicked
 * away, and it is the same distinction `updateProfileName` enforces on the way
 * in.
 *
 * ⚠️ READS THE ROW BACK AND TREATS "no row" AS A REFUSAL. RLS filters the row
 * out rather than erroring, so PostgREST answers a refused write with a
 * perfectly successful empty result — the house pattern set by
 * src/data/members.js. Without this, a save the database rejected looks like a
 * save that worked until the screen is reloaded.
 *
 * ⚠️ IF THIS EVER FAILS WITH A PERMISSION ERROR, THE CAUSE IS ALMOST CERTAINLY
 * THE COLUMN GRANT AND NOT THE POLICY. `authenticated` holds column-level
 * UPDATE on `memberships`, so `title` is writable only because
 * db/migrations/20260813_membership_title.sql granted it explicitly. **Do not
 * "fix" it with a table-level grant** — that hands every admin write access to
 * `is_super`. The migration explains this at length.
 */
export async function setMembershipTitle({ membershipId, title } = {}) {
  if (!membershipId) throw new Error('setMembershipTitle needs a membershipId.')

  const trimmed = typeof title === 'string' ? title.trim() : ''

  const { data, error } = await supabase
    .from('memberships')
    .update({ title: trimmed || null })
    .eq('id', membershipId)
    .select('id, title')
    .maybeSingle()

  if (error) throw error
  if (!data) throw new Error(REFUSED_TITLE)
  return data
}

export const REFUSED_HEAD_COACH =
  "We couldn't save that — either you may not change this squad's staff, or the squad already has a head coach."

/**
 * Makes one membership the squad's head coach, or clears the flag.
 *
 * ⚠️ THIS IS WHAT THE APPROVAL E-MAILS READ, and `title` is not. Setting
 * somebody's title to "Head Coach" changes a label and nothing else; this
 * changes who is told when a parent registers a child. Both exist on purpose —
 * see `toStaffMember` above.
 *
 * ⚠️ THE EMPTY-RESULT PATTERN IS LOAD-BEARING, exactly as it is for
 * `setMembershipTitle`: a write RLS refuses returns a perfectly successful
 * EMPTY result, so without `.maybeSingle()` and this throw, a save the database
 * rejected looks like a save that worked until the screen is reloaded.
 *
 * ⚠️ AND ONE FAILURE HERE IS NOT A PERMISSION PROBLEM AT ALL. The database
 * holds a partial unique index (`memberships_one_head_coach_per_team`), so
 * setting a second head coach on a squad raises 23505 rather than returning
 * empty. That is a real error and reaches the caller as one; the message says
 * both causes because the screen cannot tell them apart without guessing.
 * db/tests/head-coach-flag.sql proves the index is what refuses it.
 *
 * ⚠️ IF THIS EVER FAILS WITH A PERMISSION ERROR, SUSPECT THE COLUMN GRANT
 * FIRST, not the policy — `authenticated` holds column-level UPDATE on
 * `memberships` and `is_head_coach` is writable only because
 * db/migrations/20260818_membership_head_coach.sql granted that one column.
 * **Do not "fix" it with a table-level grant**, which would hand every admin
 * write access to `is_super`.
 */
export async function setMembershipHeadCoach({ membershipId, isHeadCoach } = {}) {
  if (!membershipId) throw new Error('setMembershipHeadCoach needs a membershipId.')

  const { data, error } = await supabase
    .from('memberships')
    .update({ is_head_coach: isHeadCoach === true })
    .eq('id', membershipId)
    .select('id, is_head_coach')
    .maybeSingle()

  if (error) throw error
  if (!data) throw new Error(REFUSED_HEAD_COACH)
  return data
}

// ── Who gets the "waiting to be approved" email (23 Aug 2026) ───────────────
//
// Jay: "admin needs a way to select who receives emails about people waiting
// to be approved". memberships.notify_approvals is the switch; an admin for
// the whole club, a coach or manager for their squad. Confers nothing — who
// may APPROVE is private.can_approve_team. db/migrations/20260823_notify_approvals.sql.

/** Every active admin, coach and manager with their switch. Admins only (the function refuses others). */
export async function listApprovalRecipients() {
  const { data, error } = await supabase.rpc('approval_recipients')
  if (error) throw error
  return data ?? []
}

export async function setNotifyApprovals({ membershipId, notify } = {}) {
  if (!membershipId) throw new Error('setNotifyApprovals needs a membershipId.')
  const { data, error } = await supabase
    .from('memberships')
    .update({ notify_approvals: notify === true })
    .eq('id', membershipId)
    .select('id, notify_approvals')
    .maybeSingle()
  if (error) throw error
  if (!data) throw new Error("That didn't save. Only a club admin can change who is emailed.")
  return data
}
