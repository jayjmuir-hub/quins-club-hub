-- 26 Aug 2026 — "Last active" for admins (option B of
-- claude/plans/2026-08-26-last-active-and-presence-dots.md).
-- Day-level, self-stamped, throttled server-side. The deliberate,
-- admin-facing exception to chat's no-stored-presence ruling: coarse enough
-- not to be surveillance, enough to answer "is this account alive?".
-- Chosen over surfacing auth.users.last_sign_in_at because the PWA keeps
-- people signed in for weeks — that timestamp reads a daily user as three
-- weeks idle.

begin;

alter table public.profiles add column if not exists last_seen_at timestamptz;

-- The column allow-list pattern (see photo_path): selectable, never
-- directly writable — the RPC below is the only write path.
grant select (last_seen_at) on public.profiles to authenticated;

-- No arguments ON PURPOSE: it structurally cannot stamp anyone else's row.
-- The 12-hour floor keeps this to roughly one write per person per day
-- whatever the client does.
create or replace function public.touch_last_seen()
returns void
language sql security definer
set search_path to 'public'
as $$
  update profiles
     set last_seen_at = now()
   where id = auth.uid()
     and (last_seen_at is null or last_seen_at < now() - interval '12 hours');
$$;

revoke all on function public.touch_last_seen() from public;
revoke all on function public.touch_last_seen() from anon;
grant execute on function public.touch_last_seen() to authenticated;

-- Backfill from the auth event — a true "active at least then" floor
-- (measured 26 Aug 2026: 82 of 86 logins carry one), so the admin screen is
-- useful on day one. Idempotent: only fills NULLs.
update public.profiles p
   set last_seen_at = u.last_sign_in_at
  from auth.users u
 where u.id = p.id
   and p.last_seen_at is null
   and u.last_sign_in_at is not null;

commit;
