import { useEffect, useState } from 'react'
import { getMemberIdentity } from '../data/identity.js'
import { identityBadges } from '../lib/identity.js'

// Who this person IS, as a row of badges — every hat, in the order
// src/lib/identity.js decides (claude/plans/2026-08-26-dm-identity-rows.md).
// Shared by the DM screen's sticky header and the floating dock's thread
// top, per the shared-chat-thread no-drift rule: one file, or the dock
// falls behind again.
//
// Decoration with the DM thread's own stance: a failed or empty fetch
// renders NOTHING — never an error, and never a guess.

const TONE = {
  // Officer titles wear the brand itself — club constitution, not app role.
  officer: 'bg-brand text-ink-invert',
  admin: 'bg-danger-bg text-danger-ink',
  staff: 'bg-danger-bg text-danger-ink',
  family: 'bg-surface-mute text-ink-muted',
}

export default function IdentityBadges({ profileId, className = '' }) {
  const [badges, setBadges] = useState([])

  useEffect(() => {
    if (!profileId) {
      setBadges([])
      return undefined
    }
    let mounted = true
    getMemberIdentity(profileId)
      .then((rows) => mounted && setBadges(identityBadges(rows)))
      .catch(() => mounted && setBadges([]))
    return () => {
      mounted = false
    }
  }, [profileId])

  if (badges.length === 0) return null
  return (
    <div data-testid="dm-identity" className={`flex flex-wrap items-center gap-1.5 ${className}`}>
      {badges.map((badge) => (
        <span key={badge.label} className="inline-flex items-baseline gap-1.5">
          <span className={`rounded-[6px] px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-[.4px] ${TONE[badge.tone]}`}>
            {badge.label}
          </span>
          {badge.squads ? <span className="text-[12px] font-semibold text-ink-muted">{badge.squads}</span> : null}
        </span>
      ))}
    </div>
  )
}
