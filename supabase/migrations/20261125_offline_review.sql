-- Additive only. Run offline_review_preflight.sql and review its results first.
begin;
set local lock_timeout='3s';
set local statement_timeout='30s';
do $$declare r record;begin
 if obj_description(to_regprocedure('public.record_learning_review(uuid,uuid,text,integer,timestamptz,integer,jsonb)'),'pg_proc') is distinct from 'noted-learning-activity-v1' then raise exception 'Existing review RPC must be checked first.';end if;
 for r in select * from (values ('words','id','uuid'),('words','user_id','uuid'),('words','review_state','jsonb'),('words','due_at','timestamp with time zone'),('words','interval_days','integer'),('review_events','id','uuid'),('review_events','user_id','uuid'),('review_events','learning_item_id','uuid'),('review_events','reviewed_at','timestamp with time zone'),('review_events','familiarity_rating','text')) as c(tab,col,typ) loop
  if not exists(select 1 from information_schema.columns where table_schema='public' and table_name=r.tab and column_name=r.col and data_type=r.typ) then raise exception 'Unexpected column %.%.',r.tab,r.col;end if;
 end loop;
 if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='record_offline_learning_review' and (obj_description(p.oid,'pg_proc') is distinct from 'noted-offline-review-v1' or pg_get_function_identity_arguments(p.oid) is distinct from 'p_event_id uuid, p_item_id uuid, p_rating text, p_expected_count integer, p_due_at timestamp with time zone, p_interval_days integer, p_review_state jsonb, p_reviewed_at timestamp with time zone')) then raise exception 'Unknown offline RPC. Review before replacing it.';end if;
 if exists(select 1 from pg_class where oid in (to_regclass('public.words'),to_regclass('public.review_events')) and not relrowsecurity) then raise exception 'Existing owner RLS must be enabled.';end if;
end $$;
create or replace function public.record_offline_learning_review(p_event_id uuid,p_item_id uuid,p_rating text,p_expected_count integer,p_due_at timestamptz,p_interval_days integer,p_review_state jsonb,p_reviewed_at timestamptz)
returns jsonb language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); original public.words; saved jsonb; prior public.review_events; state jsonb;
begin
 if actor is null then raise exception 'Sign in to sync reviews.' using errcode='42501';end if;
 select * into original from public.words where id=p_item_id and user_id=actor for update;
 if not found then raise exception 'Learning item unavailable.' using errcode='42501';end if;
 select * into prior from public.review_events where id=p_event_id;
 if found then
  if prior.user_id<>actor or prior.learning_item_id<>p_item_id then raise exception 'Review ID already used.' using errcode='42501';end if;
  return to_jsonb(original);
 end if;
 if p_reviewed_at is null or not isfinite(p_reviewed_at) or p_reviewed_at>now()+interval '5 minutes' or p_reviewed_at<'2000-01-01'::timestamptz or (p_review_state->>'last_reviewed_at')::timestamptz is distinct from p_reviewed_at then raise exception 'Invalid review time.';end if;
 saved:=public.record_learning_review(p_event_id,p_item_id,p_rating,p_expected_count,p_due_at,p_interval_days,p_review_state);
 update public.review_events set reviewed_at=p_reviewed_at where id=p_event_id and user_id=actor;
 -- An older offline response counts, but must never roll back newer scheduling.
 if original.review_state->>'last_reviewed_at' is not null and (original.review_state->>'last_reviewed_at')::timestamptz>p_reviewed_at then
  state:=original.review_state||jsonb_build_object('review_count',p_review_state->'review_count','sure_count',p_review_state->'sure_count','unsure_count',p_review_state->'unsure_count');
  update public.words set due_at=original.due_at,interval_days=original.interval_days,review_state=state where id=p_item_id and user_id=actor returning to_jsonb(words.*) into saved;
 end if;
 return saved;
end $$;
comment on function public.record_offline_learning_review(uuid,uuid,text,integer,timestamptz,integer,jsonb,timestamptz) is 'noted-offline-review-v1';
revoke all on function public.record_offline_learning_review(uuid,uuid,text,integer,timestamptz,integer,jsonb,timestamptz) from public,anon;
grant execute on function public.record_offline_learning_review(uuid,uuid,text,integer,timestamptz,integer,jsonb,timestamptz) to authenticated;
notify pgrst,'reload schema';
commit;
