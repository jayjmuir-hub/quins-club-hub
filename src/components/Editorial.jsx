// The 2.0 editorial voice — phase 3 of the retheme
// (claude/plans/2026-08-21-retheme-and-shell.md), copied from the member
// portal's page anatomy measured live on 21 Aug 2026:
//
//   / KICKER LABEL                      <- tiny uppercase, crimson slash
//   Big bold headline, one accent.      <- Inter 700-800 + ONE Playfair-
//                                          italic crimson word
//
// One component each so every screen writes the pattern identically, and so
// phase 5's sweep is a call-site change rather than a re-design per screen.

/** The tiny label above a headline or section: crimson slash, then small
 * uppercase tracked text. The slash is decoration and hidden from AT. */
export function Kicker({ children, className = '' }) {
  return (
    <p
      className={`mb-1 flex items-center gap-1.5 font-condensed text-[11px] font-bold uppercase tracking-[0.14em] text-ink-muted ${className}`}
    >
      <span aria-hidden="true" className="font-accent text-[13px] font-semibold italic leading-none text-brand-ink">
        /
      </span>
      {children}
    </p>
  )
}

/**
 * The page headline: bold ink, with `accent` as the one Playfair-italic
 * crimson word — full stop included, exactly as the portal writes it
 * ("Club life, *calendared.*"). `lead` carries any comma or space it needs.
 */
export function AccentTitle({ lead, accent, as: Tag = 'h2', className = '' }) {
  return (
    <Tag className={`font-display text-[26px] font-extrabold tracking-[-0.02em] text-ink desktop:text-[32px] ${className}`}>
      {lead}
      {accent && <span className="accent-word font-semibold"> {accent}</span>}
    </Tag>
  )
}

/**
 * Section title with the trailing gradient rule — Dashboard's BlockTitle,
 * moved here in phase 3 so Squad Hub and the admin screens can write the
 * identical section anatomy. The crimson slash joined it in the same move.
 */
export function BlockTitle({ children }) {
  return (
    <h3 className="mb-2.5 ml-0.5 mt-[18px] flex items-center gap-2.5 font-display text-[17px] uppercase tracking-[0.03em] text-ink first:mt-0">
      <span aria-hidden="true" className="font-accent text-[15px] font-semibold italic leading-none text-brand-ink">
        /
      </span>
      <span>{children}</span>
      <span
        aria-hidden="true"
        className="h-[2px] flex-1 rounded-sm bg-[image:linear-gradient(90deg,theme(colors.brand.DEFAULT),transparent)]"
      />
    </h3>
  )
}
