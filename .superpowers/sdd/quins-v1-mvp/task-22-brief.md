### Task 22: End-to-end role + a11y verification, release (FINAL TASK of the v1 MVP plan)
**Files:** Create `docs/e2e-roles.md` (checklist) + any fixes it turns up.
- [ ] Write the end-to-end checklist: admin / coach / parent accounts, scoping, edit-gating, contact hiding, RSVP realtime.
- [ ] Accessibility pass: visible keyboard focus, `prefers-reduced-motion` respected, contrast AA on the brand palette (document the accessible red/green pairings actually used for text).
- [ ] Document the deploy + domain steps (Netlify env vars, `adhjrt.com` trial subdomain, Supabase allowed redirect URLs). Commit.

---

## Context: a lot of the accessibility work is ALREADY done — this is mostly audit + one real bug

The original prototype's design spec (`docs/design-system.md` §8) lists a set of accessibility
gaps the React rewrite was supposed to close. Checking the actual code (not the old prototype
doc) shows nearly all of them are already fixed, by earlier tasks, without a dedicated
"accessibility task" ever existing before now:

- `Sheet.jsx` already implements: `role="dialog" aria-modal="true"`, `aria-labelledby`, a real
  focus trap (Tab/Shift+Tab wrap inside the panel), Escape-to-close, focus moved into the panel
  on open and restored to the trigger element on close. Read its file header comment — it
  explicitly cites design-system.md §8's gap list and marks each one as closed.
- Icon-only buttons already have `aria-label` — checked `Sheet.jsx`'s close button
  (`aria-label="Close"`), `Schedule.jsx`'s calendar prev/next (`aria-label="Previous
  month"`/`"Next month"`) and its calendar day cells (real `<button>` elements, not
  `cursor:pointer` divs, each with a computed `aria-label` naming the date and event count),
  `Roster.jsx`'s search input (`aria-label="Search players"`), `Nav.jsx` (`aria-label="Primary"`
  on the `<nav>` itself).
- Toast/error messaging uses `role="alert"` throughout (`AppShell.jsx`, `PlayerForm.jsx`,
  `EventDetail.jsx`, `PlayerDetail.jsx` — 13 instances) — `role="alert"` is itself an implicit
  ARIA live region (assertive), so this already satisfies "announce to screen readers" without
  needing a separate `aria-live` attribute.
- `src/index.css` already has a global `@media (prefers-reduced-motion: reduce)` block that
  forces every transition/animation to near-zero duration app-wide — this is not something to
  add, just verify it's still comprehensive and hasn't been bypassed by anything added since
  (e.g. `Sheet.jsx`'s slide-up/scale-in/fade animations pair `motion-reduce:animate-none` on top
  of the global rule — check that pattern is universal, not just on Sheet).
- Focus-visible rings (`focus-visible:ring-2 focus-visible:ring-quinsRed`) are already applied
  on essentially every interactive element across every screen and component — verify this by
  actually tabbing through the app in a real browser (see the browser-verification step below),
  not just by grepping for the class.

**Do not re-litigate or redo any of the above.** Your job is to verify each claim above against
the real running app (tab through it, don't just trust the grep), and write it up. Where you
find something that ISN'T actually true when you check it live, that's a real finding — fix it.

## The one gap that's genuinely still open: no skip-to-content link

design-system.md §8 lists "No skip-to-content link" and nothing in the codebase has added one
since. Add a real one:

- A visually-hidden-until-focused link as the very first focusable element in the DOM, inside
  `AppShell.jsx` (the shared frame every screen renders inside), pointing at the `<main>`
  landmark that's already there (`<main className="mx-auto w-full max-w-[1120px] ...">`  around
  line 167). Give `<main>` an `id` (e.g. `id="main-content"`) and `tabIndex={-1}` (so it can
  receive programmatic focus when the skip link's href jumps to it — an anchor-link jump alone
  moves the *viewport* but doesn't move keyboard focus into the target unless the target is
  focusable).
