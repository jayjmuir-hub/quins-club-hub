# Handoff — 17 Aug 2026: the account-creation plan, finished, and a live bug Jay caught

**History, not instruction.** This describes one day and will go stale by design.
Current state is `claude/state-of-play.md`; how the codebase behaves is
`RESTORE.md`; what changed is `claude/changelog.md`.

Six pull requests, all merged to `main` and deployed:
**#208, #210, #211, #212, #213**.

## What shipped

**`claude/plans/2026-08-16-account-creation-redesign.md` is DONE — all eight
items.** The two that had been deferred longest went last: item 6's third
surface and item 3's `allowsOwnContact` re-point.

| | |
|---|---|
| #208 | Vouching — *"do you know them?"* on the approval queue |
| #210 | `/admin/rights-log` — a reader for the audit trigger |
| #211 | `/admin/needs-attention` + the `allowsOwnContact` re-point |
| #212 | open-items: the audit-log finding narrowed, not closed |
| #213 | **the age cut-off was a year behind, and it was blocking registrations** |

## ⚠️ The thing worth reading twice

**Jay caught a live bug by reading a table.** Asked to see the age bands before
approving the next piece of work, he said: *"i think this is wrong because we
are doing this for the upcoming season that starts sept 1st."*

`cutoffFor()` returned the cut-off of the season **containing today**. The
cut-off is 31 August, so on 17 Aug it pointed at 31 Aug 2025 — while every
family registering that week was registering for a season starting in two weeks.
Every child came out a year too young, and `PlayerRegistrationForm` **refuses to
submit an unconsented play-up**, so ordinary registrations were blocked until a
parent agreed to a play-up that was not happening. The agreement then wrote
`plays_up_confirmed_at`, which mails that squad's coaches.

Three things about how it hid, all of which generalise:

1. **It was invisible on exactly the squads where it did not matter.** U16 and
   U18 are DOUBLE bands, so the lower age of the pair absorbed the off-by-one and
   both came out `ok`. Only U9–U14 were wrong. The same shape as the `\b` regex
   bug already in `RESTORE.md`.
2. **The whole `parent-self-registration` suite was green**, because every case
   in it is frozen at **7 Nov 2026** — in season, where the old and new cut-offs
   agree. ⚠️ **A test of age-grade behaviour written at a mid-season date cannot
   see this class of bug.** There is now one frozen in August.
3. **It was found by displaying data to a human, not by a test.** The table was
   generated from `src/lib/ageGrade.js` itself rather than hand-typed, which is
   why it was faithful enough to be wrong in a recognisable way.

✅ **Nothing false was ever written** — `player_private` measured 0 rows, 0
birthdays, 0 marked as playing up. Caught inside the registration window by days.

The fix is one constant: **the app rolls over to the coming season on 1 JUNE**
(Jay's call, over a settings row). September to May is unchanged, with tests
either side of the boundary.

## ⛔ Two tests that were asserting nothing

Both found by injecting a fault and watching the suite stay green. Recorded
because the *shape* recurs, not because these two mattered.

- **A `useState` seed the browser paints but jsdom cannot see.**
  "The own-contact gate opens on the squad's answer first, so the fields do not
  blink" was written against the DOM. `useEffect` flushes inside `render`, so the
  DOM only ever shows the effect's value. The probe now records **every render**
  and asserts `renders[0]`.
- **A guard that could never fire.** `ageGradeCheck` suppressed "That is X" when
  X was the squad already chosen. Unreachable: `ownBandForAge` is the exact
  inverse of `cutoffAgesForTeam`, so that case returns `ok` long before the
  guard. Swept every squad × every age 3–22 — **281** non-`ok` results, 176
  naming a squad, **0** naming the chosen one, against a control that fired 156
  times. Guard deleted; the sweep is now the test.
  ⚠️ **Its control was wrong on its first run too** — it demanded all 281 carry a
  name, when ages outside the band table correctly carry none.

## Traps met, for whoever meets them next

- ⚠️ **Deleting a PR's base branch CLOSES the child PR**, and GitHub then refuses
  both `gh pr reopen` and `gh pr edit --base`. #209 was stacked on #208's branch
  and had to be re-created as #210. **Never base a PR on another `claude/*`
  branch** — wait for the merge, then cut from `origin/main`.
- ⚠️ **`docs-check` failed in CI while green locally**, exactly as `CLAUDE.md`
  documents, because #213's branch was cut straight after a merge and CI's
  `HEAD~1` is main's tip. The previous squash SHA has to be the first edit on a
  new branch, and it was not.
- ⚠️ **`git checkout -- <file>` reverts to the last COMMIT**, which discarded a
  real edit made after the checkpoint commit and before a fault was injected.
  Commit the real edit too, not just the checkpoint.
- ⚠️ **A grep for a live bundle string can fail because the string is split by a
  template interpolation.** `"age group up"` is never contiguous in
  `` `${...} up. ` ``. Verify with literal fragments, and carry a known-present
  and a known-absent control.

## Where things now stand

**Measured on production, 17 Aug 2026 — re-run rather than trusting these.**

- 26 players, all 26 with no date of birth on file. So `/admin/needs-attention`
  is **full on day one**, which is expected: the field only became required on
  16 Aug. It empties as families fill it in.
- `membership_audit` and `membership_vouches` are both **empty**. The audit
  trigger is installed and enabled — proved by a rolled-back probe taking a
  membership `pending → active` and the count going 0 → 2 — so empty means
  nothing has changed anyone's access, not that nothing is recorded.
- **0 invites accepted.** Jay confirmed the send works; nobody has followed a
  link through to an account, so the accept half is still unexercised.
- 4 players graded A/B/C, 6 multi-position rows, 1 fixture with a tier.

⚠️ **`claude/plans/2026-08-14-tiers-and-game-time.md` HAS TWO STALE CLAIMS** and
they were still there at the end of this session. It says *"PHASE 2 NOT YET
MERGED"* — it is on `main` — and *"no player has been graded and no
multi-position player exists yet"* — four are graded and six position rows
exist. Someone has been using it. **Fix that file before trusting anything in
it.**

## The agreed next piece of work, not started

**The eligibility warning in the lineup picker.** The tiers plan names it: the
data supports it (a fixture knows its tier, a player knows their grade) and
nothing compares them. It is the "eligibility" third of Jay's 14 Aug ask, the
modelling decision is already settled — `events.tier` is STORED, never derived,
so a B team at an A tournament records an A appearance — and it is now
exercisable against real rows.

Jay's answer on the play-up message shape is already in: **name the squad the
child would normally be in**, so a parent who picked the wrong age group is shown
their mistake rather than asked to consent to it. The same instinct should govern
the eligibility warning: **warn, do not block.**
