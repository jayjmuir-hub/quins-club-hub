-- Per-chat wallpaper, synced across devices — Jay, 26 Aug 2026: "can we make
-- it do those things?" (per-conversation, and following the person between
-- devices), after the 25 Aug papers shipped device-level in localStorage.
--
-- One nullable column on chat_prefs, the table that already holds the other
-- per-person, per-chat preferences (pins, archive) under owner-only RLS —
-- so a wallpaper is invisible to the other side of the chat by construction,
-- and no new policies or grants are needed. NULL means "the default": the
-- client resolves it (src/lib/chatBackgrounds.js), so changing the default
-- preset never needs a migration.
--
-- The check bounds length only, not membership of the preset list — presets
-- are a client concern and have already been renamed once; the client maps
-- any unknown stored key to the default.
--
-- IDEMPOTENT: `add column if not exists`, same contract as the parent
-- migration (db/migrations/20260824_chat_prefs.sql), and inlined by the
-- harness db/tests/chat-prefs.sql.
begin;

alter table public.chat_prefs
  add column if not exists background text
    check (background is null or length(background) between 1 and 40);

commit;
