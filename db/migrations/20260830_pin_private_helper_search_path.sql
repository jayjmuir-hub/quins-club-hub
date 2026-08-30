-- Pin search_path on the two private helpers that lacked it.
--
-- Supabase's security advisor (function_search_path_mutable, checked 30 Aug
-- 2026) flags exactly two functions in this database: these. Every sibling
-- helper already pins its search_path; these two were simply missed when
-- they were written (20260809, 20260824).
--
-- Both bodies are pure pg_catalog built-ins — lower(), btrim(), split_part(),
-- nullif(), a regex and a ::uuid cast — so an EMPTY search_path changes
-- nothing about what they resolve (pg_catalog is always searched implicitly).
-- What it closes is the theoretical steer: a SECURITY DEFINER caller invoking
-- an unpinned function inherits the session's search_path, and a hostile
-- session could put its own objects in front. Neither body references any
-- steerable object today; the pin makes that a property of the function
-- rather than of today's body.
--
-- Callers are unaffected: the storage policies name private.chat_media_owner
-- schema-qualified, and register_my_player calls private.squad_expects_gender
-- the same way. Verified by db/tests/private-helper-search-path.sql, which
-- also proves both functions still answer correctly with the pin in place.

alter function private.squad_expects_gender(text) set search_path = '';
alter function private.chat_media_owner(text) set search_path = '';
