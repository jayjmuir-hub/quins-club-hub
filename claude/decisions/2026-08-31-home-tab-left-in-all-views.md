# Home sits on the LEFT of the bottom bar, in every view

**Decided 31 Aug 2026 by Jay.** Reverses the 29 Aug decision to centre Home on
the wide five-tab bar. Home is now at the far left of the mobile dock for
everyone — parent, player, squad staff — which is simply its natural `NAV_ITEMS`
slot, so the dock does no reordering at all.

There was never a decision record for the centring itself; it lived only in an
inline comment and one paragraph of `claude/specs/design-system.md`, both of
which this change rewrites. **This file exists so the argument is not lost with
the code**, because the idea was a reasonable one and will be proposed again.

## What was built, and why it was a good idea

`src/components/Nav.jsx` pulled the Home item out of the list and re-inserted it
at `floor(count/2)` — dead centre — but only when the bar had five tabs.

The reasoning (#526, 29 Aug 2026):

- The app **opens on Home**. The PWA `start_url` is `/`, which routes to the
  Dashboard.
- On a phone held one-handed, the **middle of a full-width bar is where the
  thumb rests**. The edges are the reach.
- So the tab you land on should be the tab already under your thumb.

That is a real ergonomic argument and it is why this was tried rather than
guessed at. It is not refuted below — it is outweighed.

## What actually killed it

**The exception it forced.** Within a day the four-tab parent/player bar had
been pulled back out of it (#531, 30 Aug 2026). That bar had just become a
narrow centred island (#530) because the full-width `justify-between` spread
scattered only four tabs — and on a ~300px island the middle is no longer the
thumb's resting slot, so the whole argument above evaporates while the cost
stays. Home went back to the left there.

That left the app putting **Home in two different places depending on who was
looking at it**:

| Who | Tabs | Home |
|---|---|---|
| Parent / player | 4 | far left |
| Squad staff | 5 | centre |

Three things follow, and together they are the decision:

1. **Position stops being learnable.** A coach who is also a parent sees the
   same app move its most-used tab when they switch accounts. Muscle memory is
   the entire benefit of a fixed bottom bar, and a conditional slot spends it.
2. **Every artefact has to carry both cases** — two test assertions, two
   paragraphs of spec, and any screenshot of the dock is now correct for one
   audience and wrong for the other. The parent-facing guides are built from
   `harness/shoot-*.mjs` PNGs, so "which bar is this" became a question a guide
   author had to get right silently.
3. **The thumb argument only ever applied to one of the two bars.** Keeping it
   meant keeping the split permanently, not until some tidy-up.

Jay's call, 31 Aug 2026: one rule, all views, Home on the left.

## The argument AGAINST this decision

Recorded deliberately, because it is the one that will come back:

- **The ergonomic point still stands for the five-tab bar.** Nothing here shows
  the centre is a worse place for a thumb on a full-width dock. What it shows is
  that the *inconsistency* costs more than the reach saves. If the four-tab
  island were ever retired — if every user got the same wide bar — the argument
  for centring would be live again and would deserve a fresh look.
- **Home is also the tab you need least often**, since the app opens there
  already. Optimising the easiest slot for it is arguably backwards, and an
  equally good proposal is to put the *most-reached* tab in the middle. Nobody
  has measured which tab that is, and this decision does not settle it.

**Do not reinstate centring without answering the split.** Reinstating it on the
five-tab bar alone recreates exactly the two-places-for-Home state this reverses,
and that loop has now run three times: centre (#526), left-on-four-tabs (#531),
left-everywhere (this).

## What changed

- `src/components/Nav.jsx` — the reorder is deleted and replaced by a tombstone
  comment; `items` is `base`. `compact` survives, gating the dock's **width**
  only. Geometry, spacing, the Squad-Hub-before-Chat order and the desktop
  Sidebar are all untouched.
- `tests/nav.test.jsx` — the five-tab assertion now expects
  `['Home', 'Schedule', 'Roster', 'Squad Hub', 'Chat']`. Proven against an
  injected fault: restoring the old reorder fails both five-tab assertions.
- `claude/specs/design-system.md` — the Home-position paragraph rewritten.

## What was NOT changed

`NAV_ITEMS` never moved through any of this. It has always led with Home, and
the desktop `Sidebar` that imports it — a vertical list, where the top is the
right place for Home — was never affected in either direction.
