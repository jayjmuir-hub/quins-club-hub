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
 * If you add a block to Dashboard.jsx, add it here.
 */
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
    </div>
  )
}

export default Skeleton
