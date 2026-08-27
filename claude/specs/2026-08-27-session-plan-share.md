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

The picture is a **share-only tree** (`src/components/SessionPlanCapture.jsx`,
`data-testid="session-plan-capture"`), photographed by `shareElementAsImage`
→ html2canvas. It is **not** a photograph of the live `BlockRow` list.

The capture is Club Hub in force-light, not a monospaced dump: Inter /
ink `#101116` / ink-muted `#565c67` / line `#e5e5e5` / brand `#c8102e`,
via inline styles so html2canvas still paints them.

Top of the picture, so WhatsApp knows the night:

- squad name, same small-caps as the live "Session plan" heading
  (`13px` extrabold uppercase, tracking 0.8px, ink-faint)
- event title bold
- date and time in Abu Dhabi (`formatLongDate` + `eventTimeLabel`), muted
- pitch if set: the same string EventDetail shows (`eventPitchLabel` /
  `event.pitch`, names like D1 / D2). Omit the line if empty. Never invent
  "Pitch 2"

Then the hour: each block has a line border, `minutes min · title`
extrabold like `BlockRow`, category as its **own rounded pill**
(`inline-block`, padding, 12px radius, line border, mute fill — not
`Chip`, not flex-wrap, never on the title line), coach note smaller
muted with space so the next header cannot overlap, then Total and
session notes in the live card's hierarchy.

No "How it runs". No `<details>`. No `<ol>` numbers. No flex-wrap title
row. No Adjust / Share / Edit / Delete / availability. The live SessionPlan
card on screen stays as coaches tap it.

Inline `display: block` so html2canvas can measure the tree. Not
Tailwind `Chip` / flex-wrap / details. The golden PNG under `tests/` is
a Chrome screenshot of that capture with Inter embedded, not a bitmap
dump of the text.

## Why a second unused capture node is not QC

Jay tapped Share on Combined Preseason. WhatsApp got the live Session Plan
list: numbered `<ol>`, closed "How it runs" `<details>`, titles jammed onto
category chips (`touchGame`, `fitnessConditioning`, `stretchCool-down`),
and the next header painted over the previous coach-note.

`sharePlan` already passed `shareRef.current` (the off-screen capture
node) into `shareElementAsImage`. Tests that mock that helper and only
read `session-plan-capture` innerText stay green while html2canvas still
photographs BlockRow.

Root cause: the capture was **nested inside EventDetail's `Sheet`**. The
scrim has `backdrop-filter`, the panel animates with `transform`,
`overflow-y-auto` clips. `position:fixed; left:-9999px` then positions
against the sheet, not the viewport. Lineup's same classes work because
that screen is a full page. MatchSheet photographs an on-screen facsimile.

Fix: `createPortal` the capture to `document.body` with Lineup's wrapper
exactly (`pointer-events-none fixed -left-[9999px] top-0`). Not
`display:none`, not a canvas scale hack, not `foreignObjectRendering`.

QC: `tests/session-plan-share-capture.test.jsx` wraps `shareElementAsImage`
and spies `html2canvas`, so the assertion is the **element that would be
photographed**. Combined Preseason fixture (invented names). A HTML string
snapshot and a golden PNG live under `tests/`. The PNG is committed;
CI does not re-screenshot it (`CI=true` skips Chrome). Refresh locally
with `UPDATE_SESSION_PLAN_PNG=1`.

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

Share sheet: `navigator.share` with the image file (Android is the real
phone). Reuse `shareElementAsImage` in `src/lib/shareImage.js`. If files
are not supported, copy the link and still offer the image as a download.
Share text is the link plus a short title (event name / date). No PDF.

## Not in this work

Clear plan. Hiding Squad Hub Edit/Delete. `publish_training`. A dedicated
`/event/:id` route. A second capture library. A PDF. WhatsApp-formatted
block dumps.
