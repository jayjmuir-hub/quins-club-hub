# Plan — retire the floating `?`, move "Report a problem" into the account menu

**STATUS: SHIPPED — merged to `main` 24 Aug 2026 as squash `34b529d` (#367),
verified live the same day from the deployed bundle** (new menu label present,
old floating-button label absent).

## Why

Jay's verdict on the floating `?` button (24 Aug 2026): all four problems at
once — it covers content, it is too easy to miss, it reads as clutter, and it
collects accidental taps near the tab bar. It also owns the bottom-right
corner that the floating chat dock (separate session, branch
`claude/chat-dock`) now wants on desktop.

Jay's first suggestion was a bug icon **in the top bar**. Rejected, and the
reason is a ruling two days old: the 23 Aug masthead rework exists because
every icon added to that row squeezed the wordmark until it truncated, and
`src/components/AppShell.jsx` now carries the warning "THE NEXT CONTROL GOES
IN AccountMenu.jsx, NOT HERE". The account menu **is** the top bar's home for
controls — so the instinct ("get it out of the corner, up to the top") is
honoured; the literal placement (another icon in the row) is not.

## What changes

1. **The floating `?` disc is removed from every screen.** Nothing floats
   bottom-right any more; that corner is handed to the chat dock on desktop.
2. **The account menu gains one item**: a bug icon with the label
   **"Report a problem"**, below "Dark mode" and above the sign-out divider.
   Choosing it closes the menu and opens the same sheet as today.
3. **The sheet and every flow inside it are unchanged** — "Something's
   broken" / "I've got a suggestion" / "See what you've already reported",
   the reference codes, the context capture, the emails, `/my-reports`, the
   admin triage screen. Only the trigger moves.

## How it is wired

- `src/components/HelpButton.jsx` → renamed `src/components/HelpSheet.jsx`.
  The component loses its floating button, and `open`/`onClose` become props
  instead of internal state. Everything else in the file stays put, including
  the reset-on-close behaviour (shared-family-phone privacy).
- `src/components/AppShell.jsx` owns a single `helpOpen` state, renders
  `<HelpSheet>` where `<HelpButton />` was, and passes
  `onReportProblem` down to `<AccountMenu>`.
- `src/components/AccountMenu.jsx` renders the new item on its main page.
  The item calls `close({ refocus: false })` then `onReportProblem()` — the
  sheet takes focus, so the trigger must not steal it back.

## Housekeeping in the same change

- `src/components/Nav.jsx` L306 comment ("the offset in HelpButton.jsx is
  sized to clear THIS") is stale once nothing floats — rewrite it.
- `tests/help-button.test.jsx` → `tests/help-sheet.test.jsx`; the three FAB
  tests (accessible name, 44px floor, z-order) die with the FAB, replaced by
  menu-item tests in `tests/account-menu.test.jsx` and open/close-via-props
  coverage in the renamed file.
- `claude/changelog.md` L253 names the old path in backticks — annotate it
  "(now `src/components/HelpSheet.jsx`)" so docs-check keeps resolving it.

## Arguments against, recorded so they are not re-made

- *"A menu item is less discoverable than a floating button."* True in the
  abstract, but Jay's own report says the floating button was already "too
  easy to miss" — floating over content bought clutter, not discovery. If
  discoverability turns out to matter, the agreed fallback is a visible
  "Report a problem" row on the More page, **not** a return to the corner.
- *"Put the icon in the masthead row."* See Why above — re-opens the 23 Aug
  width-budget problem the account menu was built to close.
