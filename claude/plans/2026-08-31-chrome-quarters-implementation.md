# Chrome-Quarters Bars Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Status: SHIPPED (PR pending merge, 31 Aug 2026).** Spec:
`claude/plans/2026-08-31-chrome-quarters-redesign.md` (agreed by Jay
31 Aug 2026). Ship it and this line changes.

**Goal:** Both chrome bars (masthead island + bottom dock) become premium
dark chrome with ghosted harlequin quarters, white content, identical in
both themes.

**Architecture:** Pure re-skin. The two shared CSS recipes
(`.glass-island`/`.glass-dock` in `src/index.css`) swap from clear frost to
dark gradient + two diagonal quarter sweeps; the ink-coloured content on
the bars returns to white. No geometry, markup, or behaviour changes.

**Tech Stack:** Tailwind 3.4 utility classes, hand-written CSS in
`src/index.css`, vitest class-pinning tests, Playwright harness renders.

## Global Constraints

- Work in a fresh worktree from `origin/main` — the shared clone is
  another session's workspace: `git worktree add -b feat/chrome-quarters
  .claude/worktrees/chrome-quarters origin/main`, then
  `cp ../../../.env .env` inside it (worktrees ship no `.env`; without it a
  block of tests fails to collect with a Supabase env error).
- Never `git add -A`; stage explicit paths (CLAUDE.md rule 1).
- Every new test assertion is proven against an injected fault before it
  counts (CLAUDE.md rule 6).
- Quarter opacities are capped at 0.30 red / 0.26 green — a spec rule so
  the red pill and unread dots always dominate; do not raise them.
- Changelog discipline: cite the PREVIOUS merge's squash SHA on its
  uncited entry, leave this PR's own entry unSHA'd "(SHA follows in the
  next changelog-touching PR.)". Run `npm run docs:check` AFTER the
  commit, and trust CI over a local red (CLAUDE.md docs:check §2).
- `main` deploys the live site. Do not push to `main`; PR only. Jay has a
  standing "merge PRs when you can": merge on green checks with
  `gh pr merge <n> --squash` (plain command, alone — never `--auto`, it is
  disabled on this repo).

---

### Task 1: The chrome material (CSS)

**Files:**
- Modify: `src/index.css` — the `.glass-island, .glass-dock` block
  (currently ~L494) and its two `@supports` companions (~L536, ~L564)
- Test: `scripts/contrast-check.mjs` (existing, run not written) + harness
  render

**Interfaces:**
- Produces: the class names `.glass-island` / `.glass-dock` are unchanged;
  only their painted appearance changes. Tasks 2–3 rely on the chrome
  being opaque dark so white text is safe on it.

- [ ] **Step 1: Replace the base recipe.** In `src/index.css` find the
  `.glass-island, .glass-dock` rule (search `glass-dock {`). Replace ONLY
  its `background:` declaration (the clear-frost `linear-gradient(160deg,
  rgb(140 150 165 / 0.1) …)`) and add the box-shadow, keeping
  `position: relative`, both `backdrop-filter` lines, and the liquid-lens
  `url()` override lines below them exactly as they are:

```css
  .glass-island,
  .glass-dock {
    position: relative;
    /* ══ CHROME-QUARTERS (31 Aug 2026, Jay) ══ Premium dark chrome with
       the quartered-shirt echo: club red sweeping from the LEFT, club
       green from the RIGHT, both GHOSTED over near-black. The alphas are
       a RULE, not taste — ≤0.30 so the red active pill and the unread
       dots always dominate the quarters. Identical in both themes:
       identity lives on the chrome (2.0 retheme ruling, restored).
       Spec: claude/plans/2026-08-31-chrome-quarters-redesign.md */
    background:
      linear-gradient(115deg, rgb(225 27 34 / 0.3) 0 30%, transparent 43%),
      linear-gradient(295deg, rgb(0 106 77 / 0.26) 0 22%, transparent 38%),
      linear-gradient(160deg, rgb(21 21 23 / 0.94), rgb(12 12 14 / 0.97));
    /* Depth + the white inner top hairline that keeps the island's edge
       readable over dark-mode content. */
    box-shadow:
      0 10px 34px rgb(0 0 0 / 0.45),
      inset 0 1px 0 rgb(255 255 255 / 0.09);
    -webkit-backdrop-filter: saturate(180%) blur(20px);
    backdrop-filter: saturate(180%) blur(20px);
```

- [ ] **Step 2: Delete the light-mode strengthen block.** Remove the whole
  `@supports ((backdrop-filter…))` block containing
  `:root:not(.dark) .glass-dock` (~L536-545) — it existed to thicken the
  CLEAR frost in light mode; the chrome is no longer theme-contingent.
  Leave a one-line tombstone comment in its place:

```css
  /* Tombstone: a :root:not(.dark) frost-strengthening block lived here
     until the chrome-quarters pass — clear glass needed a thicker frost
     in light mode; opaque chrome does not. */
```

- [ ] **Step 3: Update the glint and the fallback.** In the
  `.glass-island::after, .glass-dock::after` rule replace the
  `background:` with:

```css
    background: linear-gradient(115deg, rgb(255 255 255 / 0.1), transparent 34%);
```

  In the `@supports not ((backdrop-filter…))` fallback replace
  `background: rgb(var(--surface-card-rgb));` with:

```css
      /* No backdrop-filter → solid chrome. The old card-token fallback
         would now put white text on a light card. */
      background: rgb(21 21 23);
```

- [ ] **Step 4: Measure contrast.**

Run: `node scripts/contrast-check.mjs`
Expected: exits 0 (the script measures the palettes; nothing in it keys
off the removed block — if it errors, read the message before touching
anything).

- [ ] **Step 5: Look at it.** Start the harness
  (`npm run harness` or the Browser pane's `harness` launch config), open
  `http://localhost:5199/?scenario=shell-coach` at 375px. Expected: both
  bars dark with red/green sweeps; icons are momentarily LOW-CONTRAST
  (still ink) — that is Tasks 2–3, not a bug.

- [ ] **Step 6: Commit.**

```bash
git add src/index.css
git commit -m "feat(chrome): dark quarter-swept material for both bars"
```

---

### Task 2: White nav content

**Files:**
- Modify: `src/components/Nav.jsx` — `linkClassName` (~L120)
- Test: `tests/nav.test.jsx`

**Interfaces:**
- Consumes: Task 1's opaque dark chrome (white ink is only safe on it).
- Produces: idle dock links carry `text-white/90`; the test name
  `'idle items are white on the chrome-quarters dock'` (Task 4's
  changelog cites this file pair).

- [ ] **Step 1: Write the failing test.** In `tests/nav.test.jsx`, first
  run `grep -n "text-ink" tests/nav.test.jsx` — if an existing assertion
  pins the idle `text-ink` (the 28 Aug full-ink fix may have one), UPDATE
  that test in place instead of adding a duplicate. Either way the final
  assertion is:

```jsx
  // Chrome-quarters (31 Aug 2026): the dock is opaque dark chrome again,
  // so idle items return to white — ink was for the clear-glass era when
  // the bar had to read over whatever scrolled beneath it.
  it('idle items are white on the chrome-quarters dock', () => {
    renderNav('/roster')
    const idle = [...document.querySelectorAll('nav a')].filter(
      (a) => a.getAttribute('aria-current') !== 'page',
    )
    expect(idle.length).toBeGreaterThan(0)
    for (const link of idle) {
      expect(link.className).toContain('text-white/90')
      expect(link.className).not.toContain('text-ink')
    }
  })
```

- [ ] **Step 2: Run it, expect red.**

Run: `npx.cmd vitest run tests/nav.test.jsx`
Expected: FAIL — className contains `text-ink`.

- [ ] **Step 3: Implement.** In `linkClassName` change the final line:

```jsx
    // White again since the chrome-quarters pass (31 Aug 2026): the dock
    // is opaque dark chrome, so the clear-glass reasons for theme ink
    // (24 Aug) and full-strength ink (28 Aug) both retire with it.
    isActive ? 'px-3 text-white' : 'px-2 text-white/90',
```

- [ ] **Step 4: Run the file, expect green.**

Run: `npx.cmd vitest run tests/nav.test.jsx`
Expected: all tests pass (if another test pinned `text-ink`, Step 1
already updated it).

- [ ] **Step 5: Prove the assertion.** Temporarily change
  `text-white/90` back to `text-ink` in `linkClassName`, run the file,
  confirm EXACTLY the new/updated test fails, revert, confirm green.

- [ ] **Step 6: Commit.**

```bash
git add src/components/Nav.jsx tests/nav.test.jsx
git commit -m "feat(chrome): dock content returns to white on the dark chrome"
```

---

### Task 3: White masthead content

**Files:**
- Modify: `src/components/AppShell.jsx` — the `<header>` block (~L495-640)
- Test: `tests/app-shell.test.jsx`

**Interfaces:**
- Consumes: Task 1's opaque chrome.
- Produces: masthead header carries `text-white/90`; wordmark
  `text-white/80`.

- [ ] **Step 1: Find every ink token inside the header block.**

Run: `grep -n "text-ink" src/components/AppShell.jsx`
Expected hits INSIDE the `<header>`/masthead JSX only (the two known ones
below, plus possibly the chevron/theme-toggle icons). Content-well hits
outside the header block are NOT touched.

- [ ] **Step 2: Write the failing test** in `tests/app-shell.test.jsx`
  (same describe block as the width-parity test):

```jsx
  // Chrome-quarters (31 Aug 2026): the masthead is opaque dark chrome, so
  // its text returns to white-on-chrome tokens. The role chip and the
  // avatar disc keep their own fills and are deliberately not asserted.
  it('masthead text is white on the chrome-quarters island', () => {
    useMembershipsMock.mockReturnValue(loaded())
    renderShell()
    const header = document.querySelector('header')
    expect(header.className).toContain('text-white/90')
    expect(header.className).not.toContain('text-ink')
    const wordmark = screen.getByText('Quins Club Hub')
    expect(wordmark.className).toContain('text-white/80')
    expect(wordmark.className).not.toContain('text-ink/80')
  })
```

- [ ] **Step 3: Run it, expect red.**

Run: `npx.cmd vitest run tests/app-shell.test.jsx`
Expected: FAIL on `text-white/90`.

- [ ] **Step 4: Implement.** Known exact edits (plus any further header-
  block hits Step 1 found, converted the same way: `text-ink` →
  `text-white/90`, `text-ink/NN` → `text-white/NN`):

  - `<header className="glass-island … text-ink desktop:w-auto">` →
    `text-white/90`
  - wordmark `<p className="… text-ink/80">` → `text-white/80`

- [ ] **Step 5: Run the file, expect green.**

Run: `npx.cmd vitest run tests/app-shell.test.jsx`
Expected: PASS, including the existing masthead tests.

- [ ] **Step 6: Prove the assertion.** Revert the header's
  `text-white/90` to `text-ink`, run, confirm exactly the new test fails,
  restore, confirm green.

- [ ] **Step 7: Commit.**

```bash
git add src/components/AppShell.jsx tests/app-shell.test.jsx
git commit -m "feat(chrome): masthead text returns to white on the dark chrome"
```

---

### Task 4: Docs, changelog, spec status

**Files:**
- Modify: `claude/specs/design-system.md` (§−1 addendum),
  `claude/changelog.md`,
  `claude/plans/2026-08-31-chrome-quarters-redesign.md` (status line),
  this file's status line, and ADD both plan files to the branch (they are
  untracked in the shared clone — copy them into the worktree).

- [ ] **Step 1: design-system addendum.** Append to §−1 (after item 5):

```markdown
> 6. **Chrome-quarters (31 Aug 2026).** The clear liquid-glass bars from
>    the 23–24 Aug passes retired: both bars are opaque premium dark
>    chrome (`#151517→#0c0c0e`) with ghosted harlequin quarters (red ≤0.30
>    from the left, green ≤0.26 from the right — a cap, not a taste, so
>    the pill and dots dominate) and white content. Identical in both
>    themes. Clear glass lost because its legibility depended on whatever
>    scrolled beneath — the 24 Aug contrast arithmetic and the 28 Aug
>    faint-ink fix were both symptoms. Spec and the arguments against:
>    `claude/plans/2026-08-31-chrome-quarters-redesign.md`.
```

- [ ] **Step 2: Changelog.** Add at the top of `## 31 Aug 2026` (adjust
  the cited SHA to whatever `git log --oneline -1 origin/main` shows if
  main has moved — cite the previous merge's entry, leave yours unSHA'd):

