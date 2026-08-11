# RCM match result sheets — Project 2 of 2

**STATUS: SHIPPED**, 12 Aug 2026. Designed 11 Aug, revised by Jay on 12 Aug —
**see §Decisions of 12 Aug, which OVERTURN three things this file says further
down.** The Project 1 dependency was cleared the same day.

⚠️ **THE BLOCKER BELOW IS RESOLVED: Jay supplied the real form mid-build**, and
the facsimile is built from the document rather than from the field table. Three
things the field table could not have told us, and which an earlier version got
wrong:

1. **The 22 run in TWO COLUMNS** — 1-12 left, 13-22 right, each with its own FR
   column. Not one list of 22.
2. **FINAL SCORE / TRIES are HOME and AWAY, not us and them.** They are
   positional, so a fixture we played away puts our score in the RIGHT pair
   while the database still stores it as `score_us`. The mapping lives in
   `MatchSheet.jsx` and nowhere else.
3. **CLUB is the club; HOME TEAM is the LEAGUE TEAM.** The filled example reads
   `CLUB: AD Harlequins` and `HOME TEAM: ADHQ2`. A guess had the club name in
   both — the league team is what identifies the side.

⚠️ **AND INSTRUCTION 5 IS A FINDING, NOT BOILERPLATE:** *"WAP, DIV1, DIV2 Games
are completed on sportslive app."* Those senior competitions do not use this
sheet at all, which is independent support for `matchSheetDeadline()` returning
**null** for a non-youth squad rather than guessing a rule for it.

⚠️ **STILL UNEXERCISED BY A REAL COACH.** Everything below is tested and live;
nobody has filled one in during an actual match and sent it to RCM.

## ⚠️ Decisions of 12 Aug 2026 — read these BEFORE the rest of the file

Four answers from Jay, and **three of them contradict text still standing
below.** The text below is left as written rather than silently edited, because
it records the reasoning that was argued at the time; where they disagree, this
section wins.

| Question | Jay's answer |
|---|---|
| The RCM form itself | **He is sending it.** Not in the repo — see the blocker below |
| U18's opposite deadline | **One mode for everyone. U18 uses the result sheet too** |
| Who uses it day one | Coach/manager fills → **Submit** → dashboard → **share via WhatsApp**. Candice has no account; the screen is titled **"Club Youth Manager"**, not a person |
| Tournaments | **League only**, as originally deferred |
| WhatsApp share | **Generate a real image/PDF in the browser** — the ~200KB dependency is accepted |

### ⚠️ The three reversals, stated plainly

1. **"No new dependency" is REVERSED.** §Screens below says a canvas-to-PNG
   library "was considered and rejected at ~200KB". Jay has accepted it, because
   the alternative does not do what he asked for: **WhatsApp cannot be handed a
   file by a link.** `wa.me/?text=` carries text only, and RCM's own instructions
   demand a "saved file or screen shot/picture of form". A one-click share needs
   the Web Share API with `files`, which needs the app to *produce* a file.
   ⚠️ **Desktop browsers largely cannot file-share**, so the print view stays as
   the desktop path — it is a fallback now, not the only route.
2. **The U18 deadline split is NOT being built.** §The deadline rule below
   describes U18 → 1 hour **before** kick-off. One result-style sheet now serves
   every age group. ⚠️ **I flagged that this is the wrong deadline for U18B and
   U18G, which both exist; Jay ruled anyway and that is his call.**
   ⚠️ **The app must still SHOW the true RCM deadline per age band** — deriving
   it honestly and not offering a pre-match mode is very different from telling
   a U18 coach the deadline is 24 hours after. Do not "simplify" the deadline
   rule to one number to match the one editor mode.
3. **The empty database is NOT a design input.** Jay, 12 Aug: *"build the system
   for the end result not what data is already loaded — players, teams,
   schedules, managers, coaches, everything will be loaded in eventually."*
   ⚠️ **§Deliberately deferred and the `full_name` note below both lean on
   current row counts, and that reasoning is retired.** A low count is grounds
   for calling a feature UNEXERCISED — a verification caveat — never grounds for
   shaping a schema or dropping a path. Concretely:
   - **The 22 slots get a real roster picker** (typeahead over the squad's
     players), with free text as the FALLBACK rather than the primary path.
   - **Register auto-fill stays designed-for.** Deferring the shipping is fine;
     building something it cannot slot into later is not. `player_id` alongside
     `full_name` must stay.
   - ⚠️ **`full_name` AS STORED TEXT SURVIVES — BUT ONE OF ITS THREE REASONS
     DOES NOT.** Reason 2 below ("the club has 7 players") is void. Reasons 1
     (the form demands the name *as per registration*, and a rendered join is
     not a record of what was filed) and 3 (a filed sheet is history and must
     survive a player being renamed or removed) still stand, and 3 is the
     strongest. **Check each justification separately rather than re-affirming
     the conclusion.**

