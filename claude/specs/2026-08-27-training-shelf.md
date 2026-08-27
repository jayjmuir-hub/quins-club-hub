# Training shelf — Squad Training

**STATUS: building.** 27 Aug 2026. Direction mockups (not pixel-perfect): the
squad Tuesday screen (focus chips, tonight's hour, From coaches, library) and
Library browse (Drills | Hours, category chips, likes, add-to-tonight).

Jay: **shelf first.** Do not seed World Rugby packs in this work. Empty library
is fine. Tests use invented fixtures only. AI assist stays tabled — this
surface does not assemble hours with an LLM and does not leave a hook that
looks like one.

## Home

The shelf lives on **Squad Training** (`/squad/:teamId/training`,
`src/screens/SquadTraining.jsx`). It does not add a fourth `/admin/training`
tab. `/admin/training` Library, Templates and Publish stay as they are.
`publish_training` stays admin-only. `SessionPlan` stays the one renderer of a
night's blocks (EventDetail and the session sheet).

Gating is the same as Squad Training: `canEditTeam`. The `training` right
remains a message, not a boundary. RLS is the insert rule.

## Three paths, this order, on the squad the coach is holding

1. **Tap a focus chip** (a `session_templates` row whose `chip_label` is set:
   Tackle, Passing, Ruck, Attack, Defence, …) to apply that template to
   **tonight's** training event: copy blocks in stored order, write
   `template_id`, stamp `coach_edited_at`. Reuse `createSession` /
   `saveSessionBlocks`. Do **not** call `publish_training`.
   **One chip per `chip_label`.** Group the club hours by label, then pick the
   template `squadFitsTemplate` accepts for this squad. If several fit, pick
   the tightest age band. If none fit, show **one** disabled chip with the
   reason — contact mismatch (Publish-tab sentence), or "No hour for this age".
   Never dump every age pack onto the row. The "never hidden" rule is for
   **contact vs tag** (Tackle on U12G QR / U14G QR stays visible, disabled),
   not for U9 / U11 / U16 copies of Passing. U12G QR / U14G QR are tag
   (`teams.requires_contact`); a contact Tackle hour reaching them **enabled**
   is a bug. Age from the squad **name**; contact from the column — never
   inferred from the name.
2. **Pick drills from the library** — the existing SessionPlan picker, reached
   from tonight's card, plus Library browse on this same surface.
3. **Run what the Director published** — the upcoming-session list already on
   Squad Training, unchanged.

If tonight already has coach edits, applying a chip asks **“Replace your edits
with the Tackle hour?”** (inline `alertdialog`, never `confirm()`), then
replaces and keeps `coach_edited_at`. Cancel leaves the blocks untouched.

## Library browse

On the same squad training surface (a sheet): Drills | Hours; category chips
`warm_up` / `skill` / `game` / `conditioning` / `cool_down`; **By coach**
(`created_by` → `profiles.full_name`; null `created_by` buckets **“Club /
World Rugby”**); featured row (`is_featured`); **Used this week** (count of
distinct training events in the last 7 Asia/Dubai days via
`training_session_blocks` / `training_sessions.template_id` — a number, not a
star average); **My shelf** (personal favorites).

- Heart = like (toggle, count visible).
- Star = favorite (personal, not a public count).
- No 1–5 star ratings.
- Coach names (adults) are OK on cards.
- **No player names and no player photos** on drill cards. No FaceStack, no
  avatar, no `img` of a person.
- **Default to this squad.** Browse (and the shelf list) shows drills that
  `squadFitsTemplate` accepts for the squad being held — age from the name,
  contact from `teams.requires_contact`. A **Show all ages** control reveals
  the other packs. Do not list the U9 and U11 copies of a drill next to the
  U16 one unless the coach asked.

## Who can publish (two verbs)

- **Publish onto calendars** = existing `publish_training`, admin only.
  Unchanged. A coach cannot call it.
- **Publish an hour club-wide** = any squad staff (`can_edit_team` on at least
  one team of that club) may INSERT a `session_templates` row into the club
  library (`team_id` null), `created_by = auth.uid()`. They cannot feature.
  They can edit/retire their own rows; the Director can edit/retire anyone's.
  Nobody deletes.

Squad-owned drills/templates (the 27 Aug coach-plans path) are unchanged: a
coach still cannot INSERT a club **drill** (`team_id` null). That proof stays.

## Schema — one migration

`db/migrations/20260827_training_shelf.sql`.

- `drills.slug` and `session_templates.slug` text, unique with `club_id`
  (NULL slug allowed; uniqueness is on the values that exist).
- `session_templates.chip_label` text null (when set, the shelf draws a chip).
- `drills.is_featured` and `session_templates.is_featured` boolean not null
  default false.
- `drill_likes`, `template_likes`, `drill_favorites`, `template_favorites`:
  id-pair PK, `created_at`. Likes/favorites cascade on the drill; the drill
  still cannot be deleted while a block references it (`ON DELETE RESTRICT`).

Used this week is a **query**, not a column.

## RLS

- Likes/favorites: readable by signed-in; insert/delete only
  `profile_id = auth.uid()`.
- Drills/templates: keep signed-in read.
- Template INSERT into the club library: `is_admin` OR active squad staff of
  that club. Drill INSERT is **not** widened (coach club-drill insert stays
  refused).
- Update/retire a club hour: admin or `created_by = auth.uid()`. Squad-owned
  manage (`team_id` + `can_edit_team`) is untouched.
- `is_featured` changes: admin only.
- Do not change RLS on `events`, `memberships`, or chat.
- Do not change `teams.requires_contact` defaults. Never infer contact from
  a name.

## Not in this work

Pitch-mode, WhatsApp-the-hour, a diagram table, 1–5 ratings, AI, notification
email, letting coaches call `publish_training`, inferring contact from name,
seeding U16/U18/U11/tag packs, any child's name or photo, rewriting
`TrainingLibrary.jsx` / `TrainingTemplates.jsx` / `TrainingPublish.jsx`.
