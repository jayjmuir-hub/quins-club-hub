# Senior squads: adults, jersey numbers, several squads per player, and U18 call-ups

**Status: NOT SHIPPED — spec only, no code written.** Dated 2026-09-02.

Pieces 2 and 3 of 3 in the senior-squads work. Depends on piece 1,
`claude/plans/2026-09-02-fixture-format.md`, which ships first. Written from a
design conversation with Jay on 2 Sep 2026; his rulings are quoted where they
settle something.

## What Jay asked for

Add the senior teams to Club Hub: about four men's squads and the women's
sides, playing 15s in the league and 7s, 10s, 12s or 15s at tournaments.
Seniors have jersey numbers; juniors do not. U18 players sometimes play up
with the seniors and must be able to. Nothing about fees or money.

This also fixes the committee-member sign-up case from 1 Sep 2026: "I play
here myself" currently leads an adult into a junior-shaped path with a squad
list that has no adult squad on it.

## Rulings (2 Sep 2026), in Jay's words where he gave them

| Question | Ruling |
|---|---|
| Money, fees, "paid" flags | **Out entirely.** "we don't need anything at all regarding paid fees or money." |
| Women's setup | Unknown yet; "intent is to initially give most flexible options to both genders." So: squads are whatever the club names them, format lives on the fixture (piece 1), and nothing about a squad's gender is new. |
| How a player relates to several senior squads | **Option C — full membership in each squad.** "if an U18 moves up to play he would need to see everything for both squads." Options A (guest per fixture) and B (an "also available for" list) were offered and declined; see the tombstone below. |
| Who decides a U18 call-up | **The senior side. Inform only, no veto.** "inform only, no veto." |
| Age floor for a U18 in senior rugby | **17.** "the age floor is 17." Measured as 17 or over TODAY, not at a season cut-off; Jay did not ask for a cut-off and the age-grade cut-off is a junior concept. |
| Called-up player's access | Full: availability, chat, notices, documents, fixtures, training, "like availability and such". |
| Switching between squads | No switch. The app merges, screen by screen, as it already does for a parent with children in two squads. |

## Tombstones — decisions this reverses or declines

### "The club does not use jersey numbers" (Task 12, early Aug 2026) — NARROWED, not deleted

`RESTORE.md` and `claude/specs/design-system.md` say the club does not use
jersey numbers, never add a jersey field, and four harnesses assert the word
"jersey" appears nowhere on screen (`harness/shoot-admin.mjs` and three
others, `jerseyAnywhere`). That was true and is still true **for youth
squads**. It was written before senior squads were in scope. This spec keeps
every word of it for a squad whose `uses_jersey_numbers` is false, which is
every squad that exists today, and the harness assertions keep passing
because every harness fixture is a youth squad. `players.jersey_num` was kept
in the schema "in case the senior sides ever want squad numbers"
(`RESTORE.md`); this is that case.

### Options A and B for multi-squad players — declined 2 Sep 2026

- **A. Home squad plus guests per fixture.** Simplest; a swing player would be
  a "guest" every week and the guest would see nothing of the second squad.
- **B. Home squad plus an "also available for" list.** Recommended by Claude:
  one mechanism for the 1st/2nd XV swing, a woman playing 15s and 7s, and a
  U18 call-up; chat and notices stay with the home squad. Declined because the
  called-up player must see the second squad's chat, notices and fixtures,
  which B does not give.
- **C. Full membership in each squad.** Chosen. The honest cost, stated at
  the time: the player record holds ONE `team_id` today and the roster,
  availability, lineup and their tests assume it. That is the work in this
  spec.

## Part 2 — Senior squads, adult sign-up, jersey numbers

### Data

`teams` gains one column; `is_senior` already exists (6 Aug 2026) and every
registration function already reads it so that a senior squad's players are
`player` memberships, not `parent` ones.

