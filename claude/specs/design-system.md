# Quins Club Hub — Design System Reference

> ## −1. THE 2.0 RETHEME — what ships NOW (21 Aug 2026)
>
> **This section supersedes both the §0 notice below and the body where they
> disagree.** The full decision record is
> `claude/plans/2026-08-21-retheme-and-shell.md`; the tokens live in code.
> Five phases, all shipped the same day:
>
> 1. **Colour is CSS variables, in TWO themes.** `src/index.css` is the
>    single source of truth — light and dark palettes as RGB triplets —
>    and `tailwind.config.js` reads them (`darkMode: 'class'`). The dark
>    palette is the club site's own dark mode, measured live. The §0 line
>    "the source of truth is tailwind.config.js" is superseded: the config
>    is now a mapping, not a palette.
> 2. **Dark mode + toggle.** Masthead disc; stored choice beats the OS,
>    otherwise follows it live; no-flash inline script in `index.html`
>    pinned to `src/lib/theme.js` by `tests/theme-switch.test.js`. Chrome
>    (masthead, tab bar, sidebar) stays dark in BOTH themes — identity
>    lives on the chrome. `scripts/contrast-check.mjs` measures BOTH
>    palettes and fails the build on an AA miss.
> 3. **The desktop shell is the member portal's**: fixed 256px dark sidebar
>    (`src/components/Sidebar.jsx`) carrying ALL nav — Home, Schedule,
>    Roster, Squad Hub, Notices, Admin, More — masthead slimmed to a
>    utility bar, content full-width. `Nav.jsx` is the mobile tab bar only.
>    §4.1/§4.3's desktop top-nav pills and §5's 1120px cap are history;
>    the mobile anatomy below them still ships as written.
> 4. **The editorial voice** (`src/components/Editorial.jsx`): Kicker
>    (crimson slash + tiny uppercase label), AccentTitle (bold Inter +
>    ONE Playfair-italic crimson word — "Club life, *calendared.*"),
>    BlockTitle (slash + gradient rule). Playfair Display italic is
>    self-hosted alongside Inter; `.accent-word` in index.css.
> 5. **No width gate on admin.** The "needs a bigger screen" card is gone;
>    admin renders at every width and the More screen links it on the
>    phone. Role gates unchanged.
>
> **Identity:** the PWA installs as **"Club Hub"**, version 2.0.0.

> ## 0. RETHEME NOTICE — read before trusting any colour below
>
> **The app no longer uses the palette or the type described in §1–§4 of this
> document.** It was rethemed onto the Abu Dhabi Harlequins *club website*
> system (adhquins-website-redesign) so the app and the public site read as one
> brand. Everything in this file about **layout, spacing, component anatomy,
> breakpoints and interaction** is still accurate and still the reference.
> Everything about **specific colours and fonts** is history.
>
> **The source of truth for colour and type is now `tailwind.config.js`.** Every
> value there carries its measured contrast ratio in a comment.
>
> ### What changed, in one line
> Light content well, dark brand chrome: near-black masthead and bottom tab bar,
> light readable data surfaces between them, club red/green for accent, and the
> website's red→green gradient stat band on the dashboard.
>
> ### Token mapping (old → new)
>
> | Old (this doc) | New token | New value |
> |---|---|---|
> | `--maroon` `#C21F32` | `brand` | `#e11b22` |
> | `--magenta` `#D62A3D` | *(removed)* — hover now uses `brand-deep` | `#b3141a` |
> | `--plum` `#8E1526` | `brand-deep` | `#b3141a` |
> | *(red as text)* | `brand-ink` | `#b3141a` |
> | *(red as text on dark)* | `brand-onDark` | `#ff8f8f` |
> | `--green` `#7DC351` | `accent` | `#3bd070` |
> | `--sky` `#3E9C4F` | `accent-mid` | `#1f9d4d` |
> | `--sky-deep` `#2F7D3D` | `accent-ink` | `#157f3c` |
> | `--green-bg` `#eef7e6` | `accent-bg` | `#e6f7ec` |
> | `--paper` `#f5f4f3` | `surface` | `#eef0f3` |
> | `--card` `#ffffff` | `surface-card` | `#ffffff` |
> | *(seven near-white greys)* | `surface-mute` / `surface-sunk` | `#f2f4f7` / `#e6e9ee` |
> | `--text` `#221f1d` | `ink` | `#101116` |
> | `--muted` `#77726e` | `ink-muted` / `ink-faint` | `#565c67` / `#636974` |
> | `--line` `#e6e3e1` | `line` | `#dfe2e8` |
> | `--ink` `#141414` | `chrome` (masthead/tab bar) | `#0c0c0e` |
> | `--good` / `--bad` / `--warn` | `accent-mid` / `danger` / `warn` | see config |
>
> ### Type
> System sans is gone. Three self-hosted faces, in `public/fonts/`:
> - **Barlow** (`font-sans`) — all body copy, form labels, table rows. 400/500/600/700.
> - **Anton** (`font-display`) — display ONLY: screen titles, stat numerals, the
>   masthead wordmark, date chips. Never a form label or a row of data.
> - **Barlow Condensed** (`font-condensed`) — nav, eyebrows, stat labels, pills.
>   **Only 600 and 700 are bundled.** `font-condensed` without `font-semibold`
>   or `font-bold` silently falls back to Barlow.
>
> ### Rules the build enforces
> `tests/theme.test.js` fails the suite if either is broken:
> 1. **No raw hex in component class names.** Colours come from tokens or they
>    don't go in. (Comments are exempt — the prose history is worth keeping.)
> 2. **`font-condensed` always pairs with a 600/700 weight.**
>
> `scripts/contrast-check.mjs` measures every foreground/background pair the app
> renders, including sampling both gradients across their width, and exits
> non-zero on any AA failure. Run it after touching a colour.
>
> ### Contrast traps found during the retheme — do not reintroduce
> - **The website's own red→green stat band fails AA.** White text on the raw
>   `#3bd070` end measures **2.01:1**. The app's `stat-band` gradient therefore
>   ends at `#157f3c` (holds ≥4.79:1 across its full width) and the vivid green
>   lives in the decorative `brand-rule` hairline, which carries no text.
>   *The live club website still has this defect in its own `.statband`.*
> - **Brand red as small text on white is 4.0:1 — a fail.** Use `brand-ink`.
> - **Lighter-on-hover breaks red buttons.** Any red lighter than `#e11b22`
>   drops white text under 4.5:1. Hover goes *darker*, to `brand-deep`.
> - **`ink-faint` must clear AA on the page, not just on cards.** The first pass
>   used `#6f7681`: fine on white (4.58:1), failing on `surface` (4.01:1).
> - **A Tailwind `boxShadow` key must not collide with a colour key.**
>   `shadow-chrome` resolved as a shadow *colour* and silently produced no
>   shadow; it is `shadow-masthead` now.
>
> ### Why the masthead stopped being a gradient
> The old red→green header gradient painted across the full viewport while the
> content column is centred and capped at 1120px, so the colour behind the white
> text depended on monitor width. That required the green stop pushed out to
> 300% and still only reached ~5.3:1 at its worst. Flat `#0c0c0e` is 19.54:1 at
> every width, with no empirical sweep needed. The same fix applies to the Login
> and RequireAuth full-screen backgrounds, which had the identical problem.

---

Source of truth: `/home/claude/quins-club-hub/assets/prototype-downloads.html` (clean,
unrendered source — used for all code quoted below) and
`/home/claude/quins-club-hub/assets/prototype-desktop.html` (a browser-saved snapshot of
the same app with identical CSS/JS; differences noted in §9). Both are a single
self-contained HTML file: inline `<style>`, static `<body>` skeleton, and one inline
`<script>` that renders everything client-side into a handful of empty container
elements, backed by `localStorage`. There is no build step, no external CSS/JS, no
icon font — everything below is literal, copyable source.

This document is written so a React developer never needs to open the prototype file.

---

## 1. Colour tokens

All colours are declared as CSS custom properties on `:root`. Quote:

```css
:root{
  /* Abu Dhabi Harlequins official palette — red, green, black */
  --maroon:#C21F32;--magenta:#D62A3D;--plum:#8E1526;--sky:#3E9C4F;--sky-deep:#2F7D3D;
  --green:#7DC351;--green-bg:#eef7e6;
  --ink:#141414;--paper:#f5f4f3;--card:#ffffff;--line:#e6e3e1;--muted:#77726e;--text:#221f1d;
  --good:#2F9E4F;--good-bg:#e7f6ea;--bad:#d1483b;--bad-bg:#fbeae8;--warn:#c9861a;--warn-bg:#fbf1dd;
  --shadow:0 6px 24px rgba(20,20,20,.10);--shadow-sm:0 2px 8px rgba(20,20,20,.08);
  --radius:16px;--radius-sm:11px;
}
```