### ⚠️ BLOCKED ON ONE THING: the form

**The RCM Official Match Result Sheet is not in this repo** — only the field
table below describes it. A facsimile cannot be built from a description of its
fields: box positions, column order, the FR column and the discipline rows are
the whole point of the word "facsimile". Jay is sending it.
**Everything else — schema, RLS, the editor, the dashboard, submit — is
unblocked and does not wait on it.**

### Measured 12 Aug 2026, as caveats and NOT as design inputs

15 squads, **including `U18B Contact` and `U18G Contact`**; 7 players; **0
attendance rows**; 6 match events; 1 league team. Active admins are Jacques
Reyneke and Jay's two accounts — ⚠️ **Candice, Nick and Tracy have NO accounts,
which `state-of-play.md` gets wrong** where it calls them ordinary admins.

## What this is

**Not a club report — a governing-body form.** Jay supplied a filled example on
11 Aug 2026: the **Rugby Club Management (RCM) Official Match Result Sheet**,
one per team per game.

Its own instructions, which constrain the design more than anything else:

> *"PLEASE COMPLETE ON PHONE OR LAPTOP WITH FULL NAME OF ALL SQUAD MEMEBERS AS
> PER REGISTRATION AND IDENTIFY FRONT ROW REPLACEMENTS WITH A '✓' IN THE FR
> COLUMN"*
>
> *"All completed forms need to be submitted to RCM through their RCC/CLUB
> Whatsapp group. (Can be saved file or screen shot/picture of form)."*
>
> *"U11 to u16 Games … within 24hours of completion of game."*
> *"U18 Boys & Girls, WXV, W7s … 1hour in advance of Kick Off."*

⚠️ **THE SAME FORM HAS TWO DEADLINES ON OPPOSITE SIDES OF THE MATCH.** For
U11–U16 it is a result sheet due 24 hours after; for U18 it is a team sheet due
an hour **before** kick-off. Jay described it as *"a result report, written up
after the match"*, which is true of the age groups he was thinking of and not of
U18.

## Decisions taken, with who took them

| Decision | Jay, 11 Aug 2026 |
|---|---|
| It is a **result** report, not a pre-match team sheet | his answer; see the U18 caveat above |
| Reaches **coaches and team managers only** | not parents, not public — so no safeguarding ruling is needed |
| Output must be a **facsimile of the RCM form** | *"generate a facsimile of this form"* |
| The **coach or manager** fills both halves | not Candice centrally |
| Squad selection happens on a **PC browser** | *"i would expect these to be initially filled out on a pc browser"* |
| The fixture block **auto-populates** | *"the match information should auto populate from the match info in the system"* |
| Output via **print stylesheet → Save as PDF** | no new front-end dependency |

## The form, field by field, and where each comes from

| Form field | Source |
|---|---|
| CLUB | constant, "AD Harlequins" |
| TEAM | `league_teams.rcm_name` — **Project 1** |
| HOME / AWAY TEAM | `events.home` + `events.opponent` |
| DATE, KICK OFF TIME | `events.starts_at`, rendered in club time |
| VENUE | `events.venue` |
| COMPETITION | `events.competition`, plus division from Project 1 |
| FINAL SCORE, TRIES (both sides) | entered on the sheet |
| Squad 1–22, FR ticks | entered on the sheet |
| TEAM CAPTAIN | entered on the sheet |
| Discipline rows | entered on the sheet |
| Medical notes | entered on the sheet |
| Team manager name, signature | entered on the sheet; signature optional per the form |

⚠️ **Measured 11 Aug 2026: all 6 match events already carry a competition AND a
venue**, so the auto-populate half works against real data today.

## Schema

### `public.match_sheets` — one per fixture

`event_id` uuid not null **UNIQUE** (FK `events` on delete cascade),
`league_team_id` uuid (FK, on delete set null), `captain_name` text,
`manager_name` text, `score_us` / `tries_us` / `score_them` / `tries_them`
smallint, `medical_notes` text, `status` text not null default `'draft'`
CHECK in `('draft','complete')`, `submitted_at` timestamptz,
`created_by` / `updated_by` uuid FK `profiles` on delete set null.

⚠️ **UNIQUE on `event_id`**, the same reasoning `pitch_requests` records: a
second sheet for one fixture is not a second document, it is the same one filed
twice, and two would mean two submissions and a race over which is real.

