-- READ ONLY: use after INSTALL and again after separately approved ACTIVATION.
-- After install: dependencies_ready=true, enabled_in_snapshot=false, learning_ready_in_snapshot=false.
-- After activation: all three true. Send complete JSON + both fresh fingerprints.
begin read only;
set local statement_timeout='30s';
with links as (
 select x.collection_id,x.user_id from public.words x
 union all
 select x.collection_id,x.user_id from public.review_events x
 union all
 select x.collection_id,x.user_id from public.learning_add_events x
 union all
 select x.collection_id,x.user_id from public.discover_profiles x
 union all
 select x.collection_id,x.user_id from public.discover_assessments x
 union all
 select x.collection_id,x.user_id from public.discover_daily_sets x
 union all
 select x.collection_id,x.user_id from public.discover_batches x
 union all
 select x.collection_id,x.user_id from public.discover_known x
 union all
 select x.collection_id,x.user_id from public.expression_voice_files x
), required_functions(signature) as (values
 ('public.noted_collections_snapshot()'),('public.learning_collection_calendar(date,text,uuid)'),('public.noted_reorder_collections(uuid[])'),('public.noted_collection_capture_key(text)'),('public.noted_collection_level_changed()'),('public.noted_guard_duplicate_word()'),('public.discover_unseen_vocabulary(uuid)'),('public.discover_create_batch(uuid,text)'),('public.discover_action(text,jsonb,text)')
), rpc(signature) as (values ('public.noted_collections_snapshot()'),('public.learning_collection_calendar(date,text,uuid)'),('public.noted_reorder_collections(uuid[])'))
, health as (select jsonb_build_object(
 'foundation_markers',obj_description(to_regclass('public.learning_collections'),'pg_class')='noted-collections-v1' and obj_description(to_regclass('public.learning_languages'),'pg_class')='noted-collections-v1',
 'known_functions',not exists(select 1 from required_functions where obj_description(to_regprocedure(signature),'pg_proc') is distinct from 'noted-collections-learning-v1'),
 'owner_rls',(select count(*)=11 and bool_and(relrowsecurity) from pg_class where oid in (to_regclass('public.words'),to_regclass('public.review_events'),to_regclass('public.learning_add_events'),to_regclass('public.discover_profiles'),to_regclass('public.discover_assessments'),to_regclass('public.discover_daily_sets'),to_regclass('public.discover_batches'),to_regclass('public.discover_known'),to_regclass('public.expression_voice_files'),to_regclass('public.learning_collections'),to_regclass('public.learning_languages'))),
 'collection_ownership',not exists(select 1 from links x left join public.learning_collections c on c.id=x.collection_id where c.id is null or c.user_id is distinct from x.user_id),
 'voice_ownership',not exists(select 1 from public.expression_voice_files f left join public.words w on w.id=f.item_id where w.id is null or f.collection_id is distinct from w.collection_id or f.user_id is distinct from w.user_id),
 'rpc_permissions',not exists(select 1 from rpc where coalesce(has_function_privilege('anon',to_regprocedure(signature),'execute'),true) or not coalesce(has_function_privilege('authenticated',to_regprocedure(signature),'execute'),false)),
 'private_helpers',not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('noted_collection_guard','noted_collection_binding','noted_default_collection','noted_guard_duplicate_word','noted_collection_level_changed') and (has_function_privilege('anon',p.oid,'execute') or has_function_privilege('authenticated',p.oid,'execute'))),
 'rpc_security',not exists(select 1 from rpc left join pg_proc p on p.oid=to_regprocedure(signature) where p.oid is null or p.prosecdef is distinct from (signature<>'public.learning_collection_calendar(date,text,uuid)') or not coalesce(p.proconfig @> array['search_path=""'],false)),
 'calendar_scoped',coalesce(strpos(pg_get_functiondef(to_regprocedure('public.learning_collection_calendar(date,text,uuid)')),'Collection unavailable.'),0)>0 and coalesce(strpos(pg_get_functiondef(to_regprocedure('public.learning_collection_calendar(date,text,uuid)')),'where user_id = actor and collection_id=p_collection and reviewed_at'),0)>0 and coalesce(strpos(pg_get_functiondef(to_regprocedure('public.learning_collection_calendar(date,text,uuid)')),'where user_id = actor and collection_id=p_collection and created_at'),0)>0,
 'discover_scoped',coalesce(strpos(pg_get_functiondef(to_regprocedure('public.discover_unseen_vocabulary(uuid)')),'w.collection_id=(select id from public.learning_collections where user_id=p_user'),0)>0 and coalesce(strpos(pg_get_functiondef(to_regprocedure('public.discover_create_batch(uuid,text)')),'w.collection_id=(select id from public.learning_collections where user_id=p_user'),0)>0 and coalesce(strpos(pg_get_functiondef(to_regprocedure('public.discover_create_batch(uuid,text)')),'e.collection_id=(select id from public.learning_collections where user_id=p_user'),0)>0 and coalesce(strpos(pg_get_functiondef(to_regprocedure('public.discover_action(text,jsonb,text)')),'collection_id=(select id from public.learning_collections where user_id=uid'),0)>0,
 'lookup_index',exists(select 1 from pg_index i where i.indexrelid=to_regclass('public.words_collection_capture_lookup') and i.indisvalid and not i.indisunique and i.indnkeyatts=3 and i.indrelid=to_regclass('public.words') and i.indpred is null and replace(pg_get_indexdef(i.indexrelid),'public.','') like '%USING btree (user_id, collection_id, noted_collection_capture_key(word))'),
 'duplicate_edit_trigger',exists(select 1 from pg_trigger where tgrelid=to_regclass('public.words') and tgname='noted_collection_duplicate_edit' and tgfoid=to_regprocedure('public.noted_guard_duplicate_word()') and tgtype=19 and tgenabled='O' and tgqual is null and tgattr::text=(select attnum::text from pg_attribute where attrelid='public.words'::regclass and attname='word')),
 'level_trigger',exists(select 1 from pg_trigger where tgrelid=to_regclass('public.learning_collections') and tgname='noted_collection_level_changed' and tgfoid=to_regprocedure('public.noted_collection_level_changed()') and tgtype=17 and tgenabled='O' and tgqual is null and tgattr::text=(select attnum::text from pg_attribute where attrelid='public.learning_collections'::regclass and attname='proficiency_level'))
) as checks)
select jsonb_build_object(
 'marker',obj_description(to_regprocedure('public.learning_collection_calendar(date,text,uuid)'),'pg_proc'),
 'snapshot_marker',obj_description(to_regprocedure('public.noted_collections_snapshot()'),'pg_proc'),
 'dependencies_ready',not exists(select 1 from jsonb_each(checks) x where x.value is distinct from 'true'::jsonb),
 'checks',checks,
 'enabled_in_snapshot',coalesce(strpos(pg_get_functiondef(to_regprocedure('public.noted_collections_snapshot()')),$flag$'multilingual_enabled',true$flag$),0)>0,
 'learning_ready_in_snapshot',coalesce(strpos(pg_get_functiondef(to_regprocedure('public.noted_collections_snapshot()')),$flag$'learning_ready',true$flag$),0)>0
) as noted_collections_learning_verification from health;
rollback;
