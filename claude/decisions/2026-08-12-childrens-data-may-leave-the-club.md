# Children's data may leave the club for a third-party API

**Jay, 12 Aug 2026.** Asked directly, answered: *"yes it may"*.

## What this unblocks

`claude/state-of-play.md` recorded that **every** AI feature Jay had brainstormed
— Smart Comms, natural-language queries, match reports, auto lineup — was gated
on this one ruling, and that none of them were to be started until he answered.
Nobody had asked him. He has now answered, and they are unblocked.

## What the ruling is, stated precisely

The club's data, **including data about children**, may be sent to a third-party
API in order to provide a feature. Jay is the club's decision-maker and this is
his call to make.

## ⚠️ What the ruling is NOT

**It is not an instruction to send everything.** "May" is permission, not a
design. The implementation default is therefore **minimisation**: each feature
sends the least data that makes it work, and every feature must be able to say
exactly what it transmits.

This is not caution for its own sake — it is the same principle already load-
bearing elsewhere in this schema:

- `profiles.email` is protected by a COLUMN grant, not a policy, specifically so
  that "may edit a member" does not silently become "may rewrite anyone's login
  email".
- `attendance` reads NARROWER than every other team-scoped table — a parent sees
  only their own child — because "which children miss training, and how often"
  is safeguarding-adjacent.
- The `player-photos` bucket is PRIVATE.

A club that made those three choices did not intend a fourth feature to post the
whole roster to an API because a ruling said "may".

## The rule for anything built on this

**Every AI feature must state, in its own file, exactly which fields leave the
club.** Not "player data" — the field list. A reviewer must be able to answer
"does this send a child's photo?" by reading the code, not by inference.

Defaults, until Jay says otherwise for a specific feature:

| Field | Default |
|---|---|
| Player first name / full name | sent where the feature needs to name a player |
| Squad / age group | sent |
| Fixture facts (date, opponent, venue, score) | sent |
| Player **photos** | **not sent** |
| Parent/player **email, phone** | **not sent** |
| **Medical notes**, attendance history | **not sent** |
| Date of birth | not held by this app at all — see `src/lib/ageGroup.js` |

⚠️ **Any feature that needs a row from the bottom half of that table is a
separate conversation with Jay, not a judgement call.** Widening it is cheap to
do and impossible to undo — the data has left.

## Related

- `claude/decisions/2026-08-10-role-dashboards.md` — the "trusted volunteers"
  ruling, where Jay decided admins keep full sight of children's data. Same
  decision-maker, same kind of call, recorded the same way.
- `claude/state-of-play.md` §Open, not blocking — the entry this closes.
