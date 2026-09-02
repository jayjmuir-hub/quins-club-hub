import { useState } from 'react'
import { ADMIN_RIGHTS, adminRightLabel } from '../lib/scope.js'
import { setAdminRights } from '../data/members.js'
import { friendlyMessage } from '../lib/friendlyError.js'

// The super-admin control: which specialist dashboards ONE admin can see.
//
// ⚠️ RENDERED ONLY FOR A SUPER ADMIN, AND THAT IS NOT THE ENFORCEMENT.
// Hiding this component stops an ordinary admin from being CONFUSED; it does
// not stop them changing anything. What actually stops them is the column
// grant on `memberships` (`authenticated` holds UPDATE on six named columns,
// and `is_super`/`admin_rights` are not among them) plus
// `public.set_admin_rights`, which is SECURITY DEFINER and checks
// `private.is_super_admin()` as its first statement. Proved both ways in
// db/tests/rls-super-admin.sql. This repo's rule: a screen that hides a row is
// not security.
//
// ⚠️ AND WHAT THESE RIGHTS DO NOT DO IS WITHHOLD DATA. Every admin already
// sees every child's name, photo and contact details — Jay's ruling, 10 Aug
// 2026: "trusted volunteers". A right decides which specialist dashboard
// appears. If a right is ever added that must genuinely keep something FROM an
// admin, it needs its own RLS policy and this component is the wrong place for
// it.
//
// ⚠️ SAVES ON EVERY TICK, with no separate Save button. The alternative is a
// dirty-state and a button that can be forgotten, on a control whose whole job
// is a handful of checkboxes. The cost is that a failed save has to be visible
// and has to put the tick back — which is what `error` and the optimistic
// revert below are for.

export default function AdminRightsEditor({ membership, label, onChanged }) {
  const [rights, setRights] = useState(() => membership.admin_rights ?? [])
  const [isSuper, setIsSuper] = useState(() => Boolean(membership.is_super))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  async function save(nextSuper, nextRights) {
    // Optimistic, because a checkbox that waits for a round trip before moving
    // feels broken on a phone. Reverted below if the write is refused.
    const previousSuper = isSuper
    const previousRights = rights
    setIsSuper(nextSuper)
    setRights(nextRights)
    setSaving(true)
    setError(null)

    try {
      const saved = await setAdminRights(membership.id, nextSuper, nextRights)
      onChanged?.(saved)
    } catch (failure) {
      // ⚠️ PUT IT BACK. Leaving the tick where the user clicked it after a
      // refusal is the lying-UI failure: they would walk away believing
      // somebody holds Pitch Management when the database says otherwise.
      setIsSuper(previousSuper)
      setRights(previousRights)
      setError(failure)
    } finally {
      setSaving(false)
    }
  }

  function toggleRight(right) {
    const next = rights.includes(right)
      ? rights.filter((held) => held !== right)
      : [...rights, right]
    save(isSuper, next)
  }

  return (
    <fieldset
      data-testid="admin-rights"
      className="mt-2 basis-full rounded-[11px] border border-line bg-surface-card p-2.5"
    >
      <legend className="mb-1.5 block text-[12px] font-bold uppercase tracking-[.4px] text-ink-muted">
        {`Admin rights for ${label}`}
      </legend>

      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        {ADMIN_RIGHTS.map((right) => (
          <label
            key={right}
            className="flex cursor-pointer items-center gap-1.5 text-[13.5px] text-ink"
          >
            <input
              type="checkbox"
              // A super admin holds every right implicitly, so the boxes are
              // shown ticked and locked rather than misleadingly empty.
              checked={isSuper || rights.includes(right)}
              disabled={saving || isSuper}
              onChange={() => toggleRight(right)}
            />
            {adminRightLabel(right)}
          </label>
        ))}
      </div>

      <label className="mt-2 flex items-center gap-1.5 border-t border-line pt-2 text-[13.5px] font-bold text-ink">
        <input
          type="checkbox"
          checked={isSuper}
          disabled={saving}
          onChange={(domEvent) => save(domEvent.target.checked, rights)}
        />
        Super admin
      </label>
      <p className="mt-1 text-[12.5px] leading-relaxed text-ink-muted">
        {/* Said plainly, because the difference between the two tiers is not
            visible anywhere else on this screen. */}
        A super admin holds every right, and is the only person who can change
        this for anyone. Ordinary admins already see the whole club — these
        rights decide which specialist dashboards they get.
      </p>

      {error && (
        <p role="alert" className="mt-2 text-[12.5px] font-semibold text-danger-ink">
          {friendlyMessage(error, "That didn't save. You may not be a super admin.")}
        </p>
      )}
    </fieldset>
  )
}
