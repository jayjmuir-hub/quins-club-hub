import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import InstallPrompt from '../src/components/InstallPrompt.jsx'
import {
  isIosSafari,
  isInstalled,
  __resetInstallPromptForTests,
  __setDeferredPromptForTests,
} from '../src/lib/installPrompt.js'

// "Add to your home screen". Jay, 12 Aug 2026, asked "do we have a PWA for
// this?" — the app has been installable since the PWA plugin landed and
// nothing in the UI ever said so.
//
// ⚠️ WHAT THESE GUARD is the platform split, because getting it wrong produces
// a button that CANNOT work. iOS has no programmatic install: Safari never
// fires `beforeinstallprompt`, and Add to Home Screen exists only in Safari —
// not in Chrome or Firefox on an iPhone. So the rules are: a button only where
// there is an event to replay, instructions only where they are true, and
// nothing anywhere else.

const UA = {
  androidChrome:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Mobile Safari/537.36',
  iphoneSafari:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  iphoneChrome:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0 Mobile/15E148 Safari/604.1',
  desktopChrome:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36',
  ipadOS:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
}

// ⚠️ defineProperty, NOT vi.spyOn. jsdom's navigator has no `maxTouchPoints`
// at all, and spyOn refuses to stub a property that does not exist
// ("maxTouchPoints does not exist"). That absence is itself worth knowing:
// the iPad branch depends on a property the test environment does not model,
// so it can only ever be exercised by defining it.
const stubbed = []
function define(name, value) {
  const had = Object.prototype.hasOwnProperty.call(window.navigator, name)
  const previous = had ? Object.getOwnPropertyDescriptor(window.navigator, name) : null
  Object.defineProperty(window.navigator, name, { value, configurable: true, writable: true })
  stubbed.push([name, previous])
}
function restorePlatform() {
  while (stubbed.length) {
    const [name, previous] = stubbed.pop()
    if (previous) Object.defineProperty(window.navigator, name, previous)
    else delete window.navigator[name]
  }
}

function setPlatform({ ua, platform = 'Win32', touchPoints = 0, standalone = undefined, displayMode = false }) {
  define('userAgent', ua)
  define('platform', platform)
  define('maxTouchPoints', touchPoints)
  if (standalone !== undefined) define('standalone', standalone)
  window.matchMedia = vi.fn().mockImplementation((q) => ({
    matches: q === '(display-mode: standalone)' ? displayMode : false,
    media: q,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }))
}

function fakeEvent(outcome = 'accepted') {
  return {
    preventDefault: vi.fn(),
    prompt: vi.fn().mockResolvedValue(undefined),
    userChoice: Promise.resolve({ outcome }),
  }
}

beforeEach(() => {
  __resetInstallPromptForTests()
  delete window.navigator.standalone
})
afterEach(() => {
  vi.restoreAllMocks()
  restorePlatform()
  __resetInstallPromptForTests()
})

describe('Platform detection', () => {
  it('recognises iPhone Safari', () => {
    setPlatform({ ua: UA.iphoneSafari })
    expect(isIosSafari()).toBe(true)
  })

  it('⚠️ does NOT treat Chrome on an iPhone as Safari', () => {
    // The discriminating case, and the one that matters most: Add to Home
    // Screen is absent from Chrome-on-iOS's share sheet, so telling that user
    // to "tap Share" sends them hunting for a menu item that is not there.
    setPlatform({ ua: UA.iphoneChrome })
    expect(isIosSafari()).toBe(false)
  })

  it('⚠️ recognises an iPad, which reports itself as a Mac', () => {
    // iPadOS 13+ sets platform 'MacIntel'. Only the touch-point count
    // separates it from a desktop Mac — without that, iPad users are told
    // nothing at all.
    setPlatform({ ua: UA.ipadOS, platform: 'MacIntel', touchPoints: 5 })
    expect(isIosSafari()).toBe(true)
  })

  it('⚠️ does NOT mistake a desktop Mac for an iPad', () => {
    // Same UA and platform as the iPad above; only maxTouchPoints differs.
    setPlatform({ ua: UA.ipadOS, platform: 'MacIntel', touchPoints: 0 })
    expect(isIosSafari()).toBe(false)
  })

  it('detects an installed app on Android via display-mode', () => {
    setPlatform({ ua: UA.androidChrome, displayMode: true })
    expect(isInstalled()).toBe(true)
  })

  it('⚠️ detects an installed app on iOS via navigator.standalone', () => {
    // iOS Safari has never implemented `display-mode: standalone` for this.
    // Checking only the standard property shows the banner to every iPhone
    // user who has already installed it.
    setPlatform({ ua: UA.iphoneSafari, standalone: true, displayMode: false })
    expect(isInstalled()).toBe(true)
  })
})

describe('The banner — when it appears at all', () => {
  it('renders nothing before the browser offers an install', () => {
    setPlatform({ ua: UA.androidChrome })
    render(<InstallPrompt />)
    expect(screen.queryByTestId('install-prompt')).toBeNull()
  })

  it('renders nothing on a desktop browser that never offered one', () => {
    setPlatform({ ua: UA.desktopChrome })
    render(<InstallPrompt />)
    expect(screen.queryByTestId('install-prompt')).toBeNull()
  })

  it('⚠️ renders nothing in Chrome on an iPhone', () => {
    // No event on iOS, and the Safari-only instructions would be wrong here.
    setPlatform({ ua: UA.iphoneChrome })
    render(<InstallPrompt />)
    expect(screen.queryByTestId('install-prompt')).toBeNull()
  })

  it('⚠️ renders nothing when the app is already installed', () => {
    setPlatform({ ua: UA.androidChrome, displayMode: true })
    __setDeferredPromptForTests(fakeEvent())
    render(<InstallPrompt />)
    expect(screen.queryByTestId('install-prompt')).toBeNull()
  })
})