| Token | Hex / value | Used for |
|---|---|---|
| `--maroon` | `#C21F32` | Primary brand red. Primary button background, active tab-bar icon colour, `.chip.match` bg, focus border on inputs, `.datebox .mon` text, captain badge is a different colour (see `--warn`) |
| `--magenta` | `#D62A3D` | Primary button **hover** background |
| `--plum` | `#8E1526` | Dark red. Gradient start for topbar, hero card, avatar/initials gradients |
| `--sky` | `#3E9C4F` | Calendar dot colour for "training" events |
| `--sky-deep` | `#2F7D3D` | "DEMO" badge bg, coach role-tag text/bg accent, scope-note icon colour (coach), `.chip.training` text, availability check icon colour context |
| `--green` | `#7DC351` | Gradient end colour (topbar/header gradient tail) — official club green |
| `--green-bg` | `#eef7e6` | `.chip.training` background, coach `.scope-note` background |
| `--ink` | `#141414` | Nav black. `.pill.active` bg, `.toast` bg, FAB icon container is maroon not ink — ink used for filled pill/toast/dark UI chrome |
| `--paper` | `#f5f4f3` | Page/body background |
| `--card` | `#ffffff` | Card background (`.card`) |
| `--line` | `#e6e3e1` | Hairline borders/dividers everywhere (cards, inputs, list row separators) |
| `--muted` | `#77726e` | Secondary/meta text colour (labels, sub-text, timestamps, empty-state text) |
| `--text` | `#221f1d` | Primary body text colour |
| `--good` | `#2F9E4F` | Win chip, "available/in" colour, avail-bar green segment |
| `--good-bg` | `#e7f6ea` | Win chip bg, home chip bg |
| `--bad` | `#d1483b` | Loss chip, "out" avail colour |
| `--bad-bg` | `#fbeae8` | Loss chip bg |
| `--warn` | `#c9861a` | Draw is NOT warn (draw uses its own grey, see below) — warn is used for the captain badge, parent scope-note accent, "maybe" avail colour |
| `--warn-bg` | `#fbf1dd` | Social event chip bg, captain badge bg, parent scope-note bg |
| `--shadow` | `0 6px 24px rgba(20,20,20,.10)` | Card, hero, `.btn` container elevation |

⚠️ **THE APP HAS DELIBERATELY DIVERGED FROM `--shadow` SINCE 12 Aug 2026, and this
table is the record of the PROTOTYPE, not a contract.** `shadow-card` in
`tailwind.config.js` is now a PAIR — a 1px contact shadow at 6% plus a wide
ambient one at 10% — because one wide soft shadow leaves nothing holding a card
to the page: the edge floats and the surface reads muddy. Same colour, same
total weight, placed where it does work. There is also `shadow-card-hover` and
`shadow-card-ring` for cards that are themselves links.
⚠️ **The prototype's single value is kept above on purpose.** It is what the
design came from, and a spec rewritten every time the app improves on it stops
being able to answer "what did we start from".
| `--shadow-sm` | `0 2px 8px rgba(20,20,20,.08)` | Smaller elevation: button, search bar, viewas bar |
| `--radius` | `16px` | Large radius — cards, hero, sheet top corners (desktop sheet uses `20px` explicitly) |
| `--radius-sm` | `11px` | Small radius — buttons, inputs, date-box, avatar squares |

**Colours used inline (not tokenised) that a developer must also capture:**

| Value | Used for |
|---|---|
| `#B23A38` | Mid-stop in the topbar gradient (see §5 header) |
| `#efeaf4` / `#7a5aa0` | `.chip.away` bg / text (purple-grey, away-match indicator) |
| `#eef0f2` / `#5a6470` | `.chip.draw` bg / text |
| `#f0ecf2` | Default `.chip` bg (neutral chip, e.g. age-group chip) |
| `#ece6f0` | `.roster-group .cnt` count-badge bg (was also `.pnum.no`, the jersey-number-less avatar — removed with jersey numbers, Task 12) |
| `#faf8fb` | `.fixture:hover` / `.player:hover` row background |
| `#f3eef5` | `.datebox` background |
| `#dcd4e0` | `.sheet-grip` (drag handle) colour |
| `#d5cdda` | Custom scrollbar thumb colour |
| `#cfc7d5` | `.p-arrow` chevron colour (roster row disclosure arrow) |
| `#f2edf4` | `.x` (sheet close button) circle background |
| `#fbf3f6` | Selected/focused pink-tinted background: `.seg label:has(input:checked)`, `.persona.sel` |
| `#eaf4fb` | `.role-coach` tag background |
| `#511034` | Fixed start colour for every avatar-initials gradient (`linear-gradient(135deg,#511034,<persona.color>)`), also reused for `.va-av` |
| `rgba(24,10,20,.5)` | `.scrim` (modal backdrop) colour, with `backdrop-filter: blur(2px)` |
| `rgba(255,255,255,.94)` | Tab bar background (translucent, `backdrop-filter: blur(12px)`) |
| `rgba(122,21,51,.45)` | FAB drop shadow colour |
| Persona accent colours | `#7a1533` (admin), `#2b7cb8` (coach), `#c9861a` (parent) — used as the second stop in each person's avatar gradient and as `role-admin`/`role-coach`/`role-parent` tag colours (role-admin reuses `--maroon`) |

**Header gradient** (the literal club-brand gradient, not a token):
```css
background:linear-gradient(100deg,var(--plum) 0%,var(--maroon) 42%,#B23A38 62%,var(--green) 100%);
```
100° angle, 4 colour stops: plum → maroon → `#B23A38` → green. This exact gradient is also reused (2-stop, `135deg,var(--plum),var(--maroon)`) for: `.hero`, `.pnum` (initials avatar), `.detail-hero`, `.persona .pa` (default), `.va-av` (viewas avatar) unless a persona colour overrides the second stop.

---

## 2. Typography

**Font stack** (declared once, on `body`):
```css
font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
```
No custom/imported webfont. `line-height:1.45` on body. `-webkit-font-smoothing:antialiased`.
`input,select,textarea{font-family:inherit;font-size:16px}` — 16px is intentional, it prevents iOS Safari zoom-on-focus.

There is no single global type scale — every text role has its own hand-tuned
`font-size`/`font-weight`/`letter-spacing`. Table below groups every occurrence by role
so a React dev can build a scale from it:

| Role | Selector | font-size | weight | letter-spacing | line-height | colour | notes |
|---|---|---|---|---|---|---|---|
| **App name (brand h1)** | `.brand h1` | 16px | 800 | .2px | 1.1 | white | in header |
| **Tagline (brand p)** | `.brand p` | 11.5px (12px ≥820px) | 600 | 1.3px | — | white, `opacity:.82` | uppercase |
| **Page/section title** | `.section-head h2` | 21px | 800 | -.2px | — | `--text` | e.g. "Schedule & Fixtures", "Roster & Members", "More" |
| **Section subtitle** | `.section-head .sub` | 13px | 500 | — | — | `--muted` | e.g. "All squads" |
| **Block/eyebrow header** | `.block-title` | 13px | 800 | .8px | — | `--muted` | UPPERCASE, e.g. "Upcoming", "Quick actions" |
| **Hero match title** | `.hero .match-title` | 23px (27px ≥820px) | 800 | — | — | white | "Quins vs Opponent" |
| **Hero label (eyebrow)** | `.hero .label` | 11px | 700 | 1.6px | — | white, `opacity:.8` | uppercase |
| **Hero meta row** | `.hero .meta div` | 13.5px | 600 | — | — | white | date/time/venue row |
| **Countdown number** | `.cd-box b` | 22px | 800 | — | 1 | white | |
| **Countdown label** | `.cd-box span` | 10px | — | 1px | — | white, `opacity:.8` | uppercase |
| **Stat tile number** | `.stat .n` | 27px | 800 | -.5px | 1 | `--text` (or `.maroon`/`.sky` variant) | |
| **Stat tile label** | `.stat .l` | 12.5px | 600 | — | — | `--muted` | |
| **Card/list-row title** | `.fx-title` (fixture), `.pinfo .nm` (player) | 15.5px / 15px | 800 / 700 | — | — | `--text` | fixture title vs player name |
| **List row meta/caption** | `.fx-sub`, `.pinfo .pos` | 12.5px | — (400) | — | — | `--muted` | time/venue/competition; position · team |
| **Datebox month** | `.datebox .mon` | 10.5px | 800 | .5px | — | `--maroon` | uppercase |
| **Datebox day number** | `.datebox .day` | 21px | 800 | — | 1 | `--text` | |
| **Datebox weekday** | `.datebox .dow` | 10px | 600 | — | — | `--muted` | |
| **Chip/badge text** | `.chip` | 11.5px | 700 | — | — | contextual | pill-shaped label |
| **Pill (filter tab) text** | `.pill` | 13px | 700 | — | — | `--muted` / white when `.active` | |
| **Button text** | `.btn` | 14px | 700 | — | — | white / `--maroon` (ghost) | `.btn.sm` = 13px |
| **Detail-hero title** | `.detail-hero h3` | 22px | (browser bold, ~700) | — | — | white | event/player detail sheet header |
| **Detail-hero subtitle** | `.detail-hero p` | inherited (~14px body) | 600 | — | — | white, `opacity:.85` | |
| **Key/value row** | `.kv` | 14.5px | — / `.k` 600 muted, `.v` 700 right-aligned | — | — | `--text`/`--muted` | detail sheet rows |
| **Form field label** | `.field label` | 12.5px | 700 | .4px | — | `--muted` | uppercase |
| **Form field input text** | `.field input/select/textarea` | 16px (forced, anti-zoom) | 400 | — | — | `--text` | |
| **Persona name** | `.persona .pt b` | 15px | 800 | — | — | `--text` | |
| **Persona subtitle** | `.persona .pt span` | 12.5px | 600 | — | — | `--muted` | |
| **Role tag** | `.role-tag` | 10px | 800 | .5px | — | contextual | uppercase, pill |
| **Toast text** | `.toast` | 14px | 600 | — | — | white | |
| **Footer note** | `.foot-note` | 11.5px | — | — | 1.6 | `--muted` | centered |
| **Empty state** | `.empty` | 14px | — | — | — | `--muted` | centered, icon above text |
| **Search input** | `.search input` | inherits 16px | 400 | — | — | `--text` | |
| **Cal weekday header** | `.cal-dow` | 10.5px | 800 | — | — | `--muted` | uppercase |
| **Cal cell number** | `.cal-cell` | 12.5px | 600 | — | — | `--text` | |
| **Cal month heading** | `.cal-head b` | 16px | 800 | — | — | `--text` | |
| **Availability legend** | `.avail-legend span` | 12px | 700 | — | — | `--muted` | |
| **Score** | `.score` | 16px | 800 | — | — | `--text` | e.g. "31–19" |

