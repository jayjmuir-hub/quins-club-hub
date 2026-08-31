import { useLayoutEffect, useRef, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import useAutoHideOnScroll from '../lib/useAutoHideOnScroll.js'

// Primary navigation — THE MOBILE TAB BAR, and since phase 2 of the 2.0
// retheme (claude/plans/2026-08-21-retheme-and-shell.md) nothing else.
// Desktop nav lives in src/components/Sidebar.jsx, which imports NAV_ITEMS
// from here so there is still exactly one list of destinations.
//
// ⚠️ Until 21 Aug 2026 this one component was ALSO the in-header desktop
// pill row, switched by CSS. Those pills — and their measured-off-adhjrt
// styling, the sheen, the Admin pill — retired with the sidebar's arrival.
// The `.nav-tab` sheen CSS in src/index.css survives them for now; it is
// inert without a desktop nav-tab and phase 5's sweep decides its fate.

// icon components: inline SVG, stroke="currentColor" so they inherit the
// surrounding text colour (muted/maroon on the mobile tab bar), matching
// design-system.md §8. Hidden entirely at the desktop breakpoint, where the
// nav is text-only pills (design-system.md §4.1).
function HomeIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M3 11.5 12 4l9 7.5" />
      <path d="M5.5 10v9a1 1 0 0 0 1 1H9.5a1 1 0 0 0 1-1v-4.5a1 1 0 0 1 1-1H12.5a1 1 0 0 1 1 1V19a1 1 0 0 0 1 1H17.5a1 1 0 0 0 1-1v-9" />
    </svg>
  )
}

function ScheduleIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M8 3v4M16 3v4M4 10h16" />
    </svg>
  )
}

function RosterIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="9" cy="8" r="3" />
      <path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
      <path d="M16.5 8.5a2.5 2.5 0 1 1 0 5" />
      <path d="M15 12.5c2.4.3 4.5 1.7 4.5 4.5" />
    </svg>
  )
}

// Exported for Sidebar, which shows the same destination to the same people —
// one icon, one home, like NAV_ITEMS itself.
export function SquadIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M12 3l8 3v5c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6l8-3z" />
      <path d="M8.5 12.5l2.3 2.3 4.7-4.6" />
    </svg>
  )
}

// Exported for Sidebar, same reason as SquadIcon.
export function ChatIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H9l-4.2 3.4A.5.5 0 0 1 4 19z" />
      <path d="M8 8.5h8M8 12h5" />
    </svg>
  )
}

// Single source of truth for the nav items, so nothing (AppShell, Nav
// itself, any future breadcrumb-style consumer) duplicates this list.
export const NAV_ITEMS = [
  { to: '/', label: 'Home', end: true, icon: HomeIcon },
  { to: '/schedule', label: 'Schedule', icon: ScheduleIcon },
  { to: '/roster', label: 'Roster', icon: RosterIcon },
  // Chat (23 Aug 2026) — the squad channel. On the bar for EVERYONE: the
  // phone's only entry point is the thing you cannot delete (the 22 Aug
  // handoff's lesson), and a chat nobody can find is a chat nobody uses.
  { to: '/chat', label: 'Chat', icon: ChatIcon },
  // ⚠️ NO "More" TAB SINCE 29 Aug 2026 (Jay). It was a grab-bag — the You
  // editor, photo, players, notices, calendar, notification/chat toggles,
  // privacy/delete, sign-out and the admin/approvals doors — and its home is
  // the masthead account menu (AccountMenu.jsx), which already links to /more
  // as "My account" and now carries the settings rows and the Admin/Approvals
  // doors directly. Dropping the tab also lets the captions below fit: staff
  // top out at five tabs, not six. /more stays a real route, reached from the
  // account menu — App.jsx and AppShell's sign-out gate are unchanged.
]


