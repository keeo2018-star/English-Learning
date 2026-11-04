-- Additive migration. Run the entire file in the EXISTING project's SQL Editor.
-- No vocabulary, scheduling state, or authentication data is reset.
begin;
-- Abort atomically before touching an incompatible schema or unrelated objects.
do $$
declare requirement record; actual oid; object record;
begin
  if to_regclass('public.words') is null or to_regclass('auth.users') is null or to_regprocedure('auth.uid()') is null then
    raise exception 'Prerequisite missing: existing public.words and Supabase auth.users/auth.uid(). Run the read-only preflight first.';
  end if;
  for requirement in select * from (values
    ('public.words','id','uuid'), ('public.words','user_id','uuid'),
    ('public.words','word','text'), ('public.words','meaning','text'), ('public.words','example','text'),
    ('public.words','due_at','timestamp with time zone'), ('public.words','created_at','timestamp with time zone'),
    ('public.words','interval_days','integer'), ('auth.users','id','uuid')
  ) as expected(relation,column_name,type_name) loop
    select a.atttypid into actual from pg_attribute a where a.attrelid=to_regclass(requirement.relation)
      and a.attname=requirement.column_name and a.attnum>0 and not a.attisdropped;
    if actual is distinct from to_regtype(requirement.type_name)::oid then
      raise exception 'Incompatible prerequisite %.%: expected %, found %. No changes committed.',
        requirement.relation, requirement.column_name, requirement.type_name, coalesce(format_type(actual,null),'missing');
    end if;
  end loop;
  if not exists (select 1 from pg_constraint c where c.conrelid='public.words'::regclass and c.contype='p'
    and c.conkey=array[(select a.attnum from pg_attribute a where a.attrelid=c.conrelid and a.attname='id')]::smallint[])
    or not exists (select 1 from pg_constraint c where c.conrelid='auth.users'::regclass and c.contype='p'
    and c.conkey=array[(select a.attnum from pg_attribute a where a.attrelid=c.conrelid and a.attname='id')]::smallint[]) then
    raise exception 'Expected single-column UUID primary keys on words.id and auth.users.id. Review preflight first.';
  end if;
  for requirement in select * from (values ('review_state','jsonb'),('item_type','text')) as expected(column_name,type_name) loop
    select a.atttypid into actual from pg_attribute a where a.attrelid='public.words'::regclass and a.attname=requirement.column_name and a.attnum>0 and not a.attisdropped;
    if found and actual <> to_regtype(requirement.type_name)::oid then
      raise exception 'Existing words.% must be %. No conversion or overwrite attempted.', requirement.column_name, requirement.type_name;
    end if;
  end loop;
  for object in select c.oid,c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname in ('review_events','learning_add_events','learning_activity_start') loop
    if obj_description(object.oid,'pg_class') is distinct from 'noted-learning-activity-v1' then
      raise exception 'Existing public.% is not marked as a Noted activity table. Review the preflight before proceeding.', object.relname;
    end if;
  end loop;
  for object in select p.oid,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
    and p.proname in ('record_learning_review','learning_calendar','capture_learning_addition','capture_legacy_learning_review','noted_review_count') loop
    if obj_description(object.oid,'pg_proc') is distinct from 'noted-learning-activity-v1' then
      raise exception 'Existing function public.% needs review; it will not be silently replaced.',object.proname;
    end if;
  end loop;
  if exists (select 1 from pg_trigger t where t.tgrelid='public.words'::regclass and not t.tgisinternal
    and t.tgname in ('noted_capture_addition','noted_capture_legacy_review')
    and obj_description(t.tgfoid,'pg_proc') is distinct from 'noted-learning-activity-v1') then
    raise exception 'Existing Noted-named trigger needs review; it will not be replaced.';
  end if;
end $$;
alter table public.words add column if not exists review_state jsonb;
alter table public.words add column if not exists item_type text
  check (item_type in ('word', 'expression'));

create table if not exists public.learning_activity_start (
  singleton boolean primary key default true check (singleton),
  started_at timestamptz not null default now()
);
comment on table public.learning_activity_start is 'noted-learning-activity-v1';
insert into public.learning_activity_start(singleton) values (true) on conflict do nothing;
alter table public.learning_activity_start enable row level security;
drop policy if exists "Read tracking start" on public.learning_activity_start;
create policy "Read tracking start" on public.learning_activity_start for select to authenticated using (true);
grant select on public.learning_activity_start to authenticated;

