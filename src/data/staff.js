import { supabase } from '../lib/supabase'
import { SQUAD_STAFF_ROLES } from '../lib/scope.js'
import { unwrapCapped, withCap } from './limits.js'

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
          .select('id, team_id, role, title, profiles(full_name, email, phone)')
          .in('role', SQUAD_STAFF_ROLES)
          .eq('status', 'active')
          .not('team_id', 'is', null),
      )
      if (error) throw error
      return unwrapCapped(data, 'staff', 'Narrow this down before showing it all at once.')
    })(),
  ])

  const byTeam = new Map()
  for (const row of staff) {
    const list = byTeam.get(row.team_id) ?? []
    list.push(toStaffMember(row))
    byTeam.set(row.team_id, list)
  }

  return teams.map((team) => ({
    id: team.id,
    name: team.name,
    // ⚠️ SORTED BY NAME, NOT BY ROLE. Role order would put every coach above
    // every manager, which reads as a hierarchy the club has not agreed to.
    staff: (byTeam.get(team.id) ?? []).sort((a, b) => a.name.localeCompare(b.name)),
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
    role: row.role,
    title: String(row.title ?? '').trim() || null,
    name: name || email || 'No name yet',
    email: email || null,
    phone: String(row.profiles?.phone ?? '').trim() || null,
  }
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
