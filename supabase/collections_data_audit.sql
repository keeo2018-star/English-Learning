-- Run before AND after the foundation migration. Compare hashes and counts.
-- Output contains aggregate fingerprints, not personal meanings or recordings.
begin read only;
set local timezone='UTC';
select 'words' as relation,count(*) as rows,md5(coalesce(string_agg(md5((to_jsonb(t)-'collection_id')::text),'' order by (to_jsonb(t)-'collection_id')::text),'')) as original_data_hash from public.words t
union all select 'review_events',count(*),md5(coalesce(string_agg(md5((to_jsonb(t)-'collection_id')::text),'' order by (to_jsonb(t)-'collection_id')::text),'')) from public.review_events t
union all select 'learning_add_events',count(*),md5(coalesce(string_agg(md5((to_jsonb(t)-'collection_id')::text),'' order by (to_jsonb(t)-'collection_id')::text),'')) from public.learning_add_events t
union all select 'discover_profiles',count(*),md5(coalesce(string_agg(md5((to_jsonb(t)-'collection_id')::text),'' order by (to_jsonb(t)-'collection_id')::text),'')) from public.discover_profiles t
union all select 'discover_assessments',count(*),md5(coalesce(string_agg(md5((to_jsonb(t)-'collection_id')::text),'' order by (to_jsonb(t)-'collection_id')::text),'')) from public.discover_assessments t
union all select 'discover_daily_sets',count(*),md5(coalesce(string_agg(md5((to_jsonb(t)-'collection_id')::text),'' order by (to_jsonb(t)-'collection_id')::text),'')) from public.discover_daily_sets t
union all select 'discover_batches',count(*),md5(coalesce(string_agg(md5((to_jsonb(t)-'collection_id')::text),'' order by (to_jsonb(t)-'collection_id')::text),'')) from public.discover_batches t
union all select 'discover_known',count(*),md5(coalesce(string_agg(md5((to_jsonb(t)-'collection_id')::text),'' order by (to_jsonb(t)-'collection_id')::text),'')) from public.discover_known t
union all select 'expression_voice_files',count(*),md5(coalesce(string_agg(md5((to_jsonb(t)-'collection_id')::text),'' order by (to_jsonb(t)-'collection_id')::text),'')) from public.expression_voice_files t;
rollback;
