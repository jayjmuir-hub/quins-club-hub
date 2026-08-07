import { useEffect, useState } from 'react'
import { useAuth } from './auth.jsx'
import { getMyProfile } from '../data/members.js'

// The signed-in person's own profile row — currently just their name.
//
// WHY A SHARED HOOK. Two places want it and more will: the dashboard greeting
// and the masthead account button. Without this they would each fire their own
// getMyProfile on every mount, which is one wasted round trip per screen on a
// pitch-side phone.
//
// The cache is module-level and keyed by user id, so a second caller gets the
// in-flight PROMISE rather than starting a second request. It is deliberately
// not a React context: a context would need a provider threaded through
// AppShell and every test that renders these components in isolation, to save
// a single request that this already saves.
//
// ⚠️ The cache is never invalidated, and that is a real limitation, not an
// oversight. If someone changes their name via NamePrompt mid-session, the
// greeting keeps the old one until reload. Accepted because the name is
// confirmed once at first sign-in and effectively never edited after; if that
// changes, clear the entry on a successful updateProfileNames rather than
// making this hook poll.

const cache = new Map()

export function primeMyProfileCache(userId, profile) {
  // Test seam, and the escape hatch for the staleness note above.
  if (userId) cache.set(userId, Promise.resolve(profile))
}

export function clearMyProfileCache() {
  cache.clear()
}

export default function useMyProfile() {
  const { user } = useAuth()
  const userId = user?.id ?? null
  const [profile, setProfile] = useState(null)

  useEffect(() => {
    if (!userId) {
      setProfile(null)
      return undefined
    }

    let active = true
    if (!cache.has(userId)) {
      // A rejected fetch must not poison the cache — otherwise one blip on a
      // bad connection means no greeting for the rest of the session.
      cache.set(
        userId,
        getMyProfile(userId).catch(() => {
          cache.delete(userId)
          return null
        }),
      )
    }

    cache.get(userId).then((row) => {
      if (active) setProfile(row ?? null)
    })

    return () => {
      active = false
    }
  }, [userId])

  const firstName = typeof profile?.first_name === 'string' ? profile.first_name.trim() : ''

  return {
    profile,
    // Empty string, never undefined, so callers can do `firstName && ...`
    // without a second null check. Everything that shows a name must cope
    // with this being empty: a Google sign-in fills full_name but a magic-link
    // sign-in has nothing until NamePrompt is answered, and it is skippable.
    firstName,
  }
}
