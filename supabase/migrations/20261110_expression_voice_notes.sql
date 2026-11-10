-- Expression Voice Notes v1. Run voice_notes_preflight.sql and review results FIRST.
-- Additive: no existing vocabulary, review/Discover history or accounts are reset.
begin;
set local lock_timeout='3s';
set local statement_timeout='60s';
do $$ declare x record; actual oid; begin
 for x in select * from (values ('public','words','id','uuid'),('public','words','user_id','uuid'),('public','words','word','text'),('public','words','meaning','text'),('public','words','example','text'),('public','words','item_type','text'),('storage','objects','id','uuid'),('storage','objects','bucket_id','text'),('storage','objects','name','text'),('storage','objects','metadata','jsonb'),('storage','buckets','id','text'),('storage','buckets','public','boolean'),('storage','buckets','file_size_limit','bigint'),('storage','buckets','allowed_mime_types','text[]')) t(sch,tab,col,typ) loop
  select atttypid into actual from pg_attribute where attrelid=to_regclass(x.sch||'.'||x.tab) and attname=x.col and not attisdropped;
  if actual is distinct from to_regtype(x.typ)::oid then raise exception 'Incompatible %.%.%: expected %. Run Voice Notes preflight; nothing committed.',x.sch,x.tab,x.col,x.typ; end if;
 end loop;
 if not exists(select 1 from pg_class where oid='storage.objects'::regclass and relrowsecurity) then raise exception 'Storage RLS must be enabled. Review preflight.'; end if;
 for x in select c.oid,c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('expression_voice_one_active','expression_voice_owner_item','expression_voice_item_files') loop
  if coalesce(obj_description(x.oid,'pg_class'),'')<>'noted-voice-v1' then raise exception 'Unrecognised existing Voice Notes index %.',x.relname; end if;
 end loop;
 if to_regclass('public.expression_voice_files') is not null and coalesce(obj_description(to_regclass('public.expression_voice_files'),'pg_class'),'')<>'noted-voice-v1' then raise exception 'Unrecognised Voice Notes table.'; end if;
 if exists(select 1 from storage.buckets where id='noted-voice-notes') and to_regclass('public.expression_voice_files') is null then raise exception 'A bucket already uses this name. Review preflight first.'; end if;
 if exists(select 1 from storage.buckets where id='noted-voice-notes' and (public or file_size_limit is null or file_size_limit>8388608 or allowed_mime_types is null or not(allowed_mime_types<@array['audio/webm','audio/mp4','audio/mpeg','audio/aac','audio/ogg','audio/wav','audio/flac']))) then raise exception 'Voice Notes bucket configuration is not private/restricted. Review preflight.'; end if;
 for x in select p.oid,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'voice_note%' loop
  if coalesce(obj_description(x.oid,'pg_proc'),'')<>'noted-voice-v1' then raise exception 'Unrecognised existing function %.',x.proname; end if;
 end loop;
 if exists(select 1 from pg_trigger where tgrelid='public.words'::regclass and tgname='noted_voice_item_guard' and coalesce(obj_description(tgfoid,'pg_proc'),'')<>'noted-voice-v1') then raise exception 'Unrecognised Voice Notes trigger.'; end if;
 if exists(select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname like 'noted_voice_%') and to_regclass('public.expression_voice_files') is null then raise exception 'Unrecognised existing Voice Notes Storage policies.'; end if;
end $$;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('noted-voice-notes','noted-voice-notes',false,8388608,array['audio/webm','audio/mp4','audio/mpeg','audio/aac','audio/ogg','audio/wav','audio/flac']) on conflict(id) do nothing;
create table if not exists public.expression_voice_files (
 id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade,
 item_id uuid not null references public.words(id) on delete cascade, storage_path text not null unique,
 duration_seconds numeric not null check(duration_seconds>0 and duration_seconds<=30),
 mime_type text not null check(mime_type in ('audio/webm','audio/mp4','audio/mpeg','audio/aac','audio/ogg','audio/wav','audio/flac')),
 byte_size integer not null check(byte_size>0 and byte_size<=8388608),
 state text not null default 'pending' check(state in ('pending','active','retired')),
 expected_active_id uuid, preserved_for_word boolean not null default false,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 check(storage_path=user_id::text||'/'||item_id::text||'/'||id::text)
);
comment on table public.expression_voice_files is 'noted-voice-v1';
create unique index if not exists expression_voice_one_active on public.expression_voice_files(item_id) where state='active';
create index if not exists expression_voice_owner_item on public.expression_voice_files(user_id,item_id);
create index if not exists expression_voice_item_files on public.expression_voice_files(item_id,state);
comment on index public.expression_voice_item_files is 'noted-voice-v1';
comment on index public.expression_voice_one_active is 'noted-voice-v1';
comment on index public.expression_voice_owner_item is 'noted-voice-v1';
alter table public.expression_voice_files enable row level security;
revoke all on public.expression_voice_files from public,anon,authenticated;
grant select on public.expression_voice_files to authenticated;
do $$ begin
 if not exists(select 1 from pg_policy where polrelid='public.expression_voice_files'::regclass and polname='voice_owner_read') then
  create policy voice_owner_read on public.expression_voice_files for select to authenticated using ((select auth.uid())=user_id);
 end if;
