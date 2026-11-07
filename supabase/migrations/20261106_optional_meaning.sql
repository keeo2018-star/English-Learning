-- Run ONLY after checking smart_add_preflight.sql results.
-- Relaxes the one known meaning length check; no rows, auth, RLS or progress changed.
begin;
set local lock_timeout = '2s';
set local statement_timeout = '15s';
lock table public.words in access exclusive mode;
do $$
declare actual text; old_check text; new_check text;
begin
  if not exists (select 1 from information_schema.columns where table_schema='public'
    and table_name='words' and column_name='meaning' and data_type='text' and is_nullable='NO') then
    raise exception 'Unexpected meaning column. Stop and inspect preflight.';
  end if;
  select regexp_replace(pg_get_constraintdef(oid), '\s', '', 'g') into actual
    from pg_constraint where conrelid='public.words'::regclass and conname='words_meaning_check' and contype='c';
  old_check := regexp_replace('CHECK (((char_length(TRIM(BOTH FROM meaning)) >= 1) AND (char_length(TRIM(BOTH FROM meaning)) <= 2000)))', '\s', '', 'g');
  new_check := regexp_replace('CHECK (((char_length(TRIM(BOTH FROM meaning)) >= 0) AND (char_length(TRIM(BOTH FROM meaning)) <= 2000)))', '\s', '', 'g');
  if actual is null or actual not in (old_check, new_check) then
    raise exception 'Unexpected meaning constraint. Stop and inspect preflight.';
  end if;
  if exists (select 1 from pg_constraint where conrelid='public.words'::regclass and contype='c'
    and conname <> 'words_meaning_check' and pg_get_constraintdef(oid) ~ '\mmeaning\M') then
    raise exception 'Additional meaning constraints found. Stop and inspect preflight.';
  end if;
  if actual = old_check then
    alter table public.words drop constraint words_meaning_check,
      add constraint words_meaning_check check (char_length(trim(meaning)) between 0 and 2000);
  end if;
end $$;
notify pgrst, 'reload schema';
commit;
