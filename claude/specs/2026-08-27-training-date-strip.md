# Two-week training-date strip — Squad Training

**STATUS: building.** 27 Aug 2026. Direction mockups (not pixel-perfect): the
empty Tuesday selected (no plan yet) and the filled Tue 8 Sep with chips
applied to that night.

Jay (U16B age-group manager): see upcoming training nights on the existing
Squad Training screen. Stay on `/squad/:teamId/training`. No fourth tab. No
month calendar. No club-wide dates. Tests use invented fixtures only.

## Home

The strip lives on **Squad Training** (`src/screens/SquadTraining.jsx`),
**above** the Spotify-style focus chips (`src/components/TrainingShelf.jsx`).
`src/components/TrainingDateStrip.jsx` draws it. `src/lib/trainingDates.js`
is the shared helper — window, default selection, Empty / Draft / Staff,
pitch-on-the-date. Session Plan, Templates, and the hub shortcut do not
grow a second copy: they already take an event, and the shelf's `tonight`
prop is that selected night.

Events of type `training` for this squad already are the nights. No new
calendar table.

## What it shows

A horizontal strip of **the next two weeks of this squad's training events
only** — not every day of the fortnight. The window is fourteen club days
(`Asia/Dubai`), same length as the home glance, starting today.

Each date chip:

- Weekday + date (e.g. Tue 8 Sep)
- Club time (24-hour), or Time TBD
- Status from that night's `training_sessions` row if any: **Empty** / **Draft**
  / **Staff** (`visibility`). No session → Empty.
- Pitch booked lives **on the date**, not on the focus chips. A real pitch
  name (not `Pitch TBD`) renders as "D1 booked" on the selected chip and in
  the summary line.

No photos. No FaceStack. No diagram thumbnails on the strip or on list
rows. No videos. No AI.

## Selection

Tapping a date selects it. The chips, Tonight's hour, library add-to-night,
and Session Plan sheet then apply to **that** event.

Default: if there is a training tonight (club day, even after kick-off),
select it; otherwise the next upcoming night in the window. Switching dates
must not write another night's draft — `applyChipHour` already keys on
`eventId`, and a pending replace-confirm is dropped when the selected night
changes.

Empty window: an empty strip ("No training nights in the next two weeks"),
chips disabled / no-op, existing "no upcoming training" empty state when
the season list is empty too. Later sessions outside the fortnight still
list below.

## Who can edit

Unchanged. `canEditTeam` gates the screen. Staff vs coach session rights
stay as they are. Heart / star / featured and `shelfRowsForSquad` unchanged.
Diagrams on opened cards (`DrillDiagram` / `diagram_url`) unchanged.

## Not in this work

A two-week strip on other tabs. Uploading diagrams. Videos. FaceStack.
A full calendar. Merging.