end $$;
create or replace function public.voice_note_storage_access(p_name text,p_upload boolean default false) returns boolean language plpgsql security definer set search_path=pg_catalog,public as $$
declare found uuid; begin
 if auth.uid() is null then return false; end if;
 if p_upload then
  select f.id into found from public.expression_voice_files f join public.words w on w.id=f.item_id and w.user_id=f.user_id where f.storage_path=p_name and f.user_id=auth.uid() and f.state='pending' and coalesce(w.item_type,case when btrim(regexp_replace(normalize(w.word,NFKC),'\s+',' ','g'))~' ' then 'expression' else 'word' end)='expression' for key share of f,w;
 else
  select f.id into found from public.expression_voice_files f join public.words w on w.id=f.item_id and w.user_id=f.user_id where f.storage_path=p_name and f.user_id=auth.uid();
 end if;
 return found is not null;
end $$;
comment on function public.voice_note_storage_access(text,boolean) is 'noted-voice-v1';
revoke all on function public.voice_note_storage_access(text,boolean) from public,anon,authenticated;
-- RLS calls this limited, ownership-only predicate. It returns no private metadata.
grant execute on function public.voice_note_storage_access(text,boolean) to anon,authenticated;
do $$ begin
 if not exists(select 1 from pg_policy where polrelid='storage.objects'::regclass and polname='noted_voice_upload') then create policy noted_voice_upload on storage.objects for insert to authenticated with check(bucket_id='noted-voice-notes' and public.voice_note_storage_access(name,true)); end if;
 if not exists(select 1 from pg_policy where polrelid='storage.objects'::regclass and polname='noted_voice_read') then create policy noted_voice_read on storage.objects for select to authenticated using(bucket_id='noted-voice-notes' and public.voice_note_storage_access(name,false)); end if;
 if not exists(select 1 from pg_policy where polrelid='storage.objects'::regclass and polname='noted_voice_delete') then create policy noted_voice_delete on storage.objects for delete to authenticated using(bucket_id='noted-voice-notes' and public.voice_note_storage_access(name,false)); end if;
end $$;
-- Restrictive guards also protect this bucket when another app has broad
-- permissive Storage policies. Other buckets retain their existing behavior.
do $$ begin
 if not exists(select 1 from pg_policy where polrelid='storage.objects'::regclass and polname='noted_voice_private_read') then create policy noted_voice_private_read on storage.objects as restrictive for select to anon,authenticated using(bucket_id<>'noted-voice-notes' or public.voice_note_storage_access(name,false)); end if;
 if not exists(select 1 from pg_policy where polrelid='storage.objects'::regclass and polname='noted_voice_private_insert') then create policy noted_voice_private_insert on storage.objects as restrictive for insert to anon,authenticated with check(bucket_id<>'noted-voice-notes' or public.voice_note_storage_access(name,true)); end if;
 if not exists(select 1 from pg_policy where polrelid='storage.objects'::regclass and polname='noted_voice_immutable') then create policy noted_voice_immutable on storage.objects as restrictive for update to anon,authenticated using(bucket_id<>'noted-voice-notes') with check(bucket_id<>'noted-voice-notes'); end if;
 if not exists(select 1 from pg_policy where polrelid='storage.objects'::regclass and polname='noted_voice_private_delete') then create policy noted_voice_private_delete on storage.objects as restrictive for delete to anon,authenticated using(bucket_id<>'noted-voice-notes' or public.voice_note_storage_access(name,false)); end if;
