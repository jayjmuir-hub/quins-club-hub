# The button routing sweep, and the two variants it added

*10 Aug 2026. A record of reasoning, not of current state — `RESTORE.md` and the
code win on what is true today.*

## What was decided

Jay, 10 Aug 2026: route the whole app in one sweep rather than one screen at a
time. The options put to him were one screen first, five high-traffic screens, or
all of it; he chose all of it.

## Why the sweep did not route every `<button>`

"Route everything" was taken to mean **every action button**, not every element
that happens to be a `<button>`. Roughly forty stay raw, and they are listed by
category in `src/components/Button.jsx`'s header. The line is:

> A button that carries a **fill or a hairline border** is an action button and
> belongs in `<Button>`. A button that is a layout box, a pill, a tab, a toggle,
> icon chrome, or underlined text is not, and forcing it through would mean a
> variant that shares almost nothing with the others.

⚠️ **That is not a softening of the sweep, it is the sweep's actual boundary**,
and it was already written down before this session: `Button.jsx` excluded the
masthead pills from the day it was created, and `RESTORE.md` records why a
`<button>` used as a layout box must keep its explicit layout. Routing
FixtureRow, Roster's player row or Schedule's calendar cells would have
reintroduced the Chromium UA content-centring bug that Task 11 shipped and Task
23 fixed — a bug **no jsdom test can see**.

## The two new variants

`danger` and `dangerQuiet`. The existing three were justified in `Button.jsx` as
"the clusters the existing strings already fall into", and there was a fourth:

- **`danger`** — `bg-brand-deep text-white hover:bg-brand`. The CONFIRM half of a
  destructive pair. Found already hand-written in `EventDetail` (twice),
  `PlayerDetail`, `Accounts` and `CalendarSubscribe`.
- **`dangerQuiet`** — bordered, `text-brand-deep`, `hover:bg-danger-bg`. The
  button that ARMS the pair. Found in `EventDetail` and `PlayerDetail`.

Three properties are deliberate and each has a test:

1. ⚠️ **No sweep and no bloom.** The same argument that keeps them off
   `secondary`, with worse consequences: an animation that pulls the eye toward
   the irreversible choice.
2. ⚠️ **Darker at rest, lighter on hover — inverted against `primary`.** This is
   not drift. It is how every hand-rolled confirm button in the app was already
   written, and it is what stops the confirm reading as the friendly default when
   it sits beside a `secondary` "Keep it".
3. ⚠️ **The bottom edge is `border-black/20`, not a token.** `brand-deep` is
   already the darkest red in the palette, so there is no next step down to name.
   A flat darkening works on the fill it sits on without inventing a colour.

⚠️ **`dangerQuiet` must never be used for a first tap that deletes.** The pair
encodes the two-step inline confirm that `RESTORE.md` records as the rule here —
never a native `confirm()`, which blocks the event loop and hangs Playwright.

## The one place intent changed rather than consolidating

`DeleteAccount`'s "Delete my account" submit was `bg-brand` — the same red as
"Save changes" — while every other confirm-a-deletion button in the app was the
deeper red. It is now `danger`. **This is a deliberate visual change, not a
mechanical routing**, and it is called out because the rest of the sweep aimed to
preserve appearance. The typed-confirmation gate above it is what arms it, so it
is the confirm half of a destructive pair and should look like one.

## Why the counts are gone from the component

`Button.jsx`'s header carried four counts and three were wrong — the subject of
the correction in `claude/state-of-play.md` and commit `8a83ba6`. They were
re-measured while writing this and **did not match the correction either**.

`scripts/docs-check.mjs` bans test counts in the docs precisely because every
count this repo has written down rotted within days. Nothing bans them in the
CODE, which is the one place with higher precedence than the docs. So the header
now states the invariant and points at the test that enforces it. **A number in a
comment is a claim nobody re-checks; a test is a claim that re-checks itself.**

## What this does not settle

- The remaining raw buttons are recorded as deliberate, but nobody has audited
  whether every one of them is still the right control. That is a design
  question, not a consolidation one.
- ⚠️ **Only the sign-in screen has been seen in a real browser.** Measured on
  deploy-preview-18 at 375px, the routed primary came back exactly as designed —
  8px radius, 12px vertical padding, **47px tall** (clearing the 44px floor that
  motivated the size change), brand fill over a 3px `brand-deep` bottom edge, and
  no console errors. The deliberately-raw controls beside it were untouched: the
  mode tabs stayed 36px with no bottom edge, and the text links had no radius or
  chrome. **Everything behind the login is unit-tested only**, and that is most of
  the sweep — signing in needs a real account.
