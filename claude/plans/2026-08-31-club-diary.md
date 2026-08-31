# Club Diary — dated items nobody replies to

**STATUS: NOT SHIPPED.** Spec only, agreed with Jay 31 Aug 2026. No code, no
migration, nothing applied. Replace this line the moment it ships.

## The problem, from a real artefact

The club's "3 week look ahead" poster for season 2026/27 lists seven items.
Only three of them are things the app can model honestly today:

| Poster line | What it is |
|---|---|
| Junior return to rugby | Training — a season of it |
| Online shop opens @ 7pm | **Not an event anybody attends** |
| New Ball collection at the shop (two days) | **Not an event, and spans two days** |
| Welcome Back Party from 7pm | Social, whole club |
| Zayed Sports City day | Social or tournament, details unknown |
| Kit Collection, U16/U18 (two days) | **Not an event, and spans two days** |
| Senior friendly v Bahrain @ 7pm | Match |

Four of the seven are dated, calendar-worthy items that **nobody RSVPs to**.
Today they can only be filed as Socials, which produces fixtures carrying an
availability list nobody will ever fill in, or as Notices, which are undated and
therefore cannot reach a subscribed calendar at all.

## What this adds

A fifth kind in the "What are you adding?" chooser — **Club Diary** — plus a
genuine all-day state and multi-day spans, both available to every event kind.

## Phasing — TWO releases, not one

**Jay, 31 Aug 2026.** The all-day work is the expensive third of this and
nothing on the poster is *provably* all-day: a kit collection at the club on a
Thursday evening probably has a time, and nobody has said otherwise. Shipping it
speculatively means a three-way control on every event form and a three-way
branch in a separately deployed Deno function, in support of a state no real row
is yet known to need.

| Phase | Ships | Why it stands alone |
|---|---|---|
| **1 — Club Diary** | `info_only`, the fifth chooser card, the read paths, the Schedule filter | Fixes four of the seven poster lines on its own. No feed change at all: an `info_only` event exports exactly like any other event, because being in the calendar is its whole purpose. |
| **2 — All day and spans** | `all_day`, the three-way time control, the multi-day span, the feed branch | Independently useful (a tournament day wants it too), and only worth building once a real all-day item exists to test against. |

**The phases are genuinely independent, and that is the test of the split.**
Phase 1 touches no SQL function and no edge function — it adds one column and
changes app code. Phase 2 touches `calendar_feed`, the Deno function and the
time control, and adds nothing to Club Diary that Club Diary needs.

**Everything below marked `[PHASE 2]` is deferred.** It is specified here rather
than in a later document because the reasoning — particularly why `all_day` must
stay distinct from `time_tbd` — was worked out now and would otherwise be
re-argued from scratch.

## Decisions, and the arguments against them

### 1. One feature, not two. Notices stay undated.

`announcements` has `title`, `body`, `team_id`, `group_id`, `pinned`,
`expires_at`, `created_at` — and no date for the thing being announced. Putting
a notice on a calendar therefore means giving notices a start time, a duration
and a venue, which is most of an event.

**Against:** a Club Diary entry gives up read receipts, pinning and the unread
nudge — the things the noticeboard is actually good at. To know who has seen the
kit-collection message you must post a notice *as well*, as a second deliberate
action. Considered and accepted: coupling the two systems raises "if I edit the
event's date does the notice follow, and what happens when one is deleted", and
neither answer is obviously right.

### 2. Not a new `events.type`.

`type` is read by the calendar feed, `EVENT_TYPE_ICONS`, the chip and detail
marks, `nextEventLabel`, and the filters in Schedule, Dashboard and
SocialWhatsOn. Every one branches on three known values, so a fourth would fall
through each of them silently — no error, just a missing icon, a missing filter
row, a mislabelled feed entry.

The precedent is two days old and is exactly this shape: **Tournament** is a
first-class chooser kind and is *not* a type — it is `type = 'match'` with
`competition_type = 'tournament'` (`src/components/EventKindChooser.jsx`). The
chooser speaks the user's language; `EventForm` translates the pick into
columns. Club Diary follows it: `type = 'social'`, `info_only = true`.

