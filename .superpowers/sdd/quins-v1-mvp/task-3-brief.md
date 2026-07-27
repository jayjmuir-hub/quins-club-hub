### Task 3: Auth context (session + magic link + sign-out)
**Files:** Create `src/lib/auth.jsx` (`AuthProvider`, `useAuth`), `tests/auth.test.jsx`.
**Interfaces:** Produces `useAuth() → { session, user, loading, signInWithEmail(email), signOut() }`.
- [ ] Test: provider exposes `loading: true` then a null session when signed out (mock `supabase.auth`); `signInWithEmail` calls `signInWithOtp` with the email and an `emailRedirectTo` of the app origin; `signOut` calls `supabase.auth.signOut`.
- [ ] Implement provider: `supabase.auth.getSession()`, `onAuthStateChange` (unsubscribe on unmount), `signInWithOtp({email})`, `signOut()`.
- [ ] Verify test passes. Commit.

