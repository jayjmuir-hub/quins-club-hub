# Retheme & shell — Club Hub joins the club's design family

**Status: shipping — phase 1 landed** (tokens/themes/toggle/identity); phases
2-5 still to come, each its own PR.

## The decisions, in Jay's words, 21 Aug 2026

1. *"the desktop version of the site looks too much like an app and not a
   desktop site"* — and the tour of the codebase's history confirmed that was
   never a decision, just the absence of a desktop design pass (the original
   `desktop-spec.md` was famously never committed and is unrecoverable).
2. *"i would like to have club hub look and feel somewhat similar"* to
   **abudhabiquins.com** — the redesigned public site and its member portal,
   which Jay signed into so both could be measured directly.
3. *"the website, member portal, and the app for the website all have light
   or dark mode"* — so Club Hub gets both, with a toggle.
4. *"we need to figure out how to bring admin functions into the app, that is
   my decision now."* Admin stops being desktop-only.

**This REPLACES the maroon design system as the app's visual identity.** The
old look does not survive as a third theme. `claude/specs/design-system.md`
stays as the record of what was (history, not instruction) until each section
is superseded; the tokens below are the new contract.

## ⚠️ Correction found while starting phase 1: half the match already shipped

The palette and fonts were ALREADY re-pointed at the club redesign on
6 Aug 2026 — crimson `#c8102e`, the neutral greys, Inter throughout, dark
chrome — by a session this spec's author had not read deeply enough.
`claude/specs/design-system.md` still describes the pre-6-Aug world, which is
exactly how this spec briefly told Jay the app was "maroon with system
fonts". The code wins; the doc is history. Phase 1's REAL content was
therefore: dark mode (tokens → CSS variables), the toggle, the Playfair
accent voice, and the 2.0 identity.

## What was measured on abudhabiquins.com (21 Aug 2026, live site + portal)

Measured from the pages' own CSS custom properties and computed styles — not
eyeballed from screenshots.

### Palette (the site's own `:root` tokens)

| Token | Value | Use |
|---|---|---|
| `--quins-red` | `#c8102e` | THE brand action colour — every primary button, active nav, accent word |
| `--quins-green` | `#1a7a3c` | Positive states ("in good standing") |
| `--quins-red-deep` | `#6b0f1a` | Depth variant |
| `--quins-green-deep` | `#0d3d22` | Depth variant |
| Light mode | bg `#fff`, ink `#0a0a0a`, border `#e5e5e5`, muted `#f3f3f3` | |
| Dark mode | bg `#000`/panels `#0a0a0a`, ink `#fff`, border `#2a2a2a` | |
| `--radius` | `0.5rem` | Much squarer than the hub's current 16px |

Portal cards are FLAT: hairline border, no drop shadow, zero-to-small radius.
In light mode the member card deliberately STAYS a dark panel — a physical
card sitting on paper. That trick is worth keeping.

### Type & voice

- **Inter** for everything; display headings at weight 700–800, UPPERCASE,
  tight tracking (measured −1px at ~54px, −0.5px at 96px).
- **Playfair Display italic in crimson** as the accent voice — one word per
  headline: "Good afternoon, *Jason.*", "Club life, *calendared.*", "From the
  *committee.*", "The *Muirs*, on paper."
- **Serif italic numerals** for big figures (fees, stat rows).
- **Kicker labels**: tiny uppercase, letterspaced, with a small crimson slash
  — "DO THIS NEXT", "ON THE CALENDAR", "FROM THE CLUB" — above every section
  heading.

### The portal shell (the answer to "looks like an app")

- Fixed left sidebar, **256px**, panel bg, hairline right border: icon+label
  nav with count badges (Dashboard, Membership, Profile, Family, Payments,
  Events, Notices, Settings), sign-out at the bottom.
- Top utility bar: search, install, notifications, account chip, theme
  toggle. A live-match ticker strip appears when a game is on.
