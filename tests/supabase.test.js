// @vitest-environment node
// Reaches @supabase/supabase-js, which needs a global WebSocket. That is why
// this file sat in jsdom until 15 Aug 2026: CI pinned Node 20, where WebSocket
// is not a global. CI now runs Node 24, matching both dev PCs.
import { describe, it, expect, afterEach, vi } from 'vitest'

// Unit tests for src/lib/supabase.js.
// The module reads import.meta.env at import time, so each scenario needs a
// fresh module instance with env vars stubbed beforehand. vi.stubEnv +
// vi.resetModules() + dynamic import() is the reliable way to do this in
// Vitest (see vite.config.js comment / task notes).

const MODULE_PATH = '../src/lib/supabase.js'

describe('src/lib/supabase.js', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('throws a clear, actionable error when VITE_SUPABASE_URL is missing', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test-anon-key')

    await expect(import(MODULE_PATH)).rejects.toThrow(/VITE_SUPABASE_URL/)
  })

  it('throws a clear, actionable error when VITE_SUPABASE_ANON_KEY is missing', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '')

    await expect(import(MODULE_PATH)).rejects.toThrow(/VITE_SUPABASE_ANON_KEY/)
  })

  it('throws a clear, actionable error when both env vars are missing', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '')

    await expect(import(MODULE_PATH)).rejects.toThrow(
      /VITE_SUPABASE_URL.*VITE_SUPABASE_ANON_KEY|VITE_SUPABASE_ANON_KEY.*VITE_SUPABASE_URL/s,
    )
  })

  it('exports a working supabase client when both env vars are present', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test-anon-key')

    const { supabase } = await import(MODULE_PATH)

    expect(supabase).toBeDefined()
    // Confirms a real @supabase/supabase-js client was constructed, not a stub.
    expect(typeof supabase.from).toBe('function')
    expect(typeof supabase.auth.getSession).toBe('function')
  })
})
