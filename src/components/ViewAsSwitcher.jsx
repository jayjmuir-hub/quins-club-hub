import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useMemberships } from '../lib/memberships.jsx'
import { isAdmin, roleLabel, visibleTeams } from '../lib/scope.js'

// The admin-only "view as" preview control and its banner (design spec
// 2026-08-03 §1). Two exports, BOTH rendered by AppShell: a compact dropdown in
// the masthead, and the sticky banner above it.
//
// THE ONE RULE THIS FILE EXISTS TO KEEP: every gate here reads
// `realMemberships`, never the effective `memberships`. While previewing as a
// parent, `isAdmin(memberships)` is false — gating the trigger or the banner's
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
// ══ ⚠️ IT IS BACK IN THE MASTHEAD, AND THE 7 Aug RULING SAID IT MUST NOT BE ══
//
// Jay, 14 Aug 2026: *"i want to be able to select view as with a drop down from
// any screen, as an admin"*. That overturns the 7 Aug decision to move this onto
// /admin, and the REASON that decision existed has not gone away — so read this
// before making the trigger any bigger:
//
//   The masthead row is crest | wordmark | flex-1 spacer | role pill | App
//   button | account | THIS | nav. **Every item except the wordmark is
//   `shrink-0`, so the wordmark absorbs every overflow** and truncates to
//   "ABU DHABI HARLE…". On 7 Aug this control was 84px of text pill and that is
//   exactly what happened.
//
//   The row's real buffer is the `flex-1` spacer, measured on 12 Aug 2026 by
//   growing a probe until the wordmark visibly truncated: **it breaks at
//   +190px** at 1280px. The App button (49) and the account first name (~75)
//   have since spent ~124 of it.
//
// ⚠️ SO THE BUDGET IS ABOUT 66px AND THIS TRIGGER IS AN ICON, NOT A LABEL.
// The persona is NOT written in the masthead — `ViewAsBanner` below already
// states it in full, at every width, directly above. Putting the words in both
// places is what cost the wordmark its 19px in the first place.
//
// ⚠️ DO NOT "IMPROVE" THIS BY ADDING THE PERSONA TEXT BACK TO THE TRIGGER.
// "Coach, Senior Men 2nd XV" is 200px+. Re-measure with the probe before
// changing this element's width at all.

function personaRoleLabel(role) {
  // roleLabel() takes a membership array; a one-element synthetic array is the
  // cheapest way to reuse its label map rather than duplicate it.
  return roleLabel([{ role }])
}

function teamName(teams, teamId) {
  return teams.find((team) => team.id === teamId)?.name ?? 'Unknown age group'
}

// Hand-rolled rather than a dependency, like every other icon in this app.
function EyeIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path
        d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="2.75" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  )
}

function optionClasses(active) {
  return [
    'flex w-full items-center justify-between gap-3 rounded-[9px] px-3 py-2 text-left text-[13.5px] font-semibold transition',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-inset',
    active ? 'bg-danger-bg text-brand-ink' : 'text-ink hover:bg-surface-mute',
  ].join(' ')
}

/**
 * The masthead dropdown. Renders nothing at all for anyone who is not a real
 * admin.
 *
 * ⚠️ A DROPDOWN, NOT A `Sheet` — Jay asked for one by name on 14 Aug 2026, and
 * it is also the right shape here: this control now lives on EVERY screen, and
 * a full-screen modal on a phone for a preview toggle is heavier than the thing
 * it is previewing. The cost is that the three behaviours `Sheet` gave for free
 * — Escape, outside-click and focus return — are implemented below by hand.
 * They are not optional; the account link two elements away is a plain `<Link>`
 * precisely because nobody wanted to write them, so do not delete them here.
 */
