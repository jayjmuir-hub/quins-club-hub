# Plan — one button that lets a member report a problem or suggest a change

**STATUS: BUILT, NOT YET APPLIED — 18 Aug 2026.** The button, the panel, the
data layer, the admin triage list, both migrations and the edge function are
written and tested. ⚠️ **NEITHER MIGRATION HAS BEEN RUN AGAINST PRODUCTION AND
THE FUNCTION IS NOT DEPLOYED**, so on the live site the `?` opens, the form
fills in, and Send fails — there is no `feedback` table behind it. Applying it
is the checklist at the bottom of this file.

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
- ⚠️ **A screenshot switch, off by default, was drawn in the mockups and is NOT
  in the shipped panel.** It belongs with the deferred `html2canvas` work below,
  and a control that cannot yet do anything is worse than no control. When it
  lands: **off by default**, labelled *"Attach a picture of this screen"* and
  subtitled *"Off — because rosters show children"*. That default is the whole
  point of it and is not a preference to be tuned later.
- **No name or email field.** They are signed in; the app knows.

### Step 3 — the acknowledgement

Tick, "Thanks — that's with us", and a reference number (`QCH-0041`).

### Where reports live — the screen, not the inbox

⚠️ **THE SCREEN IS THE RECORD AND THE E-MAIL IS A PROMPT TO GO AND LOOK AT IT.
THIS REVERSES AN EARLIER VERSION OF THIS PLAN, AND THE REVERSAL IS THE RIGHT
WAY ROUND.** Jay, 18 Aug 2026: *"can't we just have the reports go to a section
of the admin page, keep everything in one place instead of emails"*.

**This app already made that decision once**, and the reasoning is written at the
top of `supabase/functions/notify-approval/index.ts`: the screen is the source of
truth, the e-mail is a prompt. Approvals work this way today. Reports match it
rather than inventing a second pattern.

- Reports appear in a section of `src/screens/AdminNeedsAttention.jsx`, which
  already exists to be the "things waiting for you" screen, with a count badge.
- Each carries a status an admin can change: `new` → `in-progress` → `done` /
  `wontfix`.

⚠️ **What this costs, stated plainly because an earlier draft of this file
argued the opposite.** The previous version leaned on `Reply-To` to delete the
admin screen, the status column and the RLS read policy from the first cut, on
the grounds that a mail client is a serviceable triage tool. It is not: an inbox
is a bad database, and within a month there is no reliable answer to "which of
these have I actually dealt with". The screen goes back in. Roughly another half
day, plus the policy work.

### What lands in the admin inbox

Subject naming the screen and the reference. The member's words quoted, then
**the reporter's name** (Jay, 18 Aug 2026 — asked for explicitly), the screen,
device, version, last error, and whether a screenshot is attached.

**`Reply-To` is still set to the reporter's address.** It no longer carries the
design, but it makes answering somebody one tap from the notification.

⚠️ **The notification goes to `help@adhquins-clubhub.com`, a Microsoft 365
SHARED MAILBOX — and mail for this domain is already on M365.** Measured 18 Aug
2026: `adhquins-clubhub.com` MX resolves to
`adhquinsclubhub-com02b.mail.protection.outlook.com`, tenant
`quinsclubhub.onmicrosoft.com`, bought 5 Aug 2026
(`claude/decisions/2026-08-05-m365-auth-email.md`). A shared mailbox needs **no
licence**, so this costs nothing.
⚠️ **`CLAUDE.md` says "do not propose buying an M365 licence", which is the
4 Aug defederation verdict and is easy to misread as "there is no M365 here".**
There is. Sending is Resend — `supabase/functions/send-email/index.ts` is the
authority — and receiving is Microsoft. A session that reads only the rule will
design a mail-forwarding setup this club does not need.

## Build order

1. `<HelpButton />` plus the two-step panel in `src/components/Sheet.jsx`,
   mounted once in `src/components/AppShell.jsx` so every signed-in screen gets
   it.
2. A `feedback` table carrying a `status` (`new` / `in-progress` / `done` /
   `wontfix`). Insert-only for any authenticated member; readable by the
   reporter or an admin; **status writable by admins only**, mirroring
   `src/lib/scope.js`.
3. The reports section on `src/screens/AdminNeedsAttention.jsx`, with a count
   badge and a status control. **This is the record.**
4. `supabase/functions/notify-feedback/index.ts`, copied from
   `supabase/functions/notify-approval/index.ts`: AFTER INSERT trigger,
   `pg_net.http_post`, `verify_jwt: false`, shared secret, fails closed, and
   **cannot fail the member's insert**.
