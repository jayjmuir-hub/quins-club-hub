# Authoring a Club Hub feature guide

A **feature guide** is a one-page, print-friendly walkthrough of a single Club
Hub feature, handed to the role that uses it (head coaches, managers, parents).
They are published as **Artifacts**, not committed HTML — the repo holds the
reusable template and this method, and each guide is generated from them.

The first one shipped was the head coaches' **Build a training session** guide.
The reusable scaffold it produced is
[`claude/guides/feature-guide-template.html`](feature-guide-template.html).

## The design is frozen — change copy and screenshots, nothing else

The look matches the club's staff-signup print piece so every guide reads as one
family: **black hero band, segmented red/green top rule, the shield crest, Anton
headlines, Barlow body, cream ground.** The template carries the whole design
system inline and a component gallery. Do **not** restyle per guide. If a guide
needs a component the gallery doesn't have, add it to the template so the next
guide inherits it.

The crest in the template is the real [`src/assets/crest.png`](../../src/assets/crest.png),
inlined as a `data:` URI. Keep it inlined — the Artifact CSP blocks external
images, so **every** image in a guide (crest and screenshots) must be a `data:`
URI, never a URL.

## Steps

1. **Copy the template.** Set `<title>`, and the hero's eyebrow (audience),
   headline (`.shout` word + `.accent` feature name), and subtitle (the one-line
   promise). Delete the dashed `.tmpl-band` scaffolding markers and any
   components you don't use.

2. **Write the body from the real screen flow.** Read the feature's screens in
   `src/screens/` and `src/components/` so every button label and state is the
   real one. Reuse the gallery components: `note` (a prerequisite), `section`
   (lettered head + `ol.steps`), the three chips (`.tap` primary, `.opt`
   outlined/status, `.field` field/neutral), `who` rows, `cards`, `tip`,
   `gloss`, and `figure.shot`.

3. **Screenshots — real components, invented data, never real people.**
   Screenshots come from the screenshot harness rendering the *actual* React
   components, populated by a stub. This is a hard rule (see the repo `CLAUDE.md`
   rule 9): a real name or a child's contact rendered to PNG is a real identity
   published to the club.

   a. **Stub the feature's data module.** Add a stub under `harness/stubs/` and
      point the module's specifier at it in
      [`harness/vite.config.js`](../../harness/vite.config.js). Worked example:
      [`harness/stubs/trainingPlans.js`](../../harness/stubs/trainingPlans.js) —
      invented drills and a published session, matching the real module's return
      shapes, never touching Supabase. Match the real
      [`src/data/`](../../src/data) module's exported function names and shapes,
      or the screen renders empty.

   b. **Run the harness** — Vite from the repo root using the harness config, so
      the real Tailwind build and real components apply:

      ```bash
      npx vite --config harness/vite.config.js
      ```

      Open the harness and navigate to the feature's screen.

   c. **Screenshot the component headless and crop.** Drive the harness with a
      headless browser (Playwright), screenshot the relevant panel, and crop to
      the phone-width frame the `figure.shot` uses (~330px wide). Keep the
      throwaway shoot/crop scripts in your scratchpad — they are not repo
      tooling. Playwright is a dev dependency of the app; if it isn't resolvable,
      point at the other clone's copy via a module path rather than installing.

   d. **Embed each PNG as a `data:` URI** inside its `figure.shot` — base64 the
      cropped file and drop it in the `<img src>`. Write a plain-language `alt`
      for a reader who can't see it, and a `<figcaption>` with a bold screen name
      and one line.

4. **Publish with the Artifact tool.** Favicon 🏉, a specific two-to-four-word
   title. Then **verify the header actually rendered** — render the file headless
   and check the black hero band and crest are there before handing it over. A
   guide whose crest silently failed to load looks broken to a parent.

5. **For Google Drive, hand over a PDF, not the HTML.** Drive shows an `.html`
   file as raw source — it does not render web pages — so a guide dropped in as
   HTML reads as code. Render the artifact file to PDF with Playwright's
   `page.pdf({ printBackground: true, format: 'A4', margin: 0 })` after
   `emulateMedia({ media: 'screen' })` (so the black hero and colours print),
   and drop the PDF into `Quins/Quins Shareable/Club Hub Guides` — the local
   Google Drive for Desktop mount (`G:\My Drive\…`) syncs it up, which sidesteps
   inlining a ~1MB file through a tool call. Two things keep the page count down
   for a print handout:
   - a small **print-only override stylesheet** injected before rendering that
     tightens the vertical rhythm and lays each `figure.shot` in a right-hand
     column beside its steps (CSS grid: heading and lead full-width, steps in
     column 1, the screenshot in column 2) instead of a full-width block below —
     this alone roughly halved the training-session guide (6 → 3 pages);
   - **shrinking the screenshots** — WEBP at the display size is crisp and small.

   The override lives only in the PDF copy; the published artifact keeps its
   full-resolution, single-column screen layout.

## What lives where

| Thing | Where | Committed? |
|---|---|---|
| The frozen template + design system | [`claude/guides/feature-guide-template.html`](feature-guide-template.html) | yes |
| This method | `claude/guides/authoring-guides.md` | yes |
| A feature's screenshot stub | `harness/stubs/<module>.js` + alias in [`harness/vite.config.js`](../../harness/vite.config.js) | yes — reused by future guides |
| A finished guide | an Artifact (claude.ai) | no — regenerated from the template |
| A guide for Google Drive | a PDF in `Quins/Quins Shareable/Club Hub Guides` | no — rendered from the artifact HTML |
| Shoot / crop / to-PDF scripts for one guide | your scratchpad | no — throwaway |