export function ViewAsSwitcher() {
  const { realMemberships, teams, viewAs, setViewAs } = useMemberships()
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)
  const triggerRef = useRef(null)
  const panelRef = useRef(null)
  // Viewport coordinates for the portalled panel — see the note above its render.
  const [anchor, setAnchor] = useState(null)

  const admin = isAdmin(realMemberships)

  // Built from the REAL set: while previewing, the effective set holds a single
  // team and this list would collapse to just that one, stranding the admin on
  // whichever age group they picked last.
  const previewTeams = useMemo(
    () => (admin ? visibleTeams(realMemberships, teams) : []),
    [admin, realMemberships, teams],
  )

  // Escape closes and returns focus to the trigger. ⚠️ Keyed on `open` rather
  // than always-listening: a document-level keydown handler that runs on every
  // screen for every admin, to do nothing 99% of the time, is exactly the kind
  // of thing that ends up swallowing a keystroke somewhere else.
  useEffect(() => {
    if (!open) return undefined
    function onKeyDown(event) {
      if (event.key === 'Escape') {
        setOpen(false)
        triggerRef.current?.focus()
      }
    }
    function onPointerDown(event) {
      // ⚠️ BOTH REFS, AND THAT BECAME NECESSARY THE MOMENT THE PANEL WAS
      // PORTALLED. The wrapper holds the TRIGGER; the panel is now a child of
      // <body> and is no longer inside it. Testing the wrapper alone would make
      // every click on a menu item "outside" — the menu would close on
      // pointerdown before the click landed, so choosing a persona would do
      // nothing at all.
      //
      // ⚠️ And the trigger must stay in the test too: dropping it would treat a
      // click on the trigger as outside, closing and instantly reopening — the
      // double-toggle that makes a dropdown look like it refuses to shut.
      if (wrapRef.current?.contains(event.target)) return
      if (panelRef.current?.contains(event.target)) return
      setOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('pointerdown', onPointerDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('pointerdown', onPointerDown)
    }
  }, [open])

  // ══ ⚠️ THE PANEL IS PORTALLED TO <body> AND POSITIONED IN VIEWPORT COORDS ══
  //
  // It was `absolute` inside the trigger's wrapper until 14 Aug 2026, and it was
  // CLIPPED TO A SLIVER on the live site. The masthead row carries
  // `overflow-hidden` — deliberately, to clip the `harlequin` diagonals that
  // bleed off its right edge — and an absolutely-positioned child of a clipped
  // ancestor is clipped with it.
  //
  // ⚠️ THE CHECK THAT MISSED IT IS THE PART WORTH REMEMBERING. The pre-merge
  // measurement asked `getBoundingClientRect()` whether the menu sat inside the
  // viewport, and it does — **a layout box is reported at full size even when an
  // ancestor is visually clipping it to nothing.** The rect said 264px wide at
  // 40→304 while a person saw a 6px strip. Measure VISIBILITY with
  // `document.elementFromPoint`, not geometry with a rect.
  //
  // ⚠️ `position: fixed` ESCAPES THE CLIP ONLY BECAUSE NO ANCESTOR SETS
  // `transform` / `filter` / `perspective` — any of those would make that
  // ancestor the containing block and re-clip it. `Sheet.jsx` relies on exactly
  // the same property and states the same caveat. If a page-transition wrapper
  // ever adds a transform, both break together.
  useEffect(() => {
    if (!open) return undefined
    function place() {
      const rect = triggerRef.current?.getBoundingClientRect()
      if (!rect) return
      // Right-anchored, so the panel opens inward from a trigger that sits near
      // the right edge at every width.
      setAnchor({ top: Math.round(rect.bottom + 8), right: Math.round(window.innerWidth - rect.right) })
    }
    place()
    // `true` for capture: the masthead is sticky, so it does not move on scroll,
    // but a scroll container between here and the trigger would — and a stale
    // anchor leaves the menu floating away from its button.
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open])

  if (!admin) return null

  function choose(next) {
    setViewAs(next)
    setOpen(false)
    triggerRef.current?.focus()
  }

  // The full sentence reaches screen readers and hover, and NEVER the masthead
  // itself — see the width note at the top of this file.
  const triggerAria = viewAs
    ? `Change preview — currently viewing as ${personaRoleLabel(viewAs.role)}, ${teamName(teams, viewAs.teamId)}`
    : 'View as'

  return (
    <div ref={wrapRef} className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        data-testid="view-as-trigger"
        onClick={() => setOpen((was) => !was)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={triggerAria}
        title={triggerAria}
        // ⚠️ STYLED FOR THE DARK CHROME, unlike the version that lived on the
        // Admin screen — this sits on the near-black masthead again.
        //
        // ⚠️ THE ACTIVE STATE IS A RING AND A DOT, NOT COLOUR ALONE
        // (claude/specs/accessibility.md). The dot is aria-hidden and the state
        // is carried in the aria-label, which says "currently viewing as …".
        className={[
          'grid h-8 w-8 place-items-center rounded-full text-white outline-none transition',
          'focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-chrome',
          viewAs ? 'bg-brand/30 ring-1 ring-inset ring-brand-onDark' : 'bg-white/15 hover:bg-white/25',
        ].join(' ')}
      >
        <EyeIcon className="h-[18px] w-[18px]" />
        {viewAs && (
          <span
            aria-hidden="true"
            className="absolute right-0 top-0 h-2 w-2 rounded-full bg-brand-onDark"
          />
        )}
      </button>

      {open && anchor && createPortal(
        <div
          ref={panelRef}
          data-testid="view-as-menu"
          role="menu"
          aria-label="View as"
          // ⚠️ POSITIONED IN JS, NOT IN TAILWIND, because it is portalled out of
          // the masthead and has no positioned ancestor to anchor to any more.
          // `right` rather than `left` keeps it opening inward from a trigger
          // that sits near the right edge at every width.
          style={{ position: 'fixed', top: anchor.top, right: anchor.right }}
          // ⚠️ `max-w-[calc(100vw-16px)]` IS THE PHONE GUARD. A fixed 264px
          // panel is wider than the gap between the trigger and the left edge on
          // the narrowest phones, and a fixed element that overflows would take
          // the document width with it — the failure
          // harness/check-overflow.mjs exists to catch.
          //
          // ⚠️ z-50: the sticky masthead is z-40. Portalled to <body> this is
          // already above it in document order, but the token stays so that
          // moving this back into the tree cannot silently put it behind the bar
          // it hangs from.
          className="z-50 max-h-[70vh] w-[264px] max-w-[calc(100vw-16px)] overflow-y-auto rounded-[14px] border border-line bg-surface-card p-2 shadow-card"
        >
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

          {/* Deliberately still only Coach and Parent, not one persona per
              role. 'manager' and 'medic' grant EXACTLY what 'coach' grants
              (SQUAD_STAFF_ROLES in src/lib/scope.js), so a "Team Manager of
              U12" persona would render a pixel-identical preview to "Coach of
              U12" — 30 extra rows across 15 squads showing nothing new.
              personaRoleLabel() goes through roleLabel(), so if a persona for
              one of them is ever added it will already be labelled correctly. */}
          {/* ⚠️ THE VISIBLE LABEL IS "Coach"; THE ACCESSIBLE NAME IS "Coach of
              U12 Boys". Grouping under a squad heading is what keeps this menu
              compact enough to be worth having on a phone — but a heading is a
              VISUAL association only, so without the aria-label a screen reader
              reads out fifteen buttons all called "Coach" and two called
              "Parent" per squad, with nothing to tell them apart. The heading is
              aria-hidden for the same reason: it would otherwise be announced as
              a stray line of text between identical items.
              Same split the trigger makes, and the same one
              claude/specs/accessibility.md asks for. */}
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
        </div>,
        document.body,
      )}
    </div>
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
      className="bg-brand-deep text-white"
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

export default ViewAsSwitcher
