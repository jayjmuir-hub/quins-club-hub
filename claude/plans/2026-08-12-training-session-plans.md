# Training session plans — the plan

**STATUS: NOT SHIPPED — REOPENED BY JAY, 20 Aug 2026.** Written 12 Aug 2026,
tabled the same day (*"table 1 and 2 for now until i bring them back up again"*),
reopened eight days later: *"i want to create another admin position named Rugby
Performance Director, and then i want to create a system where that person can
develop training plans, focus points, structure for sessions, etc to pass down to
any of the age groups he selects"*.

✅ **THE TABLING WORKED EXACTLY AS DESIGNED AND IS WORTH NOTING BEFORE IT IS
FORGOTTEN.** Nobody offered to build this for eight days, and when it came back
it came back from Jay. The rule that produced that — *he reopens it or it stays
closed* — is what `claude/state-of-play.md`'s tabled list is for, and this plan
is the evidence it earns its keep.

⚠️ **Set this line to SHIPPED in the commit that ships it**, not as a promise
about that commit.

**Jay, 12 Aug 2026:** *"integrate training session plans in for all age groups,
the goal would be for the Club Rugby Performance Officer to distribute brief
training session plans per age group in an automated way, scrape the web for the
best rugby training sessions per age group, it needs to be fully customizable by
the CRPO, but easy for him to choose things to include for each session, age
appropriate of course, sessions are 1 hour twice a week"*.

---

## ⚠️ What the 20 August reopening changed

Four things. The first is a measurement that makes part of the plan below wrong.

### 1. ⛔ CONTACT VERSUS TAG IS **NOT** IN THE SQUAD NAMES. The plan below says it is.

Under "Age-appropriateness" this plan states the axis "is in the squad name
already (`U6 Tag`, `U14B Contact`)". **Measured against the live `teams` table
on 20 Aug 2026, that is false**, and `U14B Contact` does not exist — the squad is
called `U14B`:

| Names carrying it | Names that do not |
|---|---|
| `U6 Tag`, `U7 Tag`, `U8 Tag` | `U9`–`U13 Mixed`, `U12G QR`, `U14G QR` |
| | `U14B`, `U16B`, `U16G`, `U18B`, `U18G` |

Five squads say nothing either way. **So `requires_contact` must be an explicit
column on `teams`**, set once on `/admin/staff`, and NOT parsed from the name.
⚠️ **Deriving it from the age band is specifically forbidden** — this club runs
tag sides above the age contact begins, which is the exact case that breaks the
inference. Same shape as the `ageGroup.js` null lesson: a plausible default is
worse than no answer.
✅ **The AGE band is fine** — all fifteen squad names parse under
`YOUTH_NAME` in `src/lib/ageGroup.js`, checked the same day.

### 2. A fourth object: **focus**

Jay's *"focus points"* are not a note on one session. A focus is a **theme
spanning a block of weeks for a squad** — "weeks 1–4: tackle technique" — and it
is what makes a term read as a plan rather than eight unrelated hours.

`public.training_focus`: `id`, `club_id`, `team_id`, `title`, `starts_on`,
`ends_on`, `notes`, `created_by`. It carries **no drills and no permissions**;
it labels a period, shows on the coach's session view, and gives the assemble
step something to aim at.

⚠️ **It must not gate anything.** Same rule as `memberships.title`: a label
grants nothing. A session outside every focus window is perfectly valid.

### 3. Multi-squad publish — **this overturns a rule below**

The distribution section says publishing is *"EXPLICIT AND PER-SQUAD. Not 'apply
to all fifteen' behind one button"*. Jay's reopening says **"to any of the age
groups he selects"**, which is the opposite, and he is right.

⚠️ **The original worry was blast radius, and the answer is visibility, not
prohibition.** Multi-select is allowed **only** with a preview that shows, per
squad, how many sessions change and how many are skipped, before anything is
written. The 20 Aug sign-up screen already established multi-select as the
club's pattern (`678ee8c`).
⚠️ **The two protections below are UNCHANGED and are what make this safe:** a
coach-edited session is never overwritten, and the publish reports how many it
skipped.

### 4. The job is the **Rugby Performance Director**, and the right is `training`

⚠️ **THIS SITS AWKWARDLY WITH THE 12 Aug "JOBS NOT PEOPLE" RULING AND JAY CHOSE
IT ANYWAY** — the same way he chose "Social Media Management" over "Social Media
Manager". That ruling replaced person-shaped titles with function-shaped ones;
"Director" is person-shaped. It was put to him on 20 Aug and his wording stands.
`claude/decisions/2026-08-12-jobs-not-people.md` is not overturned — the other
three labels do not move.

**Answered on 20 Aug, so they are no longer open questions:**

- **Tuesday and Thursday may differ.** Publish assigns per weekday, so a
  Tue/Thu pair is expressible and identical nights are the easy case.
- **Nobody holds the job in the app yet**, so the screen is titled by the job —
  as `YouthDashboard.jsx` already is.
- **Linking out is accepted**, as one option among several. A drill may be
  written out in full, linked to its source, or both.

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

**Contact vs tag is a separate axis from age.** A tackle drill must not reach a
tag squad.
⛔ **THIS PARAGRAPH SAID THE AXIS WAS "IN THE SQUAD NAME ALREADY (`U6 Tag`,
`U14B Contact`)". IT IS NOT, AND `U14B Contact` DOES NOT EXIST.** Measured
20 Aug 2026: three squad names carry "Tag", two carry "QR", and five say nothing
at all. See §What the 20 August reopening changed. **`requires_contact` is an
explicit column on `teams`.**
⚠️ **Do not infer "if U9+ then contact"** — the club runs tag sides above that
age, which is precisely why the name cannot be trusted and the flag is needed.

## Schema

### `public.drills` — the CRPO's library

`id`, `club_id`, `title`, `summary` (a line or two, for the list view),
`body` (nullable — **the drill written out in full**), `source_url` (nullable),
`source_name` (nullable), `minutes` (typical), `category` (`warm_up` | `skill` |
`game` | `conditioning` | `cool_down`), `min_age` smallint nullable, `max_age`
smallint nullable, `requires_contact` boolean not null default false,
`is_active` boolean not null default true, `created_by`, `created_at`.

⚠️ **`is_active`, NEVER DELETE** — the same reasoning `pitches` and
`league_teams` record: a template referencing a deleted drill is a session plan
with a hole in it, discovered on the pitch.

✅ **`body` EXISTS, AND ITS ABSENCE USED TO BE ARGUED FOR AT LENGTH.** This plan
withheld it as a copyright guard until 21 Aug 2026. Jay removed that: *"its not a
problem at all … its a solution looking for a problem"*, and he is right — the
guard was written against the original *"scrape the web"* brief, which is no
longer being asked for, so it was defending against nothing while stopping the
Director writing a drill out properly in his own tool.
`claude/decisions/2026-08-21-drill-body-is-just-a-text-field.md`.

⚠️ **`summary` IS STILL SEPARATE FROM `body`** — for layout, not for policy. The
list view needs one line; the coach on the touchline wants the whole thing.
`source_url` stays because linking to where a drill came from is useful, not
because anything requires it.

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
| **Discover** candidate sessions via web search and return **titles + links** for review | Publish anything without him reading it |
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
is therefore **two lines and no migration**: the array entry, and
`adminRightLabel` → **"Rugby Performance Director"** (Jay's wording, 20 Aug).
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

⚠️ **THE THREE BELOW WERE ANSWERED ON 20 Aug 2026** — see §What the 20 August
reopening changed. They are kept because the reasoning under each is still the
reasoning, and a question deleted is a question somebody asks again.

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