**Against:** two different things now share `type = 'social'`, so any code
reading `type` alone conflates a Welcome Back Party with a kit collection. That
is a real cost, paid in the read paths below — most sharply in `Chip`, which
would otherwise print the word "Social" on a kit collection. The alternative
cost, a fourth type falling silently through a dozen three-way branches, is
worse because it fails invisibly.

### 3. A real `all_day`, distinct from `time_tbd`. `[PHASE 2]`

`time_tbd` means **the day is known and the time is not yet decided**. The feed
already renders it as an all-day ICS entry and stamps "Kick-off time to be
confirmed" into the DESCRIPTION, precisely because — in its own words — an
all-day entry with no explanation reads as "this lasts all day", which is a
different and wrong claim.

A kit collection that genuinely runs all Thursday is a **third** state. Merging
it into `time_tbd` would tell every subscribed parent that a time is still to be
confirmed when there is no time. This repo already ruled once, on 14 Aug 2026
for `competition_tbd`, that "not decided yet" and "not applicable" are different
answers and must not be collapsed.

**Against:** a third state means a three-way control in the form and a three-way
branch in the feed, where there is currently a checkbox and a boolean. Accepted:
the alternative is a documented lie in subscribed families' calendars.

### 4. All-day is available on every kind, not only Club Diary. `[PHASE 2]`

