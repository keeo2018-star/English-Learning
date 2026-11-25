begin read only;
select jsonb_pretty(jsonb_build_object(
 'server_version',version(),
 'columns',(select jsonb_agg(jsonb_build_object('schema',table_schema,'table',table_name,'column',column_name,'type',data_type,'nullable',is_nullable)) from information_schema.columns where (table_schema='public' and table_name in ('words','review_events','learning_add_events','discover_profiles','discover_daily_sets','discover_batches','discover_assessments','discover_interactions','discover_known','discover_known_words','expression_voice_files','noted_ai_entries','learning_collections','learning_languages')) or (table_schema='auth' and table_name='users' and column_name='id')),
 'constraints',(select jsonb_agg(jsonb_build_object('table',c.conrelid::regclass::text,'name',c.conname,'definition',pg_get_constraintdef(c.oid))) from pg_constraint c join pg_namespace n on n.oid=c.connamespace where n.nspname='public'),
 'rls',(select jsonb_agg(jsonb_build_object('table',c.relname,'enabled',c.relrowsecurity,'marker',obj_description(c.oid,'pg_class'))) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r'),
 'policies',(select jsonb_agg(jsonb_build_object('table',tablename,'name',policyname,'command',cmd,'using',qual,'check',with_check,'roles',roles)) from pg_policies where schemaname='public'),
 'functions',(select jsonb_agg(jsonb_build_object('name',p.proname,'arguments',pg_get_function_identity_arguments(p.oid),'marker',obj_description(p.oid,'pg_proc'))) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname like 'discover_%' or p.proname like '%review%' or p.proname like '%collection%' or p.proname like 'capture_%' or p.proname like '%duplicate%' or p.proname like 'voice_note%')),
 'triggers',(select jsonb_agg(jsonb_build_object('table',t.tgrelid::regclass::text,'name',t.tgname,'definition',pg_get_triggerdef(t.oid))) from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where not t.tgisinternal and n.nspname='public'),
 'indexes',(select jsonb_agg(jsonb_build_object('table',tablename,'name',indexname,'definition',indexdef)) from pg_indexes where schemaname='public')
)) as noted_collections_preflight;
rollback;