end $$;
create or replace function public.voice_notes_list(p_items uuid[]) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if auth.uid() is null then raise insufficient_privilege; end if;
 if not exists(select 1 from storage.buckets where id='noted-voice-notes' and not public and file_size_limit<=8388608 and allowed_mime_types is not null and allowed_mime_types<@array['audio/webm','audio/mp4','audio/mpeg','audio/aac','audio/ogg','audio/wav','audio/flac']) then raise exception 'Private Voice Notes Storage needs setup. Your learning item is unchanged.'; end if;
 if cardinality(p_items)>50 then raise exception 'Too many items.'; end if;
 return jsonb_build_object('version',1,'files',coalesce((select jsonb_agg(to_jsonb(f)||jsonb_build_object('stored',exists(select 1 from storage.objects o where o.bucket_id='noted-voice-notes' and o.name=f.storage_path)) order by f.created_at) from public.expression_voice_files f where f.user_id=auth.uid() and f.item_id=any(p_items)),'[]'::jsonb));
end $$;
create or replace function public.voice_note_prepare(p_item uuid,p_id uuid,p_duration numeric,p_mime text,p_size integer,p_expected uuid default null) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare w public.words; f public.expression_voice_files; current_id uuid;
begin
 select * into w from public.words where id=p_item and user_id=auth.uid() for update;
 if w.id is null then raise insufficient_privilege using message='Expression unavailable.'; end if;
 if not exists(select 1 from storage.buckets where id='noted-voice-notes' and not public and file_size_limit<=8388608 and allowed_mime_types is not null and allowed_mime_types<@array['audio/webm','audio/mp4','audio/mpeg','audio/aac','audio/ogg','audio/wav','audio/flac']) then raise exception 'Private Voice Notes Storage needs setup. Your learning item is unchanged.'; end if;

 if coalesce(w.item_type,case when btrim(regexp_replace(normalize(w.word,NFKC),'\s+',' ','g'))~' ' then 'expression' else 'word' end)<>'expression' then raise exception 'Voice Notes are available only for Expressions.'; end if;
 select * into f from public.expression_voice_files where id=p_id;
 if f.id is not null then
  if f.user_id<>auth.uid() or f.item_id<>p_item or f.mime_type<>p_mime or f.byte_size<>p_size or f.expected_active_id is distinct from p_expected then raise exception 'Upload changed. Start a new recording.'; end if;
  return to_jsonb(f)||jsonb_build_object('stored',exists(select 1 from storage.objects where bucket_id='noted-voice-notes' and name=f.storage_path));
 end if;
 select id into current_id from public.expression_voice_files where item_id=p_item and state='active';
 if current_id is distinct from p_expected then raise exception 'Another device changed this recording. Refresh before replacing it.'; end if;
 if (select count(*) from public.expression_voice_files where item_id=p_item and state='pending')>=8 then raise exception 'Clear unfinished uploads before adding another recording.'; end if;
 insert into public.expression_voice_files(id,user_id,item_id,storage_path,duration_seconds,mime_type,byte_size,expected_active_id) values(p_id,auth.uid(),p_item,auth.uid()::text||'/'||p_item::text||'/'||p_id::text,p_duration,p_mime,p_size,p_expected) returning * into f;
 return to_jsonb(f)||jsonb_build_object('stored',false);
end $$;
create or replace function public.voice_note_finish(p_id uuid) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare f public.expression_voice_files; w public.words; current_id uuid; meta jsonb;
begin
 select w0.* into w from public.words w0 join public.expression_voice_files f0 on f0.item_id=w0.id where f0.id=p_id and f0.user_id=auth.uid() and w0.user_id=auth.uid() for update of w0;
 if w.id is null then raise insufficient_privilege using message='Expression unavailable.'; end if;
 select * into f from public.expression_voice_files where id=p_id and user_id=auth.uid() for update;
 if f.state='active' then return to_jsonb(f); end if;
 if f.state<>'pending' then raise exception 'This upload is no longer current.'; end if;
 if coalesce(w.item_type,case when btrim(regexp_replace(normalize(w.word,NFKC),'\s+',' ','g'))~' ' then 'expression' else 'word' end)<>'expression' then raise exception 'Change this item back to Expression first.'; end if;
 select metadata into meta from storage.objects where bucket_id='noted-voice-notes' and name=f.storage_path;
 if meta is null or (meta->>'size')::bigint is distinct from f.byte_size::bigint or split_part(meta->>'mimetype',';',1) is distinct from f.mime_type then raise exception 'The audio upload is missing or invalid. Retry uploading it.'; end if;
 select id into current_id from public.expression_voice_files where item_id=f.item_id and state='active';
 if current_id is distinct from f.expected_active_id then raise exception 'Another device changed this recording. Refresh before replacing it.'; end if;
 update public.expression_voice_files set state='retired',updated_at=now() where item_id=f.item_id and state='active';
 update public.expression_voice_files set state='active',updated_at=now() where id=f.id returning * into f;
 return to_jsonb(f);
