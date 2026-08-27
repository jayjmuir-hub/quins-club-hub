# Share a training session plan

**STATUS: building.** 27 Aug 2026. Jay (Jason Muir): capture how the plan
looks in Club Hub and share that picture (WhatsApp via the phone share
sheet). Also include a deep link so someone already in Club Hub can tap
and land on that hour. Not editable is fine. Same control every age group.

Tests use invented fixtures only. A session plan holds drills and minutes.

## Home

Share lives on **`SessionPlan`** (`src/components/SessionPlan.jsx`), next
to **Adjust**. Staff who can edit see it. It is not on EventDetail's
Edit/Delete footer. EventDetail (Squad Hub / Schedule / Dashboard) and
Squad Training's sheet already mount this same card — one control, not two
copies. Graft found no other mount.

## What it shares

The picture is the plan as it **reads**: running order (minutes · title,
category chip, coach notes), Total N min, session notes. Same words and
Club Hub look. It is **not** a photograph of the live `BlockRow`.

Share has its own capture tree (`data-testid="session-plan-capture"`,
`ShareBlock`): ordinary block flow html2canvas can measure. Minutes ·
title is one line of text. The category chip sits on the next line.
Coach notes wrap in the same block. Padding between rows so they do
not kiss. No flex-wrap title row. No `<details>` / "How it runs". No
Adjust / Share / Edit / Delete.

The live SessionPlan card stays as coaches tap it (flex-wrap `BlockRow`
plus a closed "How it runs"). WhatsApp gets the capture node, rendered
off-screen the same way the lineup / match-sheet facsimile is — not
`display:none`, not a canvas scale hack, not `foreignObjectRendering`.

Do **not** photograph Adjust, Save as my template, Edit, Delete,
availability, or the event hero.

Share sheet: `navigator.share` with the image file (Android is the real
phone). Reuse `shareElementAsImage` in `src/lib/shareImage.js` (html2canvas,
already the lineup / match-sheet path). If files are not supported, copy
the link and still offer the image as a download. No PDF.

Share text is the link plus a short title (event name / date). The picture
is the plan. Do not lead with a WhatsApp-formatted dump of blocks.

## Deep link

EventDetail is an overlay, not a URL. **`/schedule?event=<id>` already
opens that fixture's detail sheet** (chat fixture cards, 23 Aug 2026) and
clears the param once consumed. A training event's sheet already mounts
`SessionPlan`. That is the smallest fit — no second calendar, no
`/event/:id`.

`/squad/:teamId/training` is staff-gated (`canEditTeam`). A family who can
already see the event would be turned away there, so it is the wrong
share target.

Unauthenticated visitors hit `RequireAuth`, which renders Login **in
place** and keeps path + query, so after sign-in Schedule still consumes
`?event=` and opens the hour.

RLS / visibility still apply: Staff-only plans stay closed to parents;
squad plans are readable by families who can already see the event.
`getSession` returns nothing the policy would hide; Share does not call
`publish_training`.

## Not in this work

Clear plan. Hiding Squad Hub Edit/Delete. `publish_training`. A dedicated
`/event/:id` route. A second capture library. A PDF. WhatsApp-formatted
block dumps.
