import { createClient } from '@supabase/supabase-js'

// Single-responsibility Supabase client for the app. No auth helpers, no
// query helpers, no retry logic — those belong to later tasks.

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

const missing = []
if (!supabaseUrl) missing.push('VITE_SUPABASE_URL')
if (!supabaseAnonKey) missing.push('VITE_SUPABASE_ANON_KEY')

if (missing.length > 0) {
  throw new Error(
    `Missing required Supabase env var(s): ${missing.join(', ')}. ` +
      'Copy .env.example to .env and fill in the values from Supabase → Settings → API.',
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})
