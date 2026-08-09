-- =====================================================================
-- db/schema/tables.sql
-- CAPTURE of the live `public` schema tables in Supabase project
-- lusmshimxdcxpnrktlgz (quins-club-hub), taken 2026-08-03 and re-captured
-- 2026-08-04 after db/migrations/20260803_player_parents_and_photos.sql
-- (public.player_parents, public.players.photo_path) and
-- db/migrations/20260804_access_requests.sql (public.access_requests).
--
-- This is a CAPTURE, not a migration. Do not run this file. See README.md
-- in this directory.
--
-- Sources: information_schema.columns, pg_constraint + pg_get_constraintdef,
--          pg_indexes, pg_class.relrowsecurity, obj_description.
--
-- RE-CAPTURED 2026-08-07 after the 5-7 Aug migrations. ⚠️ This file had gone
-- three days and ~14 migrations without a re-capture, which is exactly the
-- lapse the 4 Aug note below warns about. Deltas applied: teams.is_senior,
-- profiles.first_name / last_name / name_confirmed_at, players.gender (+CHECK),
-- events.series_id / pitch / group_id (+partial index), and the memberships
-- unique index that reverses this file's own "DELIBERATE ABSENCE" note.
--
-- RE-CAPTURED 2026-08-09. Covers the fifteen migrations applied since the
-- 7 Aug capture, in version order:
--   20260807153404 sync_profile_name_pin_search_path   (function only)
--   20260808084615 sync_profile_name_single_word       (function only)
--   20260808151251 event_end_time_and_notes            → TABLES
--   20260808154115 calendar_feed_end_time_and_notes    (edge function only)
--   20260808160943 membership_pending_status           → TABLES
--   20260808161025 is_attached_to_team_grants          (grants only)
--   20260808161245 register_my_player                  (function only)
--   20260808164111 teams_readable_before_registration  (policy only)
--   20260808191310 profile_phone_and_column_grants     → TABLES
--   20260809080107 age_groups_rename                   (DATA only, no DDL)
--   20260809083535 register_my_player_gender           (function only)
--   20260809083640 register_my_player_gender_errcode   (function only)
--   20260809092039 squad_staff_approval                (functions + policies)
--   20260809093858 notify_pending_membership           → TRIGGERS (see
--                                                       triggers.sql)
-- Table-level deltas applied here: events.ends_at, events.notes and the
-- events_ends_after_starts CHECK; memberships.status and its CHECK;
-- profiles.phone.
--
-- ⚠️⚠️ TWO ITEMS BELOW ARE **NOT** EXPLAINED BY ANY OF THE ABOVE. Both are
-- things the 7 Aug re-capture MISSED, not things that drifted since — both
-- were created on 5 Aug and this file simply never recorded them:
--   1. index events_group_id_idx  (migration 20260805150621
--      events_pitch_and_group_id — see the events block)
--   2. invites_role_check already contains 'manager' and 'medic' (migration
--      20260805160320 roles_manager_and_medic widened BOTH role CHECKs; the
--      7 Aug capture corrected memberships_role_check and left this file
--      asserting four roles for invites — see the invites block)
-- Neither is a live drift, and neither is dangerous, but the 7 Aug note in
-- README.md that says "nothing unintended was found" was reached by reading a
-- delta that was already too big to read. Two objects were missed inside it.
--
-- Still thirteen tables — no table was added, dropped or renamed since the
-- 7 Aug capture. All thirteen have RLS ENABLED (relrowsecurity = true) and
-- none have FORCE ROW LEVEL SECURITY (relforcerowsecurity = false, i.e. the
-- table owner still bypasses RLS). Policies live in policies.sql.
-- =====================================================================


