-- Read-only post-migration checks. Return the complete JSON, plus both data audits.
begin read only;
with collection_links as (
  select 'words' as relation, count(*) filter(where x.collection_id is null) as unassigned,
    count(*) filter(where c.user_id is distinct from x.user_id) as wrong_owner
  from public.words x left join public.learning_collections c on c.id=x.collection_id
  union all select 'review_events',count(*) filter(where x.collection_id is null),count(*) filter(where c.user_id is distinct from x.user_id)
  from public.review_events x left join public.learning_collections c on c.id=x.collection_id
  union all select 'learning_add_events',count(*) filter(where x.collection_id is null),count(*) filter(where c.user_id is distinct from x.user_id)
  from public.learning_add_events x left join public.learning_collections c on c.id=x.collection_id
  union all select 'discover_profiles',count(*) filter(where x.collection_id is null),count(*) filter(where c.user_id is distinct from x.user_id)
  from public.discover_profiles x left join public.learning_collections c on c.id=x.collection_id
  union all select 'discover_assessments',count(*) filter(where x.collection_id is null),count(*) filter(where c.user_id is distinct from x.user_id)
  from public.discover_assessments x left join public.learning_collections c on c.id=x.collection_id
  union all select 'discover_daily_sets',count(*) filter(where x.collection_id is null),count(*) filter(where c.user_id is distinct from x.user_id)
  from public.discover_daily_sets x left join public.learning_collections c on c.id=x.collection_id
  union all select 'discover_batches',count(*) filter(where x.collection_id is null),count(*) filter(where c.user_id is distinct from x.user_id)
  from public.discover_batches x left join public.learning_collections c on c.id=x.collection_id
  union all select 'discover_known',count(*) filter(where x.collection_id is null),count(*) filter(where c.user_id is distinct from x.user_id)
  from public.discover_known x left join public.learning_collections c on c.id=x.collection_id
  union all select 'expression_voice_files',count(*) filter(where x.collection_id is null),count(*) filter(where c.user_id is distinct from x.user_id)
  from public.expression_voice_files x left join public.learning_collections c on c.id=x.collection_id
)
select jsonb_build_object(
 'marker',obj_description(to_regclass('public.learning_collections'),'pg_class'),
 'missing_english_defaults',(select count(*) from auth.users u where not exists(select 1 from public.learning_collections c where c.user_id=u.id and c.target_language='en' and c.explanation_language='zh-CN')),
 'unassigned_words',(select unassigned from collection_links where relation='words'),
 'wrong_word_owners',(select wrong_owner from collection_links where relation='words'),
 'unassigned_reviews',(select unassigned from collection_links where relation='review_events'),
 'unassigned_additions',(select unassigned from collection_links where relation='learning_add_events'),
 'collection_links',(select jsonb_agg(to_jsonb(x) order by relation) from collection_links x),
 'mismatched_voice_items',(select count(*) from public.expression_voice_files f join public.words w on w.id=f.item_id where f.collection_id is distinct from w.collection_id or f.user_id is distinct from w.user_id),
 'rls',(select jsonb_agg(jsonb_build_object('table',relname,'enabled',relrowsecurity)) from pg_class where oid in ('public.learning_collections'::regclass,'public.learning_languages'::regclass)),
 'anonymous_can_call',has_function_privilege('anon','public.noted_collections_snapshot()','execute'),
 'authenticated_can_call',has_function_privilege('authenticated','public.noted_collections_snapshot()','execute'),
 'exposed_private_helpers',(select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname in ('noted_collection_guard','noted_collection_binding','noted_default_collection','noted_guard_duplicate_word')
   and (has_function_privilege('anon',p.oid,'execute') or has_function_privilege('authenticated',p.oid,'execute')))
) as noted_collections_verification;
rollback;
