-- ══════════════════════════════════════════════════════════════════════════
--  The author is not part of their own notice's audience
--  14 Aug 2026
-- ══════════════════════════════════════════════════════════════════════════
--
-- Jay, 14 Aug 2026, after seeing the two readings side by side: "make the
-- author change".
--
-- ══ ⚠️ WHAT WAS WRONG, AND WHY IT ONLY SHOWED UP FOR SOME PEOPLE ═══════════
--
-- `announcement_stats` and `announcement_audience` define a notice's audience
-- as every ACTIVE membership on the squad (or in the club, for a club-wide
-- notice). A COACH holds such a membership on the squad they coach — so a coach
-- posting to their own squad was counted in their own audience. The client also
-- marks a notice read the moment it is drawn, including for the person who just
-- wrote it, so the receipts read **"1 of 25 seen"** the instant they pressed
-- Post. The 1 was them; the 25 counted them.
--
-- ⚠️ IT WAS INVISIBLE IN THE FIRST REAL TEST, AND THAT IS THE INTERESTING PART.
-- The 14 Aug test notice was posted by a CLUB-WIDE ADMIN (`team_id is null` on
-- their membership) to a squad they are not attached to, so they were already
-- outside that squad's audience and it read a correct "1 of 8". **Whether the
-- author was counted depended on an accident of their membership shape** — the
-- same screen meant different things for a coach and for an admin, and nothing
-- on it said so.
--
-- ══ ⚠️ BOTH FUNCTIONS, OR THE SCREEN CONTRADICTS ITSELF ════════════════════
--
-- `announcement_stats` produces "18 of 24" and `announcement_audience` produces
-- the list of names underneath it. Excluding the author from one and not the
-- other gives a count that does not match the list it sits above, which is
-- worse than the bug being fixed. The exclusion is applied to the audience
-- membership scan in BOTH, and to the seen-count's membership check as well.
--
-- ⚠️ THE SEEN COUNT NEEDS IT TOO, NOT JUST THE DENOMINATOR. The author's own
-- read row is real and stays in `announcement_reads` — nothing deletes it. It
-- is the JOIN back to the audience that must exclude them, or the numerator
-- keeps counting a read by somebody the denominator no longer contains, and a
-- notice could report "1 of 0 seen".
--
-- ══ CONSEQUENCE JAY ACCEPTED ══════════════════════════════════════════════
--
-- ⚠️ A squad whose ONLY active member is the coach now has an audience of ZERO,
-- and `seenSummary` in src/lib/notices.js returns null for that — so the
-- counter disappears rather than reading "0 of 0 seen". That was already the
-- documented behaviour for an empty squad; this makes it reachable in one more
-- case. It is the honest rendering: there is nobody to have read it.
--
-- ⚠️ NOT A SCHEMA CHANGE. Two `create or replace function` statements, no table
-- touched, no policy touched, no grant touched. Safe in either order relative to
-- a deploy — an old bundle calling these gets the corrected numbers, which is
-- the outcome we want anyway.
--
-- ⚠️ apply_migration STRIPS `--` COMMENTS BEFORE EXECUTING, so none of this
-- reasoning reaches the database. This file is the only copy.

create or replace function public.announcement_stats()
returns table (
  announcement_id uuid,
  audience_count integer,
  seen_count integer
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select
    a.id,
    (select count(distinct m.profile_id)::integer
       from memberships m
      where m.status = 'active'
        and m.club_id = a.club_id
        and (a.team_id is null or m.team_id = a.team_id)
        -- The author is not somebody they were talking to.
        and m.profile_id <> a.author_id),
    (select count(distinct r.profile_id)::integer
       from announcement_reads r
      where r.announcement_id = a.id
        and r.profile_id <> a.author_id
        and exists (
          select 1 from memberships m
           where m.profile_id = r.profile_id
             and m.status = 'active'
             and m.club_id = a.club_id
             and (a.team_id is null or m.team_id = a.team_id)
        ))
  from announcements a
  where a.author_id = auth.uid()
     or private.is_admin(a.club_id);
$function$;

create or replace function public.announcement_audience(_announcement uuid)
returns table (
  profile_id uuid,
  full_name text,
  read_at timestamptz
)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select s.profile_id, s.full_name, s.read_at
  from (
    select distinct on (m.profile_id)
           m.profile_id,
           p.full_name,
           r.read_at
      from announcements a
      join memberships m
        on m.club_id = a.club_id
       and m.status = 'active'
       and (a.team_id is null or m.team_id = a.team_id)
       -- Same exclusion as announcement_stats. Change one, change both, or the
       -- count stops matching the list printed underneath it.
       and m.profile_id <> a.author_id
      join profiles p on p.id = m.profile_id
      left join announcement_reads r
        on r.announcement_id = a.id
       and r.profile_id = m.profile_id
     where a.id = _announcement
       and (a.author_id = auth.uid() or private.is_admin(a.club_id))
     order by m.profile_id, r.read_at nulls last
  ) s
  order by (s.read_at is not null), s.full_name;
$function$;

-- ⚠️ THE GRANTS ARE RE-STATED BECAUSE `create or replace` KEEPS THEM AND THIS
-- LINE IS THEREFORE A NO-OP — deliberately. If either function is ever DROPPED
-- and recreated instead of replaced, the grants go with the drop, and `anon`
-- gets execute back from Supabase's default privileges. Keeping these here means
-- the safe state is written down at the point of change rather than inferred
-- from a migration three files away. See 20260813_my_squad_staff.sql for why
-- `from anon` explicitly is load-bearing and `from public` alone is not.
revoke execute on function public.announcement_stats() from public;
revoke execute on function public.announcement_stats() from anon;
grant execute on function public.announcement_stats() to authenticated;

revoke execute on function public.announcement_audience(uuid) from public;
revoke execute on function public.announcement_audience(uuid) from anon;
grant execute on function public.announcement_audience(uuid) to authenticated;
