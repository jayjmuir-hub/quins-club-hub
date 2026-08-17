# The eligibility warning in the lineup picker

**STATUS: SHIPPED 17 Aug 2026 as `ae98b8f` (#215), and live on production —
verified by fetching the bundle from https://adhquins-clubhub.com and finding both
message fragments, against a known-present and a known-absent control.**

⚠️ **THE BUILT THING DIFFERS FROM THE SPEC BELOW IN ONE PLACE, AND THE SPEC IS THE
WRONG HALF.** This document says the warning is "a second line under the name",
inside the name's column. Measured in a real browser at 375px, that gave the
sentence **122px**, wrapped it to **FOUR lines** and made the row **108px** against
a 42px unwarned baseline. It ships **under the whole row** instead — 322px, one
line, 62px. Read `src/screens/Lineup.jsx` for the shape that actually exists; the
paragraph below is kept because its *reasoning* (a sentence, not a chip) still
holds and only its placement was wrong.

The third of Jay's 14 Aug ask (`claude/plans/2026-08-14-tiers-and-game-time.md`
named it *"fair game, eligibility, and milestone"*). Phase 1 built the game-time
rollup; phase 2 built `events.tier` and `player_grades`. Both halves of the
comparison now exist and hold real rows, and **nothing compares them.**

## What it does

Two inputs, both already loaded or loadable on the screen that needs them:

| Input | Where it already comes from |
|---|---|
| the fixture's tier | `event.tier` — `getEvent` selects `*`, so it is already on the row `Lineup` holds |
| the child's grade | `listPlayerGrades(playerIds)` in `src/data/playerTiers.js`, coach-only by RLS |

⚠️ **NO DATA-LAYER CHANGE AND NO MIGRATION.** This is the rare feature that is
pure presentation. If a schema change appears in the implementation, something has
been misunderstood.

The rule, with `A` the strongest tier and `C` the weakest:

| Fixture tier | Child's grade | Shows |
|---|---|---|
| A | B or C | `Graded C — this fixture is A tier, above their grade.` |
| B | C | as above |
| C | A or B | `Graded A — this fixture is C tier. Check they're eligible.` |
| B | A | as above |
| any | equal | nothing |
| any | **ungraded** | **nothing** |
| **NULL** | anything | **nothing** |

### Why the two directions read differently

Jay's call, 17 Aug 2026, choosing both directions over either alone. They are not
one rule with a sign flip — they are two different worries:

- **Graded below the fixture** is a worry about **the child**: they are in a match
  above their assessed level. The coach may well mean it; the app says so and
  stops there.
- **Graded above the fixture** is a worry about **the fixture**: a strong player in
  a weak tier is the stacking problem an opposition club complains about. That is
  the eligibility half, and it is the one with a rule outside the club.

So one sentence names the child's position, the other asks a question.

### Why the ungraded and NULL rows are the load-bearing ones

Most of the club is ungraded — a grade is a coach's judgement about a child and
most children have never had one recorded. **A warning on every ungraded row would
appear against nearly every name, and a warning that is always on is furniture.**
`src/data/playerTiers.js` already states the principle: ungraded is the absence of
a grade, not a problem to be fixed.

`events.tier` NULL is a real answer too — a friendly has no tier — and carries the
same rule `competition_type` NULL already carries. **Silence, not a fallback.**

## Where it appears

⚠️ **ON THE PICKED ROWS AS WELL AS THE POOL**, copying `StatusChip`, which already
solved this exact problem on this exact screen and left the reasoning in a comment:
once a child is in the team the pool has scrolled away, and *"did I pick anybody
who shouldn't be here?"* is the question a coach asks at the end. A warning only in
the pool is a warning nobody re-reads.

**Starters and bench both.** Being named on the bench still puts a child on the
team sheet, which is what an eligibility rule is about.

⚠️ **A SECOND LINE UNDER THE NAME, NOT A CHIP IN THE ROW.** The row already carries
a status chip and two buttons, and on a phone there is no width left. It also needs
a sentence rather than two words, which is the other half of why a chip is wrong.

⚠️ **THE GRADE LETTER APPEARS ONLY WHERE THERE IS A MISMATCH** — Jay's call over
badging every row the way the coach Roster does. The letter is an ability
judgement about a child, and this screen gets held up pitch-side with parents
standing next to it. Where the letter earns its place it explains the warning;
everywhere else it is a label on a child for no reason.

⚠️ **"PLAYING UP" IS DELIBERATELY NOT THE WORDING**, natural though it is. This app
already uses play-up to mean *a younger child in an older squad* — the thing
`plays_up_confirmed_at` records and PR #213 was about. Reusing the phrase for tiers
would make two unrelated warnings read identically on screen.

## What must not happen

⚠️ **A GRADE MUST NEVER REACH THE SHARED IMAGE.** The share card at the bottom of
`src/screens/Lineup.jsx` is photographed by `shareElementAsImage` and handed to
WhatsApp: it leaves the app permanently and can be forwarded onward. It sits
roughly a hundred lines below where this warning goes, in the same file, which is
exactly the distance at which somebody adds a helpful line to the wrong block.

**A test proves the absence, and the test is proved by making it fail** — render a
lineup in which every child mismatches, then assert the share card's text carries
no grade letter and no warning sentence. A test that has never failed is not a
check.

⚠️ **THE WARNING MUST NOT BE ABLE TO BREAK THE SCREEN.** If the grade read fails or
returns nothing, the lineup still loads, still saves, still shares — the warnings
simply do not appear. Picking a team is the job; a judgement about ability is
decoration. `src/data/playerTiers.js` already warns that an empty grade read is
normal rather than a failure, and this is the screen that has to honour it.

⚠️ **IT WARNS, IT NEVER BLOCKS.** Same rule the over-picked count already follows
on this screen, and the same instinct Jay applied to the play-up message: show a
coach what they may not have noticed, then let them decide. A coach who means it
must not have to argue with the app.

## Shape of the code

A pure function in `src/lib/`, taking a fixture tier and a grade and returning a
message or nothing. No React, so it can be swept exhaustively — every tier against
every grade, including the nulls — the way `ageGradeCheck`'s sweep now works.
`Lineup` calls `listPlayerGrades` alongside the players and availability it already
fetches, and renders whatever the function returns.

## Not in scope

Blocking a save; recording the mismatch anywhere; showing any of this to a parent;
warning on the age-grade axis, which `PlayerRegistrationForm` already covers at
registration. Phase 3 (minutes) remains unstarted and unneeded — Jay's answer was
appearances.
