import { useEffect, useState } from 'react'

// True once a new service worker has replaced the one that was serving this
// page — src/sw-register.js dispatches `app-updated` on window at that
// moment. The shell turns it into a passive "refresh when convenient" line;
// nothing reloads on the person's behalf, because they may be mid-form.
// (2 Sep 2026 UX review, extra findings.)
export default function useAppUpdated() {
  const [updated, setUpdated] = useState(false)
  useEffect(() => {
    const onUpdated = () => setUpdated(true)
    window.addEventListener('app-updated', onUpdated)
    return () => window.removeEventListener('app-updated', onUpdated)
  }, [])
  return updated
}