There is no explicit body-copy class — general paragraph text (e.g. the persona-picker
intro line, the "About this prototype" blurb) is set inline per instance, typically
`font-size:13.5px;line-height:1.5-1.6;color:var(--muted)`.

---

## 3. Spacing, radii & shadows

```css
--shadow:0 6px 24px rgba(20,20,20,.10);
--shadow-sm:0 2px 8px rgba(20,20,20,.08);
--radius:16px;      /* cards, hero, mobile sheet top corners */
--radius-sm:11px;   /* buttons, inputs, small tiles */
```

Concrete measurements pulled from the stylesheet:

- **Card**: `.card{background:var(--card);border-radius:var(--radius);box-shadow:var(--shadow);border:1px solid var(--line)}` — no padding by default; padding is added per-context (e.g. `.stat{padding:15px 16px}`, inline `style="padding:14px"` on quick-actions card, `style="padding:16px"` on the about card).
- **List row padding**: `.fixture{padding:14px}`, `.player{padding:11px 14px}`, `.kv{padding:12px 0}`, divided by `1px solid var(--line)`, with `:last-child{border-bottom:none}`.
- **Section spacing**: `.section-head{margin:4px 0 14px}`, `.block-title{margin:18px 2px 10px}`.
- **Page gutters**: `main{padding:16px 16px 100px}` (100px bottom = clearance for fixed tab bar + FAB); desktop `main{padding:20px 20px 60px}`.
- **Max content width**: `main`, `.topbar-inner`, `.viewas-inner` all `max-width:1120px;margin:0 auto`.
- **Grid gaps**: `.stat-grid{gap:12px}`, `.field-row{gap:12px}`, `.dash-cols{gap:18px}`, `.cal-grid{gap:5px}`, `.pill-row{gap:8px}`.
- **Buttons**: `.btn{padding:10px 15px;border-radius:11px}`, `.btn.sm{padding:7px 11px}`.
- **Inputs**: `.field input,.field select,.field textarea{padding:11px 12px;border-radius:11px;border:1.5px solid var(--line)}`, focus state `border-color:var(--maroon)` (colour swap only, no glow/ring).
- **Avatars / initials tiles**: `.pnum{40×40px, border-radius:11px}`, `.dh-num{56×56px, border-radius:14px}`, `.va-av{32×32px, border-radius:9px}`, `.persona .pa{40×40px, border-radius:11px}`.
- **Chips/pills**: `.chip{padding:3px 9px;border-radius:20px}` (fully rounded), `.pill{padding:7px 14px;border-radius:20px}`.
- **FAB**: `54×54px`, `border-radius:50%`, fixed `right:18px; bottom: calc(safe-area+80px)`, shadow `0 8px 24px rgba(122,21,51,.45)`.
- **Sheet (mobile)**: top corners `22px 22px 0 0`, `max-height:92vh`. **Sheet (desktop ≥820px)**: full `20px` radius, centered modal `width:min(520px,94vw); max-height:88vh`.
- **Datebox**: fixed width `52px`, `border-radius:11px`, `padding:8px 4px`.
- **Cal cell**: `aspect-ratio:1`, `border-radius:9px`, `1px solid var(--line)`, `padding:5px`.
- **Safe-area handling**: topbar top padding uses `calc(env(safe-area-inset-top) + 12px)`; tab bar and FAB bottom offsets add `env(safe-area-inset-bottom)`.

---

## 4. Component inventory

For every component: structure (element tree / class names), styling, states, behaviour.
All icons referenced below are inline SVG strings from the `I` icon dictionary — see §8.

### 4.1 Top bar / header (`.topbar`)
```html
<header class="topbar">
  <div class="topbar-inner">
    <div class="badge"></div>                 <!-- crest, CSS background-image -->
    <div class="brand"><h1>Abu Dhabi Harlequins</h1><p>Quins Club Hub</p></div>
    <div class="spacer"></div>
    <nav class="nav-desktop" id="navDesktop"></nav>   <!-- desktop only -->
  </div>
</header>
```
- `position:sticky;top:0;z-index:40`, gradient background (§1), white text, `box-shadow:0 2px 16px rgba(20,20,20,.28)`.
- `.badge`: 46×46px, `background:url(<crest.png data-uri>) center/contain no-repeat; filter:drop-shadow(0 1px 3px rgba(0,0,0,.35))`. No `<img>` tag — it's a CSS background image on an empty div.
- `.nav-desktop` is `display:none` on mobile, `display:flex;gap:4px` at ≥820px. Buttons: `padding:8px 14px;border-radius:10px;font-weight:600;opacity:.82`, `.active{background:rgba(255,255,255,.16);opacity:1}`, hover → `opacity:1`, transition `.15s`.

### 4.2 "Viewing as" bar (`.viewas`) — demo-only, drop for real app
```html
<div class="viewas" id="viewas">
  <div class="viewas-inner">
    <span class="va-badge">DEMO</span>
    <div class="va-av">PM</div>              <!-- initials avatar -->
    <div class="va-info"><div class="r">Priya Menon</div><div class="s">Club Admin · All age groups</div></div>
    <button class="va-switch" id="vaSwitch">↔ Switch view</button>
  </div>
</div>
```
`position:sticky;top:0;z-index:39` (sits directly under the header when scrolling), white bg, bottom hairline + `--shadow-sm`. This entire bar is the demo role-switcher; the real app replaces it with nothing (or a small "signed in as X" chip at most) since real logins replace persona-switching. Its scoping logic (see §7 `PERSONAS`, `canSee`, `visibleTeams`) is the important part to port — it defines the RLS-equivalent client-side filtering pattern coaches/admin/parents each need.

### 4.3 Bottom tab bar (mobile) / desktop nav
```html
<nav class="tabbar" id="tabbar">
  <button data-nav="home" class="active">{svg}<span>Home</span></button>
  <button data-nav="schedule">{svg}<span>Schedule</span></button>
  <button data-nav="roster">{svg}<span>Roster</span></button>
  <button data-nav="more">{svg}<span>More</span></button>
</nav>
```
- Mobile: `position:fixed;bottom:0;z-index:45`, `grid-template-columns:repeat(4,1fr)`, translucent white `rgba(255,255,255,.94)` with `backdrop-filter:blur(12px)`, top hairline. Each button: icon (23×23 svg) stacked above 10.5px/700 label, `.active{color:var(--maroon)}`, inactive `color:var(--muted)`.
- Desktop (≥820px): `.tabbar{display:none}` — replaced entirely by `.nav-desktop` in the header (§4.1). Same 4 items, same active/inactive logic, rendered from the same `NAV` array/`buildNav()` function into both containers simultaneously.
- The exact same markup (icon+label button) is reused for both bars — `buildNav()` writes identical `innerHTML` into `#tabbar` and `#navDesktop`.

### 4.4 FAB (floating action button)
```html
<button class="fab" id="fab" title="Add">{plus svg}</button>
```
54×54px circle, fixed bottom-right, maroon bg, white icon, shadow `0 8px 24px rgba(122,21,51,.45)`. Hidden entirely on desktop (`display:none` ≥820px — desktop uses the inline "Add" buttons instead). Hidden whenever the current persona `canEdit()` is false (parents). Click: opens "Add player" form if on Roster tab, otherwise "Add event" form.

### 4.5 Card (`.card`)
Base container: white bg, `var(--radius)` (16px), `var(--shadow)`, `1px solid var(--line)`. No default padding — used both as a bare wrapper around list rows (rows supply their own padding + dividers) and as a padded content box (padding added inline or via a modifier context like `.stat`).

### 4.6 Stat tile (`.card.stat`)
```html
<div class="card stat"><div class="n maroon">159</div><div class="l">Registered players</div></div>
```
`padding:15px 16px`. Big number `.n` (27px/800, optional `.maroon`/`.sky` colour class), label `.l` (12.5px/600 muted) below. 4 tiles in `.stat-grid` = `grid-template-columns:repeat(2,1fr)` mobile, `repeat(4,1fr)` desktop.