create table if not exists public.review_events (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  -- Deliberately retained after an item is deleted: actual past activity stays accurate.
  learning_item_id uuid not null,
  reviewed_at timestamptz not null default now(),
  familiarity_rating text not null check (familiarity_rating in ('sure', 'not_sure'))
);
comment on table public.review_events is 'noted-learning-activity-v1';
alter table public.review_events enable row level security;
drop policy if exists "Read own review events" on public.review_events;
create policy "Read own review events" on public.review_events for select to authenticated
  using ((select auth.uid()) = user_id);
-- Writes go through the atomic RPC only. No client insert/update/delete grants.
revoke all on public.review_events from anon, authenticated;
grant select on public.review_events to authenticated;
create index if not exists review_events_user_time_item_idx on public.review_events(user_id, reviewed_at, learning_item_id);
create index if not exists words_user_created_idx on public.words(user_id, created_at);

-- Keep actual addition dates after deletion. Backfill only known original timestamps.
create table if not exists public.learning_add_events (
  learning_item_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null
);
comment on table public.learning_add_events is 'noted-learning-activity-v1';
alter table public.learning_add_events enable row level security;
drop policy if exists "Read own additions" on public.learning_add_events;
create policy "Read own additions" on public.learning_add_events for select to authenticated using ((select auth.uid()) = user_id);
revoke all on public.learning_add_events from anon, authenticated;
grant select on public.learning_add_events to authenticated;
create index if not exists learning_add_events_user_time_idx on public.learning_add_events(user_id, created_at);
insert into public.learning_add_events(learning_item_id, user_id, created_at)
  select id, user_id, created_at from public.words on conflict do nothing;
create or replace function public.capture_learning_addition() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.learning_add_events(learning_item_id, user_id, created_at)
    values (new.id, new.user_id, new.created_at) on conflict do nothing;
  return new;
end $$;
comment on function public.capture_learning_addition() is 'noted-learning-activity-v1';
revoke all on function public.capture_learning_addition() from public, anon, authenticated;
drop trigger if exists noted_capture_addition on public.words;
create trigger noted_capture_addition after insert on public.words for each row execute function public.capture_learning_addition();

-- Invalid optional legacy state stays neutral, as in reviewState() in the frontend.
create or replace function public.noted_review_count(p_state jsonb) returns integer
language plpgsql immutable security invoker set search_path = '' as $$
begin
  if p_state is null or p_state->'version' is distinct from '1'::jsonb
    or p_state->>'last_rating' is null or p_state->>'last_rating' not in ('sure','unsure')
    or jsonb_typeof(p_state->'last_reviewed_at') is distinct from 'string'
    or jsonb_typeof(p_state->'review_count') is distinct from 'number' then return 0; end if;
  perform (p_state->>'last_reviewed_at')::timestamptz;
  return floor(least(1000000::numeric,greatest(0::numeric,(p_state->>'review_count')::numeric)))::integer;
exception when invalid_text_representation or datetime_field_overflow or invalid_datetime_format or numeric_value_out_of_range then return 0;
end $$;
comment on function public.noted_review_count(jsonb) is 'noted-learning-activity-v1';
revoke all on function public.noted_review_count(jsonb) from public, anon, authenticated;

-- Older app versions still using PATCH also record real reviews from now on.
-- Existing state is never backfilled as fictional historical review events.
create or replace function public.capture_legacy_learning_review() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if public.noted_review_count(new.review_state) <= public.noted_review_count(old.review_state)
    or new.review_state->>'last_rating' is null or new.review_state->>'last_rating' not in ('sure', 'unsure') then return new; end if;
  if exists (select 1 from public.review_events where id::text = current_setting('noted.review_event', true)
    and user_id = new.user_id and learning_item_id = new.id) then return new; end if;
  insert into public.review_events(id, user_id, learning_item_id, familiarity_rating)
    values (gen_random_uuid(), new.user_id, new.id, case when new.review_state->>'last_rating' = 'sure' then 'sure' else 'not_sure' end);
  return new;
end $$;
comment on function public.capture_legacy_learning_review() is 'noted-learning-activity-v1';
revoke all on function public.capture_legacy_learning_review() from public, anon, authenticated;
drop trigger if exists noted_capture_legacy_review on public.words;
create trigger noted_capture_legacy_review after update of review_state on public.words for each row
  when (new.review_state is distinct from old.review_state) execute function public.capture_legacy_learning_review();

