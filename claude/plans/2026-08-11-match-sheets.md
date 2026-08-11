# RCM match result sheets — Project 2 of 2

**STATUS: NOT SHIPPED.** Design agreed with Jay on 11 Aug 2026. **Depends on
`2026-08-11-league-teams-and-fixtures.md`** — the form's `TEAM:` field reads a
league team, which does not exist until Project 1 ships.

⚠️ **Write the status as SHIPPED in the same commit that ships it**, not as a
promise about that commit.

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