- Standard pattern: visually hidden by default (Tailwind's `sr-only`), visible and positioned
  sensibly (e.g. `focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 ...`)
  when it receives keyboard focus — the same visible-on-focus, hidden-otherwise pattern every
  real skip link uses. Style it consistently with the rest of the app (quinsRed background,
  white text, matches the existing focus-visible ring convention already used everywhere else).
- Verify with a real Tab keypress from a fresh page load that it's genuinely the first thing
  focused, that it's invisible until focused, and that activating it (Enter, or click) actually
  moves keyboard focus to `<main>` (not just scrolls the viewport).

## A real, previously-unexamined contrast risk to check and likely fix: the header gradient's green end

`AppShell.jsx`'s `<header>` uses a `100deg` linear gradient across its **full viewport width**:
`quinsRedDark 0% → quinsRed 42% → #B23A38 62% → quinsGreen 100%`. The header's *content* (crest,
title, role badge, `<Nav />`) sits inside an inner `mx-auto max-w-[1120px]` div — centered, not
full-width. `Nav.jsx` only renders inline in the header at the `desktop:` breakpoint (≥820px);
below that it detaches to a `fixed` white bottom tab bar and is nowhere near the gradient at all
(no contrast issue on mobile — confirmed by reading `Nav.jsx`'s own className logic).

The problem: at desktop breakpoint widths close to the 820px minimum, the centered content div
is close to the FULL viewport width (820px content in an ~820px viewport), meaning the
right-aligned role badge and `<Nav />` pills sit very close to the gradient's right edge — i.e.
very close to the **pure quinsGreen (100%) stop**, not the red portion. Hand-computed WCAG
contrast (relative luminance formula, sRGB) for white text/pills directly on `#7DC351`
(quinsGreen) comes out around **~2:1** — a clear failure of both the 4.5:1 (normal text) and
even the 3:1 (large text / UI component) AA thresholds. The role badge's own
`bg-white/[.16]` semi-transparent pill doesn't save this either — blending 16% white over
`#7DC351` still lands around ~1.9:1 for the white label text on top of it, by the same
hand-calculation. Nothing in the codebase's otherwise-thorough contrast documentation (see the
next section) mentions this case — every other file's contrast comments are about text against
solid `--paper`/card colours, never about text against the moving gradient itself. This looks
like a genuine gap nobody has checked, not a previously-adjudicated tradeoff.

**Your job:** confirm this for real, don't just trust the hand-calculation above (it could be
wrong, or the actual rendered layout might not put text over the green portion at real
breakpoint widths — verify empirically). Use the real running app in a browser at a representative
range of desktop widths (820px, ~900px, 1024px, 1280px, and a couple of wider desktop sizes) and
either:
(a) confirm text/pills never actually sit over a contrast-failing portion of the gradient at any
real width (if so, document why with actual measured colours/positions, and this needs no code
change), or
(b) if it IS a real failure at some real width, fix it. Options worth considering (your call,
justify whichever you pick): shortening the gradient's stops so the header's own visible portion
stays within the red family regardless of viewport width (e.g. move the `100%` quinsGreen stop
further out, or use `vw`-relative stops sized to guarantee coverage only past the content's max
width); adding a subtle dark scrim/overlay only behind the right-hand content cluster; or
switching the role badge / Nav's active-pill background to a more opaque, proven-safe fill
(e.g. a darker semi-transparent black instead of white) so the effective background stays
readable regardless of the underlying gradient colour at that point. Whatever you choose, it
must not change the header's overall look-and-feel at the red end (left side, where the crest
and title sit) — that combination is already correct and used throughout marketing/branding.

## Accessibility documentation to consolidate (docs/accessibility.md or a section of docs/e2e-roles.md — your call on file split, state your reasoning)

The codebase has extensive but *scattered* inline comments documenting specific contrast-ratio
decisions (grep for "clears AA", "fails AA", ":1" across `src/components/Chip.jsx`,
`src/components/Badge.jsx`, `src/components/ScopeNote.jsx`, `src/screens/PlayerForm.jsx`,
`src/screens/EventDetail.jsx`, `src/screens/PlayerDetail.jsx`, `src/screens/EventForm.jsx`,
`src/screens/Schedule.jsx`, `src/screens/Dashboard.jsx`, `src/screens/Roster.jsx`). Pull these
into one consolidated, human-readable accessibility document covering:

1. **The brand-palette contrast pairs actually used for text**, with their real measured ratios
   and pass/fail against AA (4.5:1 normal text, 3:1 large text/UI components), e.g.:
   - `--muted` `#5c5854` on `--paper`/white backgrounds: 6.417:1, passes AA (the app-wide default
     for de-emphasized text on light backgrounds).
   - `#77726e` on a card/tinted background (not white/paper): 4.755:1, passes AA — this is
     DIFFERENT from `--muted`'s value and DELIBERATELY different from `#5c5854`; don't conflate
     them, they're both real, both correct, just for different background contexts (this project
     has shipped the wrong one — using `#77726e` where `#5c5854` was needed — as a live bug 3+
     times per the project's own binding ruling; be precise about which applies where).
   - `quinsRed` `#C21F32` on white: 5.93–5.94:1, passes AA.
   - White at 85% opacity on the header gradient's red end (`quinsRed`): 4.63:1, passes AA;
     white at 70% on the same background: 3.55:1, fails.
   - quinsGreen `#7DC351` as a text/foreground colour: fails AA outright (~1.9:1 on white) —
     document that it is used ONLY as a gradient/block-fill background colour, never as text,
     and (pending your investigation above) document what IS safe for text/icons that render
     on top of it where the gradient reaches full green.
   - The warn/amber family (`#c9861a` on `#fbf1dd`, ~2.71:1) — fails AA; document what
     component uses it and why that's an accepted exception (check `Badge.jsx`'s and
     `ScopeNote.jsx`'s own comments for the existing reasoning — likely "border/icon-adjacent
     decorative use, not the sole conveyor of meaning" — confirm and state it plainly).
   Cite each with the actual file:line where the ratio was computed, so this doc stays a real
   index into the codebase's existing reasoning rather than a duplicate, driftable copy of it.
