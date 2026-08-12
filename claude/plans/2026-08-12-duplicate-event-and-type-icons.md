# Duplicate an event, and event-type marks that mean something

**STATUS: SHIPPED 12 Aug 2026.** Both halves are live. This file is the
reasoning; the code is the truth. See `claude/changelog.md` for the commits.

Two requests from Jay on 12 Aug 2026, in one sentence each:

> need the ability to duplicate an event, mainly training

> need better icons for training, match, and social in their event chip

They are independent and shipped together only because they touch the same two
files. Nothing below couples them.

---

## Part 1 — Duplicate

### The question that decided the design

The form ALREADY generates a term of training: tick Tue/Thu, set an end date,
get twenty sessions. So "duplicate" needed a reason to exist. Asked what it
solves that Repeats does not, Jay:

> Re-entering a session I already set up. The details take the effort, not the
> date.

That is the whole specification. **The venue, pitch, end time, additional info
and squad are the work.** A coach who wants last week's session again is not
asking for a recurrence rule; they are asking not to retype nine fields.

### What it does

`EventDetail`'s footer becomes **Edit | Duplicate | Delete**. Duplicate opens
the ordinary CREATE form, prefilled from the fixture, with the date blank.

**Carried:** type, title/opponent, start and end time, squad, home/away, venue,
pitch, additional info, competition type, tournament name, league team.

**Cleared, and why each one:**

| Cleared | Reasoning |
|---|---|
| Date | See below — Jay's ruling |
| `result_us` / `result_them` | **The one that would be found last.** Duplicating a PLAYED match is the normal way to set up the return fixture. A copy carrying the score would be a brand-new fixture that is already a result: `hasResult()` drops it straight out of Upcoming into Results, and it feeds the dashboard's "played with no score" tile with numbers nothing accounts for |
| `round` | A round belongs to one fixture in a season's sequence. "Round 4" twice is not an obvious typo — it is a **wrong result filed with the governing body**, the same class of harm `listLeagueTeams`' squad scoping exists to prevent |
| `id` | Or it is not a duplicate, it is a silent overwrite of the fixture you were looking at |
| `series_id`, `group_id` | See "the trap", below |

**`league_team_id` is CARRIED, unlike `round`, and the difference is real.** A
league team belongs to the SQUAD, and the squad carries over — ADHQ2's next
fixture is still ADHQ2's. Clearing it would make the commonest duplicate (same
side, another week) worse than starting from scratch.

### ⚠️ The date is blank, and that overrode three better-looking defaults

Four options were put to Jay: next week same weekday, blank, same date as the
original, today. "Next week" was recommended — it needs no edit at all in the
case he described. **He chose blank.**

It is the right call and the reasoning generalises: a prefilled value that is a
GUESS quietly becomes wrong, and here being wrong means a real training session
appearing in fifteen parents' subscribed calendars on a day nobody chose. Blank
cannot be wrong. It can only be unfinished, and unfinished is visible.

⚠️ **It is also the cheap answer, which is worth recording.** `handleSubmit`
already refuses to save without a date (`date: !values.date`), so **this feature
added no new guard at all.** The same reasoning was already written into the
form for the TIME field, which has been left blank for new events since v1 for
exactly this reason. Blank is the house rule; the smarter defaults were the
departure.

### ⚠️ The trap: a duplicate must never join the original's series

If a duplicate inherited `series_id`, then "delete this and every later session"
— fired from an occurrence it has nothing to do with — would sweep it away, on a
date nobody would think to check. `deleteSeriesFrom` filters on
`series_id = x AND starts_at >= …` and nothing else.

**The protection is structural rather than a filter somebody has to remember,
and that is the design decision worth keeping.** Neither column is in
`initialValues` at all. The payload is assembled from `common` + `rowFor()` +
`leagueFields`, and the only writers of those two columns are the `repeating`
and `multiSquad` branches, each reading a fresh `crypto.randomUUID()`. A future
edit cannot reintroduce the bug by forgetting a line — it would have to add one.

`tests/duplicate-event.test.jsx` pins it anyway, and the fault was injected
(`series_id: event?.series_id ?? null` on the payload) and detected.

### One flag, not a third mode

`EventForm` takes `duplicate` beside `event`, and the entire implementation is:

```
const editing = Boolean(event?.id) && !duplicate
```

`editing` already gated the id on the payload, the series checkbox, the Repeats
panel, the extra-squads picker, the sheet title and the submit label. Turning it
off is the feature. A separate "duplicate mode" would have been six places each
remembering to ask a second question.

**The bonus that falls out, and it is not an accident.** Because a duplicate is
a create, **Repeats and "Also add for" come back**. So "run last term's Tuesday
session again all next term" is duplicate → tick Tuesday → set an end date. That
is the one thing Repeats genuinely cannot do on its own, being create-time only:
**there is still no way to extend an existing series**, and this is the nearest
thing to one.

⚠️ The sheet title is derived from `duplicate`, not from `editing`, because
`editing` is false for a duplicate AND for a plain add. The title is the only
thing on screen saying this is a new event — the form is full of a fixture the
user was just looking at, so "Add event" reads as a failed load and "Edit event"
is a lie that costs an accidental overwrite.