### `public.match_sheet_slots` — 22 rows per sheet

`match_sheet_id` uuid not null (FK on delete cascade), `slot` smallint not null
CHECK `between 1 and 22`, `player_id` uuid (FK `players` **on delete set null**),
`full_name` text not null, `front_row` boolean not null default false.
`UNIQUE (match_sheet_id, slot)`.

⚠️ **`full_name` IS STORED AS TEXT EVEN WHEN `player_id` IS SET, AND THIS IS THE
LOAD-BEARING DECISION IN THE WHOLE PROJECT.** Three reasons, each sufficient:

1. The form demands *"full name … as per registration"* — a rendered join is not
   a record of what was submitted.
2. **Measured 11 Aug 2026: the club has 7 players in the entire database, 0 with
   a position and 0 flagged captain.** A 22-man sheet cannot be built from a
   7-player roster, and ⚠️ **there is deliberately no roster import** — settled
   10 Aug, parents self-onboard. A coach must be able to write a name that is
   not on the roster yet.
3. A submitted sheet is a historical record. If a player is later renamed,
   moved or removed, the sheet must still say what was filed.

⚠️ **`slot` IS THE POSITION, NOT A SHIRT NUMBER.** 1 is loosehead, 2 hooker, and
16–22 are the replacements whose front-row cover the FR column identifies — a
safety rule, not decoration. ⚠️ The app deliberately holds no squad numbers at
all: `tests/data.test.js` asserts `never sends jersey_num — the club does not
use squad numbers`. **Do not repurpose `players.jersey_num` for this.**

### `public.match_sheet_cards`

`match_sheet_id` uuid not null (FK on delete cascade), `half` smallint,
`minute` smallint, `colour` text CHECK in `('yellow','red')`, `slot` smallint,
`full_name` text, `reason` text.

Own team only, as the form specifies.

## Screens

**`/admin/youth`** — Candice's dashboard, behind the existing `youth` admin
right. ⚠️ **That right already exists** in `ADMIN_RIGHTS` (`src/lib/scope.js`),
is labelled "Youth Manager", and currently grants access to **nothing** — the
same state `pitches` was in before the pitch stack. Lists matches with sheet
status and a deadline flag.

**The sheet editor** — fixture block read-only and auto-populated; 22 slots;
cards; medical; manager name. Reached from the fixture and from the dashboard.

**The print view** — the facsimile. Plain HTML and CSS with a print stylesheet;
the coach uses the browser's Save as PDF and attaches it in WhatsApp.
⚠️ **No new dependency.** A canvas-to-PNG library was considered and rejected at
~200KB; this repo has already refused Playwright at ~300MB for the same reason.

## The deadline rule

Derive the age band from the squad name with `src/lib/ageGroup.js`:
U11–U16 → 24 hours **after** kick-off; U18 → 1 hour **before**.

⚠️ **`ageGroup.js` RETURNS NULL FOR AN UNPARSEABLE NAME, AND NULL MUST MEAN
"SHOW NO DEADLINE".** It must never fall through to either rule. That module's
null already caused one real incident: `allowsOwnContact` read it as "a senior
side: adults" and offered a twelve-year-old girls' squad the child's own contact
fields. **The lesson was the null default, not the regex.**

## RLS

Write: `private.can_edit_team` on the event's squad — the coach or manager who
was there. Read: the same, plus `private.is_admin` so Candice sees every sheet.

⚠️ **`can_edit_team` checks membership STATUS as of 10 Aug 2026**, so a pending
staff member cannot file a sheet. That is correct and must not be "simplified".

Harness in `db/tests/`, with an injected fault proving the refusal fires for the
gate being tested and not for something earlier.

## Testing

- The fixture block renders every auto-populated field from a stubbed event.
- 22 slots: a sheet with gaps is still printable; `full_name` survives a
  `player_id` set to null.
- The deadline rule, including **the null case explicitly**.
- The print stylesheet ships — asserted against the **built** stylesheet, as
  `tests/nav-sheen.test.js` and `tests/button-sweep.test.js` do, because
  `@layer components` is tree-shaken and a rule can vanish from the bundle while
  the source still reads correctly.

## Deliberately deferred

- **Auto-filling the squad from the register.** ⚠️ `attendance` has **zero rows**
  — measured 11 Aug 2026 — so building on it now ships a feature that produces
  blank sheets. Same trap as the attendance flags, which are blocked for exactly
  this reason.
- **Tournaments**, per Jay, with league fixtures first.
- **Submitting to RCM from the app.** Submission is a human dropping a file into
  a WhatsApp group; nothing here automates that, and the form's own instructions
  describe it as a manual step.
