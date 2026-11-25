-- Phase 2 INSTALL ONLY. Replaces the f996b43 version of this file.
-- Run ONLY after collections_learning_preflight.sql has been reviewed and approved.
-- Capture collections_learning_fingerprint.sql immediately before and after.
-- Multilingual stays OFF. Separate activation requires verified results and approval.
-- No vocabulary, history, recordings, users, schedules or primary keys are rewritten.
begin;
set local lock_timeout='3s';
set local statement_timeout='60s';
do $$ declare r record;begin
 for r in select * from (values
 ('words','id','uuid'),
 ('words','user_id','uuid'),
 ('words','word','text'),
 ('words','collection_id','uuid'),
 ('review_events','reviewed_at','timestamp with time zone'),
 ('review_events','learning_item_id','uuid'),
 ('learning_add_events','created_at','timestamp with time zone'),
 ('learning_collections','id','uuid'),
 ('learning_collections','user_id','uuid'),
 ('learning_collections','target_language','text'),
 ('learning_collections','explanation_language','text'),
 ('learning_collections','proficiency_level','text'),
 ('learning_collections','display_order','integer'),
 ('learning_collections','preferences','jsonb'),
 ('learning_collections','created_at','timestamp with time zone'),
 ('learning_collections','updated_at','timestamp with time zone'),
 ('discover_profiles','recommendation_level','numeric'),
 ('review_events','user_id','uuid'),
 ('learning_add_events','user_id','uuid'),
 ('discover_profiles','user_id','uuid'),
 ('discover_assessments','user_id','uuid'),
 ('discover_daily_sets','user_id','uuid'),
 ('discover_batches','user_id','uuid'),
 ('discover_known','user_id','uuid'),
 ('expression_voice_files','user_id','uuid'),
 ('review_events','collection_id','uuid'),
 ('learning_add_events','collection_id','uuid'),
 ('discover_profiles','collection_id','uuid'),
 ('discover_assessments','collection_id','uuid'),
 ('discover_daily_sets','collection_id','uuid'),
 ('discover_batches','collection_id','uuid'),
 ('discover_known','collection_id','uuid'),
 ('expression_voice_files','collection_id','uuid')) v(rel,col,typ) loop
  if not exists(select 1 from pg_attribute where attrelid=to_regclass('public.'||r.rel) and attname=r.col and atttypid=to_regtype(r.typ) and not attisdropped) then raise exception 'Unexpected Phase 2 prerequisite %.% (expected %). Nothing committed.',r.rel,r.col,r.typ;end if;
 end loop;
 if obj_description(to_regclass('public.learning_collections'),'pg_class') is distinct from 'noted-collections-v1' then raise exception 'Verify the Collections foundation first.';end if;
 if coalesce(obj_description(to_regprocedure('public.noted_collections_snapshot()'),'pg_proc'),'') not in ('noted-collections-v1','noted-collections-learning-v1') then raise exception 'Unknown snapshot function.';end if;
 for r in select p.oid,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('learning_collection_calendar','noted_reorder_collections','noted_collection_level_changed','noted_collection_capture_key') loop
  if obj_description(r.oid,'pg_proc') is distinct from 'noted-collections-learning-v1' then raise exception 'Unknown existing function %.',r.proname;end if;
 end loop;
 if obj_description(to_regprocedure('public.learning_calendar(date,text)'),'pg_proc') is distinct from 'noted-learning-activity-v1' then raise exception 'Unknown activity function.';end if;
 if exists(select 1 from pg_class where oid in ('public.words'::regclass,'public.review_events'::regclass,'public.learning_add_events'::regclass,'public.learning_collections'::regclass) and not relrowsecurity) then raise exception 'Owner RLS must remain enabled.';end if;
 if coalesce(obj_description(to_regprocedure('public.noted_guard_duplicate_word()'),'pg_proc'),'') not in ('noted-collections-v1','noted-collections-learning-v1') then raise exception 'Unknown duplicate guard.';end if;
end $$;
-- Reject same-name index/trigger collisions instead of silently accepting them.
do $$begin
 if to_regclass('public.words_collection_capture_lookup') is not null and not exists(
  select 1 from pg_index i where i.indexrelid=to_regclass('public.words_collection_capture_lookup')
  and i.indrelid='public.words'::regclass and i.indisvalid and not i.indisunique and i.indnkeyatts=3
  and replace(pg_get_indexdef(i.indexrelid),'public.','') like '%USING btree (user_id, collection_id, noted_collection_capture_key(word))'
  and i.indpred is null
 ) then raise exception 'Unexpected words_collection_capture_lookup index. Nothing committed.';end if;
 if exists(select 1 from pg_trigger where tgrelid='public.words'::regclass and tgname='noted_collection_duplicate_edit'
  and (tgfoid is distinct from to_regprocedure('public.noted_guard_duplicate_word()') or tgtype<>19 or tgenabled<>'O'
   or tgattr::text is distinct from (select attnum::text from pg_attribute where attrelid='public.words'::regclass and attname='word') or tgqual is not null))
 then raise exception 'Unexpected duplicate edit trigger. Nothing committed.';end if;
 if exists(select 1 from pg_trigger where tgrelid='public.learning_collections'::regclass and tgname='noted_collection_level_changed'
  and (tgfoid is distinct from to_regprocedure('public.noted_collection_level_changed()') or tgtype<>17 or tgenabled<>'O'
   or tgattr::text is distinct from (select attnum::text from pg_attribute where attrelid='public.learning_collections'::regclass and attname='proficiency_level') or tgqual is not null))
 then raise exception 'Unexpected Collection level trigger. Nothing committed.';end if;
