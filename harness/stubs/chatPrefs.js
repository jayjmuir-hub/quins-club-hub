// Stub for src/data/chatPrefs.js — pins, archive and the per-chat wallpaper
// (26 Aug 2026). The real module imports supabase at module scope; without
// this alias the harness would make live (failing) requests from every
// thread scenario, against the config's "nothing here ever talks to
// Supabase" contract. No stored prefs: every chat renders the default
// wallpaper, unpinned and unarchived. `?background=<key>` overrides, so the
// wallpaper scenarios can shoot each paper deterministically.

const forcedBackground = new URLSearchParams(window.location.search).get('background')

export async function listMyChatPrefs() {
  return new Map()
}

export async function getMyChatPref() {
  return forcedBackground ? { pinned: false, archived: false, background: forcedBackground } : null
}

export async function setChatPref() {}
