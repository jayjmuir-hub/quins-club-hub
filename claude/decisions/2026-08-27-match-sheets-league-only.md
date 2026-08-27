# RCM match sheets are for league matches only

**27 Aug 2026.** An RCM result sheet is required for **league** matches, U11 and
up — never for a **tournament** or a **friendly**.

## What changed

The Club Youth Manager tracker, the "Open the RCM match sheet" button on an
event, the Squad Hub "outstanding" list, and the sheet screen itself all used a
loose rule: `type === 'match'` and not-minis. That put **every** match in scope,
including tournaments and friendlies. A single predicate now gates all of them:

```
matchSheetApplies(event, squadName) =
  event.type === 'match'
  && event.competition_type === 'league'
  && !isMinisTeam(squadName)
```
(`src/lib/matchSheetDeadline.js`.)

## Why

Jay, 27 Aug 2026: **"tournaments are not RCM league matches."** RCM's result
sheet is the league's document. A tournament is run by its own organiser and
reports its own results; a friendly reports to nobody. Left in the tracker, they
sat as "Not started" forever and then "Overdue" — a queue that can never be
emptied and a badge that teaches the Youth Manager to ignore the real ones.
That is the **exact** failure the minis exclusion (15 Aug 2026) already fixed
for a younger age group; this extends the same reasoning from *age* to
*competition*.

The trigger was three real U16B tournaments (Al Ain, a Harlequins tournament,
Dubai Youth Festival) showing as needing a sheet with no way to act on them from
the tracker. They were real fixtures, not stale data — the tracker was correct
to show live events, but wrong to treat a tournament as RCM work.

## Friendlies too, not only tournaments

Jay confirmed the rule is **league only** (not "everything except tournaments"):
a friendly (no competition type) is not a league match either, so it takes no
sheet. `competition_type = 'tbd'` is likewise excluded until it is set to league.

## Tournaments get no sheet AT ALL — tombstone

Jay chose "remove sheets for tournaments entirely," not "hide them from the
queue but still allow one." So the sheet screen (`/match-sheet/:id`) now shows a
"No RCM sheet for this fixture — it isn't a league match" card
(`data-testid="match-sheet-not-league"`) instead of the form for any non-league
fixture, and the two **tournament-only notes** that used to live on the form —
a "this tournament may run its own scoring" hint and a "recorded as a tournament
but named 'League'" clash warning (`match-sheet-competition-clash`) — were
**deleted as dead code**: a note about a fixture that can no longer open the
sheet is unreachable. Do not re-add them without first re-opening whether
tournaments get a sheet.

## Not enforced in the database — and why that is fine

This is a UI rule, not an RLS one. RLS still governs *who* may write a sheet
(`can_edit_team`); this decides *which fixtures* have one, and every entry point
is closed in the client. There were **zero** match sheets in production when
this shipped, so nothing was stranded. A DB `CHECK`/trigger tying `match_sheets`
to a league event would be belt-and-braces against a direct API call; it was not
built because no entry point offers it and there is no bad data to guard.

## Rejected

- **"Everything except tournaments"** (league + friendlies) — rejected by Jay in
  favour of league-only.
- **Keep the sheet openable for a tournament, just uncounted** — rejected;
  removed entirely.
- **A DB constraint** — out of scope (see above); revisit only with a new reason.