end $$;
-- Match the existing Add normalisation, including typographic apostrophes/quotes.
create or replace function public.noted_collection_capture_key(p_text text) returns text language sql immutable strict set search_path='' as $body$
 select lower(btrim(regexp_replace(translate(normalize(p_text,NFKC),'‘’“”',$chars$''""$chars$),'\s+',' ','g')))
$body$;
comment on function public.noted_collection_capture_key(text) is 'noted-collections-learning-v1';
revoke all on function public.noted_collection_capture_key(text) from public,anon,authenticated;
-- Index expressions execute as the writer. This pure text function reads no data.
grant execute on function public.noted_collection_capture_key(text) to authenticated;
do $$begin if exists(select 1 from pg_roles where rolname='service_role') then grant execute on function public.noted_collection_capture_key(text) to service_role;end if;end $$;
create index if not exists words_collection_capture_lookup on public.words(user_id,collection_id,public.noted_collection_capture_key(word));
create or replace function public.noted_guard_duplicate_word() returns trigger language plpgsql security definer set search_path='' as $$
declare normalized text:=public.noted_collection_capture_key(new.word);begin
 if (auth.uid() is null and current_setting('role',true) in ('anon','authenticated')) or (auth.uid() is not null and auth.uid()<>new.user_id) then raise exception 'Entry owner unavailable.' using errcode='42501';end if;
 if TG_OP='UPDATE' and normalized=public.noted_collection_capture_key(old.word) and new.collection_id=old.collection_id then return new;end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.user_id::text||':'||new.collection_id::text||':'||normalized,0));
 if exists(select 1 from public.words w where w.user_id=new.user_id and w.collection_id=new.collection_id and w.id is distinct from new.id and public.noted_collection_capture_key(w.word)=normalized) then raise unique_violation using message='This item is already in your Library.',constraint='noted_words_duplicate';end if;
 return new;
end $$;
comment on function public.noted_guard_duplicate_word() is 'noted-collections-learning-v1';
revoke all on function public.noted_guard_duplicate_word() from public,anon,authenticated;
do $$begin if not exists(select 1 from pg_trigger where tgrelid='public.words'::regclass and tgname='noted_collection_duplicate_edit') then create trigger noted_collection_duplicate_edit before update of word on public.words for each row execute function public.noted_guard_duplicate_word();end if;end $$;
-- Scope only known English Discover data sources; retain the original algorithm,
-- assessment/profile keys, exclusions, batch history, responses and event IDs.
do $$ declare signature text;definition text;old text;replacement text;marker text;begin
 foreach signature in array array['public.discover_unseen_vocabulary(uuid)','public.discover_create_batch(uuid,text)','public.discover_action(text,jsonb,text)'] loop
  select obj_description(to_regprocedure(signature),'pg_proc') into marker;
  if marker='noted-collections-learning-v1' then continue;end if;
  if marker is distinct from 'noted-discover-batches-v1' then raise exception 'Unexpected Discover function %. Review before replacing.',signature;end if;
  definition:=pg_get_functiondef(to_regprocedure(signature));
  if signature like '%discover_action%' then
   old:='select id into lib_id from public.words where user_id=uid and';
   replacement:=old||' collection_id=(select id from public.learning_collections where user_id=uid and target_language=''en'' and explanation_language=''zh-CN'') and';
  else
   old:='w.user_id=p_user';
   replacement:=old||' and w.collection_id=(select id from public.learning_collections where user_id=p_user and target_language=''en'' and explanation_language=''zh-CN'')';
  end if;
  if strpos(definition,old)=0 then raise exception 'Unexpected function body %. No change committed.',signature;end if;
  definition:=replace(definition,old,replacement);
  if signature like '%discover_create_batch%' then
   old:='e.user_id=p_user';
   if strpos(definition,old)=0 then raise exception 'Unexpected review adaptation body.';end if;
   definition:=replace(definition,old,old||' and e.collection_id=(select id from public.learning_collections where user_id=p_user and target_language=''en'' and explanation_language=''zh-CN'')');
  end if;
  execute definition;
  execute format('comment on function %s is %L',to_regprocedure(signature),'noted-collections-learning-v1');
 end loop;
