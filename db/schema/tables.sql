-- =====================================================================
-- db/schema/tables.sql
-- CAPTURE of the live `public` schema tables in Supabase project
-- lusmshimxdcxpnrktlgz (quins-club-hub), taken 2026-08-03.
--
-- This is a CAPTURE, not a migration. Do not run this file. See README.md
-- in this directory.
--
-- Sources: information_schema.columns, pg_constraint + pg_get_constraintdef,
--          pg_indexes, pg_class.relrowsecurity, obj_description.
--
-- All ten tables have RLS ENABLED (relrowsecurity = true) and none have
-- FORCE ROW LEVEL SECURITY (relforcerowsecurity = false, i.e. the table
-- owner still bypasses RLS). Policies live in policies.sql.
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
-- teams  (the 15 age groups)
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
  CONSTRAINT players_pkey         PRIMARY KEY (id),
  CONSTRAINT players_club_id_fkey FOREIGN KEY (club_id) REFERENCES clubs(id) ON DELETE CASCADE,
  CONSTRAINT players_team_id_fkey FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
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
-- memberships  (role links: admin / coach / parent / player)
--
-- !! DELIBERATE ABSENCE OF A UNIQUE CONSTRAINT !!
-- There is NO unique constraint on (profile_id, club_id, role), nor on
-- (profile_id, club_id, team_id, role). The only unique index is the
-- primary key on a fresh uuid. DUPLICATE MEMBERSHIP ROWS FOR ONE PERSON
-- ARE POSSIBLE and have occurred in practice (one was created by an
-- `ON CONFLICT DO NOTHING` that could not conflict on anything).
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
  CONSTRAINT memberships_pkey            PRIMARY KEY (id),
  CONSTRAINT memberships_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE,
  CONSTRAINT memberships_club_id_fkey    FOREIGN KEY (club_id)    REFERENCES clubs(id)    ON DELETE CASCADE,
  CONSTRAINT memberships_team_id_fkey    FOREIGN KEY (team_id)    REFERENCES teams(id)    ON DELETE CASCADE,
  CONSTRAINT memberships_player_id_fkey  FOREIGN KEY (player_id)  REFERENCES players(id)  ON DELETE SET NULL,
  CONSTRAINT memberships_role_check      CHECK ((role = ANY (ARRAY['admin'::text, 'coach'::text, 'parent'::text, 'player'::text])))
);
ALTER TABLE public.memberships ENABLE ROW LEVEL SECURITY;


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
  CONSTRAINT events_pkey          PRIMARY KEY (id),
  CONSTRAINT events_club_id_fkey    FOREIGN KEY (club_id)    REFERENCES clubs(id)    ON DELETE CASCADE,
  CONSTRAINT events_team_id_fkey    FOREIGN KEY (team_id)    REFERENCES teams(id)    ON DELETE CASCADE,
  CONSTRAINT events_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id),
  CONSTRAINT events_type_check      CHECK ((type = ANY (ARRAY['match'::text, 'training'::text, 'social'::text])))
);
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;


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
  CONSTRAINT invites_role_check      CHECK ((role = ANY (ARRAY['admin'::text, 'coach'::text, 'parent'::text, 'player'::text])))
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
-- Indexes: complete list in `public` as captured. Note that apart from
-- the primary keys, the only indexes are the two on invites and one on
-- invite_targets. There is NO index on memberships.profile_id,
-- players.team_id, events.team_id or availability.event_id, all of which
-- are hit by every RLS policy evaluation. Recorded, not changed — the
-- club's data volume is small.
-- ---------------------------------------------------------------------
--   availability_event_id_player_id_key  UNIQUE (event_id, player_id)
--   availability_pkey                    UNIQUE (id)
--   clubs_pkey                           UNIQUE (id)
--   events_pkey                          UNIQUE (id)
--   invite_targets_invite_id_idx         btree (invite_id)
--   invite_targets_pkey                  UNIQUE (id)
--   invites_email_idx                    btree (lower(email))
--   invites_pkey                         UNIQUE (id)
--   invites_token_key                    UNIQUE (token)
--   memberships_pkey                     UNIQUE (id)
--   player_contacts_pkey                 UNIQUE (player_id)
--   players_pkey                         UNIQUE (id)
--   profiles_pkey                        UNIQUE (id)
--   teams_pkey                           UNIQUE (id)
