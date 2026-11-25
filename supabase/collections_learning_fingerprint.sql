-- READ ONLY. Run the identical file BEFORE and AFTER Phase 2 installation.
-- Includes collection_id, all original fields, users, recording metadata and Storage paths.
-- Aggregate hashes only; audio file bytes are neither read nor modified. This is not a backup.
-- Pause normal learning/editing during comparison; concurrent legitimate activity changes hashes.
begin read only;
set local timezone='UTC';
set local statement_timeout='30s';
select 'auth.users' as relation,count(*) as rows,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) as full_data_hash from auth.users t
union all
select 'public.learning_languages' as relation,count(*) as rows,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) as full_data_hash from public.learning_languages t
union all
select 'public.learning_collections' as relation,count(*) as rows,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) as full_data_hash from public.learning_collections t
union all
select 'public.learning_activity_start' as relation,count(*) as rows,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) as full_data_hash from public.learning_activity_start t
union all
select 'public.words' as relation,count(*) as rows,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) as full_data_hash from public.words t
union all
select 'public.review_events' as relation,count(*) as rows,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) as full_data_hash from public.review_events t
union all
select 'public.learning_add_events' as relation,count(*) as rows,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) as full_data_hash from public.learning_add_events t
union all
select 'public.discover_profiles' as relation,count(*) as rows,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) as full_data_hash from public.discover_profiles t
union all
select 'public.discover_assessments' as relation,count(*) as rows,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) as full_data_hash from public.discover_assessments t
union all
select 'public.discover_daily_sets' as relation,count(*) as rows,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) as full_data_hash from public.discover_daily_sets t
union all
select 'public.discover_batches' as relation,count(*) as rows,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) as full_data_hash from public.discover_batches t
union all
select 'public.discover_known' as relation,count(*) as rows,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) as full_data_hash from public.discover_known t
union all
select 'public.expression_voice_files' as relation,count(*) as rows,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) as full_data_hash from public.expression_voice_files t
union all
select 'storage.buckets' as relation,count(*) as rows,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) as full_data_hash from storage.buckets t
union all
select 'storage.objects' as relation,count(*) as rows,md5(coalesce(string_agg(md5(to_jsonb(t)::text),'' order by md5(to_jsonb(t)::text)),'')) as full_data_hash from storage.objects t
order by relation;
rollback;
