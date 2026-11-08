-- Noted continuous Discover. Run continuous_discover_preflight.sql first.
-- Requires the original Discover migration; preserves old tables, rows and review progress.
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

-- Only unseen normalized vocabulary is eligible. Assigned batches also reserve
-- their remaining words, so refreshes/devices never silently repeat a batch.
create or replace function public.discover_unseen_vocabulary(p_user uuid) returns setof public.discover_vocabulary
language sql stable security definer set search_path=pg_catalog,public as $$
 with excluded as (
  select lower(btrim(regexp_replace(normalize(w.word,NFKC),'\s+',' ','g'))) word from public.words w where w.user_id=p_user
  union select lower(btrim(regexp_replace(normalize(v.word,NFKC),'\s+',' ','g'))) from public.discover_known k join public.discover_vocabulary v on v.id=k.vocabulary_id where k.user_id=p_user
  union select lower(btrim(regexp_replace(normalize(v.word,NFKC),'\s+',' ','g'))) from public.discover_batches d cross join lateral unnest(d.item_ids) u(id) join public.discover_vocabulary v on v.id=u.id where d.user_id=p_user
 )
 select distinct on(lower(btrim(regexp_replace(normalize(v.word,NFKC),'\s+',' ','g')))) v.* from public.discover_vocabulary v
 where v.dataset_version='noted-discover-1' and not exists(select 1 from excluded e where e.word=lower(btrim(regexp_replace(normalize(v.word,NFKC),'\s+',' ','g'))))
 order by lower(btrim(regexp_replace(normalize(v.word,NFKC),'\s+',' ','g'))),abs(v.level-(select round(recommendation_level) from public.discover_profiles where user_id=p_user)),v.frequency desc,v.id;
$$;

create or replace function public.discover_daily_payload(p_set uuid) returns jsonb language sql stable security definer set search_path=pg_catalog,public as $$
 select to_jsonb(d)||jsonb_build_object('remaining_count',(select count(*) from public.discover_unseen_vocabulary(d.user_id)),'items',coalesce((select jsonb_agg(jsonb_build_object('id',v.id,'word',v.word,'meaning',v.meaning,'pos',v.pos,'example',v.example,'definition',v.definition,'level',v.level,'item_type',v.item_type) order by u.ord)
 from unnest(d.item_ids) with ordinality u(id,ord) join public.discover_vocabulary v on v.id=u.id),'[]'::jsonb)) from public.discover_batches d where d.id=p_set;
$$;
create or replace function public.discover_create_batch(p_user uuid,p_timezone text) returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$
declare today date:=(now() at time zone p_timezone)::date; found_id uuid:=gen_random_uuid(); target numeric; desired integer; ids integer[]; known_total integer; known_yes integer; reviews integer; review_items integer; sure_count integer; delta numeric:=0; review_since timestamptz; discover_since timestamptz; consume_review boolean:=false; consume_discover boolean:=false;
begin
 select recommendation_level,adapted_review_at,adapted_discover_at into target,review_since,discover_since from public.discover_profiles where user_id=p_user;
 -- Saving is interest, not failure. Only repeated recognition and actual review events tune difficulty.
 select count(*),count(*) filter(where r.value->>'action'='know') into known_total,known_yes from public.discover_batches d cross join lateral jsonb_each(d.responses) r where d.user_id=p_user and (r.value->>'responded_at')::timestamptz>greatest(coalesce(discover_since,now()-interval '7 days'),now()-interval '7 days');
 if known_total>=20 and known_yes::numeric/known_total>=0.85 then delta:=0.25; consume_discover:=true; end if;
 select count(*),count(distinct e.learning_item_id),count(*) filter(where e.familiarity_rating='sure') into reviews,review_items,sure_count
 from public.review_events e where e.user_id=p_user and e.reviewed_at>greatest(coalesce(review_since,now()-interval '14 days'),now()-interval '14 days') and (exists (
  select 1 from public.discover_batches d cross join lateral jsonb_each(d.responses) r where d.user_id=p_user and r.value->>'library_id'=e.learning_item_id::text and r.value->>'action'='save') or exists(select 1 from public.words w join public.discover_vocabulary v on v.word=lower(btrim(regexp_replace(normalize(w.word,NFKC),'\s+',' ','g'))) where w.id=e.learning_item_id and w.user_id=p_user and abs(v.level-round(target))<=1));
 if reviews>=10 and review_items>=5 then
  if sure_count::numeric/reviews<0.45 then delta:=-0.25; consume_review:=true; elsif sure_count::numeric/reviews>=0.85 then delta:=0.25; consume_review:=true; end if;
 end if;
 target:=greatest(1,least(6,target+delta)); desired:=round(target);
 with candidates as (select * from public.discover_unseen_vocabulary(p_user)),
 near as (select id from candidates where level=desired order by frequency desc,md5(found_id::text||id::text) limit 8),
 higher as (select id from candidates where level=least(6,desired+1) and id not in(select id from near) order by frequency desc,md5(found_id::text||id::text) limit 2),
 initial as (select id from near union all select id from higher),
 fill as (select id from candidates where id not in(select id from initial) order by abs(level-desired),frequency desc,md5(found_id::text||id::text) limit greatest(0,10-(select count(*)::int from initial)))
 select coalesce(array_agg(id order by md5(found_id::text||id::text)),'{}') into ids from (select id from initial union all select id from fill) picked;
 insert into public.discover_batches(id,user_id,local_date,timezone,item_ids,difficulty) values(found_id,p_user,today,p_timezone,ids,target);
 update public.discover_profiles set active_discover_batch=found_id,recommendation_level=target,adapted_review_at=case when consume_review then now() else adapted_review_at end,adapted_discover_at=case when consume_discover then now() else adapted_discover_at end,updated_at=now() where user_id=p_user;
 return found_id;
