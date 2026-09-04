# The senior section: a section on each squad, section-wide reading, one overview

**Status: PHASE 1 BUILT (#685, 3 Sep 2026); the filter half of phase 2 BUILT
(#687, 4 Sep 2026).** The section column, the three read arms, the Club-tab
selector, the overview screen, the nav entry, and "Senior men" / "Senior
women" on the Roster and Schedule filters. The `seniors` right is BUILT (#706, `db/migrations/20260911_seniors_right.sql`,
4 Sep 2026). Still NOT built: the club-wide switch (the fallback nobody has
asked for), and the all-seniors channel and notice. Dated 2026-09-03.

Grows out of `claude/plans/2026-09-02-senior-squads.md` ("Senior Section
overview", step 9 of its order of work), pulled forward because the pieces
it needs already exist and Jay ran into the gap first.

## What Jay said, 3 Sep 2026

- *"there is no overall view of lets says men's senior teams, you can't see
  everyone and everything, you have to switch between them."*
- On visibility: *"would all men players be able to see what players would
  normally see for all squads? would we want to extend that to women and men
  see each others? … senior teams are completely different from juniors as
  far as safeguarding is concerned."*

## Rulings

| Question | Ruling |
|---|---|
| How does the app know a squad's section | **A column, `teams.section`**, set by an admin on the Club tab. Never parsed from the name — the is_senior / uses_jersey_numbers rule. |
| Within a section | **Full read**, the way a player sees his own squad today: rosters (names, numbers, positions), fixtures, who is in and out. Chat, notices and documents stay per squad. |
| Across men and women | **Fixtures and results only.** Rosters and availability off; a club setting can open them when a section asks. Not for safeguarding — because a women's squad decides who reads its numbers, not the app. |
| Who reads BOTH sections | **A per-person right, not only a club switch** — Jay, 4 Sep 2026: *"the option to give certain people rights to see both men and women, like the club captain for example, but might be others."* This is the `seniors` admin right the senior-squads plan already proposed for the overview screen, widened: whoever holds it reads rosters and availability across both senior sections. Granted per membership on `/admin/staff` like `training`, `welfare` and `youth`; titled by the job, not the person. Seniors only — it grants nothing on any junior squad, and every child-protection rule still keys on the person. The club-wide switch stays as the separate, coarser option for when a whole section asks. |
| The under-18 call-up | **Every child protection keys on the person, not the squad.** A 17-year-old in the 2nd XV keeps the private row, photo consent, messaging and DM-review rules he had in the U18s. A section-mate gains his name on the roster and nothing else. `db/tests/senior-section.sql` proves it. |
| Who sees the overview | Anyone with an active membership in a squad of that section, and every admin. A member of one section sees the other section's fixtures only, with a line saying why. |

## Data

`teams.section text` — `'senior_men' | 'senior_women' | null`. Three read
policies gain one arm each (`db/migrations/20260905_senior_section.sql`):

- `player read`: `private.same_section_member(team_id)`
- `avail read`: the same, on the event's team
- `event read`: `private.senior_section_fixture_reach(team_id)` — any senior
  member reads any senior squad's fixtures

`can_see_team` itself is untouched: it is read by twenty-nine policies
including chat, notices and documents, and widening it would put a 2nd XV
player in the 1st XV's chat.

## Screens

- `/seniors` (`src/screens/SeniorSection.jsx`): a Men / Women switch when the
  person can see both; This weekend (each squad's next match with in / out /
  not answered); Fixtures across the section; The pool, grouped by home squad
  with jersey numbers and "also 2nd XV" tags from the multi-squad membership;
  Season record per squad from the league table (#684). A foreign section
  shows fixtures only.
- Club tab: a Section select on each squad beside the jersey-numbers switch.
- Sidebar and phone dock: a "Seniors" entry for anyone in a senior section or
  an admin.

## Phase 2, not built

- "Senior men" / "Senior women" as choices on the Roster and Schedule filters.
- ✅ The `seniors` right that opens both sections to a named person (club captain and others) — BUILT 4 Sep 2026 (#706), `db/migrations/20260911_seniors_right.sql`; ticked on `/admin/staff` like any right, and the Roster and Schedule filters offer the senior squads to its holder.
- A club setting to open rosters across sections — the coarser fallback; not asked for.
- The all-seniors notice and chat channel (senior-squads step 9).
- U18 call-ups (senior-squads step 6), which the pool's "U18 call-up" tag waits for.
