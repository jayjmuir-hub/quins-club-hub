// The six ROLE CHANNELS (five until 3 Sep 2026) — club-wide chats whose membership is derived from
// roles, never stored (claude/plans/2026-08-30-role-channels.md, migration
// db/migrations/20260830_role_channels.sql).
//
// ⚠️ THE KEYS ARE THE DATABASE'S `messages.channel` VALUES, VERBATIM, and they
// ride the same route param the club channel does (/chat/headcoaches, like
// /chat/club) — a key can therefore never collide with a team id, which is a
// uuid. This file only names and labels them; who is IN one is decided by
// private.in_role_channel in the database, and nothing client-side may answer
// that question (the my_chats list already only carries the channels the
// caller belongs to).

export const ROLE_CHANNELS = {
  headcoaches: { label: 'Club Head Coaches', glyph: '🎯' },
  // 'Club Managers' for its first hours; Jay renamed it the same day — the
  // people in it are the AGE GROUP managers, and the club's own vocabulary wins.
  managers: { label: 'Club Age Group Managers', glyph: '📋' },
  medics: { label: 'Club Medics', glyph: '⚕️' },
  welfare: { label: 'Welfare', glyph: '🛟' },
  clubstaff: { label: 'Club Staff', glyph: '🏉' },
  // The sixth (3 Sep 2026, claude/plans/2026-09-03-channel-seats-and-committee.md):
  // derived from club_officers — hold a title and you are in. Titles only:
  // a super without one is not in it.
  committee: { label: 'Committee', glyph: '🏛️' },
}

export const ROLE_CHANNEL_KEYS = Object.keys(ROLE_CHANNELS)

export const isRoleChannel = (key) => Boolean(key && ROLE_CHANNELS[key])

export const roleChannelLabel = (key) => ROLE_CHANNELS[key]?.label ?? key