| Column | Type | Meaning |
|---|---|---|
| `uses_jersey_numbers` | `boolean NOT NULL DEFAULT false` | Season numbers on the roster, sort and search by number, number on the sheet. A social or touch side can be senior with this off. |

`players.jersey_num` (exists, nullable, smallint) becomes the **season
number** in the player's HOME squad. Unique per squad, enforced by a partial
unique index on `(team_id, jersey_num) WHERE jersey_num IS NOT NULL`. Two
squads can both have a 9.

`lineup_players` gains `shirt_number smallint` — the **match-day number** on
one team sheet, 1 to the sheet size for that fixture's format (piece 1),
defaulted from the player's season number when they have one. This is the
number the RCM sheet prints. The two numbers are deliberately separate: the
roster must not lie the week someone plays out of position.

⚠️ `players.team_id` stays NOT NULL and stays the **home squad**. It decides
roster grouping, age grading and the contact-privacy gate. A second squad is
a second `memberships` row (`profile_id`, `team_id`, `player_id`), which
`memberships_unique_grant` already permits — a person may hold several
memberships with different `team_id` values. No new table.

### Adult sign-up

"I play here myself" becomes the adult path when the person is 18 or over,
and stays the existing U13-and-over path otherwise. The wizard already knows
which squads allow self-registration; a senior squad has
`self_registration_allowed = true` like U13 and above.

- Squad list shows senior squads first for an adult, juniors first for a
  child. No parent wording, no play-up consent, no "your child".
- Date of birth is still collected; it is what decides adult versus U13
  path, and the DB already holds it privately.
- The access request is written with `requested_role = 'player'` and the
  senior squad, exactly as a U16 self-registration is today.
- The committee-member case: an adult who ticks only "I help the club another
  way" already skips squads (26 Aug ruling). An adult who ticks "I play here
  myself" now sees adult squads. Nothing else changes.

### Roster

Where `uses_jersey_numbers` is true: the 40px tile shows the number instead
of initials; the coach's grouped view sorts by number within position; search
matches the number. Inline edit of the number for staff, with a clash message
naming who already has it. Where false: no change, byte for byte — the
harness `jerseyAnywhere` probes prove it.

A player in two squads appears on both rosters. On the non-home roster the
row carries a small "from U18B" mark for staff; parents see nothing extra.

### Availability, chat, notices, documents, push

All of these decide their audience from `memberships` already
(`squad_push_subscriptions`, `message_push_subscriptions`,
`notice_push_subscriptions`, `document_push_subscriptions`). A second
membership means a second audience, with no code change to the audience
functions. What DOES change: `listPlayers({ teamIds })` reads `players.team_id`
and must instead read "players with a membership in these squads" so the
senior coach's availability list and lineup include the called-up player.
That is the one query behind Squad Hub, Availability and Lineup, and it is the
centre of the work.

### Staff roles

None added. Head coach and manager exist. The captain flag exists on the
player. A senior captain gets the approval, availability and call-up powers
of a manager on their own squad, via `private.can_edit_team` reading the
captain flag for a senior squad only. No new role value.

### Selection publishes the team

"Publish" on a saved lineup posts the team, with shirt numbers, to the squad
chat as a staff post. The lineup share image already exists; this posts it.

### Senior Section overview

Jay, 2 Sep 2026, on reading the captain's writeup: *"i thought there would
be an overall view also?"* Yes. The youth side already has one — the Youth
Manager dashboard (`src/screens/YouthDashboard.jsx`), every league match
across all youth squads with its match-sheet state, behind the `youth`
admin right. The seniors get the equivalent, and it fits them better,
because a small group runs the senior section as a whole.

**Who sees it.** A new `seniors` admin right in `ADMIN_RIGHTS`, held by
**the club captain and one or two others** — Jay's answer to "who runs the
section". Titled by the job, not the person
(`claude/decisions/2026-08-12-jobs-not-people.md`). Every senior head coach,
manager and captain also gets it READ-ONLY for their own squad's planning.
Players never see it; they see their own squads merged. As with the youth
dashboard, the right gates the SCREEN, not the data — RLS on every table
behind it is unchanged, so this is a "not your job" message and never a
security boundary.

