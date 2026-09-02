# UX review programme — the eight items, in order

**Status: THE EIGHT ITEMS SHIPPED, 2 Sep 2026.** Phase 2 — the remaining
findings from the full report — is tracked in the section at the end. Each row below says where it
stands. Update the row, not the header, when one lands.

The 2 Sep 2026 frontend usability review (five parallel read-throughs of the
source at `7d05629`, plus the phone harness) found the app's foundations sound
and its problems systemic: a good idea in one place, not carried to the rest.
It ranked eight fixes by pain removed per hour. Jay: "let's get to work". One
pull request per item, each a live deploy on his explicit yes. The review
itself was delivered as a file, not committed — it names real screens with
invented fixture data and belongs with the plans only as this summary.

| # | Item | Status | Where |
|---|---|---|---|
| 1 | Stop losing unsaved work: team sheet, match sheet, event form, sign-up wizard | **SHIPPED** `2d227af` (#631) | `claude/plans/2026-09-02-ux-unsaved-work.md` |
| 2 | Every error a person can read goes through `friendlyMessage`, with a sweep test | **SHIPPED** `6fa8f14` (#633) | `tests/friendly-error-sweep.test.js` |
| 3 | Form errors land where the thumb is: focus the first invalid field, else the alert | **SHIPPED** `95cf9c1` (#634) | below |
| 4 | Confirm the three one-tap writes: role/squad select in Accounts, Remove on a focus period, Approve as Coach | **SHIPPED** `8b48808` (#636) | — |
| 5 | Pitch-side tap targets to 44px: availability In/Maybe/Out, lineup Bench/Remove, chat message chevron, Sheet close | **SHIPPED** `5b38132` (#638) | — |
| 6 | One measured list skeleton for the five busiest lists; Documents shows nothing while loading today | **SHIPPED** `559f8eb` (#643) | `src/components/Skeleton.jsx` |
| 7 | A screen-title hook: `document.title`, focus the new screen, reset scroll | **SHIPPED** `2483fdc` (#650) | `src/lib/screenTitle.js`, `src/lib/useScreenChrome.js` |
| 8 | A readable default width on desktop; 38 of 55 screens stretch edge to edge beside the sidebar | **SHIPPED** `ad1963c` (#651) | `src/lib/screenWidth.js` |

## Follow-ups the shipped items left behind, on purpose

- **Item 1:** ~~leaving the team sheet via the dock or sidebar still
  discards~~ **CLOSED 2 Sep 2026**: `Lineup.jsx` keeps a `sessionStorage`
  draft per fixture, restored only when the server has no lineup, cleared on
  save — the match sheet's shape. The lineup row is still created on first
  Save, so "did anyone pick a team?" stays answerable.
- **Item 2:** ~~`AdminClub.jsx`, `Roster.jsx` and `RosterTable.jsx` are
  allowlisted in the sweep test~~ **CLOSED 2 Sep 2026**: senior squads
  (#640) landed, the five remaining raw renders were converted, and the
  allowlist is the helper alone.

## Item 3 — form errors land where the thumb is

**Finding.** On the child form (`MyPlayerForm.jsx`) and the sign-up children
form (`PlayerRegistrationForm.jsx`) the alert renders at the TOP of a long
sheet and Save at the bottom: a parent tapped Save, the button flickered,
nothing visible happened. The event form and player form do the opposite:
"Fill in the highlighted fields" at the foot, the highlighted field fifteen
fields up. Screen-reader users heard the banner and had to hunt.

**Design.** One helper, `src/lib/revealProblem.js`: after the error has
rendered, find the first `aria-invalid="true"` control, else the form's own
error region (marked `data-reveal="problem"`, given `tabIndex={-1}`), else
any `role="alert"`; scroll it to the middle of the viewport (no smooth scroll
under reduced motion) and focus it without a second scroll. Each of the four
forms holds a `formRef` and runs `useEffect(() => { if (error)
revealProblem(formRef.current) }, [error])`.

**Against per-field messages under every input (the review's other
suggestion):** the event form already names the specific failure in its one
banner (end-before-start, tournament name) and the player form names the
family-name and gender cases; a message under each box would duplicate that
copy in two places. Focus-plus-scroll fixes the "nothing happened" experience
on its own. Per-field text can follow if a form still confuses people.

**Against `data-reveal`:** the first `role="alert"` in a form is not always
the one that fired — the player form carries a standing play-up warning and
the event form a preview error, both alerts. The marker says which region is
the submit's own. Tested in `tests/reveal-problem.test.jsx`.

**Proof.** `tests/reveal-problem.test.jsx` (helper branches, jsdom without
`scrollIntoView`), `tests/form-errors-reveal.test.jsx` (event form focuses
the first invalid control; registration form focuses its alert),
`tests/player-form.test.jsx` (focus lands on the blank first-name box, run
red before wiring). `MyPlayerForm` takes the identical effect and alert
markup and is covered by the helper test; a dedicated harness for it was not
worth building for one assertion.

## Phase 2 — the rest of the report, 2 Sep 2026

The full report (`.claude/handoffs/club-hub-ux-review.html`, not committed —
it names real screens with invented data and lives with the session that
wrote it) lists about thirty-five findings beyond the eight items. Worked in
severity order, one pull request per cluster, each a live deploy.

| Cluster | Findings | Status |
|---|---|---|
| High + pattern 7 leftovers | Home blanked by a refused DM; invite dead end; announce-only Reply; Back closes a sheet; unknown path says so | **SHIPPED** `cc550dc` (#652) |
| Follow-ups from items 1 and 2 | team-sheet draft; sweep allowlist to the helper alone | building, `claude/ux-followups` |
| Coach/manager Medium | Lineup save chip; match sheet "Mark ready to send" + draft before share; Accounts prose folded; Availability names wrap; admin panels scroll into view; squad screens Try again; Schedule status after multi-add | **SHIPPED** `4093935` (#653). **Deferred:** DatePicker/TimePicker in AddGameForm and TrainingPublish (tests drive the native inputs) |
| Parent Medium | availability tap-to-clear + own child first; sign-up copy; notifications toggle copy; offline banner; Maps link; wizard draft | building, `claude/ux-parent-cluster`. **Deferred:** avatar caption (masthead row over-full 820-1,280px) |
| Pattern leftovers | RequireAuth slow-load reload; Home first-load gate includes notices; photo placeholder while signing; PlayerDetail reserved space; Documents `window.confirm`; ChatPhoto Escape + focus; starred message scroll-to | building, `claude/ux-leftovers`. **Deferred:** photo dimensions at upload; per-field error helpers |
| Desktop | event-form sheet width and fieldsets | not started (ChatPhoto and starred scroll-to moved into the leftovers cluster) |
| Low | the two "Smaller items" lists and the extra findings | not started |
