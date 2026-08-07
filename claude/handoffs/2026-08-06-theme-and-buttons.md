# Handoff — 6 Aug 2026, session 3 (theme, typography, home screen, More)

Machine: **jay-pc** (`C:\Users\jayjm\GitHub\quins-club-hub`). Branch
`build/v1-mvp`, which deploys to production.

**Everything below is pushed, deployed and live.** `main` was fast-forwarded
to match (see "Branches"). Working tree clean, `0 0` against the remote.
**1157 tests across 51 files.**

```
8254a45  fix(more): contact and parent rows never rendered
7aa73ad  feat(more): your details, your players, calendar link
44e4c93  feat(dashboard): remove the countdown, and its timer
0aa3263  feat(home): fortnight strip on the dashboard
f517593  fix(dashboard): stop calling a training session a fixture
9ea243f  fix(masthead): account name at wide, not desktop
6008433  feat(home): greeting + My account button
319c853  feat(dashboard): stat band is staff-only
923c421  style(type): Anton + Barlow + Barlow Condensed -> Inter
172ae23  feat(ui): Button component + arrow badge
c5315ba  feat(theme): press feedback + a green the re-point missed
d47c671  style(theme): re-point palette at the club redesign
054e896  feat(roster): open a player from their name + avatars
fd3f203  fix(login): session-expired msg, email-cap copy, embedded
9eebd7d  feat(account): account deletion + privacy policy
```

---

## ⚠️ THE THREE MISTAKES THIS SESSION SHIPPED

Read these before writing anything. Each was found by Jay on production, not
by the suite.

**1. A mock that encoded my assumption, not the contract.**
`listContactsForPlayers` and `listParentsForPlayers` return **arrays** of rows
carrying `player_id`. The More screen indexed them as maps
(`contacts[player.id]`), which on an array is silently `undefined`. Contact
and parent rows rendered as nothing, in production, **with 1157 tests
green** — because the mocks returned the map shape I had assumed. Fixed in
8254a45. *Mock the shape the dependency actually returns.*

**2. Searching for a string in the shape you expect.**
The palette re-point left the `.harlequin` diagonal on the OLD green for a
commit, because it is written `rgba(59, 208, 112, .26)` and the search was for
the hex `3bd070`. The same class of error nearly produced a false "verified"
on the deployed CSS — **Tailwind compiles most colours to `rgb()` triplets**,
so a hex-only grep proves nothing. And on this site a **200 is not proof a
file exists**: the SPA catch-all answers any unknown path with `index.html`.
Check `content-type`.

**3. Spending width that was not there.**
The account button shipped with the name at the `desktop` breakpoint and
truncated the club name to "ABU DHABI HARLE…" at ~1114px. Inter is wider than
the Barlow Condensed it replaced and the masthead had no slack left. Moved to
`wide` (1280px) in 9ea243f. jsdom applies no CSS, so **no unit test can catch
a layout overflow** — the regression test pins the breakpoint *token* instead.

---

## What the app looks like now

**Theme** re-pointed at the current club redesign (abudhabiquinspreview.xyz),
read off its live computed CSS custom properties.

| | was | now |
|---|---|---|
| red | #e11b22 | **#c8102e** |
| red on dark chrome | #ff8f8f | **#ff2d4a** |
| green | #3bd070 | **#2a9d55** |
| page well | #eef0f3 (blue-tinted) | **#f3f3f3** (neutral) |
| borders | #dfe2e8 | **#e5e5e5** |
| chrome | #0c0c0e | **#0a0a0a** |
| type | Anton + Barlow + Barlow Condensed | **Inter** (6 self-hosted cuts) |

⚠️ **The club site has TWO reds.** `#ff2d4a` is the DARK-mode value and is
what the homepage shows. On light surfaces white-on-it is **3.67:1** — a hard
AA failure that would have hit every primary button. `#c8102e` is the
light-mode value, 5.88:1, and better than the #e11b22 it replaced.

**Home screen**: greeting ("Good morning, Jay", time-based, device clock) →
next-event hero → fortnight strip → stat band (staff only) → upcoming /
quick actions / last result.

**Masthead**: crest, club name, role, and a **My account** button (initial
in a circle, name at ≥1280px) linking to /more.

**More**: You (name, email, role, squads) · Your player(s) with the contact
and parent rows the club holds · Your calendar (the .ics feed, which used to
live only on Schedule) · Manage (admin, desktop) · Privacy / Delete account.

**Roster**: clicking a player's NAME opens them, and avatars sit beside names
in the desktop table.

---

## Rules that must not be broken

**⚠️ A withheld contact renders NOTHING** — no row, no note, no lock icon.
`player_contacts` is a separate table precisely so RLS can withhold it, and a
"contact details are hidden" note would confirm to someone who cannot see the
data that there IS data to see. PlayerDetail and YourPlayers both follow this;
tested in both.

