import Card from './Card.jsx'
import { labelForRole } from '../lib/scope.js'

// "Who looks after this squad" — the member-facing half of the staff feature.
// Phase 3 of claude/plans/2026-08-13-squad-staff-on-home.md; the admin half is
// src/screens/AdminStaff.jsx and the two read the same shape from
// src/data/staff.js.
//
// ⚠️ THE EMPTY STATE IS THE MAJORITY CASE, NOT AN EDGE CASE. Measured live
// 13 Aug 2026: twelve of the club's fifteen squads had nobody attached. So a
// squad with no staff must say something a parent can understand, and must
// never render as a blank box or vanish — a card that disappears reads as the
// app having lost something, and a blank one reads as a bug.
//
// ⚠️ IT SAYS "not listed", NOT "there isn't one". Every one of those twelve
// squads has real adults running it; what is missing is the DATA, and telling a
// parent their child has no coach would be false as well as alarming.

/**
 * One person.
 *
 * ⚠️ THE TITLE REPLACES THE ROLE LABEL RATHER THAN JOINING IT. "Head Coach"
 * beside a "Coach" chip is the same word twice, which is what the dashboard
 * hero's eyebrow/headline split already had to solve once. When there is no
 * title the role label carries the line on its own — so a squad that has never
 * set a title still reads properly, which today is every squad.
 *
 * ⚠️ A TITLE IS NEVER PERMISSION. It is a label typed by an admin;
 * `private.can_edit_team` keys off `role` and must stay that way.
 */
function StaffPerson({ member }) {
  const role = labelForRole(member.role)
  const line = member.title ?? role

  return (
    <li className="border-t border-line px-4 py-3 first:border-t-0" data-testid="squad-staff-person">
      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
        <span className="text-[15px] font-bold text-ink">{member.name}</span>
        {line && <span className="text-[13px] font-semibold text-ink-muted">{line}</span>}
      </div>

      {/* ⚠️ REAL `tel:` AND `mailto:` LINKS, NOT TEXT. The reason a parent wants
          this card at all is to contact the person, and a phone number they
          have to retype by hand is a number they will not use. This is also
          why the phone comes first: on the device this app is mostly opened
          on, tapping it starts a call.

          ⚠️ THE CONTACT DETAILS ARE HERE ON A RULING (Jay, 13 Aug 2026): "the
          staff automatically opts in when accepting the position". The plan
          recommended a per-person opt-in toggle and was overruled. Do not
          quietly drop these back to name-and-title — the database returns them
          deliberately (db/migrations/20260813_my_squad_staff.sql). */}
      {(member.phone || member.email) && (
        <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
          {member.phone && (
            <a
              href={`tel:${member.phone}`}
              className="font-semibold text-brand underline underline-offset-2"
              aria-label={`Call ${member.name} on ${member.phone}`}
            >
              {member.phone}
            </a>
          )}
          {member.email && (
            <a
              href={`mailto:${member.email}`}
              // ⚠️ `break-all` BECAUSE AN EMAIL ADDRESS HAS NO SPACES IN IT. A
              // long club address is one unbreakable word, and at 320px it is
              // the one string on this card that can push the layout wider
              // than the screen — the failure `harness/check-overflow.mjs`
              // exists to catch.
              className="break-all font-semibold text-brand underline underline-offset-2"
              aria-label={`Email ${member.name} at ${member.email}`}
            >
              {member.email}
            </a>
          )}
        </div>
      )}
    </li>
  )
}

/**
 * One squad's staff, or an honest empty state.
 *
 * `staff` is an array — possibly empty. The CARD is always drawn: a parent
 * attached to a squad should see that squad named on their home screen whether
 * or not anyone has been attached to it yet.
 */
export function SquadStaffCard({ squadName, staff = [] }) {
  return (
    <Card className="mb-3" data-testid="squad-staff-card">
      <div className="px-4 py-3">
        <h4 className="text-[15px] font-extrabold text-ink">{squadName}</h4>
      </div>

      {staff.length === 0 ? (
        // ⚠️ A SENTENCE, NOT <Empty>. The same ruling the fortnight strip
        // settled on 10 Aug: <Empty>'s 42px icon and py-11 would make the
        // nothing-here case TALLER than the something-here case, and this is
        // the case twelve of fifteen squads are in.
        <p className="border-t border-line px-4 py-3 text-[13px] text-ink-muted">
          No coach, team manager or medic listed for this squad yet.
        </p>
      ) : (
        <ul className="border-t border-line">
          {staff.map((member) => (
            <StaffPerson key={member.membershipId} member={member} />
          ))}
        </ul>
      )}
    </Card>
  )
}

export default SquadStaffCard