2. **Keyboard**: confirm and document that every interactive control has a visible focus
   indicator (the `focus-visible:ring-2 focus-visible:ring-quinsRed` convention), that Sheet's
   focus trap/Escape/restore behaviour works for every screen that opens one (event detail/
   add-edit, player detail/add-edit, invite form, availability), and that the new skip link
   works. State clearly which of these you verified in a real browser vs. by reading code.
3. **Motion**: confirm the global `prefers-reduced-motion` rule in `src/index.css` and Sheet's
   `motion-reduce:animate-none` pairing are both still present and correctly scoped.
4. **Known, accepted gaps** (if any remain after your work) — state them plainly rather than
   silently omitting them, same as every other task's report in this project has done.

## docs/e2e-roles.md — the end-to-end role checklist

A checklist a real person (Jay) can run through after each of admin/coach/parent accounts is set
up (via the Task 18 invite flow / Task 19 first-admin doc), covering:

- **Admin**: sees all 15 age groups in Schedule/Roster/Availability; sees the Admin overview
  (Task 17) with every club member; can create/edit/delete events and players across every
  team; can send invites for any role/team; contact details visible for every player.
- **Coach**: sees and can edit only their own assigned team(s) in Schedule/Roster/Availability
  (create/edit/delete events and players scoped to `can_edit_team`); cannot see or reach another
  team's data via URL manipulation (RLS enforces this server-side even if the UI didn't); can
  see contact details only for players on their own team (`can_edit_team(...) OR
  is_own_player(...)` — a coach's own-team access is via the first clause).
  they cannot edit other teams.
- **Parent**: read-only everywhere except their own child's availability RSVP
  (`is_own_player`); sees only their child's team's schedule/roster (`can_see_team`); contact
  details for their own child are visible, other players' are not, per `player_contacts`' RLS.
- **Player** (if distinct from parent in practice for this club — note this is the same RLS role
  as parent, `role IN ('parent','player')`, so the checklist can treat them identically unless
  real usage differs): same scoping shape as parent.
- **RSVP realtime**: one person's availability change is reflected for another person viewing
  the same event's availability list without a manual refresh (Task 16's realtime subscription).
- Each checklist item should be phrased as a concrete, falsifiable step ("Log in as a coach
  assigned to U12s. Open Roster. Confirm exactly the U12s squad is listed, no other age group
  appears in the dropdown/filter.") not a vague goal.

This doc doesn't require you to have real admin/coach/parent Supabase accounts to execute it
end-to-end yourself (there's no seeded real membership data yet — Wild Apricot import is a
future, out-of-scope step) — write it as the checklist Jay will actually run once real accounts
exist, grounded in the actual RLS policies and actual UI behaviour you can verify today via the
existing test suite and a browser pass against whatever demo/seed state exists.

## docs/deploy.md — deploy + domain steps

Document, for Jay to execute himself (this build's constraint: Claude designs and writes exact
instructions, Jay does account setup / clicks / secrets):

- **Netlify** (or whichever static host — confirm current plan in RESTORE.md/project instructions
  before writing this; it says Netlify/Vercel/Cloudflare Pages or Jay's existing host, trial on
  his own domain first): environment variables needed at build time
  (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` — the PUBLISHABLE key, never the secret key),
  build command (`npm run build`), publish directory (`dist`).
- **`adhjrt.com` trial subdomain**: DNS steps to point a subdomain (e.g. a CNAME) at the chosen
  host, committee-only access approach (inviting only committee accounts + an unlisted link,
  not embedding as an iframe — logins break in iframes, per the project's own locked-in plan).
- **Supabase Auth allowed redirect URLs**: the exact dashboard setting (Authentication → URL
  Configuration) that needs the new domain added before magic-link/OAuth sign-in will work
  there, and what breaks if it's forgotten (sign-in redirects fail/land on the wrong origin).
- State plainly which of these steps only Jay can do (account creation, DNS changes, clicking
  "Deploy") vs. what you're providing (exact values, exact settings, exact commands).

## Binding project-wide rulings that still apply

- No native `confirm()` anywhere (if the skip link or any new UI needs a "jump" confirmation —
  it doesn't, but as always, don't introduce one).
- `--muted` text colour: `#5c5854` on paper/card backgrounds, never `#77726e` — be precise in
  the consolidated a11y doc about which is used where (see above), don't blur this distinction.
- No jersey numbers anywhere.
- Don't touch anything unrelated to this task's scope.

Run `npm test` before you're done (535 currently, expect a few more from the skip-link change if
you add tests for it) and `npm run build` clean. This is the LAST task in the v1 MVP plan —
be thorough, this is what the whole build gets judged against before go-live.