- Content uses the FULL remaining width. No centered narrow column.
- The portal's concept overlap with Club Hub is uncanny — needs-attention
  cards, a completeness meter, quick-action tiles, upcoming events with
  add-to-calendar, pinned notices with filter pills, a family page with stat
  rows. Same ideas; this retheme is changing their clothes, not their brains.

## The shape of the work

### Mobile keeps its bones

Tab bar, sheets, single column — right for a parent at the pitch. It adopts
the tokens, type, voice and both themes, nothing structural.

### Desktop gets the portal shell

Sidebar + utility bar + full-width content replaces the centered 1120px
column. The sidebar is also the dashboard-rethink answer: Home, Squad Hub,
Notices, Schedule, Roster, and the admin portals become destinations in ONE
nav instead of scattered entry points.

### Admin comes to the phone

Today every admin screen already RUNS on mobile — `AdminDashboard.jsx` hides
it behind a CSS-only `desktop:hidden` "needs a wider screen" card. Bringing
admin into the app is a per-screen mobile layout job, hardest for the dense
tables (Accounts, Allocation), trivial for the card-based screens. Each
screen keeps its existing right/role gate; only the width gate goes.

### Theming mechanics

- CSS custom properties for every colour, mapped through Tailwind — the
  existing token names keep working where their MEANING survives (ink,
  surface, line), values change; `brand` moves maroon → crimson.
- `light` / `dark` via a class on `<html>`, toggle in the utility bar,
  default follows `prefers-color-scheme`, choice persisted in localStorage
  (the site itself does exactly this).
- ⚠️ Contrast: `scripts/contrast-check.mjs` and
  `claude/specs/accessibility.md` are the gate — crimson on black and muted
  grays in BOTH modes must pass before any screen ships.

## Phases — each its own PR, each deployable alone

1. **Tokens, type, themes — and the app becomes Club Hub 2.0.** Fonts in,
   palette swapped, dark mode working, toggle in the existing header. The app
   looks re-dressed but keeps its current layout. Biggest testable chunk with
   zero information-architecture risk.
   Also in this phase, per Jay (21 Aug, same conversation):
   - **The installed app is named "Club Hub"** — the PWA manifest in
     `vite.config.js` currently says name "Abu Dhabi Harlequins",
     short_name "Quins". Becomes name "Club Hub — Abu Dhabi Harlequins",
     short_name "Club Hub" (the short name is what sits under the icon).
     ⚠️ Already-installed apps re-read the manifest on their own schedule;
     phones that installed under the old name may keep it until reinstall —
     say so rather than chase it.
   - **Version 2.0.0** in `package.json` — the retheme is the 2.0. The 1.x
     line was never used; 0.1.0 jumps straight to 2.0.0 because the version
     is a statement to people, not to npm.
2. **Desktop shell.** Sidebar + utility bar + full-width content on
   `desktop:`; mobile untouched. Nav IA consolidates the scattered
   dashboards.
3. **Dashboard rethink.** Home, Squad Hub and the admin portal screens
   redesigned inside the new shell — the editorial headline voice, kickers,
   stat rows, the density a desktop deserves.
4. **Admin on mobile.** The width gate comes off screen by screen, dense
   tables get phone layouts, and the tab bar / More screen gains the admin
   entry point for those who hold the rights.
5. **Sweep & polish.** Every remaining screen through the new system;
   design-system.md rewritten to describe what NOW ships.

## Arguments against, recorded (docs rule: keep the counter-case)

- *Dark mode in a data tool*: long rosters and grids are harder on the eyes
  dark. Answer: both modes exist and the USER chooses; default follows the
  system. Nobody is forced dark.
- *Retheme churn costs deploys*: five phases = five builds minimum. Answer:
  phases are the cheap direction — one mega-PR would cost the same builds in
  review round-trips and be unreviewable. Cosmetic iteration inside a phase
  happens on deploy previews, not production builds.
- *"The old design was fine"*: it was — for a phone. The complaint this spec
  answers is specifically the desktop, and the club now HAS a visual
  identity the hub predates. Matching it is a branding decision Jay made
  with both sites open.
