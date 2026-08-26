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
-- RE-CAPTURED AGAIN 2026-08-09, later the same day, after
--   20260809_scale_indexes_and_availability_policy_merge
--                                       → INDEXES (and policies.sql)
-- Table-level delta applied here: FOUR new plain btree indexes, and nothing
-- else. No column, type, default, constraint or table changed.
--
--   availability_player_id_idx  ON public.availability (player_id)
--   memberships_team_id_idx     ON public.memberships  (team_id)
--   memberships_player_id_idx   ON public.memberships  (player_id)
--   players_team_id_idx         ON public.players      (team_id)
--
-- Each is written up against its own table below, and all four are in the
-- index summary at the foot of this file. ⚠️ That summary previously ended
-- "Still true: there is NO index on memberships.profile_id, players.team_id,
-- events.team_id or availability.event_id" — two thirds of that sentence
-- stopped being true with this migration and it has been rewritten.
--
-- Still thirteen tables — no table was added, dropped or renamed since the
-- 7 Aug capture. All thirteen have RLS ENABLED (relrowsecurity = true) and
-- none have FORCE ROW LEVEL SECURITY (relforcerowsecurity = false, i.e. the
-- table owner still bypasses RLS). Policies live in policies.sql.
--
-- ⚠️ RE-CAPTURED 2026-08-11, after this file went two days and three
-- table-touching migrations behind live. Deltas applied here:
--
--   20260810183058 super_admin_and_rights  → memberships.is_super,
--                                            memberships.admin_rights
--   20260811085312 self_registration       → teams.self_registration_allowed
--
-- ⚠️ AND THE `pitches` / `pitch_requests` BLOCKS AT THE FOOT OF THIS FILE WERE
-- NOT A CAPTURE. They were pasted from db/migrations/20260811_pitches.sql and
-- 20260811_pitch_requests.sql — `CREATE TABLE IF NOT EXISTS`, inline `UNIQUE
-- (club_id, name)`, an unnamed inline CHECK — none of which is what the live
-- catalogue holds. Every other table in this file names its constraints, so a
-- future diff would have shown two tables whose constraints simply do not
-- appear: `pitches_club_id_name_key` and `pitch_requests_status_check` were
-- both live and both unnamed here. They are now written as found.
-- **Pasting the migration is not capturing the database**, and it produces a
-- file that looks complete — the README's "keep the output faithful" line is
-- about exactly this.
--
-- ⚠️ The count sentence above is scoped to the 9 Aug capture and is left as
-- written. Live is SIXTEEN tables as of 11 Aug — attendance, pitches and
-- pitch_requests joined the thirteen. The authoritative RLS-on list is in
-- policies.sql, which had the same three missing.
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
  -- Added 2026-08-11 (self_registration). Column comment as stored:
  -- "Whether a player in this squad may register THEMSELVES rather than being
  -- registered by a parent. Jay's ruling 11 Aug 2026: U13 and above. Set
  -- deliberately per squad — NEVER derived from teams.name, so that renaming a
  -- squad cannot change who may hold their own account."
  --
  -- ⚠️ THE SECOND COLUMN ON THIS TABLE THAT EXISTS PURELY SO THAT A SQUAD
  -- RENAME CANNOT CHANGE ACCESS, and the pair should be read together.
  -- is_senior does it for claim_roster_access; this does it for
  -- register_my_player, whose 0A000 guard reads this column and never the name.
  --
  -- ⚠️ private.squad_expects_gender DOES parse teams.name, and that is not a
  -- counter-example: it validates the data being entered, it does not decide
  -- who gets an account. That distinction is the whole reason this is a column
  -- and not a `name like 'U1%'`.
  --
  -- NOT NULL DEFAULT false, so a squad added later is closed until somebody
  -- opens it deliberately — the safe direction. Which squads currently carry
  -- true is DATA and is deliberately not written down here; the migration's own
  -- guard asserts the count at apply time and `select name,
  -- self_registration_allowed from teams` answers it now.
  self_registration_allowed boolean NOT NULL DEFAULT false,

  -- Added 2026-08-21 (training_plans). Column comment as stored:
  --   "Whether this squad plays contact rugby. Set per squad on /admin/club,
  --   NEVER parsed from teams.name and NEVER inferred from age — the club runs
  --   tag sides above the age contact begins. Default false fails safe."
  -- ⚠️ THE THIRD COLUMN ON THIS TABLE THAT EXISTS SO A SQUAD RENAME CANNOT
  -- CHANGE BEHAVIOUR. Measured at apply: 15 squads, 0 flagged — every squad is
  -- TAG until somebody says otherwise, which is the safe direction.
  requires_contact boolean NOT NULL DEFAULT false,
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
  -- !! Added 16 Aug 2026 for the sign-in gate: "I don't have a player at the
  -- !! club", recorded once so it stops being asked. A TIMESTAMP like
  -- !! name_confirmed_at beside it, because false and null are
  -- !! indistinguishable in a boolean written by an app that has not asked yet.
  -- !! ⚠️ NEEDS ITS OWN COLUMN GRANT — see db/schema/grants.sql. authenticated
  -- !! holds UPDATE on named columns only.
  no_player_confirmed_at timestamptz,
  -- !! Added 16 Aug 2026, hours after the column above and as its exact mirror:
  -- !! "I don't do a job at the club", for the gate's fourth step. Sign-up forks
  -- !! two ways and each door loses the other half of who somebody is — the
  -- !! column above covers the staff door, this one covers the parent door,
  -- !! which had no mirror and produced a real coach filed as a parent.
  -- !! ⚠️ ITS OWN COLUMN GRANT, same trap, and the failure is INVISIBLE: without
  -- !! it the write is refused and the gate simply reopens next sign-in, which
  -- !! looks identical to never having been answered.
  -- !! ⚠️ NOT the counterpart of "yes" — a person who DOES do a job says so with
  -- !! a membership row (public.request_staff_role, pending). Only the "no" lives
  -- !! here, because only the "no" has nowhere else to be recorded.
  no_role_confirmed_at timestamptz,
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
  --
  -- Added 2026-08-13 (staff_photos). The object key of this person's own head
  -- shot inside the PRIVATE `staff-photos` bucket, shape
  -- `<profile_id>/<timestamp>.<ext>`. Feeds the Squad contacts card on Home.
  --
  -- ⚠️ DELIBERATELY **NOT** COLUMN-GRANTED, which is the opposite of the phone
  -- above and the opposite of memberships.title. The allow-list described in
  -- the paragraph above is exactly why: adding `photo_path` to it would make it
  -- writable on any row the `profile update own` policy exposes, and this is a
  -- column somebody writes about THEMSELVES rather than one an admin maintains.
  -- The write goes through the SECURITY DEFINER RPC `public.set_my_photo()`,
  -- which has a hard-coded SET list and refuses a key that does not live under
  -- the caller's own id (42501).
  --
  -- ⚠️ SO A DIRECT `update profiles set photo_path = …` FAILS, and it fails
  -- looking exactly like an RLS refusal. That is the trap this table's own
  -- comment warns about two paragraphs up; it is now deliberate rather than
  -- accidental.
  photo_path        text,
  phone             text,
  -- Re-captured 25 Aug 2026 — six live columns this file was missing:
  -- photo_focus_x/y (photo positioner), email_confirmed_at (welcome-mail
  -- door two), signup_intent + signup_intent_applied_at (signup-before-
  -- confirm wizard), welcomed_at (the welcome trigger's gate).
  photo_focus_x     smallint,
  photo_focus_y     smallint,
  email_confirmed_at        timestamptz,
  signup_intent             jsonb,
  signup_intent_applied_at  timestamptz,
  welcomed_at               timestamptz,
  -- 26 Aug 2026 (20260826_last_seen.sql): day-level "is this account alive?"
  -- for admins. Written ONLY by public.touch_last_seen() (own row, 12h
  -- floor); backfilled once from auth.users.last_sign_in_at.
  last_seen_at              timestamptz,
  CONSTRAINT profiles_pkey   PRIMARY KEY (id),
  CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT profiles_photo_focus_range CHECK ((((photo_focus_x IS NULL) OR ((photo_focus_x >= 0) AND (photo_focus_x <= 100))) AND ((photo_focus_y IS NULL) OR ((photo_focus_y >= 0) AND (photo_focus_y <= 100)))))
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
  -- !! Added 16 Aug 2026 (split_player_and_parent_names). Jay: "children name
  -- !! and any other name should be two blocks First Name and Last Name, this
  -- !! will stop people only putting a first name". One column behind one box
  -- !! got one word, and the live roster carried a child with a first name and
  -- !! nothing else.
  -- !! ⚠️ full_name IS STILL THE DISPLAY VALUE and is NOT derived-and-forgotten:
  -- !! private.sync_person_name (triggers.sql) reconciles all three BOTH WAYS,
  -- !! so the ~30 files reading full_name were untouched by this change. Write
  -- !! either side.
  -- !! ⚠️ NOT A GENERATED COLUMN, for the same reason profiles.full_name is not:
  -- !! register_my_player, PlayerForm and the importer all write it directly and
  -- !! would break on first save.
  first_name  text,
  last_name   text,
  jersey_num  integer,
  -- ⚠️ `position` and `unit` WERE DROPPED 25 Aug 2026 (positions_staff_only +
  -- drop_players_position_unit). Jay made positions staff-only, and RLS grants
  -- rows, not columns, so they could not stay on this squad-readable row. The
  -- data moved to player_positions (first row = primary) and the new
  -- player_units table below, both coach-only in the player_grades shape.
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
  -- Re-captured 25 Aug 2026: the photo positioner's focal point (percent).
  photo_focus_x smallint,
  photo_focus_y smallint,
  CONSTRAINT players_pkey         PRIMARY KEY (id),
  CONSTRAINT players_club_id_fkey FOREIGN KEY (club_id) REFERENCES clubs(id) ON DELETE CASCADE,
  CONSTRAINT players_team_id_fkey FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
  CONSTRAINT players_gender_check CHECK (((gender IS NULL) OR (gender = ANY (ARRAY['male'::text, 'female'::text])))),
  CONSTRAINT players_photo_focus_range CHECK ((((photo_focus_x IS NULL) OR ((photo_focus_x >= 0) AND (photo_focus_x <= 100))) AND ((photo_focus_y IS NULL) OR ((photo_focus_y >= 0) AND (photo_focus_y <= 100)))))
);
ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;

-- Added 2026-08-09 (scale_indexes_and_availability_policy_merge).
-- This is the roster screen's default query — "the players in this squad" —
-- on the most-used page in the app, and without it every load sequentially
-- scans the whole players table. Free at 6 rows, not free at the 600-700
-- players the club is heading for.
CREATE INDEX players_team_id_idx ON public.players USING btree (team_id);


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
  -- !! Added 16 Aug 2026 (split_player_and_parent_names), same reconciler as
  -- !! public.players above — "any other name" in Jay's request is this table.
  -- !! ⚠️ THE CHECK BELOW STILL GUARDS full_name AND ONLY full_name. A row with
  -- !! a blank first_name and a populated full_name is legal and is what an old
  -- !! writer produces; the trigger fills the split in. Do not add a NOT NULL
  -- !! here without also changing every writer.
  first_name    text,
  last_name     text,
  relationship  text,
  email         text,
  phone         text,
  is_primary    boolean              DEFAULT false,
  sort_order    integer              DEFAULT 0,
  created_at    timestamptz          DEFAULT now(),
  CONSTRAINT player_parents_pkey           PRIMARY KEY (id),
  CONSTRAINT player_parents_player_id_fkey FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE,
  -- !! ADDED 16 Aug 2026 (invite_parent). When invite_parent last minted an
  -- !! invite for this row; drives the button's Invite / Sent / Joined states.
  -- !! ⚠️ NOT PROOF OF DELIVERY. The send is a separate step and can fail after
  -- !! this is stamped. It records that we ASKED, never that anything arrived.
  invited_at    timestamptz,
  -- Re-captured 25 Aug 2026 (parent_profile_link, 17 Aug — uncaptured for 8
  -- days): the Club Hub account this parent row belongs to, when known.
  profile_id    uuid,
  CONSTRAINT player_parents_name_not_blank CHECK ((btrim(full_name) <> ''::text)),
  CONSTRAINT player_parents_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE SET NULL
);
ALTER TABLE public.player_parents ENABLE ROW LEVEL SECURITY;

