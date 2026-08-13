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
 * The dashboard's first-load shape: hero, stat band, then rows.
 *
 * ⚠️ IT MIRRORS THE REAL LAYOUT ON PURPOSE, including the 18px gaps and the
 * card radius. A generic stack of bars would still hold height, but it would
 * hold the WRONG height and the page would still jump — just less.
 */
export function DashboardSkeleton() {
  return (
    <div data-testid="dashboard-skeleton" aria-hidden="true">
      {/* Hero */}
      <Skeleton className="mb-4 h-[152px] rounded-card desktop:h-[168px]" />

      {/* Stat band — three cells, one block, because that is how it renders. */}
      <Skeleton className="h-[99px] rounded-card" />

      {/* Section heading, then rows. */}
      <Skeleton className="mt-[26px] h-4 w-[168px]" />
      <div className="mt-2.5 overflow-hidden rounded-card border border-line bg-surface-card">
        {[0, 1, 2, 3].map((row) => (
          <div
            key={row}
            className="flex items-center gap-3.5 border-b border-line px-4 py-3.5 last:border-b-0"
          >
            <Skeleton className="h-[44px] w-[44px] shrink-0 rounded-[10px]" />
            <div className="min-w-0 flex-1">
              <Skeleton className="h-[15px] w-[62%] max-w-[260px]" />
              <Skeleton className="mt-2 h-[12px] w-[40%] max-w-[180px]" />
            </div>
            <Skeleton className="h-[22px] w-[58px] shrink-0 rounded-pill" />
          </div>
        ))}
      </div>
    </div>
  )
}

export default Skeleton