### 4.7 Chip / badge (`.chip`)
Pill-shaped inline label, `padding:3px 9px;border-radius:20px;font-size:11.5px;font-weight:700`. Variants (all just background/colour swaps): `.match` (maroon/white), `.training` (green-bg/sky-deep), `.social` (warn-bg/warn), `.home` (good-bg/good), `.away` (`#efeaf4`/`#7a5aa0`), `.win` (good-bg/good), `.loss` (bad-bg/bad), `.draw` (`#eef0f2`/`#5a6470`). Default (no variant class) = neutral `#f0ecf2`/muted, used for age-group labels like "Senior Men 1st XV".

### 4.7a Event-type marks (`src/components/EventTypeIcon.jsx`)

**match = solid rugby ball · training = cone (rounded tip) · social = two
people.** Rendered by `Chip` at `h-3 w-3` and by the §5.5 detail hero at
`h-7 w-7`. ⚠️ **Replaced whistle/shirt/trophy on 12 Aug 2026** — a whistle
starts training as often as a match, a shirt says "kit" not "session", and a
trophy means WINNING while sitting on the end-of-term BBQ. Jay's rulings against
drawn alternatives; do not reinstate them.
`claude/plans/2026-08-12-duplicate-event-and-type-icons.md` holds the full
tombstone and the options rejected.

⚠️ **`Chip` decides the mark, not the caller.** Three components draw a type
chip (`FixtureRow`, `ScheduleTable`, and the hero); passing an icon from each
would be three chances to forget one and for two screens to disagree.

⚠️ **Only the three event types get one.** Win/loss/draw and the neutral
age-group chip never do — they are not event types, and a row where every pill
carries a picture stops being scannable. An unrecognised type gets NO mark, and
never a fallback one.

⚠️ **The ball is solid where the other two are outlines, deliberately.** `.match`
is the only variant with a dark fill; a 2px hairline that reads on `#e6f7ec`
dies on solid red at 11.5px. Its seam is a **mask**, not stroked lines — the
chip's opaque red and the hero's translucent box share no colour to stroke in —
and the mask id must come from `useId`, since two match chips in one list would
otherwise collide on it.

Marks are decorative (`aria-hidden`): the word they mark is always beside them.

