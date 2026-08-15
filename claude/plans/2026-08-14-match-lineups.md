# Match lineups — picking a team, and sharing it

**STATUS: PHASE 1 SHIPPED AND LIVE.** Merged as `61b657a` (#130) and `a7d66cd`
(#131); `/lineup/:eventId` is routed in `src/App.jsx` on `main`. **Phases 2 and 3
are NOT started.**

❌ **THIS HEADER SAID "NOT YET MERGED OR DEPLOYED" UNTIL 15 Aug 2026, WHICH WAS
TWO PULL REQUESTS OUT OF DATE**, and it is exactly the inversion `RESTORE.md`
warns about — a status line that is worse than an omission, because an omission
looks like an omission. Three of its four claims were wrong:

- ❌ *"NOT YET MERGED OR DEPLOYED"* — merged and live.
- ❌ *"no coach has picked a team"* — **measured 15 Aug 2026: `lineups` and
  `lineup_players` both hold real rows.** Somebody has picked a team.
- ❌ *"The SAVE round trip has not been run against production"* — it has; the
  rows above are what a save produces.
- ❌ **The table is `lineups`, not `match_lineups`.** That name appears nowhere in
  the database. Anyone querying the name this file gave gets
  `relation does not exist`, which reads as "the feature was never built".

⚠️ **STILL GENUINELY UNVERIFIED, and it is the half that matters most:** whether
a lineup image has ever reached a WhatsApp group. **The image is the deliverable**
(see below) and no row in any table can tell you whether one arrived. That is a
question for a human with a phone, not a query.

⚠️ **DO NOT WRITE A ROW COUNT INTO THIS FILE.** The counts above are stated as
"holds real rows" on purpose — every number this repo has recorded has rotted.
The query lives in `claude/state-of-play.md`.

Jay, 14 Aug 2026: *"we need a way for coaches to select a lineup for teams in
matches (league, tournaments, friendlies)… easy GUI type thing… from players who
have marked available, but also the option to add players not marked available"*,
then *"it will not use the RCM match sheet for pre match, they also need the
option to generate and share the lineup with whatsapp groups"*, and
*"the coach can select how many players per side"*.

## What this is NOT

⚠️ **NOT the RCM match sheet, and the two must not be merged.** Jay ruled this
explicitly. `match_sheets` is a DOCUMENT FILED WITH THE GOVERNING BODY after the
match — it has `status`, `submitted_at`, a 1–22 slot convention taken from the
paper form, and a `full_name` snapshot so a filed sheet still says what was filed.
A lineup is a PLAN made before it, changes until kick-off, and is thrown away
afterwards.

⚠️ **AND KEEPING THEM APART REMOVES THIS FEATURE'S HARDEST CONSTRAINT FOR FREE.**
`match_sheets.event_id` is UNIQUE — one sheet per fixture, by design, because "a
second sheet is the same one filed twice". A squad fielding TWO teams at a
tournament, or playing four short games in a day, cannot be expressed against
that. A separate table simply has no such constraint. **Do not add a unique
index on `lineups.event_id`** — that would import the problem we just avoided.

## The data

```
lineups
  id, event_id -> events (cascade)
  label            text     null   -- "Game 2", "ADHQ2"; null for the only one
  players_per_side smallint        -- ⚠️ THE COACH'S CHOICE, see below
  notes            text     null   -- "meet 8:15 at the gate"
  created_by, updated_by, created_at, updated_at

lineup_players
  id, lineup_id -> lineups (cascade)
  player_id -> players  ⚠️ ON DELETE CASCADE, not SET NULL
  role      text     -- 'starter' | 'replacement'
  position  text     null  -- from src/lib/positions.js POSITIONS, optional
  sort_order smallint
  UNIQUE (lineup_id, player_id)
```

⚠️ **`player_id` CASCADES HERE, UNLIKE `match_sheet_slots`, AND THE ASYMMETRY IS
THE POINT.** That table keeps `full_name` and sets `player_id` null on delete
because a FILED sheet must survive the player leaving. A lineup is a plan for a
match that has not happened; a player who has left the club should vanish from it,
not linger as a name nobody can act on. **So no `full_name` snapshot either** —
the name always comes from `players`, and a rename is reflected rather than
frozen.

⚠️ **`players_per_side` IS ON THE LINEUP, NOT THE SQUAD** (Jay). A squad plays 10s
at one tournament and 7s at the next; deriving it from the age group would be
wrong on the day it matters. It also means no formation table has to exist and no
age-group mapping has to be maintained — which is why the picker is a LIST rather
than a pitch diagram (Jay's choice, 14 Aug, over a formation-per-age-group view).

⚠️ **THE COUNT IS A GUIDE, NOT A GATE.** Show "8 of 10 picked" and warn when over,
but never refuse the 11th. Coaches over-pick and then cut; a form that blocks
mid-thought gets worked around.

## The picker

One screen, reached from the event detail sheet, coach/manager only.

- **The pool is grouped by availability**: In → Maybe → No response → Out, with
  Out collapsed behind "show everyone".
  ⚠️ **Never blocks an unavailable player** — Jay asked for this directly. A
  picked player who did not say yes carries a warning chip in the lineup, so the
  coach can see at a glance what they have done.
- **Tap to assign, not drag.** Rejected drag-and-drop as the primary interaction:
  HTML5 DnD does not work on touch at all, and coaches use this pitch-side on a
  phone. A pointer-events library is ~30KB on a bundle that already warns at
  890KB, precision dragging on a 390px screen is fiddly, and an accessible
  keyboard path has to be built anyway — at which point drag is a second
  implementation of the same state. Desktop drag can be added later on top.
- Position is OPTIONAL and comes from `POSITIONS` in `src/lib/positions.js`. The
  club holds no squad numbers (see the `match_sheet_slots.slot` comment) and this
  feature must not invent them.

## The share

⚠️ **THE SHARE IS ALREADY BUILT — EXTRACT IT, DO NOT REWRITE IT.**
`src/screens/MatchSheet.jsx`'s `share()` already does exactly this job and has the
reasoning attached: lazy-import `html2canvas` (~194KB, so it never reaches a
parent looking at a fixture list) → canvas → blob → `File` →
`navigator.canShare({files})` → OS share sheet, with a download fallback because
**desktop browsers largely cannot file-share and that is the normal route, not an
error**, and `AbortError` treated as the person changing their mind.

⚠️ **`wa.me/?text=` CANNOT CARRY A FILE.** That is why it produces a PNG at all;
do not "simplify" it into a link.

Extract to `src/lib/shareImage.js` and have both screens call it. This codebase
already tolerates two unavoidable duplications (`leagueLabel`, `locationFor` — a
Vite bundle and a Deno function with no shared build). This one is avoidable, so
duplicating it would be a choice to let two copies drift.

**The image is the actual deliverable** — it is what a parent sees in a WhatsApp
group, and most will never open the app for it. It should carry the crest, squad,
opponent or tournament, date, kick-off (or "Time TBD"), venue and pitch, the
starters, the replacements, and the notes line. It must be legible as a WhatsApp
thumbnail.

## ✅ The two questions, and Jay's answers (14 Aug 2026)

Both were asked before any code was written, and both are now DECIDED — this
section is a record, not an open item.

1. **Do PARENTS see the lineup in the app, or only the WhatsApp image?**
   ✅ **Coach-only in the app; the image is the distribution.** It adds no new
   place where one family can read about another family's child. Making it
   member-visible later is additive; taking it away again would not be.
   Enforced by the `lineup manage` policy being `private.can_edit_team` — there
   is no read policy for anybody else, so this is a database fact and not a
   screen's opinion.
2. **Names on the shared image.**
   ✅ **Full names**, over a first-name-plus-surname-initial option that was
   offered with the safeguarding reasoning attached. Jay's call, and consistent
   with the RCM match sheet the club already shares as an image.
   ⚠️ The concern itself stands and is worth re-reading if this ever widens: a
   PNG leaves the app and can be forwarded beyond the group it was sent to.
   `claude/decisions/2026-08-12-childrens-data-may-leave-the-club.md` governs.

## Phases

1. **Pick and share.** Tables + RLS, the picker, `players_per_side`, the extracted
   share. Coach-only.
2. **Convenience.** Copy the last lineup for this squad; suggest starters from
   availability plus each player's `position`.
3. **Maybe.** Member-visible lineups, desktop drag, feeding the RCM sheet from the
   lineup once the match is played.