**What is on it**, one screen under `/admin/seniors`, sections in this order:

1. **Every senior fixture**, all senior squads, by date, with format
   (piece 1) and match-sheet state — the youth dashboard's list, filtered
   to `is_senior`.
2. **This weekend's availability across the section**: answered / not
   answered / in / out per squad, so a short squad is visible before
   Thursday.
3. **Call-ups in flight**: every `callup_requests` row, its state, which
   squad asked, when. The one place that shows the whole picture of seniors
   drawing on the U18s.
4. **The senior pool**: every senior player, grouped by home squad, with
   their other squads marked. Where "who is in two squads" becomes visible.
5. **Season records side by side**: one row per squad.
6. **Post to all seniors**: a notice targeted at every senior squad at once,
   and a senior-wide chat channel. The club-wide channel already exists
   (`/chat/club`); this is the same idea one level down. Audience is
   "members of any squad with `is_senior`", decided in the database like
   every other audience.

**Built for the load the youth dashboard was built for**: the rolling event
window and one query per section, not one per row.

### Season record

A per-squad line under Squad Hub: played, won, lost, drawn, points for and
against, from scores already on match sheets. A view, not a table. Seniors
only; juniors keep "no league below U11" and their existing scoring rules.

## Part 3 — U18 call-ups

### The list the senior side sees

On a senior squad's selection screen, under "U18 players you can call up",
the head coach, manager and captain of that squad see U18 players who are
**17 or over today**, by name and position, each in one of three states:

- **consent needed** — no parental consent this season;
- **consent given** — tap to add;
- **already in this squad**.

Shown: name, position, state. **Not shown:** date of birth, contact details,
parent details, anyone under 17. The age check is a SECURITY DEFINER
function over `player_private.date_of_birth`; the date never leaves the
database. This is the privacy gate, and it is the reason the list is a
function and not a filtered roster read.

### Consent

`player_private.senior_callup_consent_at timestamptz` — a parent's yes, once
per season, separate from `plays_up_confirmed_at` because it is a different
decision (playing outside the age grade, versus playing adult rugby). Same
table as the date of birth for the same reason that column gives: RLS grants
rows not columns, and this is a fact about a child. NULL means no consent.
Cleared by the season rollover, whenever that exists; until then an admin
clears it by hand at season end.

"Request call-up" writes a `callup_requests` row (`player_id`,
`senior_team_id`, `requested_by`, `status`), pushes and emails the parent
("The Men's 2nd XV would like to call up <player> — say yes or no"), and
informs the U18 squad's head coach and manager. The parent's yes stamps the
consent column AND creates the senior membership. A no records the refusal
so the same coach is not asking every week.

### The 17 floor is a setting

`club_settings.senior_callup_min_age smallint NOT NULL DEFAULT 17`, one row,
admin-editable on the Club tab. There is no `club_settings` table today;
this creates it, and the age is its first row. Checked in the database
function that builds the list and again in the function that creates the
membership, so a hand-rolled call cannot skip it.

### Inform only

Every state change — requested, consented, refused, removed — notifies the
U18 head coach and manager through the existing approval-push audience rule
(`private.approval_audience`, super admins plus that squad's head coach and
managers). They can act on what they learn; the app gives them no button.

### The clash note

When a player in two squads has fixtures in both on the same day, both
fixtures show "also selected for U18B v Exiles, 11:00" to the player and to
both squads' staff. Read from events and lineups; nothing stored. This is
the thing "inform only" is meant to surface, and it is the smallest piece of
the whole spec.

### Ending a call-up

The senior coach or an admin removes the senior membership. The U18
membership and the consent are untouched. Removal informs the U18 staff.

## What the called-up player experiences

