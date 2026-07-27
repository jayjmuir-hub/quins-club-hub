### Task 4: Google OAuth sign-in
**Files:** Modify `src/lib/auth.jsx` (add `signInWithGoogle()`), `tests/auth.test.jsx`.
**Interfaces:** Produces `signInWithGoogle()` → `supabase.auth.signInWithOAuth({provider:'google', options:{redirectTo}})`.
- [ ] Test: `signInWithGoogle` calls supabase OAuth with provider `google` (mock).
- [ ] Implement; commit. (Jay task: create Google OAuth client, paste into Supabase → Auth → Providers.)