CREATE INDEX player_parents_player_id_idx ON public.player_parents USING btree (player_id);
CREATE INDEX player_parents_profile_id_idx ON public.player_parents USING btree (profile_id) WHERE (profile_id IS NOT NULL);


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
  -- !! Added 16 Aug 2026 so a request says WHO is asking and for WHICH squad.
  -- !! Nullable despite being required: the seven rows that predate them have
  -- !! neither, and the requirement is enforced on the INSERT policy, which
  -- !! applies to new rows only. NOT NULL cannot express that distinction.
  requested_role     text,
  requested_team_id  uuid,
  -- Re-captured 25 Aug 2026: multi-squad requests. Was live but uncaptured.
  requested_team_ids uuid[],
  CONSTRAINT access_requests_pkey            PRIMARY KEY (id),
  CONSTRAINT access_requests_profile_id_key  UNIQUE (profile_id),
  CONSTRAINT access_requests_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE,
  CONSTRAINT access_requests_decided_by_fkey FOREIGN KEY (decided_by) REFERENCES profiles(id) ON DELETE SET NULL,
  CONSTRAINT access_requests_status_check    CHECK ((status = ANY (ARRAY['pending'::text, 'dismissed'::text]))),
  CONSTRAINT access_requests_requested_team_id_fkey FOREIGN KEY (requested_team_id) REFERENCES teams(id) ON DELETE SET NULL,
  -- !! No 'admin'. Squad roles are granted by a coach or manager approving a
  -- !! stranger; admin is club-wide and granted by an existing admin elsewhere.
  -- !! 'volunteer' ADDED 17 Aug 2026, AND IT IS THE ONE VALUE HERE THAT IS NOT A
  -- !! MEMBERSHIP ROLE. This column is what somebody SAYS they are;
  -- !! memberships.role is what they may be granted, and its own CHECK refuses
  -- !! 'volunteer' on purpose — so an admin approving a committee member still
  -- !! chooses what access they get. Do not add it there to make the two lists
  -- !! match: can_see_team and can_edit_team read that table, and a role that
  -- !! grants nothing is a row each of them would have to learn to ignore.
  CONSTRAINT access_requests_requested_role_check CHECK ((requested_role IS NULL OR requested_role = ANY (ARRAY['parent'::text, 'player'::text, 'coach'::text, 'manager'::text, 'medic'::text, 'volunteer'::text])))
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
  -- Both added 2026-08-10 (super_admin_and_rights). No column comment stored.
  --
  -- ⚠️ THESE TWO COLUMNS ARE NOT PROTECTED BY ANY POLICY ON THIS TABLE, AND
  -- THAT IS THE ONE THING TO UNDERSTAND ABOUT THEM. "memb manage" is FOR ALL
  -- and admin-only, so every admin can already write rows here — which means a
  -- plain flag would let any admin make themselves a super admin and the tier
  -- would be decoration. Three things stop that, and all three are needed:
  --   * UPDATE  — a column GRANT (db/schema/grants.sql). `authenticated` does
  --               not hold UPDATE on either column, full stop.
  --   * INSERT  — the RESTRICTIVE policy "memb no self promotion"
  --               (db/schema/policies.sql). A column grant does not stop a NEW
  --               row arriving with is_super already true.
  --   * the way in — public.set_admin_rights, a SECURITY DEFINER RPC gated on
  --               private.is_super_admin().
  -- ⚠️ **Policies authorise the ROW; grants authorise the COLUMN.** Reading
  -- policies.sql alone will tell you an admin may write this table and will not
  -- tell you these two columns are carved out of that. Same shape as
  -- profiles.email.
  --
  -- ⚠️ A FLAG AND NOT A ROLE VALUE, deliberately: twelve places in this schema
  -- test `role = 'admin'`, and a new role value would have to be added to all
  -- twelve, each one a chance to silently strip a super admin of an ordinary
  -- power. A boolean makes a super admin an admin, so all twelve keep working.
  --
  -- ⚠️ admin_rights is NOT a security boundary and must never be described as
  -- one. It decides which dashboard somebody is SHOWN ('youth', 'media',
  -- 'pitches' — ADMIN_RIGHTS in src/lib/scope.js); the RLS behind those screens
  -- is plain private.is_admin. It is a "not your job" message.
  -- ⚠️ AND A SUPER ADMIN HOLDS EVERY RIGHT IMPLICITLY without it being listed
  -- here, so an empty array on a super row means "all", not "none". Every
  -- consumer must honour that — including the pitch email's recipient query,
  -- where forgetting it excludes the one person certain to be able to act.
  is_super      boolean NOT NULL DEFAULT false,
  admin_rights  text[]  NOT NULL DEFAULT '{}'::text[],
  -- ── Added 2026-08-13, migration membership_title ──
  --
  -- The job title shown on /admin/staff — "Head Coach", "Assistant Coach".
  --
  -- ⚠️ NO CHECK CONSTRAINT, DELIBERATELY, and the same reasoning as
  -- admin_rights above: a constraint would mean a migration per job title, for
  -- a value that labels a person and grants nothing. STAFF_TITLES in
  -- src/lib/scope.js is a picker's suggestions, not a whitelist, and the
  -- database does not know about it.
  --
  -- ⚠️ A TITLE IS NEVER PERMISSION. private.can_edit_team keys off `role`, so
  -- "Head Coach" grants precisely what `coach` grants. Anything that ever
  -- branches on this column is a bug.
  --
  -- ⚠️ IT NEEDED ITS OWN COLUMN GRANT AND IS THE FIRST COLUMN ADDED SINCE THAT
  -- BECAME TRUE. `authenticated` has no table-level UPDATE on memberships, so a
  -- new column is unwritable by default and fails looking exactly like an RLS
  -- refusal. See grants.sql — and do NOT fix such a failure with a table-level
  -- grant, which would hand every admin write access to is_super.
  title         text,
  -- ── Added 2026-08-18, migration membership_head_coach ──
  --
  -- WHICH coach is THE head coach, as data rather than as a string somebody
  -- typed. The notify functions read this to decide who hears about an
  -- approval; `title` above stays a label that grants nothing and is read by
  -- nothing but the screen.
  --
  -- ⚠️ THIS IS THE COLUMN `title` DELIBERATELY IS NOT. The comment above says
  -- anything branching on `title` is a bug — this is what such code should use
  -- instead. It was added precisely because matching '%head coach%' against
  -- free text would fail silently: production already holds
  -- 'Assistant Coach/Medic', and a squad recorded as 'HC' would match nothing
  -- while nobody learned an e-mail had not been sent.
  --
  -- ⚠️ STILL NOT PERMISSION. A head coach can do exactly what a coach can do;
  -- private.can_edit_team keys off `role` and does not know this column exists.
  -- It decides who gets TOLD, never who may act.
  --
  -- ⚠️ ITS COLUMN GRANT IS LOAD-BEARING, same trap as `title` — see grants.sql.
  is_head_coach boolean NOT NULL DEFAULT false,
  notify_approvals boolean NOT NULL DEFAULT false,  -- 23 Aug 2026: who is EMAILED about pending approvals (admin: club-wide; coach/manager: their squad). Confers nothing.
  CONSTRAINT memberships_pkey            PRIMARY KEY (id),
  CONSTRAINT memberships_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE,
  CONSTRAINT memberships_club_id_fkey    FOREIGN KEY (club_id)    REFERENCES clubs(id)    ON DELETE CASCADE,
  CONSTRAINT memberships_team_id_fkey    FOREIGN KEY (team_id)    REFERENCES teams(id)    ON DELETE CASCADE,
  CONSTRAINT memberships_player_id_fkey  FOREIGN KEY (player_id)  REFERENCES players(id)  ON DELETE SET NULL,
  -- ⚠️ 'manager' and 'medic' added 2026-08-05 (roles_manager_and_medic). This
  -- file listed only four roles until the 7 Aug re-capture.
  CONSTRAINT memberships_role_check      CHECK ((role = ANY (ARRAY['admin'::text, 'coach'::text, 'manager'::text, 'medic'::text, 'parent'::text, 'player'::text]))),
  -- Added 2026-08-18 (membership_head_coach). A head coach is a COACH ON A
  -- SQUAD; without this the flag could sit on an admin (team_id null) or a
  -- parent and the notify functions would inherit a recipient that makes no
  -- sense. Written as `NOT is_head_coach OR ...` so it is silent for every row
  -- where the flag is false.
  CONSTRAINT memberships_head_coach_is_a_squad_coach CHECK ((NOT is_head_coach OR (role = 'coach'::text AND team_id IS NOT NULL))),
  CONSTRAINT memberships_notify_approvals_role CHECK ((NOT notify_approvals OR (role = ANY (ARRAY['admin'::text, 'coach'::text, 'manager'::text])))),
  -- Added 2026-08-08 (membership_pending_status). Two values only, as found;
  -- there is no 'rejected'/'dismissed' value on this column.
  CONSTRAINT memberships_status_check     CHECK ((status = ANY (ARRAY['pending'::text, 'active'::text]))),
  -- Added 2026-08-14 (family_role_needs_player). Jay's ruling: "nobody outside
  -- staff should be able to create an account without a player".
  --
  -- ⚠️ IT NAMES THE TWO FAMILY ROLES RATHER THAN SAYING `player_id IS NOT
  -- NULL`, AND THAT IS THE WHOLE DESIGN. Eleven staff memberships live with a
  -- null player_id — a coach is not anybody's parent — so the blunt version
  -- would break every one of them, admins included. A staff row MAY carry a
  -- player_id when the same person is also that child's parent (two do);
  -- allowed, never required.
  --
  -- ⚠️ WHAT IT PREVENTS is an account let INTO a squad that points at no
  -- player: it can see every child in that squad and cannot touch its own,
  -- because private.is_own_player needs a real id. One such row existed in
  -- production before this — an active parent on U18B — and it came from the
  -- invite path, which is fixed in the same migration.
  --
  -- ⚠️ IT DOES **NOT** PREVENT AN ACCOUNT WITH NO MEMBERSHIP AT ALL, and
  -- nothing can: signing up is Supabase auth and the app requires it BEFORE
  -- registration. Three such logins existed the day this was written. They are
  -- normal, temporary, and listed under "waiting for access" on Accounts.
  CONSTRAINT memberships_family_role_needs_player
    CHECK (((role <> ALL (ARRAY['parent'::text, 'player'::text])) OR (player_id IS NOT NULL)))
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

-- Added 2026-08-18 (membership_head_coach). ONE head coach per squad, Jay's
-- ruling, enforced by the database rather than hoped for.
--
-- ⚠️ PARTIAL, AND THAT IS WHAT MAKES IT FREE. Rows with the flag false are not
-- in the index at all, so the ordinary case costs nothing and the many rows
-- with a null team_id cannot collide with each other. It is also what lets the
-- notify functions treat "the head coach" as a single recipient instead of
-- defending against duplicates.
--
-- ⚠️ PROVED BY DROPPING IT: db/tests/head-coach-flag.sql sets a second head
-- coach on one squad and gets 23505; with this index dropped the same update
-- is ALLOWED. That flip is the evidence the index is what refuses it.
CREATE UNIQUE INDEX memberships_one_head_coach_per_team ON public.memberships
  USING btree (team_id) WHERE is_head_coach;

-- Added 2026-08-09 (scale_indexes_and_availability_policy_merge).
--
-- These two look like the least justified indexes in the file — `memberships`
-- is a small table and stays small (~2,000 rows at full club size). They are
-- the highest-leverage pair in the migration precisely BECAUSE the table is
-- small and hot: **nearly every RLS policy in this schema joins against
-- memberships**, so this scan does not run once per query, it runs INSIDE a
-- per-row policy check — including on `availability`, which is heading for
-- ~70,000 rows a season. A 2,000-row seq scan is cheap once and ruinous
-- 70,000 times.
--
-- ⚠️ NOTE what memberships_unique_grant above does NOT do for these: it is a
-- composite led by profile_id, so it is no use for a team_id or player_id
-- lookup. Same trap as on availability below.
CREATE INDEX memberships_team_id_idx   ON public.memberships USING btree (team_id);
CREATE INDEX memberships_player_id_idx ON public.memberships USING btree (player_id);


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
  -- ⚠️ MEANS "THE TOURNAMENT'S NAME" SINCE 12 Aug 2026, not "any competition".
  -- Free text on purpose so a one-off invitational needs no migration — the app
  -- offers four regulars and a "Something else" box, the shape the pitch picker
  -- settled on. NULL for a league fixture and for a friendly.
  -- ⚠️ Rows predating competition_type hold arbitrary strings with a NULL type;
  -- the form READS those as a tournament name so nothing typed is orphaned, and
  -- deliberately does not write the guess back.
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
  -- Added 2026-08-12 (events_league_team). Column comments as stored:
  --   league_team_id: "Which of the club's league teams played this fixture.
  --   NOT NULL means this IS a league match; null means it is not one, and
  --   division and round render as nothing. Never read null as 'assume league'."
  --   round: "League round number. Null unless league_team_id is set - a round
  --   number on a friendly is stale data, not a label."
  --
  -- ⚠️ THE NULL RULE IS THE FEATURE, not an implementation detail. A fixture IS
  -- a league match when league_team_id is not null; null must render NOTHING.
  -- This club has been bitten by exactly this shape once: src/lib/ageGroup.js
  -- returned null for an unparseable squad name, allowsOwnContact read null as
  -- "a senior side: adults", and the app offered a twelve-year-old girls' squad
  -- the child's own email and phone fields. The lesson was the NULL DEFAULT.
  --
  -- ⚠️ team_id AND league_team_id ARE NOT THE SAME THING. team_id is the SQUAD
  -- (the training group, "U14B Contact"); league_team_id is the COMPETING TEAM
  -- ("ADHQ2"). One squad can enter three of them, one per division.
  league_team_id uuid,
  round          smallint,
  -- Added 2026-08-12 (competition_type). Column comment as stored:
  --   "league | tournament. NULL means neither - a friendly - and is a real
  --   answer, never 'assume league'. round belongs to league; competition holds
  --   the tournament name. Deliberately NOT derived from round: a league
  --   fixture whose round is not yet known would otherwise read as a friendly."
  --
  -- ⚠️ `round` NOW HANGS OFF THIS, NOT OFF league_team_id — the comment stored
  -- against `round` above still says "null unless league_team_id is set" and is
  -- STALE as of 12 Aug 2026. A round is a property of the COMPETITION ("round 4
  -- of the league"), not of which of our sides turned up, and the old coupling
  -- discarded the round on a league fixture whose team was not picked yet.
  -- ⚠️ apply_migration strips `--` comments, and a COMMENT ON is the only way to
  -- change a stored one — so that stale sentence is still in the database. Left
  -- rather than silently corrected, because this file must say what is there.
  competition_type text,
  -- Added 2026-08-14 (competition_tbd_and_time_tbd). Column comment as stored:
  --   "True when the kick-off time is not yet known. starts_at still holds a
  --   real DATE (the app writes midnight club time as the placeholder) because
  --   starts_at is NOT NULL and every read path sorts and pages on it - do not
  --   make it nullable to express this. Readers must render the time as "TBD"
  --   and the calendar feed must emit an ALL-DAY entry. Nothing may infer this
  --   flag from a midnight starts_at: the flag is the only truth."
  --
  -- ⚠️ NOT NULL DEFAULT false, so every fixture predating it keeps exactly the
  -- meaning it had. Measured immediately after applying: 62 events, 0 flagged.
  time_tbd     boolean NOT NULL DEFAULT false,
  -- Re-captured 25 Aug 2026 (tiers_and_player_grades, 14 Aug — uncaptured
  -- for 11 days): the tier of the COMPETITION this fixture was played in, or
  -- NULL for a friendly and anything untiered. NOT derived from
  -- league_team_id — see the migration's comment.
  tier         text,
  CONSTRAINT events_pkey          PRIMARY KEY (id),
  CONSTRAINT events_club_id_fkey    FOREIGN KEY (club_id)    REFERENCES clubs(id)    ON DELETE CASCADE,
  CONSTRAINT events_team_id_fkey    FOREIGN KEY (team_id)    REFERENCES teams(id)    ON DELETE CASCADE,
  -- ⚠️ ON DELETE SET NULL, NEVER CASCADE. Deleting a league team must cost the
  -- fixture its LABEL, which is recoverable, and must never cost the club the
  -- FIXTURE, which is not.
  CONSTRAINT events_league_team_id_fkey FOREIGN KEY (league_team_id) REFERENCES league_teams(id) ON DELETE SET NULL,
  CONSTRAINT events_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id),
  CONSTRAINT events_type_check      CHECK ((type = ANY (ARRAY['match'::text, 'training'::text, 'social'::text]))),
  -- ⚠️ NO 'friendly' VALUE, DELIBERATELY. A friendly is the ABSENCE of a
  -- competition, so it is NULL — adding a third value would make "not answered"
  -- and "answered: friendly" indistinguishable, which is the confusion the
  -- league_team_id null rule exists to avoid.
  --
  -- ⚠️ 'tbd' WAS ADDED 14 Aug 2026 AND DOES NOT CONTRADICT THE PARAGRAPH ABOVE.
  -- That refusal rejected a value which ALREADY had a representation; 'tbd' had
  -- none — there was no way to record "a real competitive fixture whose
  -- competition nobody has confirmed yet", and the only expressible answers were
  -- a guess or NULL, which renders as "a friendly". NULL keeps its exact meaning.
  -- Four states now: NULL = friendly (answered), 'tbd' = not answered, league,
  -- tournament. NOTHING MAY COLLAPSE 'tbd' INTO NULL.
  CONSTRAINT events_competition_type_check CHECK ((competition_type = ANY (ARRAY['league'::text, 'tournament'::text, 'tbd'::text]))),
  -- Added 2026-08-14. ⚠️ NOT TIDINESS. Without it a fixture could carry a real
  -- finish against the placeholder midnight a TBD start writes — which
  -- events_ends_after_starts accepts happily (00:00 < 15:30) and every calendar
  -- renders as a 15½-hour event. Fault-injected against the live database after
  -- applying: the insert is refused with a check_violation.
  CONSTRAINT events_no_end_when_time_tbd CHECK (((time_tbd = false) OR (ends_at IS NULL))),
  -- Added 2026-08-08 (event_end_time_and_notes). Note the `ends_at IS NULL OR`
  -- arm: a NULL end time stays legal, so the CHECK only ever fires on an end
  -- time that is actually before or equal to the start.
  CONSTRAINT events_ends_after_starts CHECK (((ends_at IS NULL) OR (ends_at > starts_at))),
  -- Re-captured 25 Aug 2026, with `tier` above.
  CONSTRAINT events_tier_check CHECK (((tier IS NULL) OR (tier = ANY (ARRAY['A'::text, 'B'::text, 'C'::text]))))
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

