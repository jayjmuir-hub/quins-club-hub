# Coaches build their own training plans

**27 Aug 2026 — Jay, overnight.** "coaches need the ability to create their own
training plans for sessions, they could create their own drills and templates
or they could just customize a session freestyle, they could publish it to the
squad or only to the other staff in their age group, they could choose the
performance directors plan or select to create their own."

Four questions were put (AskUserQuestion) and answered:

1. **Coach drills/templates are squad-private, with submit-to-club.** A coach's
   drill or template belongs to their age group and is not in another squad's
   picker; they may *suggest* it to the club library, and only the Rugby
   Performance Director approves it in (which clears its squad ownership) or
   dismisses it (it stays the squad's). Chosen over "shared immediately" and
   over "no sharing".
2. **Session visibility is draft → staff → squad, default staff** for a
   coach-built plan. The Director's publish stays 'squad' (families see it),
   unchanged.
3. **One PR, whole feature.**
4. (from the request) a coach chooses the Director's plan *or* builds their own,
   freestyle or seeded from a template.

## Why the RLS reads on drills/templates stay open

A squad-owned drill is "private" only in the sense of not cluttering another
squad's picker — it carries no personal data (exercise text and minutes), and
it appears embedded inside a family-visible session plan, so its row must be
readable. The scoping is enforced in `listDrills`/`listTemplates` (a `teamId`
param), not in RLS. This is the one deliberate "protection is UI, not the
grant" call in a repo that usually says the opposite — justified because there
is no data to protect. Written into the migration and the harness.

## What is enforced server-side

- `drills`/`session_templates` **manage**: `is_admin(club_id) OR (team_id is
  not null AND can_edit_team(team_id))`. A coach cannot null a team_id (only
  the is_admin arm passes for a null-team row), so cannot self-promote to the
  club library.
- `training_sessions` read/manage (and blocks): visibility-aware —
  squad→is_attached_to_team, staff→can_edit_team, draft→author. Manage always
  requires can_edit_team, and a draft is the author's alone.
- `publish_training` is SECURITY DEFINER (owner) so it bypasses RLS; it writes
  the `squad` default and needs no change.

Proven both directions in `db/tests/coach-training-plans.sql` (13 checks),
run green against production before and after applying the migration.

## The trap worth keeping

`events` has its own `created_by`. An **unqualified** `created_by` inside the
session policy's subquery bound to the event's creator, not the session's —
which refused every draft insert with every part apparently true. Qualify the
session's own columns as `training_sessions.*`. Measured, then fixed, 27 Aug.

## Scope deliberately left out

A standalone coach "my drill library" screen — coach drill/template creation is
inline in the session builder, where a coach actually works. Notifying the
Director when something is suggested (it sits on their existing screens).
Both are fast-follows if asked.
