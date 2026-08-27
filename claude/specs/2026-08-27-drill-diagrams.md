# Drill pitch diagrams

**STATUS: building.** 27 Aug 2026. Opened drill cards may show a schematic
pitch drawing. List / shelf rows do not.

Tombstone: `claude/decisions/2026-08-21-drill-body-is-just-a-text-field.md` —
`drills.body` stays prose. The drawing is a new nullable column, not markdown
in the body.

## What a parent or coach sees

When a drill is **opened** (Session Plan `<details>`, admin library editor),
and `diagram_url` is set, the image sits above the body, full width of the
card, `alt` = drill title + " pitch diagram". When the URL is null, there is
no image and no placeholder photo.

Shelf and library **list** rows stay title, summary, minutes, category, heart,
star. No thumbnails. Jay rejected fake photos on the shelf.

The drawing is schematic: dashed box, orange cones, blue A / red D circles,
black arrows, metre labels. Never a photograph of a person, never a stock
rugby still, never video.

Shared component: `src/components/DrillDiagram.jsx`. Session Plan and the
admin library editor both mount it. `DrillCard` is the list row and does not.

Admin library has an optional URL field. No uploader in this work — seeded
World Rugby cards get URLs in a later data pass.

## Schema

`db/migrations/20260827_drill_diagram_url.sql`.

- `drills.diagram_url text` null.
- Public Storage bucket `training-diagrams` (not `player-photos`, not
  `staff-photos`). Diagrams have no children, so public is OK.
- Read: anyone who can read a drill (the bucket is public so `<img src>`
  works). Write: matches drill manage — club admin, or squad staff of a
  squad-owned drill. Key shape `<drill_id>/<file>`.
- Display fetches that list columns (`DRILL_EMBED`) include `diagram_url`.
  `listDrills` already `select('*')`. Existing inserts stay valid.

## Not in this work

Uploading the World Rugby SVG set. Videos. Two-week date strip. A full
storage uploader. Player photos on cards.
