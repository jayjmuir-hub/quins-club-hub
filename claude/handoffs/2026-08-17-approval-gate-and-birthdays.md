# Handoff — 17 Aug 2026 (afternoon): an approval hole, and birthdays end to end

**History, not instruction.** This describes one session and will go stale by
design. Current state is `claude/state-of-play.md`; how the codebase behaves is
`RESTORE.md`; what changed is `claude/changelog.md`.

⚠️ **The morning of the same day is a SEPARATE handoff** —
`claude/handoffs/2026-08-17-account-creation-and-the-season-cutoff.md`, covering
#208–#213. This file is everything after it.

Merged to `main` and deployed: **#217, #218, #220**. **#219 was closed unmerged**
— see the traps.

## ⚠️ The thing worth reading twice

**All three fixes started with Jay looking at a screen. None started with a
failing test, and the suite was green throughout.**

| What Jay said | What it turned out to be |
|---|---|
| a screenshot of *"Unnamed player"* in the approval queue | a coach's staff request rendered as a child — and, underneath it, a privilege hole |
| *"are you sure there is a place to put the DOB's?"* | there wasn't one, anywhere — and the writer erased play-up consents |
| *"where as a coach or admin can i see them?"* | nowhere but the edit form, one child at a time |

None of these was a wrong calculation. **Every one was a missing surface**, and a
test only checks what somebody thought to write. That is the generalisable point
of the day, and it is why the fault-injection habit matters more here than
coverage does.

## #217 — asking to coach a squad let you approve people into it

`private.can_approve_team` tested role and team and never `status`. Its two
siblings both do:

```
private.can_see_team    ... and m.status = 'active' ...   yes
private.can_edit_team   ... and m.status = 'active' ...   yes
private.can_approve_team              — NOTHING
```

Harmless until `request_staff_role` (16 Aug) made a pending STAFF row possible.
After that, asking to coach a squad satisfied the approval gate for it —
approving your own request, admitting other families, and (via
`can_squad_staff_see_pending`, which calls the same function) reading a pending
registrant's name and email.

**Measured on production in a rolled-back transaction with an invented club, then
re-measured with the fix applied inside the same transaction:**

| | before | after |
|---|---|---|
| PENDING coach of the squad | ALLOWED | refused (42501) |
| ACTIVE coach of the squad *(control)* | ALLOWED | ALLOWED |
| ACTIVE coach of another squad *(control)* | refused | refused |

Only the target line moved. ✅ **Never exploited** — `membership_audit`, which
shipped that morning, showed the one real staff request was approved by a super
admin, not by the subject. **That log is the only reason the question was
answerable at all.**

⚠️ **`private.is_admin` HAS THE SAME OMISSION AND WAS LEFT DELIBERATELY.**
Unreachable today (zero non-active admin rows; `request_staff_role` refuses any
role but coach/manager/medic) and it backs most of the admin RLS surface.
`claude/open-items.md` carries it with the measurement it depends on.

### Why four layers missed it

- The queue splits on `status` alone — nothing about role or `player_id`.
- `canApproveAnything` / `canApproveTeam` had **no unit tests at all**.
- `db/tests/rls-squad-staff-approval.sql` makes every staff row `'active'` —
  correct, because on 9 Aug a pending one could not exist.
- **Every membership fixture in `tests/` omitted `status`**, a NOT NULL column,
  so no test in the suite could tell a request from access.

**A new writer arrived and none of the old readers was audited.**

## #218 — birthdays could be required but not entered

`date_of_birth` became required for new registrations on 16 Aug. On 17 Aug
`player_private` held **zero rows**, because nothing asked. A fourth `NamePrompt`
step now asks, once, with **no way past it** (Jay's call, over a snooze or a
recorded refusal).

⚠️ **IT IS THE ONLY STEP ON THAT GATE WITH NO "no" ANSWER, SO IT IS THE ONLY ONE
CARRYING A SIGN-OUT** — `AppShell`'s rule, *"someone who cannot get in must
always be able to get out"*.

⚠️ **THE READ FAILS OPEN, AND ON A BLOCKING GATE THAT IS THE WHOLE SAFETY
ARGUMENT.** Every other step fails closed and costs a question; this one has no
way past, so a failed read that blocked would take the club offline with no fix
short of a deploy.

⛔ **Then Jay asked whether there was anywhere to enter one, and there wasn't.**
What had been verified was that the DATA layer permitted the write, not that any
screen offered the field — the only writer in the app was
`PlayerRegistrationForm`, which a family passes through once. A wrong date was
permanent for parent, coach and admin alike, **and the completeness card on
`/more` had been telling families to add one "from the buttons below" while the
button below opened a form with no such field.** The field is now on
`MyPlayerForm` and `PlayerForm` too.

