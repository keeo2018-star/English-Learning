begin read only;
select jsonb_pretty(jsonb_build_object(
 'auth_id',(select jsonb_build_object('type',data_type,'nullable',is_nullable) from information_schema.columns where table_schema='auth' and table_name='users' and column_name='id'),
 'example_source',(select jsonb_build_object('type',data_type,'nullable',is_nullable) from information_schema.columns where table_schema='public' and table_name='words' and column_name='example_source'),
 'example_source_marker',col_description(to_regclass('public.words'),(select attnum from pg_attribute where attrelid=to_regclass('public.words') and attname='example_source' and not attisdropped)),
 'policies',(select jsonb_agg(jsonb_build_object('table',tablename,'name',policyname,'roles',roles,'using',qual)) from pg_policies where schemaname='public' and tablename in ('noted_ai_entries','noted_ai_user_usage','noted_ai_project_usage')),
 'new_tables',(select jsonb_agg(jsonb_build_object('name',c.relname,'rls',c.relrowsecurity,'marker',obj_description(c.oid,'pg_class'))) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('noted_ai_entries','noted_ai_user_usage','noted_ai_project_usage')),
 'new_functions',(select jsonb_agg(jsonb_build_object('name',p.proname,'arguments',pg_get_function_identity_arguments(p.oid),'marker',obj_description(p.oid,'pg_proc'))) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('noted_ai_reserve','noted_ai_finish','noted_ai_fail'))
)) as noted_ai_preflight;
rollback;
