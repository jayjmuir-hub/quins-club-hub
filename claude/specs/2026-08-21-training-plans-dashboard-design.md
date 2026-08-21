# Rugby Performance Director dashboard — design

**STATUS: APPROVED BY JAY, 21 Aug 2026. NOT YET SHIPPED.** The spec for the
first build of `claude/plans/2026-08-12-training-session-plans.md`. That plan
holds the reasoning; this file holds what is being built now, and what is not.

## Scope — pieces 1–3 of five

Jay chose option A on 21 Aug: foundation, Library + Templates, Publish + coach
view. **Out of scope, each to get its own spec later:**

- **Notification email** (trigger → edge function → Resend). Useless until there
  is something to notify about.
- **AI assist** (assemble, discover, draft). Depends on
  `claude/plans/2026-08-12-ai-integration.md`'s infrastructure and would double
  the review surface.
- **A "first and second session of the week" pair.** One template per publish.
  A pair is two publishes with a different template and window. The schema
  does not need to change to add it later.

## 1. Schema — one migration

`db/migrations/20260821_training_plans.sql`, represented in `db/schema/`.

- **`teams.requires_contact boolean not null default false`**, set on
  `/admin/club` — the squad list with the scoring panel, NOT `/admin/staff`,
  which this line said until 21 Aug 2026. Default
  false means every squad starts as TAG until somebody says otherwise — the safe
  direction, because a tackle drill cannot reach a squad by accident. ⛔ Never
  parsed from `teams.name`, never inferred from age (plan §1).
- **`drills`**, **`session_templates`**, **`session_template_blocks`**,
  **`training_focus`** exactly as the plan's Schema section: `is_active` and
  never delete; blocks FK to drills `on delete restrict`; `total_minutes`
  stored on the template for the list view.
- **`training_sessions`**: `event_id` UNIQUE, FK events on delete cascade;
  `template_id` on delete set null; `published_at`; `notes`; and
  **`coach_edited_at timestamptz null`** — the column the plan implies but does
  not name. It is how "publish never overwrites a coach's edit" is decided: a
  coach saving the session sets it, publish skips any row where it is set, and
  publish never writes it.
- **Session content is COPIED, not referenced.** `training_session_blocks`
  (`session_id`, `position`, `drill_id` on delete restrict, `minutes`,
  `coach_note`) is written from the template at publish time. Otherwise a coach
  adjusting one night's minutes would be editing the template for fifteen
  squads. The template is the mould; the session is the casting.

**RLS.** Drills, templates, blocks, focus — read: `auth.uid() is not null`
(same as `teams`); manage: `private.is_admin(club_id)`, which IS status-aware
(checked 21 Aug against `db/schema/functions.sql`, despite an older comment in
`policies.sql` saying otherwise). `training_sessions` and its blocks — read:
`private.is_attached_to_team` via the event, so a parent can see tonight's
plan (there is no children's data in it); write: `private.can_edit_team` via
the event, the match-sheet pattern.

**Publish is one SQL function**,
`public.publish_training(_template uuid, _teams uuid[], _from date, _to date, _preview boolean)`,
SECURITY DEFINER, refusing unless `private.is_admin(club)`. It returns one row
per squad: `team_id`, `will_write`, `skipped_coach_edited`, `no_events`. With
`_preview = true` it writes nothing. **One code path for both**, so the preview
cannot disagree with what then happens. It selects `events` where
`type = 'training'`, `team_id = any(_teams)`, and the date falls in the range —
⛔ no weekday anywhere (plan §4). An existing unedited session is replaced; an
edited one is counted and left alone.

## 2. The admin right

`training` appended to `ADMIN_RIGHTS` in `src/lib/scope.js`; label
**"Rugby Performance Director"**. Route `/admin/training` with the same
"not your job" guard the youth and social tabs use. No migration. A right
gates the screen, never the data.

## 3. The screen — `/admin/training`, three tabs

- **Library.** Drill list with filters (category, age band, contact/tag).
  Add/edit form with `summary` (one line) and `body` (full text), source name
  and URL, minutes, category, min/max age, requires-contact. **Retire, never
  Delete.**
- **Templates.** List, then a builder: ordered blocks, each a drill picker and a
  minutes field, with a **running total always visible** and 60 marked as the
  target. Saving with a total other than 60 asks "This is 50 minutes — save
  anyway?" — it refuses nothing deliberate and catches the accidental 65. The
  template's own age band and contact flag are set on the template; the drill
  picker only offers drills that fit them.
- **Publish.** Template → multi-select squads → date range → preview table
  (squad / will write / skipped as coach-edited / no training events) →
  Confirm. A squad whose age band cannot be parsed (`ageGroup.js` returns
  null), or whose `requires_contact` does not match the template, is **shown
  disabled with the reason written beside it** — never silently filtered. A
  contact template to a tag squad is refused here; a tag template to a contact
  squad is allowed (a tag session is always safe).
- **Focus.** A small section on the Publish tab: title, squad, dates, notes.
  A label on the coach's view, gating nothing.

## 4. The coach side

`src/screens/EventDetail.jsx` for a training event gains a **Session plan**
card: the current focus if one covers the date, then blocks in order with
minutes, drill summary, the full body on tap, and the source link. A person
with edit rights on the squad can reorder, change minutes, swap a drill or add
a note; saving stamps `coach_edited_at`. The card says "Edited by the coach"
when that is set, so the Director knows why a publish skipped it.

## 5. Testing

- **Vitest**: running total; the 65 refusal and the deliberate 50 acceptance;
  unparseable band → disabled with reason; tag squad offered a contact
  template → disabled with reason; publish preview rows rendered as written.
- **`db/tests/` harness, rolled back** (`claude/runbooks/db-harnesses.md`):
  deleting a drill in use is refused by the constraint (fault-injected);
  a second session on one event is refused by the UNIQUE; publish skips a row
  with `coach_edited_at` set and reports `skipped_coach_edited = 1`; preview
  writes nothing.

## Arguments against, kept

- *"Copying blocks into the session duplicates data."* Yes — deliberately. The
  alternative makes a coach's one-night tweak a club-wide edit.
- *"Why not one `publish` per squad, as the 12 Aug plan said?"* Jay overturned
  it on 20 Aug; the preview is what makes multi-squad safe.
- *"Default `requires_contact` to true for U9+."* Forbidden — the club runs tag
  sides above that age. False is the direction that fails safe.
- *"Saving a template is not atomic."* Correct, and accepted. `saveTemplate`
  then `saveSessionBlocks` is a delete-then-insert across two round trips, so
  an insert that fails after the delete leaves the template with ZERO blocks
  rather than its old ones. The blast radius is one template, or one night's
  session for the same shape in `SessionPlan` — and the screen that just did
  it is still open with every block on it, so a rebuild is retyping nothing.
  An RPC that did both inside one transaction would close it properly; it is
  a third function to write, grant, revoke and harness against a failure mode
  nobody has hit, and it is not worth it yet. ⚠️ **The moment blocks are ever
  written by anything OTHER than a person watching the screen, this stops
  being true and the RPC becomes the answer.**
