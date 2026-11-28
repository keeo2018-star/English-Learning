begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';

create table public.noted_ai_quota_codes (
  code_hash bytea primary key check (octet_length(code_hash) = 32),
  eligible_user uuid references auth.users(id) on delete cascade,
  redeemed_by uuid unique references auth.users(id) on delete set null,
  redeemed_at timestamptz,
  check (redeemed_by is null or redeemed_at is not null)
);
alter table public.noted_ai_quota_codes enable row level security;
revoke all on public.noted_ai_quota_codes from public, anon, authenticated;

alter table public.noted_ai_user_usage drop constraint noted_ai_user_usage_calls_check;
alter table public.noted_ai_user_usage add constraint noted_ai_user_usage_calls_check check (calls between 0 and 50);

create function public.noted_ai_daily_limit() returns integer
language sql stable security definer set search_path = pg_catalog, pg_temp as $$
  select case when exists (
    select 1 from public.noted_ai_quota_codes where redeemed_by = (select auth.uid())
  ) then 50 else 5 end;
$$;

create function public.noted_ai_redeem_code(p_code text) returns boolean
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare
  owner_id uuid := auth.uid();
begin
  if owner_id is null or p_code is null or (length(p_code) not in (6, 43) or p_code !~ '^([0-9]{6}|[A-Za-z0-9_-]{43})$') then
    return false;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('noted-ai-redemption:' || owner_id::text, 0));
  if public.noted_ai_daily_limit() = 50 then return true; end if;
  update public.noted_ai_quota_codes
    set redeemed_by = owner_id, redeemed_at = now()
    where code_hash = sha256(convert_to(p_code, 'UTF8'))
      and redeemed_at is null
      and (eligible_user = owner_id or (eligible_user is null and length(p_code) = 43));
  return found;
end;
$$;

revoke all on function public.noted_ai_daily_limit(), public.noted_ai_redeem_code(text) from public, anon, authenticated;
grant execute on function public.noted_ai_daily_limit(), public.noted_ai_redeem_code(text) to authenticated;

create or replace function public.noted_ai_reserve(p_hash text) returns jsonb language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
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
 if u.calls>=public.noted_ai_daily_limit() or p.calls>=50 or u.last_at>now()-interval '10 seconds' or (p.minute_at=date_trunc('minute',now()) and p.minute_calls>=5) then return jsonb_build_object('status','limited');end if;
 update public.noted_ai_user_usage set calls=calls+1,last_at=now() where user_id=uid and day=d;
 update public.noted_ai_project_usage set calls=calls+1,minute_calls=case when minute_at=date_trunc('minute',now()) then minute_calls+1 else 1 end,minute_at=date_trunc('minute',now()) where day=d;
 t:=gen_random_uuid();
 insert into public.noted_ai_entries(user_id,query_hash,lease,started_at) values(uid,p_hash,t,now()) on conflict(user_id,query_hash) do update set lease=t,started_at=now(),cooldown_until=null;
 return jsonb_build_object('status','reserved','lease',t);
end $$;

notify pgrst, 'reload schema';
commit;