Full access to the senior squad: fixtures, training, availability on each
fixture, squad chat, notices, documents, push. Contact-privacy rules stay
those of a 17-year-old (own contact from U13, already allowed). No staff
screens in either squad. No switch anywhere: Home merges both squads,
Schedule has the existing "All squads" filter, Chat lists one row per squad,
Squad Hub is per squad and is a staff screen.

### Season stats for seniors

Jay, 2 Sep 2026, reversing the first draft's non-goal: *"need season stats
for seniors."* Per player per season, from what the match sheet already
records: games, starts, appearances off the bench, tries, conversions,
penalties, drop goals, yellow and red cards. Every one of these is on the
RCM sheet today (`match_sheets` slots, scoring components and the cards
rows), so this is a view over sheets, not new data entry. Shown on the
player's detail sheet and as a sortable table on the squad page and the
Senior Section overview. **Seniors only** — a junior sheet keeps its
"no league below U11" and everyone-plays rules, and a leaderboard of
children is exactly the thing the youth side has declined before.
Minutes played comes later, if Game Time is ever used for seniors.

### Union registration numbers

Jay, 2 Sep 2026: *"need union registration numbers in seniors."* One
column, `player_private.union_registration_no text`, in the private table
with the date of birth because it identifies a person to a governing body.
Staff of the player's squad edit it; it prints on the RCM sheet next to the
name for senior squads, and on the senior roster for staff. Not shown to
parents or other players. Nothing validates its format: the union's numbering
is theirs to change.

### League tables and standings — piece 4, its own spec

Jay, 2 Sep 2026: *"we should have league tables and standings and we also
need to discuss that for juniors who play league (how to do it?)."* Reversed
from the first draft's non-goal, then settled the same day: *"option 1 and 2
for standings and tables, option to use either."* Because it applies to
every age group that plays league, it is its own spec:
`claude/plans/2026-09-02-standings-and-results.md` — one results table per
division, three routes in (type it, share a message or photo or PDF to a
reader that proposes rows for a person to confirm, or fetch the union's
page), standings computed never stored, and a results-keeper job per
division. The season-record view above stays as the seniors' own record.

## Non-goals, and why

- **Money.** Jay's ruling, above.
- **A veto for the U18 coach.** Declined; inform only.
- **Season rollover.** Needed eventually for consent, numbers and stats; not
  here.
- **Minutes played.** Game Time is a junior tool today.

## Testing

- `needsSquads`/wizard tests gain the adult path: an over-18 ticking "I play
  here myself" sees senior squads first and no parent copy; a 14-year-old
  sees the existing path. Controls both ways.
- Roster: a squad with numbers off renders initials and the `jerseyAnywhere`
  probes stay green; a squad with numbers on renders the number.
- `db/tests/senior-squads.sql`: two squads may share a number, one squad may
  not; a second membership for a player is accepted; `listPlayers`'s
  replacement returns the called-up player for the senior squad.
- `db/tests/senior-callup.sql`: a 16-year-old is absent from the list and a
  17-year-old present, with the date of birth never in the result; consent
  gates the membership; the floor setting at 18 removes the 17-year-old.
  Rolled back.
- Clash note: two fixtures same day render the note on both; different days
  render nothing.

## Order of work

1. Piece 1 (format on the fixture) — separate plan, ships first.
2. `uses_jersey_numbers`, the unique index, roster number display and edit.
3. `listPlayers` by membership; availability, Squad Hub and Lineup follow.
4. Adult sign-up path.
5. Shirt numbers on the lineup and sheet; publish to chat.
6. Call-ups: setting, consent column, request table, list function, parent
   flow, informs, clash note.
7. Season record view, and union registration numbers on the sheet.
8. Season stats for seniors — a view over match sheets.
9. Senior Section overview and the `seniors` right, plus the all-seniors
   notice and chat channel. Last because every section of it is a view over
   data the earlier steps create.

Each step is its own pull request. Step 3 is the one that touches the most
files and is where the estimate is least certain.
