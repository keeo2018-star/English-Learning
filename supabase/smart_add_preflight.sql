-- Run FIRST. Read-only: returns schema metadata, no vocabulary or account data.
begin transaction read only;
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'words'
  and column_name in ('id', 'user_id', 'word', 'meaning', 'example');
select conname, pg_get_constraintdef(oid) as definition
from pg_constraint where conrelid = 'public.words'::regclass and contype = 'c';
rollback;
