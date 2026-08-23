import { useMemo } from 'react'
import { useMemberships } from '../lib/memberships.jsx'
import { isAdmin, roleLabel, visibleTeams } from '../lib/scope.js'

// The admin-only "view as" preview (design spec 2026-08-03 §1). Two exports,
// both reached from AppShell: `ViewAsOptions`, the persona list that
// AccountMenu shows as its second page, and `ViewAsBanner`, the sticky banner
// above the masthead.
//
// THE ONE RULE THIS FILE EXISTS TO KEEP: every gate here reads
// `realMemberships`, never the effective `memberships`. While previewing as a
// parent, `isAdmin(memberships)` is false — gating the list or the banner's
// exit button on that would hide the only way out and soft-lock the admin into
// a preview they could only escape by clearing localStorage. `memberships` is
// deliberately not destructured anywhere below; if you find yourself reaching
// for it here, you are about to reintroduce that bug.
//
// It is also worth restating what this feature is NOT: row-level security still
// returns club-wide rows for the admin's real auth.uid(). The preview only
// changes what the app chooses to display in this browser. Hence the wording —
// "preview", "filtered in your browser only" — and never anything like
// "restricted to" or "you now have coach permissions", which would suggest a
// security boundary that does not exist here.
//
// ══ HISTORY OF WHERE THE TRIGGER LIVED, KEPT BECAUSE IT KEEPS COMING BACK ════
//
//   7 Aug 2026  — moved OFF the masthead onto /admin: an 84px text pill made
//                 the wordmark truncate to "ABU DHABI HARLE…".
//  14 Aug 2026  — back in the masthead as a 32px icon, on Jay's word ("select
//                 view as with a drop down from any screen"), persona text
//                 stated by the banner instead. claude/decisions/2026-08-14-view-as-everywhere.md
//  23 Aug 2026  — behind the account menu (AccountMenu.jsx), still reachable
//                 from every screen, and the masthead no longer has a trigger
//                 of its own at all. The row had been fixed for overflow five
//                 times in sixteen days; this is the fix that removes the
//                 cause rather than the latest symptom.

function personaRoleLabel(role) {
  // roleLabel() takes a membership array; a one-element synthetic array is the
  // cheapest way to reuse its label map rather than duplicate it.
  return roleLabel([{ role }])
}

function teamName(teams, teamId) {
  return teams.find((team) => team.id === teamId)?.name ?? 'Unknown age group'
}

function optionClasses(active) {
  return [
    'flex w-full items-center justify-between gap-3 rounded-[9px] px-3 py-2 text-left text-[13.5px] font-semibold transition',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-inset',
    active ? 'bg-danger-bg text-brand-ink' : 'text-ink hover:bg-surface-mute',
  ].join(' ')
}

/**
 * The persona list — the body of what used to be the masthead dropdown.
 *
 * ══ ⚠️ THE STANDALONE TRIGGER IS GONE, 23 Aug 2026 ═══════════════════════════
 *
 * `ViewAsSwitcher` was a 32px eye button in the masthead with this list in a
 * portalled panel beneath it. Jay: "couldn't you tap the J and have a drop down
 * or something?" — so the list now renders as the second page of
 * `AccountMenu`, behind the person's initial, and the eye button no longer
 * exists. The panel mechanics (portal, Escape, outside-click, focus return,
 * fixed positioning to escape the masthead's overflow clip) moved to
 * AccountMenu.jsx WITH their reasons; read them there before re-deriving one.
 *
 * What did not change: every gate reads `realMemberships`, and a persona for
 * 'manager' or 'medic' is still deliberately absent — they grant exactly what
 * 'coach' grants (SQUAD_STAFF_ROLES in src/lib/scope.js), so the preview would
 * be pixel-identical.
 *
 * ⚠️ THE VISIBLE LABEL IS "Coach"; THE ACCESSIBLE NAME IS "Coach of U12 Boys".
 * Grouping under a squad heading keeps the list compact, but a heading is a
 * VISUAL association only — without the aria-label a screen reader reads out
 * fifteen buttons all called "Coach". The heading is aria-hidden for the same
 * reason (claude/specs/accessibility.md).
 *
 * Renders nothing for anyone who is not a real admin.
 *
 * @param {{ onChoose?: () => void }} props  Called after a persona is set.
 */