-- ── Added 2026-08-13, migration events_indexes_and_social_upload_gate ──
--
-- ⚠️ UNTIL TODAY THIS TABLE HAD NO INDEX ON `team_id` OR `starts_at` AT ALL,
-- and the two entries above are why that was easy to miss: the file records
-- two indexes on `events`, both partial, both on columns almost nothing
-- queries by. A reader skimming this block saw indexes and moved on.
--
-- Every hot read filters on team_id and/or club_id AND ranges over starts_at,
-- then ORDERS BY starts_at — src/data/events.js listEvents, the paged reads in
-- src/data/limits.js, public.calendar_events_for_token, the allocation grid,
-- the dashboard. On top of that the `event read` policy calls
-- private.is_attached_to_team() for every row the scan produces, and
-- `authenticated` carries statement_timeout = 8s. Unindexed, the far end of
-- that is a hard failure on the Schedule screen, not a slow one.
--
-- ⚠️ THIS PARTLY OVERTURNS THE "unindexed foreign keys are fine on an empty
-- table" RULING IN claude/state-of-play.md, and that ruling's own closing line
-- — "re-measure before citing this once real data lands" — is what asked for
-- it. It still stands for the ~24 *_by audit columns. It never covered
-- starts_at, which is not a foreign key.
--
-- ⚠️ events_club_starts_idx IS NOT REDUNDANT with events_team_starts_idx. A
-- composite index cannot serve a club-wide scan when its leading column
-- (team_id) is unconstrained, which is exactly the admin / all-squads path.
--
-- Captured from pg_indexes, not pasted from the migration.
CREATE INDEX events_team_starts_idx ON public.events USING btree (team_id, starts_at);
CREATE INDEX events_club_starts_idx ON public.events USING btree (club_id, starts_at);
CREATE INDEX events_league_team_id_idx ON public.events USING btree (league_team_id);

-- ── Added 2026-08-13, migration events_starts_index ──
--
-- ⚠️ THE events_club_starts_idx COMMENT ABOVE IS CORRECT AND THE INDEX IT
-- DESCRIBES DOES NOT DO THE JOB. Its own rule — a composite index cannot serve
-- a scan whose leading column is unconstrained — applies to itself on the
-- club-wide path: src/data/events.js listEvents sends no club_id predicate, and
-- the `event read` policy filters on team_id, never club_id. So the admin /
-- all-squads read was still a Seq Scan after that migration shipped.
--
-- Measured against ~4,000 seeded events in a rolled-back transaction on
-- production, as a real signed-in member with RLS live: Seq Scan + top-N
-- heapsort (11,630 buffers) became an Index Scan with NO Sort node (2,780).
-- The disappearing Sort is the result; wall time on this schema is inflated
-- ~4x and is not the evidence.
--
-- `id` is the second column for the same reason it is in listEvents' ORDER BY:
-- fetchAllPages uses .range() (OFFSET/LIMIT) and two events routinely share a
-- starts_at, so an index ending at starts_at would still leave a tie-break sort.
--
-- ⚠️ events_club_starts_idx IS LEFT IN PLACE, UNRESOLVED. The allocation grid
-- and public.calendar_events_for_token were not measured and either may
-- constrain club_id. Left as an open question rather than a guess.
--
-- Captured from pg_indexes, not pasted from the migration.
CREATE INDEX events_starts_idx ON public.events USING btree (starts_at, id);


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

-- Added 2026-08-09 (scale_indexes_and_availability_policy_merge).
-- The migration calls this "THE ONE REAL DEFECT" of the four. This is the
-- largest table in the schema — one row per player per event, ~70,000 rows
-- for a season at 700 players — and every "this player's availability" query
-- sequentially scanned all of them.
--
-- ⚠️ READ THIS BEFORE DECIDING IT IS REDUNDANT. Glance at the constraint list
-- above, see `availability_event_id_player_id_key UNIQUE (event_id,
-- player_id)`, and it is natural to think "player_id is already indexed" and
-- write the advisor's finding off as a false positive. It is not.
-- **Postgres cannot use a composite index when the LEADING column is absent
-- from the predicate.** That unique index is ordered (event_id, player_id):
-- it serves a lookup on event_id alone, and a lookup on the pair, and does
-- NOTHING for a lookup on player_id alone. Hence a separate single-column
-- index. This is the trap; it has caught people before.
--
-- ⚠️ Created WITHOUT `CONCURRENTLY`, deliberately — a concurrent build cannot
-- run inside a transaction and this table has single-digit rows today, so the
-- lock is milliseconds. **Once the real roster lands, any further index on
-- this table must use CONCURRENTLY and run OUTSIDE a migration.**
CREATE INDEX availability_player_id_idx ON public.availability USING btree (player_id);


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
  -- !! ADDED 16 Aug 2026 (invite_grant_status). The memberships.status an
  -- !! accepted invite creates. Read by public.accept_invite.
  -- !! ⛔ IT EXISTS BECAUSE accept_invite DID NOT NAME `status` AT ALL, so every
  -- !! accepted invite inherited the memberships default of 'active'. Invisible
  -- !! and harmless while only an admin-only form made invites; a safeguarding
  -- !! hole the moment public.invite_parent let a PARENT make one, because
  -- !! 'active' satisfies can_see_team and `player read` is squad-wide.
  -- !! ⚠️ DEFAULT 'active' IS LOAD-BEARING: InviteForm names no such column and
  -- !! must keep the behaviour it has always had.
  -- !! ⚠️ THE CHECK MIRRORS memberships_status_check ON PURPOSE. If the two ever
  -- !! disagree an invite is BURNT — accepted_at is stamped, then the membership
  -- !! insert fails on the constraint, half way through a SECURITY DEFINER call.
  grant_status text        NOT NULL DEFAULT 'active'::text,
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
  CONSTRAINT invites_role_check      CHECK ((role = ANY (ARRAY['admin'::text, 'coach'::text, 'manager'::text, 'medic'::text, 'parent'::text, 'player'::text]))),
  -- Re-captured 25 Aug 2026: the check the grant_status comment above
  -- described was live all along but had no constraint line here.
  CONSTRAINT invites_grant_status_check CHECK ((grant_status = ANY (ARRAY['active'::text, 'pending'::text])))
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
-- ⚠️ NO LONGER COMPLETE — 25 Aug 2026: live `public` holds 125 indexes and
-- this summary predates every table added since 9 Aug. The PER-TABLE index
-- lines throughout this file are the accurate half (verified against
-- pg_indexes on 25 Aug: every shared definition matches verbatim); treat
-- this list as the 9 Aug snapshot it says it is, not as an inventory.
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
-- ⚠️ REWRITTEN AGAIN later on 2026-08-09, after
-- `scale_indexes_and_availability_policy_merge` added four indexes. They are
-- merged into the list below and marked "(9 Aug)".
--
-- ⚠️ THE PARAGRAPH THAT USED TO SIT HERE IS NOW WRONG AND HAS BEEN REPLACED.
-- It read: "Still true: there is NO index on memberships.profile_id,
-- players.team_id, events.team_id or availability.event_id, all of which are
-- hit by every RLS policy evaluation. Recorded, not changed — the club's data
-- volume is small." Two of those four are now indexed.
--
-- What is still true, as at 9 Aug: there is NO index on
-- `memberships.profile_id`, `events.team_id`, or `availability.event_id`.
--   - availability.event_id is covered in practice by the LEADING column of
--     availability_event_id_player_id_key — that is exactly why the mirror
--     case (player_id) needed its own index and this one does not.
--   - memberships.profile_id is likewise the leading column of
--     memberships_unique_grant.
--   - events.team_id is genuinely unindexed. Recorded, not changed.
-- Also unindexed by choice: `club_id` on every table (cardinality 1 in a
-- single-club database — the planner would never choose it) and the audit
-- columns created_by / updated_by / decided_by. The performance advisor
-- reports these; the migration header explains why they are not defects.
-- ---------------------------------------------------------------------
--   access_requests_pkey                 UNIQUE (id)
--   access_requests_profile_id_key       UNIQUE (profile_id)
--   availability_event_id_player_id_key  UNIQUE (event_id, player_id)
--   availability_pkey                    UNIQUE (id)
--   availability_player_id_idx           btree (player_id)                (9 Aug)
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
--   memberships_player_id_idx            btree (player_id)                (9 Aug)
--   memberships_team_id_idx              btree (team_id)                  (9 Aug)
--   memberships_unique_grant             UNIQUE (profile_id, club_id, role, team_id, player_id) NULLS NOT DISTINCT
--   player_contacts_pkey                 UNIQUE (player_id)
--   player_parents_pkey                  UNIQUE (id)
--   player_parents_player_id_idx         btree (player_id)
--   players_pkey                         UNIQUE (id)
--   players_team_id_idx                  btree (team_id)                  (9 Aug)
--   profiles_pkey                        UNIQUE (id)
--   teams_pkey                           UNIQUE (id)


-- ---------------------------------------------------------------------
-- attendance  (who actually turned up — added 2026-08-10,
--              db/migrations/20260810_attendance.sql)
--
-- ⚠️ NOT `availability`, AND THE DISTINCTION IS THE WHOLE POINT. availability
-- is RSVP: INTENT, collected before the event, written by the player or their
-- parent (is_own_player). attendance is the FACT, recorded afterwards, and
-- only a coach may write it (can_edit_team). They share a grain — (event,
-- player) — and nothing else.
--
-- A column on `availability` would have been fewer objects and was rejected:
-- one row with two different write authorities on different columns is a
-- column-level GRANT problem, and db/schema/grants.sql exists because those
-- are invisible in every other file in this directory.
--
-- ⚠️ `status` HAS THREE VALUES AND THE THIRD IS LOAD-BEARING. An attendance
-- percentage is present / (present + absent); `excused` is excluded from BOTH
-- sides so a player away injured or on holiday is not ranked as uncommitted.
-- Deliberately no 'late' — a fourth state everyone wants and nobody can
-- define. Widening the CHECK is a one-line migration.
--
-- Both FKs CASCADE, unlike invites/invite_targets which are ON DELETE NO
-- ACTION and give claude/state-of-play.md its wipe-order note. A deleted event
-- or player should take its register rows with it, which keeps this table out
-- of that ordering problem entirely.
--
-- The UNIQUE is what makes the upsert in src/data/attendance.js safe: taking
-- the register twice CORRECTS the first answer rather than appending a second,
-- contradictory row for the same child.
-- ---------------------------------------------------------------------
CREATE TABLE public.attendance (
  id          uuid        NOT NULL DEFAULT gen_random_uuid(),
  event_id    uuid        NOT NULL,
  player_id   uuid        NOT NULL,
  status      text        NOT NULL,
  recorded_by uuid,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT attendance_pkey                    PRIMARY KEY (id),
  CONSTRAINT attendance_event_id_player_id_key  UNIQUE (event_id, player_id),
  CONSTRAINT attendance_status_check            CHECK (status = ANY (ARRAY['present'::text, 'absent'::text, 'excused'::text])),
  CONSTRAINT attendance_event_id_fkey           FOREIGN KEY (event_id)    REFERENCES events(id)   ON DELETE CASCADE,
  CONSTRAINT attendance_player_id_fkey          FOREIGN KEY (player_id)   REFERENCES players(id)  ON DELETE CASCADE,
  CONSTRAINT attendance_recorded_by_fkey        FOREIGN KEY (recorded_by) REFERENCES profiles(id) ON DELETE SET NULL
);
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;