function linkClassName({ isActive }) {
  return [
    // ══ DOCK ITEM, DESIGN "A" — Jay, 23 Aug 2026: icons only, and the active
    // tab EXPANDS into a red labelled pill ("flashier and more modern").
    //
    // Every item is a flex row: icon, then a label whose width is animated
    // from 0 (see labelClassName). Since the motion pass the red pill is NOT
    // this link's background — it is the <Glider> below, one element that
    // slides along the dock to whichever link is active, so a tap reads as
    // the pill travelling rather than blinking off one tab and on at the
    // next. The link itself only changes padding (to make room for its
    // label) and colour. Labels exist for every item in the DOM and in the
    // accessible name; only the active one is VISIBLE, which is what makes
    // six tabs fit on a 360px phone without a single abbreviation.
    'group relative z-[1] flex h-[46px] items-center justify-center gap-1.5 rounded-pill outline-none',
    'transition-[padding,color,transform] duration-300 ease-out motion-reduce:transition-none',
    // Press squash — the iOS tab feel. 90% on the way down, and the spring
    // curve on the transition above gives it the bounce back.
    'active:scale-90 focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-chrome',
    // Idle icons are INK, not white, since the clear-glass pass (24 Aug 2026):
    // the dock is transparent now, so idle items must read on whatever is
    // behind it — ink flips with the theme. The active item stays white ON
    // ITS OWN RED PILL, which is opaque and theme-independent.
    // ⚠️ FULL INK, NOT text-ink/90 (28 Aug 2026). The 10% fade came off the old
    // white/90 idle treatment and carried over by habit; on the transparent
    // dock in light mode it left the inactive icons reading faint over pale
    // content (Jay). Ink already meets icon contrast on its own — dropping the
    // fade is the free half of that. The frost that backs it in light mode is
    // strengthened in src/index.css (see `.glass-dock` cool-grey stops).
    isActive ? 'px-3 text-white' : 'px-2 text-ink',
  ].join(' ')
}

// The label: 0 wide and invisible until its tab is active, then it slides
// open beside the icon. `max-w` is the only animatable route to "width: auto",
// so 96px is a ceiling ("SQUAD HUB" at this size is ~62) and not a size.
function labelClassName({ isActive }) {
  return [
    // ⚠️ SIZED TO THE WORST CASE, MEASURED: six tabs at 360px with "SQUAD
    // HUB" open. Idle items are 38px (22px icon + px-2), the open pill ~108,
    // and the bar has 336px inside its insets — 5×38 + 108 + padding fits;
    // at 12px/px-3.5 it did not, and More fell off the right edge.
    'overflow-hidden whitespace-nowrap font-condensed text-[11px] font-bold uppercase tracking-[0.06em]',
    'transition-[max-width,opacity,margin] duration-300 ease-out motion-reduce:transition-none',
    isActive ? 'max-w-[96px] opacity-100' : 'max-w-0 opacity-0 -ml-1.5',
  ].join(' ')
}

// The small caption under every IDLE icon (29 Aug 2026, Jay: each button should
// say what it does without being tapped). ⚠️ ABSOLUTE ON PURPOSE — it must not
// add to the item's width, because the Glider measures idle items as icon-width
// and predicts the settled layout from it (see measure() below). Centred under
// the icon and allowed to overflow into the gap `justify-between` already leaves
// between icons; kept tiny (9px condensed) so even "Squad Hub" clears its
// neighbours. Hidden on the ACTIVE tab, whose label rides beside its icon in the
// pill instead — so no tab shows the word twice.
// Every caption is dead-centred under its icon — including the END tabs.
// An inward "nudge" for the ends was tried on 31 Aug 2026 and REJECTED the
// same day (Jay: didn't like Schedule and Chat off their icons). What keeps
// the long end captions off the dock's 22px corner curve is instead the wide
// bar's geometry: a narrower inset and px-5 end padding (see the nav
// className below), which buys the room with the bar's own width.
function captionClassName({ isActive }) {
  return [
    'pointer-events-none absolute bottom-[3px] left-1/2 -translate-x-1/2 whitespace-nowrap',
    'font-condensed text-[9px] font-bold uppercase leading-none tracking-[0.03em]',
    'transition-opacity duration-200 ease-out motion-reduce:transition-none',
    isActive ? 'opacity-0' : 'opacity-100',
  ].join(' ')
}

