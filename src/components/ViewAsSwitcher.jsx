import { useMemo, useState } from 'react'
import Sheet from './Sheet.jsx'
import { useMemberships } from '../lib/memberships.jsx'
import { isAdmin, roleLabel, visibleTeams } from '../lib/scope.js'

// The admin-only "view as" preview control and its banner (design spec
// 2026-08-03 §1). Two exports, both rendered by AppShell: the trigger +
// sheet next to the desktop role badge, and the sticky banner above the
// masthead.
//
// THE ONE RULE THIS FILE EXISTS TO KEEP: every gate here reads
// `realMemberships`, never the effective `memberships`. While previewing as a
// parent, `isAdmin(memberships)` is false — gating the banner or its exit
// button on that would hide the only way out and soft-lock the admin into a
// preview they could only escape by clearing localStorage. `memberships` is
// deliberately not destructured anywhere below; if you find yourself reaching
// for it here, you are about to reintroduce that bug.
//
// It is also worth restating what this feature is NOT: row-level security
// still returns club-wide rows for the admin's real auth.uid(). The preview
// only changes what the app chooses to display in this browser. Hence the
// wording — "preview", "filtered in your browser only" — and never anything
// like "restricted to" or "you now have coach permissions", which would
// suggest a security boundary that does not exist here.

function personaRoleLabel(role) {
  // roleLabel() takes a membership array; a one-element synthetic array is
  // the cheapest way to reuse its label map rather than duplicate it.
  return roleLabel([{ role }])
}

function teamName(teams, teamId) {
  return teams.find((team) => team.id === teamId)?.name ?? 'Unknown age group'
}

function personaClasses(active) {
  return [
    'flex w-full items-center justify-between gap-3 rounded-[11px] border-[1.5px] px-3 py-2.5 text-left text-sm font-bold transition',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2',
    active
      ? 'border-brand bg-danger-bg text-brand-ink'
      : 'border-line bg-surface-card text-ink hover:border-brand',
  ].join(' ')
}

/**
 * Desktop-only trigger + sheet. Renders nothing at all for anyone who is not
 * a real admin.
 */
export function ViewAsSwitcher() {
  const { realMemberships, teams, viewAs, setViewAs } = useMemberships()
  const [open, setOpen] = useState(false)

  const admin = isAdmin(realMemberships)

  // Built from the REAL set: while previewing, the effective set holds a
  // single team and this list would collapse to just that one, stranding the
  // admin on whichever age group they picked last.
  const previewTeams = useMemo(
    () => (admin ? visibleTeams(realMemberships, teams) : []),
    [admin, realMemberships, teams],
  )

  if (!admin) return null

  function choose(next) {
    setViewAs(next)
    setOpen(false)
  }

  const triggerLabel = viewAs
    ? `Viewing as ${personaRoleLabel(viewAs.role)}, ${teamName(teams, viewAs.teamId)}`
    : 'View as'

  return (
    <>
      {/* Desktop-only in CSS, not JS: `hidden desktop:flex` at the 820px
          breakpoint, exactly how Nav.jsx gates the Overview item. The
          preview is a desk-bound admin tool (spec §1) and the masthead has
          no room for it on a phone. */}
      <button
        type="button"
        data-testid="view-as-trigger"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="hidden shrink-0 items-center gap-1.5 rounded-pill bg-white/10 px-3 py-1 font-condensed text-[13px] font-bold uppercase tracking-[0.08em] text-white outline-none transition hover:bg-white/20 focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-chrome desktop:flex"
      >
        {triggerLabel}
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} title="View as">
        <p className="mb-4 text-[13px] leading-relaxed text-ink-muted">
          Preview how the app looks for a coach or parent in one age group.
          This filters what this browser displays; your own access is
          unchanged.
        </p>

        <div className="flex flex-col gap-2">
          <button type="button" onClick={() => choose(null)} className={personaClasses(!viewAs)}>
            <span>All age groups (Admin)</span>
            {!viewAs && <span className="text-[12px] font-bold uppercase tracking-[.4px]">Current</span>}
          </button>

          {previewTeams.map((team) => (
            <div key={team.id} className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => choose({ role: 'coach', teamId: team.id })}
                className={personaClasses(viewAs?.role === 'coach' && viewAs?.teamId === team.id)}
              >
                <span>Coach of {team.name}</span>
              </button>
              <button
                type="button"
                onClick={() => choose({ role: 'parent', teamId: team.id })}
                className={personaClasses(viewAs?.role === 'parent' && viewAs?.teamId === team.id)}
              >
                <span>Parent in {team.name}</span>
              </button>
            </div>
          ))}
        </div>
      </Sheet>
    </>
  )
}

/**
 * The persistent preview banner. Rendered by AppShell above the masthead,
 * at every width (unlike the trigger) — it is the only way back out of a
 * preview, so it must never be CSS-hidden either.
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
      // §2's mapping table). White on it measures 6.93:1. A raw hex here
      // would fail tests/theme.test.js's no-literals rule.
      className="bg-brand-deep text-white"
    >
      <div className="mx-auto flex max-w-[1120px] flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-2">
        <p className="text-[13px] font-semibold leading-snug">
          {`Preview — viewing as ${role}, ${team}. Data shown is filtered in your browser only.`}
        </p>
        <button
          type="button"
          onClick={() => setViewAs(null)}
          className="shrink-0 rounded-pill bg-white px-3 py-1 text-[13px] font-bold text-brand-ink outline-none transition hover:bg-surface-mute focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-brand-deep"
        >
          Exit preview
        </button>
      </div>
    </div>
  )
}

export default ViewAsSwitcher
