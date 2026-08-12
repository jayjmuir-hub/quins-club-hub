// Base card container (design-system.md §4.5 / §3): white background, the
// design system's large radius (--radius, 16px) and elevation (--shadow), a
// hairline border. No default padding — the prototype uses .card both as a
// bare wrapper around list rows (rows supply their own padding + dividers,
// e.g. .fixture, .player) and as a padded content box (padding added per
// context, e.g. .stat). Callers pass padding via className.
//
// `as` lets a caller render the card as something other than a <div> (e.g. a
// <section>) without duplicating the base styling — not used yet, but cheap
// and matches how Nav/AppShell already accept a few such escape hatches.

export function Card({ as: Tag = 'div', className = '', children, ...rest }) {
  const classes = [
    'rounded-card',
    'border',
    'border-line',
    'bg-surface-card',
    'shadow-card',
    // ⚠️ SO A SHADOW CHANGE ANIMATES RATHER THAN SNAPPING. Cards that are
    // themselves links (the portal chooser) lift on hover; without this the
    // elevation would jump between two states in one frame, which reads as a
    // flicker rather than as a lift. Costs nothing on a card that never
    // changes — `transition-shadow` animates one property and only when it
    // actually differs.
    'transition-shadow',
    'duration-200',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <Tag className={classes} {...rest}>
      {children}
    </Tag>
  )
}

export default Card
