import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
const A='11111111-1111-4111-8111-111111111111', B='33333333-3333-4333-8333-333333333333';
test('Discover database: atomic progress, adaptive checks, stable days, security and preservation', async t=>{
 const db=new PGlite();
 try {
  await db.exec(`create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema auth to authenticated,anon; grant execute on function auth.uid() to authenticated,anon;`);
  await db.exec(await fs.readFile(new URL('../../supabase/schema.sql',import.meta.url),'utf8'));
  await db.exec(`grant all on words to authenticated,anon; insert into auth.users values('${A}'),('${B}'); insert into words(user_id,word,meaning,review_state) values('${A}','legacy duplicate','旧数据','{"review_count":7}'),('${A}','legacy duplicate','另一释义',null);`);
  await db.exec(await fs.readFile(new URL('../../supabase/migrations/20261104_learning_activity.sql',import.meta.url),'utf8'));
  const original=(await db.query('select * from words order by id')).rows;
  const policies=(await db.query("select policyname,cmd,qual,with_check from pg_policies where tablename='words' order by policyname")).rows;
  const sql=await fs.readFile(new URL('../../supabase/migrations/20261107_discover.sql',import.meta.url),'utf8');
  await db.exec(sql); await db.exec(sql);
  const asUser=async id=>{await db.exec(`reset role; select set_config('request.jwt.claim.sub','${id||''}',false); set role ${id?'authenticated':'anon'};`);};
  const call=async(action,payload={},zone='Europe/London')=>(await db.query('select discover_action($1,$2,$3) as result',[action,JSON.stringify(payload),zone])).rows[0].result;
  let snapshot, daily;
  await t.test('migration reruns preserve existing vocabulary, progress, policies and duplicate legacy rows',async()=>{
   assert.deepEqual((await db.query('select * from words order by id')).rows,original);
   assert.deepEqual((await db.query("select policyname,cmd,qual,with_check from pg_policies where tablename='words' order by policyname")).rows,policies);
   assert.equal((await db.query('select count(*)::int n from auth.users')).rows[0].n,2);
   assert.ok((await db.query('select count(*)::int n from discover_vocabulary')).rows[0].n>=700);
  });
  await asUser(A);
  await t.test('first visit, skip persistence and stable 10-item sets',async()=>{
   snapshot=await call('get'); assert.equal(snapshot.profile.assessment_status,'pending');
   snapshot=await call('skip'); daily=snapshot.daily; assert.equal(daily.items.length,10);assert.equal(new Set(daily.item_ids).size,10);
   assert.equal(snapshot.profile.assessment_status,'skipped'); const again=await call('daily'); assert.deepEqual(again.daily,daily);
   const levels=daily.items.map(x=>x.level);assert.equal(levels.filter(x=>x===3).length,8);assert.equal(levels.filter(x=>x===4).length,2);
   await assert.rejects(call('daily',{},'not/a/timezone'),/Invalid timezone/);
  });
  await t.test('recognition is not a Library insert or review; retries count once',async()=>{
   const payload={set_id:daily.id,item_id:daily.items[0].id,response:'know'};
   snapshot=await call('daily_response',payload); const once=snapshot.daily.responses; snapshot=await call('daily_response',payload);
   assert.deepEqual(snapshot.daily.responses,once);assert.equal((await db.query('select known_count from discover_known')).rows[0].known_count,1);
   assert.equal((await db.query('select count(*)::int n from words')).rows[0].n,2);
   assert.equal((await db.query('select count(*)::int n from review_events')).rows[0].n,0);
   assert.equal(snapshot.profile.recommendation_level,3);
  });
  await t.test('Save atomically initializes the existing schedule and is idempotent',async()=>{
   const target=daily.items[1], payload={set_id:daily.id,item_id:target.id,response:'save'};
   snapshot=await call('daily_response',payload); await call('daily_response',payload);
   const rows=(await db.query('select * from words where word=$1',[target.word])).rows;assert.equal(rows.length,1);
   assert.equal(rows[0].interval_days,0);assert.equal(rows[0].review_state,null);assert.equal(rows[0].item_type,'word');assert.equal(rows[0].example,target.example);assert.ok(rows[0].meaning.includes(target.meaning));
   assert.equal((await db.query('select count(*)::int n from review_events')).rows[0].n,0);
  });
  await t.test('a concurrent prior Add is reused; custom meanings/progress are never overwritten',async()=>{
   const target=daily.items[2];await db.query(`insert into words(user_id,word,meaning,review_state) values($1,$2,'个人释义','{"review_count":9}')`,[A,target.word.toUpperCase()]);
   snapshot=await call('daily_response',{set_id:daily.id,item_id:target.id,response:'save'});
   const saved=(await db.query('select * from words where lower(word)=$1',[target.word])).rows;assert.equal(saved.length,1);assert.equal(saved[0].meaning,'个人释义');assert.equal(saved[0].review_state.review_count,9);
   assert.equal(snapshot.daily.responses[target.id].added,false);
   await assert.rejects(db.query('insert into words(user_id,word,meaning) values($1,$2,$3)',[A,target.word,'重复']),/already in your Library/);
   const fullwidth=[...target.word].map(c=>String.fromCharCode(c.charCodeAt(0)+0xfee0)).join('');
   await assert.rejects(db.query('insert into words(user_id,word,meaning) values($1,$2,$3)',[A,fullwidth,'重复']),/already in your Library/);
  });
  await t.test('adaptive assessment, unknown answers, unique questions, completion and retry-safe retakes',async()=>{
   const nonce=crypto.randomUUID(); snapshot=await call('assessment_start',{retake:true,request_id:nonce}); const session=snapshot.assessment.id;
   assert.equal((await call('assessment_start',{retake:true,request_id:nonce})).assessment.id,session);
   const seen=new Set();
   for(let i=0;i<16;i++){
    const a=snapshot.assessment,q=a.question;assert.ok(!seen.has(q.id)); seen.add(q.id);assert.equal(q.choices.length,4);assert.equal(new Set(q.choices.map(x=>x.meaning)).size,4);
    const payload={session_id:session,position:i,item_id:q.id,answer_id:i<2?q.id:0};
    snapshot=await call('assessment_answer',payload);
    assert.equal(snapshot.assessment.responses.length,i+1);
    const replay=await call('assessment_answer',payload);assert.equal(replay.assessment.responses.length,i+1);
    if(i===0) assert.equal((await db.query('select current_level from discover_assessments where id=$1',[session])).rows[0].current_level,3);
    if(i===1) assert.equal((await db.query('select current_level from discover_assessments where id=$1',[session])).rows[0].current_level,4);
   }
   assert.equal(snapshot.assessment.status,'completed'); assert.ok(snapshot.assessment.estimated_level>=1&&snapshot.assessment.estimated_level<=6);
   snapshot=await call('assessment_accept',{session_id:session}); assert.equal(snapshot.assessment,null);assert.equal(snapshot.daily.id,daily.id);
   const next=await call('assessment_start',{retake:true,request_id:crypto.randomUUID()});assert.ok(!seen.has(next.assessment.question.id));assert.equal((await db.query('select count(*)::int n from discover_assessments')).rows[0].n,2);
   await call('skip');
  });
  await t.test('new local dates produce one stable set and exclude Library/recent recommendations',async()=>{
   await db.exec('reset role');const date=(await db.query("select ((now() at time zone 'Europe/London')::date)::text as d")).rows[0].d;
   await db.query('update discover_daily_sets set local_date=local_date-1 where id=$1',[daily.id]);
   await asUser(A);const today=await call('daily');assert.notEqual(today.daily.id,daily.id);assert.equal(today.daily.local_date,String(date).slice(0,10));
   assert.ok(today.daily.item_ids.every(id=>!daily.item_ids.includes(id)));assert.equal((await call('daily')).daily.id,today.daily.id);
   const farWest=await call('daily',{},'Etc/GMT+12'),farEast=await call('daily',{},'Pacific/Kiritimati');assert.notEqual(farWest.daily.local_date,farEast.daily.local_date);
   assert.equal((await call('daily',{},'Pacific/Kiritimati')).daily.id,farEast.daily.id);
  });
  await t.test('personalisation requires repeated evidence and changes by no more than a quarter-band',async()=>{
   const C='55555555-5555-4555-8555-555555555555';
   await db.exec('reset role');await db.query('insert into auth.users values($1)',[C]);
   await asUser(C);await call('get');
   await db.exec('reset role');await db.query("update discover_profiles set assessment_status='skipped',recommendation_level=3 where user_id=$1",[C]);
   const items=(await db.query('select id from discover_vocabulary order by id limit 20')).rows.map(x=>x.id);
   for(let i=0;i<2;i++){
    const ids=items.slice(i*10,i*10+10); const responses=Object.fromEntries(ids.map(id=>[id,{action:'know',responded_at:new Date(Date.now()-3600000).toISOString()}]));
    await db.query("insert into discover_daily_sets(user_id,local_date,timezone,item_ids,responses,difficulty) values($1,(now() at time zone 'Europe/London')::date-$2::integer,'Europe/London',$3,$4,3)",[C,i+1,ids,JSON.stringify(responses)]);
   }
   await asUser(C);const tuned=await call('daily');assert.equal(tuned.profile.recommendation_level,3.25);assert.equal((await call('daily')).profile.recommendation_level,3.25);
   const nextZone=await call('daily',{},'Pacific/Kiritimati');assert.equal(nextZone.profile.recommendation_level,3.25);
   await db.exec('reset role');await db.query("delete from discover_daily_sets where user_id=$1 and local_date=(now() at time zone 'Europe/London')::date",[C]);
   await db.query("update discover_profiles set recommendation_level=4 where user_id=$1",[C]);
   const library=[];
   for(let i=0;i<5;i++)library.push((await db.query("insert into words(user_id,word,meaning) values($1,$2,'释义') returning id",[C,'test-rec-'+i])).rows[0].id);
   const linked=Object.fromEntries(items.slice(0,10).map((id,i)=>[id,{action:'save',library_id:library[i%5]}]));
   await db.query('update discover_daily_sets set responses=$2 where user_id=$1',[C,JSON.stringify(linked)]);
   for(let i=0;i<10;i++)await db.query("insert into review_events(id,user_id,learning_item_id,familiarity_rating) values(gen_random_uuid(),$1,$2,'not_sure')",[C,library[i%5]]);
   await asUser(C);const lowered=await call('daily');assert.equal(lowered.profile.recommendation_level,3.75);
  });
  await t.test('a limited eligible collection returns fewer items without fabricating or duplicating words',async()=>{
   const D='77777777-7777-4777-8777-777777777777';await db.exec('reset role');await db.query('insert into auth.users values($1)',[D]);
   await asUser(D);await db.query("insert into words(user_id,word,meaning,item_type) select $1,word,meaning,'word' from discover_vocabulary where id not in(select id from discover_vocabulary order by id limit 3)",[D]);
   const limited=await call('skip');assert.equal(limited.daily.items.length,3);assert.equal(new Set(limited.daily.item_ids).size,3);
  });
  await t.test('user isolation, read-only state tables, private helpers and anonymous denial',async()=>{
   await asUser(B);const own=await call('get');assert.equal(own.profile.assessment_status,'pending');
   assert.equal((await db.query('select count(*)::int n from discover_profiles')).rows[0].n,1);assert.equal((await db.query('select count(*)::int n from discover_daily_sets')).rows[0].n,0);
   await assert.rejects(call('daily_response',{set_id:daily.id,item_id:daily.items[3].id,response:'save'}),/unavailable/);
   await assert.rejects(db.query('update discover_profiles set recommendation_level=6'),/permission denied/);
   await assert.rejects(db.query('select discover_daily_payload($1)',[daily.id]),/permission denied/);
   await asUser(null);await assert.rejects(call('get'),/permission denied/);await assert.rejects(db.query('select * from discover_profiles'),/permission denied/);
  });
  await t.test('unknown existing objects abort the migration before changing data',async()=>{
   await db.exec('reset role');const before=(await db.query('select count(*)::int n from words')).rows[0].n;
   await db.exec('create function public.discover_snapshot(integer) returns integer language sql as $$select 1$$');
   await assert.rejects(db.exec(sql),/Unrecognised existing function/);await db.exec('rollback');
   assert.equal((await db.query('select count(*)::int n from words')).rows[0].n,before);
   const preserved=(await db.query('select * from words where id=any($1::uuid[]) order by id',[original.map(x=>x.id)])).rows;assert.deepEqual(preserved,original);
  });
 } finally {await db.close();}
});
