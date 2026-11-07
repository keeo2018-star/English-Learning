-- Run FIRST in the existing project's SQL Editor. Read-only metadata only.
begin transaction read only;
select jsonb_pretty(jsonb_build_object(
 'columns', (select jsonb_agg(jsonb_build_object('table',table_schema||'.'||table_name,'column',column_name,'type',data_type,'nullable',is_nullable)) from information_schema.columns where (table_schema='public' and table_name in ('words','review_events','discover_profiles','discover_assessments','discover_daily_sets','discover_known','discover_vocabulary')) or (table_schema='auth' and table_name='users' and column_name='id')),
 'constraints', (select jsonb_agg(jsonb_build_object('table',conrelid::regclass::text,'name',conname,'definition',pg_get_constraintdef(oid))) from pg_constraint where conrelid in (to_regclass('public.words'),to_regclass('public.review_events'))),
 'existing_discover_tables', (select jsonb_agg(jsonb_build_object('name',c.relname,'marker',obj_description(c.oid,'pg_class'))) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname like 'discover_%'),
 'existing_discover_functions', (select jsonb_agg(jsonb_build_object('name',p.proname,'arguments',pg_get_function_identity_arguments(p.oid),'marker',obj_description(p.oid,'pg_proc'))) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname like 'discover_%' or p.proname='noted_guard_duplicate_word')),
 'word_triggers', (select jsonb_agg(jsonb_build_object('name',tgname,'definition',pg_get_triggerdef(oid))) from pg_trigger where tgrelid=to_regclass('public.words') and not tgisinternal),
 'word_policies', (select jsonb_agg(jsonb_build_object('name',policyname,'command',cmd,'using',qual,'check',with_check)) from pg_policies where schemaname='public' and tablename='words')
)) as noted_discover_preflight;
rollback;