end $$;
create or replace function public.voice_note_forget(p_id uuid) returns void language plpgsql security definer set search_path=pg_catalog,public as $$
declare f public.expression_voice_files; begin
 select * into f from public.expression_voice_files where id=p_id and user_id=auth.uid() for update;
 if f.id is null then return; end if;
 if exists(select 1 from storage.objects where bucket_id='noted-voice-notes' and name=f.storage_path) then raise exception 'Remove the private audio file before clearing its metadata.'; end if;
 delete from public.expression_voice_files where id=f.id and user_id=auth.uid();
end $$;
create or replace function public.voice_note_edit_item(p_item uuid,p_changes jsonb,p_preserve boolean) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare w public.words; begin
 select * into w from public.words where id=p_item and user_id=auth.uid() for update;
 if w.id is null then raise insufficient_privilege; end if;
 if p_changes->>'item_type' is null or p_changes->>'item_type' not in ('word','expression') then raise exception 'Choose a content type.'; end if;
 if p_changes->>'item_type'='word' and exists(select 1 from public.expression_voice_files where item_id=p_item) then
  if p_preserve is distinct from true then raise exception 'Remove the recording first, or choose Preserve.'; end if;
  update public.expression_voice_files set preserved_for_word=true,updated_at=now() where item_id=p_item;
 end if;
 update public.words set word=btrim(p_changes->>'word'),meaning=btrim(p_changes->>'meaning'),example=p_changes->>'example',item_type=p_changes->>'item_type' where id=p_item and user_id=auth.uid() returning * into w;
 return to_jsonb(w);
end $$;
create or replace function public.voice_note_item_guard() returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if tg_op='DELETE' then
  if exists(select 1 from public.expression_voice_files where item_id=old.id) or exists(select 1 from storage.objects where bucket_id='noted-voice-notes' and name like old.user_id::text||'/'||old.id::text||'/%') then raise exception 'Remove attached recordings before deleting this item. Your item has been kept.'; end if;
  return old;
 end if;
 if coalesce(new.item_type,case when btrim(regexp_replace(normalize(new.word,NFKC),'\s+',' ','g'))~' ' then 'expression' else 'word' end)='word' and exists(select 1 from public.expression_voice_files where item_id=old.id and not preserved_for_word) then raise exception 'Choose whether to preserve or remove the recording before changing to Word.'; end if;
 if coalesce(new.item_type,case when btrim(regexp_replace(normalize(new.word,NFKC),'\s+',' ','g'))~' ' then 'expression' else 'word' end)='expression' then update public.expression_voice_files set preserved_for_word=false where item_id=old.id and preserved_for_word; end if;
 return new;
end $$;
comment on function public.voice_note_item_guard() is 'noted-voice-v1';
revoke all on function public.voice_note_item_guard() from public,anon,authenticated;
do $$ begin if not exists(select 1 from pg_trigger where tgrelid='public.words'::regclass and tgname='noted_voice_item_guard') then create trigger noted_voice_item_guard before delete or update of word,item_type on public.words for each row execute function public.voice_note_item_guard(); end if; end $$;
do $$ declare x record; begin
 for x in select p.oid,p.proname,pg_get_function_identity_arguments(p.oid) args from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('voice_notes_list','voice_note_prepare','voice_note_finish','voice_note_forget','voice_note_edit_item') loop
  execute format('comment on function public.%I(%s) is %L',x.proname,x.args,'noted-voice-v1');
  execute format('revoke all on function public.%I(%s) from public,anon,authenticated',x.proname,x.args);
  execute format('grant execute on function public.%I(%s) to authenticated',x.proname,x.args);
 end loop;
end $$;
notify pgrst,'reload schema';
commit;