// ══ THE GLIDER — the red pill that travels ═══════════════════════════════════
//
// One absolutely-positioned element behind the links, moved to the active
// link's box with a transform, so the browser animates it on the compositor.
// The spring curve (cubic-bezier with a >1 control point) gives the small
// overshoot iOS tab bars have; `animate-dock-bloom` re-runs on every move
// (keyed on the pathname) so the glow blooms as the pill lands and settles.
//
// ⚠️ MEASURED, NOT COMPUTED. The active link's width depends on its label,
// which is mid-animation when the route changes — so the glider is measured
// in a layout effect AFTER the label's transition would have started, and
// again on resize. It reads offsetLeft/offsetWidth relative to the <nav>, so
// it is immune to the fixed-position containing-block trap that put the dock
// at the top of the screen on 23 Aug.
//
// ⚠️ The label's max-width transition and the glider's transform transition
// run on the same 300ms curve on purpose: the pill grows as the label
// unfurls. Change one and change the other.
function Glider({ box, routeKey }) {
  if (!box) return null
  return (
    <span
      key={routeKey}
      aria-hidden="true"
      data-testid="dock-glider"
      className="pointer-events-none absolute left-0 top-[7px] h-[46px] rounded-pill transition-[transform,width] duration-300 ease-[cubic-bezier(.34,1.4,.64,1)] motion-reduce:transition-none"
      style={{ transform: `translateX(${box.left}px)`, width: box.width }}
    >
      {/* The glow BLEED — a blurred red blob behind the pill, wider than it,
          so the red reads as light inside the glass rather than a sticker on
          top of it. Sits below the pill in paint order; the dock's
          overflow-hidden clips it to the dock's own curve. */}
      <span className="absolute -inset-x-4 -inset-y-3 rounded-pill bg-brand/55 blur-xl" />
      <span className="absolute inset-0 rounded-pill bg-[image:linear-gradient(135deg,theme(colors.brand.deep),theme(colors.brand.DEFAULT))] shadow-[0_4px_14px_rgba(194,31,50,0.45)] animate-dock-bloom motion-reduce:animate-none" />
    </span>
  )
}

// The status dot: the same red as the pill, with a halo, at the icon's
// top-right. Decorative here — the link's accessible name says "new".
function Dot() {
  return (
    <span
      aria-hidden="true"
      data-testid="dock-dot"
      className="absolute right-1.5 top-2 h-2 w-2 rounded-full bg-brand-onDark shadow-[0_0_0_2px_rgba(10,10,10,0.85),0_0_10px_2px_rgba(255,143,143,0.7)]"
    />
  )
}

