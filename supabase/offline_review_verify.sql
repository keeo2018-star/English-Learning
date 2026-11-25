begin read only;
select jsonb_build_object(
 'offline_rpc_installed',to_regprocedure('public.record_offline_learning_review(uuid,uuid,text,integer,timestamptz,integer,jsonb,timestamptz)') is not null,
 'marker',obj_description(to_regprocedure('public.record_offline_learning_review(uuid,uuid,text,integer,timestamptz,integer,jsonb,timestamptz)'),'pg_proc'),
 'owner_rls',(select bool_and(relrowsecurity) from pg_class where oid in (to_regclass('public.words'),to_regclass('public.review_events'))),
 'authenticated_can_call',has_function_privilege('authenticated','public.record_offline_learning_review(uuid,uuid,text,integer,timestamptz,integer,jsonb,timestamptz)','EXECUTE'),
 'anon_can_call',has_function_privilege('anon','public.record_offline_learning_review(uuid,uuid,text,integer,timestamptz,integer,jsonb,timestamptz)','EXECUTE')
) as noted_offline_verification;
rollback;
