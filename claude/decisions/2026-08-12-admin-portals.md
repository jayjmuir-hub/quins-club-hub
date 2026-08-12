# Decision: /admin is a chooser, and every portal card is always on it

*12 Aug 2026. Jay's ruling. Reasoning, not current state — `RESTORE.md` and the
code win on what is true today.*

## The ask

> "i'd like more of a split off for the dashboards, accounts with those rights
> would have a tab to enter whichever portal they have access to, those portals
> would mainly be desktop pc use, also the main admin portal is mainly desktop
> pc use"

## What was decided

`/admin` stops redirecting to Accounts and becomes a **chooser**: the heading,
the View-as switcher, and a card per portal. Each portal is its own space with
its own tabs. Every existing URL underneath is unchanged.

**Every card renders for every admin.** A portal you do not hold the right for,
and a portal with no screen behind it yet, is greyed and not clickable — not
hidden. Jay, 12 Aug: *"the cards would still be visible but greyed out and not
clickable"*.

## ⚠️ This is NAVIGATION ONLY. It narrows nothing.

Asked directly whether the split should also narrow what a portal holder can
see, Jay chose navigation only, for now.

**So the safeguarding fact recorded on 10 Aug is unchanged: an account holding
Pitch Management or Social Media Management is a full admin, and holds every
child's name, photo and gender and every parent's email and phone, club-wide,
with the power to edit or delete.** A right can only be held by an admin at all
— `adminRights` in `src/lib/scope.js` skips any membership that is not
`role='admin'` and active.

A tidier front door on the same room is exactly what this is, and calling it
anything else would be the dangerous mistake. The narrower role remains priced
in `claude/decisions/2026-08-10-role-dashboards.md`: a new helper alongside
`private.can_edit_team`, and a judgement call at each of the thirteen policies
hanging off it.

## Why a chooser rather than one nav item per portal

The obvious alternative — a **Pitches** item in the main nav beside Home,
Schedule and Roster — is one click instead of two, and was rejected.

⚠️ **The nav row has already taken the whole masthead down once.** It cannot fit
an admin's full complement at its `max-w-[1120px]` cap; the club wordmark
absorbed the overflow and rendered as "ABU DHABI HARLE…", which is why the
View-as switcher was moved out of the masthead on 7 Aug. The reasoning is
written out in full at its old call site in `src/components/AppShell.jsx`.
**A design that grows the nav row by one item per new club job walks straight
back into that**, and it gets worse every time a job is invented.

The chooser costs a click and cannot grow the nav row at all.

## Why greyed rather than hidden

Hiding a portal you do not hold means granting the right does nothing visible —
somebody is told they have been given a job and sees no change, which reads as
a broken grant. Greying it out makes the club's shape legible: these are the
jobs, this is the one that is yours.

⚠️ **A greyed card must not be a link.** This repo already has a ruling about a
control that drew itself, invited a tap and swallowed it — the availability
button on the Dashboard, recorded in `claude/state-of-play.md`. An inert card is
inert in the markup, not merely in the styling, and its state is stated in words
rather than carried by colour alone (`claude/specs/accessibility.md`).

## What this does not decide

- **The social-media dashboard itself.** Jay, same session: *"we will get to
  the social media dashboard later today"*. Until it exists its card is greyed
  for everybody, including a super admin who implicitly holds the right.
- **Whether an ordinary admin should ever hold a portal without full sight of
  children's data.** Still open, still priced, still expensive.