```markdown
- **Chrome-quarters: both bars go premium dark with ghosted harlequin
  quarters.** Jay picked the direction from rendered options (B+C hybrid,
  hint intensity): near-black gradient chrome, red quarter sweeping from
  the left (≤0.30), green from the right (≤0.26), white inner hairline,
  white content — identical in both themes, geometry untouched. Retires
  the clear-glass ink rules (24/28 Aug) with their premise. Spec:
  `claude/plans/2026-08-31-chrome-quarters-redesign.md`.
  `src/index.css`, `src/components/Nav.jsx`, `src/components/AppShell.jsx`.
  (SHA follows in the next changelog-touching PR.)
```

- [ ] **Step 3: Flip both plan files' status lines** to
  "**Status: SHIPPED (PR pending merge)**" wording, and run:

Run: `npm run docs:check`
Expected: pass locally, or fail ONLY with the documented one-behind
changelog asymmetry (trust CI per CLAUDE.md docs:check §2).

- [ ] **Step 4: Commit.**

```bash
git add claude/specs/design-system.md claude/changelog.md claude/plans/2026-08-31-chrome-quarters-redesign.md claude/plans/2026-08-31-chrome-quarters-implementation.md
git commit -m "docs(chrome): spec, changelog and design-system record for chrome-quarters"
```