end $$;
-- Reuse the verified local-day calendar calculation with one additional owner-scoped filter.
do $$declare definition text;begin
 definition:=pg_get_functiondef('public.learning_calendar(date,text)'::regprocedure);
 definition:=replace(definition,'public.learning_calendar','public.learning_collection_calendar');
 definition:=replace(definition,'p_timezone text)','p_timezone text, p_collection uuid)');
 definition:=replace(definition,'month_start :=', 'if not exists(select 1 from public.learning_collections where id=p_collection and user_id=actor) then raise exception ''Collection unavailable.'' using errcode=''42501'';end if; month_start :=');
 definition:=replace(definition,'where user_id = actor and reviewed_at','where user_id = actor and collection_id=p_collection and reviewed_at');
 definition:=replace(definition,'where user_id = actor and created_at','where user_id = actor and collection_id=p_collection and created_at');
 if strpos(definition,'p_collection uuid')=0 or strpos(definition,'Collection unavailable.')=0 or strpos(definition,'where user_id = actor and collection_id=p_collection and reviewed_at')=0 or strpos(definition,'where user_id = actor and collection_id=p_collection and created_at')=0 then raise exception 'Unexpected calendar function. Nothing committed.';end if;
 execute definition;
end $$;
create or replace function public.noted_reorder_collections(p_ids uuid[]) returns void language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();begin
 if actor is null then raise exception 'Sign in first.' using errcode='42501';end if;
 if p_ids is null or cardinality(p_ids)=0 or cardinality(p_ids)<>(select count(distinct id) from unnest(p_ids) id) or cardinality(p_ids)<>(select count(*) from public.learning_collections where user_id=actor) or exists(select 1 from unnest(p_ids) id where not exists(select 1 from public.learning_collections c where c.id=id and c.user_id=actor)) then raise exception 'Language list changed. Refresh before reordering.' using errcode='42501';end if;
 update public.learning_collections c set display_order=x.ord-1 from unnest(p_ids) with ordinality x(id,ord) where c.id=x.id and c.user_id=actor;
end $$;
create or replace function public.noted_collection_level_changed() returns trigger language plpgsql security definer set search_path='' as $$
declare level integer;begin
 if new.target_language<>'en' or new.explanation_language<>'zh-CN' or new.proficiency_level=old.proficiency_level then return new;end if;
 level:=case new.proficiency_level when 'A1' then 1 when 'A2' then 2 when 'B1' then 3 when 'B2' then 4 when 'C1' then 5 when 'C2' then 6 when 'beginner' then 2 when 'intermediate' then 4 when 'advanced' then 5 end;
 if level is not null then update public.discover_profiles set recommendation_level=level where user_id=new.user_id and collection_id=new.id;end if;
 return new;
end $$;
do $$begin if not exists(select 1 from pg_trigger where tgrelid='public.learning_collections'::regclass and tgname='noted_collection_level_changed') then create trigger noted_collection_level_changed after update of proficiency_level on public.learning_collections for each row execute function public.noted_collection_level_changed();end if;end $$;
create or replace function public.noted_collections_snapshot() returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid();begin
 if actor is null then raise exception 'Sign in first.' using errcode='42501';end if;
 perform public.noted_default_collection(actor);
 return jsonb_build_object('version',1,'multilingual_enabled',false,'learning_ready',false,'collections',(select coalesce(jsonb_agg(to_jsonb(c) order by c.display_order,c.created_at,c.id),'[]') from public.learning_collections c where c.user_id=actor));
end $$;
comment on function public.learning_collection_calendar(date,text,uuid) is 'noted-collections-learning-v1';
comment on function public.noted_reorder_collections(uuid[]) is 'noted-collections-learning-v1';
comment on function public.noted_collection_level_changed() is 'noted-collections-learning-v1';
comment on function public.noted_collections_snapshot() is 'noted-collections-learning-v1';
revoke all on function public.learning_collection_calendar(date,text,uuid),public.noted_reorder_collections(uuid[]),public.noted_collection_level_changed(),public.noted_collections_snapshot() from public,anon,authenticated;
grant execute on function public.learning_collection_calendar(date,text,uuid),public.noted_reorder_collections(uuid[]),public.noted_collections_snapshot() to authenticated;
-- Installation commits only if RPC permissions and existing owner isolation pass.
do $$begin
 if has_function_privilege('anon','public.learning_collection_calendar(date,text,uuid)','execute') or not has_function_privilege('authenticated','public.learning_collection_calendar(date,text,uuid)','execute') or has_function_privilege('anon','public.noted_reorder_collections(uuid[])','execute') or not has_function_privilege('authenticated','public.noted_reorder_collections(uuid[])','execute') then raise exception 'Unexpected Collection RPC permissions. Nothing committed.';end if;
 if exists(select 1 from public.words w left join public.learning_collections c on c.id=w.collection_id where c.id is null or c.user_id<>w.user_id) then raise exception 'Vocabulary Collection ownership must be verified first. Nothing committed.';end if;
end $$;
notify pgrst,'reload schema';
commit;
