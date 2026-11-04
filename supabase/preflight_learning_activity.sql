-- READ ONLY. Run this BEFORE 20261104_learning_activity.sql in the EXISTING project.
-- Returns schema/security metadata only. Does not select vocabulary or auth-user records.
begin read only;
select jsonb_pretty(jsonb_build_object(
  'database', jsonb_build_object('version', current_setting('server_version'), 'role', current_user),
  'roles', (select jsonb_agg(rolname) from pg_roles where rolname in ('anon','authenticated','service_role')),
  'auth_uid', (select pg_get_function_result(p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='auth' and p.proname='uid' limit 1),
  'columns', (select jsonb_agg(jsonb_build_object('schema', n.nspname, 'table', c.relname,
    'column', a.attname, 'type', format_type(a.atttypid,a.atttypmod), 'not_null', a.attnotnull,
    'default', pg_get_expr(d.adbin,d.adrelid)) order by n.nspname,c.relname,a.attnum)
    from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace
    left join pg_attrdef d on d.adrelid=c.oid and d.adnum=a.attnum
    where a.attnum>0 and not a.attisdropped and ((n.nspname='public' and c.relname in
      ('words','review_events','learning_add_events','learning_activity_start')) or (n.nspname='auth' and c.relname='users' and a.attname='id'))),
  'tables', (select jsonb_agg(jsonb_build_object('name', c.relname, 'owner', pg_get_userbyid(c.relowner),
    'rls', c.relrowsecurity, 'force_rls', c.relforcerowsecurity, 'marker', obj_description(c.oid,'pg_class')))
    from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public'
    and c.relname in ('words','review_events','learning_add_events','learning_activity_start') and c.relkind='r'),
  'constraints', (select jsonb_agg(jsonb_build_object('table', c.conrelid::regclass::text,'name', c.conname,'definition', pg_get_constraintdef(c.oid)))
    from pg_constraint c where c.conrelid in (to_regclass('public.words'),to_regclass('public.review_events'),to_regclass('public.learning_add_events'),to_regclass('public.learning_activity_start'))
      or (c.conrelid=to_regclass('auth.users') and c.contype='p')),
  'policies', (select jsonb_agg(jsonb_build_object('table', tablename,'name', policyname,'command', cmd,'roles', roles,'using', qual,'check', with_check))
    from pg_policies where schemaname='public' and tablename in ('words','review_events','learning_add_events','learning_activity_start')),
  'grants', (select jsonb_agg(jsonb_build_object('table', table_name,'role', grantee,'privilege', privilege_type))
    from information_schema.role_table_grants where table_schema='public' and table_name in
    ('words','review_events','learning_add_events','learning_activity_start') and grantee in ('PUBLIC','anon','authenticated')),
  'existing_functions', (select jsonb_agg(jsonb_build_object('name', p.proname, 'arguments', pg_get_function_identity_arguments(p.oid),
    'returns', pg_get_function_result(p.oid), 'owner', pg_get_userbyid(p.proowner), 'security_definer', p.prosecdef,
    'marker', obj_description(p.oid,'pg_proc'))) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname in ('record_learning_review','learning_calendar','capture_learning_addition','capture_legacy_learning_review','noted_review_count')),
  'word_triggers', (select jsonb_agg(jsonb_build_object('name', t.tgname,'definition', pg_get_triggerdef(t.oid)))
    from pg_trigger t where t.tgrelid=to_regclass('public.words') and not t.tgisinternal),
  'indexes', (select jsonb_agg(jsonb_build_object('table', tablename,'name', indexname,'definition', indexdef))
    from pg_indexes where schemaname='public' and tablename in ('words','review_events','learning_add_events','learning_activity_start')),
  'realtime', (select jsonb_agg(jsonb_build_object('publication', pubname,'table', tablename)) from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='words')
)) as noted_schema_preflight;
rollback;
