# Plan — the top bar hides like the dock, and both bars go Liquid Glass

**STATUS: NOT YET SHIPPED — designed and approved 24 Aug 2026, implementation
in progress.** Update this line when it merges.

## Why

Jay, 24 Aug 2026: "can we make the top bar in the app disappear like the
bottom bar?" and "i would like the top and bottom to look more like liquid
glass". Two changes, one PR, one deploy — appearance is tuned in the local
harness with screenshots and approved BEFORE anything deploys, because
iterating a look one production deploy at a time is the expensive way.

## Part 1 — auto-hide, phones only

- The scroll-direction logic inline in `src/components/Nav.jsx` (down past
  80px hides, any up-scroll / top / bottom / route change shows, 6px
  hysteresis) moves to a shared hook: `src/lib/useAutoHideOnScroll.js`.
  One copy, two consumers — the thresholds cannot drift.
- The dock keeps exactly its current behaviour, now via the hook.
- AppShell's sticky masthead wrapper slides up (`-translate-y-`full +
  opacity) when hidden, phone-only: the transform is neutralised at the
  `desktop:` breakpoint. Chosen over "everywhere" — the desktop island is a
  small top-right element on screens with no vertical shortage, and hiding
  it hides the account menu for no gain.
- ⚠️ **View as disables the hide.** The ViewAs banner shares the sticky
  wrapper and its spec says persistent and unmissable — an admin forgetting
  they are previewing is the failure it prevents. `useMemberships().viewAs`
  truthy → the hook is told to keep the bar shown.
- ⚠️ The wrapper carries `pointer-events-none` since PR #366 and the status
  strip / chat dock rely on the z-order around it — classes are added, none
  removed.

## Part 2 — Liquid Glass on `.glass-dock`, `.glass-island` (src/index.css)

The bars are already frosted (tint + blur + flat 1px rim). Liquid Glass adds
what real glass does to light, and lowers the tint:

- **Clearer**: dock fill 62% → ~50%, island 70% → ~55%.
- **Lensing**: `brightness(1.08) contrast(1.05)` joins the blur/saturate in
  the backdrop filter.
- **Specular rim**: the uniform border becomes a gradient edge — bright at
  the top curve, fading out at the bottom.
- **Light-catch sheen**: a soft diagonal highlight overlay inside the
  surface.

⚠️ **The contrast floor is the limit, and it is arithmetic, not taste.**
White icons on the dock are UI components with a 3:1 floor
(`claude/specs/accessibility.md`); ~50% chrome over worst-case white
content composites to roughly 4:1 and holds. 40% does not. The doc note at
`.glass-dock` ("62%, DOWN FROM 84%") gets updated with the new numbers and
the same reasoning.

## Verification

- Hook tests (new file): down hides, up shows, top/bottom always shows,
  route reset, disabled flag pins it shown — each proved against an
  injected fault.
- Existing dock tests keep passing through the extraction.
- jsdom sees no CSS: class tokens are pinned, as the dock's tests already
  do.
- Look approval: harness screenshots of both bars over light and dark
  content, shown to Jay BEFORE the PR merges. One deploy at the end.

## Also in this PR

- `claude/plans/2026-08-24-help-into-account-menu.md` STATUS flipped to
  shipped (squash `34b529d`) — the entry that PR could not write for itself.