-- The item update and event commit together. Retrying the same event ID never grades twice.
-- SECURITY DEFINER is needed because direct event writes are intentionally forbidden.
create or replace function public.record_learning_review(
  p_event_id uuid, p_item_id uuid, p_rating text, p_expected_count integer,
  p_due_at timestamptz, p_interval_days integer, p_review_state jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  item public.words;
  event public.review_events;
begin
  if actor is null then raise exception 'Sign in to save a review.' using errcode = '42501'; end if;
  select * into item from public.words where id = p_item_id and user_id = actor for update;
  if not found then raise exception 'Learning item unavailable.' using errcode = '42501'; end if;
  select * into event from public.review_events where id = p_event_id;
  if found then
    if event.user_id <> actor or event.learning_item_id <> p_item_id then
      raise exception 'Review ID already used.' using errcode = '42501';
    end if;
    return to_jsonb(item);
  end if;
  if p_event_id is null or p_rating not in ('sure', 'not_sure') or p_rating is null
    or p_due_at is null or p_interval_days not between 0 and 365 or p_interval_days is null
    or p_expected_count is null or p_expected_count not between 0 and 1000000
    or p_review_state is null or p_review_state->'version' is distinct from '1'::jsonb
    or p_review_state->'review_count' is distinct from to_jsonb(p_expected_count + 1)
    or p_review_state->>'last_rating' is distinct from (case when p_rating = 'sure' then 'sure' else 'unsure' end)
    then raise exception 'Invalid review.'; end if;
  if public.noted_review_count(item.review_state) <> p_expected_count then
    raise exception 'This item changed on another device. Reload before reviewing it again.' using errcode = '40001';
  end if;
  insert into public.review_events(id, user_id, learning_item_id, familiarity_rating)
    values (p_event_id, actor, p_item_id, p_rating);
  perform pg_catalog.set_config('noted.review_event', p_event_id::text, true);
  update public.words set due_at = p_due_at, interval_days = p_interval_days, review_state = p_review_state
    where id = item.id and user_id = actor returning * into item;
  return to_jsonb(item);
end $$;
comment on function public.record_learning_review(uuid, uuid, text, integer, timestamptz, integer, jsonb) is 'noted-learning-activity-v1';
revoke all on function public.record_learning_review(uuid, uuid, text, integer, timestamptz, integer, jsonb) from public, anon;
grant execute on function public.record_learning_review(uuid, uuid, text, integer, timestamptz, integer, jsonb) to authenticated;

-- Month boundaries and daily grouping use the caller's IANA timezone, including DST.
create or replace function public.learning_calendar(p_month date, p_timezone text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  actor uuid := auth.uid();
  month_start timestamptz;
  month_end timestamptz;
  result jsonb;
begin
  if actor is null then raise exception 'Sign in to see activity.' using errcode = '42501'; end if;
  if p_month is null or p_month <> date_trunc('month', p_month)::date
    or p_month < date '1970-01-01' or p_month > date '2100-12-01'
    then raise exception 'Invalid month.'; end if;
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = p_timezone) then raise exception 'Invalid timezone.'; end if;
  month_start := p_month::timestamp at time zone p_timezone;
  month_end := (p_month + interval '1 month')::timestamp at time zone p_timezone;
  select jsonb_build_object(
    'tracking_since', (select started_at from public.learning_activity_start where singleton),
    'days', coalesce((
      select jsonb_agg(jsonb_build_object('date', activity_day::text, 'reviewed', reviewed, 'added', added) order by activity_day)
      from (
        select activity_day, sum(reviewed)::integer reviewed, sum(added)::integer added from (
          select (reviewed_at at time zone p_timezone)::date activity_day,
            count(distinct learning_item_id)::integer reviewed, 0 added
          from public.review_events where user_id = actor and reviewed_at >= month_start and reviewed_at < month_end group by 1
          union all
          select (created_at at time zone p_timezone)::date activity_day, 0 reviewed, count(*)::integer added
          from public.learning_add_events where user_id = actor and created_at >= month_start and created_at < month_end group by 1
        ) activity group by activity_day
      ) totals
    ), '[]'::jsonb)
  ) into result;
  return result;
end $$;
comment on function public.learning_calendar(date, text) is 'noted-learning-activity-v1';
revoke all on function public.learning_calendar(date, text) from public, anon;
grant execute on function public.learning_calendar(date, text) to authenticated;

-- Real-time Library updates; focus/visibility refresh remains a fallback.
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'words') then
    alter publication supabase_realtime add table public.words;
  end if;
end $$;
notify pgrst, 'reload schema';
commit;
