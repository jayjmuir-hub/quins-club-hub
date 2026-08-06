-- Applied to Supabase as migration `profiles_first_and_last_name`, 6 Aug 2026.
--
-- First name / family name, collected once at first sign-in.
--
-- full_name STAYS the stored canonical and is NOT converted to a generated
-- column: updateProfileName() writes to it directly and Admin, Accounts and
-- PlayerDetail read it. A GENERATED column would break that writer on its
-- first save. A trigger keeps the three columns in step instead.
alter table public.profiles
  add column first_name text,
  add column last_name  text;

comment on column public.profiles.first_name is
  'Given name, collected at first sign-in. full_name is kept in step by private.sync_profile_name().';
comment on column public.profiles.last_name is
  'Family name, collected at first sign-in. Sorting the accounts list keys on this.';

-- Bidirectional, so it does not matter which writer is used:
--   * a write to first/last  -> full_name is rebuilt from them (authoritative)
--   * a write to full_name   -> first/last are derived by splitting on the LAST space
--
-- The split is a CONVENIENCE and is knowingly imperfect: "Maria de la Cruz"
-- becomes first="Maria de la", last="Cruz". That is tolerable because full_name
-- remains exactly what the human typed and is what every screen displays; the
-- split fields only drive sorting. The name-entry screen writes first/last, so
-- anyone who fills that in gets the split they chose, not the guessed one.
create or replace function private.sync_profile_name()
returns trigger
language plpgsql
as $function$
declare
  fn text := nullif(btrim(new.first_name), '');
  ln text := nullif(btrim(new.last_name), '');
  full_in text := nullif(btrim(new.full_name), '');
  names_changed boolean;
  full_changed boolean;
begin
  if tg_op = 'INSERT' then
    names_changed := (fn is not null or ln is not null);
    full_changed  := (full_in is not null);
  else
    names_changed := (new.first_name is distinct from old.first_name)
                  or (new.last_name  is distinct from old.last_name);
    full_changed  := (new.full_name  is distinct from old.full_name);
  end if;

  -- first/last win when both changed in one statement: they are the explicit
  -- input, full_name is the derived display value.
  if names_changed and (fn is not null or ln is not null) then
    new.full_name := btrim(concat_ws(' ', fn, ln));
    new.first_name := fn;
    new.last_name  := ln;
  elsif full_changed and full_in is not null then
    new.full_name  := full_in;
    new.first_name := nullif(btrim(regexp_replace(full_in, '\s+\S+$', '')), '');
    new.last_name  := nullif(btrim(regexp_replace(full_in, '^.*\s', '')), '');
    -- a single-word name is a first name with no family name, not the reverse
    if new.first_name is null then
      new.first_name := full_in;
      new.last_name  := null;
    end if;
  end if;

  return new;
end;
$function$;

create trigger profiles_sync_name
  before insert or update on public.profiles
  for each row execute function private.sync_profile_name();

-- WARNING: the backfill originally written here was
--   update public.profiles set full_name = full_name ...
-- and it was a NO-OP. See 20260806_profiles_backfill_split_names.sql.