⛔ **Chasing that found a second bug in the writer.** `setPlayerDob` writes
`plays_up_confirmed_at: playsUp ? now : null`, so **any** call omitting the flag
erases a parent's recorded consent — including the new gate, on the case where a
row exists with a null birthday. Measured on production, rolled back:

| | birthday | agreement |
|---|---|---|
| `setPlayerDob` as it was | updated | **erased** |
| birthday-only write | updated | kept |
| *control* — no row yet | inserted | n/a |

`updatePlayerDob` omits the column. **The control mattered**: a writer that only
worked on existing rows would have failed for exactly the children who have none.

## #220 — seeing them

An age on the roster row, the date and age on the player sheet. Both use the
club's own `ageAt`, so a number shown cannot drift from the one deciding a squad.

⚠️ **The roster read is staff-only and is not issued at all otherwise** — the
rule the Tier column already follows. **Its test asserts the absence of the
REQUEST, not of a number**: the screen looks identical either way, so a
screen-only assertion would pass against a version that queried every child's
birthday.

⚠️ **The player sheet renders nothing without a value** — that file's existing
contract. Parents reach it, and an empty row would announce that a birthday
exists and is withheld.

## Traps met, for whoever meets them next

- ⛔ **NEVER KEEP COMMITTING TO A BRANCH AFTER IT IS SQUASH-MERGED.** #219 was
  built on `claude/dob-prompt-spec` after that branch had already merged as
  `f506a7f` and been deleted, so it carried both the pre-squash commits and
  main's squashed version of the same work. GitHub reported `CONFLICTING`; the
  fix was to cut a fresh branch from `origin/main` and re-apply the nine changed
  files. **Cut a new branch after every merge.** It happened twice in one
  session — the second time was caught by `rev-list` returning `1 1` before any
  work was done, which is the cheap way to notice.
- ⚠️ **A `head_limit` on a grep turned an incomplete search into a wrong
  conclusion.** Looking for the render sites of `PendingApprovals` returned one,
  so the fix touched one — and `Accounts.jsx` renders it **twice**, in the
  approver-only early return and in the admin view. Every new test failed against
  the untouched path. **The same mistake as the bug being fixed**, one layer up.
- ⚠️ **A `vi.mock` factory replaces the WHOLE module, so an omitted export is
  `undefined` and throws from inside an effect** — surfacing as a dozen failures
  whose message names the MOCK, not the component. Adding two data reads to
  `Roster`/`PlayerDetail` broke **six** test files this way. `importOriginal` is
  the way out where a file only needs to override part of a module.
- ⚠️ **Before trusting a bundle-string check, confirm the string is ABSENT
  BEFORE the deploy.** Verifying #220 with `"Date of birth"` would have passed
  instantly and meant nothing — the forms had shipped that string an hour
  earlier. `player-birthday` and `"Born"` were checked as absent first, and only
  then used.
- ⚠️ **A control that returns zero is not a control.** Searching the edit forms
  for `date_of_birth` came back empty AND the control came back empty — the
  registration form uses a different token. The conclusion only became safe once
  the control fired six hits.
- ⚠️ **Temporal dead zone.** `agePlayerIds` read `canEditAnything` seventy lines
  before its `const`, which would have thrown on mount for everybody. Caught by
  reading declaration order, not by a test.
- ⚠️ **The worktree has no `.env` and no `vite` in its own `node_modules`.**
  The first means a block of tests fails to COLLECT (copy `.env` from the parent
  clone — it is gitignored); the second means `tests/pwa-build.test.js` fails at
  suite level with `MODULE_NOT_FOUND` for a path that only exists in the parent.
  **Neither is a real failure and both pass in CI.**

## Where things stand — measured 17 Aug 2026, re-run rather than trusting these

- 26 players, **2 with a birthday** (Jay's own, entered through the new gate).
- **0 play-up agreements** — nothing was erased by any of the above.
- 0 pending approvals; 4 rows in `membership_audit`.
- The other 18 families meet the gate on their next sign-in. **If
  `with_a_birthday` does not climb over the next few days, the gate is not
  firing for people it should, and the absent-key logic in `NamePrompt` is the
  first place to look.**

## ⚠️ Nothing was driven in a browser all day

Every screen shipped today was verified by jsdom tests, fault injection, and
grepping the deployed bundle. **No signed-in session was ever driven**, because
one cannot be created from here. In particular the blocking birthday gate had
never been seen by a human when it went live — Jay was the first, by design.
