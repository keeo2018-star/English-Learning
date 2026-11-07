create or replace function public.discover_question(p_user uuid,p_session uuid,p_level integer,p_responses jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare target public.discover_vocabulary; result jsonb; used integer[]; recent integer[]; probe integer; choices jsonb;
begin
 select coalesce(array_agg((r->>'item_id')::integer),'{}') into used from jsonb_array_elements(p_responses) r;
 select coalesce(array_agg(distinct (x->>'item_id')::integer),'{}') into recent from public.discover_assessments a cross join lateral jsonb_array_elements(a.responses) x where a.user_id=p_user and a.id<>p_session and a.created_at>now()-interval '30 days';
 probe:=greatest(1,least(6,p_level + case when jsonb_array_length(p_responses)%8=3 then -1 when jsonb_array_length(p_responses)%8=7 then 1 else 0 end));
 select v.* into target from public.discover_vocabulary v where not(v.id=any(used)) and v.dataset_version='noted-discover-1' and v.item_type='word'
 order by case when v.id=any(recent) then 1 else 0 end,
 abs(v.level-probe),md5(p_session::text||':'||v.id::text) limit 1;
 if target.id is null then raise exception 'The vocabulary collection cannot supply another question.'; end if;
 select jsonb_agg(jsonb_build_object('id',q.id,'meaning',q.meaning) order by md5(p_session::text||':'||target.id::text||':'||q.id::text)) into choices from (
  select target.id,target.meaning union all
  (select q.id,q.meaning from (select distinct on(v.meaning) v.id,v.meaning,v.level from public.discover_vocabulary v where v.id<>target.id and v.item_type='word' and v.pos=target.pos
   and not(v.meaning=any(target.alternate_meanings)) and not(target.meaning=any(v.alternate_meanings))
   and not(v.synset=any(target.related_synsets)) and not(target.synset=any(v.related_synsets))
   order by v.meaning,abs(v.level-target.level),md5(p_session::text||v.id::text)) q order by abs(q.level-target.level),md5(p_session::text||target.id::text||q.id::text) limit 3)
 ) q;
 if jsonb_array_length(choices)<>4 then raise exception 'Not enough distinct verified answer choices.'; end if;
 return jsonb_build_object('id',target.id,'word',target.word,'pos',target.pos,'example',target.example,'level',target.level,'choices',choices);
end $$;
create or replace function public.discover_daily_payload(p_set uuid) returns jsonb language sql stable security definer set search_path=pg_catalog,public as $$
 select to_jsonb(d)||jsonb_build_object('items',coalesce((select jsonb_agg(jsonb_build_object('id',v.id,'word',v.word,'meaning',v.meaning,'pos',v.pos,'example',v.example,'definition',v.definition,'level',v.level) order by u.ord)
 from unnest(d.item_ids) with ordinality u(id,ord) join public.discover_vocabulary v on v.id=u.id),'[]'::jsonb)) from public.discover_daily_sets d where d.id=p_set;
$$;
create or replace function public.discover_ensure_daily(p_user uuid,p_timezone text) returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$
declare today date:=(now() at time zone p_timezone)::date; found_id uuid; target numeric; desired integer; ids integer[]; recent_days integer; known_total integer; known_yes integer; reviews integer; review_items integer; sure_count integer; delta numeric:=0; review_since timestamptz; discover_since timestamptz; consume_review boolean:=false; consume_discover boolean:=false;
begin
 select id into found_id from public.discover_daily_sets where user_id=p_user and local_date=today;
 if found_id is not null then return found_id; end if;
 select recommendation_level,adapted_review_at,adapted_discover_at into target,review_since,discover_since from public.discover_profiles where user_id=p_user;
 -- Saving is interest, not failure. Only repeated recognition and actual review events tune difficulty.
 select count(*),count(*) filter(where r.value->>'action'='know') into known_total,known_yes from public.discover_daily_sets d cross join lateral jsonb_each(d.responses) r where d.user_id=p_user and d.local_date>=today-7 and (r.value->>'responded_at')::timestamptz>coalesce(discover_since,now()-interval '7 days');
 if known_total>=20 and known_yes::numeric/known_total>=0.85 then delta:=0.25; consume_discover:=true; end if;
 select count(*),count(distinct e.learning_item_id),count(*) filter(where e.familiarity_rating='sure') into reviews,review_items,sure_count
 from public.review_events e where e.user_id=p_user and e.reviewed_at>greatest(coalesce(review_since,now()-interval '14 days'),now()-interval '14 days') and (exists (
  select 1 from public.discover_daily_sets d cross join lateral jsonb_each(d.responses) r where d.user_id=p_user and r.value->>'library_id'=e.learning_item_id::text and r.value->>'action'='save') or exists(select 1 from public.words w join public.discover_vocabulary v on v.word=lower(regexp_replace(btrim(normalize(w.word,NFKC)),'\s+',' ','g')) where w.id=e.learning_item_id and w.user_id=p_user and abs(v.level-round(target))<=1));
 if reviews>=10 and review_items>=5 then
  if sure_count::numeric/reviews<0.45 then delta:=-0.25; consume_review:=true; elsif sure_count::numeric/reviews>=0.85 then delta:=0.25; consume_review:=true; end if;
 end if;
 target:=greatest(1,least(6,target+delta)); desired:=round(target);
 foreach recent_days in array array[21,7,0] loop
  with candidates as (
   select v.* from public.discover_vocabulary v where v.dataset_version='noted-discover-1'
   and not exists(select 1 from public.words w where w.user_id=p_user and lower(regexp_replace(btrim(normalize(w.word,NFKC)),'\s+',' ','g'))=v.word)
   and not exists(select 1 from public.discover_known k where k.user_id=p_user and k.vocabulary_id=v.id and k.last_known_at>now()-case when k.known_count>=2 then interval '180 days' else interval '30 days' end)
   and (recent_days=0 or not exists(select 1 from public.discover_daily_sets d where d.user_id=p_user and d.local_date>=today-recent_days and v.id=any(d.item_ids)))
  ), near as (select id from candidates where level=desired order by frequency desc,md5(p_user::text||today::text||id::text) limit 8),
  higher as (select id from candidates where level=least(6,desired+1) and id not in(select id from near) order by frequency desc,md5(p_user::text||today::text||id::text) limit 2),
  initial as (select id from near union all select id from higher),
  fill as (select id from candidates where id not in(select id from initial) order by abs(level-desired),frequency desc,md5(p_user::text||today::text||id::text) limit greatest(0,10-(select count(*)::int from initial)))
  select coalesce(array_agg(id order by md5(p_user::text||today::text||id::text)),'{}') into ids from (select id from initial union all select id from fill) picked;
  exit when cardinality(ids)>=10;
 end loop;
 insert into public.discover_daily_sets(user_id,local_date,timezone,item_ids,difficulty) values(p_user,today,p_timezone,ids,target) returning id into found_id;
 update public.discover_profiles set recommendation_level=target,adapted_review_at=case when consume_review then now() else adapted_review_at end,adapted_discover_at=case when consume_discover then now() else adapted_discover_at end,updated_at=now() where user_id=p_user;
 return found_id;
end $$;
create or replace function public.discover_snapshot(p_user uuid,p_timezone text) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare a jsonb; d uuid; p jsonb;
begin
 select to_jsonb(x) into p from public.discover_profiles x where user_id=p_user;
 select to_jsonb(x) into a from public.discover_assessments x where user_id=p_user and (status='in_progress' or (status='completed' and not result_seen)) order by created_at desc limit 1;
 select id into d from public.discover_daily_sets where user_id=p_user and local_date=(now() at time zone p_timezone)::date;
 return jsonb_build_object('profile',p,'assessment',a,'daily',case when d is not null then public.discover_daily_payload(d) else null end);
end $$;
create or replace function public.discover_action(p_action text,p_payload jsonb default '{}',p_timezone text default 'UTC') returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare uid uuid:=auth.uid(); a public.discover_assessments; d public.discover_daily_sets; v public.discover_vocabulary;
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
 elsif p_action='daily_response' then
  select * into d from public.discover_daily_sets where user_id=uid and id=(p_payload->>'set_id')::uuid;
  item:=(p_payload->>'item_id')::integer;
  if d.id is null or item is null or not(item=any(d.item_ids)) then raise exception 'Daily item unavailable.'; end if;
  if not(d.responses ? item::text) then
   if p_payload->>'response' not in ('know','save') or p_payload->>'response' is null then raise exception 'Invalid response.'; end if;
   select * into v from public.discover_vocabulary where id=item;
   if p_payload->>'response'='save' then
    perform pg_advisory_xact_lock(hashtextextended(uid::text||':'||v.word,0));
    select id into lib_id from public.words where user_id=uid and lower(regexp_replace(btrim(normalize(word,NFKC)),'\s+',' ','g'))=v.word order by created_at,id limit 1;
    if lib_id is null then
     insert into public.words(user_id,word,meaning,example,item_type,due_at,interval_days,review_state) values(uid,v.word,case v.pos when 'n' then 'n. ' when 'v' then 'v. ' when 'a' then 'adj. ' when 'r' then 'adv. ' else '' end||v.meaning,v.example,v.item_type,now(),0,null) returning id into lib_id;
     added:=true;
    end if;
   else
    insert into public.discover_known(user_id,vocabulary_id) values(uid,item) on conflict(user_id,vocabulary_id) do update set known_count=public.discover_known.known_count+1,last_known_at=now();
   end if;
   response:=jsonb_build_object('action',p_payload->>'response','library_id',lib_id,'added',added,'responded_at',now());
   update public.discover_daily_sets set responses=jsonb_set(d.responses,array[item::text],response) where id=d.id;
  end if;
  -- A response submitted across midnight is retained in its original set.
  perform public.discover_ensure_daily(uid,p_timezone);
 else raise exception 'Unknown Discover action.';
 end if;
 return public.discover_snapshot(uid,p_timezone);
end $$;
-- Internal helpers are never callable by API clients.
comment on function public.discover_question(uuid,uuid,integer,jsonb) is 'noted-discover-v1';
comment on function public.discover_daily_payload(uuid) is 'noted-discover-v1';
comment on function public.discover_ensure_daily(uuid,text) is 'noted-discover-v1';
comment on function public.discover_snapshot(uuid,text) is 'noted-discover-v1';
comment on function public.discover_action(text,jsonb,text) is 'noted-discover-v1';
revoke all on function public.discover_question(uuid,uuid,integer,jsonb), public.discover_daily_payload(uuid), public.discover_ensure_daily(uuid,text), public.discover_snapshot(uuid,text), public.discover_action(text,jsonb,text) from public,anon,authenticated;
grant execute on function public.discover_action(text,jsonb,text) to authenticated;
notify pgrst,'reload schema';
commit;
