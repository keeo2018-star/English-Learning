-- Phase 1 only. Run the preflight and review it first. No multilingual UI rollout.
begin;
set local lock_timeout='3s';set local statement_timeout='60s';
do $$declare r record;begin
 for r in select * from (values ('public.words','id','uuid'),('public.words','user_id','uuid'),('auth.users','id','uuid')) v(rel,col,typ) loop
  if not exists(select 1 from pg_attribute where attrelid=to_regclass(r.rel) and attname=r.col and atttypid=to_regtype(r.typ) and not attisdropped) then raise exception 'Unexpected prerequisite %.%.',r.rel,r.col;end if;
 end loop;
 for r in select c.oid,c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('learning_collections','learning_languages') loop
  if obj_description(r.oid,'pg_class') is distinct from 'noted-collections-v1' then raise exception 'Unknown existing object %.',r.relname;end if;
 end loop;
 if coalesce(obj_description(to_regprocedure('public.noted_guard_duplicate_word()'),'pg_proc'),'') not in ('noted-discover-batches-v1','noted-collections-v1') then raise exception 'Unexpected duplicate guard. Review preflight.';end if;
 for r in select p.oid,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('noted_default_collection','noted_collection_binding','noted_collection_guard','noted_collections_snapshot') loop
  if obj_description(r.oid,'pg_proc') is distinct from 'noted-collections-v1' then raise exception 'Unknown existing function %.',r.proname;end if;
 end loop;
end $$;
create table if not exists public.learning_languages(code text primary key,label text not null,tts_locale text not null,can_explain boolean not null default false);
comment on table public.learning_languages is 'noted-collections-v1';
insert into public.learning_languages values('en','English','en-GB',true),('zh-CN','Simplified Chinese','zh-CN',true),('fr','French','fr-FR',false),('es','Spanish','es-ES',false) on conflict(code) do nothing;
alter table public.learning_languages enable row level security;
revoke all on public.learning_languages from public,anon,authenticated;
grant select on public.learning_languages to authenticated;
do $$begin if not exists(select 1 from pg_policy where polrelid='public.learning_languages'::regclass and polname='collection_language_catalog') then create policy collection_language_catalog on public.learning_languages for select to authenticated using(true);end if;end $$;
create table if not exists public.learning_collections(
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,
 target_language text not null references public.learning_languages(code),explanation_language text not null references public.learning_languages(code),
 proficiency_level text not null default 'unspecified' check(proficiency_level in ('unspecified','beginner','intermediate','advanced','A1','A2','B1','B2','C1','C2')),
 display_order integer not null default 0 check(display_order between 0 and 999),preferences jsonb not null default '{}' check(jsonb_typeof(preferences)='object'),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(user_id,target_language,explanation_language)
);
comment on table public.learning_collections is 'noted-collections-v1';
alter table public.learning_collections enable row level security;
revoke all on public.learning_collections from public,anon,authenticated;
grant select,insert on public.learning_collections to authenticated;
grant update(explanation_language,proficiency_level,display_order,preferences) on public.learning_collections to authenticated;
do $$begin
 if not exists(select 1 from pg_policy where polrelid='public.learning_collections'::regclass and polname='collection_owner_read') then
 create policy collection_owner_read on public.learning_collections for select to authenticated using(user_id=(select auth.uid()));
 create policy collection_owner_insert on public.learning_collections for insert to authenticated with check(user_id=(select auth.uid()));
 create policy collection_owner_update on public.learning_collections for update to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
 end if;
end $$;
create index if not exists learning_collections_owner_order on public.learning_collections(user_id,display_order,created_at,id);
create or replace function public.noted_collection_guard() returns trigger language plpgsql security definer set search_path='' as $$begin
 if TG_OP='UPDATE' and (new.id<>old.id or new.user_id<>old.user_id or new.target_language<>old.target_language) then raise exception 'A Collection cannot be reassigned.';end if;
 if not exists(select 1 from public.learning_languages where code=new.explanation_language and can_explain) then raise exception 'Unsupported explanation language.';end if;
 if new.target_language='zh-CN' and new.proficiency_level in ('A1','A2','B1','B2','C1','C2') then raise exception 'Choose Beginner, Intermediate or Advanced for Chinese.';end if;
 new.updated_at:=now();return new;
end $$;
create or replace function public.noted_default_collection(p_owner uuid) returns uuid language plpgsql security definer set search_path='' as $$declare result uuid;begin
 if auth.uid() is not null and auth.uid()<>p_owner then raise exception 'Wrong Collection owner.' using errcode='42501';end if;
 insert into public.learning_collections(user_id,target_language,explanation_language) values(p_owner,'en','zh-CN') on conflict(user_id,target_language,explanation_language) do nothing;
 select id into result from public.learning_collections where user_id=p_owner and target_language='en' and explanation_language='zh-CN';return result;
