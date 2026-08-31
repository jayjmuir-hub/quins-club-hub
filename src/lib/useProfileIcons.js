import { useCallback, useEffect, useState } from 'react'
import { listClubIconMap } from '../data/profileIcons.js'
import { iconEmoji } from './profileIcons.js'

// The club's primary profile icons, one cached fetch per mount
// (claude/plans/2026-08-31-profile-icons.md). Decoration in the chat-prefs
// sense: a failed fetch renders no icons, never an error — and an unknown
// key (an icon retired from the library) renders nothing too.
//
// Returns iconFor(profileId): the raw emoji, or null for the undecorated —
// callers render it through components/ProfileIcon.jsx, which owns the
// centring and size (Jay's 31 Aug polish: a string ride-along sat on the
// baseline and inherited the tiny name font).
export default function useProfileIcons() {
  const [map, setMap] = useState(() => new Map())

  useEffect(() => {
    let stale = false
    listClubIconMap()
      .then((m) => {
        if (!stale) setMap(m)
      })
      .catch(() => {})
    return () => {
      stale = true
    }
  }, [])

  return useCallback((profileId) => iconEmoji(map.get(profileId)), [map])
}
