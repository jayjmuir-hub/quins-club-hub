import { supabase } from '../lib/supabase.js'
import { deleteStaffPhoto } from './photos.js'

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

const LAST_ADMIN_MESSAGE =
  'You are the only admin, so you cannot delete your account yet. Make someone else an admin first — then this will work.'

/**
 * Removes the caller's own staff photo, if they have one, BEFORE the account
 * goes.
 *
 * ⚠️ THE ORDER IS FORCED AND IT IS THE OPPOSITE OF `deletePlayer`'s. Everywhere
 * else this codebase deletes the row first and the object second, so a failed
 * cleanup leaves a recoverable orphan rather than a live row pointing at a
 * missing file. Here that is not available: deleting the account destroys the
 * SESSION, and the storage policy authorises this delete by `auth.uid()` — so
 * after the RPC there is no longer any caller permitted to remove the file.
 * It is now or never.
 *
 * ⚠️ AND IT MUST NEVER BLOCK THE DELETION. Someone asking for their account to
 * be deleted does not get told "no" because a file did not delete; the RPC runs
 * regardless and a failure here leaves an orphan for the nightly scan to report.
 * The cost of the forced ordering is the reverse case — the photo is gone and
 * then the RPC refuses (last admin) — which loses a head shot the person can
 * simply upload again. That is the cheaper of the two failures by a distance.
 *
 * ⚠️ SQL CANNOT DO THIS. `storage.objects` refuses direct deletion
 * (`protect_delete`, 42501), so `delete_my_account` cannot clean up after
 * itself however much it would like to. See RESTORE.md.
 */
async function removeMyPhotoBeforeDeletion() {
  try {
    const { data } = await supabase.auth.getUser()
    const id = data?.user?.id
    if (!id) return

    const { data: profile } = await supabase
      .from('profiles')
      .select('photo_path')
      .eq('id', id)
      .maybeSingle()

    if (profile?.photo_path) await deleteStaffPhoto(profile.photo_path)
  } catch {
    // Swallowed on purpose — see the note above. An orphaned object is the
    // acceptable outcome; a blocked account deletion is not.
  }
}

export async function deleteMyAccount() {
  await removeMyPhotoBeforeDeletion()

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