end $$;
insert into public.learning_collections(user_id,target_language,explanation_language) select id,'en','zh-CN' from auth.users on conflict(user_id,target_language,explanation_language) do nothing;
create or replace function public.noted_collection_binding() returns trigger language plpgsql security definer set search_path='' as $$declare item uuid;associated uuid;begin
 if TG_TABLE_NAME='words' and TG_OP='UPDATE' and old.collection_id is not null and new.collection_id is distinct from old.collection_id then raise exception 'Moving an existing entry between Collections is not supported.';end if;
 if TG_TABLE_NAME='expression_voice_files' then item:=(to_jsonb(new)->>'item_id')::uuid;
 elsif TG_TABLE_NAME in ('review_events','learning_add_events') then item:=(to_jsonb(new)->>'learning_item_id')::uuid;end if;
 if item is not null then select collection_id into associated from public.words where id=item and user_id=new.user_id;end if;
 new.collection_id:=coalesce(new.collection_id,associated,public.noted_default_collection(new.user_id));
 if not exists(select 1 from public.learning_collections where id=new.collection_id and user_id=new.user_id) or associated is not null and associated<>new.collection_id then raise exception 'Collection does not belong to this entry owner.' using errcode='42501';end if;
 return new;
end $$;
do $$declare name text;marker text;begin
 foreach name in array array['words','review_events','learning_add_events','discover_profiles','discover_assessments','discover_daily_sets','discover_batches','discover_known','expression_voice_files','noted_ai_entries'] loop
  if to_regclass('public.'||name) is null then continue;end if;
  if exists(select 1 from pg_attribute where attrelid=to_regclass('public.'||name) and attname='collection_id' and not attisdropped) then
   select col_description(attrelid,attnum) into marker from pg_attribute where attrelid=to_regclass('public.'||name) and attname='collection_id';
   if marker is distinct from 'noted-collections-v1' then raise exception 'Unknown existing %.collection_id.',name;end if;
  else execute format('alter table public.%I add column collection_id uuid references public.learning_collections(id)',name);execute format('comment on column public.%I.collection_id is %L',name,'noted-collections-v1');end if;
  execute format('update public.%I x set collection_id=c.id from public.learning_collections c where x.user_id=c.user_id and c.target_language=''en'' and c.explanation_language=''zh-CN'' and x.collection_id is null',name);
  execute format('create index if not exists %I on public.%I(user_id,collection_id)',name||'_owner_collection',name);
  if not exists(select 1 from pg_trigger where tgrelid=to_regclass('public.'||name) and tgname='aaa_noted_collection_binding') then execute format('create trigger aaa_noted_collection_binding before insert or update of collection_id,user_id on public.%I for each row execute function public.noted_collection_binding()',name);end if;
 end loop;
 if not exists(select 1 from pg_trigger where tgrelid='public.learning_collections'::regclass and tgname='noted_collection_guard') then create trigger noted_collection_guard before insert or update on public.learning_collections for each row execute function public.noted_collection_guard();end if;
end $$;
-- Keep every old ID and index. The new guard scopes duplicate detection by Collection.
create index if not exists words_collection_normalized on public.words(user_id,collection_id,lower(btrim(regexp_replace(normalize(word,NFKC),'\s+',' ','g'))));
create or replace function public.noted_guard_duplicate_word() returns trigger language plpgsql set search_path=pg_catalog,public as $$declare normalized text:=lower(btrim(regexp_replace(normalize(new.word,NFKC),'\s+',' ','g')));begin
 if auth.uid() is not null and auth.uid()<>new.user_id then return new;end if;
 perform pg_advisory_xact_lock(hashtextextended(new.user_id::text||':'||new.collection_id::text||':'||normalized,0));
 if exists(select 1 from public.words w where w.user_id=new.user_id and w.collection_id=new.collection_id and lower(btrim(regexp_replace(normalize(w.word,NFKC),'\s+',' ','g')))=normalized) then raise unique_violation using message='This item is already in your Library.',constraint='noted_words_duplicate';end if;return new;
end $$;
create or replace function public.noted_collections_snapshot() returns jsonb language plpgsql security definer set search_path='' as $$declare actor uuid:=auth.uid();begin
 if actor is null then raise exception 'Sign in first.' using errcode='42501';end if;
 perform public.noted_default_collection(actor);
 return jsonb_build_object('version',1,'multilingual_enabled',false,'collections',(select coalesce(jsonb_agg(to_jsonb(c) order by c.display_order,c.created_at,c.id),'[]') from public.learning_collections c where c.user_id=actor));
end $$;
do $$declare r record;begin for r in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('noted_collection_guard','noted_collection_binding','noted_default_collection','noted_collections_snapshot','noted_guard_duplicate_word') loop execute format('comment on function %s is %L',r.oid::regprocedure,'noted-collections-v1');execute format('revoke all on function %s from public,anon,authenticated',r.oid::regprocedure);end loop;end $$;
grant execute on function public.noted_collections_snapshot() to authenticated;
notify pgrst,'reload schema';
commit;
