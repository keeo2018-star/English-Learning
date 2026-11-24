-- Optional. Run ai_dictionary_preflight.sql first; no existing learning tables are changed.
begin;
set local lock_timeout='3s';
set local statement_timeout='30s';
do $$ declare r record; begin
 if not exists(select 1 from information_schema.columns where table_schema='auth' and table_name='users' and column_name='id' and udt_name='uuid') then raise exception 'auth.users.id must be UUID'; end if;
 for r in select c.oid,c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('noted_ai_entries','noted_ai_user_usage','noted_ai_project_usage') loop
  if obj_description(r.oid,'pg_class') is distinct from 'noted-ai-v1' then raise exception 'Unknown existing object %. Nothing committed.',r.relname; end if;
 end loop;
 for r in select p.oid,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('noted_ai_reserve','noted_ai_finish','noted_ai_fail') loop
  if obj_description(r.oid,'pg_proc') is distinct from 'noted-ai-v1' then raise exception 'Unknown existing function %. Nothing committed.',r.proname; end if;
 end loop;
 if to_regclass('public.words') is null then raise exception 'The existing words table is required';end if;
 if exists(select 1 from pg_attribute where attrelid='public.words'::regclass and attname='example_source' and not attisdropped and (atttypid<>'text'::regtype or attnotnull or col_description(attrelid,attnum) is distinct from 'noted-ai-v1')) then raise exception 'Unknown words.example_source column. Nothing committed.';end if;
end $$;
alter table public.words add column if not exists example_source text check(example_source is null or example_source in ('ai','dictionary','personal'));
comment on column public.words.example_source is 'noted-ai-v1';
create table if not exists public.noted_ai_entries(
 user_id uuid not null references auth.users(id) on delete cascade,query_hash text not null check(query_hash~'^[a-f0-9]{64}$'),
 payload jsonb check(payload is null or (jsonb_typeof(payload)='object' and octet_length(payload::text)<=30000)),
 lease uuid,started_at timestamptz,cooldown_until timestamptz,expires_at timestamptz,
 primary key(user_id,query_hash)
);
create table if not exists public.noted_ai_user_usage(user_id uuid not null references auth.users(id) on delete cascade,day date not null,calls integer not null default 0 check(calls between 0 and 5),last_at timestamptz,primary key(user_id,day));
create table if not exists public.noted_ai_project_usage(day date primary key,calls integer not null default 0 check(calls between 0 and 50),minute_at timestamptz,minute_calls integer not null default 0 check(minute_calls between 0 and 5));
comment on table public.noted_ai_entries is 'noted-ai-v1';
comment on table public.noted_ai_user_usage is 'noted-ai-v1';
comment on table public.noted_ai_project_usage is 'noted-ai-v1';
alter table public.noted_ai_entries enable row level security;
alter table public.noted_ai_user_usage enable row level security;
alter table public.noted_ai_project_usage enable row level security;
revoke all on public.noted_ai_entries,public.noted_ai_user_usage,public.noted_ai_project_usage from public,anon,authenticated;
grant select on public.noted_ai_entries to authenticated;
do $$ begin
 if not exists(select 1 from pg_policies where schemaname='public' and tablename='noted_ai_entries' and policyname='noted_ai_owner_read') then
  create policy noted_ai_owner_read on public.noted_ai_entries for select to authenticated using(user_id=(select auth.uid()));
 end if;
end $$;
create or replace function public.noted_ai_reserve(p_hash text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare uid uuid:=auth.uid(); d date:=(now() at time zone 'UTC')::date; e public.noted_ai_entries;u public.noted_ai_user_usage;p public.noted_ai_project_usage;t uuid;
begin
 if uid is null then raise exception 'Sign in required'; end if;
 if p_hash is null or p_hash!~'^[a-f0-9]{64}$' then raise exception 'Invalid query key';end if;
 perform pg_advisory_xact_lock(hashtextextended('noted-ai-v1:'||d::text,0));
 select * into e from public.noted_ai_entries where user_id=uid and query_hash=p_hash;
 if e.payload is not null and e.expires_at>now() then return jsonb_build_object('status','cached','payload',e.payload);end if;
 if e.lease is not null and e.started_at>now()-interval '2 minutes' then return jsonb_build_object('status','pending');end if;
 if e.cooldown_until>now() then return jsonb_build_object('status','limited');end if;
 insert into public.noted_ai_user_usage(user_id,day) values(uid,d) on conflict do nothing;
 insert into public.noted_ai_project_usage(day) values(d) on conflict do nothing;
 select * into u from public.noted_ai_user_usage where user_id=uid and day=d;
 select * into p from public.noted_ai_project_usage where day=d;
 if u.calls>=5 or p.calls>=50 or u.last_at>now()-interval '10 seconds' or (p.minute_at=date_trunc('minute',now()) and p.minute_calls>=5) then return jsonb_build_object('status','limited');end if;
 update public.noted_ai_user_usage set calls=calls+1,last_at=now() where user_id=uid and day=d;
 update public.noted_ai_project_usage set calls=calls+1,minute_calls=case when minute_at=date_trunc('minute',now()) then minute_calls+1 else 1 end,minute_at=date_trunc('minute',now()) where day=d;
 t:=gen_random_uuid();
 insert into public.noted_ai_entries(user_id,query_hash,lease,started_at) values(uid,p_hash,t,now()) on conflict(user_id,query_hash) do update set lease=t,started_at=now(),cooldown_until=null;
 return jsonb_build_object('status','reserved','lease',t);
end $$;
create or replace function public.noted_ai_finish(p_hash text,p_lease uuid,p_payload jsonb) returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if auth.uid() is null or jsonb_typeof(p_payload) is distinct from 'object' or octet_length(p_payload::text)>30000 then raise exception 'Invalid explanation';end if;
 update public.noted_ai_entries set payload=p_payload,lease=null,started_at=null,cooldown_until=null,expires_at=now()+interval '90 days' where user_id=auth.uid() and query_hash=p_hash and lease=p_lease;
 return found;
end $$;
create or replace function public.noted_ai_fail(p_hash text,p_lease uuid) returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 update public.noted_ai_entries set lease=null,started_at=null,cooldown_until=now()+interval '1 minute' where user_id=auth.uid() and query_hash=p_hash and lease=p_lease;
end $$;
comment on function public.noted_ai_reserve(text) is 'noted-ai-v1';
comment on function public.noted_ai_finish(text,uuid,jsonb) is 'noted-ai-v1';
comment on function public.noted_ai_fail(text,uuid) is 'noted-ai-v1';
revoke all on function public.noted_ai_reserve(text),public.noted_ai_finish(text,uuid,jsonb),public.noted_ai_fail(text,uuid) from public,anon;
grant execute on function public.noted_ai_reserve(text),public.noted_ai_finish(text,uuid,jsonb),public.noted_ai_fail(text,uuid) to authenticated;
notify pgrst,'reload schema';
commit;