// The Admin pill that used to render here (admin-only, desktop-only) is now
// the sidebar's Admin item — same isAdmin() gate, same destination. The tab
// bar never showed it and still does not: the phone's route to /admin is the
// Admin row in the account menu (AccountMenu.jsx), not a tab.
export default function Nav({ showSquadHub = false, badges = {} }) {
  // Squad Hub joins the bar for the same people the sidebar shows it to
  // (22 Aug 2026, Jay). ⚠️ INSERTED BEFORE CHAT, NOT AFTER — so CHAT keeps the
  // rightmost slot. Its short caption meets the dock's rounded corner cleanly;
  // "SQUAD HUB", the longest caption, sat ON the outline out there (Jay's phone,
  // 29 Aug 2026: "the b is sitting on the menu outline"). Interior, it has the
  // room. findIndex rather than a hard slice so it survives a NAV_ITEMS reorder.
  const base = showSquadHub
    ? (() => {
        const chatAt = NAV_ITEMS.findIndex((item) => item.to === '/chat')
        const at = chatAt < 0 ? NAV_ITEMS.length : chatAt
        return [
          ...NAV_ITEMS.slice(0, at),
          { to: '/squad', label: 'Squad Hub', icon: SquadIcon },
          ...NAV_ITEMS.slice(at),
        ]
      })()
    : NAV_ITEMS

  // ══ FEW-TAB ISLAND (parent/player, four tabs) — Jay, 30 Aug 2026 ════════════
  // The dock's spacing was tuned for the five-tab squad-staff bar. A parent or
  // player has only four (no Squad Hub), and at that count the full-width
  // `justify-between` spread nearly DOUBLES every gap — ~44px against the staff
  // bar's ~23px, measured — so the icons scatter and the pill is marooned in
  // acres of space ("don't look good", Jay). Below five tabs the dock becomes a
  // fixed-width CENTRED ISLAND that hugs its tabs (see the nav className); at
  // five it stays the full-width bar it has always been, so squad staff see no
  // change. Derived from `base` (before the Home reorder, which preserves
  // length) so it can gate that reorder too.
  const compact = base.length < 5

  // ⚠️ HOME'S SLOT DEPENDS ON THE BAR — Jay, 29–30 Aug 2026.
  // FIVE-TAB squad-staff bar: Home rides the CENTRE. The app opens on Home (the
  // PWA `start_url` is `/`, which routes to the Dashboard), and the middle of a
  // full-width bar is the thumb's natural resting slot — so the tab you land on
  // is the tab under your thumb.
  // FOUR-TAB parent/player ISLAND: Home stays FAR LEFT, its natural NAV_ITEMS
  // slot (Jay, 30 Aug 2026). On the narrow centred island the middle is no
  // longer where the thumb rests, and Home anchoring the left edge reads
  // cleaner than stranded in the centre.
  //
  // ⚠️ MOBILE-BAR-ONLY EITHER WAY. NAV_ITEMS — and so the desktop Sidebar, which
  // imports it — keep Home FIRST, where the top of a vertical nav belongs; only
  // this horizontal dock ever moves it, and only when it is the wide bar.
  // `findIndex` + splice, not a hard index, so it survives a NAV_ITEMS reorder;
  // Home lands at `floor(count/2)`, dead centre of the five-tab bar.
  const items = (() => {
    if (compact) return [...base]
    const list = [...base]
    const homeAt = list.findIndex((item) => item.to === '/')
    if (homeAt < 0) return list
    const [home] = list.splice(homeAt, 1)
    list.splice(Math.floor(base.length / 2), 0, home)
    return list
  })()

  const { pathname } = useLocation()
  const navRef = useRef(null)
  const [box, setBox] = useState(null)

  // Auto-hide on scroll — the logic lived inline here until 24 Aug 2026 and
  // is now shared with the masthead, which slides in step with this dock.
  // The numbers (80px grace, 6px hysteresis) live in the hook.
  const hidden = useAutoHideOnScroll()

  // Where is the active link? Re-measured on route change and on resize, and
  // once more after the label's 300ms unfurl so the pill's final width is the
  // settled one, not the one captured mid-transition.
  useLayoutEffect(() => {
    const nav = navRef.current
    if (!nav) return undefined
    function measure() {
      const links = [...nav.querySelectorAll('a')]
      const activeIndex = links.findIndex((link) => link.getAttribute('aria-current') === 'page')
      if (activeIndex < 0) {
        setBox(null)
        return
      }
      // ⚠️ PREDICT THE SETTLED LAYOUT, do not read the current one. At the
      // moment of a route change the new label is still 0 wide (its
      // max-width transition has just started) and the OLD active link is
      // still wide, and the dock is `justify-between` — so every link is
      // mid-slide and offsetLeft is wrong for all of them. Reading it sent
      // the pill 50px past its target and back. The settled layout is
      // computable: idle links are all one width (the narrowest link now),
      // the active link's width is its current box plus the label's natural
      // width (scrollWidth is unaffected by the clip), and justify-between
      // spreads the remaining space evenly.
      const style = getComputedStyle(nav)
      const padLeft = parseFloat(style.paddingLeft)
      const inner = nav.clientWidth - padLeft - parseFloat(style.paddingRight)
      const idle = Math.min(...links.map((link) => link.offsetWidth))
      const active = links[activeIndex]
      const label = active.querySelector('span')
      const hidden = label ? Math.max(0, label.scrollWidth - label.clientWidth) : 0
      const gap = label && label.clientWidth === 0 ? 6 : 0
      const activeWidth = Math.max(active.offsetWidth, idle) + hidden + gap
      const total = idle * (links.length - 1) + activeWidth
      const space = links.length > 1 ? (inner - total) / (links.length - 1) : 0
      const left = padLeft + activeIndex * (idle + space)
      setBox({ left, width: activeWidth })
    }
    measure()
    const settle = window.setTimeout(measure, 320)
    window.addEventListener('resize', measure)
    return () => {
      window.clearTimeout(settle)
      window.removeEventListener('resize', measure)
    }
  }, [pathname, items.length])

  return (
    // The bar is dark chrome so the app is bookended in near-black — masthead
    // at the top, tab bar at the bottom, light content well between. The
    // `brand-rule` hairline sits on its top edge, mirroring the masthead's.
    // ⚠️ TRANSLUCENT AGAIN SINCE 23 Aug 2026, AND THE OLD OBJECTION IS
    // ANSWERED, NOT IGNORED. It was opaque because a bg-white/95 bar over
    // scrolling light content made the idle-label contrast depend on whatever
    // was underneath. `glass-chrome` (src/index.css) is DARK at 82% over a
    // 20px blur: the worst thing behind it is pure white, and the composite is
    // still dark — 5.0:1 for the white/85 idle label by arithmetic.
    <nav
      aria-label="Primary"
      /* `desktop:gap-[2px]` matches adhjrt.com's `.hdr-nav { gap: 2px }`. The
         items now carry their own hover fill, so a wider gap would read as
         five separate buttons rather than one row of tabs. */
      // ⚠️ FULL CLASS NAMES, NEVER `grid-cols-${n}` — Tailwind only emits the
      // classes it can see in the source. Five for everyone since Chat joined
      // (23 Aug 2026), six for squad staff.
      // ══ THE DOCK — Jay, 23 Aug 2026, with a photo of his iPhone's home
      // screen: a floating, rounded, frosted pill inset from the edges and
      // lifted clear of the home indicator, not a slab welded to the bottom.
      // inset-x-3 plus 12px above the safe area is the inset; `rounded-[26px]`
      // and `glass-chrome` are the material; `overflow-hidden` clips the
      // brand-rule and item hover fills to the pill's corners.
      //
      // ⚠️ The content's bottom padding in AppShell is sized to clear THIS.
      // Change the height or the inset here and re-measure it. (The floating
      // `?` button that also cleared it was retired on 24 Aug 2026 — help now
      // opens from the account menu, and nothing else floats above this bar.)
      ref={navRef}
      data-hidden={hidden ? 'true' : undefined}
      className={[
        // rounded-[22px], not rounded-pill, since 24 Aug 2026 — Jay: the two
        // bars should be the same shape, and the masthead island's 22px won.
        // The ITEMS inside (glider, hover fills) stay capsules on purpose.
        'glass-dock fixed bottom-[calc(12px+env(safe-area-inset-bottom))] z-40 flex items-center justify-between rounded-[22px] py-[7px] desktop:hidden',
        // Width: the full-width bar (12px inset each edge) for five+ tabs; a
        // centred ~300px island that hugs its tabs for four (see `compact`).
        // `left-0 right-0 mx-auto` + a DEFINITE width is what centres a `fixed`
        // element — fixed width, not `w-fit`, so the island does not resize and
        // re-centre each time the active pill swaps label. max-w keeps ≥12px of
        // air each side at the 320px floor. ⚠️ FULL CLASS NAMES so Tailwind
        // emits them — never build these from a variable.
        // ══ THE WIDE BAR'S CORNER FIX — Jay, 31 Aug 2026 ══════════════════
        // At inset-x-3/px-2 the end captions rode the 22px corner curve
        // ("SCHEDULE" measured 2.5px from the glass edge; the curve intrudes
        // ~11px at the caption's baseline). The fix Jay chose: make the BAR
        // wider (inset 12px → 6px) and spend the gain on px-5 end padding,
        // so the captions stay dead-centred under their icons — an inward
        // nudge was tried first and rejected as off-centre. Centred
        // "SCHEDULE" then starts padLeft−6.3 ≈ 13.7px inside the corner. The
        // masthead keeps its px-3 inset; the 6px/side difference is a ruled
        // trade, not drift — the bars share their RADIUS, not their width.
        //
        // ⚠️ GATED AT min-[360px], AND THE GATE IS MEASURED. The padding
        // spends the room the captions breathe in: below 360px the interior
        // caption gaps go negative (at 320px, "SCHEDULE" would overlap
        // "ROSTER") — so under 360 the bar keeps the pre-31-Aug rendering
        // exactly, trading the corner-ride back at the floor widths.
        // The island keeps px-2: its end words are short, and its width was
        // tuned around that padding (#530).
        compact
          ? 'left-0 right-0 mx-auto w-[300px] max-w-[calc(100%-24px)] px-2'
          : 'inset-x-3 px-2 min-[360px]:inset-x-1.5 min-[360px]:px-5',
        'transition-[transform,opacity] duration-300 ease-out motion-reduce:transition-none',
        hidden ? 'translate-y-[calc(100%+24px)] opacity-0' : 'translate-y-0 opacity-100',
      ].join(' ')}
    >
      <Glider box={box} routeKey={pathname} />
      {items.map(({ to, label, end, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={linkClassName}
          aria-label={badges[to] ? `${label}, new` : label}
        >
          {({ isActive }) => (
            <>
              {badges[to] && !isActive && <Dot />}
              {/* Lifted 5px when idle so the caption below has room; drops to
                  centre as the tab becomes active and the pill takes over. */}
              <Icon
                className={[
                  'h-[22px] w-[22px] shrink-0 transition-transform duration-300 ease-out motion-reduce:transition-none',
                  isActive ? '' : '-translate-y-[5px]',
                ].join(' ')}
                aria-hidden="true"
              />
              {/* The active tab's label, sliding open beside the icon in the pill. */}
              <span data-testid="dock-label" className={labelClassName({ isActive })}>{label}</span>
              {/* The always-on caption under every idle icon. */}
              <span data-testid="dock-caption" aria-hidden="true" className={captionClassName({ isActive })}>
                {label}
              </span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  )
}
