-- Additive and safe to run again. Existing content, schedules and RLS stay intact.
-- Run in the Supabase SQL Editor for the existing Noted project.
begin;
alter table public.words add column if not exists review_state jsonb;
comment on column public.words.review_state is
  'Adaptive recall state. NULL means no familiarity rating has been recorded.';
notify pgrst, 'reload schema';
commit;
