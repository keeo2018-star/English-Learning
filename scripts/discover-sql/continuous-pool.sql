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
