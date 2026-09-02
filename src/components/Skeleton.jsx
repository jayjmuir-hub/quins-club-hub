// Loading placeholders in the SHAPE of what is coming.
//
// Redesign, 13 Aug 2026. The dashboard's first load replaced the whole screen
// with a centred spinner.
//
// ⚠️ THE PROBLEM WITH THE SPINNER WAS NEVER THAT IT WAS UGLY — it is that the
// page has no height while it spins. The masthead sits directly on the tab bar,
// then the data lands and the document grows by six hundred pixels in one
// frame. On a phone that reads as the app lurching, and if you had already
// started scrolling it throws away your position.
//
// A skeleton holds the space. The screen is the right height before the data
// arrives, so nothing moves when it does.
//
// ⚠️ aria-hidden AND NOT ANNOUNCED. The live region that says "Loading…" is the
// caller's job — a screen reader should hear one message, not a description of
// eleven grey rectangles. Every usage here sits inside a container that already
// carries role="status".

/** One shimmering block. Give it a height and width through className. */
export function Skeleton({ className = '' }) {
  return (
    <span
      aria-hidden="true"
      className={[
        // `relative overflow-hidden` is what clips the sweep to the block.
        'relative block overflow-hidden rounded-[6px] bg-surface-sunk',
        // ⚠️ THE SWEEP IS A CHILD, NOT A background-position ANIMATION.
        // Animating a gradient's position repaints the element every frame;
        // translating a child is compositor-only. Same reason every keyframe
        // in tailwind.config.js moves transform or opacity and nothing else.
        "after:absolute after:inset-0 after:animate-shimmer after:bg-gradient-to-r after:from-transparent after:via-white/60 after:to-transparent after:content-['']",
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    />
  )
}

/**
 * The dashboard's first-load shape: greeting, hero, fortnight strip, stat band,
 * then rows.
 *
 * ⚠️ IT MIRRORS THE REAL LAYOUT ON PURPOSE, including the 18px gaps and the
 * card radius. A generic stack of bars would still hold height, but it would
 * hold the WRONG height and the page would still jump — just less.
 *
 * ⚠️ EVERY NUMBER BELOW WAS MEASURED IN A BROWSER, NOT ESTIMATED, and that is
 * the only thing keeping this component honest. Measured 15 Aug 2026 against
 * the harness `dashboard` scenario: greeting 24, hero 214 at 390px and 170 at
 * 1280px, fortnight strip 79 at both, stat band 97/99, fixture row 104.
 * ⚠️ THE HERO IS TALLER ON A PHONE THAN ON A DESKTOP — 214 against 170 — which
 * is the reverse of what you would guess and is why the `desktop:` override
 * reads backwards. The headline wraps to two lines in a narrow column.
 *
 * ⚠️ IT WILL GO STALE THE NEXT TIME THE DASHBOARD GAINS A BLOCK, and the
 * failure is silent — the page simply starts jumping again. The first version
 * of this file was written against the 13 Aug dashboard and was already wrong
 * by the 15th: it had no greeting and no fortnight strip, and its hero was 152.
 * If you add a block to Dashboard.jsx, add it here. Squad contacts landed on
 * Home on 13 Aug and only joined this skeleton on 25 Aug, when the glossy
 * tiles retired and the rows became a card the placeholder could copy.
 */
function StaffContactRows({ count = 2 }) {
  return (
    <div className="overflow-hidden rounded-card border border-line bg-surface-card">
      {Array.from({ length: count }, (_, row) => (
        <div
          key={row}
          className="flex items-center gap-3 border-b border-line px-3.5 py-3 last:border-b-0"
        >
          <Skeleton className="h-11 w-11 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1">
            <Skeleton className="h-[15px] w-[140px]" />
            <Skeleton className="mt-1.5 h-[11px] w-[72px]" />
          </div>
          <Skeleton className="h-11 w-11 shrink-0 rounded-[11px]" />
        </div>
      ))}
    </div>
  )
}

export function DashboardSkeleton() {
  return (
    <div data-testid="dashboard-skeleton" aria-hidden="true">
      {/* Greeting */}
      <Skeleton className="mb-3 h-4 w-[172px]" />

      {/* Hero */}
      <Skeleton className="mb-4 h-[214px] rounded-card desktop:h-[170px]" />

      {/* "Next two weeks", then the fortnight strip. */}
      <Skeleton className="ml-0.5 mt-[18px] h-4 w-[136px]" />
      <Skeleton className="mt-2.5 h-[79px] rounded-card" />

      {/* Stat band — three cells, one block, because that is how it renders. */}
      <Skeleton className="mt-[18px] h-[97px] rounded-card desktop:h-[99px]" />

      {/* "Upcoming", then rows. */}
      <Skeleton className="ml-0.5 mt-[18px] h-4 w-[104px]" />
      <div className="mt-2.5 overflow-hidden rounded-card border border-line bg-surface-card">
        {[0, 1, 2, 3].map((row) => (
          <div
            key={row}
            className="flex h-[104px] items-center gap-[13px] border-b border-line px-[14px] last:border-b-0"
          >
            {/* The date box: 52px wide, same as FixtureRow's. */}
            <Skeleton className="h-[58px] w-[52px] shrink-0 rounded-[11px]" />
            <div className="min-w-0 flex-1">
              <Skeleton className="h-[18px] w-[92px] rounded-pill" />
              <Skeleton className="mt-2 h-[15px] w-[62%] max-w-[260px]" />
              <Skeleton className="mt-2 h-[12px] w-[40%] max-w-[180px]" />
            </div>
          </div>
        ))}
      </div>

      {/* Squad contacts — the same row card the loaded block draws. */}
      <Skeleton className="ml-0.5 mt-[18px] h-4 w-[128px]" />
      <div className="mt-2.5">
        <StaffContactRows />
      </div>
    </div>
  )
}

/**
 * /notices first-load shape: the NoticeRow card (stripe, circular face,
 * title, two body lines) three times. A generic pulse block here is what
 * made the board lurch when the rows landed — they are the same Card as Home.
 */
export function NoticesSkeleton() {
  return (
    <div data-testid="notices-skeleton" aria-hidden="true">
      {[0, 1, 2].map((row) => (
        <div
          key={row}
          className="mb-2.5 overflow-hidden rounded-card border border-line bg-surface-card"
        >
          <div className="flex min-h-[132px]">
            <span className="w-1.5 shrink-0 bg-surface-sunk" />
            <div className="min-w-0 flex-1 px-3.5 py-3.5">
              <div className="flex items-center gap-2.5">
                <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
                <div className="min-w-0 flex-1">
                  <Skeleton className="h-[14px] w-[128px]" />
                  <Skeleton className="mt-2 h-[12px] w-[72px] rounded-[6px]" />
                </div>
              </div>
              <Skeleton className="mt-3 h-[16px] w-[70%] max-w-[280px]" />
              <Skeleton className="mt-2 h-[12px] w-[90%]" />
              <Skeleton className="mt-1.5 h-[12px] w-[55%]" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

/**
 * Squad Hub first-load shape: calendar card, door cards, tracking card —
 * the same grid the loaded screen uses, so the page does not grow when
 * the events land.
 */
/**
 * Bare `/squad` picker while memberships load — editorial Card rows with
 * circular marks, the same language the loaded picker and Chat already use.
 * The hub skeleton below is a different screen (calendar / doors / tracking)
 * and must not stand in for this one: a picker that pulsed as a dashboard
 * would jump when the list arrived.
 */
export function SquadHubPickerSkeleton() {
  return (
    <div data-testid="squad-hub-picker-skeleton" aria-hidden="true">
      <div className="overflow-hidden rounded-card border border-line bg-surface-card">
        {[0, 1, 2, 3].map((row) => (
          <div
            key={row}
            className="flex items-center gap-3 border-b border-line/50 px-3.5 py-3 last:border-b-0"
          >
            <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1">
              <Skeleton className="h-[14px] w-[42%]" />
              <Skeleton className="mt-1.5 h-[11px] w-[28%]" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * Squad Hub first-load shape: calendar card, door cards, tracking card —
 * the same grid the loaded screen uses, so the page does not grow when
 * the events land.
 */
export function SquadHubSkeleton() {
  return (
    <div data-testid="squad-hub-skeleton" aria-hidden="true">
      <div className="desktop:grid desktop:grid-cols-[1.15fr_.85fr] desktop:gap-x-4">
        <div className="mb-4 overflow-hidden rounded-card border border-line bg-surface-card p-4 desktop:col-start-1 desktop:row-start-1">
          <Skeleton className="h-4 w-[140px]" />
          {[0, 1, 2].map((row) => (
            <div key={row} className="mt-3 flex items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <Skeleton className="h-[14px] w-[55%]" />
                <Skeleton className="mt-1.5 h-[12px] w-[40%]" />
              </div>
              <Skeleton className="h-[12px] w-[72px]" />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 gap-3 desktop:col-start-2 desktop:row-start-1 desktop:content-start">
          {[0, 1, 2].map((row) => (
            <div key={row} className="rounded-card border border-line bg-surface-card p-4">
              <Skeleton className="h-[15px] w-[88px]" />
              <Skeleton className="mt-2 h-[12px] w-[80%]" />
              <Skeleton className="mt-3 h-[12px] w-[120px]" />
            </div>
          ))}
        </div>
        <div className="mb-4 rounded-card border border-line bg-surface-card p-4 desktop:col-span-2 desktop:row-start-2">
          <Skeleton className="h-4 w-[160px]" />
          <Skeleton className="mt-3 h-[12px] w-[90%] max-w-[420px]" />
          <Skeleton className="mt-4 h-9 w-full rounded-pill" />
          {[0, 1, 2, 3].map((row) => (
            <div
              key={row}
              className="mt-2 flex items-center justify-between gap-2 border-b border-line/50 py-2.5 last:border-b-0"
            >
              <Skeleton className="h-[14px] w-[38%]" />
              <Skeleton className="h-[14px] w-[72px]" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default Skeleton

/**
 * A generic list placeholder: a card of `rows` rows, each `rowHeight` tall,
 * with a leading block (avatar or date tile) and two text lines.
 *
 * Item 6 of the 2 Sep 2026 UX review. The busiest lists — chats, roster,
 * schedule, documents, accounts — all spun with no reserved height, so the
 * page collapsed and lurched exactly as this file's header describes. One
 * measured shape per screen beats five bespoke skeletons that rot separately.
 *
 * ⚠️ `rowHeight` IS THE WHOLE POINT, and it is per call site: roster player
 * row 68 (measured in the harness at phone width, 2 Sep 2026), fixture row
 * 104 (measured 15 Aug, see DashboardSkeleton), chat row 68 (44px avatar +
 * py-3, from the classes), document card 64 and pending-approval card 88
 * (from their padding and line counts — derived, not measured; re-measure if
 * either screen starts jumping). Inline style, not a Tailwind class, because
 * the value is a prop.
 *
 * aria-hidden like everything else here: the caller wraps it in role="status"
 * with one sr-only sentence.
 */
export function ListSkeleton({ rows = 5, rowHeight = 68, lead = 'circle', className = '' }) {
  const leadClass =
    lead === 'square'
      ? 'h-11 w-11 shrink-0 rounded-[11px]'
      : lead === 'none'
        ? 'hidden'
        : 'h-11 w-11 shrink-0 rounded-full'
  return (
    <div
      aria-hidden="true"
      data-testid="list-skeleton"
      className={`overflow-hidden rounded-card border border-line bg-surface-card ${className}`}
    >
      {Array.from({ length: rows }, (_, row) => (
        <div
          key={row}
          data-testid="list-skeleton-row"
          style={{ height: rowHeight }}
          className="flex items-center gap-3 border-b border-line px-3.5 last:border-b-0"
        >
          <Skeleton className={leadClass} />
          <div className="min-w-0 flex-1">
            <Skeleton className="h-[15px] w-[46%]" />
            <Skeleton className="mt-1.5 h-[11px] w-[28%]" />
          </div>
        </div>
      ))}
    </div>
  )
}
