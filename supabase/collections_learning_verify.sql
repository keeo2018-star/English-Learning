-- Read-only Phase 2 activation verification. Send the complete JSON.
begin read only;
select jsonb_build_object(
 'marker',obj_description(to_regprocedure('public.learning_collection_calendar(date,text,uuid)'),'pg_proc'),
 'snapshot_marker',obj_description(to_regprocedure('public.noted_collections_snapshot()'),'pg_proc'),
 'enabled_in_snapshot',strpos(pg_get_functiondef('public.noted_collections_snapshot()'::regprocedure),'''multilingual_enabled'',true')>0,
 'discover_scoped',(select count(*)=3 from pg_proc p where p.oid in ('public.discover_unseen_vocabulary(uuid)'::regprocedure,'public.discover_create_batch(uuid,text)'::regprocedure,'public.discover_action(text,jsonb,text)'::regprocedure) and obj_description(p.oid,'pg_proc')='noted-collections-learning-v1'),
 'calendar_owner_check',strpos(pg_get_functiondef('public.learning_collection_calendar(date,text,uuid)'::regprocedure),'Collection unavailable.')>0,
 'anonymous_calendar_access',has_function_privilege('anon','public.learning_collection_calendar(date,text,uuid)','execute'),
 'authenticated_calendar_access',has_function_privilege('authenticated','public.learning_collection_calendar(date,text,uuid)','execute'),
 'anonymous_reorder_access',has_function_privilege('anon','public.noted_reorder_collections(uuid[])','execute'),
 'authenticated_reorder_access',has_function_privilege('authenticated','public.noted_reorder_collections(uuid[])','execute')
) as noted_collections_learning_verification;
rollback;