### ⚠️ The dead-button rule, applied for the third time

`EventDetail` renders Duplicate **only when a handler is passed**, and both
Schedule and Dashboard pass one.

This is not defensive styling. This component shipped a dead button once:
"Set my availability" rendered unconditionally and called
`onOpenAvailability?.(event)`; Schedule passed the handler and **the Dashboard
did not**, so on the home screen the button drew itself, invited a tap and
swallowed it, silently, for weeks. No test caught it because every test drove
Schedule. The register button and the match-sheet button already carry the same
gate; this is the fourth.

⚠️ **The wiring test is a SOURCE check and its limit is stated rather than
glossed:** it proves the prop is wired, not that the handler works. What the
handler does is covered by the payload tests, which drive the real form. Pinned
this way for the same reason `tests/page-header-wrap.test.js` pins a class.

### ❌ `flex-wrap` on the action row — a claim written, tested, and withdrawn

This section originally read "**`flex-wrap` is load-bearing**": three `flex-1`
buttons plus gaps need ~330px, a 360px phone leaves ~324px, so without wrapping
the DOCUMENT would get wider than the viewport exactly as Schedule's header did
on 10 Aug 2026. It was written into the code comment, the test, the design
system and here, and **it was wrong in both halves.** It is kept as a tombstone
because it is the most instructive thing that happened during this work.

**How it fell over.** The fault was injected — `flex-wrap` removed — and the
overflow gate **stayed green**. Rather than shrugging, a control was injected: a
900px `shrink-0` button in the same row. The gate stayed green for that too,
which meant the gate was not measuring this row at all.

**Finding 1 — the arithmetic was invented.** Measured in real Chromium at 320px,
the narrowest width the harness runs: the row is **284px** and the three buttons
are **83 + 97 + 85** with 10px gaps. They fit on one line. Nothing clips. The
"~330px" came from guessed button widths and was never measured.

**Finding 2 — and this one is about the whole repo, not this feature.**
⚠️ **`harness/check-overflow.mjs` IS BLIND TO ANYTHING INSIDE A SHEET.**
`src/components/Sheet.jsx` renders `position:fixed inset-0` and sets
`document.body.style.overflow = 'hidden'` while open, so a sheet's contents are
not part of the document's `scrollWidth` and **cannot fail a document-width
check whatever they do.** That is why a 900px button changed nothing.

This applies to the `availability` and `playerform` scenarios that were already
in that list, not only to the `event-detail` one added here. Those scenarios
verify that the sheet BOOTS and that the page behind it is clean; **a clean run
has never said anything about a sheet's own layout, and must not be quoted as if
it had.** The gate's own header records the original bug being reported via a
screenshot of a clipped event sheet whose cause was Schedule's header three
layers away — consistent with this: the gate measures the document, and sheets
are not in it.

**What is true now.** `flex-wrap` stays: it is free, it matches the
delete-confirm row directly above which already wraps, and it is what stops a
longer label or a larger accessibility text size squeezing three buttons below
their min-content width. The test still pins it, with its own comment saying it
pins insurance. **The row was verified by measurement, not by the gate.**

⚠️ The rule this breaks is the repo's own, and it is worth naming: *a
measurement that merely confirms your own change was applied is not a
verification.* A green overflow run was about to be reported as proof the footer
was safe, when the gate could not have failed. The saving move was injecting a
control fault after the first injection came back clean — **an injection that
fails to go red is data about the CHECK, not a clean bill of health for the
code.**

---

## Part 2 — The event-type marks

### ⚠️ Tombstone: what was there, and why it went

`design-system.md` §5.5 specified **whistle = match, shirt = training, trophy =
social**, and those three lived as local functions inside
`src/screens/EventDetail.jsx`, rendered in that sheet's hero and nowhere else.
Jay's verdict, looking at real fixtures:

- **whistle → match.** A whistle starts a training session as often as it starts
  a match. It marked the thing it was least specific to.
- **shirt → training.** A shirt says "kit" — a strip, a kit order. Not a session
  in the diary.
- **trophy → social.** The worst of the three. A trophy means WINNING, and it
  was sitting on the end-of-term BBQ.

**Do not reinstate them.** The arguments above were made by the person who uses
the app, against drawn alternatives.

### What replaced them

Jay chose each from options drawn at hero size AND inside a real chip at its
real 11.5px, because an icon that reads at 40px can be mush at 12px.

| Type | Mark | Rejected alternatives |
|---|---|---|
| Match | **Solid rugby ball** | Goalposts (reads as the letter H before it reads as posts); keeping the whistle |
| Training | **Cone, rounded tip** | Five other cones (classic, no stripe, squat, a pair, solid) and five whistles (angled, mouthpiece-left, lanyard, mouthpiece-right, solid). Jay looked at both families before settling |
| Social | **Two people** | A mug (recommended, cleaner small); keeping the trophy |

