import { adminRightLabel, labelForRole } from './scope.js'

// Turning one public.membership_audit row into words a human reads.
//
// ⚠️ PURE, AND SEPARATE FROM THE SCREEN ON PURPOSE. This is where every "did it
// actually say what happened?" assertion lives, and a formatter tangled into
// JSX can only be tested through a rendered component — which is how a log ends
// up asserted on the presence of a row rather than on its meaning.
//
// ⚠️ THE JOB IS TO SAY WHAT CHANGED, NOT TO SAY THAT SOMETHING DID. "Membership
// updated" is what a log written for the database says; "Made a super admin" is
// what a log written for the person asking who did that says. Every branch here
// exists because the alternative was a line that could not be acted on.

/** "an account since deleted" — the honest answer, never a blank. */
export const GONE = 'an account since deleted'

/**
 * ⚠️ NULL IS NOT "NOBODY". A cron job, a service-role write or a migration has
 * no signed-in user, and the trigger records that as `actor_kind = 'system'`
 * rather than leaving the column blank to be misread as missing data. Say
 * "the system" out loud — an unexplained gap in an audit log is worse than an
 * uninteresting entry, because it is indistinguishable from one that was lost.
 */
export function actorName(row, nameById) {
  if (row?.actor_kind === 'system') return 'the system'
  const name = row?.actor_id ? nameById?.get(row.actor_id) : null
  return name || GONE
}

/** The person the entry is ABOUT. Same missing-name rule as the actor. */
export function subjectName(row, nameById) {
  const name = row?.profile_id ? nameById?.get(row.profile_id) : null
  return name || GONE
}

function rightsList(rights) {
  const list = (rights ?? []).filter(Boolean)
  if (list.length === 0) return 'none'
  return list.map((right) => adminRightLabel(right) ?? right).join(', ')
}

function sameRights(a, b) {
  const left = [...(a ?? [])].sort()
  const right = [...(b ?? [])].sort()
  return left.length === right.length && left.every((value, i) => value === right[i])
}

/**
 * The headline: granted / changed / revoked, in words rather than in the
 * database's verb.
 */
export function auditHeadline(row) {
  if (row?.action === 'granted') {
    const role = labelForRole(row.new_role) ?? row?.new_role ?? 'access'
    // ⚠️ A PENDING GRANT IS NOT ACCESS AND MUST NOT READ AS ONE. Almost every
    // row in this log starts life pending — request_staff_role, the roll-call
    // and claim_roster_access all insert `pending` — and a log that says
    // "Given Coach" for a request nobody has approved yet describes a hole
    // that does not exist, on the one screen someone opens when they suspect
    // one does.
    if (row?.new_status && row.new_status !== 'active') {
      return `Asked for ${role}`
    }
    return `Given ${role}`
  }
  if (row?.action === 'revoked') return 'Access removed'
  return 'Access changed'
}

/**
 * Every field that actually moved, one plain sentence each. Empty for a
 * 'granted' row, whose headline already says everything.
 *
 * ⚠️ THE TRIGGER ALREADY REFUSES A NO-CHANGE UPDATE, so an empty list here on a
 * 'changed' row means the trigger and this function disagree about what counts
 * — which is a bug in one of them and is worth being able to see. It renders as
 * nothing rather than as "something changed", because inventing a line is how
 * the disagreement would stay hidden.
 */
export function auditDetails(row) {
  const out = []
  if (!row || row.action !== 'changed') return out

  if (row.old_role !== row.new_role) {
    out.push(
      `Role: ${labelForRole(row.old_role) ?? row.old_role} → ${
        labelForRole(row.new_role) ?? row.new_role
      }`,
    )
  }

  if (row.old_status !== row.new_status) {
    // ⚠️ THE APPROVAL IS THE EVENT PEOPLE COME HERE FOR, so it gets its own
    // sentence instead of "Status: pending → active", which is the database's
    // way of saying somebody was let in.
    if (row.new_status === 'active' && row.old_status === 'pending') {
      out.push('Approved')
    } else if (row.new_status === 'left' && row.old_status === 'active') {
      // ⚠️ THE OTHER END OF THE MEMBERSHIP'S LIFE, and it gets a sentence for
      // exactly the reason 'Approved' does: "Status: active → left" is the
      // database's way of saying a family lost their squad, and this log is
      // read by people checking whether somebody should still have access.
      // ⚠️ SCOPED TO active → left ON PURPOSE. A pending row is not access, so
      // its reaching 'left' is not a departure from anything — and since
      // db/migrations/20260902_player_leavers_pending_and_feed.sql
      // mark_player_left cannot produce that transition at all. If it turns up
      // anyway, the raw statuses below are the honest answer.
      out.push('Left the squad')
    } else if (row.new_status === 'active' && row.old_status === 'left') {
      // restore_player. Deliberately NOT 'Approved': nobody approved anything,
      // the access that was taken away was given back.
      out.push('Restored to the squad')
    } else {
      out.push(`Status: ${row.old_status} → ${row.new_status}`)
    }
  }

  if (row.old_is_super !== row.new_is_super) {
    out.push(row.new_is_super ? 'Made a super admin' : 'No longer a super admin')
  }

  if (!sameRights(row.old_rights, row.new_rights)) {
    out.push(`Jobs: ${rightsList(row.old_rights)} → ${rightsList(row.new_rights)}`)
  }

  return out
}

/**
 * ⚠️ THE ENTRIES WORTH NOTICING, and the reason this screen is not just a
 * table. Becoming an admin, becoming a SUPER admin, and gaining a squad staff
 * role are the changes that hand somebody access to children's records. They
 * are a minority of the rows and they must not be found by reading.
 */
export function isElevation(row) {
  if (!row) return false
  if (row.new_is_super && !row.old_is_super) return true
  if (row.action === 'granted') {
    return row.new_role === 'admin' && row.new_status === 'active'
  }
  if (row.action !== 'changed') return false
  if (row.new_role === 'admin' && row.old_role !== 'admin') return true
  // Approving a pending staff claim IS the moment access is handed over, and it
  // is the single most common way somebody reaches a squad's children.
  return (
    row.new_status === 'active' &&
    row.old_status !== 'active' &&
    ['admin', 'coach', 'manager', 'medic'].includes(row.new_role)
  )
}
