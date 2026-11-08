begin;
set local lock_timeout='3s';
set local statement_timeout='60s';
do $$
declare x record; actual oid;
begin
 for x in select * from (values
 ('discover_profiles','user_id','uuid'),('discover_profiles','assessment_status','text'),('discover_profiles','starting_level','integer'),('discover_profiles','recommendation_level','numeric'),('discover_profiles','adapted_review_at','timestamp with time zone'),('discover_profiles','adapted_discover_at','timestamp with time zone'),('discover_profiles','updated_at','timestamp with time zone'),
 ('discover_daily_sets','id','uuid'),('discover_daily_sets','user_id','uuid'),('discover_daily_sets','item_ids','integer[]'),('discover_daily_sets','responses','jsonb'),('discover_daily_sets','local_date','date'),('discover_daily_sets','timezone','text'),('discover_daily_sets','difficulty','numeric'),('discover_daily_sets','algorithm_version','text'),('discover_daily_sets','created_at','timestamp with time zone'),
 ('discover_assessments','id','uuid'),('discover_assessments','user_id','uuid'),('discover_assessments','status','text'),('discover_assessments','current_level','integer'),('discover_assessments','streak','integer'),('discover_assessments','responses','jsonb'),('discover_assessments','question','jsonb'),('discover_assessments','estimated_level','integer'),('discover_assessments','result_seen','boolean'),('discover_assessments','created_at','timestamp with time zone'),('discover_assessments','completed_at','timestamp with time zone'),
 ('discover_known','user_id','uuid'),('discover_known','vocabulary_id','integer'),('discover_known','known_count','integer'),('discover_known','last_known_at','timestamp with time zone'),
 ('discover_vocabulary','id','integer'),('discover_vocabulary','word','text'),('discover_vocabulary','meaning','text'),('discover_vocabulary','pos','text'),('discover_vocabulary','item_type','text'),('discover_vocabulary','example','text'),('discover_vocabulary','definition','text'),('discover_vocabulary','level','integer'),('discover_vocabulary','frequency','integer'),('discover_vocabulary','synset','text'),('discover_vocabulary','alternate_meanings','text[]'),('discover_vocabulary','related_synsets','text[]'),('discover_vocabulary','dataset_version','text'),
 ('words','id','uuid'),('words','user_id','uuid'),('words','word','text'),('words','meaning','text'),('words','example','text'),('words','item_type','text'),('words','review_state','jsonb'),('words','interval_days','integer'),('words','due_at','timestamp with time zone'),('words','created_at','timestamp with time zone'),
 ('review_events','user_id','uuid'),('review_events','learning_item_id','uuid'),('review_events','reviewed_at','timestamp with time zone'),('review_events','familiarity_rating','text')) as t(tab,col,typ) loop
  select atttypid into actual from pg_attribute where attrelid=to_regclass('public.'||x.tab) and attname=x.col and not attisdropped;
  if actual is distinct from to_regtype(x.typ)::oid then raise exception 'Incompatible %.%: expected %. Run continuous Discover preflight; nothing committed.',x.tab,x.col,x.typ; end if;
 end loop;
 for x in select name from unnest(array['discover_profiles','discover_daily_sets','discover_known','discover_vocabulary','discover_assessments']) name loop
  if coalesce(obj_description(to_regclass('public.'||x.name),'pg_class'),'')<>'noted-discover-v1' then raise exception 'Missing recognised Discover table %. Run preflight.',x.name; end if;
  if not exists(select 1 from pg_class where oid=to_regclass('public.'||x.name) and relrowsecurity) then raise exception 'Existing Discover RLS is not enabled on %. Review preflight.',x.name; end if;
 end loop;
 for x in select c.oid,c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('discover_batches','discover_batches_user_time','noted_words_normalized_v2_idx') loop
  if obj_description(x.oid,'pg_class') is distinct from 'noted-discover-batches-v1' then raise exception 'Unrecognised existing object %. Nothing committed.',x.relname; end if;
 end loop;
 for x in select p.oid,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('discover_action','discover_daily_payload','discover_ensure_daily','discover_snapshot','discover_create_batch','discover_unseen_vocabulary','discover_mirror_legacy_batch','noted_guard_duplicate_word') loop
  if coalesce(obj_description(x.oid,'pg_proc'),'') not in ('noted-discover-v1','noted-discover-batches-v1') then raise exception 'Unrecognised existing function %. Nothing committed.',x.proname; end if;
 end loop;
 if to_regprocedure('public.discover_action(text,jsonb,text)') is null or to_regprocedure('public.discover_question(uuid,uuid,integer,jsonb)') is null then raise exception 'Apply the original Discover migration first.'; end if;
 if exists(select 1 from pg_attribute where attrelid='public.discover_profiles'::regclass and attname='active_discover_batch' and not attisdropped and (atttypid<>'uuid'::regtype or col_description(attrelid,attnum) is distinct from 'noted-discover-batches-v1')) then raise exception 'Unrecognised active_discover_batch column.'; end if;
 if exists(select 1 from pg_trigger where tgrelid='public.discover_daily_sets'::regclass and tgname='noted_continuous_discover_mirror' and coalesce(obj_description(tgfoid,'pg_proc'),'')<>'noted-discover-batches-v1') then raise exception 'Unrecognised legacy Discover mirror trigger.'; end if;
