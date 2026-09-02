# Training: the director's session becomes a suggestion, and age becomes guidance

**Status: NOT SHIPPED — spec only, no code written.** Dated 2026-09-02.

Two changes to the training builder, both from one coach's feedback relayed
by Jay on 2 Sep 2026, and both about the same thing: the club's training
programme is guidance to a coach, not an instruction. They are specified
together because the second is what makes the first honest — a coach who
"accepts and adjusts" a suggested session cannot adjust it if the drill
picker hides half the library from them.

## What Jay asked for

Jay, 2 Sep 2026: *"a coach suggested that the performance director's
sessions sent out should be simply noted as a suggestion and the coach
could accept or decline, if accepted then they would still have the
ability to adjust that session."* And: *"he suggested that drills,
templates, etc should not be age group locked, which would also be fine."*

## Part 1 — publish writes a suggestion, never the plan

### How it works today

`publish_training` (`db/migrations/20260821_publish_training_fit_check.sql`)
takes a template, a set of squads and a date range, and for every training
event in the range **writes the template's blocks straight into
`training_sessions` / `training_session_blocks`**. The only guard is
`training_sessions.coach_edited_at`: a session a coach has saved is skipped
and reported back as "kept". Everything else — including a session the
coach simply had not got to yet — becomes the director's plan with nothing
on screen to say it was not the coach's own. That is the behaviour the
coach objected to.

What already exists and is reused below: `template_id` and `published_at`
on the session, the `coach_edited_at` stamp (set by `createSession` and
`saveSessionBlocks` in `src/data/trainingPlans.js`), `visibility`
(`draft` / `staff` / `squad`, migration `20260827_coach_training_plans.sql`),
and the preview-then-publish screen `src/screens/TrainingPublish.jsx` with
its per-squad counts.

### The rule

**Publish never touches a coach's session.** It records what the director
would like the squad to run; the coach decides whether it becomes the plan.

### Shape: a suggestion is its own row, beside the session

A new table, sketched:

```sql
create table public.training_suggestions (
  id            uuid primary key default gen_random_uuid(),
  event_id      uuid not null references public.events(id) on delete cascade,
  template_id   uuid not null references public.session_templates(id) on delete cascade,
  suggested_by  uuid not null references public.profiles(id),
  suggested_at  timestamptz not null default now(),
  status        text not null default 'pending'
                  check (status in ('pending','accepted','declined')),
  decided_by    uuid references public.profiles(id),
  decided_at    timestamptz,
  decline_note  text,
  unique (event_id)   -- one live suggestion per session; a re-publish replaces it
);
```

Blocks are **not** copied into the suggestion. The suggestion points at the
template, and the template's blocks are what the coach sees and what accept
copies. (A director who edits the template after publishing changes what a
pending suggestion shows, which is the honest reading — it is *their*
suggestion until it is accepted. Once accepted the copy is the coach's and
template edits no longer reach it.)

Considered and not chosen: a `status` column on `training_sessions` itself.
Cheaper, but the suggestion then occupies the plan slot and an un-edited
existing plan is still clobbered — which is the exact complaint. Two rows
means nothing the coach has is ever overwritten, and a second publish has
somewhere to go.

### `publish_training` after the change

Same signature and preview switch, same fit check on contact (see Part 2
for age). Per event in range:

- No suggestion row → insert one, `pending`.
- A `pending` suggestion for a different template → replace it (the
  director changed their mind; there is only one thing to answer).
- An `accepted` suggestion → insert a fresh `pending` one **only if the
  template differs**; the coach sees "the director has updated this plan".
  Same template again is a no-op.
- A `declined` suggestion → same as accepted: a different template asks
  again, the same one does not nag.

It **never** inserts into `training_sessions` or its blocks, and the
`coach_edited_at` skip goes — it was an overwrite guard, and there is no
overwrite. The return row becomes
`(team_id, suggested int, already_answered int, no_events int)`; the screen
sentence becomes "Suggested to 3 squads — 14 sessions". `describePublishRow`
in `src/lib/trainingPlans.js` and its tests follow.

### The coach's side

**Session sheet** (`src/components/SessionPlan.jsx`). Above the plan, for
anyone who `canEdit`, a card: *"Suggested by the performance director —
Contact & conditioning, 60 min"*, the running order, and two buttons.

- **Accept** copies the template's blocks into the session (creating it if
  there is none — `createSession` already does this from a template and
  stamps `coach_edited_at`), marks the suggestion `accepted`, and drops the
  coach straight into the existing block editor. That is the "adjust after
  accepting" the coach asked for, and it costs nothing extra: an accepted
  session IS a coach's session.
- If the coach already has a plan, the button reads **Replace my plan** and
  asks once — the same confirm the shelf chip uses today via
  `chipNeedsConfirm`.
- **Decline** marks it `declined` and offers an optional one-line note. The
  card collapses to a single grey line ("Declined — 2 Sep") so the coach
  can change their mind; a director's re-publish with a different template
  reopens it.