5. The acknowledgement mail to the reporter.
6. A plain **"Can't get in? Email us"** mailto to `help@` on the login screen —
   see the hole below. ⚠️ **This is the one place the mailbox is doing real
   work**, because a person who cannot sign in cannot reach anything above.
7. A "report this" action on `src/components/ErrorBoundary.jsx` that opens the
   same panel with the error attached.

Deferred on purpose: screenshots via `html2canvas`, help articles, a search box,
a public ideas board, "was this helpful" voting, and audit-logging of status
changes.

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

## Decided 18 Aug 2026

1. ✅ **Who receives reports** — `help@adhquins-clubhub.com`, a **shared
   mailbox** in the existing M365 tenant rather than an alias on Jay's account.
   An alias forwards into a personal inbox and replies leave as that person; a
   shared mailbox is a destination a second volunteer can be added to later
   without an app change or a deploy. Neither costs a licence.
   ⚠️ **Not created yet at the time of writing.** The notification function
   cannot be finished until it exists.
2. ✅ **The reporter's name goes in the admin e-mail.** Jay, 18 Aug 2026.
3. ✅ **Reports live on the admin screen**, not in the inbox — above.

## Still to be decided

1. **Reference number format.** `QCH-0041` is a placeholder.
2. **Whether status changes are audit-logged.** Deferred, not rejected; the
   rights log at `src/screens/AdminRightsLog.jsx` is the obvious home if so.

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

---

## ⚠️ What is built, and what it does NOT yet do — 18 Aug 2026

| Built and tested | File |
|---|---|
| The floating `?` and the two-step panel | `src/components/HelpButton.jsx` |
| Mounted once, so every signed-in screen has it | `src/components/AppShell.jsx` |
| The data layer, and the `QCH-0041` reference | `src/data/feedback.js` |
| The admin triage list — **the record** | `src/components/FeedbackTriage.jsx` |
| Placed above the completeness list | `src/screens/AdminNeedsAttention.jsx` |
| The table, RLS, the stamping trigger, column grants | `db/migrations/20260818_feedback.sql` |
| The notification trigger | `db/migrations/20260818_notify_feedback.sql` |
| The mail — club, then reporter | `supabase/functions/notify-feedback/index.ts` |
| "Can't get in? Email us" on the login screen | `src/screens/Login.jsx` |
| Which deploy the person was on | `vite.config.js` (`__BUILD_REF__`) |

**Deferred, as planned:** screenshots via `html2canvas`, help articles, search,
a public ideas board, audit-logging of status changes, and the "report this"
action on `src/components/ErrorBoundary.jsx`.

### ⚠️ The apply checklist — none of this has been done

1. **Run `db/migrations/20260818_feedback.sql`** against production.
   ⚠️ **Prove it in a rolled-back transaction first** —
   `claude/runbooks/db-harnesses.md`. A database branch is NOT available here:
   branches come up empty because Supabase replays `supabase/migrations/` and
   this repo keeps them in `db/migrations/`.
2. **Re-capture the grants.** `db/schema/grants.sql` currently carries the
   migration's INTENT with a warning saying so, because a snapshot that was
   typed rather than read cannot diff anything. Replace it with a real reading
   of `information_schema` and delete that warning.
3. **Deploy `notify-feedback`** with **`verify_jwt: false`**. With it on, the
   gateway rejects every call before the code runs and no mail is ever sent —
   silently, because `pg_net` does not read the response.
4. **Set the vault secrets** `feedback_notify_url` and
   `feedback_notify_secret`, and the function secret `FEEDBACK_NOTIFY_SECRET`
   to the same value. Until then the trigger warns and sends nothing, which is
   the designed failure: the report is still filed.
5. **Run `db/migrations/20260818_notify_feedback.sql`.** It guards itself — it
   raises if the trigger did not install.
6. **File a real report from a phone** and confirm three things: the row
   appears on `/admin/needs-attention`, the club mail arrives, and the ACK
   arrives. ⚠️ **CHECK THE JUNK FOLDER.** A new M365 tenant with no sending
   history junked the first two messages ever sent to `help@` on 18 Aug 2026 —
   proven, not predicted. If the notification is junked, mark it not-junk and
   re-test rather than assuming the function is broken.

### ⚠️ Two things found while building, worth keeping

- **A test that could not fail.** The fixture for "one family member must not
  see another's half-typed report" originally asserted at the choice step,
  where the textarea is never rendered — so it passed with the state reset
  deliberately removed. Caught by injecting exactly that fault. It now steps
  back into the form before asserting.
- **A real bug, caught by a test rather than by reading.** `FeedbackTriage`
  reported a failed status change and then reloaded — and the reload clears the
  error on its way in, so the message vanished and the control silently snapped
  back. That is precisely how somebody believes they closed a report they did
  not. Reload now happens first.
