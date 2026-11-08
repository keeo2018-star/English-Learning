import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const A='11111111-1111-4111-8111-111111111111',B='33333333-3333-4333-8333-333333333333',C='55555555-5555-4555-8555-555555555555',D='77777777-7777-4777-8777-777777777777';
test('continuous Discover upgrade: preservation, atomic batches, exclusions and isolation',async t=>{
 const db=new PGlite();
 const read=name=>fs.readFile(new URL('../../'+name,import.meta.url),'utf8');
 const asUser=async id=>{await db.exec(`reset role; select set_config('request.jwt.claim.sub','${id||''}',false); set role ${id?'authenticated':'anon'};`)};
 const call=async(action,payload={},zone='Europe/London')=>(await db.query('select discover_action($1,$2,$3) result',[action,JSON.stringify(payload),zone])).rows[0].result;
 const upgrade=await read('supabase/migrations/20261108_continuous_discover.sql');
 let original,legacy,legacyRows;
 const finish=async state=>{for(const item of state.daily.items)if(!state.daily.responses[String(item.id)])state=await call('daily_response',{set_id:state.daily.id,item_id:item.id,response:'know'});return state;};
 try{
  await db.exec(`create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$; grant usage on schema auth to authenticated,anon; grant execute on function auth.uid() to authenticated,anon;`);
  await db.exec(await read('supabase/schema.sql'));
  await db.exec(`grant all on words to authenticated,anon; insert into auth.users values('${A}'),('${B}'),('${C}'),('${D}'); insert into words(user_id,word,meaning,review_state,interval_days) values('${A}','my own expression','自定义解释','{"review_count":7}',14);`);
  await db.exec(await read('supabase/migrations/20261104_learning_activity.sql'));
  await db.exec(await read('supabase/migrations/20261107_discover.sql'));
  await asUser(A);legacy=(await call('skip')).daily;
  await call('daily_response',{set_id:legacy.id,item_id:legacy.items[0].id,response:'save'});
  await call('daily_response',{set_id:legacy.id,item_id:legacy.items[1].id,response:'know'});
  await db.exec('reset role');original=(await db.query('select * from words order by id')).rows;legacyRows=(await db.query('select * from discover_daily_sets order by id')).rows;
  await t.test('additive migration reruns preserve words, schedules, accounts and every old batch',async()=>{
   await db.exec(upgrade);await db.exec(upgrade);
   assert.deepEqual((await db.query('select * from words order by id')).rows,original);
   assert.deepEqual((await db.query('select * from discover_daily_sets order by id')).rows,legacyRows);
   assert.equal((await db.query('select count(*)::int n from auth.users')).rows[0].n,4);
   assert.equal((await db.query('select count(*)::int n from discover_batches')).rows[0].n,1);
   await asUser(A);const s=await call('get');assert.equal(s.discover_version,2);assert.equal(s.daily.id,legacy.id);assert.equal(Object.keys(s.daily.responses).length,2);
  });
  await t.test('unfinished batches survive dates, zones and refresh; early advance is rejected',async()=>{
   for(const zone of ['Pacific/Kiritimati','Etc/GMT+12','Europe/London'])assert.equal((await call('daily',{},zone)).daily.id,legacy.id);
   await assert.rejects(call('next_batch',{set_id:legacy.id}),/Finish this batch/);
   await db.exec('reset role');await db.exec(upgrade);await asUser(A);assert.equal((await call('get')).daily.id,legacy.id);
  });
  await t.test('legacy writes finishing during rollout are mirrored without replacing newer responses',async()=>{
   await call('daily_response',{set_id:legacy.id,item_id:legacy.items[2].id,response:'know'});
   await db.exec('reset role');await db.query("update discover_daily_sets set responses=jsonb_set(responses,array[$2],$3::jsonb) where id=$1",[legacy.id,String(legacy.items[3].id),JSON.stringify({action:'know',responded_at:new Date().toISOString()})]);
   await asUser(A);const s=await call('get');assert.ok(s.daily.responses[legacy.items[2].id]);assert.ok(s.daily.responses[legacy.items[3].id]);
  });
  await t.test('failed saves retain the current word and response; retry saves once with neutral scheduling',async()=>{
   const target=legacy.items[4],payload={set_id:legacy.id,item_id:target.id,response:'save'};
   await db.exec('reset role');await db.exec("alter table words add constraint test_reject_save check (word<>"+"'"+target.word.replaceAll("'","''")+"')");await asUser(A);
   await assert.rejects(call('daily_response',payload),/test_reject_save/);assert.equal((await call('get')).daily.responses[target.id],undefined);
   await db.exec('reset role');await db.exec('alter table words drop constraint test_reject_save');await asUser(A);
   const s=await call('daily_response',payload);await call('daily_response',payload);
   const saved=(await db.query('select * from words where id=$1',[s.daily.responses[target.id].library_id])).rows[0];assert.equal(saved.interval_days,0);assert.equal(saved.review_state,null);assert.equal(saved.item_type,'word');assert.equal(saved.example,target.example);assert.ok(saved.meaning.includes(target.meaning));assert.equal((await db.query('select count(*)::int n from review_events')).rows[0].n,0);
  });
  await t.test('completed predecessors make new batches idempotent across retries and devices',async()=>{
   const done=await finish(await call('get'));assert.equal(Object.keys(done.daily.responses).length,10);
   const next=await call('next_batch',{set_id:done.daily.id});assert.notEqual(next.daily.id,done.daily.id);assert.equal(next.daily.items.length,10);assert.equal(Object.keys(next.daily.responses).length,0);
   assert.ok(next.daily.item_ids.every(id=>!done.daily.item_ids.includes(id)));assert.equal(next.daily.local_date,done.daily.local_date);
   assert.equal((await call('next_batch',{set_id:done.daily.id})).daily.id,next.daily.id);
   const third=await call('next_batch',{set_id:(await finish(next)).daily.id});assert.notEqual(third.daily.id,next.daily.id);
   assert.equal((await call('next_batch',{set_id:done.daily.id})).daily.id,third.daily.id);assert.equal((await call('get')).daily.id,third.daily.id);
  });
  await t.test('case/whitespace variants, Library, old known signals and all historical batches are excluded',async()=>{
   await db.exec('reset role');
   const pool=(await db.query('select * from discover_unseen_vocabulary($1) limit 4',[B])).rows;
   await db.query("insert into words(user_id,word,meaning) values($1,E'\\t '||upper($2)||E' \\t','个人解释')",[B,pool[0].word]);
   await db.query("insert into discover_known(user_id,vocabulary_id,last_known_at) values($1,$2,now()-interval '400 days')",[B,pool[1].id]);
   await db.query("insert into discover_vocabulary select 900000001,upper(word),meaning,pos,item_type,example,definition,level,frequency,synset,alternate_meanings,related_synsets,dataset_version from discover_vocabulary where id=$1",[pool[2].id]);
   const available=(await db.query('select * from discover_unseen_vocabulary($1)',[B])).rows;const normalized=available.map(x=>x.word.trim().toLowerCase());assert.equal(new Set(normalized).size,normalized.length);assert.ok(!normalized.includes(pool[0].word));assert.ok(!normalized.includes(pool[1].word));
   await db.query("insert into discover_vocabulary select 900000002,'Take It Easy','放轻松','expression','expression','Take it easy after a long day.',definition,3,99999,synset,alternate_meanings,related_synsets,dataset_version from discover_vocabulary where id=$1",[pool[3].id]);
   await asUser(B);const s=await call('skip');assert.ok(s.daily.items.every(x=>x.id!==pool[0].id&&x.id!==pool[1].id));
   const expression=s.daily.items.find(x=>x.id===900000002);assert.ok(expression);
   const expressionSaved=await call('daily_response',{set_id:s.daily.id,item_id:expression.id,response:'save'});
   const expressionRow=(await db.query('select * from words where id=$1',[expressionSaved.daily.responses[expression.id].library_id])).rows[0];assert.equal(expressionRow.item_type,'expression');assert.equal(expressionRow.example,expression.example);assert.equal(expressionRow.meaning,expression.meaning);
   const race=s.daily.items.find(x=>x.id!==expression.id);
   const prior=(await db.query("insert into words(user_id,word,meaning,interval_days,review_state) values($1,$2,'个人原释义',14,'{\"review_count\":11}') returning *",[B,'\t '+race.word.toUpperCase()+' \t'])).rows[0];
   const reused=await call('daily_response',{set_id:s.daily.id,item_id:race.id,response:'save'});assert.equal(reused.daily.responses[race.id].library_id,prior.id);assert.equal(reused.daily.responses[race.id].added,false);assert.deepEqual((await db.query('select * from words where id=$1',[prior.id])).rows[0],prior);
   await assert.rejects(call('daily_response',{set_id:legacy.id,item_id:legacy.items[0].id,response:'know'}),/unavailable/);
  });
  await t.test('multiple batches use the full unseen pool, retain history, then clearly exhaust without repeats',async()=>{
   await db.exec('reset role');const keep=(await db.query('select id from discover_vocabulary where id<>900000001 order by id limit 23')).rows.map(x=>x.id);
   await asUser(C);await db.query("insert into words(user_id,word,meaning) select $1,word,meaning from discover_vocabulary where not(id=any($2::integer[])) and id<>900000001",[C,keep]);
   let state=await call('skip');const seen=new Set();const batchIds=[];
   for(const count of [10,10,3]){
    assert.equal(state.daily.items.length,count);batchIds.push(state.daily.id);
    for(const item of state.daily.items){assert.ok(!seen.has(item.id));seen.add(item.id)}
    state=await finish(state);if(count!==3)state=await call('next_batch',{set_id:state.daily.id});
   }
   assert.equal(seen.size,23);assert.equal(new Set(batchIds).size,3);assert.equal(state.daily.remaining_count,0);
   const exhausted=await call('next_batch',{set_id:state.daily.id});assert.equal(exhausted.daily.id,state.daily.id);assert.equal((await call('get')).daily.remaining_count,0);
   assert.equal(state.profile.recommendation_level,3.25);
  });
  await t.test('fresh responses in an old resumed batch still inform gradual recommendations',async()=>{
   const E='88888888-8888-4888-8888-888888888888';await db.exec('reset role');await db.query('insert into auth.users values($1)',[E]);await asUser(E);await call('get');await db.exec('reset role');await db.query("update discover_profiles set assessment_status='skipped' where user_id=$1",[E]);
   const ids=(await db.query('select id from discover_vocabulary where id<900000001 order by id limit 20')).rows.map(x=>x.id);
   let current;
   for(let i=0;i<2;i++){
    const selected=ids.slice(i*10,i*10+10),responses=Object.fromEntries(selected.map(id=>[id,{action:'know',responded_at:new Date(Date.now()-3600000).toISOString()}]));
    const row=(await db.query("insert into discover_batches(user_id,local_date,timezone,item_ids,responses,difficulty,created_at) values($1,current_date-30-$2::integer,'Europe/London',$3,$4,3,now()-interval '30 days'-$2::integer*interval '1 day') returning id",[E,i,selected,JSON.stringify(responses)])).rows[0];if(i===0)current=row.id;
   }
   await asUser(E);const resumed=await call('get');assert.equal(resumed.daily.id,current);const next=await call('next_batch',{set_id:current});assert.equal(next.profile.recommendation_level,3.25);assert.notEqual(next.daily.id,current);
  });
  await t.test('an initially empty pool is explicit; RLS, private helpers and writes stay owner-only',async()=>{
   await asUser(D);await db.query("insert into words(user_id,word,meaning) select $1,word,meaning from discover_vocabulary where id<>900000001",[D]);
   const s=await call('skip');assert.equal(s.daily.items.length,0);assert.equal(s.daily.remaining_count,0);
   assert.equal((await db.query('select count(*)::int n from discover_batches')).rows[0].n,1);
   await assert.rejects(db.query('select * from discover_unseen_vocabulary($1)',[A]),/permission denied/);
   await assert.rejects(db.query('update discover_profiles set active_discover_batch=$1',[legacy.id]),/permission denied/);
   await assert.rejects(call('next_batch',{set_id:legacy.id}),/unavailable/);
   const removed=(await db.query('delete from words where id=(select id from words where user_id=$1 order by word limit 1) returning word',[D])).rows[0];const nowEligible=await call('get');assert.equal(nowEligible.daily.id,s.daily.id);assert.equal(nowEligible.daily.remaining_count,1);const resumed=await call('next_batch',{set_id:s.daily.id});assert.equal(resumed.daily.items.length,1);assert.equal(resumed.daily.items[0].word.trim().toLowerCase(),removed.word.trim().toLowerCase());
   await asUser(null);await assert.rejects(call('get'),/permission denied/);await assert.rejects(db.query('select * from discover_batches'),/permission denied/);
  });
  await t.test('the read-only preflight reports the upgraded schema, and unknown collisions abort safely',async()=>{
   await db.exec('reset role');const preflight=await db.exec(await read('supabase/continuous_discover_preflight.sql'));assert.ok(preflight.some(result=>result.rows.some(row=>'noted_continuous_discover_preflight' in row)));
   const before=(await db.query('select * from words order by id')).rows;
   await db.exec('create function public.discover_create_batch(integer) returns integer language sql as $$select 1$$');
   await assert.rejects(db.exec(upgrade),/Unrecognised existing function/);await db.exec('rollback');assert.deepEqual((await db.query('select * from words order by id')).rows,before);
  });
 }finally{await db.close()}
});
