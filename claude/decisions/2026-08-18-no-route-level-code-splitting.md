# Route-level code splitting was measured and NOT taken

**18 Aug 2026. Jay's ruling**, made against measurements rather than against an
estimate. Recorded because `claude/open-items.md` had carried "route-level
`React.lazy` on `AdminDashboard`, `MatchSheet`, `PlayerImport` and `Allocation`"
as an open saving since 13 Aug, with a remembered figure beside it, and every
session reading that file would have re-proposed it.

**The change was built as a spike, measured three ways, and reverted.** Nothing
was committed to `src/`.

## What it was actually worth

Measured on this repo, `npm run build`, only the split changed:

| | Entry chunk (gzip) | PWA precache |
|---|---|---|
| As shipped today | **283.51 kB** | 1301.07 KiB, 11 entries |
| Split | **244.08 kB** | 1305.66 KiB, 30 entries |
| Split, desktop-only admin chunks left out of the precache | 244.08 kB | 1228.44 KiB, 18 entries |
| Split, admin **and** `Accounts` left out | 244.08 kB | 1194.26 KiB, 17 entries |

⚠️ **The saving is REAL and it is bigger than the figure that was on file.**
`open-items.md` recorded −27.26 kB gzip; the spike measured **−39.43 kB**,
because it split the coach screens (`Lineup`, `GameTime`, `MatchSheet`,
`Accounts`) as well as the four that entry named. So this was not refused for
being smaller than advertised.

## ⚠️ The argument FOR it, which was the strongest one, and which is FALSE

**The case that nearly carried this was that splitting would make every deploy
cheaper for members.** The app is one chunk, so the reasoning went: change one
admin screen today and every family re-downloads the whole thing, whereas with
split chunks only the edited screen's chunk changes its hash.

**It was tested and it does not happen.** One rendered string was changed in
`src/screens/Allocation.jsx` and the build compared against the same build
without it. **Every chunk's hash moved — all twenty, not just `Allocation`'s.**

The mechanism, which generalises to any Vite app on the default config:

1. `Allocation`'s content changes, so `Allocation-<hash>.js` changes.
2. The entry chunk holds the URL of every lazy chunk, so the **entry** hash changes.
3. Every other lazy chunk imports its shared code **from the entry chunk**, so
   its own import statement changes, so **its** hash changes.

A cascade from one leaf to all of them. **Deploys therefore cost members exactly
what they cost today — the split is neither better nor worse.** Closing this off
would need a `manualChunks` vendor split as well, which is a separate and larger
piece of work and was not proposed.

⚠️ **This is why the item was closed rather than merely deferred.** With the
deploy saving gone, the whole change buys one thing: a smaller FIRST load for
somebody opening the site in a browser. It does nothing for an installed member,
who starts from the precache either way.

⚠️ **AND THE FIRST MEASUREMENT OF IT WAS A FALSE NEGATIVE, TWICE.** A comment
added to `Allocation.jsx` produced a byte-identical bundle, because the minifier
strips comments; an exported `const` nobody imports produced a byte-identical
bundle too, because Rollup tree-shakes it. Both reads said "one edit changes
nothing", which is the opposite of the truth. **Only an edit to a string that is
actually rendered moves the hash** — verified by grepping the marker out of the
built bundle before trusting the comparison.

## The trade that was on the table, for whoever re-opens this

Splitting alone makes every install **larger** (+4.59 KiB), because Workbox
precaches the new chunks too. The install only shrinks if chunks are deliberately
left out of the precache via `globIgnores` — and a chunk that is not precached
has **no offline story at all**, because `runtimeCaching` in `vite.config.js`
covers Supabase REST GETs and not JavaScript.

- Leaving the ten **desktop-only admin** screens out was the recommended shape:
  −72.63 KiB off every family's install, against an offline case those screens
  never had. `src/App.jsx` already calls that group admin-only and desktop-only.
- Leaving **`Accounts`** out as well was measured (−106.81 KiB) and **recommended
  against**: `/approvals` renders `Accounts`, and that is a coach approving a
  registration from a phone, plausibly on bad signal at a pitch. It would fail
  to open where it works today.

## What would change the answer

- **A `manualChunks` vendor split landing for another reason.** That breaks the
  hash cascade above, and the deploy saving — the argument that actually
  mattered — becomes real.
- **The entry chunk growing materially.** −39.43 kB is ~14% of it today; the
  same absolute saving against a much larger bundle is a different decision.
- **A measured complaint about first load** from a family on a slow connection.
  This was refused on the balance of a modest gain against added moving parts on
  a live site, not on a belief that first load is fast.

⚠️ **Do not re-open it on the strength of the bundle-size warning Vite prints on
every build.** That warning fires at 500 kB and says nothing about whether
splitting helps this app's members; it was present throughout the measurements
above.