### 4.8 Pill / filter tab (`.pill`)
```html
<button class="pill active" data-tab="upcoming">Upcoming</button>
```
Horizontally-scrollable row (`.pill-row{display:flex;gap:8px;overflow-x:auto}`, scrollbar hidden). Inactive: white bg, `--muted` text, `box-shadow:inset 0 0 0 1.5px var(--line)` (border simulated via inset shadow, not `border`). Active: `background:var(--ink);color:#fff;box-shadow:none`. Used for both the schedule sub-tabs (Upcoming/Results/Calendar) and the team filter row (All/U6/.../Women's XV), and again for the roster team filter (label suffixed with a live count, e.g. "U10 · 9").

### 4.9 Search bar (`.search`)
```html
<div class="search">{search svg}<input id="rSearch" placeholder="Search name, position, age group"/></div>
```
White pill, `box-shadow:inset 0 0 0 1.5px var(--line)`, icon + borderless input. Behaviour: `oninput` re-renders the whole roster view on every keystroke (`rosterQuery=s.value;renderRoster()`), then manually restores focus and caret position afterward (`ns.setSelectionRange(pos,pos)`) since the full re-render replaces the input element. Filters players client-side by substring match against name, position and team (case-insensitive). The prototype also matched jersey number; that is gone with jersey numbers (Task 12).

### 4.10 Empty state (`.empty`)
```html
<div class="empty">{icon svg}<div>No players match.</div></div>
```
Centered, `padding:44px 20px`, icon 42×42 at 40% opacity above 14px muted text.

### 4.11 Hero / next-fixture card (`.hero`)
```html
<div class="hero">
  <div class="label">Next Fixture · Senior Men 2nd XV</div>
  <div class="match-title">Quins <span class="vs">vs</span> Al Ain Amblers</div>
  <div class="meta">
    <div>{cal icon} Fri 24 Jul</div><div>{clock icon} 5:00 PM</div>
    <div>{pin icon} Zayed Sports City</div><div><span class="chip home">HOME</span></div>
  </div>
  <div class="countdown">
    <div class="cd-box"><b>4</b><span>Days</span></div>
    <div class="cd-box"><b>8</b><span>Hrs</span></div>
    <div class="cd-box"><b>0</b><span>Min</span></div>
    <div class="cd-box"><b>14</b><span>Available</span></div>
  </div>
</div>
```
Dashboard-only, top of the Home view. Same plum→maroon diagonal gradient as other "hero" surfaces, `border-radius:var(--radius)`, `padding:18px`, `overflow:hidden` with a decorative `::before` conic-gradient blob in the top-right corner (rotated 15°, purely decorative). 4-column countdown row (`display:flex;gap:10px`, each box `flex:1`, translucent white `rgba(255,255,255,.14)` chip). Only shown if there's an upcoming event (`next` truthy) — computed as the next `type==="match"` event, falling back to the very next event of any type if no match is upcoming. Days/Hrs/Min are computed live against a **hardcoded demo "now"**: `function now(){return new Date("2026-07-20T09:00:00")}` — the real app must use `Date.now()`. 4th box is not a countdown value — it's the RSVP "in" count for that event.

**Timezone (Task 11 amendment, for Task 13's dashboard).** The hero's date and time lines are **Abu Dhabi time** — reuse `dateBoxParts`/`formatLongDate`/`formatTime` from `src/lib/eventFormat.js`, don't reformat locally. The countdown itself is a pure instant subtraction (`starts_at` − `Date.now()`) and is correctly zone-agnostic; leave it that way rather than routing it through the club zone. See §7's timezone note.

### 4.12 Countdown component (`.countdown`/`.cd-box`)
Standalone reusable piece of the hero (see above): `background:rgba(255,255,255,.14);border-radius:10px;padding:8px 0;text-align:center;flex:1`, big number 22px/800, uppercase 10px label below at 80% opacity.

### 4.13 Fixture / event row (`.fixture`)
The single most-reused component — used identically in Home "Upcoming" list, Home "Last result", full Schedule list (all 3 tabs), and inside the Calendar's "events this month" list.
```html
<div class="fixture" data-event="1001">
  <div class="datebox"><div class="mon">Jul</div><div class="day">21</div><div class="dow">Tue</div></div>
  <div class="fx-body">
    <div class="fx-top"><span class="chip training">TRAINING</span><span class="chip">Senior Men 1st XV</span></div>
    <div class="fx-title">Senior Squad Training</div>
    <div class="fx-sub"><span>{clock} 7:30 PM</span><span>{pin} Zayed Sports City</span></div>
  </div>
  <div class="fx-right"><div class="avail-mini">{check} 22</div></div>
</div>
```
`display:flex;gap:13px;padding:14px`, bottom hairline divider (`:last-child` none), `cursor:pointer`, hover `background:#faf8fb`, transition `.12s`. Left: fixed 52px date box. Middle (`flex:1;min-width:0`): type+team chips row, title, meta row (clock/pin/trophy icons + text, wraps on small widths). Right (`flex:0 0 auto`): for upcoming events, a green "✓ N" available count (`.avail-mini`); for past/results events, a result chip (WIN/LOSS/DRAW) stacked above the score e.g. "31–19". Click anywhere on the row opens the Event Detail sheet (`wireList()` binds `onclick` to every `[data-event]` element after each render — since content is fully re-rendered via `innerHTML`, listeners must be rebound every render, there is no event delegation).

The date box (month / day / weekday) and the meta row's time are **Abu Dhabi time**, via `dateBoxParts` and `formatTime` from `src/lib/eventFormat.js` — see the timezone note under "Event object" in §7. The row itself carries no zone label; only the detail sheet says so (§4.21).

### 4.14 Calendar grid (`.cal-grid`)
```html
<div class="card" style="padding:14px">
  <div class="cal-head"><b>July 2026</b><div class="cal-nav"><button id="calPrev">‹</button><button id="calNext">›</button></div></div>
  <div class="cal-grid">
    <div class="cal-dow">Sun</div>...<div class="cal-dow">Sat</div>  <!-- 7 headers -->
    <div class="cal-cell out"></div>  <!-- leading blanks for days before month start -->
    <div class="cal-cell today" data-event="1001"><!-- day number --> 21<div class="dots"><span class="cal-dot match"></span></div></div>
    ...
  </div>
  <div><!-- legend: Match / Training / Social dots + labels --></div>
</div>
<div class="card"><!-- .fixture rows for every event that month, chronological --></div>
```
`grid-template-columns:repeat(7,1fr)`, `gap:5px`. Each `.cal-cell` is `aspect-ratio:1` (perfect square), white bg, `1px solid var(--line)`, `border-radius:9px`, `padding:5px`, `font-size:12.5px/600`. `.out` (days from adjacent months, only leading blanks are rendered — no trailing blanks) = `opacity:.35`. `.today` gets a maroon border + inset ring. Up to 4 small 6×6px coloured dots (`.cal-dot.match`=maroon, `.training`=sky, `.social`=warn) stack bottom-left inside the cell for each event that day; cell is clickable (opens the first event of that day) only if it has ≥1 event. Month navigation is prev/next arrow buttons (34×34px circular icon buttons) — no "today" jump button, no year picker, no swipe gesture.

**Timezone (Task 11 amendment).** Which cell a fixture's dot lands in, which month the grid opens on, and which cell gets `.today` are all computed on the **club's** calendar day (`clubDayParts` / `clubToday`, `Asia/Dubai`), never the browser's — a 01:00 Dubai kick-off is 21:00 the previous day in UTC, and for four hours of every UTC day the club is already on tomorrow. The month heading is formatted off a UTC-anchored anchor date for the same reason. See §7's timezone note.

### 4.15 Roster group header + player row
```html
<div class="roster-group">
  <div class="gh">Forwards <span class="cnt">10</span></div>
  <div class="card">
    <div class="player" data-player="12">
      <div class="pnum">TF</div><!-- initials, not a jersey number — see the note below -->
      <div class="pinfo"><div class="nm">Tom Fletcher<span class="p-cap">Capt</span></div><div class="pos">Flanker · U15</div></div>
      <div class="p-arrow">›</div>
    </div>
    ...
  </div>
</div>
```
`.gh` group header: 12.5px/800 uppercase muted label + rounded count badge (`.cnt`, `#ece6f0` bg). `.player` row: `display:flex;gap:12px;padding:11px 14px`, hairline divider, hover bg, cursor pointer. `.pnum`: 40×40px rounded-square badge with the plum→maroon gradient. ⚠️ **Superseded (Task 12):** the prototype filled this tile with a jersey number and had a flat `#ece6f0` `.pnum.no` "–" variant for players without one. **The club does not use jersey numbers** (confirmed with Jay), so the tile shows **initials derived from `full_name`** ("TF"), it is always populated, and the `.pnum.no` variant no longer exists. The tile is `aria-hidden` — it restates the name beside it. See `src/lib/playerFormat.js` for the initials rules (middle names skipped; a hyphenated or apostrophed surname is one name; a single-word name uses its first two letters). `.pinfo .nm`: name (700/15px) + inline `.p-cap` "Capt" badge (10px/800, warn colours, uppercase) if `player.cap` is true. `.pinfo .pos`: "Position · Age Group" (12.5px muted). `.p-arrow`: chevron-right in light grey, purely a visual affordance (whole row is clickable, arrow isn't separately interactive). Click → Player Detail sheet.

### 4.16 Bottom sheet / modal (`.sheet` + `.scrim`)
The **single generic modal** used for every overlay in the app: event detail, event add/edit form, player detail, player add/edit form, and the persona switcher. There is exactly one `#sheet`/`#sheetBody`/`#sheetTitle` DOM node; `openSheet(title, bodyHtml)` swaps its contents and toggles `.open` classes; `closeSheet()` reverses it.
```html
<div class="scrim" id="scrim"></div>
<div class="sheet" id="sheet" role="dialog" aria-modal="true">
  <div class="sheet-grip"></div>
  <div class="sheet-head"><h3 id="sheetTitle">—</h3><button class="x" id="sheetClose">{x svg}</button></div>
  <div class="sheet-body" id="sheetBody"></div>
</div>
```
- **Mobile**: bottom-anchored sheet, `border-radius:22px 22px 0 0`, `max-height:92vh`, slides up from `translateY(100%)` to `translateY(0)` — `transition:transform .28s cubic-bezier(.32,.72,0,1)` (a "snappy overshoot-then-settle" iOS-style curve). A `.sheet-grip` drag-handle bar (38×4px, `#dcd4e0`) is shown at the top as a visual affordance only — there is no actual swipe-to-dismiss gesture wired up, dismissal is tap-scrim or tap-X only.
- **Desktop (≥820px)**: becomes a centered dialog — `left:50%;top:50%;transform:translate(-50%,-46%) scale(.98);opacity:0` → open state `translate(-50%,-50%);opacity:1` (fade + scale-up + slight vertical settle), `width:min(520px,94vw)`, `max-height:88vh`, full `20px` radius, grip hidden.
- `.scrim`: full-viewport `rgba(24,10,20,.5)` with `backdrop-filter:blur(2px)`, fades `opacity 0→1` over `.2s`, `pointer-events:none` when closed so it doesn't block clicks.
- `.sheet-head`: sticky inside the sheet (`position:sticky;top:0`) so the title/close button stay visible while the body scrolls; `18px/800` title, `32×32px` rounded close button (`#f2edf4` bg).
- Behaviour: opening sets `document.body.style.overflow="hidden"` (prevents background scroll); closing restores it. Close triggers: click scrim, click X button. No Escape-key handler, no focus trap — accessibility gap to fix in the rewrite (see §8).

### 4.17 Form fields (`.field`)
```html
<div class="field"><label>Full name</label><input id="p_name" placeholder="e.g. Charlie Hughes"/></div>
```
`margin-bottom:14px`. Label: 12.5px/700 uppercase muted, `.4px` letter-spacing, `margin-bottom:6px`. Input/select/textarea: full width, `padding:11px 12px`, `border-radius:11px`, `1.5px solid var(--line)`, `font-size:16px`; focus state is a colour-only border swap to `var(--maroon)` (no box-shadow ring). `.field-row` lays two fields side-by-side (`display:grid;grid-template-columns:1fr 1fr;gap:12px`) — used for the Date+Time pair. (The prototype also paired Jersey#+Position; there is no jersey field any more — Task 12.)

### 4.18 Segmented control (`.seg`)
```html
<div class="seg">
  <label><input type="radio" name="etype" value="match" checked><span>Match</span></label>
  <label><input type="radio" name="etype" value="training"><span>Training</span></label>
  <label><input type="radio" name="etype" value="social"><span>Social</span></label>
</div>
```
Radio buttons styled as a row of equal-width buttons: `display:flex;gap:8px`, each `<label>` is `flex:1;text-align:center;padding:10px;border-radius:11px;1.5px solid var(--line)`, the actual `<input>` is visually hidden (`display:none`), and the checked state is styled purely via the modern CSS relational selector **`.seg label:has(input:checked){border-color:var(--maroon);background:#fbf3f6;color:var(--maroon)}`** — no JS needed for the visual toggle, only for showing/hiding dependent fields. Used for: event type (Match/Training/Social), Home/Away, Player role (Player/Captain).
⚠️ **Port note**: `:has()` is well-supported in evergreen browsers (2023+) but a React implementation should not rely on it silently failing — use it deliberately or replace with explicit state-driven classes.

### 4.19 Persona picker card (`.persona`) — demo-only
```html
<div class="persona sel" data-persona="admin">
  <div class="pa">PM</div>
  <div class="pt"><b>Priya Menon<span class="role-tag role-admin">Club Admin</span></b><span>Registrar · full access to all 15 age groups</span></div>
  <div class="tick">{check svg}</div>
</div>
```
Selectable row-card: `padding:13px 14px;border:1.5px solid var(--line);border-radius:13px`, hover → maroon border, `.sel` → maroon border + `#fbf3f6` tint. `.pa`: 40×40px initials avatar with per-persona gradient. `.tick`: 22×22px maroon circle checkmark, `display:none` unless `.sel`. This entire component is demo-only scaffolding — it will not exist in the real app (replaced by actual auth), but its **visual language** (avatar + name + role tag + subtitle row) is reusable for e.g. a coach-assignment picker or member list.

### 4.20 Role tag (`.role-tag`)
Small uppercase pill, `10px/800`, `.5px` letter-spacing, `padding:2px 7px;border-radius:6px`. `.role-admin` = maroon/white, `.role-coach` = `#eaf4fb`/sky-deep, `.role-parent` = warn-bg/warn.

### 4.21 Detail hero (`.detail-hero`)
```html
<div class="detail-hero">
  <div class="dh-num">{icon, or initials on the player sheet}</div>
  <h3>Quins vs Dubai Exiles</h3>
  <p>Fri 24 Jul 2026 · 5:00 PM<span class="tz"> · Abu Dhabi time</span></p>
</div>
```
Top banner inside the Event/Player Detail sheet: same plum→maroon gradient, negative margins to bleed to the sheet's edges (`margin:-16px -18px 16px`), `padding:22px 18px`. `.dh-num`: 56×56px translucent white rounded-square icon tile — an event-type icon on the event sheet, the player's **initials** on the player sheet (the prototype used the jersey number; see the Task 12 note in §4.15). Title 22px, subtitle 14px/600 at 85% opacity.

**Task 11 amendment — the "Abu Dhabi time" note.** The event sheet's subtitle carries a trailing `· Abu Dhabi time` (rendered only when the event actually has a date). This is the **one and only** place in the app that names the zone: someone scanning the fixture list doesn't need reminding once per row, but someone reading a single fixture from abroad does need to know that a 20:00 kick-off isn't their 20:00. Two deliberate details:
- **Same colour, different weight.** The date/time keeps `font-semibold`; the zone note is `font-normal`. Both stay at `white/85%`. The weight drop, not a colour drop, is what sets the note apart — `white/85%` on the lightest point of the hero gradient (`--quins-red` `#C21F32`) measures **4.63:1**, clearing WCAG AA for normal text, whereas dropping to `white/70%` for de-emphasis would fall to **3.55:1** and fail.
- The `--muted`-on-paper ruling (`#5c5854`) does **not** apply here: this sits on the red gradient, not on paper.

### 4.22 Key/value row (`.kv`)
```html
<div class="kv"><span class="k">Venue</span><span class="v">Zayed Sports City</span></div>
```
`display:flex;justify-content:space-between;padding:12px 0`, hairline divider, key = muted/600, value = bold/700 right-aligned; value can contain a link (`.v a{color:var(--sky-deep)}`) e.g. `tel:`/`mailto:` links on the player detail sheet.

### 4.23 Availability bar (`.avail-bar`)
```html
<div class="avail-bar"><i style="width:70%;background:var(--good)"></i><i style="width:15%;background:var(--warn)"></i><i style="width:15%;background:var(--bad)"></i></div>
<div class="avail-legend"><span><span class="dot" style="background:var(--good)"></span>19 In</span>...</div>
```
Segmented horizontal bar: `height:12px;border-radius:20px;overflow:hidden;background:#eee`, three `<i>` segments sized by percentage of In/Maybe/Out RSVP counts (denominator guards against divide-by-zero with `||1`). Legend row below: 3 labelled dots. Only rendered for events without a result (i.e., not yet played).

### 4.24 Toast (`.toast`)
Fixed, bottom-center, `background:var(--ink);color:#fff;padding:11px 18px;border-radius:12px`, appears via `.show` class (`opacity 0→1`, `translateY(20px)→0`, `transition:.25s`), auto-hides after `2200ms` (`setTimeout`, debounced/cleared on rapid successive toasts via `clearTimeout`). Used as the confirmation channel for every create/update/delete action ("Player added", "Event updated", "Reset to sample data", etc.) and for inline validation errors ("Add a name", "Set a date and time").

### 4.25 Scope note (`.scope-note`)
```html
<div class="scope-note parent">{lock icon}<div><b>Parent view · read-only.</b> You're only seeing U10. Every other age group is hidden...</div></div>
```
Callout banner shown at the top of Home/Schedule/Roster whenever the current persona is not admin. Two variants: default (coach) = green-tinted left-border banner with an "eye" icon; `.parent` = warn-tinted with a "lock" icon and explicitly states read-only + the exact list of visible age groups. This is the visual pattern to reuse for real RLS-driven "you're scoped to X" messaging.

### 4.26 Icon buttons (misc small controls)
`.x` (sheet close), `.cal-nav button` (prev/next month) — both `width/height` fixed square, `border-radius` (9px), neutral/white bg with `inset` border or flat `#f2edf4` fill, icon centered via `display:grid;place-items:center`.

---

## 5. Screen layouts

App shell (`.app{display:flex;flex-direction:column;min-height:100vh}`): fixed/sticky
Header → sticky "Viewing as" bar (demo-only) → `<main>` (scrollable content, one `<section class="view">` per tab, only the active one has `.view.active{display:block}` — others `display:none`; a `.25s` fade+slight-translateY keyframe plays whenever a view becomes active) → fixed bottom tab bar (mobile) → FAB (mobile). One shared `.sheet`/`.scrim` overlay pair lives outside `.app`, used for all modals.

Single responsive breakpoint: **`@media (min-width:820px)`**. Below it = mobile
(bottom tab bar, FAB, bottom sheet); at/above it = desktop (top nav in header, no FAB,
centered dialog instead of bottom sheet, wider stat grid, 2-column dashboard).

### 5.1 Home / Dashboard (`#view-home`)
Order, top to bottom:
1. `scopeNote()` — only if not admin (§4.25).
2. `.hero` next-fixture card (§4.11) — only if there's an upcoming event.
3. `.stat-grid` — 4 tiles: Registered players (or "Players in view" for non-admin) / Fixtures to play / Age groups (or "Your groups") / Available for the next event.
4. `.dash-cols` — **mobile**: single column, stacked in DOM order (Upcoming list, then Quick actions, then Last result). **Desktop (≥820px)**: `display:grid;grid-template-columns:1.15fr .85fr` — left column = Upcoming list (block-title + card of up to 5 `.fixture` rows), right column = Quick actions card + Last result card.
   - Quick actions (admin/coach): "Add fixture or training", "Add a player" (ghost), "View full schedule" (ghost).
   - Quick actions (parent/read-only): "View schedule" (ghost), "View team list" (ghost), plus a small explanatory muted line ("You're signed in as a parent...").
5. Footer note (shared across all views, rendered once in the static shell, not per-view).

### 5.2 Schedule (`#view-schedule`)
1. `scopeNote()`.
2. `.section-head`: "Schedule & Fixtures" title + sub ("All squads" or the persona's team list) + "Add" button (admin/coach only, top-right).
3. `.pill-row` #1 — sub-tabs: **Upcoming** / **Results** / **Calendar**.
4. `.pill-row` #2 — team filter: **All** + one pill per visible team (hidden entirely if the persona only has 1 visible team, e.g. a single-team coach or parent).
   - Only shown when `schedTab !== "calendar"` — the calendar tab has no team filter (it always shows the persona's whole visible scope).
5. Body, depending on `schedTab`:
   - **Upcoming/Results**: a single `.card` containing all matching `.fixture` rows (chronological ascending for upcoming, descending for results), or an `.empty` state card.
   - **Calendar**: the `.cal-grid` month view + list of that month's events below it (§4.14).

### 5.3 Roster (`#view-roster`)
1. `scopeNote()`.
2. `.section-head`: "Roster & Members" + sub (player count, "+ N age groups" for admin) + "Add" button.
3. `.search` bar.
4. `.pill-row` team filter (All + counts per team) — hidden if only 1 visible team.
5. Body — **grouping toggle logic**:
   - If a **specific team is selected** (or the persona only has one visible team) → group by **position**: Forwards / Backs / Other (order fixed), each a `.roster-group` with header + count + card of `.player` rows sorted **by name**. ⚠️ **Superseded (Task 12):** the prototype sorted these by jersey number ascending (numberless last, via a `||99` fallback); with no jersey numbers there is nothing to sort on, so both the position and age-group branches order by `full_name`.
   - Otherwise (viewing "All" across multiple visible teams) → group by **age group**, iterating the fixed `TEAMS` order (U6→Women's XV), same row styling, each group only rendered if it has ≥1 matching player.
   - Search query filters the underlying player list (name/position/team substring match — **not** jersey number; see the Task 12 note above and §4.9) **before** grouping, so groups with 0 matches after filtering are simply omitted.

### 5.4 More (`#view-more`)
1. `.section-head`: "More" / "Club info & settings".
2. Info card (`.kv` rows): Club name, Home ground, Age groups count+summary, Registered players count, "Your access" (role + scope summary).
3. "Manage" block (admin/coach only): Add fixture/training, Add player, and — admin only — "Reset to sample data" (destructive, confirms via native `confirm()`, wipes localStorage back to the seeded demo dataset).
4. "About this prototype" static info card — demo-only content, drop in the real build.

### 5.5 Event Detail (sheet)
`detail-hero` (icon by type — see §4.7a; title; formatted date+time) → `.kv` rows: Type (+ Home/Away for matches), Age group, Venue, Competition (matches only, if set) → Result row (past events) OR Availability bar+legend (upcoming events, §4.23) → footer actions: **Edit + Duplicate + Delete** buttons (admin/coach) *or* a read-only `.scope-note.parent` lock message (parents).

The footer row carries `flex-wrap`, matching the delete-confirm row above it.
⚠️ **It is insurance, not a fix, and must not be described as one.** Measured in
Chromium 12 Aug 2026: at 320px the row is 284px and the three buttons are
83 + 97 + 85 with 10px gaps — one line, nothing clipped, and removing the class
changes nothing at any harness width. What it guards is a longer label or a
larger text size pushing the buttons below min-content. ⚠️ **Nothing in a Sheet
can widen the DOCUMENT in any case** — `Sheet` is `position:fixed` and sets
`body{overflow:hidden}` while open, which also means `harness/check-overflow.mjs`
is blind to sheet contents.

⚠️ **Every footer/section button here renders ONLY when its handler prop is
passed.** Duplicate, the register, the match sheet and "Set my availability" all
follow this rule, and it is not defensive styling: "Set my availability" once
rendered unconditionally behind `onOpenAvailability?.()`, and because the
Dashboard never passed the handler it drew a button that swallowed every tap in
silence for weeks. A screen that forgets a handler must get NO button rather
than a lying one.

### 5.6 Event Add/Edit form (sheet)
Segmented Type control (Match/Training/Social) → conditionally-shown Opponent field (match only) or Title field (training/social only) → Date+Time field-row → Age group/Squad select (options = editable teams for this persona) → conditionally-shown Home/Away segmented control (match only) → Venue text field (pre-filled "Zayed Sports City, Abu Dhabi") → conditionally-shown Competition field (match only) → full-width Save button. Field visibility toggles live via the type-radio `onchange` handler (not CSS-only, since 4 different fields' visibility depend on it).

### 5.7 Player Detail (sheet)
`detail-hero` (**initials** as `.dh-num` — the prototype used the jersey number; name + " ©" suffix if captain; position · team) → `.kv` rows: Position, Age group, Role (Captain/Player). ⚠️ **Superseded (Task 12):** there is no "Jersey #" row — the club does not use numbers. The " ©" captain suffix is also not ported: it is announced as "copyright" by screen readers, and the Role row already states captaincy. → **if `canEdit()`**: Phone + Email `.kv` rows as `tel:`/`mailto:` links, then a Call/Email button row, then an Edit/Delete button row → **else (parent)**: a `.scope-note.parent` explaining contact details are hidden for privacy (no phone/email rendered at all client-side, not just visually hidden — a real build must enforce this server-side too, matching the project's `player_contacts` RLS table).

### 5.8 Player Add/Edit form (sheet)
Full name → Position → Age group/Squad select → Phone → Email → Player/Captain segmented control → full-width Save button. ⚠️ **Superseded (Task 12):** the prototype had a Jersey# field paired with Position. **Do not add a jersey field** — the club does not use numbers. Position and captaincy ARE tracked (they are simply not populated yet), so those stay.

### 5.9 "Viewing as" / persona switcher (sheet) — demo-only
Intro paragraph explaining the demo → list of `.persona` cards (§4.19), one per `PERSONAS` entry, click selects and immediately closes the sheet + re-renders the whole app under the new scope + shows a toast.

---

## 6. Interaction details

- **View switching** (`go(id)`): removes `.active` from all `.view` sections, adds it to the target, scrolls window to top (`behavior:"instant"`, not smooth — this is deliberate, avoids a jarring scroll-then-fade combo), then calls `render()`. The `.25s ease` fade-in keyframe (`opacity 0→1, translateY(6px)→0`) plays automatically because the newly-`.active` section re-triggers its CSS animation.
- **Sheet open**: `openSheet(title, html)` sets title/body innerHTML, adds `.open` to `#scrim` and `#sheet`, sets `body.style.overflow="hidden"`. Transition: `transform .28s cubic-bezier(.32,.72,0,1)` (mobile slide-up), or `transform`+implicit `opacity` transition (desktop fade+scale — note: `.sheet` itself doesn't declare an `opacity` transition explicitly beyond the transform one covering both since `transition:transform .28s ...` — in practice the browser only animates the properties listed, so verify the desktop opacity fade is intentionally covered by the single `transition:transform` declaration or add `opacity` explicitly when porting).
- **Sheet close**: reverse of the above, `.2s` for the scrim fade.
- **Tab/pill switching**: pure state variable + full re-render, e.g. `schedTab`, `schedTeam`, `rosterTeam`, `rosterQuery`, `calMonth`/`calYear` are module-level `let` variables; every interaction mutates one and calls the relevant `render*()` function again, which fully replaces that view's `innerHTML` and rebinds all its event listeners. **There is no virtual DOM / diffing** — this is the #1 thing the React port should deliberately *not* copy structurally, but the *state shape* (a handful of named filter variables) maps directly to component state or URL search params.
- **Search**: live-filters on every keystroke (`oninput`), and because the whole view re-renders (destroying and recreating the `<input>`), the code manually saves `selectionStart` before re-render and restores focus + caret position after, to avoid the classic "cursor jumps to end" bug. A React implementation gets this for free via controlled-input diffing, but it's worth knowing *why* that code exists if anyone wonders.
- **Countdown**: computed synchronously at render time only — **not a ticking interval**, it will not update live without navigating away and back or an explicit re-render trigger. It's computed against a hardcoded `now()` (`new Date("2026-07-20T09:00:00")`), which the real build must swap for live `Date.now()` (and likely add a `setInterval` if a live-ticking countdown is desired).
- **Grouping toggle** (Roster): not a separate UI control — it's implicit, driven by whether a specific team filter is active (see §5.3). No explicit "group by" dropdown exists in this prototype.
- **Segmented control state**: driven by native radio `:checked` + CSS `:has()`, but *dependent field visibility* (e.g. showing Opponent vs Title) is driven by an explicit JS `onchange` handler that toggles inline `style.display` on sibling `.field` wrappers — not purely CSS-driven.
- **List item click → detail**: every render of a fixture/player list calls `wireList()`/manual `querySelectorAll(...).forEach(el=>el.onclick=...)` to rebind click handlers, since `innerHTML` replacement destroys prior listeners. No event delegation is used anywhere in the prototype.
- **Toast**: shows for ~2.2s, debounced (`clearTimeout` before each new show) so rapid actions don't queue/stack.
- **Persisted data**: every create/update/delete calls `persist()` synchronously (writes both `PLAYERS` and `EVENTS` arrays to `localStorage` as JSON) immediately after mutating the in-memory arrays, before `render()`. There is no separate "saving..." state or optimistic-UI distinction — writes are treated as instant/synchronous, which will need real loading/error states once backed by Supabase network calls.

---

## 7. Data shapes (localStorage → Supabase mapping)

Two top-level arrays, persisted under fixed keys:
```js
store.load("quins_players_v2", null) // -> array of Player
store.load("quins_events_v2",  null) // -> array of Event
```
(`store` is a tiny try/catch wrapper around `localStorage.getItem/setItem` + `JSON.parse/stringify`; falls back silently to seeded demo data if empty or malformed.)

### Player object
```js
{
  id: 12,                       // number, sequential int (Date.now() on new records) — Supabase: players.id (uuid)
  num: 7,                       // ⚠️ NOT USED (Task 12) — the club does not use jersey numbers. `players.jersey_num` remains in the schema (nullable, empty) in case the senior sides ever want squad numbers, but nothing in the UI reads or writes it.
  name: "Tom Fletcher",         // string, single full-name field             — SPLIT into players.first_name/last_name for Supabase (or keep as full_name, confirm schema)
  pos: "Flanker",               // string, one of the fixed POSITIONS list    — players.position
  team: "U15",                  // string, must match one of the 15 TEAMS     — players.team_id (fk -> teams)
  cap: true,                    // boolean, "captain" flag                     — players.is_captain (or a role/tag table)
  phone: "+971 50 200 1000",    // string, freeform                            — player_contacts.phone (LOCKED DOWN per project RLS — never sent to parent-scoped queries)
  email: "tom.fletcher@email.com", // string                                   — player_contacts.email (same RLS lockdown)
  avail: {},                    // object, UNUSED in this prototype (always {}) — this is the placeholder the real `availability` table replaces (event_id -> RSVP status)
  joined: "2025"                // string, year only                           — players.joined_year or created_at
}
```
Positions enum used by the Add/Edit form: `["Prop","Hooker","Lock","Flanker","Number 8","Scrum-half","Fly-half","Centre","Wing","Fullback","Utility"]`.
`posGroup(pos)` maps position → `"Forwards"` (Prop/Hooker/Lock/Flanker/Number 8), `"Backs"` (Scrum-half/Fly-half/Centre/Wing/Fullback), or `"Other"` (anything else, e.g. "Utility") — this grouping function must be ported verbatim for the Roster grouped-by-position view to match.

### Event object
```js
{
  id: 1001,                     // number (Date.now() on new records)         — events.id (uuid)
  type: "training",             // enum: "match" | "training" | "social"      — events.type
  title: "Senior Squad Training", // string. For matches this is SET TO THE OPPONENT NAME (see openEventForm: `title:type==="match"?opp:titleV`) — i.e. `title` is redundant/derived for matches; the render layer actually displays "Quins vs {opponent}" for matches and just `{title}` for training/social. Real schema should likely just use `opponent` for matches and `title` for non-matches, and NOT duplicate opponent into title.
  opponent: "Al Ain Amblers",   // string|null, match-only                     — events.opponent
  home: true,                   // boolean, match-only (defaults true for non-matches but unused) — events.home (NOT events.is_home; verified against the live schema — the wrong name here caused a silently-missing Home/Away badge in Task 13)
  venue: "Zayed Sports City, Abu Dhabi", // string, freeform (sometimes "Ground — Pitch N", parsed client-side by splitting on "—" and "," for compact display) — events.venue / events.location
  comp: "West Asia Premiership",// string|null, match-only optional            — events.competition
  team: "Senior Men 1st XV",    // string, must match one of the 15 TEAMS      — events.team_id (fk -> teams)
  when: "2026-07-24T19:00",     // PROTOTYPE ONLY: ISO-ish browser-local datetime string, no timezone/seconds — events.starts_at is a real `timestamptz` in Supabase (already built), i.e. an absolute instant stored in UTC. See the timezone note below.
  result: { us: 31, them: 19 }, // object|null — presence of `result` is what flags an event as "past"/"played", not a computed date comparison — events.result_us / events.result_them (or a nullable jsonb)
  rsvpIn: 19, rsvpOut: 2, rsvpMaybe: 3  // numbers — DEMO-ONLY AGGREGATE COUNTS, hardcoded per seed event, never recomputed from real RSVPs. The real build replaces these three fields entirely with a live COUNT(*) FILTER query against the `availability` table (per project schema: one row per player per event with a status).
}
```
**Timezone note (Task 11 amendment — supersedes the old "UAE is UTC+4 fixed" wording).** Every event time in this app renders in **Abu Dhabi time for every reader**, whatever zone their browser is in — the club has one home ground, so "20:00" must mean 20:00 at Zayed Sports City for a parent checking fixtures from London as much as for one on the touchline. The model is:
- **Storage:** `events.starts_at` is `timestamptz` — an absolute instant. No offset or wall-clock string is stored. Ordering, and upcoming-vs-past, are instant comparisons and are already zone-agnostic.
- **Rendering:** every user-visible date/time goes through `Intl.DateTimeFormat`/`toLocale*String` with `timeZone: 'Asia/Dubai'` — the IANA zone identifier exported as `CLUB_TIME_ZONE` from `src/lib/eventFormat.js`. Use the helpers there (`dateBoxParts`, `formatTime`, `formatLongDate`, `clubDayParts`, `clubToday`); never a bare `date.getHours()/getDate()`, which reads the *browser's* zone.
- **Not a fixed offset.** Do **not** hardcode `+04:00`. The UAE has no DST today so the two currently agree, but an offset is a derived fact that would rot silently if that ever changed; the zone identifier stays correct by definition.
- **Day bucketing and "today".** A 01:00 Dubai kick-off is 21:00 the *previous* day in UTC, so anything that groups by calendar day — the calendar grid (§4.14), its `.today` ring, the fixture date box (§4.13) — must bucket on the **club's** day via `clubDayParts`/`clubToday`, not the browser's, or fixtures land in the wrong cell (and, on the 1st, the wrong month).
- **Writing (Task 14, the event form).** The mirror image: a date + time a coach types is **Abu Dhabi wall-clock** and must be converted to UTC using `CLUB_TIME_ZONE` before being written to `starts_at`. A naive `new Date(\`${date}T${time}\`)` resolves in the *browser's* zone, so a coach in the UK entering "20:00" would store `19:00Z` — a 23:00 Abu Dhabi kick-off. The form's date field should default from `clubToday()`, not `new Date()`.
- Only the event sheet names the zone in the UI (§4.21); rows and the calendar stay unlabelled.

Important behavioural note for the Supabase mapping: **"past" vs "upcoming" is determined by `event.result` being non-null, not by comparing `when` to the current date** (`past()` filters `e.result` truthy, `upcoming()` filters `e.result` falsy). A real implementation should decide deliberately whether "upcoming" means "no result yet" or "date is in the future" — they can diverge (e.g. a match that happened but has no score entered yet).

### Team / age-group list (not a stored object, a hardcoded constant)
```js
const TEAMS = ["U6","U7","U8","U9","U10","U11","U12","U13","U14","U15","U16","U18 Colts",
               "Senior Men 1st XV","Senior Men 2nd XV","Women's XV"];
```
This is exactly the 15 age groups already seeded in the live `teams` table per the project's Supabase schema — order matters for display (youngest → oldest → seniors), and every "All teams" iteration in the UI (roster grouping, schedule team pills) walks this fixed array rather than deriving/sorting team names dynamically.

### Persona / demo-auth objects (`PERSONAS`) — NOT part of the real data model
```js
{ id:"parent_u10", name:"Sarah Hayes", role:"Parent", sub:"Child plays in U10",
  teams:["U10"], canEdit:false, color:"#c9861a" }
```
7 hardcoded demo identities (1 admin — `teams:"ALL"`, 4 coaches, 2 parents) simulate what real Supabase Auth + `memberships` rows + RLS will do. The scoping *functions* built on top of `persona` are the reusable part — port their logic, not the fake data:
```js
visibleTeams()  // persona.teams==="ALL" ? all 15 teams : persona.teams
canSee(team)    // is `team` within the current scope
canEdit()       // persona.canEdit (admin/coach = true, parent = false)
isAdmin()       // persona.teams === "ALL"
visPlayers()    // PLAYERS filtered by canSee(player.team)
visEvents()     // EVENTS filtered by canSee(event.team)
editTeams()     // teams this persona is allowed to CREATE events/players into (admin=all, coach=own teams)
```
These map directly onto: Supabase Auth session → `memberships` table role/team lookup → either RLS policies (server-enforced, preferred) and/or equivalent client-side derived state for UI purposes (e.g. which teams appear in a filter dropdown) — mirroring the project's stated RLS design (admins see all; coaches scoped to their teams; parents read-only and contact-blind).

---

## 8. Accessibility, icons, and crest usage

**Accessibility — present:**
- `.sheet` has `role="dialog" aria-modal="true"`.
- `<label>` elements properly wrap their inputs throughout every form.
- Tap targets are generally ≥40px (nav buttons, FAB, list rows).
- `theme-color` meta tag set to `#C21F32` (mobile browser chrome tint) and `apple-mobile-web-app-*` meta tags configured (standalone PWA install support already present in the prototype's `<head>`).

**Accessibility — absent / gaps to fix in the React rewrite:**
- No focus trap inside the open sheet, no focus return to the trigger element on close.
- No `Escape`-key handler to close the sheet/scrim.
- No `aria-label` on icon-only buttons (FAB, sheet close `.x`, calendar prev/next) — they rely on `title="Add"` (FAB only) or nothing.
- No live-region (`aria-live`) on the toast — screen readers won't announce it.
- Color is sometimes the only differentiator (chip colours for match/training/social, result win/loss/draw) without an accompanying icon or text-only fallback beyond the label text itself (which IS present as text, so this is a minor/acceptable case, not a hard failure).
- Calendar day cells with events are `cursor:pointer` divs, not `<button>`s — not keyboard-focusable/operable as built.
- No skip-to-content link.

**Icons**: 100% inline SVG, no icon font (Font Awesome etc.) and no emoji. All defined once as raw SVG-markup strings in a single JS dictionary at the top of the script (`const I = { home:'<svg...>', cal:'<svg...>', ... }`, ~27 icons total: home, cal, roster, more, pin, clock, trophy, check, search, chev, left, right, whistle, phone, mail, shirt, users, edit, trash, add, eye, lock, swap) and interpolated directly into template-literal HTML strings wherever needed. Style: `viewBox="0 0 24 24" fill="none" stroke="currentColor"`, mostly `stroke-width="2"` with `stroke-linecap/linejoin="round"` (a couple use `2.1`–`2.4` for slightly bolder icons like the checkmark and plus). Because they use `stroke="currentColor"`, they inherit the surrounding text colour automatically (e.g. white in the header, maroon when active in the tab bar) — this is a key implementation detail to preserve (React: keep them as `currentColor` SVGs, e.g. via a shared `<Icon>` component or an SVG sprite, rather than baking in fixed colours).

**Crest / logo**: a single 160×160px PNG, embedded as a base64 data URI, used in exactly two places in the prototype:
1. Browser favicon + `apple-touch-icon` (in `<head>`).
2. The header `.badge` — an empty `<div>` (no `<img>` tag) with `background:url(...) center/contain no-repeat`, sized to 46×46px via CSS, with `filter:drop-shadow(0 1px 3px rgba(0,0,0,.35))` for a subtle lift off the gradient background.

Per the repo's existing asset pipeline (`/home/claude/quins-club-hub/src/assets/crest.png`, `crest-small.png`, and the `/public/icons/*` set already generated — `favicon-32.png`, `apple-touch-icon.png`, `icon-192.png`, `icon-512.png`, `maskable-192.png`, `maskable-512.png`), the React build should use real `<img>`/CSS `background-image` file references instead of a base64 data URI, and should use `crest-small.png` (or equivalent) for the 46px header badge with the same `drop-shadow` filter for visual parity.

---

## 9. Differences between the two prototype files

`assets/prototype-desktop.html` and `assets/prototype-downloads.html` are **the same
app** — byte-identical `<style>` block, and functionally identical inline `<script>`
(the only diff is trailing whitespace/newlines around the closing `</body></html>`).
The only real difference is in the static `<body>`:

- **`prototype-downloads.html`** is the true clean source: all four `<section class="view">` containers (`home` active by default, `schedule`/`roster`/`more` empty) and all nav containers (`#tabbar`, `#navDesktop`, `#viewas`) start **empty**, populated entirely by the JS on load (`buildNav();buildViewAs();render();`). Treat this file as canonical for "what ships"/"what the source template looks like."
- **`prototype-desktop.html`** is a **browser "Save Page As" snapshot** (`<!-- saved from url=(0077)file:///C:/Users/Jay/Downloads/... -->`) taken at a moment when the user had navigated to the **Schedule tab** — so its body HTML is the *rendered* DOM at that instant (fully expanded fixture list, `view-schedule` marked `active`/`view-home` not, nav buttons' `active` class on "Schedule" instead of "Home"). It is useful only as a working example of real rendered output (e.g. to see exactly what a populated fixture list or nav bar's HTML looks like without running the JS), not as a second design variant — there is no visual/UX divergence to reconcile.

No other differences exist (no alternate colour scheme, no alternate component styling, no additional/missing features). One prototype, one design language.