end $$;
create table if not exists public.discover_batches (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 local_date date not null, timezone text not null, item_ids integer[] not null, responses jsonb not null default '{}',
 difficulty numeric not null, algorithm_version text not null default 'noted-continuous-1', created_at timestamptz not null default now(),
 check(cardinality(item_ids)<=10)
);
comment on table public.discover_batches is 'noted-discover-batches-v1';
alter table public.discover_batches enable row level security;
revoke all on public.discover_batches from public,anon,authenticated;
grant select on public.discover_batches to authenticated;
do $$ begin
 if exists(select 1 from pg_policy where polrelid='public.discover_batches'::regclass and polname='discover_batches_read') then
  alter policy discover_batches_read on public.discover_batches to authenticated using ((select auth.uid())=user_id);
 else
  create policy discover_batches_read on public.discover_batches for select to authenticated using ((select auth.uid())=user_id);
 end if;
end $$;
create index if not exists discover_batches_user_time on public.discover_batches(user_id,created_at desc,id);
comment on index public.discover_batches_user_time is 'noted-discover-batches-v1';
alter table public.discover_profiles add column if not exists active_discover_batch uuid references public.discover_batches(id);
comment on column public.discover_profiles.active_discover_batch is 'noted-discover-batches-v1';
-- A transaction already executing the old RPC may finish after this upgrade.
-- Mirror its legacy writes so no in-flight response or saved progress is lost.
create or replace function public.discover_mirror_legacy_batch() returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 insert into public.discover_batches(id,user_id,local_date,timezone,item_ids,responses,difficulty,algorithm_version,created_at)
 values(new.id,new.user_id,new.local_date,new.timezone,new.item_ids,new.responses,new.difficulty,new.algorithm_version,new.created_at)
 on conflict(id) do update set responses=excluded.responses||public.discover_batches.responses
 where public.discover_batches.user_id=excluded.user_id;
 return new;
end $$;
comment on function public.discover_mirror_legacy_batch() is 'noted-discover-batches-v1';
revoke all on function public.discover_mirror_legacy_batch() from public,anon,authenticated;
do $$ begin
 if not exists(select 1 from pg_trigger where tgrelid='public.discover_daily_sets'::regclass and tgname='noted_continuous_discover_mirror') then
  create trigger noted_continuous_discover_mirror after insert or update on public.discover_daily_sets for each row execute function public.discover_mirror_legacy_batch();
 end if;
end $$;
-- Copy, never remove or rewrite, the original history. Reruns never overwrite progress.
insert into public.discover_batches(id,user_id,local_date,timezone,item_ids,responses,difficulty,algorithm_version,created_at)
select id,user_id,local_date,timezone,item_ids,responses,difficulty,algorithm_version,created_at from public.discover_daily_sets on conflict(id) do nothing;
create index if not exists noted_words_normalized_v2_idx on public.words(user_id,lower(btrim(regexp_replace(normalize(word,NFKC),'\s+',' ','g'))));
comment on index public.noted_words_normalized_v2_idx is 'noted-discover-batches-v1';
-- Retain the insert-only guard, using one normalization for all capture paths.
create or replace function public.noted_guard_duplicate_word() returns trigger language plpgsql set search_path=pg_catalog,public as $$
declare normalized text:=lower(btrim(regexp_replace(normalize(new.word,NFKC),'\s+',' ','g')));
begin
 if auth.uid() is not null and auth.uid()<>new.user_id then return new; end if;
 perform pg_advisory_xact_lock(hashtextextended(new.user_id::text||':'||normalized,0));
 if exists(select 1 from public.words w where w.user_id=new.user_id and lower(btrim(regexp_replace(normalize(w.word,NFKC),'\s+',' ','g')))=normalized) then raise unique_violation using message='This item is already in your Library.',constraint='noted_words_duplicate'; end if;
 return new;
end $$;
comment on function public.noted_guard_duplicate_word() is 'noted-discover-batches-v1';
revoke all on function public.noted_guard_duplicate_word() from public,anon,authenticated;