**⚠️ More SHOWS, it does not EDIT.** Parents and players can already change
the photo, the player's contact row and the parent rows — that self-service
flow exists, is scoped by the database so it cannot touch name, position, age
group or captaincy, and is covered by tests/self-service.test.jsx. Everything
in More links to it. A second implementation could drift into offering a
write RLS refuses.

**⚠️ "Your players" means a membership row carrying a `player_id`** — not
"any player in a squad I can see". A coach sees thirty players and none are
theirs.

**⚠️ Colours live in four files** — `tailwind.config.js`, the CSS custom
property mirror in `src/index.css`, `scripts/contrast-check.mjs`, and the PWA
manifest + `<meta name="theme-color">`. All four move together. A stale
manifest shows as a seam between the OS status bar and the masthead.

**⚠️ `.font-display` must stay ≥800.** It was `400` because Anton shipped one
weight; Inter's 400 is body text, so that line alone would silently turn every
title regular-weight. Test asserts it.

**⚠️ Specificity.** `button:not(:disabled)` scores 0,1,1 and beats a
`.transition-colors` utility (0,1,0). A bare `transition: transform` in the
base layer would silently kill hover colour fades app-wide.

**⚠️ Fonts are self-hosted on purpose** — no Google Fonts request at runtime,
so no third-party call from a pitch-side phone on bad signal. Inter cuts are
copied from `@fontsource/inter` into `public/fonts`, not linked from
node_modules (public/ is served verbatim; a node_modules path 404s).

**Verify against the BUILT css/bundle, not the source.** Layer ordering or a
purge can drop a correct source rule from the output.

---

## Behaviour worth knowing

**Service worker is `autoUpdate`.** It takes over on the load *after* it
installs. In practice that took **five reloads** once this session. Reload
twice before believing a deploy is not live.

**No timer on the dashboard any more.** The once-a-minute re-render existed
only for the countdown, which is gone. Cost: `now` is captured at mount, so
the fortnight strip's "today" cell will not roll over at midnight for someone
who leaves the app open across it. Accepted.

**View-as does NOT cross devices.** It is `localStorage` (`quins.viewAs`),
per browser. Jay saw it "mirror" onto mobile — that was Chrome device
emulation in another tab on the same PC, which shares the same origin's
storage. On a real phone it cannot happen. The exit banner renders at every
width by design and is pinned by two tests; the preview also self-heals if
the viewer is not really an admin or the previewed team disappears.

---

## Open work

**Button migration** — Login (3) and Dashboard quick actions (2) done.
**~70 call sites across 24 files remain.** Mechanical; each screen's tests
guard its own migration.

**Not covered by Button, deliberately:** the pill-shaped chrome buttons in
the masthead (ViewAsSwitcher, role pill) — dark chrome, condensed uppercase,
their own contrast rules.

**Not taken from the club site:** hover-reveal choreography (33
`group-hover:opacity-100` on their side) and size-varied press values (they
use 0.97/0.98/0.985; this app uses 0.97 uniformly). Their `btn-shine` class
has no CSS behind it — dead markup on their side, not something missing here.

**The fortnight strip is empty** until events fall inside 14 days. Worth
deciding whether it should collapse to a line ("Nothing on until Mon 31 Aug")
rather than show fourteen blank cells.

---

## Parked by Jay, raise only if asked

- **Google Play release** — plan in `claude/plan-google-play-release.md`.
  "Bring it back up when I specifically ask." Blockers recorded there: the
  12-testers/14-day rule for personal accounts, and that a Play reviewer
  cannot sign in (magic-link only; Google requires "reusable login
  credentials that can bypass" an OTP).
- **The `supabase.co` domain on the Google sign-in screen.** App name and
  publishing status were already correct; the domain comes from `app_domain`,
  derived from the callback URL, so only a Supabase custom domain (~$10/mo +
  Pro $25/mo) changes it. Two dead Netlify domains remain in the OAuth
  client's authorised list — Google refused deletion while a client URI still
  references them.

---

## Branches

`main` was fast-forwarded from the 170-commit-old scaffold to match
`build/v1-mvp`, so anyone branching from the default branch now gets current
code. The old tip is tagged **`pre-ff-main-2026-08-06`** (`77244cb`) and
pushed. Production still deploys from `build/v1-mvp` only.

---

## Still never done by a human

**Nobody has completed a sign-up end to end.** Not the roster match, not the
no-match request path, not the welcome email. This has been true for several
sessions and is the largest open risk in the project.

**Mobile is now partly verified.** Jay sent a real phone screenshot of /more
on 6 Aug: masthead fits with the club name in full, bottom tab bar (HOME /
SCHEDULE / ROSTER / MORE) is clean. That closes the biggest worry from the
Inter change. Other screens at narrow width remain unseen — the assistant has
never been able to force a narrow viewport, so **Chrome device mode on Jay's
PC is the practical way to check the rest.**