A tournament day (the poster's "Zayed Sports City day") is genuinely all-day,
and so is a pre-season camp. Gating `all_day` to `info_only` would mean
re-deriving it for tournaments within weeks.

**Against:** wider blast radius — `all_day` can now appear on a match, where a
league fixture claiming no kick-off time is a smell. It is offered rather than
encouraged; nothing refuses it, and no validation pretends to know better.

### 5. A two-day item is ONE entry, not two. `[PHASE 2]`

ICS supports multi-day all-day entries natively, and every phone calendar
renders them as one bar across both days.

**Against:** it needs an end date in the form and a spanning branch in the feed.
The alternative — creating it twice — needs no code at all, but means the club
must remember to edit both copies when a venue changes, and shows two identical
items in the calendar.

## Data model

Two new columns on `public.events`:

| Column | Type | Meaning |
|---|---|---|
| `info_only` | `boolean not null default false` | Nothing to reply to. Suppresses availability. |
| `all_day` | `boolean not null default false` | `[PHASE 2]` No clock time. Lasts the whole day, or days. |

Both are `not null default false` deliberately: every existing row satisfies
them with no backfill, and every existing INSERT that omits them still works.
That matters beyond tidiness — the chat fixture-thread insert path carries
`event_id` and would break on a NOT NULL column with no default.

**`[PHASE 2]` The span reuses `ends_at`, which already exists.** When `all_day`
is true, `starts_at` and `ends_at` are read as *club dates* rather than instants:
`starts_at` is club-midnight on the first day, `ends_at` club-midnight on the
last. A one-day all-day event leaves `ends_at` null.

That makes the clock component of both timestamps a placeholder — exactly what
`time_tbd` already does — and both sides already own the machinery to
reinterpret it in Asia/Dubai (`src/lib/eventFormat.js`, and the feed's own
`icsDate`). The rejected alternative was a separate `ends_on date` column:
unambiguous and free of timezone reasoning, but it permanently forks "where does
an event's end live" into two columns, and every reader would have to know which
one applies.

**Three time states, never collapsed** `[PHASE 2]`:

| State | Columns | Means |
|---|---|---|
| Timed | `all_day` false, `time_tbd` false | 7pm. |
| Time TBD | `all_day` false, `time_tbd` true | Day known, time undecided. |
| All day | `all_day` true | There is no clock time. |

`all_day` and `time_tbd` are mutually exclusive, and that is a **check
constraint**, not a convention. The form's three-way control makes the illegal
combination unreachable, but the constraint is the guarantee and the control is
only the UI. Without it a row could claim both "no time exists" and "time not
yet chosen", and the feed's all-day branch would have to guess which sentence to
print.

## Creating one

The chooser (`src/components/EventKindChooser.jsx`) gains a fifth card,
**spanning the full width** beneath the four. The grid is `grid-cols-2`, so a
fifth would otherwise sit as an orphan in a third row; spanning it is also
honest, because the four above are things that happen on a pitch and this one is
not.

> **Club Diary** — *On the calendar, nothing to reply to*

`onPick('diary')` reaches `initialValues` in `src/screens/EventForm.jsx`, which
maps it to `type = 'social'` and `info_only = true`, following the translation
`'tournament'` already performs. **`'diary'` never reaches the database.**

**Shown:** title (required, as for any non-match), squad or *Whole club*, date,
the time control, venue, notes, Repeats, "Also add for".

**Hidden:** opponent, home/away, competition, league team, division, round,
tier, score, pitch, pitch portion, and the Self-service availability control.
`defaultPitchPortion` is not called at all.

**Permissions are inherited, not invented.** `canClubWide` is currently
`admin && values.type === 'social'`; a Club Diary *is* `type = 'social'`, so
whole-club works with no change. A coach can create one for a squad they coach;
*Whole club* stays admin-only. Kit Collection for U16 and U18 is one entry plus
"Also add for", created by a coach. The Welcome Back Party is whole-club, by an
admin.

**`[PHASE 2]` The time control becomes three-way** on every event form — Timed · Time TBD ·
All day — replacing the current lone TBD checkbox, because three states drawn as
two checkboxes is how a row ends up claiming both. Choosing *All day* replaces
the time fields with an optional **until** date; blank means one day.

## Reading one

Five read paths. Two are one-liners (`nextEventLabel`, `SocialWhatsOn`), two
are small (`EventDetail`, `Schedule`), and the first is a defect if missed.

**`src/components/Chip.jsx` is the one that bites.** It keys both colour and
icon off `type`, and a Club Diary *is* `type = 'social'` — so untouched, a kit
collection draws the People icon and the word "Social". That is not cosmetic; it
is the app asserting something false. Fix: a helper in `src/lib/eventFormat.js`
returning `'diary'` when `info_only` is true and `event.type` otherwise, with
`diary` added to `EVENT_TYPE_ICONS` in `src/components/EventTypeIcon.jsx` and to
`Chip`'s variants. Call sites currently passing `event.type` pass the helper
instead. The existing rule in that file holds: `'diary'` is not a result value,
so the win/loss/draw chips and the neutral squad pill are untouched.

**`nextEventLabel` must not say "Next social."** A new first line — return
"Next up" when `info_only` is true — placed **before** the type checks, which
would otherwise win.

**`src/screens/EventDetail.jsx`** drops the availability summary and never
passes `onOpenAvailability`. That is already the right mechanism: this component
has shipped a defect where a button rendered without a handler swallowed taps
silently for weeks, and the fix was to require the prop, so a screen that omits
it shows no button rather than a lying one.

**`src/screens/Schedule.jsx` gains a fifth tab, "Diary"**, with its own empty
state. Folding diary items under Socials would be wrong — a kit collection is
not a social — and today's filter would sweep them in silently. Five tabs may
force the tab row to scroll on a narrow phone: check the real labels against
real width rather than assuming.

**`src/screens/SocialWhatsOn.jsx` keeps them.** Its Socials filter should
include diary items rather than exclude them: the media team's own look-ahead
poster lists kit collection, so these are exactly the items that screen exists
to surface.

## The calendar feed `[PHASE 2]`

The work is split across two separately deployed artefacts — a Postgres function
and a Deno edge function — and the repo already names that as a standing risk: a
fix applied to one and not the other means a parent reads one thing on screen and
another in their calendar.

**Migration** (a new file in `db/migrations/`): add the two columns and the check
constraint, then replace `calendar_feed` so its `RETURNS TABLE` gains
`info_only boolean, all_day boolean`. Following the precedent already in
`db/migrations/20260814_calendar_feed_competition_type.sql`, the migration ends
with a `pg_get_function_result` assertion, so a silently unreplaced function
fails the migration rather than the feed.

**Edge function** (`supabase/functions/calendar/index.ts`):

- `Event` gains both fields, read with `=== true` — the existing convention, so
  an `undefined` from a pre-migration deployment reads as false.
- The all-day flag becomes "`all_day` is true **or** `time_tbd` is true". Both
  produce a `VALUE=DATE` entry.
- **The "Kick-off time to be confirmed" line fires only for `time_tbd`.**
  Printing it on a genuinely all-day item is the inverse of the mistake that
  comment exists to prevent: it would claim the time is undecided when there is
  no time.
- **DTEND for a span.** Today it is the day after DTSTART. For a multi-day
  all-day event it becomes the day after `ends_at`'s club date. ICS's DTEND is
  **exclusive**, so 17–18 September is `DTSTART:20260917` and `DTEND:20260919`.
  This off-by-one gets its own test with the boundary written longhand, because
  getting it wrong yields a one-day or a three-day entry and both look
  plausible.
- `endFor` and the per-type duration guess are untouched — the all-day branch
  never reaches them.

**`info_only` changes nothing in the feed output.** Appearing in the calendar is
a Club Diary entry's entire purpose. It exports like any other event, titled
from the event's own title through the existing squad-and-title line.

**Also updated:** the `db/schema/tables.sql` and `db/schema/functions.sql`
captures, and a `claude/schema-history.md` entry recording *why* `all_day` and
`time_tbd` are separate. That reasoning is invisible in the SQL and is the thing
a future session will otherwise try to merge.

## Rules and edge cases

**Turning `info_only` on when replies already exist: refused.** Someone creates
a Social, people reply, an admin later edits it to a Club Diary. Three options
were considered. Silently orphaning the availability rows hides data that still
exists; silently deleting them destroys a coach's answer. **Refusing is the only
option that cannot lose information**, so the form blocks it with a message
naming how many people have already replied and offering the two real choices:
delete the replies first, or leave it as a social.

**`[PHASE 2]` `all_day` and `time_tbd` cannot both be true** — check constraint,
above.

**`[PHASE 2]` An all-day event whose end precedes its start** is already covered
by the existing `events_ends_after_starts` check, and the feed independently
defends against it.

**`[PHASE 2]` Repeats combined with all-day and a span** is legal and behaves reasonably,
because the mechanism is generic. It is explicitly **not designed for**, and
nobody has asked for it. Stated here rather than left to silence.

## Non-goals

- Notice email. Unchanged, and still waiting on an outbox and a preferences
  table for the reasons `src/data/announcements.js` gives at length.
- Read receipts on events.
- Any coupling between Club Diary and the noticeboard.
- `[PHASE 2]` Refusing `all_day` on a match. It is offered everywhere; a league
  fixture wanting it is a smell, not an error.

## How this gets proven

Every assertion below is verified by **injecting the fault it exists to catch**
and confirming the test goes red. A test that would pass against its own bug
reports confidence it has not earned.

| Phase | Claim | Fault injected |
|---|---|---|
| 1 | A Club Diary chip reads "Diary", not "Social" | Revert the chip helper to plain `event.type` |
| 1 | `nextEventLabel` does not say "Next social" | Move the `info_only` line after the type checks |
| 1 | No RSVP button on a diary event | Pass `onOpenAvailability` unconditionally |
| 1 | A diary event still exports to the calendar | Filter `info_only` out of the feed query; the ICS fixture must lose the entry |
| 1 | Toggling `info_only` on is refused when replies exist | Remove the guard; the form test must then save silently |
| 2 | 17–18 Sept exports as exactly two days | Drop the exclusive +1 from DTEND; the fixture asserts `DTSTART:20260917` and `DTEND:20260919` longhand |
| 2 | An all-day entry gets no "time to be confirmed" line | Make that line fire on the all-day flag rather than on `time_tbd` |
| 2 | `all_day` and `time_tbd` cannot both be true | A harness in `db/tests/` inside `begin`/`rollback` inserting both true, which must raise — **plus a control insert of a legal row that succeeds**, so a failure for the wrong reason cannot read as a pass |

**Phase 1 carries one feed test even though it changes no feed code.** "A diary
event still exports" is the assertion that nothing accidentally filtered it out,
and it is worth having precisely because the feed is untouched — an assertion
that only holds by accident today is the one that breaks silently tomorrow.

The phase 2 feed tests matter most. It is a separately deployed Deno function,
so a divergence between app and calendar surfaces in subscribed families' phones
rather than in CI.

## Sequencing note

Written 31 Aug 2026 while several sessions were merging concurrently. The
migration must be announced to peer sessions before it is applied — two sessions
applied the same migration on 31 Aug and left a duplicate row in the migration
history that had to be cleaned by hand. See
`claude/runbooks/session-and-push.md`.
