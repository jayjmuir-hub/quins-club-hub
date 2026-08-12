# Training session plans — the plan

**STATUS: NOT SHIPPED — TABLED BY JAY, 12 Aug 2026.** Written 12 Aug 2026.
His words: *"table 1 and 2 for now until i bring them back up again"*.

⚠️ **TABLED IS NOT REJECTED, AND IT IS NOT A QUEUE EITHER.** Do not start this,
do not propose starting it, and do not ask again — **Jay reopens it or it stays
closed.** A plan sitting at plain "NOT SHIPPED" reads as work waiting to be
picked up, which is how this repo has already spent a session offering to build
something that was live. The nearest prior instance is the roster import
(`claude/decisions/2026-08-10-no-roster-import.md`): settled, and re-asking a
settled question is its own kind of rot.

⚠️ **What survives the tabling is the copyright finding below.** It is a legal
constraint, not a design preference, so it will still be true whenever this is
reopened — and it is the reason the feature cannot be built the way it was
first described.

⚠️ **Set this line to SHIPPED in the commit that ships it**, not as a promise
about that commit.

**Jay, 12 Aug 2026:** *"integrate training session plans in for all age groups,
the goal would be for the Club Rugby Performance Officer to distribute brief
training session plans per age group in an automated way, scrape the web for the
best rugby training sessions per age group, it needs to be fully customizable by
the CRPO, but easy for him to choose things to include for each session, age
appropriate of course, sessions are 1 hour twice a week"*.

---

## ⚠️ READ THIS FIRST: the scraping requirement, and what to do instead

**"Scrape the web for the best rugby training sessions" cannot be built as
literally described, and the reason is copyright, not capability.**

Rugby coaching sessions are published by World Rugby, the RFU, Rugby Toolbox,
Sportplan and others. They are **someone else's copyrighted material.** Copying
their drills into this app's database and distributing them to fifteen squads'
coaches is republishing that material — the club would be redistributing
commercial coaching content it does not own, under its own branding, to its own
members. That is a real exposure for a real club with a real name on it, and it
is the kind of thing that surfaces years later.

⚠️ **This is a legal constraint, not caution, and it is the one thing in this
plan I would not build around quietly.** Everything else below is a design
choice Jay can overrule; this is not.

**What gets built instead — all three, together, and it reaches the same
outcome:**

| Instead of | Build |
|---|---|
| Copying drills from coaching sites | **Link out.** The library stores a title, a one-line summary the CRPO wrote, and a **URL**. Coaches click through to the source. Attribution intact, nothing republished. |
| Scraping "the best sessions" | **Web search to DISCOVER, never to COPY.** The AI feature returns *candidates with links* for the CRPO to review and add. He curates; the app never ingests page content. |
| Hoping the web has age-appropriate drills | **Generate original sessions from PRINCIPLES.** Age-grade law variations (tag at U6-U8, contact from U9, scrum and lineout laws by band) are **facts, not expression** — they can be encoded and reasoned from. A session plan generated from "45 minutes, U10, contact, focus on tackle technique" is the club's own material. |

⚠️ **The CRPO's OWN sessions are the primary source, and that is not a
consolation prize.** He is the qualified person; the app's job is to make his
material reusable and distributable, not to replace him with a scraper. A drill
he writes once and reuses forty times across the season is the actual win here.

---

## The shape of it

**Three objects, and the middle one is the reusable asset:**

```
  drill        ── the CRPO's library. Reusable. Written or linked, once.
    │
    ▼
  session_template ── an hour, assembled from drills. Reusable per age band.
    │
    ▼
  session      ── a template attached to a real training EVENT on a real date.
```

⚠️ **A SESSION IS ATTACHED TO AN EXISTING `events` ROW, NOT A NEW CALENDAR.**
The club's training already lives in `events` — Tuesday/Thursday repeating
series, with RLS, a calendar feed and a schedule screen already built. A parallel
training calendar would be a second place for "when is training" to be wrong,
and the fortnight strip would disagree with it. **Reuse the fixture.**

## The hour, and why it is the unit

Jay: **1 hour, twice a week.** So a template is **60 minutes** and its blocks
must sum to it.