-- ---------------------------------------------------------------------
-- clubs
-- One row: Abu Dhabi Harlequins, id 00000000-0000-0000-0000-0000000000ad
-- ---------------------------------------------------------------------
CREATE TABLE public.clubs (
  id          uuid        NOT NULL DEFAULT gen_random_uuid(),
  name        text        NOT NULL,
  created_at  timestamptz          DEFAULT now(),
  CONSTRAINT clubs_pkey PRIMARY KEY (id)
);
ALTER TABLE public.clubs ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------
-- teams  (the club's squads)
--
-- ⚠️ This heading read "the 15 age groups" until the 9 Aug re-capture. That
-- was a ROW COUNT in a schema file and it rotted: migration 20260809080107
-- (age_groups_rename) renamed most squads and inserted four more. The count
-- is deliberately not restated here — counts and squad names are data, they
-- change without a migration touching this file, and the authoritative list
-- is claude/decisions/2026-08-09-single-gender-squads.md.
--
-- ⚠️ age_groups_rename is UPDATE/INSERT only. It changed no column, type,
-- default, constraint or index on this table. The table itself was NOT
-- renamed. Nothing below changed on 9 Aug.
--
-- NOTE: no unique constraint on (club_id, name). Two teams with the same
-- name inside one club are possible. Nothing in the app currently creates
-- teams, so this has not bitten, but it is not enforced by the database.
-- ---------------------------------------------------------------------
CREATE TABLE public.teams (
  id          uuid    NOT NULL DEFAULT gen_random_uuid(),
  club_id     uuid    NOT NULL,
  name        text    NOT NULL,
  sort_order  integer          DEFAULT 0,
  -- Added 2026-08-06 (teams_is_senior). NOT NULL DEFAULT false, so every
  -- existing squad became a youth squad and the senior sides were flipped
  -- explicitly. ⚠️ Load-bearing for onboarding: claim_roster_access() reads
  -- this, NEVER teams.name, to decide whether a roster match makes someone a
  -- 'player' or a 'parent'. Renaming a squad must not be able to hand an adult
  -- a parent role.
  is_senior   boolean NOT NULL DEFAULT false,
  CONSTRAINT teams_pkey    PRIMARY KEY (id),
  CONSTRAINT teams_club_id_fkey FOREIGN KEY (club_id) REFERENCES clubs(id) ON DELETE CASCADE
);
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------
-- profiles  (1:1 with auth.users; populated by the on_auth_user_created
--            trigger — see triggers.sql)
--
-- NOTE: `email` has NO unique constraint and no NOT NULL. It is a mirror
-- of auth.users.email kept in sync by two triggers, not a source of truth.
-- ---------------------------------------------------------------------
CREATE TABLE public.profiles (
  id          uuid        NOT NULL,
  full_name   text,
  created_at  timestamptz          DEFAULT now(),
  email       text,
  -- Added 2026-08-06 (profiles_first_and_last_name + backfill). full_name is
  -- KEPT as the display value and stays in sync with these two via the
  -- profiles_sync_name trigger — see triggers.sql. Write either side; the
  -- trigger reconciles. first/last win when both change in one statement.
  first_name        text,
  last_name         text,
  -- Added 2026-08-06 (profiles_name_confirmed_at). NULL means the person has
  -- not yet confirmed their own name, and the app shows a hard gate before
  -- letting them in. ⚠️ The migration deliberately stamped all four existing
  -- profiles as confirmed, so to see the gate you must NULL it by hand.
  name_confirmed_at timestamptz,
  -- Added 2026-08-08 (profile_phone_and_column_grants). Column comment as
  -- stored: "The signed-in person's own number, stored E.164. Distinct from
  -- player_contacts.phone, which is a CHILD's contact details and is
  -- per-player."
  --
  -- ⚠️ THE COLUMN IS THE SMALL HALF OF THAT MIGRATION. The rest is a
  -- privilege change that does not show up anywhere in this file: UPDATE on
  -- public.profiles was REVOKED from `authenticated` and re-granted as a
  -- column list — (full_name, first_name, last_name, name_confirmed_at,
  -- phone). RLS grants ROWS, NOT COLUMNS, so the "profile update own" policy
  -- let a person rewrite ANY column on their own row, `email` included; the
  -- migration records that being proved live on 8 Aug 2026, with
  -- profiles.email set to another address while auth.users.email stayed
  -- correct. An admin approving a stranger reads profiles.email as that
  -- person's login address. It is an allow-list rather than a revoke of
  -- `email` so that a column added later is not writable by default.
  -- Grants are not captured in this directory at all — if you audit this
  -- table, check pg_attribute ACLs, not just the policies.
  phone             text,
  CONSTRAINT profiles_pkey   PRIMARY KEY (id),
  CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------
-- players
--
-- NOTE: no unique constraint on (team_id, jersey_num) or on
-- (club_id, full_name). Two players in one squad can share a shirt number
-- and a name.
-- ---------------------------------------------------------------------
CREATE TABLE public.players (
  id          uuid        NOT NULL DEFAULT gen_random_uuid(),
  club_id     uuid        NOT NULL,
  team_id     uuid        NOT NULL,
  full_name   text        NOT NULL,
  jersey_num  integer,
  position    text,
  is_captain  boolean              DEFAULT false,
  created_at  timestamptz          DEFAULT now(),
  -- Object key inside the PRIVATE `player-photos` storage bucket, e.g.
  -- "<player_id>/1754236800000.jpg". NOT a URL — the bucket is private, so
  -- a stored URL would be a signed one with an expiry baked in. The app
  -- signs a fresh short-lived URL from this path on read. The leading
  -- "<player_id>/" segment is load-bearing: the storage policies parse it.
  photo_path  text,
  -- Added 2026-08-07 (player_gender). Nullable on purpose: "not recorded" is a
  -- real state and is not the same as either value.
  gender      text,
  CONSTRAINT players_pkey         PRIMARY KEY (id),
  CONSTRAINT players_club_id_fkey FOREIGN KEY (club_id) REFERENCES clubs(id) ON DELETE CASCADE,
  CONSTRAINT players_team_id_fkey FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
  CONSTRAINT players_gender_check CHECK (((gender IS NULL) OR (gender = ANY (ARRAY['male'::text, 'female'::text]))))
);
ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------
-- player_contacts  (safeguarding-sensitive; PK is the player_id itself,
--                   so it is naturally 1:1 with players)
-- ---------------------------------------------------------------------
CREATE TABLE public.player_contacts (
  player_id  uuid NOT NULL,
  phone      text,
  email      text,
  CONSTRAINT player_contacts_pkey           PRIMARY KEY (player_id),
  CONSTRAINT player_contacts_player_id_fkey FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
);
ALTER TABLE public.player_contacts ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------
-- player_parents  (N parent/carer rows per player — added 2026-08-03,
--                  safeguarding-sensitive, same class as player_contacts)
--
-- Deliberately a table and not mother_*/father_* columns: the club has
-- single parents, step-parents, guardians and same-sex parents, and a
-- grandmother typed into a column called "father" is data that lies.
--
-- NO "at least one parent" constraint, deliberately (Jay's ruling: warn,
-- never block). ~159 existing players have no parent rows; a NOT NULL-
-- style rule would make every one of them unsaveable and break the bulk
-- importer. The warning lives in the UI.
--
-- `relationship` is free text at the database level. The UI restricts it
-- to a FIXED list (Mother, Father, Step-mother, Step-father, Aunt, Uncle,
-- Grandmother, Grandfather, Guardian) — Jay's ruling, no free entry, no
-- additions. Kept as text rather than an enum so widening the list is a
-- UI change, not a migration.
-- ---------------------------------------------------------------------
CREATE TABLE public.player_parents (
  id            uuid        NOT NULL DEFAULT gen_random_uuid(),
  player_id     uuid        NOT NULL,
  full_name     text        NOT NULL,
  relationship  text,
  email         text,
  phone         text,
  is_primary    boolean              DEFAULT false,
  sort_order    integer              DEFAULT 0,
  created_at    timestamptz          DEFAULT now(),
  CONSTRAINT player_parents_pkey           PRIMARY KEY (id),
  CONSTRAINT player_parents_player_id_fkey FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE,
  CONSTRAINT player_parents_name_not_blank CHECK ((btrim(full_name) <> ''::text))
);
ALTER TABLE public.player_parents ENABLE ROW LEVEL SECURITY;

CREATE INDEX player_parents_player_id_idx ON public.player_parents USING btree (player_id);


-- ---------------------------------------------------------------------
-- access_requests  (the approval gate in front of open signup - 4 Aug 2026)
--
-- ONE row per profile. The UNIQUE key is the anti-spam mechanism, not
-- housekeeping: combined with the deliberate ABSENCE of an owner-side UPDATE
-- or DELETE policy (see policies.sql), a dismissed person cannot flip their
-- own row back to 'pending', delete it and try again, or insert a second one.
--
-- No 'granted' status, on purpose. Granted access IS a memberships row, and
-- the Accounts screen already subtracts members out of the waiting list. A
-- second record of the same fact would only give the two a way to disagree.
--
-- decided_by is ON DELETE SET NULL, not CASCADE: deleting the admin who
-- dismissed a request must not delete the dismissal and quietly resurrect the
-- request.
-- ---------------------------------------------------------------------
CREATE TABLE public.access_requests (
  id          uuid        NOT NULL DEFAULT gen_random_uuid(),
  profile_id  uuid        NOT NULL,
  note        text,
  status      text        NOT NULL DEFAULT 'pending'::text,
  created_at  timestamptz          DEFAULT now(),
  decided_at  timestamptz,
  decided_by  uuid,
  CONSTRAINT access_requests_pkey            PRIMARY KEY (id),
  CONSTRAINT access_requests_profile_id_key  UNIQUE (profile_id),
  CONSTRAINT access_requests_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE,
  CONSTRAINT access_requests_decided_by_fkey FOREIGN KEY (decided_by) REFERENCES profiles(id) ON DELETE SET NULL,
  CONSTRAINT access_requests_status_check    CHECK ((status = ANY (ARRAY['pending'::text, 'dismissed'::text])))
);
ALTER TABLE public.access_requests ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------
-- calendar_tokens  (subscription feed credentials - 4 Aug 2026)
--
-- Each row IS a bearer credential: whoever holds the token can read that
-- person's fixtures with no login, because a calendar client cannot sign in.
-- Hence a random uuid rather than the profile id (a feed keyed on something
-- enumerable would be no protection), one row per person, and a reset path
-- that DELETEs and re-inserts so the old token dies the moment the new one
-- exists.
-- ---------------------------------------------------------------------
CREATE TABLE public.calendar_tokens (
  profile_id  uuid        NOT NULL,
  token       uuid        NOT NULL DEFAULT gen_random_uuid(),
  created_at  timestamptz          DEFAULT now(),
  CONSTRAINT calendar_tokens_pkey            PRIMARY KEY (profile_id),
  CONSTRAINT calendar_tokens_token_key       UNIQUE (token),
  CONSTRAINT calendar_tokens_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
);
ALTER TABLE public.calendar_tokens ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------
-- memberships  (role links: admin / coach / parent / player)
--
-- !! NO LONGER ABSENT — a unique index was added 2026-08-06 !!
-- ⚠️ This block said "DELIBERATE ABSENCE OF A UNIQUE CONSTRAINT" until the
-- 7 Aug re-capture. `memberships_unique_grant` now exists:
--
--   CREATE UNIQUE INDEX memberships_unique_grant ON public.memberships
--     USING btree (profile_id, club_id, role, team_id, player_id)
--     NULLS NOT DISTINCT
--
-- NULLS NOT DISTINCT is the load-bearing part: without it two admin rows
-- (team_id NULL, player_id NULL) would still both be allowed, because in
-- standard SQL every NULL differs from every other NULL. It is what makes
-- claim_roster_access()'s `on conflict do nothing` actually able to conflict.
--
-- The original warning, kept because the reasoning still applies to any
-- FUTURE constraint: duplicate membership rows for one person were possible
-- and DID occur (one was created by an `ON CONFLICT DO NOTHING` that could
-- not conflict on anything). The live data was de-duplicated before the index
-- could be created.
-- Application code guards against this: the Accounts screen groups by
-- profile_id rather than rendering one row per membership, and
-- accept_invite() uses SELECT DISTINCT when fanning out invite_targets.
-- Do not add a unique constraint here without first de-duplicating live
-- data and checking the multi-team access model still works — a coach
-- legitimately holds several rows differing only by team_id.
--
-- Admin memberships have team_id = NULL (admin is club-wide).
-- ---------------------------------------------------------------------
CREATE TABLE public.memberships (
  id          uuid        NOT NULL DEFAULT gen_random_uuid(),
  profile_id  uuid        NOT NULL,
  club_id     uuid        NOT NULL,
  team_id     uuid,
  role        text        NOT NULL,
  player_id   uuid,
  created_at  timestamptz          DEFAULT now(),
  -- Added 2026-08-08 (membership_pending_status). Column comment as stored:
  -- "active = full squad visibility. pending = self-registered, awaiting a
  -- coach or admin. A pending row still attaches the person to the squad
  -- (fixtures, their own child) but does NOT satisfy private.can_see_team."
  --
  -- ⚠️ NOT NULL DEFAULT 'active' is load-bearing for the migration itself,
  -- not tidiness. The same migration changed private.can_see_team to require
  -- status = 'active'; had any existing row come out NULL or 'pending', every
  -- current user would have lost access in the same transaction. The
  -- migration carries a DO block that ABORTS if it finds a non-active row
  -- before the function is replaced.
  --
  -- Why the state exists at all: can_see_team is squad-WIDE and role-blind,
  -- so granting access at registration would let anyone who signs up and
  -- picks an age group read every child's name, date of birth, photo and
  -- parent phone number in it. Reasoning in
  -- claude/decisions/2026-08-08-parent-self-registration.md. Do not
  -- "simplify" this by granting access at registration.
  status      text        NOT NULL DEFAULT 'active'::text,
  CONSTRAINT memberships_pkey            PRIMARY KEY (id),
  CONSTRAINT memberships_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE,
  CONSTRAINT memberships_club_id_fkey    FOREIGN KEY (club_id)    REFERENCES clubs(id)    ON DELETE CASCADE,
  CONSTRAINT memberships_team_id_fkey    FOREIGN KEY (team_id)    REFERENCES teams(id)    ON DELETE CASCADE,
  CONSTRAINT memberships_player_id_fkey  FOREIGN KEY (player_id)  REFERENCES players(id)  ON DELETE SET NULL,
  -- ⚠️ 'manager' and 'medic' added 2026-08-05 (roles_manager_and_medic). This
  -- file listed only four roles until the 7 Aug re-capture.
  CONSTRAINT memberships_role_check      CHECK ((role = ANY (ARRAY['admin'::text, 'coach'::text, 'manager'::text, 'medic'::text, 'parent'::text, 'player'::text]))),
  -- Added 2026-08-08 (membership_pending_status). Two values only, as found;
  -- there is no 'rejected'/'dismissed' value on this column.
  CONSTRAINT memberships_status_check     CHECK ((status = ANY (ARRAY['pending'::text, 'active'::text])))
);
ALTER TABLE public.memberships ENABLE ROW LEVEL SECURITY;

-- Added 2026-08-06 (memberships_unique_grant). See the note above.
--
-- ⚠️ Re-checked live 2026-08-09 and UNCHANGED by membership_pending_status:
-- `status` is NOT one of the indexed columns. So the index treats a pending
-- row and an active row for the same (profile, club, role, team, player) as
-- the SAME grant — a second INSERT collides rather than creating a duplicate.
-- That is the behaviour the 8 Aug design note asked to be verified
-- ("a person must not be able to hold a pending and an active row for the
-- same (profile, team, player)" —
-- claude/decisions/2026-08-08-parent-self-registration.md). Recorded as
-- found; adding `status` to this index would silently reverse it.
CREATE UNIQUE INDEX memberships_unique_grant ON public.memberships
  USING btree (profile_id, club_id, role, team_id, player_id) NULLS NOT DISTINCT;


-- ---------------------------------------------------------------------
-- events  (fixtures, training, socials)
-- ---------------------------------------------------------------------
CREATE TABLE public.events (
  id           uuid        NOT NULL DEFAULT gen_random_uuid(),
  club_id      uuid        NOT NULL,
  team_id      uuid        NOT NULL,
  type         text        NOT NULL,
  title        text,
  opponent     text,
  home         boolean              DEFAULT true,
  venue        text,
  competition  text,
  starts_at    timestamptz NOT NULL,
  result_us    integer,
  result_them  integer,
  created_by   uuid,
  created_at   timestamptz          DEFAULT now(),
  -- Added 2026-08-05. ⚠️ series_id was applied to the live database by
  -- migration 20260805133133 and has NO file in db/migrations/ — Supabase's
  -- migration list is authoritative, that directory is a partial mirror.
  -- group_id and series_id are deliberately never both set on one row:
  -- group_id ties one session shared across several age groups, series_id
  -- ties one repeating session across dates.
  series_id    uuid,
  pitch        text,
  group_id     uuid,
  -- Added 2026-08-08 (event_end_time_and_notes). Column comments as stored:
  --   ends_at: "When the event finishes. Required by EventForm, nullable here
  --   so an external fixture feed cannot hard-fail. NULL falls back to the
  --   per-type duration guess in supabase/functions/calendar/index.ts."
  --   notes:   "Free text shown on the event detail sheet and in the calendar
  --   DESCRIPTION. Written by squad staff for that squad - treat as
  --   squad-visible, not private."
  -- The nullability is the point: the app requires an end time, the database
  -- does not, so the constraint lives where a feed import cannot trip on it.
  ends_at      timestamptz,
  notes        text,
  CONSTRAINT events_pkey          PRIMARY KEY (id),
  CONSTRAINT events_club_id_fkey    FOREIGN KEY (club_id)    REFERENCES clubs(id)    ON DELETE CASCADE,
  CONSTRAINT events_team_id_fkey    FOREIGN KEY (team_id)    REFERENCES teams(id)    ON DELETE CASCADE,
  CONSTRAINT events_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id),
  CONSTRAINT events_type_check      CHECK ((type = ANY (ARRAY['match'::text, 'training'::text, 'social'::text]))),
  -- Added 2026-08-08 (event_end_time_and_notes). Note the `ends_at IS NULL OR`
  -- arm: a NULL end time stays legal, so the CHECK only ever fires on an end
  -- time that is actually before or equal to the start.
  CONSTRAINT events_ends_after_starts CHECK (((ends_at IS NULL) OR (ends_at > starts_at)))
);
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

-- Added 2026-08-05. Partial: only rows that belong to a series are indexed.
CREATE INDEX events_series_id_idx ON public.events USING btree (series_id)
  WHERE (series_id IS NOT NULL);

-- ⚠️ MISSED BY THE 7 AUG RE-CAPTURE, recorded here 2026-08-09. This index was
-- created on 5 Aug by migration 20260805150621 (events_pitch_and_group_id),
-- the same migration as pitch and group_id. The 7 Aug header above says
-- "group_id (+partial index)" — singular — and only events_series_id_idx was
-- written down. It is not drift: nothing created it outside a migration. It is
-- an object that existed live for four days with no line in this file, and it
-- survived a re-capture that was supposed to catch exactly that.
CREATE INDEX events_group_id_idx ON public.events USING btree (group_id)
  WHERE (group_id IS NOT NULL);


-- ---------------------------------------------------------------------
-- availability  (RSVPs)
-- ---------------------------------------------------------------------
CREATE TABLE public.availability (
  id          uuid        NOT NULL DEFAULT gen_random_uuid(),
  event_id    uuid        NOT NULL,
  player_id   uuid        NOT NULL,
  status      text        NOT NULL,
  updated_by  uuid,
  updated_at  timestamptz          DEFAULT now(),
  CONSTRAINT availability_pkey                    PRIMARY KEY (id),
  CONSTRAINT availability_event_id_player_id_key  UNIQUE (event_id, player_id),
  CONSTRAINT availability_event_id_fkey   FOREIGN KEY (event_id)   REFERENCES events(id)   ON DELETE CASCADE,
  CONSTRAINT availability_player_id_fkey  FOREIGN KEY (player_id)  REFERENCES players(id)  ON DELETE CASCADE,
  CONSTRAINT availability_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES profiles(id),
  CONSTRAINT availability_status_check    CHECK ((status = ANY (ARRAY['in'::text, 'out'::text, 'maybe'::text])))
);
ALTER TABLE public.availability ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------
-- invites  (Task 18: tokenised invite links)
--
-- Table comment as stored in the database:
--   "Task 18: tokenised invite links. accept_invite(token) is the only
--    path that turns one into a membership row."
--
-- NOTE 1: `token` is unique, but via a BARE UNIQUE INDEX
-- (invites_token_key), not a table constraint — it does not appear in
-- pg_constraint. Functionally equivalent for uniqueness; it just means
-- nothing can reference it as a foreign key target and it will not show
-- up if you audit constraints only. Recorded as-found, not "fixed".
--
-- NOTE 2: the CHECK constraint `invites_team_required_unless_admin`
-- described in RESTORE.md's Task 18 section NO LONGER EXISTS. It was
-- dropped by migration `invites_team_constraint_moves_into_accept` and
-- the rule now lives inside accept_invite() as the "incomplete invite"
-- guard. team_id is therefore nullable and unguarded at the table level.
-- ---------------------------------------------------------------------
CREATE TABLE public.invites (
  id           uuid        NOT NULL DEFAULT gen_random_uuid(),
  club_id      uuid        NOT NULL,
  email        text        NOT NULL,
  role         text        NOT NULL,
  team_id      uuid,
  player_id    uuid,
  token        uuid        NOT NULL DEFAULT gen_random_uuid(),
  created_by   uuid,
  created_at   timestamptz NOT NULL DEFAULT now(),
  accepted_at  timestamptz,
  CONSTRAINT invites_pkey           PRIMARY KEY (id),
  CONSTRAINT invites_club_id_fkey    FOREIGN KEY (club_id)    REFERENCES clubs(id),
  CONSTRAINT invites_team_id_fkey    FOREIGN KEY (team_id)    REFERENCES teams(id),
  CONSTRAINT invites_player_id_fkey  FOREIGN KEY (player_id)  REFERENCES players(id),
  CONSTRAINT invites_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id),
  -- ⚠️ CORRECTED 2026-08-09. This file listed FOUR roles here
  -- (admin/coach/parent/player) from the original capture right through the
  -- 7 Aug re-capture. That was WRONG for four days: migration 20260805160320
  -- (roles_manager_and_medic) widened BOTH role CHECKs on 5 Aug, and only
  -- memberships_role_check was corrected on 7 Aug. Live has six here, and has
  -- had since 5 Aug. 'manager' and 'medic' are identical to 'coach' in what
  -- they may do; the distinction is documentary — see
  -- claude/decisions/2026-08-05-team-manager-and-medic-roles.md.
  CONSTRAINT invites_role_check      CHECK ((role = ANY (ARRAY['admin'::text, 'coach'::text, 'manager'::text, 'medic'::text, 'parent'::text, 'player'::text])))
);
ALTER TABLE public.invites ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX invites_token_key ON public.invites USING btree (token);
CREATE INDEX invites_email_idx ON public.invites USING btree (lower(email));