-- The two access paths that exist from day one: the register loads every row
-- for ONE event, a player's history loads every row for ONE player.
CREATE INDEX attendance_event_id_idx  ON public.attendance (event_id);
CREATE INDEX attendance_player_id_idx ON public.attendance (player_id);

-- ---------------------------------------------------------------------
-- public.pitches — the managed pitch list (11 Aug 2026)
--
-- ⚠️ OVERTURNS the 5 Aug decision "free text beside Venue, no pitches table,
-- no clash detection". That was the right scope call for the MVP; Pitch
-- Management IS a job now, and the free text had already drifted — measured
-- 11 Aug, "Pitch 2" and "Pitch D2" both in use, plus "Clubhouse lawn".
--
-- ⚠️ `events.pitch` REMAINS TEXT WITH NO FOREIGN KEY, and this is the part
-- most likely to be "tidied" later. `Pitch TBD` is a deliberate placeholder
-- rather than a pitch (Jay's ruling: without it nobody can tell "not allocated
-- yet" from "the app didn't say") and it is more than half the rows. A foreign
-- key would force it to become either a fake pitch row or NULL, and NULL loses
-- the distinction the ruling exists to preserve. The list is a PICKER SOURCE,
-- not a constraint.
--
-- `is_active` retires a pitch without deleting it: deleting would leave last
-- season's events naming a pitch nobody can look up, and because the column is
-- text nothing would even complain.
-- ---------------------------------------------------------------------
-- ⚠️ REWRITTEN 11 Aug 2026 FROM THE LIVE CATALOGUE. This block and the one
-- below were previously the migration's own DDL pasted in — `CREATE TABLE IF
-- NOT EXISTS`, an inline unnamed `UNIQUE (club_id, name)`. Neither constraint
-- name appeared anywhere in this file, so a rename or a drop of either would
-- have diffed to nothing. Captured as found, per README.md.
CREATE TABLE public.pitches (
  id          uuid        NOT NULL DEFAULT gen_random_uuid(),
  club_id     uuid        NOT NULL,
  name        text        NOT NULL,
  sort_order  integer     NOT NULL DEFAULT 0,
  is_active   boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pitches_pkey             PRIMARY KEY (id),
  CONSTRAINT pitches_club_id_name_key UNIQUE (club_id, name),
  CONSTRAINT pitches_club_id_fkey     FOREIGN KEY (club_id) REFERENCES clubs(id) ON DELETE CASCADE
);
ALTER TABLE public.pitches ENABLE ROW LEVEL SECURITY;

-- ⚠️ The UNIQUE is on (club_id, name), so `is_active` is NOT part of it: a
-- retired pitch still holds its name and bringing it back is an UPDATE, not an
-- INSERT. Trying to re-add a retired pitch by name collides — which is correct,
-- and is why the setup screen offers "bring back" rather than "add" for one it
-- already has.
CREATE INDEX pitches_club_sort_idx ON public.pitches USING btree (club_id, sort_order, name);

-- ---------------------------------------------------------------------
-- public.pitch_requests — a coach asks, an admin allocates (11 Aug 2026)
--
-- ⚠️ ONE ROW PER EVENT, by unique constraint rather than by the app. A second
-- request for the same fixture is not a second question — it is the same
-- question asked twice, and two rows would mean two queue entries, two emails
-- and a race over which one gets answered. Re-asking after a decline moves
-- the existing row back to 'submitted'.
--
-- ⚠️ ALLOCATION WRITES `events.pitch` TOO, and the duplication is deliberate:
-- `events.pitch` is what the schedule, the fixture rows, the calendar feed and
-- the clash detector read. This table is the WORKFLOW; events.pitch is the
-- ANSWER. A request table nobody reads would leave the allocation invisible
-- everywhere it matters.
--
-- 'declined' and 'cancelled' exist because both happen and neither is a
-- deletion — a request that vanishes leaves the coach wondering whether they
-- ever sent it.
-- ---------------------------------------------------------------------
-- ⚠️ REWRITTEN 11 Aug 2026 FROM THE LIVE CATALOGUE — see the note on `pitches`
-- above. The status CHECK was inline and unnamed here; live it is
-- `pitch_requests_status_check`, and it is the constraint that decides which
-- states the answered-email trigger can ever see.
CREATE TABLE public.pitch_requests (
  id             uuid        NOT NULL DEFAULT gen_random_uuid(),
  event_id       uuid        NOT NULL,
  status         text        NOT NULL DEFAULT 'submitted'::text,
  needs_referee  boolean     NOT NULL DEFAULT false,
  note           text,
  decision_note  text,
  requested_by   uuid,
  requested_at   timestamptz NOT NULL DEFAULT now(),
  decided_by     uuid,
  decided_at     timestamptz,
  CONSTRAINT pitch_requests_pkey             PRIMARY KEY (id),
  CONSTRAINT pitch_requests_event_id_key     UNIQUE (event_id),
  CONSTRAINT pitch_requests_status_check     CHECK ((status = ANY (ARRAY['submitted'::text, 'allocated'::text, 'declined'::text, 'cancelled'::text]))),
  CONSTRAINT pitch_requests_event_id_fkey     FOREIGN KEY (event_id)     REFERENCES events(id)   ON DELETE CASCADE,
  CONSTRAINT pitch_requests_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES profiles(id) ON DELETE SET NULL,
  CONSTRAINT pitch_requests_decided_by_fkey   FOREIGN KEY (decided_by)   REFERENCES profiles(id) ON DELETE SET NULL
);
ALTER TABLE public.pitch_requests ENABLE ROW LEVEL SECURITY;

-- ⚠️ TWO TRIGGERS SIT ON THIS TABLE AND BOTH SEND EMAIL — see triggers.sql.
-- The answered one fires only on a status transition INTO 'allocated' or
-- 'declined', so widening the CHECK above without revisiting that WHEN clause
-- adds a state nobody is told about.
--
-- ⚠️ requested_by / decided_by are ON DELETE SET NULL, so deleting a profile
-- keeps the request and loses the name. Deliberate: the queue must not develop
-- holes when somebody leaves the club.
CREATE INDEX pitch_requests_status_idx ON public.pitch_requests USING btree (status, requested_at);

-- ---------------------------------------------------------------------
-- public.league_teams — the club's COMPETING teams (12 Aug 2026)
--
-- ⚠️ TWO DIFFERENT THINGS IN THIS CLUB ARE BOTH CALLED "TEAM", and confusing
-- them is the mistake this table exists to prevent:
--
--   SQUAD        public.teams   "U14B Contact"   a training group. What
--                                                players.team_id and
--                                                events.team_id point at.
--   LEAGUE TEAM  this table     "ADHQ2"          a competing entity in ONE
--                                                division. What Rugby Club
--                                                Management knows it as.
--
-- Jay, 11 Aug 2026: "each age group has 3 divisions in the league, a, b, and c,
-- clubs can have multiple teams at an age group". So one squad row can own
-- several rows here.
--
-- ⚠️ THE LETTER IN A SQUAD NAME IS GENDER, NOT DIVISION. "U14B Contact" is U14
-- BOYS; "U14G QR" is Girls. private.squad_expects_gender parses exactly that
-- suffix. Anything reading a division out of teams.name reads the gender
-- instead — which is the whole reason `division` is a column and not a parse.
--
-- ⚠️ A COLUMN ON teams WAS THE FIRST DESIGN AND WAS WITHDRAWN. One rcm_name per
-- squad cannot hold three league teams; it would have silently forced the club
-- to pick one.
--
-- `is_active` retires without deleting, the same reasoning public.pitches
-- records: deleting would leave last season's fixtures pointing at nothing.
-- ---------------------------------------------------------------------
CREATE TABLE public.league_teams (
  id          uuid        NOT NULL DEFAULT gen_random_uuid(),
  club_id     uuid        NOT NULL,
  team_id     uuid        NOT NULL,
  rcm_name    text        NOT NULL,
  division    text,
  is_active   boolean     NOT NULL DEFAULT true,
  sort_order  integer     NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT league_teams_pkey                 PRIMARY KEY (id),
  -- ⚠️ PER SQUAD, NOT PER CLUB, and it was per club for one day (12 Aug 2026,
  -- migration league_team_name_unique_per_squad). EVERY AGE GROUP HAS ITS OWN
  -- ADHQ1, ADHQ2, ADHQ3 — one per division — so the name only identifies a
  -- team WITHIN an age group. The original `(club_id, rcm_name)` meant the club
  -- could have exactly one ADHQ1 anywhere, which blocked the second age group
  -- Jay tried to set up. `team_id` already implies the club (teams.club_id is
  -- NOT NULL), so club_id is not repeated here.
  -- ⚠️ Still refuses the same name twice in ONE squad: two ADHQ1s under U14B
  -- are indistinguishable in the event form's picker, and picking the wrong one
  -- files a fixture under the wrong team.
  CONSTRAINT league_teams_team_id_rcm_name_key UNIQUE (team_id, rcm_name),
  CONSTRAINT league_teams_club_id_fkey         FOREIGN KEY (club_id) REFERENCES clubs(id) ON DELETE CASCADE,
  CONSTRAINT league_teams_team_id_fkey         FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
  -- ⚠️ NULLABLE ON PURPOSE. A club can enter a team that is not in a lettered
  -- division, and forcing a letter would invent data. Display only, never a gate.
  CONSTRAINT league_teams_division_check       CHECK ((division = ANY (ARRAY['A'::text, 'B'::text, 'C'::text])))
);
ALTER TABLE public.league_teams ENABLE ROW LEVEL SECURITY;

CREATE INDEX league_teams_team_idx ON public.league_teams USING btree (team_id, sort_order, rcm_name);

-- ---------------------------------------------------------------------
-- public.match_sheets / match_sheet_slots / match_sheet_cards
-- Added 2026-08-12 (migration `match_sheets`). The RCM Official Match
-- Result Sheet - a GOVERNING-BODY form, one per team per game.
-- ---------------------------------------------------------------------
CREATE TABLE public.match_sheets (
  id             uuid        NOT NULL DEFAULT gen_random_uuid(),
  -- UNIQUE: a second sheet for one fixture is not a second document, it is
  -- the same one filed twice - and two would mean two submissions to RCM.
  event_id       uuid        NOT NULL,
  -- ON DELETE SET NULL, never cascade: deleting a league team must cost the
  -- sheet its TEAM: line, never the sheet.
  league_team_id uuid,
  captain_name   text,
  manager_name   text,
  -- TEXT ON THE SHEET, NOT JOINED to profiles - the same rule
  -- match_sheet_slots.full_name carries beside a live player_id. Prefilled from
  -- the signed-in profile's full_name/phone and typed over freely: a manager
  -- fills the form and a coach signs it. Added 2026-08-12
  -- (20260812_match_sheet_manager_phone.sql).
  manager_phone  text,
  -- ⚠️ score_us / tries_us / score_them / tries_them WERE HERE AND GO -
  -- 20260812_drop_match_sheet_scores.sql. The fixture is the single source of
  -- the score; public.events carries the components and derives result_us /
  -- result_them from them. All four were null on the only sheet that existed,
  -- measured the same day.
  --
  -- ⚠️ THE DROP IS SEQUENCED AGAINST THE DEPLOY, NOT AGAINST THE MERGE. Applied
  -- early on 12 Aug it broke saving on the live site - the deployed bundle still
  -- sent all four, and PostgREST answers a write naming a missing column with
  -- 400 / PGRST204. It was undone, and re-applied once the new bundle was
  -- actually serving.
  -- ✅ RE-APPLIED AND VERIFIED 12 Aug 2026 (`drop_match_sheet_scores_after_deploy`).
  -- All four now answer 400 / 42703 through PostgREST while `manager_phone` and
  -- `id` answer 200 - a control on both sides, so the check distinguishes absent
  -- from merely broken. This capture and live agree.
  medical_notes  text,
  -- Column comment as stored: "complete" means the coach pressed Submit and
  -- the sheet is ready to send to RCM. It does NOT mean RCM received it.
  status         text        NOT NULL DEFAULT 'draft',
  submitted_at   timestamptz,
  created_by     uuid,
  updated_by     uuid,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT match_sheets_pkey         PRIMARY KEY (id),
  CONSTRAINT match_sheets_event_id_key UNIQUE (event_id),
  CONSTRAINT match_sheets_event_id_fkey FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
  CONSTRAINT match_sheets_league_team_id_fkey FOREIGN KEY (league_team_id) REFERENCES league_teams(id) ON DELETE SET NULL,
  CONSTRAINT match_sheets_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL,
  CONSTRAINT match_sheets_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES profiles(id) ON DELETE SET NULL,
  CONSTRAINT match_sheets_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'complete'::text])))
);
ALTER TABLE public.match_sheets ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.match_sheet_slots (
  id             uuid     NOT NULL DEFAULT gen_random_uuid(),
  match_sheet_id uuid     NOT NULL,
  -- THE POSITION, NOT A SHIRT NUMBER. 1 is loosehead; 16-22 are the
  -- replacements whose front-row cover the FR column identifies - a SAFETY
  -- rule on the form. This club deliberately holds no squad numbers.
  slot           smallint NOT NULL,
  -- ON DELETE SET NULL so a filed sheet survives a player leaving the club.
  player_id      uuid,
  -- TEXT EVEN WHEN player_id IS SET. The form demands the name "as per
  -- registration", and a filed sheet must still say what was filed after a
  -- player is renamed, moved or removed.
  full_name      text     NOT NULL,
  front_row      boolean  NOT NULL DEFAULT false,
  CONSTRAINT match_sheet_slots_pkey PRIMARY KEY (id),
  CONSTRAINT match_sheet_slots_sheet_slot_key UNIQUE (match_sheet_id, slot),
  CONSTRAINT match_sheet_slots_match_sheet_id_fkey FOREIGN KEY (match_sheet_id) REFERENCES match_sheets(id) ON DELETE CASCADE,
  CONSTRAINT match_sheet_slots_player_id_fkey FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE SET NULL,
  CONSTRAINT match_sheet_slots_slot_check CHECK (((slot >= 1) AND (slot <= 22)))
);
ALTER TABLE public.match_sheet_slots ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.match_sheet_cards (
  id             uuid        NOT NULL DEFAULT gen_random_uuid(),
  match_sheet_id uuid        NOT NULL,
  half           smallint,
  minute         smallint,
  colour         text,
  slot           smallint,
  full_name      text,
  reason         text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT match_sheet_cards_pkey PRIMARY KEY (id),
  CONSTRAINT match_sheet_cards_match_sheet_id_fkey FOREIGN KEY (match_sheet_id) REFERENCES match_sheets(id) ON DELETE CASCADE,
  CONSTRAINT match_sheet_cards_colour_check CHECK ((colour = ANY (ARRAY['yellow'::text, 'red'::text]))),
  CONSTRAINT match_sheet_cards_half_check CHECK (((half IS NULL) OR (half = ANY (ARRAY[1, 2])))),
  CONSTRAINT match_sheet_cards_slot_check CHECK (((slot IS NULL) OR ((slot >= 1) AND (slot <= 22))))
);
ALTER TABLE public.match_sheet_cards ENABLE ROW LEVEL SECURITY;

CREATE INDEX match_sheet_slots_sheet_idx ON public.match_sheet_slots USING btree (match_sheet_id, slot);
CREATE INDEX match_sheet_cards_sheet_idx ON public.match_sheet_cards USING btree (match_sheet_id);
CREATE INDEX match_sheets_status_idx     ON public.match_sheets      USING btree (status, event_id);


-- ---------------------------------------------------------------------
-- public.social_ideas  (captured 12 Aug 2026)
--
-- Post ideas submitted by any member; the Social Media Management screens mark
-- and remove them. Migration: db/migrations/20260812_social_ideas.sql.
-- Ruling: claude/decisions/2026-08-12-social-media-management.md.
--
-- ⚠️ NOT a photo library. It never touches `player-photos`; images here were
-- chosen and uploaded by a member for publication. See the ruling.
--
-- ⚠️ NO UNIQUE CONSTRAINT, unlike pitch_requests. Five people sending photos
-- of the same match is the feature working, not a duplicate.
-- ---------------------------------------------------------------------
CREATE TABLE public.social_ideas (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL,
  event_id uuid,
  submitted_by uuid NOT NULL,
  body text NOT NULL,
  photo_path text,
  from_staff boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'new'::text,
  decision_note text,
  decided_by uuid,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Constraints, as captured — all NAMED, so a drop or rename diffs to something.
ALTER TABLE public.social_ideas ADD CONSTRAINT social_ideas_pkey PRIMARY KEY (id);
ALTER TABLE public.social_ideas ADD CONSTRAINT social_ideas_body_check CHECK ((length(btrim(body)) > 0));
ALTER TABLE public.social_ideas ADD CONSTRAINT social_ideas_status_check CHECK ((status = ANY (ARRAY['new'::text, 'used'::text, 'dismissed'::text])));
ALTER TABLE public.social_ideas ADD CONSTRAINT social_ideas_club_id_fkey FOREIGN KEY (club_id) REFERENCES clubs(id) ON DELETE CASCADE;
ALTER TABLE public.social_ideas ADD CONSTRAINT social_ideas_event_id_fkey FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE SET NULL;
ALTER TABLE public.social_ideas ADD CONSTRAINT social_ideas_submitted_by_fkey FOREIGN KEY (submitted_by) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE public.social_ideas ADD CONSTRAINT social_ideas_decided_by_fkey FOREIGN KEY (decided_by) REFERENCES profiles(id) ON DELETE SET NULL;

CREATE INDEX social_ideas_status_idx ON public.social_ideas USING btree (club_id, status, created_at DESC);
CREATE INDEX social_ideas_event_idx ON public.social_ideas USING btree (event_id);

ALTER TABLE public.social_ideas ENABLE ROW LEVEL SECURITY;

-- ── scoring components, 12 Aug 2026 (20260812_scoring_components.sql) ────────
--
-- ⚠️ NULL MEANS "NOT RECORDED", NEVER ZERO, and there is deliberately NO
-- DEFAULT. A side that scored no penalties and a side whose penalties nobody
-- wrote down are different facts; a default 0 would make every pre-existing
-- fixture claim it scored nothing, retroactively.
--
-- result_us / result_them are DERIVED from these by the
-- events_result_from_components trigger -- but only for a side that has at
-- least one component recorded. See triggers.sql.
alter table public.events
  add column tries_us smallint,
  add column conversions_us smallint,
  add column penalties_us smallint,
  add column drops_us smallint,
  add column tries_them smallint,
  add column conversions_them smallint,
  add column penalties_them smallint,
  add column drops_them smallint;

-- The club's per-squad scoring set. NULL means "use the age-band default".
--
-- ⚠️ A COLUMN, NEVER THE SQUAD'S NAME -- the same rule teams.is_senior and
-- teams.self_registration_allowed carry: renaming a squad must not silently
-- change what may be recorded against it.
alter table public.teams
  add column scoring_kinds text[];


-- ---------------------------------------------------------------------
-- public.photo_backup_runs  (13 Aug 2026, 20260813_photo_backup.sql)
--
-- One row per run of the backup-player-photos edge function, which mirrors the
-- `player-photos` bucket into Cloudflare R2. See
-- claude/runbooks/player-photo-backup.md.
--
-- ⚠️ THIS TABLE IS THE ONLY EVIDENCE THE BACKUP IS RUNNING, and that is not
-- belt-and-braces. pg_cron calls the function through pg_net, and pg_net never
-- reads the response -- the same property RESTORE.md records for the two mail
-- functions, where it is survivable because the in-app queue is the real record.
-- A backup has no second record. Without a row here, a mirror that has been
-- failing for six weeks and a mirror that is working look identical from every
-- screen in the app.
--
-- ⚠️ THE ROW IS OPENED BEFORE THE WORK AND CLOSED AFTER IT, so a null
-- finished_at on an old row means the run started and vanished -- a timeout, a
-- deploy mid-run, or R2 hanging. That state is unreachable if the row is only
-- written at the end, which is why it is not.
--
-- ⚠️ `more_to_do` EXISTS BECAUSE OF THE "NO SILENT CAPS" RULE. The function
-- stops at 250 objects or 100 seconds, whichever comes first; a run that copied
-- its maximum and stopped must not read as a run that finished the job.
--
-- ⚠️ `unrecognised` COUNTS KEYS OUTSIDE THE <player_id>/<timestamp>.<ext> shape.
-- They are still copied -- a backup that quietly declines to copy what it does
-- not recognise has a hole in it shaped exactly like the thing nobody predicted.
-- The count is so an unexpected shape is visible instead of silent.
-- ---------------------------------------------------------------------
CREATE TABLE public.photo_backup_runs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  bucket text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  source_objects integer,
  backup_objects integer,
  copied integer NOT NULL DEFAULT 0,
  failed integer NOT NULL DEFAULT 0,
  unrecognised integer NOT NULL DEFAULT 0,
  more_to_do boolean NOT NULL DEFAULT false,
  error text,
  -- ⚠️ THE ONLY COLUMN HERE WHOSE NON-ZERO VALUE IS A FAULT. `unrecognised` and
  -- `more_to_do` are informational and `only_in_backup` is the feature working.
  -- A mismatch means the R2 copy is NOT the Supabase object -- compared by MD5,
  -- which both sides report as their ETag. The function counts "could not check"
  -- as a mismatch, so "we did not verify" cannot read as "we verified and it was
  -- fine". NULL means the run predates the column, not that it passed.
  etag_mismatches integer
);

ALTER TABLE public.photo_backup_runs ADD CONSTRAINT photo_backup_runs_pkey PRIMARY KEY (id);


-- ---------------------------------------------------------------------
-- public.photo_orphan_scans  (16 Aug 2026, 20260816_photo_orphan_scan.sql)
--
-- One row per bucket per run of public.scan_photo_orphans(), scheduled nightly
-- by pg_cron. Counts storage objects that nothing references.
--
-- ⚠️ IT REPORTS. IT DOES NOT DELETE, and that is Jay's ruling rather than an
-- unfinished feature. `staff-photos` is mirrored NOWHERE — backup-player-photos
-- pins SOURCE_BUCKET = 'player-photos' — so a scheduled delete on it would be
-- unrecoverable. **Do not "finish" this by adding one.**
--
-- ⚠️ AND SQL COULD NOT DELETE EVEN IF ASKED. storage.objects carries a
-- `protect_delete` trigger raising 42501 on any direct DELETE; the
-- storage.allow_delete_query escape hatch drops the ROW and leaves the FILE.
-- See RESTORE.md.
--
-- ⚠️ `missing_files` IS THE MORE SERIOUS COLUMN. `orphaned` counts files nobody
-- points at — untidy, and a photograph outliving its purpose. `missing_files`
-- counts ROWS pointing at an object that is GONE, which renders as a broken face
-- on a parent's screen and is what an over-eager cleanup produces. It should
-- never be anything but zero.
CREATE TABLE public.photo_orphan_scans (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  scanned_at timestamptz NOT NULL DEFAULT now(),
  bucket text NOT NULL,
  objects integer NOT NULL,
  referenced integer NOT NULL,
  orphaned integer NOT NULL,
  missing_files integer NOT NULL,
  -- Capped at fifty by the function, so a human can act without re-deriving the
  -- set. Keys are `<uuid>/<timestamp>.<ext>` — no names.
  orphan_keys text[] NOT NULL DEFAULT '{}'::text[]
);

ALTER TABLE public.photo_orphan_scans ADD CONSTRAINT photo_orphan_scans_pkey PRIMARY KEY (id);

CREATE INDEX photo_backup_runs_started_idx ON public.photo_backup_runs USING btree (started_at DESC);

ALTER TABLE public.photo_backup_runs ENABLE ROW LEVEL SECURITY;

-- ⚠️ NO FOREIGN KEY ANYWHERE ON THIS TABLE, deliberately. It records what a
-- machine did, not what a member did; there is nobody to point at. It also means
-- a run row survives every cascade in the schema, which is the point of a log.


-- =====================================================================
-- LOGICAL REPLICATION PUBLICATIONS  (new capture category, 13 Aug 2026)
-- =====================================================================
--
-- ⚠️ THIS DIRECTORY DID NOT CAPTURE PUBLICATIONS AT ALL UNTIL TODAY, AND THAT
-- BLIND SPOT HID A FEATURE THAT HAD NEVER ONCE WORKED. src/data/events.js has
-- subscribed to postgres_changes since the app was built; public.events was not
-- in supabase_realtime, so Postgres emitted nothing and the socket sat open
-- receiving nothing. Two features -- Schedule/Dashboard auto-refresh and the
-- live availability list -- were silently inert, and no file here would have
-- shown it. The code was read many times; the configuration feeding it was not.
--
-- ⚠️ AND THE FAILURE MODE IS SILENT IN BOTH DIRECTIONS. If this publication is
-- ever emptied again, every realtime feature goes quiet with no error anywhere,
-- in the app or in the logs. A capture is the only thing that would diff it.
--
-- Membership is changed with ALTER PUBLICATION, not by anything in a table
-- definition, which is why it belongs in its own section rather than beside
-- events above.
--
-- Captured 13 Aug 2026 from pg_publication and pg_publication_tables, after
-- 20260813_realtime_publication_events.sql was applied.
--
--   pg_publication: two rows, both puballtables = false, both publishing
--   insert/update/delete/truncate --
--     supabase_realtime
--     supabase_realtime_messages_publication   (Realtime's own internal
--                                               messages_* partitions; not ours,
--                                               and deliberately not enumerated)
--
-- ⚠️ THE PARAGRAPH BELOW WAS AN INVERTED STANDING CLAIM BY 25 Aug 2026 — the
-- exact failure class this file's own 7 Aug warning describes. It read
-- "EXACTLY ONE of our tables is published; availability is NOT, and that is
-- a decision". Measured on 25 Aug: supabase_realtime holds SIX tables —
-- events, availability, announcements, feedback, messages, conversations —
-- so availability WAS later published (presumably with the delete gap dealt
-- with or accepted) and four more joined with their features. The capture
-- below is the live membership; the old prose is kept struck as the record
-- of the earlier ruling.

ALTER PUBLICATION supabase_realtime ADD TABLE public.events;
ALTER PUBLICATION supabase_realtime ADD TABLE public.availability;
ALTER PUBLICATION supabase_realtime ADD TABLE public.announcements;
ALTER PUBLICATION supabase_realtime ADD TABLE public.feedback;
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;


-- ---------------------------------------------------------------------
-- public.announcements  (captured 14 Aug 2026)
-- Migration: db/migrations/20260814_announcements.sql
--
-- Constraints and indexes captured from pg_constraint / pg_indexes, so every
-- one is named here exactly as live names it. !! Pasting the migration's inline
-- unnamed CHECKs is what happened to `pitches` on 11 Aug and produced a file
-- that looked complete while a rename would have diffed to nothing.
--
-- !! team_id NULL MEANS THE WHOLE CLUB. A column, never the squad's name --
-- the same rule teams.is_senior and teams.self_registration_allowed carry.
--
-- !! THERE IS DELIBERATELY NO (club_id, created_at) INDEX. events_club_starts_idx
-- was added on 13 Aug for exactly this shape and does NOT serve the path it was
-- added for: the client sends no club_id predicate (one club) and the read
-- policy filters on team membership, so the leading column is unconstrained and
-- Postgres cannot use it. 20260813_events_starts_index.sql is that fix, and
-- announcements_created_idx leads on created_at for the same reason.
-- ---------------------------------------------------------------------
CREATE TABLE public.announcements (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id    uuid NOT NULL,
  team_id    uuid,
  author_id  uuid NOT NULL,
  title      text NOT NULL,
  body       text NOT NULL,
  pinned     boolean NOT NULL DEFAULT false,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz,
  -- Re-captured 25 Aug 2026: an announcement scoped to one group chat.
  group_id   uuid
);
ALTER TABLE public.announcements ADD CONSTRAINT announcements_club_id_fkey   FOREIGN KEY (club_id)   REFERENCES clubs(id)    ON DELETE CASCADE;
ALTER TABLE public.announcements ADD CONSTRAINT announcements_team_id_fkey   FOREIGN KEY (team_id)   REFERENCES teams(id)    ON DELETE CASCADE;
ALTER TABLE public.announcements ADD CONSTRAINT announcements_author_id_fkey FOREIGN KEY (author_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE public.announcements ADD CONSTRAINT announcements_title_check CHECK ((length(btrim(title)) > 0));
ALTER TABLE public.announcements ADD CONSTRAINT announcements_body_check  CHECK ((length(btrim(body))  > 0));
CREATE INDEX announcements_created_idx      ON public.announcements USING btree (created_at DESC, id);
CREATE INDEX announcements_team_created_idx ON public.announcements USING btree (team_id, created_at DESC);
CREATE INDEX announcements_group_id_idx     ON public.announcements USING btree (group_id) WHERE (group_id IS NOT NULL);

-- ---------------------------------------------------------------------
-- public.announcement_reads  (captured 14 Aug 2026)
--
-- !! THE PRIMARY KEY IS THE DEDUPLICATION. Marking a notice read twice is the
-- normal case -- opening the board again does it -- so this is an upsert target
-- rather than something the client is trusted to call once.
-- ---------------------------------------------------------------------
CREATE TABLE public.announcement_reads (
  announcement_id uuid NOT NULL,
  profile_id      uuid NOT NULL,
  read_at         timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.announcement_reads ADD CONSTRAINT announcement_reads_pkey PRIMARY KEY (announcement_id, profile_id);
ALTER TABLE public.announcement_reads ADD CONSTRAINT announcement_reads_announcement_id_fkey FOREIGN KEY (announcement_id) REFERENCES announcements(id) ON DELETE CASCADE;
ALTER TABLE public.announcement_reads ADD CONSTRAINT announcement_reads_profile_id_fkey      FOREIGN KEY (profile_id)      REFERENCES profiles(id)      ON DELETE CASCADE;
CREATE INDEX announcement_reads_profile_idx ON public.announcement_reads USING btree (profile_id);


-- ---------------------------------------------------------------------
-- public.lineups / public.lineup_players  (captured 14 Aug 2026)
--
-- ⚠️ NOT THE RCM MATCH SHEET. See db/migrations/20260814_match_lineups.sql:
-- match_sheets is a document FILED after the match; a lineup is a plan made
-- before it. `player_id` CASCADES here and there is no full_name snapshot, both
-- opposite to match_sheet_slots, on purpose.
--
-- ⚠️ THERE IS DELIBERATELY NO UNIQUE INDEX ON lineups.event_id. That is what
-- lets a squad field two teams at a tournament, or play several games in a day.
-- The migration's guard FAILS if one ever appears.
--
-- ⚠️ players_per_side AND squad_size ARE BOTH GUIDES, NOT GATES. Nothing ties
-- either to the number of rows in lineup_players and the screen must never
-- refuse a pick because of them.
-- ---------------------------------------------------------------------
CREATE TABLE public.lineups (
  id               uuid        NOT NULL DEFAULT gen_random_uuid(),
  event_id         uuid        NOT NULL,
  label            text,
  players_per_side smallint,
  -- Added 2026-08-14 (lineup_squad_size). Starters PLUS replacements.
  squad_size       smallint,
  notes            text,
  created_by       uuid,
  updated_by       uuid,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lineups_pkey PRIMARY KEY (id),
  CONSTRAINT lineups_event_id_fkey   FOREIGN KEY (event_id)   REFERENCES events(id)   ON DELETE CASCADE,
  CONSTRAINT lineups_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL,
  CONSTRAINT lineups_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES profiles(id) ON DELETE SET NULL,
  CONSTRAINT lineups_players_per_side_check CHECK ((players_per_side IS NULL) OR ((players_per_side >= 1) AND (players_per_side <= 30))),
  CONSTRAINT lineups_squad_size_check       CHECK ((squad_size IS NULL) OR ((squad_size >= 1) AND (squad_size <= 40)))
);
ALTER TABLE public.lineups ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.lineup_players (
  id         uuid     NOT NULL DEFAULT gen_random_uuid(),
  lineup_id  uuid     NOT NULL,
  -- ⚠️ CASCADE, not SET NULL, and no full_name beside it — see above.
  player_id  uuid     NOT NULL,
  role       text     NOT NULL DEFAULT 'starter',
  -- Free text on purpose: the offerable list lives in src/lib/positions.js and
  -- a CHECK here would be a second copy that drifts.
  position   text,
  sort_order smallint NOT NULL DEFAULT 0,
  CONSTRAINT lineup_players_pkey PRIMARY KEY (id),
  CONSTRAINT lineup_players_lineup_id_fkey FOREIGN KEY (lineup_id) REFERENCES lineups(id) ON DELETE CASCADE,
  CONSTRAINT lineup_players_player_id_fkey FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE,
  CONSTRAINT lineup_players_lineup_player_key UNIQUE (lineup_id, player_id),
  CONSTRAINT lineup_players_role_check CHECK ((role = ANY (ARRAY['starter'::text, 'replacement'::text])))
);
ALTER TABLE public.lineup_players ENABLE ROW LEVEL SECURITY;

CREATE INDEX lineups_event_idx         ON public.lineups        USING btree (event_id);
CREATE INDEX lineup_players_lineup_idx ON public.lineup_players USING btree (lineup_id, sort_order);


-- ---------------------------------------------------------------------
-- public.player_positions / public.player_units    CAPTURED 2026-08-25
--
-- ⚠️ CAPTURED ELEVEN DAYS LATE. player_positions shipped 14 Aug
-- (player_positions migration) and was never captured here — found while
-- capturing player_units, which shipped today. Both verified against
-- information_schema on 25 Aug 2026, AFTER positions_staff_only and
-- drop_players_position_unit ran.
--
-- STAFF-ONLY, both of them, since 25 Aug 2026 — Jay: "positions should only
-- be viewable and editable by staff", REVERSING the 14 Aug squad-readable
-- ruling the player_positions migration header records. players.position and
-- players.unit were backfilled into these and DROPPED. First position row
-- (sort_order 0) is the PRIMARY. No CHECK on position's value: the offerable
-- list lives in src/lib/positions.js and a constraint here would be a second
-- copy that drifts.

CREATE TABLE public.player_positions (
  id         uuid     NOT NULL DEFAULT gen_random_uuid(),
  player_id  uuid     NOT NULL,
  position   text     NOT NULL,
  sort_order smallint NOT NULL DEFAULT 0,
  CONSTRAINT player_positions_pkey PRIMARY KEY (id),
  CONSTRAINT player_positions_player_id_fkey FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE,
  CONSTRAINT player_positions_player_position_key UNIQUE (player_id, position)
);
ALTER TABLE public.player_positions ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.player_units (
  player_id uuid NOT NULL,
  unit      text NOT NULL,
  CONSTRAINT player_units_pkey PRIMARY KEY (player_id),
  CONSTRAINT player_units_player_id_fkey FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE,
  CONSTRAINT player_units_unit_check CHECK ((unit = ANY (ARRAY['forward'::text, 'back'::text])))
);
ALTER TABLE public.player_units ENABLE ROW LEVEL SECURITY;

CREATE INDEX player_positions_player_idx ON public.player_positions USING btree (player_id, sort_order);


-- ---------------------------------------------------------------------
-- public.player_private                                 ADDED 2026-08-16
--
-- Per-player fields that must NOT be squad-readable. Currently one: a date of
-- birth. Jay, 16 Aug 2026: "i think we need to have date of birth".
--
-- ⚠️ THIS REVERSES A STANDING RULING. src/lib/ageGroup.js states that "the club
-- does not hold DOBs in this app" and derives age from squad names. That was
-- correct while nothing needed a real age. It is now HISTORY plus a pointer,
-- not current instruction — but nothing has been re-pointed at this column yet.
--
-- ⛔ ADMISSION RULE, and it is the whole reason the table exists: a field
-- belongs here if A PARENT OF A TEAM-MATE MUST NOT SEE IT. Anything they may see
-- stays on public.players. A column on players cannot be hidden from them by any
-- mechanism this schema has — `player read` is squad-wide and RLS grants rows,
-- not columns.
--
-- ⚠️ PRIMARY KEY IS player_id. One row per child, so two contradictory
-- birthdays cannot exist and there is no ordering question to get wrong.
-- ON DELETE CASCADE: a deleted player takes their private row with them.
--
-- Policies in policies.sql (3). Grants are Supabase's defaults for a new public
-- table — verified after applying rather than assumed: `authenticated` holds
-- SELECT/INSERT/UPDATE/DELETE, `anon` holds nothing.
-- ---------------------------------------------------------------------
CREATE TABLE public.player_private (
  player_id     uuid        NOT NULL,
  date_of_birth date,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz,
  -- Re-captured 25 Aug 2026. plays_up_confirmed_at (17 Aug, plays-up
  -- confirmation) had NO line anywhere in this file; the three staff_dm
  -- columns (squad chat phase 3, 23 Aug) were recorded only in a trailing
  -- comment at the end of this file, which this capture replaces.
  plays_up_confirmed_at timestamptz,
  staff_dm_opt_in    boolean NOT NULL DEFAULT false,
  staff_dm_opt_in_by uuid,
  staff_dm_opt_in_at timestamptz,
  CONSTRAINT player_private_pkey PRIMARY KEY (player_id),
  CONSTRAINT player_private_player_id_fkey FOREIGN KEY (player_id)
    REFERENCES public.players(id) ON DELETE CASCADE,
  CONSTRAINT player_private_staff_dm_opt_in_by_fkey FOREIGN KEY (staff_dm_opt_in_by)
    REFERENCES public.profiles(id) ON DELETE SET NULL,
  -- Bounds, not a format check. A future birthday and a 120-year-old under-12
  -- are both typos, and both are refused at the database rather than in a form
  -- a second writer could bypass.
  CONSTRAINT player_private_dob_sane
    CHECK ((date_of_birth IS NULL)
           OR ((date_of_birth > '1900-01-01'::date) AND (date_of_birth <= CURRENT_DATE)))
);

-- ---------------------------------------------------------------------
-- Training plans (21 Aug 2026, 20260821_training_plans.sql)
--
-- drill → session_template (+blocks) → training_session (+blocks, COPIED from
-- the template at publish so a coach's edit touches one night, not fifteen
-- squads). training_focus is a label over a date range and gates nothing.
-- Reasoning: claude/specs/2026-08-21-training-plans-dashboard-design.md.
-- ⚠️ drill_id is ON DELETE RESTRICT in BOTH block tables: retire via is_active.
-- ⚠️ training_sessions.event_id is UNIQUE; coach_edited_at is what
-- publish_training reads to leave a session alone.
-- Captured from the migration text; constraint names are Postgres defaults.
-- ---------------------------------------------------------------------
CREATE TABLE public.drills (
  id               uuid primary key default gen_random_uuid(),
  club_id          uuid not null references public.clubs(id) on delete cascade,
  title            text not null,
  summary          text,
  body             text,
  source_name      text,
  source_url       text,
  minutes          smallint not null default 10 check (minutes between 1 and 120),
  category         text not null check (category in ('warm_up','skill','game','conditioning','cool_down')),
  min_age          smallint check (min_age between 4 and 19),
  max_age          smallint check (max_age between 4 and 19),
  requires_contact boolean not null default false,
  is_active        boolean not null default true,
  created_by       uuid references public.profiles(id),
  created_at       timestamptz not null default now(),
  constraint drills_age_order check (min_age is null or max_age is null or min_age <= max_age)
);
ALTER TABLE public.drills ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.session_templates (
  id               uuid primary key default gen_random_uuid(),
  club_id          uuid not null references public.clubs(id) on delete cascade,
  name             text not null,
  min_age          smallint check (min_age between 4 and 19),
  max_age          smallint check (max_age between 4 and 19),
  requires_contact boolean not null default false,
  total_minutes    smallint not null default 0,
  notes            text,
  is_active        boolean not null default true,
  created_by       uuid references public.profiles(id),
  created_at       timestamptz not null default now(),
  constraint session_templates_age_order check (min_age is null or max_age is null or min_age <= max_age)
);
ALTER TABLE public.session_templates ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.session_template_blocks (
  id          uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.session_templates(id) on delete cascade,
  position    smallint not null,
  drill_id    uuid not null references public.drills(id) on delete restrict,
  minutes     smallint not null check (minutes between 1 and 120),
  coach_note  text,
  unique (template_id, position)
);
ALTER TABLE public.session_template_blocks ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.training_focus (
  id         uuid primary key default gen_random_uuid(),
  club_id    uuid not null references public.clubs(id) on delete cascade,
  team_id    uuid not null references public.teams(id) on delete cascade,
  title      text not null,
  starts_on  date not null,
  ends_on    date not null,
  notes      text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  constraint training_focus_dates check (ends_on >= starts_on)
);
ALTER TABLE public.training_focus ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.training_sessions (
  id              uuid primary key default gen_random_uuid(),
  event_id        uuid not null unique references public.events(id) on delete cascade,
  template_id     uuid references public.session_templates(id) on delete set null,
  published_at    timestamptz not null default now(),
  coach_edited_at timestamptz,
  notes           text
);
ALTER TABLE public.training_sessions ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.training_session_blocks (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.training_sessions(id) on delete cascade,
  position   smallint not null,
  drill_id   uuid not null references public.drills(id) on delete restrict,
  minutes    smallint not null check (minutes between 1 and 120),
  coach_note text,
  unique (session_id, position)
);
ALTER TABLE public.training_session_blocks ENABLE ROW LEVEL SECURITY;



-- ---------------------------------------------------------------------
-- public.messages / public.channel_settings / public.message_reads
--   (captured 23 Aug 2026, from a rolled-back apply of
--    db/migrations/20260823_squad_chat.sql — re-verify after the real apply)
--
-- Squad chat, phase 1. team_id is the boundary (NULL = whole club), exactly
-- as for announcements. club_id, author_id, author_role and author_title are
-- stamped by messages_provenance and are not client-settable. A reply
-- (parent_id set) inherits its parent's team_id from the same trigger.
-- Soft delete only: deleted_at is set and messages_touch blanks the body.
-- ---------------------------------------------------------------------
CREATE TABLE public.messages (
  id            uuid        NOT NULL DEFAULT gen_random_uuid(),
  club_id       uuid        NOT NULL,
  team_id       uuid,
  channel       text        NOT NULL DEFAULT 'squad',
  parent_id     uuid,
  event_id      uuid,
  author_id     uuid        NOT NULL,
  author_role   text,
  author_title  text,
  body          text        NOT NULL,
  pinned        boolean     NOT NULL DEFAULT false,
  edited_at     timestamptz,
  deleted_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  -- phase 2 (20260823_squad_chat_phase2): who the author named; the trigger
  -- filters to the channel's audience and drops the author.
  mentions      uuid[]      NOT NULL DEFAULT '{}',
  -- Re-captured 25 Aug 2026, first-class instead of the "messages gained:"
  -- comment this file carried: conversation_id (phase 3 DMs), and chat round
  -- 2's quoted replies, forwarding flag and photo attachments.
  conversation_id uuid,
  quoted_id       uuid,
  forwarded       boolean   NOT NULL DEFAULT false,
  attachment_path text
);
ALTER TABLE public.messages ADD CONSTRAINT messages_pkey PRIMARY KEY (id);
ALTER TABLE public.messages ADD CONSTRAINT messages_channel_check CHECK (channel IN ('squad', 'staff', 'dm'));
-- Re-captured 25 Aug 2026: rewritten by chat round 2 — a photo with no text
-- is a legal message, so the >= 1 arm now yields to attachment_path.
ALTER TABLE public.messages ADD CONSTRAINT messages_body_check CHECK (((length(btrim(body)) <= 2000) AND ((length(btrim(body)) >= 1) OR (attachment_path IS NOT NULL))));
ALTER TABLE public.messages ADD CONSTRAINT messages_staff_needs_team CHECK (channel <> 'staff' OR team_id IS NOT NULL);
ALTER TABLE public.messages ADD CONSTRAINT messages_club_id_fkey   FOREIGN KEY (club_id)   REFERENCES clubs(id)    ON DELETE CASCADE;
ALTER TABLE public.messages ADD CONSTRAINT messages_team_id_fkey   FOREIGN KEY (team_id)   REFERENCES teams(id)    ON DELETE CASCADE;
ALTER TABLE public.messages ADD CONSTRAINT messages_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES messages(id) ON DELETE CASCADE;
ALTER TABLE public.messages ADD CONSTRAINT messages_event_id_fkey  FOREIGN KEY (event_id)  REFERENCES events(id)   ON DELETE SET NULL;
ALTER TABLE public.messages ADD CONSTRAINT messages_author_id_fkey FOREIGN KEY (author_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE public.messages ADD CONSTRAINT messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE;
ALTER TABLE public.messages ADD CONSTRAINT messages_quoted_id_fkey FOREIGN KEY (quoted_id) REFERENCES messages(id) ON DELETE SET NULL;
ALTER TABLE public.messages ADD CONSTRAINT messages_dm_shape CHECK ((channel = 'dm') = (conversation_id IS NOT NULL));
CREATE INDEX messages_stream_idx ON public.messages USING btree (team_id, channel, created_at DESC);
CREATE INDEX messages_parent_idx ON public.messages USING btree (parent_id) WHERE (parent_id IS NOT NULL);
CREATE INDEX messages_event_idx  ON public.messages USING btree (event_id)  WHERE (event_id IS NOT NULL);
CREATE INDEX messages_author_idx ON public.messages USING btree (author_id);
-- phase 2: one OPEN thread per fixture (a soft-deleted one frees it), and a
-- GIN index for "messages that mention me".
CREATE UNIQUE INDEX messages_one_thread_per_event_idx ON public.messages USING btree (event_id) WHERE ((event_id IS NOT NULL) AND (parent_id IS NULL) AND (deleted_at IS NULL));
CREATE INDEX messages_mentions_idx ON public.messages USING gin (mentions);
CREATE INDEX messages_conversation_idx ON public.messages USING btree (conversation_id, created_at) WHERE (conversation_id IS NOT NULL);
CREATE INDEX messages_quoted_idx ON public.messages USING btree (quoted_id) WHERE (quoted_id IS NOT NULL);

-- announce_only DEFAULTS TRUE, and an ABSENT row means true — most squads
-- will never have one. private.channel_announce_only() reads it that way.
CREATE TABLE public.channel_settings (
  team_id        uuid        NOT NULL,
  club_id        uuid        NOT NULL,
  announce_only  boolean     NOT NULL DEFAULT true,
  updated_by     uuid,
  updated_at     timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.channel_settings ADD CONSTRAINT channel_settings_pkey PRIMARY KEY (team_id);
ALTER TABLE public.channel_settings ADD CONSTRAINT channel_settings_team_id_fkey    FOREIGN KEY (team_id)    REFERENCES teams(id)    ON DELETE CASCADE;
ALTER TABLE public.channel_settings ADD CONSTRAINT channel_settings_club_id_fkey    FOREIGN KEY (club_id)    REFERENCES clubs(id)    ON DELETE CASCADE;
ALTER TABLE public.channel_settings ADD CONSTRAINT channel_settings_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES profiles(id) ON DELETE SET NULL;

-- Same shape as announcement_reads: the primary key is the deduplication.
CREATE TABLE public.message_reads (
  message_id uuid        NOT NULL,
  profile_id uuid        NOT NULL,
  read_at    timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.message_reads ADD CONSTRAINT message_reads_pkey PRIMARY KEY (message_id, profile_id);
ALTER TABLE public.message_reads ADD CONSTRAINT message_reads_message_id_fkey FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE;
ALTER TABLE public.message_reads ADD CONSTRAINT message_reads_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE;
CREATE INDEX message_reads_profile_idx ON public.message_reads USING btree (profile_id);

-- notification_opt_outs.category gained 'squad_chat' in the same migration.


-- ---------------------------------------------------------------------
-- public.conversation_clears   (24 Aug 2026 — db/migrations/20260824_chat_list.sql)
--
-- "Delete chat" on a DM, WhatsApp's meaning: one row per (conversation,
-- person) holding when THEY last cleared it. The read policy on messages
-- hides rows before cleared_at from that person; my_chats() drops the row
-- until the other side writes again. The other participant is untouched.
-- ---------------------------------------------------------------------
CREATE TABLE public.conversation_clears (
  conversation_id uuid        NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  profile_id      uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  cleared_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, profile_id)
);

-- ---------------------------------------------------------------------
-- public.conversations / public.dm_blocks / public.message_reports /
-- public.welfare_access_log, plus messages.conversation_id and
-- player_private.staff_dm_opt_in*  (squad chat phase 3, 23 Aug 2026)
-- Migration: db/migrations/20260823_squad_chat_phase3.sql
--
-- A conversation is an ORDERED pair (profile_a < profile_b) so one row serves
-- both directions; open_conversation() is the only way in. A DM is a messages
-- row with channel = 'dm' and conversation_id set (messages_dm_shape ties the
-- two). Reports and the access log are stamped by triggers. The opt-in on
-- player_private records who consented and when; a trigger refuses the
-- player themself.
-- ---------------------------------------------------------------------
-- ⚠️ RE-CAPTURED 25 Aug 2026 after the GROUP-CHAT rewrite (20260824 group
-- chats) — the largest structural drift of any captured table. profile_a/b
-- went NULLABLE, kind + title arrived, conversations_check and the (a, b)
-- UNIQUE were REPLACED by conversations_shape and the partial unique
-- conversations_dm_pair: a DM is still the ordered pair; a group is a titled
-- row whose membership lives in conversation_members.
CREATE TABLE public.conversations (
  id          uuid        NOT NULL DEFAULT gen_random_uuid(),
  club_id     uuid        NOT NULL,
  profile_a   uuid,
  profile_b   uuid,
  created_by  uuid        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  last_at     timestamptz NOT NULL DEFAULT now(),
  kind        text        NOT NULL DEFAULT 'dm'::text,
  title       text
);
ALTER TABLE public.conversations ADD CONSTRAINT conversations_pkey PRIMARY KEY (id);
ALTER TABLE public.conversations ADD CONSTRAINT conversations_shape CHECK ((((kind = 'dm'::text) AND (profile_a IS NOT NULL) AND (profile_b IS NOT NULL) AND (profile_a < profile_b) AND (title IS NULL)) OR ((kind = 'group'::text) AND (profile_a IS NULL) AND (profile_b IS NULL) AND (title IS NOT NULL) AND ((length(btrim(title)) >= 1) AND (length(btrim(title)) <= 80)))));
CREATE UNIQUE INDEX conversations_dm_pair ON public.conversations USING btree (profile_a, profile_b) WHERE (kind = 'dm'::text);
ALTER TABLE public.conversations ADD CONSTRAINT conversations_club_id_fkey    FOREIGN KEY (club_id)    REFERENCES clubs(id)    ON DELETE CASCADE;
ALTER TABLE public.conversations ADD CONSTRAINT conversations_profile_a_fkey  FOREIGN KEY (profile_a)  REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE public.conversations ADD CONSTRAINT conversations_profile_b_fkey  FOREIGN KEY (profile_b)  REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE public.conversations ADD CONSTRAINT conversations_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE CASCADE;
CREATE INDEX conversations_a_idx ON public.conversations USING btree (profile_a, last_at DESC);
CREATE INDEX conversations_b_idx ON public.conversations USING btree (profile_b, last_at DESC);

-- (messages' conversation_id / dm_shape / conversation_idx, once summarised
-- here, are captured first-class in the messages block above — 25 Aug 2026.)

CREATE TABLE public.dm_blocks (
  blocker_id  uuid        NOT NULL,
  blocked_id  uuid        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.dm_blocks ADD CONSTRAINT dm_blocks_pkey PRIMARY KEY (blocker_id, blocked_id);
ALTER TABLE public.dm_blocks ADD CONSTRAINT dm_blocks_blocker_id_fkey FOREIGN KEY (blocker_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE public.dm_blocks ADD CONSTRAINT dm_blocks_blocked_id_fkey FOREIGN KEY (blocked_id) REFERENCES profiles(id) ON DELETE CASCADE;

CREATE TABLE public.message_reports (
  id           uuid        NOT NULL DEFAULT gen_random_uuid(),
  club_id      uuid        NOT NULL,
  message_id   uuid        NOT NULL,
  reporter_id  uuid        NOT NULL,
  reason       text        NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  resolved_at  timestamptz,
  resolved_by  uuid
);
ALTER TABLE public.message_reports ADD CONSTRAINT message_reports_pkey PRIMARY KEY (id);
ALTER TABLE public.message_reports ADD CONSTRAINT message_reports_reason_check CHECK (length(btrim(reason)) BETWEEN 1 AND 500);
ALTER TABLE public.message_reports ADD CONSTRAINT message_reports_message_id_reporter_id_key UNIQUE (message_id, reporter_id);
ALTER TABLE public.message_reports ADD CONSTRAINT message_reports_club_id_fkey     FOREIGN KEY (club_id)     REFERENCES clubs(id)    ON DELETE CASCADE;
ALTER TABLE public.message_reports ADD CONSTRAINT message_reports_message_id_fkey  FOREIGN KEY (message_id)  REFERENCES messages(id) ON DELETE CASCADE;
ALTER TABLE public.message_reports ADD CONSTRAINT message_reports_reporter_id_fkey FOREIGN KEY (reporter_id) REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE public.message_reports ADD CONSTRAINT message_reports_resolved_by_fkey FOREIGN KEY (resolved_by) REFERENCES profiles(id) ON DELETE SET NULL;
CREATE INDEX message_reports_open_idx ON public.message_reports USING btree (club_id, created_at DESC) WHERE (resolved_at IS NULL);

CREATE TABLE public.welfare_access_log (
  id               uuid        NOT NULL DEFAULT gen_random_uuid(),
  club_id          uuid        NOT NULL,
  admin_id         uuid        NOT NULL,
  conversation_id  uuid,                              -- nullable since 24 Aug 2026: the log OUTLIVES the conversation (delete for good)
  opened_at        timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.welfare_access_log ADD CONSTRAINT welfare_access_log_pkey PRIMARY KEY (id);
ALTER TABLE public.welfare_access_log ADD CONSTRAINT welfare_access_log_club_id_fkey         FOREIGN KEY (club_id)         REFERENCES clubs(id)         ON DELETE CASCADE;
ALTER TABLE public.welfare_access_log ADD CONSTRAINT welfare_access_log_admin_id_fkey        FOREIGN KEY (admin_id)        REFERENCES profiles(id)      ON DELETE CASCADE;
ALTER TABLE public.welfare_access_log ADD CONSTRAINT welfare_access_log_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE SET NULL;  -- was CASCADE until 24 Aug 2026
CREATE INDEX welfare_access_log_idx ON public.welfare_access_log USING btree (club_id, opened_at DESC);

-- (The phase-3 player_private columns once summarised here are now captured
-- first-class in the player_private block above — 25 Aug 2026 re-capture.)


-- =====================================================================
-- RE-CAPTURED 2026-08-25 — THE THIRTEEN TABLES THIS FILE WAS MISSING
--
-- Measured against information_schema/pg_catalog on 25 Aug 2026: live held
-- 57 base tables and this file captured 44. Every block below existed live
-- with RLS ON and no entry here — several already had their GRANTS
-- (grants.sql) or POLICIES (policies.sql) captured, which proves they were
-- KNOWN and simply never written into this file. The capture-with-the-
-- migration discipline failed continuously from 14 Aug (player_grades)
-- through 24 Aug (the chat rounds). Constraint names are exactly as live
-- names them. feedback.ref and membership_audit.id are
-- GENERATED ALWAYS AS IDENTITY. membership_vouches has NO foreign keys
-- live. Prose/reasoning for each lives in its migration under
-- db/migrations/, which this capture does not restate.
-- =====================================================================

-- availability_nudges  (19 Aug 2026 — who has already been nudged about which match)
CREATE TABLE public.availability_nudges (
  event_id    uuid        NOT NULL,
  profile_id  uuid        NOT NULL,
  batch_id    uuid        NOT NULL,
  sent_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT availability_nudges_pkey            PRIMARY KEY (event_id, profile_id),
  CONSTRAINT availability_nudges_event_id_fkey   FOREIGN KEY (event_id)   REFERENCES events(id)   ON DELETE CASCADE,
  CONSTRAINT availability_nudges_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
);
ALTER TABLE public.availability_nudges ENABLE ROW LEVEL SECURITY;

-- chat_prefs  (24 Aug 2026 — pinned chats and archive; owner-only.
--              26 Aug 2026 — background: the per-chat wallpaper, NULL = default)
CREATE TABLE public.chat_prefs (
  owner_id    uuid        NOT NULL,
  chat_key    text        NOT NULL,
  pinned      boolean     NOT NULL DEFAULT false,
  archived    boolean     NOT NULL DEFAULT false,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  background  text,
  CONSTRAINT chat_prefs_pkey           PRIMARY KEY (owner_id, chat_key),
  CONSTRAINT chat_prefs_owner_id_fkey  FOREIGN KEY (owner_id) REFERENCES profiles(id) ON DELETE CASCADE,
  CONSTRAINT chat_prefs_chat_key_check CHECK (((length(chat_key) >= 1) AND (length(chat_key) <= 80))),
  CONSTRAINT chat_prefs_background_check CHECK (((background IS NULL) OR ((length(background) >= 1) AND (length(background) <= 40))))
);
ALTER TABLE public.chat_prefs ENABLE ROW LEVEL SECURITY;

-- conversation_members  (24 Aug 2026 — group chat membership; writes via RPCs only)
CREATE TABLE public.conversation_members (
  conversation_id  uuid        NOT NULL,
  profile_id       uuid        NOT NULL,
  is_owner         boolean     NOT NULL DEFAULT false,
  joined_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT conversation_members_pkey                 PRIMARY KEY (conversation_id, profile_id),
  CONSTRAINT conversation_members_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  CONSTRAINT conversation_members_profile_id_fkey      FOREIGN KEY (profile_id)      REFERENCES profiles(id)      ON DELETE CASCADE
);
ALTER TABLE public.conversation_members ENABLE ROW LEVEL SECURITY;

-- feedback  (18 Aug 2026 — bug/idea reports; policies and grants ARE captured elsewhere)
-- NOTE: ref is GENERATED ALWAYS AS IDENTITY.
CREATE TABLE public.feedback (
  id            uuid        NOT NULL DEFAULT gen_random_uuid(),
  ref           bigint      NOT NULL GENERATED ALWAYS AS IDENTITY,
  club_id       uuid        NOT NULL,
  submitted_by  uuid        NOT NULL,
  kind          text        NOT NULL,
  body          text        NOT NULL,
  route         text,
  context       jsonb       NOT NULL DEFAULT '{}'::jsonb,
  status        text        NOT NULL DEFAULT 'new'::text,
  admin_note    text,
  handled_by    uuid,
  handled_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT feedback_pkey              PRIMARY KEY (id),
  CONSTRAINT feedback_club_id_fkey      FOREIGN KEY (club_id)      REFERENCES clubs(id)    ON DELETE CASCADE,
  CONSTRAINT feedback_submitted_by_fkey FOREIGN KEY (submitted_by) REFERENCES profiles(id) ON DELETE CASCADE,
  CONSTRAINT feedback_handled_by_fkey   FOREIGN KEY (handled_by)   REFERENCES profiles(id) ON DELETE SET NULL,
  CONSTRAINT feedback_kind_check        CHECK ((kind = ANY (ARRAY['bug'::text, 'idea'::text]))),
  CONSTRAINT feedback_body_check        CHECK ((length(btrim(body)) > 0)),
  CONSTRAINT feedback_status_check      CHECK ((status = ANY (ARRAY['new'::text, 'in-progress'::text, 'done'::text, 'wontfix'::text])))
);
ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;

CREATE INDEX feedback_club_status_created_idx ON public.feedback USING btree (club_id, status, created_at DESC);
CREATE INDEX feedback_submitted_by_idx        ON public.feedback USING btree (submitted_by, created_at DESC);

-- membership_audit  (17 Aug 2026 — append-only membership log; super-admin read only)
-- NOTE: id is GENERATED ALWAYS AS IDENTITY. Deliberately NO foreign keys (a log outlives cascades).
CREATE TABLE public.membership_audit (
  id             bigint      NOT NULL GENERATED ALWAYS AS IDENTITY,
  at             timestamptz NOT NULL DEFAULT now(),
  membership_id  uuid        NOT NULL,
  profile_id     uuid        NOT NULL,
  club_id        uuid        NOT NULL,
  team_id        uuid,
  player_id      uuid,
  action         text        NOT NULL,
  actor_id       uuid,
  actor_kind     text        NOT NULL,
  old_role       text,
  new_role       text,
  old_status     text,
  new_status     text,
  old_is_super   boolean,
  new_is_super   boolean,
  old_rights     text[],
  new_rights     text[],
  CONSTRAINT membership_audit_pkey             PRIMARY KEY (id),
  CONSTRAINT membership_audit_action_check     CHECK ((action = ANY (ARRAY['granted'::text, 'changed'::text, 'revoked'::text]))),
  CONSTRAINT membership_audit_actor_kind_check CHECK ((actor_kind = ANY (ARRAY['member'::text, 'system'::text])))
);
ALTER TABLE public.membership_audit ENABLE ROW LEVEL SECURITY;

CREATE INDEX membership_audit_at_idx      ON public.membership_audit USING btree (at DESC);
CREATE INDEX membership_audit_profile_idx ON public.membership_audit USING btree (profile_id, at DESC);

-- membership_vouches  (17 Aug 2026 — "do you know this person?")
-- NOTE: NO foreign keys live — only the PK and the answer CHECK. Captured as found.
CREATE TABLE public.membership_vouches (
  membership_id  uuid        NOT NULL,
  voucher_id     uuid        NOT NULL,
  club_id        uuid        NOT NULL,
  team_id        uuid,
  answer         text        NOT NULL,
  at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT membership_vouches_pkey         PRIMARY KEY (membership_id, voucher_id),
  CONSTRAINT membership_vouches_answer_check CHECK ((answer = ANY (ARRAY['known'::text, 'unknown'::text])))
);
ALTER TABLE public.membership_vouches ENABLE ROW LEVEL SECURITY;

CREATE INDEX membership_vouches_membership_idx ON public.membership_vouches USING btree (membership_id);

-- message_reactions  (24 Aug 2026 — emoji reactions; fixed emoji list in a CHECK)
CREATE TABLE public.message_reactions (
  message_id  uuid        NOT NULL,
  profile_id  uuid        NOT NULL,
  emoji       text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT message_reactions_pkey            PRIMARY KEY (message_id, profile_id, emoji),
  CONSTRAINT message_reactions_message_id_fkey FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
  CONSTRAINT message_reactions_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE,
  CONSTRAINT message_reactions_emoji_check     CHECK ((emoji = ANY (ARRAY['👍'::text, '❤️'::text, '😂'::text, '😮'::text, '👏'::text])))
);
ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;

CREATE INDEX message_reactions_message_idx ON public.message_reactions USING btree (message_id);

-- message_stars  (24 Aug 2026 — starred messages, owner-only)
CREATE TABLE public.message_stars (
  owner_id    uuid        NOT NULL,
  message_id  uuid        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT message_stars_pkey            PRIMARY KEY (owner_id, message_id),
  CONSTRAINT message_stars_owner_id_fkey   FOREIGN KEY (owner_id)   REFERENCES profiles(id) ON DELETE CASCADE,
  CONSTRAINT message_stars_message_id_fkey FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
);
ALTER TABLE public.message_stars ENABLE ROW LEVEL SECURITY;

-- nicknames  (24 Aug 2026 — private per-owner labels for other members)
CREATE TABLE public.nicknames (
  owner_id    uuid        NOT NULL,
  profile_id  uuid        NOT NULL,
  label       text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT nicknames_pkey            PRIMARY KEY (owner_id, profile_id),
  CONSTRAINT nicknames_owner_id_fkey   FOREIGN KEY (owner_id)   REFERENCES profiles(id) ON DELETE CASCADE,
  CONSTRAINT nicknames_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE,
  CONSTRAINT nicknames_label_check     CHECK (((length(btrim(label)) >= 1) AND (length(btrim(label)) <= 40)))
);
ALTER TABLE public.nicknames ENABLE ROW LEVEL SECURITY;

-- notification_opt_outs  (19 Aug 2026 — a row means OFF; described in grants.sql and
-- policies.sql, never captured here. Category list has grown to SEVEN values.)
CREATE TABLE public.notification_opt_outs (
  profile_id  uuid        NOT NULL,
  category    text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notification_opt_outs_pkey            PRIMARY KEY (profile_id, category),
  CONSTRAINT notification_opt_outs_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE,
  CONSTRAINT notification_opt_outs_category_check  CHECK ((category = ANY (ARRAY['feedback_reply'::text, 'notice'::text, 'fixture'::text, 'approval'::text, 'availability'::text, 'squad_chat'::text, 'direct_messages'::text])))
);
ALTER TABLE public.notification_opt_outs ENABLE ROW LEVEL SECURITY;

-- player_grades  (14 Aug 2026 — coach-only tier per player; grants ARE in grants.sql,
-- policy IS in policies.sql, the table itself was never captured)
CREATE TABLE public.player_grades (
  player_id   uuid        NOT NULL,
  tier        text        NOT NULL,
  note        text,
  updated_by  uuid,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT player_grades_pkey            PRIMARY KEY (player_id),
  CONSTRAINT player_grades_player_id_fkey  FOREIGN KEY (player_id)  REFERENCES players(id)  ON DELETE CASCADE,
  CONSTRAINT player_grades_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES profiles(id) ON DELETE SET NULL,
  CONSTRAINT player_grades_tier_check      CHECK ((tier = ANY (ARRAY['A'::text, 'B'::text, 'C'::text])))
);
ALTER TABLE public.player_grades ENABLE ROW LEVEL SECURITY;

-- push_subscriptions  (18 Aug 2026 — web-push endpoints; grants ARE in grants.sql)
CREATE TABLE public.push_subscriptions (
  id          uuid        NOT NULL DEFAULT gen_random_uuid(),
  profile_id  uuid        NOT NULL,
  endpoint    text        NOT NULL,
  p256dh      text        NOT NULL,
  auth        text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT push_subscriptions_pkey            PRIMARY KEY (id),
  CONSTRAINT push_subscriptions_endpoint_key    UNIQUE (endpoint),
  CONSTRAINT push_subscriptions_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
);
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE INDEX push_subscriptions_profile_id_idx ON public.push_subscriptions USING btree (profile_id);

-- signup_nudges  (20 Aug 2026 — who was chased about an unfinished sign-up)
CREATE TABLE public.signup_nudges (
  profile_id  uuid        NOT NULL,
  nudge_no    integer     NOT NULL,
  sent_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT signup_nudges_pkey            PRIMARY KEY (profile_id, nudge_no),
  CONSTRAINT signup_nudges_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE,
  CONSTRAINT signup_nudges_nudge_no_check  CHECK ((nudge_no = ANY (ARRAY[1, 2])))
);
ALTER TABLE public.signup_nudges ENABLE ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------
-- public.message_deliveries  (26 Aug 2026 — WhatsApp-style ticks)
-- Migration: db/migrations/20260826_chat_delivery_receipts.sql
--
-- The recipient's app has RECEIVED the message (second tick); message_reads
-- stays the third. Written by the unread-badge fetch, not by opening the
-- thread. Online status ships beside it with DELIBERATELY NO TABLE — it is
-- Realtime presence, ephemeral, and a stored last_seen was rejected.
-- ---------------------------------------------------------------------
CREATE TABLE public.message_deliveries (
  message_id   uuid        NOT NULL,
  profile_id   uuid        NOT NULL,
  delivered_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT message_deliveries_pkey PRIMARY KEY (message_id, profile_id),
  CONSTRAINT message_deliveries_message_id_fkey FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
  CONSTRAINT message_deliveries_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
);
ALTER TABLE public.message_deliveries ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------
-- club_officers   (26 Aug 2026 — titles without rights)
-- Recorded with the migration (20260826_club_officers) and APPLIED to
-- production the same day (table measured present; harness green rolled
-- back). Honours only — NO permission keys off this table; the CHECK is
-- the eight-title vocabulary, RLS is member-read / super-write.
-- ---------------------------------------------------------------------
CREATE TABLE public.club_officers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- ⚠️ CHECK REPLACED 26 Aug 2026 by 20260826_officer_title_social_media
  -- (the ninth title) — APPLIED to production the same day, harness green.
  title text NOT NULL CHECK (title IN (
    'Club President', 'Vice Chairman', 'Rugby Junior Manager',
    'Club Secretary', 'Treasurer', 'Membership Secretary',
    'Director of Rugby', 'Rugby Performance Director',
    'Social Media Director'
  )),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (club_id, profile_id, title)
);
