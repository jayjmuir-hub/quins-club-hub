# Decision: a drill may be written out in full

*21 Aug 2026. Jay's ruling. Reasoning, not current state — the code and
`RESTORE.md` win on what is true today.*

## What changed

`claude/plans/2026-08-12-training-session-plans.md` withheld a `body` /
`full_text` column from `public.drills` on purpose, and argued the point at
length under a section headed *"READ THIS FIRST: the scraping requirement"*.
That section, and the withheld column, are both gone. **`drills.body` exists.**

Jay, 21 Aug 2026: *"we don't need the copyright stuff in there, he isn't doing
any of that"*, then *"its not a problem at all, remove it entirely from the build
plan, it a solution looking for a problem"*.

## Why the original argument existed

It was a direct answer to the original brief, 12 Aug 2026:

> *"…scrape the web for the best rugby training sessions per age group…"*

Taken literally that means ingesting World Rugby, RFU and Sportplan sessions into
the club's own database and distributing them to fifteen squads' coaches under
the club's branding. The plan called that a legal exposure rather than a design
preference, and wrote — in those words — that it was *"the one thing in this plan
I would not build around quietly"* and that unlike everything else, Jay could not
overrule it.

## Why it is wrong now

**The requirement it was defending against is no longer being asked for.** The
20 Aug reopening does not mention scraping. It asks for a Rugby Performance
Director who can *"develop training plans, focus points, structure for
sessions"* — his own material, which is the thing the plan itself called the
actual win.

So by 21 August the guard was defending against nothing, and it was not free:

- **It stopped the Director writing a drill out properly**, in a tool whose
  entire purpose is to make his own material reusable. A one-line `summary` and
  a URL is a fine way to record somebody else's drill and a poor way to record
  your own.
- **It put a lecture in front of the reader** of both the plan and, briefly, the
  Director's own proposal, about a thing nobody had proposed doing.

⚠️ **A guardrail whose threat model has been withdrawn is not a cautious
guardrail, it is a broken feature.** That is the general form of this, and it is
the reason the ruling is recorded rather than the column just being added.

## What is NOT claimed here

This does not decide that bulk-importing somebody else's drill library would be
fine. It decides that **a text field is a text field**, and that the schema is
the wrong place to police what a qualified coach types into his own club's tool.
If the club ever does want to import a commercial library wholesale, that is a
content decision to take at the time, with its own reasoning — not a question
the absence of a column was ever going to settle.

`source_url` and `source_name` survive, because linking to where a drill came
from is genuinely useful to a coach on a touchline. They are no longer the only
way to record a drill.

## ⚠️ Do not re-add it

This is a tombstone. The argument has been made in full, at length, and
overruled by the person who owns the club and its risk. **Re-adding the
constraint, or re-writing the "READ THIS FIRST" section, is re-opening a settled
question** — the same rot `claude/decisions/2026-08-10-no-roster-import.md`
exists to prevent.

If a *new* reason appears — the club actually starts ingesting a third party's
library, someone asks for a bulk importer — that is a new question with new
facts, and it gets its own record. It is not this one.