COMMENT ON TABLE public.invites IS
  'Task 18: tokenised invite links. accept_invite(token) is the only path that turns one into a membership row.';


-- ---------------------------------------------------------------------
-- invite_targets  (Task: invite_targets_multi_access — one invite can
--                  grant access to several teams / players at once)
--
-- !! DELIBERATE ABSENCE OF A UNIQUE CONSTRAINT !!
-- There is NO unique constraint on (invite_id, team_id) or on
-- (invite_id, team_id, player_id). The same team can be attached to the
-- same invite twice. DUPLICATES ARE POSSIBLE. accept_invite() guards
-- against the consequence by inserting with SELECT DISTINCT, and the
-- admin UI de-duplicates before writing. Mirrors the memberships
-- situation above; both are known and intentional for now.
-- ---------------------------------------------------------------------
CREATE TABLE public.invite_targets (
  id          uuid        NOT NULL DEFAULT gen_random_uuid(),
  invite_id   uuid        NOT NULL,
  team_id     uuid        NOT NULL,
  player_id   uuid,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT invite_targets_pkey           PRIMARY KEY (id),
  CONSTRAINT invite_targets_invite_id_fkey FOREIGN KEY (invite_id) REFERENCES invites(id) ON DELETE CASCADE,
  CONSTRAINT invite_targets_team_id_fkey   FOREIGN KEY (team_id)   REFERENCES teams(id),
  CONSTRAINT invite_targets_player_id_fkey FOREIGN KEY (player_id) REFERENCES players(id)
);
ALTER TABLE public.invite_targets ENABLE ROW LEVEL SECURITY;

