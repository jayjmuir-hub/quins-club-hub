# Decision: "QR" means quick rip, and quick rip is tag

*21 Aug 2026. Jay's ruling, measured into `teams.requires_contact` the same
minute. Reasoning, not current state — the database wins on what is true
today: `select name, requires_contact from teams order by sort_order`.*

## The ruling

Jay, 21 Aug 2026: *"qr is quick rip which is basically tag, U9 is tackling"*.

So the club's fifteen squads split as follows, and this is the split that was
written to `teams.requires_contact` on the day:

| Contact (10) | Tag (5) |
|---|---|
| U9 Mixed, U10 Mixed, U11 Mixed, U12 Mixed, U13 Mixed, U14B, U16B, U16G, U18B, U18G | U6 Tag, U7 Tag, U8 Tag, U12G QR, U14G QR |

## Why it is a decision and not a fact in a table

**The two QR sides are the whole reason `requires_contact` is a column.**
U12G QR and U14G QR sit above the age at which this club starts tackling (U9),
and nothing in their names says "tag". Any rule of the form *"U9 and up is
contact"* would have handed a tackle drill to two girls' squads that do not
tackle. That is the exact failure `claude/plans/2026-08-12-training-session-plans.md`
§1 predicted when it forbade inferring the flag from the age band, and these
two rows are the proof it was right to.

**Nor can it be read from the name.** Three names say "Tag", two say "QR", and
ten say nothing. A parser that knew "QR" would be a parser that somebody
extends the day a squad is renamed, and `teams.is_senior` and
`teams.self_registration_allowed` already exist precisely so that a rename
cannot change behaviour. Same column, same reasoning, third time.

## What enforces it

- **The screen**: `squadFitsTemplate` in `src/lib/trainingPlans.js` refuses a
  contact template for a squad whose `requires_contact` is false, and says so
  beside the disabled chip on `/admin/training/publish`.
- **The database**: `publish_training` (`20260821_publish_training_fit_check`)
  refuses the same thing with `42501`, so a direct call cannot bypass the
  screen. `db/tests/training-plans.sql` step 7 proves it against live.
- **The switch**: `/admin/club` → a squad's Scoring panel → "Contact rugby".
  If a QR side ever moves to contact, that is where it changes — not here, and
  not in a name.

## Arguments against, kept

- *"Default the U9+ squads to contact and save the clicks."* Rejected above;
  the default is `false` because a tag squad wrongly marked contact can be
  offered a tackle drill, and a contact squad wrongly marked tag merely cannot
  be published to until somebody flips it. The failure modes are not
  symmetric, so the default is not either.
- *"Put the ten names in a migration."* A migration is code that runs once
  and is then history; this ruling was applied as data, by hand, and is
  recorded here so that the next person to see five `false` rows does not
  read them as "nobody has set this yet".
