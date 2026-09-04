# Senior season stats: scorers on the match sheet, a count per player per season

**Status: SHIPPED — #695, 4 Sep 2026.** Migration applied to live the same
day. Two deliberate deviations, recorded in the implementation plan: `qty`
not `count`, and the plural kind words. Dated 2026-09-04.

Step 8 of `claude/plans/2026-09-02-senior-squads.md` ("Season stats for
seniors"), pulled into its own spec because the design conversation on
4 Sep 2026 found that plan's premise wrong: it says every stat is already on
the RCM sheet. It is not. Jay's rulings from that conversation are recorded
here in his own words where he gave them.

## What is true about the sheet today, measured

`db/schema/tables.sql`, the `match_sheets` block. A sheet holds the 22 names
by slot (`match_sheet_slots`), each card with the slot it went to
(`match_sheet_cards`), and nothing else about what happened in the game. The
score lives on the fixture — `events.tries_us`, `conversions_us`,
`penalties_us`, `drops_us` and the four `_them` columns — as TEAM totals.
**Nothing records who scored, and nothing records whether a bench player came
on.** So the stats that can be counted from today's data are games on the
sheet, starts (slots 1–15), bench selections (16–22), yellows and reds. Tries,
conversions, penalties and drop goals per player exist nowhere.

## Rulings, 4 Sep 2026

| Question | Ruling |
|---|---|
| Per-player scoring is not on the sheet. Count only what exists, or add it? | **Add scorers to the sheet.** Chosen over "appearances and cards only" and over "tries only". |
| Who sees the numbers? | **Everyone in the section.** A senior player or staff member sees every squad in their own section, men or women. The other section sees nothing; parents and juniors see nothing. Matches the section ruling of 3 Sep. |
| How are scorers entered? | **Rows, like the cards block** (option A below). |
| A called-up under-18 on a senior sheet — does their record show to the section? (Raised by the final review, 4 Sep 2026: the 3 Sep ruling gives a section-mate the minor's NAME and nothing else, and the spec had not considered stats.) | **Yes, show it.** Games, starts, bench, tries and cards are participation data, not contact data; the private row (birthday, phone) stays protected exactly as before. The player appears by name as they already do on the roster. Considered and declined: excluding junior-squad players, and a staff-only variant. |

Settled without asking, because existing code already answers it:

- **A season runs 1 September to 31 August**, from the fixture date in the
  club's time zone. `src/lib/ageGrade.js` cuts the age-grade season at
  31 August, and the league import labels seasons `2026-27`. The stats use
  the same label.
- **Seniors only.** A squad with `teams.section` null has no scorers block,
  no stats card and no stats function result. The youth side has declined
  leaderboards before; nothing here changes that.

## 1. Recording scorers on the sheet

### The three ways considered

- **A — a "Scorers" block of rows, like the cards block. CHOSEN.** Each row is
  a kind (try, conversion, penalty, drop goal), a player picked from the 22
  already on the sheet, and a count. A hat-trick is one row, "Try × 3". Four
  or five rows after a typical game.
- **B — four counter columns beside each of the 22 names.** Exhaustive, and
  88 inputs on a phone of which most are zero. Declined.
- **C — a free-text scorers line, parsed.** Quick to type, impossible to
  count reliably. Declined.

### Data

New table `public.match_sheet_scores`, mirroring `match_sheet_cards` on
purpose:

| Column | Type | Note |
|---|---|---|
| `id` | uuid pk | |
| `match_sheet_id` | uuid not null → `match_sheets` on delete cascade | |
| `kind` | text not null, check in (`tries`, `conversions`, `penalties`, `drops`) | The four RCM score components, the SAME plural words as the `events` columns and `SCORE_KINDS`, so the soft note compares by name. |
| `slot` | smallint, check 1–22 or null | The sheet's own numbered row. **The player is resolved through the slot at count time**, exactly as `cardDisplayName` does for cards — a filed sheet must survive a rename, a move or a leaver. |
| `full_name` | text | The name as filed, beside the slot, for the same reason. |
| `qty` | smallint not null default 1, check > 0 | `qty`, not `count`: legal, but `sum(count)` reads as a bug to everyone who sees it. |
| `created_at` | timestamptz | |

RLS: one policy, `FOR ALL USING/WITH CHECK private.can_edit_match_sheet(match_sheet_id)`,
the cards policy verbatim. Grants as `match_sheet_cards` has them, captured
into `db/schema/grants.sql` (docs:check rule 7). Index on `match_sheet_id`.

Saving replaces all rows for the sheet, as `saveMatchSheetCards` does
(`src/data/matchSheets.js`): a new `saveMatchSheetScores(matchSheetId, rows)`
that drops rows with no kind or no slot, then delete-and-insert.

### Screen

`src/screens/MatchSheet.jsx`. A "Scorers" block below the score, **shown only
when the fixture's squad has `teams.section` set**. Rows of kind select,
player select listing the 22 filled slots by name, count. Five empty rows by
default, the cards pattern (`CARD_ROWS`); a row with no kind or no player is
ignored on save. The block prefills from stored rows on open and is part of
the sheet's local draft, so an interrupted entry is not lost.

**The sheet never refuses to save or submit over scorers.** When the score
components on the fixture and the named scorers disagree, the block shows a
soft note per kind — "3 tries scored, 2 named" — and carries on. Blanks on
the fixture score (null, meaning not recorded) produce no note; only a
recorded number that differs does. Reasoning: the RCM sheet is the governing
document and it is complete without scorers; a hard block would stop a
manager filing a sheet at a muddy pitch over a detail that can be added on
Monday.

### Arguments against, kept

- *It is data entry nobody will do.* True risk. Mitigated by the gap being
  visible (section 3: "n played games with no scorers named"), not by
  forcing it. If the numbers are never filled in, the table says so rather
  than lying.
- *The RCM sheet does not have a scorers section, so the PDF/share output
  gains a block RCM did not ask for.* The scorers block is NOT rendered into
  the shared sheet. It is the club's own record, stored beside the sheet.

## 2. Counting

One function, `public.senior_season_stats(_team uuid, _season text)`,
`stable security definer`, `set search_path = public`, returns table:

| Column | Meaning |
|---|---|
| `player_id` | Resolved through the slot; null when the slot's player was deleted (the row still counts under `full_name`). |
| `full_name` | The name as filed on the most recent sheet for that player. |
| `games` | Sheets the player is on. |
| `starts` | Slots 1–15. |
| `bench` | Slots 16–22. **Labelled "Bench" on screen, never "sub appearances"** — the sheet records selection, not whether they came on. |
| `tries`, `conversions`, `penalties`, `drops` | Sum of `qty` by kind. |
| `yellows`, `reds` | Cards by colour, resolved through the slot. |

A second function, `public.senior_season_stats_gaps(_team, _season)`,
returns one row `played integer, unnamed integer` — played games with a
sheet, and those where a recorded try count exceeds the tries named — so the
screen can say "2 of 7 played games have no scorers named" without the
client re-deriving it.

**Gate, inside the function, before any row is read:** the team's
`section` must be non-null, AND the caller must satisfy
`private.same_section_member(_team)` OR `private.can_edit_team(_team)`.
Otherwise return no rows. Same gate the section's roster read already uses
(`db/migrations/20260905_senior_section.sql`). `security definer` is needed
because `match_sheets` RLS is staff-only by design (`db/schema/policies.sql`,
"match sheet manage") and that policy is NOT loosened: players never read
sheet rows directly, only the counted result.

**What counts:** every `match_sheets` row whose event has `team_id = _team`
and `starts_at` before `now()`, **draft or complete**. Considered and
declined: complete-only. A table that goes blank because nobody pressed
Submit teaches nobody, and the sheet is the record either way. **A player on
the sheet counts for that squad whether or not they are a member of it** — a
2nd XV player covering for the 1st XV shows on the 1st XV table.

**Season window:** `_season` is `YYYY-YY`; the window is 1 Sep of the first
year to 31 Aug of the next, inclusive, using
`(e.starts_at at time zone 'Asia/Dubai')::date` — the same hard-coded zone
`db/migrations/20260810_update_series_from.sql` uses, for the same reason.
A malformed label returns no rows.

Grants: `revoke execute from public; grant execute to authenticated`, the
house pattern for `private.*` helpers, applied to these two public functions
too.

## 3. Where it shows

One shared component, `src/components/SeasonStatsTable.jsx`, so the three
places cannot drift: columns Player · Games · Starts · Bench · T · C · P · DG
· YC · RC; tap a heading to sort by it, default games desc then tries desc
then name. Abbreviations carry a `title` and an `aria-label` with the full
word. Numbers `tabular-nums`. One data module,
`src/data/seasonStats.js`, wrapping the two RPCs and the season label
(`currentSeasonLabel()` derived from the 31 Aug cut-off in `ageGrade.js`,
not a second copy of the rule).

1. **Squad page** — `/squad/:teamId` (`src/screens/SquadHub.jsx`), senior
   squads only: a "Season stats" card with the full table, and the gap line
   beneath it when `unnamed > 0`.
2. **Seniors overview** — `/seniors` (`src/screens/SeniorSection.jsx`): a
   "Season stats" section after "Season record", one table per squad of the
   section, top five rows with "Show all N", the pool block's pattern.
3. **Player sheet** — `src/screens/PlayerDetail.jsx`, when the squad the
   sheet was opened from has a section: a "This season" block with that
   player's own line for that squad, as key/value pairs, or "No games on a
   sheet yet".

Every surface is inside the section gate already: the squad page and the
overview are reached only by section members and staff, and the function
refuses everyone else anyway (rule: rights gate screens, the database gates
data).

## 4. Proof

`db/tests/season-stats.sql`, one transaction rolled back, the
`senior-section.sql` shape (invented people, the club's real squads, section
set inside the transaction). Assertions, each checked against an injected
fault before it is trusted:

1. A section-mate of the squad reads rows; a member of the other section
   gets none; a parent gets none; a junior squad returns none even for its
   own staff.
2. A scorer resolves through the slot to the right `player_id`, and a
   renamed player still resolves.
3. Slot 12 counts as a start and slot 19 as bench, never both.
4. A fixture at 23:30 on 31 Aug Dubai time lands in the old season and one at
   00:30 on 1 Sep in the new — the time-zone half is the assertion, so the
   fixture is stored in UTC where the naive reading is wrong.
5. Yellows and reds are counted by colour through the slot.
6. A draft sheet counts; a sheet for a fixture tomorrow does not.
7. The gaps function counts a game with tries recorded and none named, and
   not one with blanks.
8. `match_sheet_scores` is refused to a player of the squad and allowed to
   its staff (the RLS mirror of cards).

Front-end (vitest): the table sorts on a tapped heading and defaults as
specified; the soft note appears for a recorded mismatch and not for a
blank; `saveMatchSheetScores` drops incomplete rows and posts the rest; the
scorers block is absent on a junior squad's sheet.

## 5. Not here, on purpose

- Minutes played. Needs Game Time for seniors; the 2 Sep plan says later.
- Scorers on the shared/printed RCM sheet. Not RCM's form.
- A club-wide or cross-section view. Wait for the cross-section roster
  setting (`claude/plans/2026-09-03-senior-section.md` phase 2).
- Season rollover or a season picker. One season, the current one; the
  function takes a label so a picker is a screen change later, not a data
  change.
- Junior stats. Declined before, declined again.

## Order of work

One pull request. Migration (table, policy, grants, two functions), the
harness, the data module and component, the three screens, the sheet block,
the front-end tests, `db/schema/` captures, this plan's status line, the
correction in the 2 Sep plan, the changelog entry by PR number.
