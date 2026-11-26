-- Only future Discover payloads and inserts change. Existing vocabulary and history are untouched.
-- Original bilingual examples reviewed against the exact displayed gloss, POS, and source sense.
-- A changed catalog identity has no reviewed example until it is checked again.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';

do $$begin
 if obj_description('public.discover_action(text,jsonb,text)'::regprocedure,'pg_proc') is distinct from 'noted-collections-learning-v1'
 or obj_description('public.discover_daily_payload(uuid)'::regprocedure,'pg_proc') is distinct from 'noted-discover-batches-v1'
 or obj_description('public.discover_question(uuid,uuid,integer,jsonb)'::regprocedure,'pg_proc') is distinct from 'noted-discover-v1'
 or not exists (select from pg_attribute where attrelid='public.words'::regclass and attname='learning_details'
 and not attisdropped and col_description(attrelid,attnum)='noted-learning-details-v1')
 then raise exception 'Unexpected Discover schema or function version.'; end if;
end $$;

create function public.discover_reviewed_example(p_item public.discover_vocabulary) returns jsonb
language sql immutable security invoker set search_path = '' as $$
 select jsonb_build_object('source', reviewed.source, 'translation', reviewed.translation)
 from (values
  ('segment', '段落', 'n', '04164989-n', 'Read the segment where the writer explains her decision.', '请读作者解释自己决定的那一段文字。'),
  ('bank', '河边', 'n', '09213565-n', 'We sat on the bank of the river to watch the sunset.', '我们坐在河边看日落。'),
  ('obtain', '获得', 'v', '02238085-v', 'You must obtain permission before entering the laboratory.', '进入实验室之前，你必须获得许可。'),
  ('able', '能', 'a', '00001740-a', 'She was able to finish the report before lunch.', '她能在午饭前完成报告。'),
  ('merely', '仅仅', 'r', '00004722-r', 'I was merely trying to help.', '我仅仅是想帮忙。'),
  ('assume', '假设', 'v', '00632236-v', 'We cannot assume that the information is correct.', '我们不能假设这条信息是正确的。'),
  ('reduce', '减少', 'v', '00429060-v', 'Taking the bus can reduce the cost of commuting.', '坐公交车可以减少通勤成本。'),
  ('place', '安置', 'v', '01494310-v', 'Please place the patient in a quiet room.', '请把病人安置在一间安静的房间里。'),
  ('means', '方式', 'n', '00172710-n', 'Email is a convenient means of communication.', '电子邮件是一种方便的沟通方式。'),
  ('attend', '出席', 'v', '02612762-v', 'Will you attend the meeting on Friday?', '你会出席周五的会议吗？'),
  ('foot', '脚', 'n', '05563266-n', 'She hurt her left foot while running.', '她跑步时伤到了左脚。'),
  ('check', '支票', 'n', '13381734-n', 'He wrote a check to pay the rent.', '他开了一张支票来付房租。'),
  ('book', '书', 'n', '06410904-n', 'I borrowed a book about birds from the library.', '我从图书馆借了一本讲鸟类的书。'),
  ('match', '匹配', 'v', '02657219-v', 'The new curtains match the colour of the walls.', '新窗帘与墙壁的颜色相匹配。'),
  ('right', '右边', 'n', '08625073-n', 'The entrance is on the right of the building.', '入口在建筑物的右边。')
 ) as reviewed(word, meaning, pos, synset, source, translation)
 where (reviewed.word, reviewed.meaning, reviewed.pos, reviewed.synset) =
       (p_item.word, p_item.meaning, p_item.pos, p_item.synset);
$$;
revoke all on function public.discover_reviewed_example(public.discover_vocabulary) from public, anon, authenticated;

-- Rewrite only the known display/save expressions. Preserve the installed owner restrictions,
-- review scheduling, choice generation, batch IDs, and idempotency.
do $migration$
declare source text;
begin
 source := pg_get_functiondef('public.discover_daily_payload(uuid)'::regprocedure);
 if strpos(source, $old$'example',v.example,'definition'$old$)=0 then raise exception 'Unexpected daily payload';end if;
 execute replace(source, $old$'example',v.example,'definition'$old$,
  $new$'example',coalesce(public.discover_reviewed_example(v)->>'source',''),'example_translation',public.discover_reviewed_example(v)->>'translation','definition'$new$);

 source := pg_get_functiondef('public.discover_question(uuid,uuid,integer,jsonb)'::regprocedure);
 if strpos(source, $old$'example',target.example,'level'$old$)=0 then raise exception 'Unexpected assessment payload';end if;
 execute replace(source, $old$'example',target.example,'level'$old$,
  $new$'example',coalesce(public.discover_reviewed_example(target)->>'source',''),'example_translation',public.discover_reviewed_example(target)->>'translation','level'$new$);

 source := pg_get_functiondef('public.discover_action(text,jsonb,text)'::regprocedure);
 if strpos(source, ',v.example,v.item_type,now(),0,null)')=0
 or strpos(source, 'example,item_type,due_at,interval_days,review_state) values(uid,v.word')=0 then raise exception 'Unexpected save body';end if;
 source := replace(source,'example,item_type,due_at,interval_days,review_state) values(uid,v.word',
  'example,item_type,due_at,interval_days,review_state,learning_details) values(uid,v.word');
 execute replace(source, ',v.example,v.item_type,now(),0,null)', $new$,coalesce(public.discover_reviewed_example(v)->>'source',''),v.item_type,now(),0,null,
  jsonb_strip_nulls(jsonb_build_object('source','dictionary','explanationLanguage','zh-CN',
  'partOfSpeech',case v.pos when 'n' then 'Noun' when 'v' then 'Verb' when 'a' then 'Adjective' when 'r' then 'Adverb' end,
  'exampleTranslation',public.discover_reviewed_example(v)->>'translation')))$new$);
 if has_function_privilege('anon','public.discover_action(text,jsonb,text)','EXECUTE')
 or not has_function_privilege('authenticated','public.discover_action(text,jsonb,text)','EXECUTE')
 or has_function_privilege('authenticated','public.discover_reviewed_example(public.discover_vocabulary)','EXECUTE')
 then raise exception 'Discover privileges changed';end if;
end
$migration$;

notify pgrst, 'reload schema';
commit;
