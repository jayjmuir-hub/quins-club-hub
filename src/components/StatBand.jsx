// Shared red→green kit band. Extracted from Dashboard 4 Sep 2026 so Home,
// Squad Hub and /seniors draw the same thin 3-across cells.
//
// StatTile is not a Card. Tiles are cells of one continuous red→green band —
// the club website's single strongest signature (its .statband). `tone` is
// kept in the signature so callers that still pass it do not change, but it
// is ignored: every numeral on the band is white, because the band's own
// colour is what varies across it.
//
// See tailwind.config.js `stat-band` for why the green stop is #157f3c rather
// than the site's #3bd070 (white text hits 2.01:1 on the raw green).
//
// Jay 4 Sep 2026 — thinner (~56px) 3-across on phone AND desktop. Never
// grid-cols-2 / desktop:grid-cols-4: that 2×2 stack was for a fourth
// "Needs a score" tile which Home no longer has. Labels stay one line
// (whitespace-nowrap, 9px condensed) so "REGISTERED PLAYERS" fits at 375px.

export function StatTile({ testId, value, label, className = '', tone: _tone }) {
  return (
    <div
      data-testid={testId}
      className={`border-r border-white/25 px-1.5 py-2 text-center last:border-r-0 desktop:px-3 ${className}`}
    >
      <div className="font-display text-[22px] leading-none text-white desktop:text-[28px]">
        {value}
      </div>
      <div className="mt-1.5 whitespace-nowrap font-condensed text-[9px] font-bold uppercase leading-none tracking-[0.02em] text-white/95 desktop:text-[10px] desktop:tracking-[0.06em]">
        {label}
      </div>
    </div>
  )
}

// Hairline + gradient. Margin is the CALLER's job: Home's pair wrapper owns
// mt-[18px] so the two rows can sit gap-1 apart. Putting the gap on the band
// itself would shove the W–D–L row a BlockTitle away from ops.
export function StatBand({ children, className = '' }) {
  return (
    <div className={`overflow-hidden rounded-card shadow-card ${className}`.trim()}>
      <div className="brand-rule" />
      <div className="grid grid-cols-3 bg-stat-band">{children}</div>
    </div>
  )
}
