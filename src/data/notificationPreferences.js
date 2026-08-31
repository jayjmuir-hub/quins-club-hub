import { supabase } from '../lib/supabase'

// Which kinds of push notification a person wants.
// Table: db/migrations/20260819_notice_push.sql.
// Design: claude/plans/2026-08-19-notifications-v2.md.
//
// ⚠️ THE TABLE STORES OPT-**OUTS**. A row means OFF; no row means ON. Every
// function here therefore reads inside-out, and that is deliberate rather than
// awkward: it is what makes "categories default to on" true for everybody who
// exists today AND everybody who joins next season, with no backfill and no
// second place for the default to live.
//
// ⚠️ SO "enabled" IS ALWAYS DERIVED, NEVER STORED. If you ever find yourself
// writing an `enabled` column, the default has moved back into the database
// and somebody has to remember to backfill it for new members.
//
// ⚠️ THESE ARE NOT A SUBSTITUTE FOR THE BROWSER PERMISSION. Nothing here has
// any effect until push notifications are switched on for the device at all —
// see src/lib/push.js. A category is a filter on something already flowing.

/**
 * The categories a person can choose between, in the order they appear.
 *
 * ⚠️ THE KEYS MUST MATCH THE CHECK CONSTRAINT on notification_opt_outs, and a
 * mismatch fails SILENTLY in the worst way: the insert is rejected, the switch
 * appears to move, and the notifications keep arriving. Adding one here means
 * adding it to the constraint in the same commit.
 */
export const NOTIFICATION_CATEGORIES = [
  {
    key: 'notice',
    label: 'New notices',
    hint: 'When somebody posts a notice for your squad, or for the whole club.',
  },
  // ⚠️ STAFF POSTS ONLY, IN PHASE 1, and the hint says so. A family's reply
  // never pushes; @mentions are phase 2. db/migrations/20260823_squad_chat.sql.
  {
    key: 'squad_chat',
    label: 'Squad chat',
    hint: 'When a coach or manager posts in your squad’s chat, or somebody mentions you.',
  },
  // Phase 3. ON by default like the rest; a person who wants quiet turns it off.
  {
    key: 'direct_messages',
    label: 'Direct messages',
    hint: 'When somebody sends you a message.',
  },
  {
    key: 'fixture',
    label: 'Fixture changes',
    hint: 'When a fixture is added, moved or cancelled for your squad.',
  },
  {
    key: 'feedback_reply',
    label: 'Replies to your reports',
    hint: 'When somebody at the club answers something you reported.',
  },
  // ⚠️ ONLY EVER SHOWN TO PEOPLE IT CAN REACH. This one is listed for
  // everybody, but it only ever fires for super admins and a squad's head
  // coach or team manager — nobody else is in the audience
  // (db/migrations/20260819_approval_push.sql). A parent who switches it off
  // is switching off something they were never going to get.
  //
  // ⚠️ SWITCHING IT OFF DOES NOT STOP THE EMAIL, and the hint says so on
  // purpose. The email is unconditional and is the backstop for the whole
  // approval flow; somebody who turns this off to stop being interrupted must
  // not believe they have stopped being told.
  {
    key: 'approval',
    label: 'People waiting to be approved',
    hint: 'When somebody registers for a squad you look after. You will still get the email.',
  },
  // ⚠️ MATCHES ONLY, AND THE HINT SAYS SO because the alternative was measured
  // and rejected: nudging for every upcoming event would have been 338
  // notifications against 6 (19 Aug 2026). Somebody who reads "before a game"
  // and then gets nothing before training is seeing the feature work.
  //
  // ⚠️ THERE IS NO EMAIL BEHIND THIS ONE. Unlike `approval`, switching it off
  // means nothing else tells you — so the hint does not promise a backstop
  // that does not exist. db/migrations/20260819_availability_nudge.sql.
  {
    key: 'availability',
    label: 'Availability reminders',
    hint: 'A reminder before a game if you have not said whether your child is playing.',
  },
  // The documents repo. db/migrations/20260831_documents.sql restates the FULL
  // constraint list including this key — the pair is what
  // tests/notification-categories.test.js asserts.
  //
  // ⚠️ THE AUDIENCE IS NARROWER THAN THE SWITCH, like `approval`. A staff-only
  // document only ever reaches squad staff (public.document_push_subscriptions
  // filters on the membership role), so a parent turning this off is often
  // turning off something they were never in the audience for.
  {
    key: 'document',
    label: 'New documents',
    hint: 'When the club or your coaches share a document with your squad.',
  },
]

/**
 * The categories this person has switched OFF.
 *
 * ⚠️ NO `profile_id` FILTER, AND THAT IS NOT AN OVERSIGHT. `opt out is mine`
 * is `profile_id = auth.uid()`, so RLS already returns only your own rows. A
 * filter here would be a second, weaker statement of the same rule — and the
 * weaker one is the one somebody later "simplifies" away.
 */
export async function listMyOptOuts() {
  const { data, error } = await supabase.from('notification_opt_outs').select('category')
  if (error) throw error
  return (data ?? []).map((row) => row.category)
}

/**
 * Turns one category on or off for the signed-in person.
 *
 * `enabled: true` deletes the opt-out row; `enabled: false` inserts one.
 *
 * ⚠️ `upsert` WITH `ignoreDuplicates`, NOT `insert`. Turning something off
 * twice — two devices, a double tap, a stale screen — must not throw a
 * primary-key error at somebody who is getting the outcome they asked for.
 */
export async function setCategoryEnabled(profileId, category, enabled) {
  if (!profileId) throw new Error('setCategoryEnabled needs a profile id.')
  if (!NOTIFICATION_CATEGORIES.some((c) => c.key === category)) {
    throw new Error(`Unknown notification category: ${category}`)
  }

  if (enabled) {
    const { error } = await supabase
      .from('notification_opt_outs')
      .delete()
      .eq('profile_id', profileId)
      .eq('category', category)
    if (error) throw error
    return
  }

  const { error } = await supabase
    .from('notification_opt_outs')
    .upsert({ profile_id: profileId, category }, { onConflict: 'profile_id,category', ignoreDuplicates: true })
  if (error) throw error
}
