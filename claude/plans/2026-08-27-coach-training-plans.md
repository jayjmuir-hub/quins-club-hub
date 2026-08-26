# Coach training plans

**Status: SHIPPED 27 Aug 2026.** Jay, overnight: "coaches need the ability to
create their own training plans for sessions, they could create their own
drills and templates or they could just customize a session freestyle, they
could publish it to the squad or only to the other staff in their age group,
they could choose the performance directors plan or select to create their
own." One PR, whole feature, applied and verified live.

Builds on the Rugby Performance Director's training-plans work
(`claude/plans/2026-08-21-training-plans-implementation.md`), which was
admin-only: one club-wide drill library, club templates, and a publish that
pushed a template across a squad's sessions.

## The four rulings (AskUserQuestion, 27 Aug)

1. **Coach drills/templates are squad-private, with submit-to-club.** A
   coach's drill or template belongs to their age group and is not in another
   squad's picker. They may *suggest* it to the club library; the Rugby
   Performance Director approves it in (which clears its squad ownership) or
   dismisses it (it stays squad-private). The Director's library stays the
   one club-wide set.
2. **Session visibility is draft → staff → squad, per session, default
   staff** for a coach-built session. draft = the author only; staff =
   coaches/managers of that squad; squad = the whole squad and families. The
   Director's publish keeps writing 'squad' (families see it, unchanged).
3. **One PR, whole feature.**
4. (Implicit, from the request) a coach chooses the Director's published plan
   *or* builds their own — freestyle or seeded from a template.

## Schema — `db/migrations/20260827_coach_training_plans.sql`

- `drills.team_id` (NULL = club library; set = squad-owned) and
  `drills.submitted_at` (a coach's suggestion to the club library).
- `session_templates.team_id`, `session_templates.submitted_at` — same.
- `training_sessions.visibility` (`draft`/`staff`/`squad`, **default
  `squad`** so every existing row and every Director publish is unchanged)
  and `training_sessions.created_by` (the author, for draft ownership).

**RLS.** drills/templates/template-blocks *reads* stay open to any signed-in
member — a drill holds no personal data (it is exercise text and minutes),
and a squad-owned drill appears inside a family-visible session plan, so its
row must be readable. "Private" here is a picker-scoping concern, enforced in
`listDrills`/`listTemplates`, not a data boundary. *Manage* widens from
`is_admin(club_id)` to also allow `team_id is not null AND
can_edit_team(team_id)` — a coach manages their squad's own rows; only the
Director (is_admin) can null a team_id, i.e. approve a suggestion.

`training_sessions` read/manage (and its blocks) become visibility-aware:
squad→`is_attached_to_team`, staff→`can_edit_team`, draft→author only; manage
always requires `can_edit_team` and, for a draft, authorship. `publish_training`
is SECURITY DEFINER owned by postgres so it bypasses RLS and needs no change;
its inserts default to `squad`/`created_by null`, exactly the Director's plan.

## Client

- `src/data/trainingPlans.js`: `listDrills`/`listTemplates` gain a `teamId`
  scope (club + that squad); `submit*`/`approve*`/`dismiss*Suggestion`;
  `createSession` (author + visibility + coach_edited_at, so a later Director
  publish skips it); `setSessionVisibility`.
- `src/components/SessionPlan.jsx`: when a coach opens a training event with no
  plan, a builder — seed from a club/own template or freestyle, add drills
  from the club + own-squad library, create a squad-owned drill inline, pick a
  visibility, save. When a plan exists: the visibility control and "save this
  running order as my template".
- `src/screens/TrainingLibrary.jsx` / `TrainingTemplates.jsx`: a "Suggested by
  coaches" section for the Director to approve or dismiss.

## What is NOT in scope (named so nobody thinks it was missed)

A standalone coach "my drill library" screen — coach drill/template creation
is inline in the session builder, which is where a coach actually works.
Notification of the Director when something is suggested (the suggestions sit
on their existing screens). Both are follow-ups if asked.
