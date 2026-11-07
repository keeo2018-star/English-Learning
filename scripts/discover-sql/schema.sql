begin;
set local lock_timeout='3s';
set local statement_timeout='60s';
do $$
declare x record; actual oid;
begin
 if to_regclass('public.words') is null or to_regclass('auth.users') is null or to_regprocedure('auth.uid()') is null then raise exception 'Run Discover preflight: existing Supabase words/auth prerequisites are missing.'; end if;
 for x in select * from (values ('words','id','uuid'),('words','user_id','uuid'),('words','word','text'),('words','meaning','text'),('words','example','text'),('words','item_type','text'),('words','review_state','jsonb'),('words','interval_days','integer'),('words','due_at','timestamp with time zone'),('words','created_at','timestamp with time zone'),('review_events','user_id','uuid'),('review_events','learning_item_id','uuid'),('review_events','reviewed_at','timestamp with time zone'),('review_events','familiarity_rating','text')) as t(tab,col,typ) loop
  select atttypid into actual from pg_attribute where attrelid=to_regclass('public.'||x.tab) and attname=x.col and attnum>0 and not attisdropped;
  if actual is distinct from to_regtype(x.typ)::oid then raise exception 'Incompatible %.%: expected %. Review preflight; nothing committed.',x.tab,x.col,x.typ; end if;
 end loop;
 for x in select c.oid,c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and (c.relname in ('discover_profiles','discover_assessments','discover_daily_sets','discover_known','discover_vocabulary','discover_one_active_assessment','discover_assessments_user_time','discover_daily_user_time','noted_words_normalized_lookup_idx')) loop
  if obj_description(x.oid,'pg_class') is distinct from 'noted-discover-v1' then raise exception 'Unrecognised existing object public.%. Review preflight.',x.relname; end if;
 end loop;
 for x in select p.oid,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('discover_action','discover_question','discover_daily_payload','discover_snapshot','discover_ensure_daily','noted_guard_duplicate_word') loop
  if obj_description(x.oid,'pg_proc') is distinct from 'noted-discover-v1' then raise exception 'Unrecognised existing function %. Review preflight.',x.proname; end if;
 end loop;
 if exists(select 1 from pg_trigger where tgrelid='public.words'::regclass and tgname='noted_discover_duplicate_guard' and obj_description(tgfoid,'pg_proc') is distinct from 'noted-discover-v1') then raise exception 'Unrecognised duplicate guard trigger. Review preflight.'; end if;
end $$;
create table if not exists public.discover_vocabulary (
 id integer primary key, word text not null, meaning text not null, pos text not null check(pos in ('n','v','a','r','expression')),
 item_type text not null default 'word' check(item_type in ('word','expression')),
 example text not null, definition text not null, level integer not null check(level between 1 and 6), frequency integer not null check(frequency>=0),
 synset text not null, alternate_meanings text[] not null, related_synsets text[] not null, dataset_version text not null default 'noted-discover-1',
 unique(dataset_version,word), check(length(meaning)>0 and length(word) between 1 and 120)
);
create table if not exists public.discover_profiles (
 user_id uuid primary key references auth.users(id) on delete cascade,
 assessment_status text not null default 'pending' check(assessment_status in ('pending','skipped','completed')),
 starting_level integer not null default 3 check(starting_level between 1 and 6),
 recommendation_level numeric not null default 3 check(recommendation_level between 1 and 6),
 adapted_review_at timestamptz, adapted_discover_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.discover_assessments (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 status text not null default 'in_progress' check(status in ('in_progress','completed','abandoned')),
 current_level integer not null default 3 check(current_level between 1 and 6), streak integer not null default 0,
 responses jsonb not null default '[]', question jsonb, estimated_level integer check(estimated_level between 1 and 6), result_seen boolean not null default false,
 algorithm_version text not null default 'noted-assessment-1', created_at timestamptz not null default now(), completed_at timestamptz
);
create unique index if not exists discover_one_active_assessment on public.discover_assessments(user_id) where status='in_progress';
create index if not exists discover_assessments_user_time on public.discover_assessments(user_id,created_at desc);
create table if not exists public.discover_daily_sets (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 local_date date not null, timezone text not null, item_ids integer[] not null, responses jsonb not null default '{}',
 difficulty numeric not null, algorithm_version text not null default 'noted-daily-1', created_at timestamptz not null default now(),
 unique(user_id,local_date), check(cardinality(item_ids)<=10)
);
create index if not exists discover_daily_user_time on public.discover_daily_sets(user_id,local_date desc);
comment on index public.discover_one_active_assessment is 'noted-discover-v1';
comment on index public.discover_assessments_user_time is 'noted-discover-v1';
comment on index public.discover_daily_user_time is 'noted-discover-v1';
create table if not exists public.discover_known (
 user_id uuid not null references auth.users(id) on delete cascade, vocabulary_id integer not null references public.discover_vocabulary(id),
 known_count integer not null default 1 check(known_count>0), last_known_at timestamptz not null default now(), primary key(user_id,vocabulary_id)
);
do $$ declare name text; begin
 foreach name in array array['discover_vocabulary','discover_profiles','discover_assessments','discover_daily_sets','discover_known'] loop
  execute format('comment on table public.%I is %L',name,'noted-discover-v1');
  execute format('alter table public.%I enable row level security',name);
  execute format('revoke all on public.%I from public, anon, authenticated',name);
  execute format('grant select on public.%I to authenticated',name);
  execute format('drop policy if exists discover_read on public.%I',name);
  if name='discover_vocabulary' then execute 'create policy discover_read on public.discover_vocabulary for select to authenticated using(true)';
  else execute format('create policy discover_read on public.%I for select to authenticated using ((select auth.uid())=user_id)',name); end if;
 end loop;
end $$;
create index if not exists noted_words_normalized_lookup_idx on public.words(user_id,lower(regexp_replace(btrim(normalize(word,NFKC)),'\s+',' ','g')));
comment on index public.noted_words_normalized_lookup_idx is 'noted-discover-v1';
-- Existing duplicates are preserved. Only new inserts are guarded, including races with Add.
create or replace function public.noted_guard_duplicate_word() returns trigger language plpgsql set search_path=pg_catalog,public as $$
begin
 if auth.uid() is not null and auth.uid()<>new.user_id then return new; end if;
 perform pg_advisory_xact_lock(hashtextextended(new.user_id::text||':'||lower(regexp_replace(btrim(normalize(new.word,NFKC)),'\s+',' ','g')),0));
 if exists(select 1 from public.words w where w.user_id=new.user_id and lower(regexp_replace(btrim(normalize(w.word,NFKC)),'\s+',' ','g'))=lower(regexp_replace(btrim(normalize(new.word,NFKC)),'\s+',' ','g'))) then
  raise unique_violation using message='This item is already in your Library.',constraint='noted_words_duplicate';
 end if;
 return new;
end $$;
comment on function public.noted_guard_duplicate_word() is 'noted-discover-v1';
revoke all on function public.noted_guard_duplicate_word() from public,anon,authenticated;
drop trigger if exists noted_discover_duplicate_guard on public.words;
create trigger noted_discover_duplicate_guard before insert on public.words for each row execute function public.noted_guard_duplicate_word();
