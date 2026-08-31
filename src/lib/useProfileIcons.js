import { useCallback, useEffect, useState } from 'react'
import { listClubIconMap } from '../data/profileIcons.js'
import { iconEmoji } from './profileIcons.js'

// The club's primary profile icons, one cached fetch per mount
// (claude/plans/2026-08-31-profile-icons.md). Decoration in the chat-prefs
// sense: a failed fetch renders no icons, never an error — and an unknown
// key (an icon retired from the library) renders nothing too.
//
// Returns iconAfter(profileId): ' 👑' — with the leading space, ready to
// append to a name string — or '' for the undecorated.
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

  return useCallback(
    (profileId) => {
      const emoji = iconEmoji(map.get(profileId))
      return emoji ? ` ${emoji}` : ''
    },
    [map],
  )
}