⚠️ **The rounded tip is not a cosmetic preference.** A hard triangular apex reads
as a hazard triangle. The single stripe is load-bearing for the same reason:
without it the silhouette IS a triangle.

### ⚠️ Solid ball, outline cone and people — a deliberate inconsistency

The Match chip is the only one of the three with a DARK fill (`bg-brand`,
`#c8102e`, white text). Training and social sit on pale tints. A 2px hairline
that reads cleanly on `#e6f7ec` turns to mush on solid red at 12px, so the match
mark carries its weight as a filled shape instead.

**This was flagged to Jay as an inconsistency before he confirmed it.** If the
Match chip ever stops being a dark fill, this is the line to revisit.

### ⚠️ The seam is a MASK, not lines drawn on top

Stroking the ball's seam and laces needs a colour to stroke them IN, and the two
places it renders disagree: the chip is solid `#c8102e`; the detail-sheet hero
is a translucent white box over a red gradient, where **no opaque colour
matches**. Masking cuts the seam out of the ball so the background shows
through, and the mark is correct on both.

⚠️ **`useId`, never a literal id.** A fixed mask id collides the moment two match
chips render — which is the NORMAL case, a Saturday of age-group fixtures — and
then which mask applies is decided by document order. Fault injected and
detected.

### Where the decision lives

The three moved OUT of the screen into `src/components/EventTypeIcon.jsx`, and
**`Chip` decides the icon rather than each caller**.

Three components draw a type chip — `FixtureRow` (Dashboard and all three
Schedule tabs), `ScheduleTable` (the desktop grid), and `EventDetail` — and
asking each to pass an icon is three chances for one to be forgotten and for two
screens to disagree about what a training session looks like. It is the same
reasoning `FixtureRow`'s own header gives for holding the fixture label rather
than letting each screen build one, and the same reason `FixtureRow` was moved
out of `Schedule.jsx` in the first place.

**Only the three event types get a mark.** `EVENT_TYPE_ICONS` is keyed by
`events.type`'s own vocabulary, so the win/loss/draw result chips and the
neutral squad-name pill are untouched — they are not event types, and a row
where every pill carries a picture stops being scannable, which is the whole
point.

⚠️ **An unrecognised type gets NO mark, never a fallback one.** Giving it a
rugby ball would assert a fixture is a match on the strength of a value nothing
recognised — the same failure shape as `src/lib/ageGroup.js` reading an
unparseable squad name as "a senior side: adults". Absence is the honest answer.
The hero keeps its 56px square in that case, though: dropping it would make the
title jump 68px, and an empty tinted square is the quieter wrong answer.

⚠️ **The icons are decorative (`aria-hidden`), decided in the component rather
than at each call site.** Every place they render, the word they mark is beside
them; labelling them would make a screen reader say the type twice. That is a
property of the icon's role, not of where it is drawn.

### ⚠️ The bug written and caught during implementation, worth keeping

The first version of `Chip` decided whether to add a gap like this:

```
const icon = <EventTypeIcon type={type} />
... icon ? 'gap-1' : ''
```

**A React element is truthy even when the component returns null**, so that puts
`gap-1` on every text-only chip in the app — and every screen has one. It now
asks the MAP (`Boolean(EVENT_TYPE_ICONS[type])`). The test that catches it
asserts the *absence* of the gap on a neutral chip, and that fault was injected
and detected.

---

## Verification

- Eleven faults injected one at a time, each reverted after; **all eleven
  detected.** Covering: series_id leaking, score carried, date prefilled,
  duplicate treated as an edit, round carried, the truthy-element gap bug, a
  shared mask id, a fallback mark for an unknown type, `flex-wrap` dropped,
  Dashboard dropping the handler, and a result chip gaining an icon.
- Full unit suite green before and after. `npm run build` clean.
- `harness/check-overflow.mjs` run in real Chromium at 320/360/375/390/414.
  **This is the meaningful run for the CHIPS** — every type chip in the app got
  ~16px wider, and the fixture lists that carry them are in-flow on scrolling
  pages, which the gate does measure. It is NOT meaningful for the sheet footer;
  see the tombstone above.
- Measured in Chromium at 320px on the `event-detail` and `schedule-admin`
  scenes: type chips render a 12px mark with `gap-1`; the neutral squad chip
  ("U12 Boys") renders **no** mark and **no** gap; two match chips produce two
  distinct mask ids, each ball referencing its own; the hero mark is 28px and
  `aria-hidden`; `document.scrollWidth` is 320 at a 320px viewport.
- Verified live on production after the deploy.

## What was NOT done

- **No `group_id` handling.** A duplicate never inherits one, but "duplicate
  this session for every squad in the group" is not offered. The multi-squad
  edit/cancel gap Jay deferred on 8 Aug is untouched.
- **No duplicate from the fixture ROW.** It is on the detail sheet only. A row
  action would need a long-press or a swipe affordance on a control that is
  already the primary tap target.
- **Repeats still cannot extend an existing series.** Duplicate + repeat is the
  nearest thing, and it creates a NEW series rather than adding to the old one.