- `visibility` is unaffected. A pending suggestion is readable by staff of
  the squad only (RLS: `private.can_edit_team` on the event's team, plus the
  club's admins). Parents and players never see a suggestion, and never see
  an accepted one until the coach shares the session as they do today.

**Training shelf** (`src/components/TrainingShelf.jsx`). A chip at the top
when the squad has pending suggestions: *"2 suggestions from the director"*,
opening a list of the sessions with **Accept all** and per-session
**Accept** / **Decline**. A fortnight's publish is many sessions and one tap
for the lot beats six.

**Push.** On publish, one notification to each squad's coaching staff:
*"U14 Blue — the performance director has suggested sessions for 3 Sep to
17 Sep"*, deep-linked to the shelf. Same pattern as
`db/migrations/20260811_pitch_request_notify.sql` — a trigger posts to an
edge function, every failure swallowed, the row is the record.

### Rules settled here

- **Nothing happens by default.** A suggestion the coach never answers
  leaves the session with no plan. It is never promoted at kick-off. Once
  the event has passed, a pending suggestion is simply not shown (filter by
  event date; no job, no deletion).
- **Parents never see a suggestion**, pending or otherwise.
- **The director gets uptake, not a write count.** A section on
  `TrainingPublish` (or the squad-training screen) per squad: accepted,
  accepted-then-adjusted (accepted AND `coach_edited_at` later than
  `decided_at`), declined with notes, unanswered. That is the honest
  measure of whether the programme is landing.
- **Out of scope for the first cut:** a diff between the director's
  running order and what the coach changed it to. Ask the coach whether
  they want it before building it.

### Migration and rollout

1. New table + RLS + grants (`db/schema/grants.sql`). Prove with a
   rolled-back harness under `db/tests/`.
2. Rewrite `publish_training`. Existing sessions and blocks are untouched;
   nothing to backfill. Sessions written by the OLD publish keep
   `coach_edited_at = null` and `template_id` set — they stay as they are,
   readable as before, and the new code treats "session with no
   coach_edited_at" as an ordinary plan.
3. Data layer, screens, tests. Deploy the app **before** the migration is
   applied, or gate on the RPC's new return shape — the screen reads
   `will_write` today and would show "0 squads" against the new function.

## Part 2 — age becomes guidance, contact stays a gate

### How it works today

`squadFitsTemplate` and `drillFitsTemplate` (`src/lib/trainingPlans.js`)
each check two things, in order: **contact** (a contact template or drill
never reaches a tag squad, read from `teams.requires_contact`) and then
**age** (`min_age` / `max_age` against the band parsed from the squad's
name). A failure on either is a refusal, and the refusal bites in five
places:

| Where | What happens today |
|---|---|
| `TrainingPublish` squad list | squad disabled, reason shown |
| `SessionPlan` drill and template pickers | rows outside the band are omitted (`shelfRowsForSquad`) |
| `TrainingShelf` chips | `onChip` ignores the tap (`chipFit`) |
| `TrainingTemplates` builder | a drill outside the template's band is refused |
| `LibraryBrowse` | hidden unless the "All ages" toggle is on |

And the null-band rule: a squad whose name yields no band ("Senior Men")
is refused by **anything that sets an age at all**. Senior coaches have a
thinner library than juniors for no reason but a regex.

### The rule

**Contact is safeguarding and stays a hard gate everywhere, unchanged.**
The `publish_training` server-side check (`not tpl.requires_contact or
t.requires_contact`) stays; the refusal wording stays. A reviewer reading
this plan should not mistake the age loosening for a contact loosening —
the comment on `squadFitsTemplate` records the twelve-year-old girls' squad
that was once offered an adult contact form, and that lesson is kept.

**Age is a label.** `min_age` / `max_age` stay on drills and templates as
information the club is giving the coach. They stop deciding anything.

### The change, per place

- `squadFitsTemplate` / `drillFitsTemplate` return a third state:
  `{ ok: true, reason: null, outsideBand: 'U11 is below this drill's U13+' }`.
  `ok` is only ever false for contact. Every caller that read `ok` keeps
  working; callers that want the nudge read `outsideBand`.
- **Pickers and shelf:** show everything (contact permitting). Sort
  in-band first, outside-band after with the band chip greyed. The
  `allAges` toggle in `LibraryBrowse` becomes the only behaviour and is
  removed with its tests.
- **Publish:** every squad in the club is tickable. An outside-band squad
  carries a soft note beside it, and the preview line says *"2 squads
  outside this template's band"* so the director chooses it knowingly. The
  server fit check drops its age half (it never had one — the SQL only
  checks contact; the age refusal was client-only).
- **Template builder:** a drill outside the template's band is added with
  the same soft note, not refused.
- **Null band** stops being a refusal. A squad with no parseable band is
  simply never "outside" anything.
- **No nudge to the director** when a coach uses an outside-band drill. The
  band is the club's guidance; treating it as guidance means trusting the
  coach with it.

### Tests

`tests/training-plans-lib.test.js` carries the fit rules and is where the
behaviour change is pinned: every contact case unchanged, every age case
flipped to `ok: true` with `outsideBand` set, the null-band cases to
`ok: true`. Screen tests (`training-shelf`, `session-plan`,
`training-publish`, `training-templates`) follow the table above.

## Order of work

Part 2 first: it is small, self-contained, no migration, and it is what
makes Part 1's "adjust freely" true on the day Part 1 lands. Then Part 1 in
two pull requests — schema and RPC with its harness, then the screens.
