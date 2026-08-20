-- 20 Aug 2026 — public.profiles.email_confirmed_at
--
-- WHY. The "Waiting for access" list on /admin/accounts shows an address and a
-- signup date and nothing else, so every card looks the same. Two quite
-- different people land in it:
--
--   * somebody who created a login and never opened the confirmation email —
--     they cannot sign in at all, and granting them access achieves nothing;
--   * somebody who confirmed, signed in, and is genuinely waiting for an admin.
--
-- Measured on production the day this was written: of five accounts with no
-- active membership, one had never confirmed and had never signed in. An admin
-- had no way to tell it apart from the other four.
--
-- ══ ⚠️ WHY A COLUMN AND NOT A READ OF auth.users ═════════════════════════
--
-- `email_confirmed_at` lives in `auth.users`, which PostgREST does not expose.
-- Every existing function that touches that table is scoped to the CALLER
-- (`where id = auth.uid()`), so there is no route by which an admin can read
-- somebody else's confirmation state. `public.profiles.email` is already
-- mirrored out of `auth.users` by exactly this mechanism — see
-- private.handle_new_user and private.handle_user_email_change — so this
-- follows the pattern the schema already uses rather than inventing a second.
--
-- ══ ⚠️ THE TRAP THIS MIGRATION EXISTS TO AVOID ═══════════════════════════
--
-- The obvious implementation — add the column and let the EXISTING email sync
-- carry it — is silently broken. `on_auth_user_email_updated` is declared
-- `AFTER UPDATE OF email ... WHEN (old.email IS DISTINCT FROM new.email)`, and
-- confirming an address does NOT change the address; it sets
-- `email_confirmed_at` and leaves `email` alone. That trigger would never fire,
-- the column would sit null forever, and the UI would confidently report every
-- member as unconfirmed. Hence a trigger of its own, keyed on the column that
-- actually moves.
--
-- ══ PRIVACY ══════════════════════════════════════════════════════════════
--
-- No new grant is needed and none is given: `authenticated` holds table-level
-- SELECT on public.profiles, `anon` holds nothing, and the existing RLS
-- policies decide which ROWS are visible. This column is therefore readable
-- exactly where the row already was — your own profile, and, for an admin, the
-- club's members and the people waiting. Measured before writing this.

begin;

-- ── 1. The column ────────────────────────────────────────────────────────
alter table public.profiles
  add column if not exists email_confirmed_at timestamptz;

comment on column public.profiles.email_confirmed_at is
  'Mirror of auth.users.email_confirmed_at, kept in step by '
  'on_auth_user_created and on_auth_user_email_confirmed. Null means the '
  'person has never opened the confirmation email, and therefore cannot sign '
  'in. Read by the Waiting for access list on /admin/accounts.';

-- ── 2. Backfill ──────────────────────────────────────────────────────────
-- ⚠️ `is distinct from` rather than `<>`: both sides are nullable, and `<>`
-- against a null is null, which would skip every row that needs it most.
update public.profiles p
   set email_confirmed_at = u.email_confirmed_at
  from auth.users u
 where u.id = p.id
   and p.email_confirmed_at is distinct from u.email_confirmed_at;

-- ── 3. Carry it on signup ────────────────────────────────────────────────
-- Unchanged from the shipped version except for the one column. Restated in
-- full because `create or replace` takes a whole body, and a migration that
-- shows only its own edit leaves the next reader diffing against the database.
create or replace function private.handle_new_user()
  returns trigger
  language plpgsql
  security definer
  set search_path to 'public'
as $function$
begin
  insert into public.profiles (id, full_name, email, email_confirmed_at)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name',''),
    new.email,
    new.email_confirmed_at
  )
  on conflict (id) do update
    set email = excluded.email,
        email_confirmed_at = excluded.email_confirmed_at;
  return new;
end;
$function$;

revoke all on function private.handle_new_user() from public;

-- ── 4. Keep it in step ───────────────────────────────────────────────────
-- ⚠️ REVOKED, unlike private.handle_user_email_change(), whose missing revoke
-- is recorded as a known asymmetry in db/schema/functions.sql. The new function
-- copies the safer of the two neighbours rather than the older one.
create or replace function private.handle_user_email_confirmed()
  returns trigger
  language plpgsql
  security definer
  set search_path to 'public'
as $function$
begin
  update public.profiles
     set email_confirmed_at = new.email_confirmed_at
   where id = new.id;
  return new;
end;
$function$;

revoke all on function private.handle_user_email_confirmed() from public;

drop trigger if exists on_auth_user_email_confirmed on auth.users;

create trigger on_auth_user_email_confirmed
  after update of email_confirmed_at on auth.users
  for each row
  when (old.email_confirmed_at is distinct from new.email_confirmed_at)
  execute function private.handle_user_email_confirmed();

commit;