⚠️ **THE APP SHOULD REFUSE TO SAVE A TEMPLATE THAT DOES NOT ADD UP, AND SAY WHAT
IS WRONG.** "Warm-up 15 + skill 20 + game 30 = 65" is the single most likely
mistake in the whole feature, it is invisible on the page, and a coach discovers
it on a pitch with twenty children waiting. **Show the running total as he
builds** — not a validation error at the end.

⚠️ **60 IS A DEFAULT, NOT A CONSTRAINT.** A festival week or a wet Tuesday is a
40-minute session. Refuse silently-wrong arithmetic; do not refuse a deliberate
50.

## Age-appropriateness — where this app has already been bitten

⚠️ **`src/lib/ageGroup.js` RETURNS NULL FOR AN UNPARSEABLE SQUAD NAME, AND NULL
MUST MEAN "NO AGE-BAND GUIDANCE" — NEVER A DEFAULT BAND.** That module's null
already caused one real incident here: `allowsOwnContact` read it as "a senior
side: adults" and offered a twelve-year-old girls' squad the child's own email
and phone fields. **The lesson was the null default, not the regex.**

Applied here: a drill tagged "contact — U13+" offered to a squad whose band
could not be parsed is **exactly** the same shape of failure, with a worse
outcome than a contact form. **A drill with a minimum age shows only where the
band is KNOWN and sufficient.** Unknown band → the drill is not offered, and the
screen says why rather than showing an empty list.

⚠️ **AND THE LETTER IN A SQUAD NAME IS GENDER, NOT A GRADE.** `U14B Contact` is
U14 **Boys**. `private.squad_expects_gender` parses exactly that suffix. Nothing
here may read a "B" as anything else — the same trap the league-team division
column exists to avoid.

**Contact vs tag is a separate axis from age**, and it is in the squad name
already (`U6 Tag`, `U14B Contact`). A tackle drill must not reach a tag squad.
⚠️ **Derive it from the name and store it on the drill as an explicit
requirement** — do not infer "if U9+ then contact", because the club runs tag
sides above that age.

## Schema

### `public.drills` — the CRPO's library

`id`, `club_id`, `title`, `summary` (his words, ≤ a line or two),
`source_url` (nullable — **the link-out**), `source_name` (e.g. "World Rugby
Passport"), `minutes` (typical), `category` (`warm_up` | `skill` | `game` |
`conditioning` | `cool_down`), `min_age` smallint nullable, `max_age` smallint
nullable, `requires_contact` boolean not null default false,
`is_active` boolean not null default true, `created_by`, `created_at`.

⚠️ **`is_active`, NEVER DELETE** — the same reasoning `pitches` and
`league_teams` record: a template referencing a deleted drill is a session plan
with a hole in it, discovered on the pitch.

⚠️ **`summary` IS THE CRPO'S OWN TEXT AND `source_url` IS THE LINK.** There is
deliberately **no `body` / `full_text` column.** Its absence is the design: a
column to paste a drill's full text into is an invitation to paste somebody
else's, and once it exists somebody will. **Do not add one** without re-reading
§the scraping requirement.

### `public.session_templates` + `public.session_template_blocks`

Template: `id`, `club_id`, `name`, `min_age`/`max_age`, `requires_contact`,
`total_minutes` (derived, stored for the list view), `notes`, `is_active`.
Blocks: `template_id`, `position` smallint, `drill_id` (FK **on delete
restrict** — see below), `minutes` smallint, `coach_note` text.

⚠️ **`on delete restrict`, NOT `set null`** — and this is the one place in this
schema that should differ from `events.league_team_id`. A fixture that loses its
league team still has a date, a venue and two teams: the label is recoverable. A
session block that loses its drill is a fifteen-minute hole in an hour. Retiring
via `is_active` is the supported route, and the constraint is what makes that
true rather than merely recommended.

### `public.training_sessions` — a template on a real date

`event_id` uuid not null **UNIQUE** (FK `events` on delete cascade),
`template_id` (on delete set null — the plan survives its template being
retired), `published_at`, `notes`.

⚠️ **UNIQUE on `event_id`**, the reasoning `match_sheets` and `pitch_requests`
both record: a second plan for one session is the same one filed twice.

