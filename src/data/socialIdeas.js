import { supabase } from '../lib/supabase'
import { preparePhotoUpload } from '../lib/imageResize.js'

// Social post ideas: any member submits, the Social Media Management screen
// marks and removes. Ruling: claude/decisions/2026-08-12-social-media-management.md.
//
// ⚠️ THIS IS NOT `player-photos` AND MUST NEVER BECOME IT. The roster photos
// were uploaded so a coach can recognise a child on a pitch; nobody agreed to
// publication. Everything in this bucket was chosen and uploaded by a member
// for this purpose, in the moment. A "pick a squad photo" button is a new
// conversation, not an enhancement.
//
// Object key convention, which the storage policies depend on:
//     <profile_id>/<timestamp>.<ext>
// The first path segment IS the submitter's profile id — that is how a storage
// policy, which sees only a filename, decides who may read or delete it.
// Never write a key in any other shape.

export const IDEA_BUCKET = 'social-ideas'

// Type/size judgments live in preparePhotoUpload (src/lib/imageResize.js),
// one gate for every photo path; its output fits the bucket's mime list.
const SIGNED_URL_TTL_SECONDS = 3600

// What the caller may send. ⚠️ `from_staff`, `club_id`, `submitted_by` and
// `status` are DELIBERATELY ABSENT: a BEFORE INSERT trigger stamps all four
// from the submitter's own membership. Adding any of them here would not make
// them settable — the trigger overwrites — but it would make this file look
// like they are, which is how the next person reintroduces the hole.
const SELECT = `
  id, club_id, event_id, submitted_by, body, photo_path, from_staff,
  status, decision_note, decided_by, decided_at, created_at,
  events(id, title, opponent, starts_at, type, team_id, teams(name)),
  profiles!social_ideas_submitted_by_fkey(full_name)
`

/**
 * Uploads a submitted image and returns its object key.
 *
 * ⚠️ THE KEY IS THE CALLER'S OWN PROFILE ID, and the storage policy enforces
 * it — a member may only write under their own prefix. Passing somebody else's
 * id here produces a refusal, not a mislabelled file.
 */
export async function uploadIdeaPhoto(profileId, file) {
  if (!profileId) throw new Error('uploadIdeaPhoto needs a profile id.')
  if (!file) throw new Error('Choose a photo to upload.')

  // Shared gate: type, keep-the-shape resize, THEN size
  // (src/lib/imageResize.js) — exactly as chat and profile photos do.
  const upload = await preparePhotoUpload(file)
  const extension = upload.type === 'image/png' ? 'png' : upload.type === 'image/webp' ? 'webp' : 'jpg'
  const key = `${profileId}/${Date.now()}.${extension}`

  const { error } = await supabase.storage
    .from(IDEA_BUCKET)
    .upload(key, upload, { contentType: upload.type, upsert: false })

  if (error) throw error
  return key
}

/** Signs one object key into a temporary viewable URL, or null. */
export async function signIdeaPhoto(path) {
  if (!path) return null
  const { data, error } = await supabase.storage
    .from(IDEA_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS)
  if (error) return null
  return data?.signedUrl ?? null
}

/**
 * Submits an idea.
 *
 * ⚠️ THE PHOTO IS UPLOADED FIRST AND THE ROW SECOND, which is the opposite
 * order from deletion and correct for the same reason: the failure that
 * matters is the one that leaves something invisible. An upload with no row is
 * an orphaned file — recoverable, and nothing claims it exists. A row with no
 * upload is an idea whose picture silently never arrived, which the manager
 * cannot tell from an idea sent without one.
 */
export async function submitIdea({ profileId, body, eventId = null, file = null }) {
  const text = (body ?? '').trim()
  if (!text) throw new Error('Say something about the idea before sending it.')

  const photoPath = file ? await uploadIdeaPhoto(profileId, file) : null

  const { data, error } = await supabase
    .from('social_ideas')
    .insert({ body: text, event_id: eventId || null, photo_path: photoPath })
    .select(SELECT)
    .single()

  if (error) throw error
  return data
}

/**
 * Every idea the caller may see.
 *
 * ⚠️ RLS decides the rows, not this function: an admin gets the club's, a
 * member gets their own. That is why there is no "am I an admin" branch here —
 * a client-side branch would be a second, weaker copy of the policy.
 */
export async function listIdeas({ status = null } = {}) {
  let query = supabase
    .from('social_ideas')
    .select(SELECT)
    .order('created_at', { ascending: false })

  if (status) query = query.eq('status', status)

  const { data, error } = await query
  if (error) throw error
  return data ?? []
}

/**
 * Marks an idea used or dismissed.
 *
 * ⚠️ ZERO ROWS IS A REFUSAL, NOT A SUCCESS. RLS filters an UPDATE rather than
 * failing it, so a non-admin gets a cheerful 200 and no change. This is the
 * same trap `withdrawRequest` in src/data/pitchRequests.js documents, and the
 * check is the only thing standing between a silent no-op and a screen that
 * says "done".
 */
export async function markIdea(id, status, decisionNote = null) {
  if (!['used', 'dismissed'].includes(status)) {
    throw new Error(`markIdea got an unknown status: ${status}`)
  }

  const { data: user } = await supabase.auth.getUser()

  const { data, error } = await supabase
    .from('social_ideas')
    .update({
      status,
      decision_note: decisionNote?.trim() || null,
      decided_by: user?.user?.id ?? null,
      decided_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select('id, status')

  if (error) throw error
  if (!data || data.length === 0) {
    throw new Error('That idea could not be updated. You may not have permission.')
  }
  return data[0]
}

/**
 * Removes an idea and its image.
 *
 * ⚠️ THE OBJECT GOES FIRST AND THE ROW SECOND. Storage cannot be cleared by
 * SQL (`delete from storage.objects` raises 42501), so these are two separate
 * operations and the order decides which way a partial failure fails:
 *
 *   object gone, row left  -> a visible broken entry, and this can be retried
 *   row gone, object left  -> an orphaned image nobody can find or reach
 *
 * The second is strictly worse, and worse in exactly the case this exists for:
 * a manager removing a photograph that should not have been sent. So a storage
 * failure ABORTS and the idea stays on screen, which is honest.
 *
 * ⚠️ Zero rows is a refusal here too, for the same reason as markIdea.
 */
export async function removeIdea(idea) {
  if (!idea?.id) throw new Error('removeIdea needs an idea.')

  if (idea.photo_path) {
    const { error } = await supabase.storage.from(IDEA_BUCKET).remove([idea.photo_path])
    if (error) {
      throw new Error(
        'The photo could not be removed, so nothing was deleted. Try again.',
      )
    }
  }

  const { data, error } = await supabase
    .from('social_ideas')
    .delete()
    .eq('id', idea.id)
    .select('id')

  if (error) throw error
  if (!data || data.length === 0) {
    throw new Error('That idea could not be removed. You may not have permission.')
  }
  return true
}