describe('Android — a real install button', () => {
  it('appears once the browser offers an install', async () => {
    setPlatform({ ua: UA.androidChrome })
    __setDeferredPromptForTests(fakeEvent())
    render(<InstallPrompt />)
    expect(await screen.findByTestId('install-prompt')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^install$/i })).toBeInTheDocument()
  })

  it('⚠️ appears even when the event arrives AFTER mount', async () => {
    // The module captures the event at load, which is normally before React
    // mounts — but a slow first paint inverts that order. Without the
    // subscription the banner would never appear on exactly that load.
    setPlatform({ ua: UA.androidChrome })
    render(<InstallPrompt />)
    expect(screen.queryByTestId('install-prompt')).toBeNull()
    __setDeferredPromptForTests(fakeEvent())
    expect(await screen.findByTestId('install-prompt')).toBeInTheDocument()
  })

  it('runs the real browser install flow when tapped', async () => {
    setPlatform({ ua: UA.androidChrome })
    const event = fakeEvent('accepted')
    __setDeferredPromptForTests(event)
    render(<InstallPrompt />)
    await userEvent.setup().click(await screen.findByRole('button', { name: /^install$/i }))
    await waitFor(() => expect(event.prompt).toHaveBeenCalled())
  })

  it('shows no Safari instructions on Android', async () => {
    setPlatform({ ua: UA.androidChrome })
    __setDeferredPromptForTests(fakeEvent())
    render(<InstallPrompt />)
    await screen.findByTestId('install-prompt')
    expect(screen.queryByText(/add to home screen/i)).toBeNull()
  })
})

describe('iOS Safari — instructions, and deliberately no button', () => {
  it('appears with no install event at all', async () => {
    setPlatform({ ua: UA.iphoneSafari })
    render(<InstallPrompt />)
    expect(await screen.findByTestId('install-prompt')).toBeInTheDocument()
  })

  it('⚠️ renders NO Install button, because none could work', async () => {
    // Apple exposes no programmatic install. A button here would be a control
    // that invites a tap and swallows it — the exact defect EventDetail's
    // availability button shipped with.
    setPlatform({ ua: UA.iphoneSafari })
    render(<InstallPrompt />)
    await screen.findByTestId('install-prompt')
    expect(screen.queryByRole('button', { name: /^install$/i })).toBeNull()
  })

  it('names Safari and the Add to Home Screen step', async () => {
    setPlatform({ ua: UA.iphoneSafari })
    render(<InstallPrompt />)
    const banner = await screen.findByTestId('install-prompt')
    expect(banner).toHaveTextContent(/Safari/)
    expect(banner).toHaveTextContent(/Add to Home Screen/i)
  })
})

describe('The heading, and the word it deliberately borrows', () => {
  // ⚠️ NOTHING PINNED THIS COPY UNTIL 20 Aug 2026, WHICH IS WHY IT IS HERE.
  // Jay asked for "Download the App" because that is the word parents look
  // for. It is also the one word that is not literally true — nothing is
  // downloaded from a store — so it is exactly the sort of deliberate wording
  // that gets "corrected" back by somebody reading the body text.
  it('says Download the App on Android', async () => {
    setPlatform({ ua: UA.androidChrome })
    __setDeferredPromptForTests(fakeEvent())
    render(<InstallPrompt />)
    await screen.findByTestId('install-prompt')
    expect(screen.getByText('Download the App')).toBeInTheDocument()
  })

  it('says Download the App on iOS Safari too', async () => {
    setPlatform({ ua: UA.iphoneSafari })
    render(<InstallPrompt />)
    await screen.findByTestId('install-prompt')
    expect(screen.getByText('Download the App')).toBeInTheDocument()
  })

  // ⚠️ THE HEADING AND THE SAFARI STEP MUST DISAGREE, AND THIS IS THE GUARD.
  // "Add to Home Screen" is the literal menu item a parent has to find in the
  // iOS share sheet. Renaming it to match the heading would point at a control
  // that does not exist — the dead-affordance defect this component's
  // Android/iOS split exists to avoid.
  it('⚠️ still names the real Safari menu item, which is NOT "Download"', async () => {
    setPlatform({ ua: UA.iphoneSafari })
    render(<InstallPrompt />)
    await screen.findByTestId('install-prompt')
    expect(screen.getByText(/add to home screen/i)).toBeInTheDocument()
  })
})

describe('Dismissing it', () => {
  it('closes and stays closed on the next render', async () => {
    setPlatform({ ua: UA.iphoneSafari })
    const { unmount } = render(<InstallPrompt />)
    await userEvent.setup().click(await screen.findByRole('button', { name: /got it/i }))
    expect(screen.queryByTestId('install-prompt')).toBeNull()

    // ⚠️ THE HALF THAT MATTERS. Hiding it in local state alone would bring the
    // banner back on the next route change, since this sits in AppShell, which
    // re-renders constantly.
    unmount()
    render(<InstallPrompt />)
    expect(screen.queryByTestId('install-prompt')).toBeNull()
  })

  it('⚠️ survives localStorage being unavailable', async () => {
    // Private browsing throws on both read and write. A banner that cannot
    // remember a dismissal is acceptable; a crash that takes the shell — and
    // therefore every screen — down is not.
    setPlatform({ ua: UA.iphoneSafari })
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })
    render(<InstallPrompt />)
    expect(await screen.findByTestId('install-prompt')).toBeInTheDocument()
    await userEvent.setup().click(screen.getByRole('button', { name: /got it/i }))
    expect(screen.queryByTestId('install-prompt')).toBeNull()
    spy.mockRestore()
  })
})