## Distribution — "in an automated way"

**The CRPO publishes a template to an age group; every training event in that
squad's window gets it.** Two rules make that safe:

⚠️ **PUBLISHING IS EXPLICIT AND PER-SQUAD.** Not "apply to all fifteen" behind
one button — the blast radius is every coach's plan for a term. The multi-squad
`group_id` fan-out is already deferred in this app for exactly this reason.

⚠️ **PUBLISHING NEVER OVERWRITES A COACH'S EDIT.** A coach who has adjusted
Thursday's session keeps it; the publish skips that one and **says how many it
skipped**. Silently replacing a coach's own plan is how a tool stops being
trusted after one incident.

⚠️ **NOTIFICATION IS THE THIRD INSTANCE OF A PATTERN ALREADY BUILT TWICE** —
trigger → edge function → Resend (`notify-approval`, `notify-pitch-request`). It
reuses `approval_notify_secret`; a new `*_notify_url` vault entry should be
DERIVED from `approval_notify_url` in SQL so the host cannot drift.
⚠️ **The failure is quiet** — both existing triggers swallow errors into a
`raise warning` nobody reads. Survivable only because **the plan is in the app**:
the email is a prompt to go and look, never the record.

## Where the AI fits — and where it does not

Builds on `claude/plans/2026-08-12-ai-integration.md`; the ruling and the field
allowlist there govern this too.

⚠️ **NO CHILDREN'S DATA IS INVOLVED IN THIS FEATURE AT ALL, AND THAT IS WORTH
STATING.** A session plan is drills, minutes and an age band. **No player names,
no photos, no contacts.** It is the *safest* possible first AI feature on that
axis — which is an argument for shipping it early, not for relaxing anything.

| AI does | AI does not |
|---|---|
| **Assemble** a 60-minute template from the CRPO's library, given band, contact/tag and a focus | Invent drills the library does not have |
| **Discover** candidate sessions via web search and return **titles + links** for review | Copy page content into the database |
| **Draft** a coach note for a block | Publish anything |

⚠️ **EVERY AI OUTPUT IS A DRAFT THE CRPO SAVES.** He is the qualified person and
the app must keep him in that position — an app that published a training
session to fifteen squads without him reading it has substituted a language
model for a coaching qualification.

## Screens

**`/admin/training`** — behind a **new** admin right, `training`.
⚠️ **`ADMIN_RIGHTS` in `src/lib/scope.js` is the ONLY vocabulary there is** —
the database deliberately has no check constraint on these values, so an
unrecognised right matches no dashboard and is silently inert. Adding `training`
means adding it there, and `adminRightLabel` needs "Rugby Performance Officer".
⚠️ **A right gates the SCREEN, not the data** — it is a "not your job" message
and must never be described as a security boundary.

Three tabs: **Library** (drills), **Templates** (the hour builder, with the
running total), **Publish** (pick squad + date range, see what will change,
confirm).

**Coaches** see the plan on the training event's detail sheet — the same place
the register and the match sheet live.

## Testing

- ⚠️ **The unparseable-band case explicitly**, asserting no drill is offered —
  the `ageGroup.js` null lesson, in the place it would next recur.
- A tag squad is offered no `requires_contact` drill.
- Blocks summing to 65 are refused with the arithmetic shown; a deliberate 50 is
  accepted.
- Publishing skips a coach-edited session and reports the count.
- ⚠️ **A drill in use cannot be deleted** — proved against the constraint, with
  an injected fault, per rule 6.

## Open questions for Jay

1. **Who is the CRPO, and do they have an account?** ⚠️ Measured 12 Aug: the
   only active admins are Jacques Reyneke and Jay's two accounts. Like Candice,
   this person may not exist in the system yet — in which case the screen is
   titled by the job, as the youth dashboard now is.
2. **Twice a week — same plan both nights, or a pair?** The schema supports
   either; the publish screen differs. A Tuesday/Thursday *pair* is the more
   likely real answer and is slightly more work.
3. **Is linking out actually acceptable to him**, or does he want the club to
   build its own library from scratch over a season? Both are supported; the
   second is slower to start and owns its material outright.