CREATE INDEX invite_targets_invite_id_idx ON public.invite_targets USING btree (invite_id);


-- ---------------------------------------------------------------------
-- Indexes: complete list in `public` as captured 2026-08-09, verbatim from
-- pg_indexes. (`private` has no tables and therefore no indexes.)
--
-- ⚠️ REWRITTEN 2026-08-09. This list had not been touched since the 3 Aug
-- capture. It was missing SEVEN indexes — access_requests_pkey,
-- access_requests_profile_id_key, calendar_tokens_pkey,
-- calendar_tokens_token_key, player_parents_player_id_idx,
-- memberships_unique_grant, events_series_id_idx — plus
-- events_group_id_idx, and its opening sentence claimed "apart from the
-- primary keys, the only indexes are the two on invites and one on
-- invite_targets", which stopped being true on 4 Aug. Several of those
-- indexes ARE written up individually elsewhere in this file; the summary
-- was simply never maintained alongside them. A summary that is not
-- regenerated is worse than no summary.
--
-- Still true: there is NO index on memberships.profile_id, players.team_id,
-- events.team_id or availability.event_id, all of which are hit by every RLS
-- policy evaluation. Recorded, not changed — the club's data volume is small.
-- ---------------------------------------------------------------------
--   access_requests_pkey                 UNIQUE (id)
--   access_requests_profile_id_key       UNIQUE (profile_id)
--   availability_event_id_player_id_key  UNIQUE (event_id, player_id)
--   availability_pkey                    UNIQUE (id)
--   calendar_tokens_pkey                 UNIQUE (profile_id)
--   calendar_tokens_token_key            UNIQUE (token)
--   clubs_pkey                           UNIQUE (id)
--   events_group_id_idx                  btree (group_id) WHERE group_id IS NOT NULL
--   events_pkey                          UNIQUE (id)
--   events_series_id_idx                 btree (series_id) WHERE series_id IS NOT NULL
--   invite_targets_invite_id_idx         btree (invite_id)
--   invite_targets_pkey                  UNIQUE (id)
--   invites_email_idx                    btree (lower(email))
--   invites_pkey                         UNIQUE (id)
--   invites_token_key                    UNIQUE (token)
--   memberships_pkey                     UNIQUE (id)
--   memberships_unique_grant             UNIQUE (profile_id, club_id, role, team_id, player_id) NULLS NOT DISTINCT
--   player_contacts_pkey                 UNIQUE (player_id)
--   player_parents_pkey                  UNIQUE (id)
--   player_parents_player_id_idx         btree (player_id)
--   players_pkey                         UNIQUE (id)
--   profiles_pkey                        UNIQUE (id)
--   teams_pkey                           UNIQUE (id)
