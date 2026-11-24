begin read only;
select jsonb_pretty(jsonb_build_object(
 'batch_table',to_regclass('public.discover_batches') is not null,
 'batch_rls',(select relrowsecurity from pg_class where oid=to_regclass('public.discover_batches')),
 'active_batch_column',exists(select 1 from information_schema.columns where table_schema='public' and table_name='discover_profiles' and column_name='active_discover_batch' and udt_name='uuid'),
 'functions',(select jsonb_agg(jsonb_build_object('name',p.proname,'marker',obj_description(p.oid,'pg_proc'))) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('discover_action','discover_snapshot','discover_create_batch','discover_unseen_vocabulary')),
 'returns_version_2',(select pg_get_functiondef(p.oid)~'discover_version[^0-9]*2' from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='discover_snapshot'),
 'policies',(select jsonb_agg(jsonb_build_object('name',policyname,'roles',roles,'command',cmd,'using',qual)) from pg_policies where schemaname='public' and tablename='discover_batches')
)) as noted_continuous_discover_verified;
rollback;
