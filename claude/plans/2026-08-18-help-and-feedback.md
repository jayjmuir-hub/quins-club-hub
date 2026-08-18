# Plan — one button that lets a member report a problem or suggest a change

**STATUS: NOT BUILT — designed 18 Aug 2026, no code written, no migration, no
function deployed.** This file is the design and the reasoning. Nothing in the
app has changed.

## The ask

Jay wanted one obvious place a parent, player, coach or admin could go to say
"this is broken" or "this would be better", without being made to file a proper
bug report. The audience is club volunteers and parents on phones, so the bar is
zero friction to report, and never make anyone describe where they were.

The design below came out of a conversation on 18 Aug 2026 that started from an
external handoff document (`C:\Users\Jay\help-system-handoff.md`, not in this
repo). **That document should not be followed as written** — see the stale facts
section below.

## The design

A **44px circle with a `?`**, brand red `#c8102e`, floating bottom-right over
every signed-in screen, 18px in from the right edge and clear of the tab bar.

⚠️ **The room for this already exists and was reserved for it.**
`claude/specs/design-system.md` line 256 explains the 100px bottom padding on
`main` as "clearance for fixed tab bar + FAB", and line 263 specifies a FAB at
54×54px that was designed and never built. `src/components/AppShell.jsx` carries
that padding today as `pb-[calc(100px+env(safe-area-inset-bottom))]`. So the
button costs **no layout space at all** — nothing moves down, no list shortens.

