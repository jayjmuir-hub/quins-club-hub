import { useEffect, useState } from 'react'

// Is the browser online? — 2 Sep 2026 UX review (parents, Medium): at the
// pitch with no signal a cached screen showed day-old data with no hint,
// after an eight-second spinner. The service worker serves what it last
// loaded (src/sw-register.js, vite.config.js networkTimeoutSeconds); this
// hook is what lets the shell SAY so.
//
// ⚠️ `navigator.onLine` IS A HINT, NOT A PROMISE. Browsers answer true on a
// captive portal and on Wi-Fi with no internet, and false only when they
// are sure. So the banner this drives is worded as "showing what was last
// loaded" and never "you cannot do anything" — a write attempted while
// offline still fails in its own words, which is right.
export default function useOnline() {
  const [online, setOnline] = useState(() =>
    typeof navigator === 'undefined' || typeof navigator.onLine !== 'boolean' ? true : navigator.onLine,
  )
  useEffect(() => {
    const up = () => setOnline(true)
    const down = () => setOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => {
      window.removeEventListener('online', up)
      window.removeEventListener('offline', down)
    }
  }, [])
  return online
}
