begin read only;
select jsonb_pretty(jsonb_build_object(
 'columns',(select jsonb_agg(jsonb_build_object('table',table_name,'column',column_name,'type',data_type)) from information_schema.columns where table_schema='public' and table_name in ('words','review_events')),
 'functions',(select jsonb_agg(jsonb_build_object('name',p.proname,'arguments',pg_get_function_identity_arguments(p.oid),'marker',obj_description(p.oid,'pg_proc'))) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('record_learning_review','record_offline_learning_review','noted_review_count')),
 'rls',(select jsonb_agg(jsonb_build_object('table',c.relname,'enabled',c.relrowsecurity)) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('words','review_events')),
 'policies',(select jsonb_agg(jsonb_build_object('table',tablename,'name',policyname,'using',qual,'check',with_check)) from pg_policies where schemaname='public' and tablename in ('words','review_events'))
)) as noted_offline_preflight;
rollback;