end $$;
create or replace function public.discover_ensure_daily(p_user uuid,p_timezone text) returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$
declare found_id uuid;
begin
 select b.id into found_id from public.discover_profiles p join public.discover_batches b on b.id=p.active_discover_batch and b.user_id=p.user_id where p.user_id=p_user;
 if found_id is null then select id into found_id from public.discover_batches where user_id=p_user order by created_at desc,id desc limit 1; end if;
 if found_id is not null then update public.discover_profiles set active_discover_batch=found_id where user_id=p_user and active_discover_batch is distinct from found_id; return found_id; end if;
 return public.discover_create_batch(p_user,p_timezone);
end $$;
create or replace function public.discover_snapshot(p_user uuid,p_timezone text) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare a jsonb; d uuid; p jsonb;
begin
 select to_jsonb(x) into p from public.discover_profiles x where user_id=p_user;
 select to_jsonb(x) into a from public.discover_assessments x where user_id=p_user and (status='in_progress' or (status='completed' and not result_seen)) order by created_at desc limit 1;
 select b.id into d from public.discover_profiles p join public.discover_batches b on b.id=p.active_discover_batch and b.user_id=p.user_id where p.user_id=p_user;
 if d is null then select id into d from public.discover_batches where user_id=p_user order by created_at desc,id desc limit 1; end if;
 return jsonb_build_object('discover_version',2,'profile',p,'assessment',a,'daily',case when d is not null then public.discover_daily_payload(d) else null end);
end $$;
create or replace function public.discover_action(p_action text,p_payload jsonb default '{}',p_timezone text default 'UTC') returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare uid uuid:=auth.uid(); a public.discover_assessments; d public.discover_batches; v public.discover_vocabulary;
 answer integer; item integer; position integer; correct boolean; v_streak integer; difficulty integer; v_responses jsonb; estimate integer; lib_id uuid; added boolean:=false; set_id uuid; response jsonb;
