import { supabase } from '../lib/supabase.js'

// Account deletion — the client half of public.delete_my_account().
//
// The RPC takes NO ARGUMENTS on purpose. It reads auth.uid() and deletes the
// caller, so there is no id to tamper with and no way to aim it at somebody
// else. Everything that matters is enforced in the database, not here:
// db/migrations/20260806_delete_my_account.sql.
//
// ⚠️ The database RAISES on refusal rather than returning a zero-row success,
// which is the opposite of every other writer in this codebase (see the
// REFUSED_* constants in members.js). That is deliberate for this one call:
// "we could not delete your account" must never be indistinguishable from
// "we deleted your account", and a silent success on a deletion request is
// the worst possible failure mode.

// The one refusal a person can actually act on, raised as P0001. Matched on
// the text because PostgREST flattens the SQLSTATE into the message body and
// P0001 is the generic "raise exception" code — it identifies nothing on its own.
const LAST_ADMIN = /only admin/i

export const LAST_ADMIN_MESSAGE =
  'You are the only admin, so you cannot delete your account yet. Make someone else an admin first — then this will work.'

export async function deleteMyAccount() {
  const { error } = await supabase.rpc('delete_my_account')

  if (error) {
    if (LAST_ADMIN.test(error.message || '')) {
      throw new Error(LAST_ADMIN_MESSAGE)
    }
    throw error
  }

  // The account is gone, but this browser is still holding the tokens it was
  // issued. Clear them locally so the app cannot keep making requests as a
  // user the database no longer has.
  //
  // scope 'local' — 'global' would call the server to revoke sessions for a
  // user that no longer exists, and its failure would surface as though the
  // DELETION had failed, which it has not.
  await supabase.auth.signOut({ scope: 'local' }).catch(() => {})
}