export function ViewAsOptions({ onChoose }) {
  const { realMemberships, teams, viewAs, setViewAs } = useMemberships()
  const admin = isAdmin(realMemberships)

  // Built from the REAL set: while previewing, the effective set holds a single
  // team and this list would collapse to just that one.
  const previewTeams = useMemo(
    () => (admin ? visibleTeams(realMemberships, teams) : []),
    [admin, realMemberships, teams],
  )

  if (!admin) return null

  function choose(next) {
    setViewAs(next)
    onChoose?.()
  }

  return (
    <>
      <p className="px-3 pb-2 pt-1 text-[12px] leading-relaxed text-ink-muted">
        Preview how the app looks for a coach or parent in one age group.
        This filters what this browser displays; your own access is
        unchanged.
      </p>

      <button
        type="button"
        role="menuitem"
        onClick={() => choose(null)}
        className={optionClasses(!viewAs)}
      >
        <span>All age groups (Admin)</span>
        {!viewAs && (
          <span className="text-[11px] font-bold uppercase tracking-[.4px]">Current</span>
        )}
      </button>

      {previewTeams.map((team) => (
        <div key={team.id} className="mt-1 border-t border-line pt-1">
          <p
            aria-hidden="true"
            className="px-3 py-1 text-[11px] font-bold uppercase tracking-[.4px] text-ink-faint"
          >
            {team.name}
          </p>
          <button
            type="button"
            role="menuitem"
            aria-label={`Coach of ${team.name}`}
            onClick={() => choose({ role: 'coach', teamId: team.id })}
            className={optionClasses(viewAs?.role === 'coach' && viewAs?.teamId === team.id)}
          >
            <span>Coach</span>
          </button>
          <button
            type="button"
            role="menuitem"
            aria-label={`Parent in ${team.name}`}
            onClick={() => choose({ role: 'parent', teamId: team.id })}
            className={optionClasses(viewAs?.role === 'parent' && viewAs?.teamId === team.id)}
          >
            <span>Parent</span>
          </button>
        </div>
      ))}
    </>
  )
}

/**
 * The persistent preview banner. Rendered by AppShell above the masthead, at
 * every width (as is the trigger, since 14 Aug 2026) — it is the only thing
 * that states the persona in words, so it must never be CSS-hidden.
 */
export function ViewAsBanner() {
  const { realMemberships, teams, viewAs, setViewAs } = useMemberships()

  if (!isAdmin(realMemberships) || !viewAs) return null

  const role = personaRoleLabel(viewAs.role)
  const team = teamName(teams, viewAs.teamId)

  return (
    <div
      data-testid="view-as-banner"
      role="status"
      // brand-deep (#b3141a) is this theme's dark club red — the token the
      // retheme mapped the old #8E1526 "plum" onto (claude/specs/design-system.md
      // §2's mapping table). White on it measures 6.93:1. A raw hex here would
      // fail tests/theme.test.js's no-literals rule.
      className="mb-2 overflow-hidden rounded-[16px] bg-brand-deep text-white shadow-[0_6px_20px_rgba(0,0,0,0.25)]"
    >
      <div className="mx-auto flex max-w-[1120px] flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-2 wide:max-w-[1360px]">
        <p className="text-[13px] font-semibold leading-snug">
          {`Preview — viewing as ${role}, ${team}. Data shown is filtered in your browser only.`}
        </p>
        <button
          type="button"
          onClick={() => setViewAs(null)}
          // text-brand-ink, NOT text-brand-ink: the pill is literally white in BOTH
          // themes, and brand-ink brightens to the dark-mode red on dark —
          // which on a white pill is a 3:1 AA fail. brand is the unthemed
          // fill red and is AA on white everywhere.
          className="shrink-0 rounded-pill bg-white px-3 py-1 text-[13px] font-bold text-brand outline-none transition hover:bg-surface-mute focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-brand-deep"
        >
          Exit preview
        </button>
      </div>
    </div>
  )
}

export default ViewAsBanner
