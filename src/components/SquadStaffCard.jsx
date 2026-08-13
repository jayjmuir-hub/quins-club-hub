import { useState } from 'react'
import Card from './Card.jsx'
import { labelForRole } from '../lib/scope.js'
import { initials } from '../lib/playerFormat.js'

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
/**
 * The face, or the monogram.
 *
 * ⚠️ NOT `PlayerAvatar`, AND THE DIFFERENCE IS THE BUCKET. That component signs
 * against `player-photos`, which holds photographs of children behind policies
 * written around squad membership. These come from `staff-photos` and are
 * signed in one batch by `listMySquadStaff` before anything renders — so this
 * takes a URL and never signs, which is also why there is no effect here.
 *
 * ⚠️ THE FALLBACK IS THE NORMAL CASE, NOT AN ERROR STATE. On the day this
 * shipped nobody in the club had a photo, so "no photo", "could not sign" and
 * "the image 404s" must all render identically and none of them may announce
 * itself. The same ruling PlayerAvatar carries.
 */
function StaffAvatar({ name, url }) {
  const [failed, setFailed] = useState(false)

  const shared = 'h-10 w-10 shrink-0 overflow-hidden rounded-[12px] text-[14px]'

  if (url && !failed) {
    return (
      <img
        src={url}
        // The name is rendered immediately beside this, so an alt of "Photo of
        // Rosa Ferreira" would only repeat it. Empty alt marks it decorative
        // and stops a screen reader saying the name twice.
        alt=""
        className={`${shared} bg-brand/10 object-cover`}
        onError={() => setFailed(true)}
      />
    )
  }

  return (
    <div
      className={`${shared} grid place-items-center bg-brand/10 font-extrabold tracking-[.5px] text-brand-deep`}
      aria-hidden="true"
    >
      {initials(name)}
    </div>
  )
}

function StaffPerson({ member }) {
  const role = labelForRole(member.role)
  const line = member.title ?? role

  return (
    <li className="border-t border-line px-4 py-3 first:border-t-0" data-testid="squad-staff-person">
      <div className="flex items-start gap-3">
        <StaffAvatar name={member.name} url={member.photoUrl} />
        <div className="min-w-0 flex-1">
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
        </div>
      </div>
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