40px is the floor (`claude/specs/design-system.md` line 724, "tap targets are
generally >=40px"). 44 was chosen to match the controls that already set a
minimum in `src/components/SquadStaffCard.jsx` and
`src/components/MatchSheetEntry.jsx`. White on `#c8102e` measures 5.88:1, so the
`?` stays legible in direct sun.

**Tapping it opens the existing `src/components/Sheet.jsx`** — bottom sheet on
mobile, centred dialog at `desktop:`, focus trap, Escape, `motion-reduce`
already handled. No new overlay component.

### Step 1 — the choice

> **Need a hand?**
> You're on the Roster page.
>
> **Something's broken** — Wrong info, or it won't work
> **I've got a suggestion** — Something that'd make this better
>
> *Anything else — just say what's on your mind and Jay will sort it out.*

Naming the current page at the top tells the member the app already knows where
they are, so they do not waste effort describing it — and it quietly shows them
what is being collected.

⚠️ **The closing line is NOT a third button, and must not become one.** It is
there so somebody whose problem is neither a bug nor an idea ("I don't
understand what U12 means") does not bounce off. Two buttons are a sorting hint
for the admin, not a test the parent can fail.

⚠️ **It names Jay on purpose, and that is a known expiry date.** Jay, 18 Aug
2026, chose "Jay will sort it out" over "we'll sort it out". The copy goes stale
the day anyone else helps with reports. Change it then; do not quietly
generalise it now.

### Step 2 — the form

Same form for both choices; only the heading and the prompt change.

- One field, and it is the only required thing: *"What went wrong?"* /
  *"What would make this better?"*
- A grey block headed **"Sent automatically with your message"**, listing in
  plain words: the page you're on, your phone, the app version.
- A switch, **off by default**: *"Attach a picture of this screen"*, subtitled
  *"Off — because rosters show children"*.
- **No name or email field.** They are signed in; the app knows.

### Step 3 — the acknowledgement

Tick, "Thanks — that's with us", and a reference number (`QCH-0041`).

### What lands in the admin inbox

Subject naming the screen and the reference. The member's words quoted, then
who / screen / device / version / last error / whether a screenshot is attached.

⚠️ **`Reply-To` is set to the reporter's address, and that is what removes an
entire screen from this plan.** Hitting reply in the inbox answers the member
directly, so the admin's mail client IS the triage tool. No status column, no
admin triage list, no audit logging in the first cut.

## Build order

1. `<HelpButton />` plus the two-step panel in `src/components/Sheet.jsx`,
   mounted once in `src/components/AppShell.jsx` so every signed-in screen gets
   it.
2. A `feedback` table. Insert-only for any authenticated member; readable by the
   reporter or an admin, mirroring `src/lib/scope.js`.
3. `supabase/functions/notify-feedback/index.ts`, copied from
   `supabase/functions/notify-approval/index.ts`: AFTER INSERT trigger,
   `pg_net.http_post`, `verify_jwt: false`, shared secret, fails closed, and
   **cannot fail the member's insert**.
4. The acknowledgement mail to the reporter.
5. A plain **"Can't get in? Email us"** mailto on the login screen — see the
   hole below.
6. A "report this" action on `src/components/ErrorBoundary.jsx` that opens the
   same panel with the error attached.

Deferred on purpose: screenshots via `html2canvas`, help articles, a search box,
a public ideas board, an admin triage screen, "was this helpful" voting.

## ⚠️ The hole in the middle of this

The signed-out screens — `src/screens/Login.jsx`, `src/screens/Register.jsx`,
`src/screens/ResetPassword.jsx` — are outside `AppShell`, so **the likeliest
problem anybody will ever have, "I can't log in", is the one thing this cannot
catch.** Step 5 above is the answer: a mailto, no form, no database. Making the
form work signed-out was considered and rejected — it means accepting reports
from anyone on the internet, which means spam handling, for a rare case a mailto
covers.

## Arguments against what is proposed here

Recorded because somebody will make them again.

- **A `?` is a symbol, not a sentence.** "Something wrong on this page?" spelled
  out at the foot of each screen tells a parent exactly what it is for; a `?`
  asks them to guess. The footer-row version was drawn and Jay preferred the
  floating button. The `?` is a near-universal convention and it costs no
  layout, which is what settled it.
- **A floating button covers content while scrolling.** True. It sits over a
  list row now and again. It never blocks anything permanently.
- **Reports-before-FAQ delays self-serve help.** Deliberate. A seed FAQ written
  before any report has arrived is a guess about what confuses parents, written
  by people who are not confused. Three weeks of real reports write it from
  evidence instead.
- **Two lanes could be one.** A single "tell us anything" box would be simpler
  for the member. Two buttons cost one tap and give the admin a sorted inbox.

## Still to be decided

1. **Who receives reports.** A `help@adhquins-clubhub.com` alias forwarded to
   Jay is recommended over a personal address — the day somebody else helps, it
   is a forwarding rule rather than an app change and a deploy.
2. **The reporter's name in the admin email** — almost certainly yes, but it was
   never explicitly confirmed.
3. **Reference number format.** `QCH-0041` is a placeholder.

## ⚠️ Stale facts in the source handoff — do not carry them forward

Four claims in `C:\Users\Jay\help-system-handoff.md` were checked against this
repo on 18 Aug 2026 and are wrong. They are listed here because that document
still exists and reads authoritatively.

| It says | Actually |
|---|---|
| "Reuse `src/components/IdeaForm.jsx` for suggestions" | That is the **social-media post** form — an image upload bound for Instagram, with required consent copy about photographs of children, and a trigger stamping `club_id`/`status`. App suggestions routed into it would land in the club's content queue. Reuse the *shape*, never the component |
| "`@sentry/react` is built but off — turn it on as part of this" | **Sentry is live**, EU region, proven on the deployed site 16 Aug 2026; `claude/runbooks/monitoring.md` has it. ⚠️ Its own file comment in `src/lib/errorReporting.js` still says the account does not exist — **that comment is stale and is a separate fix** |
| Colours `#e11b22` / `#3bd070` / `#eef0f3` / `#dfe2e8` | The retired palette. Re-pointed 6 Aug 2026: brand `#c8102e`, brand-deep `#a30d25`, accent `#2a9d55`, surface `#f3f3f3`, line `#e5e5e5`, chrome `#0a0a0a`. `tailwind.config.js` is the source of truth |
| "Anton for titles, Barlow Condensed must pair with 600/700" | Anton and Barlow are **gone**. `font-sans`, `font-display` and `font-condensed` all resolve to **Inter**. The rule describes a typeface the app no longer loads |

⚠️ **The static mockup at `C:\Users\Jay\help-system-preview.html` is painted in
the retired palette too** — its hexes are `#e11b22`, `#b3141a`, `#eef0f3`,
`#dfe2e8`. It is an accurate picture of the app as it was before 6 August.

## Consequences for other files, once this is built

- `claude/changelog.md` needs an entry (the `docs-check` gate enforces it).
- A `claude/decisions/` record should follow for the settled arguments above.
- The stale comment in `src/lib/errorReporting.js` should be corrected
  independently of this feature — it has already caused one code review to
  recommend deleting a live dependency.
