-- READ ONLY: send noted_collections_learning_preflight in full for review.
-- Does not install functions, call application RPCs or enable multilingual UI.
begin read only;
set local statement_timeout='30s';
with required(rel,col,typ) as (values
 ('words','id','uuid'),
 ('words','user_id','uuid'),
 ('words','word','text'),
 ('words','collection_id','uuid'),
 ('review_events','reviewed_at','timestamp with time zone'),
 ('review_events','learning_item_id','uuid'),
 ('learning_add_events','created_at','timestamp with time zone'),
 ('learning_collections','id','uuid'),
 ('learning_collections','user_id','uuid'),
 ('learning_collections','target_language','text'),
 ('learning_collections','explanation_language','text'),
 ('learning_collections','proficiency_level','text'),
 ('learning_collections','display_order','integer'),
 ('learning_collections','preferences','jsonb'),
 ('learning_collections','created_at','timestamp with time zone'),
 ('learning_collections','updated_at','timestamp with time zone'),
 ('discover_profiles','recommendation_level','numeric'),
 ('review_events','user_id','uuid'),
 ('learning_add_events','user_id','uuid'),
 ('discover_profiles','user_id','uuid'),
 ('discover_assessments','user_id','uuid'),
 ('discover_daily_sets','user_id','uuid'),
 ('discover_batches','user_id','uuid'),
 ('discover_known','user_id','uuid'),
 ('expression_voice_files','user_id','uuid'),
 ('review_events','collection_id','uuid'),
 ('learning_add_events','collection_id','uuid'),
 ('discover_profiles','collection_id','uuid'),
 ('discover_assessments','collection_id','uuid'),
 ('discover_daily_sets','collection_id','uuid'),
 ('discover_batches','collection_id','uuid'),
 ('discover_known','collection_id','uuid'),
 ('expression_voice_files','collection_id','uuid')), functions as (
 select signature,to_regprocedure(signature) as oid from (values ('public.noted_collections_snapshot()'),('public.noted_default_collection(uuid)'),('public.learning_calendar(date,text)'),('public.noted_guard_duplicate_word()'),('public.discover_unseen_vocabulary(uuid)'),('public.discover_create_batch(uuid,text)'),('public.discover_action(text,jsonb,text)'),('public.learning_collection_calendar(date,text,uuid)'),('public.noted_reorder_collections(uuid[])'),('public.noted_collection_capture_key(text)'),('public.noted_collection_level_changed()')) f(signature)
)
select jsonb_build_object(
 'server_version',current_setting('server_version'),
 'foundation_marker',obj_description(to_regclass('public.learning_collections'),'pg_class'),
 'column_checks',(select jsonb_agg(jsonb_build_object('table',r.rel,'column',r.col,'expected',r.typ,'actual',format_type(a.atttypid,a.atttypmod),'compatible',coalesce(a.atttypid=to_regtype(r.typ),false)) order by r.rel,r.col) from required r left join pg_attribute a on a.attrelid=to_regclass('public.'||r.rel) and a.attname=r.col and not a.attisdropped),
 'functions',(select jsonb_agg(jsonb_build_object('signature',signature,'exists',oid is not null,'marker',obj_description(oid,'pg_proc'),'definition_hash',md5(pg_get_functiondef(oid)),'anonymous_can_call',has_function_privilege('anon',oid,'execute'),'authenticated_can_call',has_function_privilege('authenticated',oid,'execute')) order by signature) from functions),
 'patch_anchors',jsonb_build_object(
  'calendar_owner',coalesce(strpos(pg_get_functiondef(to_regprocedure('public.learning_calendar(date,text)')),'month_start :='),0)>0,
  'calendar_reviewed',coalesce(strpos(pg_get_functiondef(to_regprocedure('public.learning_calendar(date,text)')),'where user_id = actor and reviewed_at'),0)>0,
  'calendar_added',coalesce(strpos(pg_get_functiondef(to_regprocedure('public.learning_calendar(date,text)')),'where user_id = actor and created_at'),0)>0,
  'discover_exclusions',coalesce(strpos(pg_get_functiondef(to_regprocedure('public.discover_unseen_vocabulary(uuid)')),'w.user_id=p_user'),0)>0,
  'discover_batch',coalesce(strpos(pg_get_functiondef(to_regprocedure('public.discover_create_batch(uuid,text)')),'w.user_id=p_user'),0)>0,
  'discover_adaptation',coalesce(strpos(pg_get_functiondef(to_regprocedure('public.discover_create_batch(uuid,text)')),'e.user_id=p_user'),0)>0,
  'discover_save',coalesce(strpos(pg_get_functiondef(to_regprocedure('public.discover_action(text,jsonb,text)')),'select id into lib_id from public.words where user_id=uid and'),0)>0),
 'enabled_in_snapshot',coalesce(strpos(pg_get_functiondef(to_regprocedure('public.noted_collections_snapshot()')),$flag$'multilingual_enabled',true$flag$),0)>0,
 'learning_ready_in_snapshot',coalesce(strpos(pg_get_functiondef(to_regprocedure('public.noted_collections_snapshot()')),$flag$'learning_ready',true$flag$),0)>0,
 'rls',(select jsonb_agg(jsonb_build_object('table',c.relname,'enabled',c.relrowsecurity) order by c.relname) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('words','review_events','learning_add_events','discover_profiles','discover_assessments','discover_daily_sets','discover_batches','discover_known','expression_voice_files','learning_collections','learning_languages')),
 'policies',(select jsonb_agg(jsonb_build_object('table',tablename,'name',policyname,'command',cmd,'roles',roles,'using',qual,'check',with_check) order by tablename,policyname) from pg_policies where schemaname='public' and tablename in ('learning_collections','learning_languages','words','review_events')),
 'collection_grants',(select jsonb_agg(jsonb_build_object('role',grantee,'privilege',privilege_type,'column',column_name) order by grantee,column_name,privilege_type) from information_schema.column_privileges where table_schema='public' and table_name='learning_collections' and grantee in ('authenticated','anon','PUBLIC')),
 'phase2_indexes',(select jsonb_agg(indexdef) from pg_indexes where schemaname='public' and indexname='words_collection_capture_lookup'),
 'phase2_triggers',(select jsonb_agg(pg_get_triggerdef(oid)) from pg_trigger where not tgisinternal and tgname in ('noted_collection_duplicate_edit','noted_collection_level_changed'))
) as noted_collections_learning_preflight;
rollback;
