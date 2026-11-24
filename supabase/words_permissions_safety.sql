-- Based on the supplied production preflight. No rows/policies/CRUD grants change.
-- TRUNCATE is not used by Noted and is not protected by row-level security.
begin;
revoke truncate on table public.words from anon,authenticated;
commit;
