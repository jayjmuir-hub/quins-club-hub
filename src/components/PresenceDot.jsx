// The presence dot — green online, yellow away, grey offline
// (claude/plans/2026-08-26-last-active-and-presence-dots.md; Jay: "green dot
// for online, yellow dot for away … use the grey dot").
//
// ⚠️ GREY IS A STATE, NOT AN ABSENCE. Jay chose an explicit grey dot over
// no-dot: with three visible states, a missing dot no longer ambiguously
// means either "offline" or "the feature broke". Callers that have no
// presence to report (pickers, group rows) simply don't render this at all —
// a group is not online.
//
// ⚠️ NEVER COLOUR ALONE (claude/specs/accessibility.md): the state is also
// written for screen readers. NAMED TOKENS ONLY — tests/theme.test.js
// refuses raw hex in arbitrary values.

const TONE = {
  online: 'bg-accent',
  away: 'bg-warn',
  offline: 'bg-line-strong',
}

const LABEL = {
  online: 'Online',
  away: 'Away',
  offline: 'Offline',
}

export default function PresenceDot({ state = 'offline' }) {
  const tone = TONE[state] ?? TONE.offline
  const label = LABEL[state] ?? LABEL.offline
  return (
    <span
      data-testid="presence-dot"
      data-state={TONE[state] ? state : 'offline'}
      role="img"
      aria-label={label}
      // The ring is what keeps the dot readable over a photo or gradient.
      className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-surface-card ${tone}`}
    />
  )
}