---

### Task 5: Full verification, PR, merge, live proof

**Files:** none new — verification and release.

- [ ] **Step 1: Full suite.**

Run: `npm test`
Expected: green (a lone `tests/pwa-build.test.js` beforeAll TIMEOUT under
machine load is a known artifact — re-run that file alone before believing
it).

- [ ] **Step 2: Render for Jay.** Shoot the harness at 375px, BOTH themes
  (`shell-coach` and `dashboard-parent` scenarios), send the PNGs via
  SendUserFile, and WAIT for his sign-off on the real render before
  opening the PR — the mock was approved, the build must be too.

- [ ] **Step 3: PR.**

```bash
git push -u origin feat/chrome-quarters
gh pr create --title "feat(chrome): premium dark bars with ghosted harlequin quarters" --body "<summary of spec, measurements, and fault-proof notes>

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

- [ ] **Step 4: Merge on green** (Jay's standing authorization).

```bash
gh pr checks <n> --watch --interval 20
gh pr merge <n> --squash
```

If the merge reports conflicts, `main` moved: rebase, re-resolve the
changelog per the one-behind rule, re-push, re-watch. Coordinate holds
with any active peer sessions if it recurs.

- [ ] **Step 5: Live proof, escape-aware.** After the deploy publishes
  (new bundle hash on `https://main--quins-club-hub.netlify.app`):

```bash
curl -s https://main--quins-club-hub.netlify.app/ | grep -o 'assets/index-[^"]*\.css'
# fetch that css, then:
grep -cF 'text-white\/90' /tmp/new.css        # target ≥1
grep -cF 'min-\[360px\]\:px-5' /tmp/new.css   # control: known-present, shares bracket/colon shapes
```

Also confirm the quarters' colour literally: `grep -cF '225 27 34 / 0.3'`
on the css. Expected: target ≥1, control ≥1. Report to Jay with the
deploy id and the before/after bundle hashes.