begin
 if uid is null then raise insufficient_privilege using message='Sign in to use Discover.'; end if;
 if p_timezone is null or not exists(select 1 from pg_timezone_names where name=p_timezone) then raise exception 'Invalid timezone.'; end if;
 if pg_column_size(p_payload)>4096 then raise exception 'Request too large.'; end if;
 perform pg_advisory_xact_lock(hashtextextended('noted-discover:'||uid::text,0));
 insert into public.discover_profiles(user_id) values(uid) on conflict do nothing;
 if p_action='get' then null;
 elsif p_action='skip' then
  update public.discover_assessments set status='abandoned' where user_id=uid and status='in_progress';
  update public.discover_profiles set assessment_status=case when assessment_status='pending' then 'skipped' else assessment_status end,updated_at=now() where user_id=uid;
  perform public.discover_ensure_daily(uid,p_timezone);
 elsif p_action='assessment_start' then
  if p_payload ? 'request_id' and exists(select 1 from public.discover_assessments where user_id=uid and id=(p_payload->>'request_id')::uuid) then return public.discover_snapshot(uid,p_timezone); end if;
  if not coalesce((p_payload->>'retake')::boolean,false) and exists(select 1 from public.discover_profiles where user_id=uid and assessment_status<>'pending') then return public.discover_snapshot(uid,p_timezone); end if;
  select * into a from public.discover_assessments where user_id=uid and status='in_progress';
  if a.id is not null and coalesce((p_payload->>'retake')::boolean,false) then update public.discover_assessments set status='abandoned' where id=a.id; a.id:=null; end if;
  if a.id is null then
   update public.discover_assessments set result_seen=true where user_id=uid and status='completed' and not result_seen;
   insert into public.discover_assessments(id,user_id) values(coalesce((p_payload->>'request_id')::uuid,gen_random_uuid()),uid) returning * into a;
   update public.discover_assessments set question=public.discover_question(uid,a.id,3,'[]') where id=a.id;
  end if;
 elsif p_action='assessment_answer' then
  select * into a from public.discover_assessments where user_id=uid and id=(p_payload->>'session_id')::uuid;
  if a.id is null then raise exception 'Assessment unavailable.'; end if;
  position:=(p_payload->>'position')::integer; item:=(p_payload->>'item_id')::integer; answer:=coalesce((p_payload->>'answer_id')::integer,0);
  if position is null or item is null or position<0 then raise exception 'Invalid answer.'; end if;
  if position<jsonb_array_length(a.responses) then
   if (a.responses->position->>'item_id')::integer<>item then raise exception 'Assessment changed. Refresh to continue.'; end if;
   return public.discover_snapshot(uid,p_timezone);
  end if;
  if a.status<>'in_progress' or position<>jsonb_array_length(a.responses) or item<>(a.question->>'id')::integer then raise exception 'Assessment changed. Refresh to continue.'; end if;
  if answer<>0 and not exists(select 1 from jsonb_array_elements(a.question->'choices') x where (x->>'id')::integer=answer) then raise exception 'Invalid answer choice.'; end if;
  correct:=answer=item;
  v_streak:=case when correct then case when a.streak>0 then a.streak+1 else 1 end else case when a.streak<0 then a.streak-1 else -1 end end;
  difficulty:=a.current_level;
  if abs(v_streak)>=2 then difficulty:=greatest(1,least(6,difficulty+case when v_streak>0 then 1 else -1 end)); v_streak:=0; end if;
  v_responses:=a.responses||jsonb_build_array(jsonb_build_object('item_id',item,'answer_id',answer,'correct',correct,'level',(a.question->>'level')::integer,'answered_at',now()));
  if jsonb_array_length(v_responses)>=16 then
   select greatest(1,least(6,round(avg((r.value->>'level')::numeric+case when (r.value->>'correct')::boolean then 0.5 else -0.5 end))))::integer into estimate from jsonb_array_elements(v_responses) with ordinality r(value,ord) where ord>8;
   update public.discover_assessments set responses=v_responses,current_level=difficulty,streak=v_streak,status='completed',estimated_level=estimate,completed_at=now(),question=null where id=a.id;
   update public.discover_profiles set starting_level=estimate,recommendation_level=case when assessment_status='pending' then estimate else greatest(1,least(6,recommendation_level+greatest(-1,least(1,(estimate-recommendation_level)/2)))) end,assessment_status='completed',updated_at=now() where user_id=uid;
  else
   update public.discover_assessments set responses=v_responses,current_level=difficulty,streak=v_streak,question=public.discover_question(uid,a.id,difficulty,v_responses) where id=a.id;
  end if;
 elsif p_action='assessment_accept' then
  if not exists(select 1 from public.discover_assessments where user_id=uid and id=(p_payload->>'session_id')::uuid and status='completed') then raise exception 'Assessment unavailable.'; end if;
  update public.discover_assessments set result_seen=true where user_id=uid and id=(p_payload->>'session_id')::uuid and status='completed';
  perform public.discover_ensure_daily(uid,p_timezone);
 elsif p_action='daily' then
  if exists(select 1 from public.discover_profiles where user_id=uid and assessment_status='pending') then raise exception 'Start or skip the vocabulary check first.'; end if;
  perform public.discover_ensure_daily(uid,p_timezone);
 elsif p_action='next_batch' then
  if exists(select 1 from public.discover_profiles where user_id=uid and assessment_status='pending') then raise exception 'Start or skip the vocabulary check first.'; end if;
  set_id:=public.discover_ensure_daily(uid,p_timezone);
  -- The completed predecessor is an idempotency key. A retry or stale device
  -- returns the current batch instead of creating or skipping another one.
  if p_payload->>'set_id' is null then raise exception 'Missing completed batch.'; end if;
  if not exists(select 1 from public.discover_batches where id=(p_payload->>'set_id')::uuid and user_id=uid) then raise exception 'Discover batch unavailable.'; end if;
  if set_id<>(p_payload->>'set_id')::uuid then return public.discover_snapshot(uid,p_timezone); end if;
  select * into d from public.discover_batches where id=set_id and user_id=uid;
  if exists(select 1 from unnest(d.item_ids) u(item_id) where not(d.responses ? item_id::text)) then raise exception 'Finish this batch before starting another.'; end if;
  if exists(select 1 from public.discover_unseen_vocabulary(uid)) then perform public.discover_create_batch(uid,p_timezone); end if;
 elsif p_action='daily_response' then
  select * into d from public.discover_batches where user_id=uid and id=(p_payload->>'set_id')::uuid;
  item:=(p_payload->>'item_id')::integer;
  if d.id is null or item is null or not(item=any(d.item_ids)) then raise exception 'Discover item unavailable.'; end if;
  if not(d.responses ? item::text) then
   if p_payload->>'response' not in ('know','save') or p_payload->>'response' is null then raise exception 'Invalid response.'; end if;
   select * into v from public.discover_vocabulary where id=item;
   if p_payload->>'response'='save' then
    perform pg_advisory_xact_lock(hashtextextended(uid::text||':'||lower(btrim(regexp_replace(normalize(v.word,NFKC),'\s+',' ','g'))),0));
    select id into lib_id from public.words where user_id=uid and lower(btrim(regexp_replace(normalize(word,NFKC),'\s+',' ','g')))=lower(btrim(regexp_replace(normalize(v.word,NFKC),'\s+',' ','g'))) order by created_at,id limit 1;
    if lib_id is null then
     insert into public.words(user_id,word,meaning,example,item_type,due_at,interval_days,review_state) values(uid,v.word,case v.pos when 'n' then 'n. ' when 'v' then 'v. ' when 'a' then 'adj. ' when 'r' then 'adv. ' else '' end||v.meaning,v.example,v.item_type,now(),0,null) returning id into lib_id;
     added:=true;
    end if;
   else
    insert into public.discover_known(user_id,vocabulary_id) values(uid,item) on conflict(user_id,vocabulary_id) do update set known_count=public.discover_known.known_count+1,last_known_at=now();
   end if;
   response:=jsonb_build_object('action',p_payload->>'response','library_id',lib_id,'added',added,'responded_at',now());
   update public.discover_batches set responses=jsonb_set(d.responses,array[item::text],response) where id=d.id;
  end if;
  -- Keep the current batch across dates and devices; only next_batch advances it.
  perform public.discover_ensure_daily(uid,p_timezone);
 else raise exception 'Unknown Discover action.';
 end if;
 return public.discover_snapshot(uid,p_timezone);
end $$;
-- Internal helpers are never callable by API clients.
comment on function public.discover_unseen_vocabulary(uuid) is 'noted-discover-batches-v1';
comment on function public.discover_create_batch(uuid,text) is 'noted-discover-batches-v1';
revoke all on function public.discover_unseen_vocabulary(uuid), public.discover_create_batch(uuid,text) from public,anon,authenticated;
comment on function public.discover_daily_payload(uuid) is 'noted-discover-batches-v1';
comment on function public.discover_ensure_daily(uuid,text) is 'noted-discover-batches-v1';
comment on function public.discover_snapshot(uuid,text) is 'noted-discover-batches-v1';
comment on function public.discover_action(text,jsonb,text) is 'noted-discover-batches-v1';
revoke all on function public.discover_question(uuid,uuid,integer,jsonb), public.discover_daily_payload(uuid), public.discover_ensure_daily(uuid,text), public.discover_snapshot(uuid,text), public.discover_action(text,jsonb,text) from public,anon,authenticated;
grant execute on function public.discover_action(text,jsonb,text) to authenticated;
notify pgrst,'reload schema';
commit;
